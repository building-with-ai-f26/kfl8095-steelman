// One open board in one tab: what the reader holds, the actions waiting to
// send, and the polling that keeps both moving (plans/architecture.md §3).
// Every decision about what's on screen is made by the shared rules
// (`openView`, `receive`, `pressUpdate`, `pillCount`, `enqueue`); this only
// runs them at the right moments and tells React when something changed.

import { enqueue, openView, pillCount, pressUpdate, receive } from "@steelman/shared";
import type { QueuedAction, ReaderView } from "@steelman/shared";
import { Unreachable, readBoard, readChanges, send } from "../api.ts";
import type { Answer } from "../api.ts";

/** Ask for changes this often while the board is in view (§3: "every ~3 s"). */
export const POLL_MS = 3_000;
/** …and this often while the tab is hidden, then not at all after this many (ten minutes). */
const HIDDEN_POLL_MS = 30_000;
const HIDDEN_POLLS = 20;
/** How long "Back online · N sent" stays up. */
const BACK_ONLINE_MS = 4_000;

export interface SessionState {
  phase: "loading" | "missing" | "ready";
  view: ReaderView | null;
  /** The board's question, as it was when the board opened. */
  question: string;
  /** Actions not yet accepted by the service. */
  waiting: number;
  offline: boolean;
  /** How many were sent on coming back, while that note is up; null otherwise. */
  backOnline: number | null;
  /** The reader's own choices, newest first: queued, or sent but not yet in the rows the reader holds. */
  mine: readonly QueuedAction[];
  /** What the board last said, for the live region. */
  status: string;
}

export class BoardSession {
  private state: SessionState = { phase: "loading", view: null, question: "", waiting: 0, offline: false, backOnline: null, mine: [], status: "" };
  private readonly listeners = new Set<() => void>();
  private queue: QueuedAction[] = [];
  /** Sent, and waiting for the next answer to "changes after S" to show them. */
  private sent: QueuedAction[] = [];
  private sending = false;
  private pollTimer: number | undefined;
  private backOnlineTimer: number | undefined;
  /** Polls since the tab was hidden. */
  private hiddenPolls = 0;
  private stopped = false;

  constructor(private readonly board: string) {}

  // ── For React (useSyncExternalStore) ──
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
  snapshot = () => this.state;

  private set(change: Partial<SessionState>): void {
    this.state = { ...this.state, ...change };
    for (const listener of this.listeners) listener();
  }

  private mineChanged(): void {
    this.set({ waiting: this.queue.length, mine: [...this.queue, ...this.sent].reverse() });
  }

  // ── Starting and stopping ──
  // Whether the service can be reached is learnt by asking it: a request that
  // fails means offline, one that answers means back. The browser's
  // "offline" event is a hint that comes sooner. Its navigator.onLine flag is
  // not used: it says false on a machine whose only network is the loopback
  // one, even though a service on localhost answers.
  async start(): Promise<void> {
    this.stopped = false;
    window.addEventListener("online", this.cameOnline);
    window.addEventListener("offline", this.wentOffline);
    window.addEventListener("beforeunload", this.beforeUnload);
    document.addEventListener("visibilitychange", this.visibilityChanged);
    try {
      const snapshot = await readBoard(this.board);
      if (this.stopped) return;
      if (!snapshot) return this.set({ phase: "missing" });
      this.set({ phase: "ready", view: openView(snapshot), question: snapshot.board.question });
    } catch (error) {
      if (!(error instanceof Unreachable)) throw error;
      // Opened while offline: try again on the next poll.
      this.set({ offline: true });
    }
    this.schedulePoll();
  }

  stop(): void {
    this.stopped = true;
    window.clearTimeout(this.pollTimer);
    window.clearTimeout(this.backOnlineTimer);
    window.removeEventListener("online", this.cameOnline);
    window.removeEventListener("offline", this.wentOffline);
    window.removeEventListener("beforeunload", this.beforeUnload);
    document.removeEventListener("visibilitychange", this.visibilityChanged);
  }

  // ── What the reader does ──
  /** Queues an action and, when online, sends it at once. */
  act(action: QueuedAction): void {
    this.queue = enqueue(this.queue, action);
    this.mineChanged();
    void this.flush();
  }

  /** Update: draws the board in the newest shared order. */
  update(status = "Board updated."): void {
    if (!this.state.view) return;
    this.set({ view: pressUpdate(this.state.view), status });
  }

  announce(status: string): void {
    this.set({ status });
  }

  pillCount(): number {
    return this.state.view ? pillCount(this.state.view) : 0;
  }

  // ── Sending ──
  private async flush(): Promise<void> {
    if (this.sending || this.state.offline) return;
    this.sending = true;
    let sentNow = 0;
    try {
      while (this.queue.length > 0) {
        const action = this.queue[0]!;
        let answer: Answer;
        try {
          answer = await send(this.board, action);
        } catch (error) {
          if (!(error instanceof Unreachable)) throw error;
          this.set({ offline: true });
          return;
        }
        this.queue = this.queue.slice(1);
        if (answer.status === "done" || answer.status === "already_done") this.sent.push(action);
        else this.announce(refusalNote(answer));
        sentNow++;
        this.mineChanged();
      }
    } finally {
      this.sending = false;
    }
    if (sentNow > 0) await this.poll();
  }

  // ── Polling ──
  private schedulePoll(): void {
    window.clearTimeout(this.pollTimer);
    if (this.stopped) return;
    const hidden = document.visibilityState === "hidden";
    if (hidden && ++this.hiddenPolls > HIDDEN_POLLS) return;
    this.pollTimer = window.setTimeout(() => void this.poll(), hidden ? HIDDEN_POLL_MS : POLL_MS);
  }

  /** Asks "what has changed since change S?" and merges the answer in. */
  private async poll(): Promise<void> {
    window.clearTimeout(this.pollTimer);
    try {
      if (this.state.phase === "loading") {
        const snapshot = await readBoard(this.board);
        if (!snapshot) return this.set({ phase: "missing" });
        this.set({ phase: "ready", view: openView(snapshot), question: snapshot.board.question });
      } else if (this.state.view) {
        const changes = await readChanges(this.board, this.state.view.seq);
        this.sent = [];
        this.set({ view: receive(this.state.view, changes) });
        this.mineChanged();
      }
      if (this.state.offline) this.cameOnline();
    } catch (error) {
      if (!(error instanceof Unreachable)) throw error;
      this.set({ offline: true });
    } finally {
      this.schedulePoll();
    }
  }

  private readonly cameOnline = () => {
    if (!this.state.offline) return;
    const waiting = this.queue.length;
    this.set({ offline: false });
    void this.flush().then(() => {
      if (this.state.offline) return;
      this.set({ backOnline: waiting - this.queue.length });
      window.clearTimeout(this.backOnlineTimer);
      this.backOnlineTimer = window.setTimeout(() => this.set({ backOnline: null }), BACK_ONLINE_MS);
      return this.poll();
    });
  };

  private readonly wentOffline = () => {
    this.set({ offline: true, backOnline: null });
  };

  private readonly visibilityChanged = () => {
    this.hiddenPolls = 0;
    if (document.visibilityState === "hidden") this.schedulePoll();
    // Coming back asks at once.
    else void this.poll();
  };

  /** The queue lives only in this tab (Q20), so leaving with actions waiting asks first. */
  private readonly beforeUnload = (event: BeforeUnloadEvent) => {
    if (this.queue.length === 0) return;
    event.preventDefault();
    event.returnValue = "";
  };
}

/** What the reader is told when the service refuses something they did. */
function refusalNote(answer: Answer): string {
  if (answer.status === "refused") {
    switch (answer.reason) {
      case "argument_deleted":
        return "1 action couldn't be sent: that argument was deleted.";
      case "version_deleted":
        return "1 action couldn't be sent: that wording was deleted.";
      case "revision_changed":
        return "This wording changed while you were away. Take another look.";
      case "board_closed":
        return "This board closed while you were away.";
      default:
        return "1 action couldn't be sent.";
    }
  }
  return "1 action couldn't be sent.";
}

