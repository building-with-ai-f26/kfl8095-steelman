// One open board in one tab: what the reader holds, the actions waiting to
// send, and the polling that keeps both moving (plans/architecture.md §3).
// Every decision about what's on screen is made by the shared rules
// (`openView`, `receive`, `pressUpdate`, `pillCount`, `enqueue`); this only
// runs them at the right moments and tells React when something changed.

import { enqueue, leaveOut, openView, pillCount, pressUpdate, receive } from "@steelman/shared";
import type { Access, BoardSnapshot, QueuedAction, ReaderView, Role, Standing } from "@steelman/shared";
import { Unreachable, readBoard, readChanges, send, setAccess } from "../api.ts";
import type { Answer, Closed } from "../api.ts";

/** Ask for changes this often while the board is in view (§3: "every ~3 s"). */
export const POLL_MS = 3_000;
/** …and this often while the tab is hidden, then not at all after this many (ten minutes). */
const HIDDEN_POLL_MS = 30_000;
const HIDDEN_POLLS = 20;
/** How long "Back online · N sent" stays up. */
const BACK_ONLINE_MS = 4_000;
/** How long a delete waits in the browser, so Undo can take it back without anything sent (plans/architecture.md §2). */
export const UNDO_MS = 10_000;

/**
 * A removal waiting for its ten seconds: a wording deleted, or a source taken
 * off a wording. Its Undo bar says what happened and goes after this row, or
 * first in the column when null.
 */
export interface Held {
  action: Extract<QueuedAction, { kind: "delete" } | { kind: "uncite" }>;
  label: string;
  optionId: string;
  after: string | null;
}

export interface SessionState {
  /** Ready, or why the board can't be shown: no such board, no access to it, or signed out. */
  phase: "loading" | Closed | "ready";
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
  /** Who can get in, and the reader's own role, as the service last said. */
  access: Access | null;
  role: Role | null;
  /** Wordings the reader assessed after they changed, so the assessment wasn't counted: until they assess again. */
  stale: readonly string[];
  /** The reader's own deletions, kept off the screen (leaveOut): held for Undo, on their way, or back. */
  leftOut: readonly string[];
  /** The delete Undo can still take back. */
  undo: Held | null;
}

export class BoardSession {
  private state: SessionState = {
    phase: "loading",
    view: null,
    question: "",
    waiting: 0,
    offline: false,
    backOnline: null,
    mine: [],
    status: "",
    access: null,
    role: null,
    stale: [],
    leftOut: [],
    undo: null,
  };
  private readonly listeners = new Set<() => void>();
  private queue: QueuedAction[] = [];
  /** Sent, and waiting for the next answer to "changes after S" to show them. */
  private sent: QueuedAction[] = [];
  private sending = false;
  private pollTimer: number | undefined;
  private backOnlineTimer: number | undefined;
  private undoTimer: number | undefined;
  /** Polls since the tab was hidden. */
  private hiddenPolls = 0;
  private stopped = false;
  /** The owner's access changes: whether one is being sent, the latest not yet sent, and what the service last accepted. */
  private sharing = false;
  private wanted: Access | null = null;
  private accepted: Access | null = null;
  /** Counts the owner's changes, so a poll that started before one doesn't put the old access back. */
  private shareCount = 0;

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
    window.addEventListener("pagehide", this.pageHide);
    document.addEventListener("visibilitychange", this.visibilityChanged);
    try {
      const snapshot = await readBoard(this.board);
      if (this.stopped) return;
      if (!this.opened(snapshot)) return;
    } catch (error) {
      if (!(error instanceof Unreachable)) throw error;
      // Opened while offline: try again on the next poll.
      this.set({ offline: true });
    }
    this.schedulePoll();
  }

  /** Shows the board just read, or why it can't be. Returns whether it's showing. */
  private opened(snapshot: (BoardSnapshot & Standing) | Closed): boolean {
    if (typeof snapshot === "string") {
      this.set({ phase: snapshot, view: null });
      return false;
    }
    this.set({ phase: "ready", view: openView(snapshot), question: snapshot.board.question, access: snapshot.access, role: snapshot.role });
    return true;
  }

  stop(): void {
    // Leaving the board sends what Undo was holding.
    this.sendHeld(true);
    this.stopped = true;
    window.clearTimeout(this.pollTimer);
    window.clearTimeout(this.backOnlineTimer);
    window.removeEventListener("online", this.cameOnline);
    window.removeEventListener("offline", this.wentOffline);
    window.removeEventListener("beforeunload", this.beforeUnload);
    window.removeEventListener("pagehide", this.pageHide);
    document.removeEventListener("visibilitychange", this.visibilityChanged);
  }

  // ── What the reader does ──
  /** Queues an action and, when online, sends it at once. */
  act(action: QueuedAction): void {
    if (action.kind === "assess" && this.state.stale.includes(action.versionId)) this.set({ stale: this.state.stale.filter((id) => id !== action.versionId) });
    this.queue = enqueue(this.queue, action);
    this.mineChanged();
    void this.flush();
  }

  /**
   * Deletes the reader's own wording (A-06) or takes a source off a wording
   * (C-01). It leaves the screen at once and is held here for ten seconds, so
   * Undo sends nothing; then it's sent. One is held at a time: another sends
   * the first at once. A held source removal is drawn by the card (Evidence).
   */
  hold(held: Held): void {
    this.sendHeld();
    const { action } = held;
    this.set({ undo: held, status: `${held.label} Undo is available for ten seconds.`, ...(action.kind === "delete" ? { leftOut: [...this.state.leftOut, action.versionId] } : {}) });
    this.undoTimer = window.setTimeout(() => this.sendHeld(), UNDO_MS);
  }

  /** Undo: the held removal is dropped, unsent, and what it removed comes back where it was. */
  undo(): void {
    const held = this.state.undo;
    if (!held) return;
    window.clearTimeout(this.undoTimer);
    const { action } = held;
    this.set({ undo: null, status: "Restored.", ...(action.kind === "delete" ? { leftOut: this.state.leftOut.filter((id) => id !== action.versionId) } : {}) });
  }

  /** Sends the held removal now: its ten seconds are up, another removal was made, or the board is closing. */
  private sendHeld(closing = false): void {
    const held = this.state.undo;
    if (!held) return;
    window.clearTimeout(this.undoTimer);
    this.set({ undo: null });
    const { action } = held;
    // A closing tab can't wait for the queue: the request goes now, and finishes after the page is gone.
    if (closing) void send(this.board, action, true).catch(() => undefined);
    else this.act(action);
  }

  /** Update: draws the board in the newest shared order. */
  update(status = "Board updated."): void {
    if (!this.state.view) return;
    this.set({ view: pressUpdate(this.state.view), status });
  }

  announce(status: string): void {
    this.set({ status });
  }

  /**
   * The owner changes who can get in. It shows at once and is sent one change
   * at a time, only the latest, so two quick changes can't arrive out of order.
   * If the service refuses or can't be reached, it goes back to what the
   * service last accepted.
   */
  async share(access: Access): Promise<void> {
    this.shareCount++;
    if (!this.sharing) this.accepted = this.state.access;
    this.wanted = access;
    this.set({ access });
    if (this.sharing) return;
    this.sharing = true;
    try {
      while (this.wanted) {
        const next = this.wanted;
        this.wanted = null;
        let answer: Answer;
        try {
          answer = await setAccess(this.board, next);
        } catch (error) {
          if (!(error instanceof Unreachable)) throw error;
          return this.stopSharing("Couldn’t reach Steelman. Try again.");
        }
        if (answer.status !== "done" && answer.status !== "already_done") return this.stopSharing(refusalNote(answer));
        this.accepted = next;
      }
    } finally {
      this.sharing = false;
    }
    const now = this.accepted!;
    this.announce(now.general === "link" ? `Anyone with the link can ${{ viewer: "view", voter: "vote", contributor: "contribute" }[now.linkRole]}.` : "Only invited people can open it.");
    await this.poll();
  }

  private stopSharing(status: string): void {
    this.wanted = null;
    this.set({ access: this.accepted, status });
  }

  pillCount(): number {
    return this.state.view ? pillCount(leaveOut(this.state.view, this.state.leftOut)) : 0;
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
        // By this action, not by place: a newer choice made while it was on its way may have replaced it in the queue.
        this.queue = this.queue.filter((queued) => queued !== action);
        if (answer.status === "done" || answer.status === "already_done") this.sent.push(action);
        else {
          this.announce(refusalNote(answer));
          if (action.kind === "assess" && answer.status === "refused" && answer.reason === "revision_changed") this.set({ stale: [...this.state.stale, action.versionId] });
          // A delete refused comes back on screen.
          if (action.kind === "delete") this.set({ leftOut: this.state.leftOut.filter((id) => id !== action.versionId) });
        }
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
    // A board that can't be shown has nothing to ask about.
    if (this.stopped || (this.state.phase !== "ready" && this.state.phase !== "loading")) return;
    const hidden = document.visibilityState === "hidden";
    if (hidden && ++this.hiddenPolls > HIDDEN_POLLS) return;
    this.pollTimer = window.setTimeout(() => void this.poll(), hidden ? HIDDEN_POLL_MS : POLL_MS);
  }

  /** Asks "what has changed since change S?" and merges the answer in. */
  private async poll(): Promise<void> {
    window.clearTimeout(this.pollTimer);
    try {
      if (this.state.phase === "loading") {
        if (!this.opened(await readBoard(this.board))) return;
      } else if (this.state.view) {
        const shares = this.shareCount;
        // Only what was sent before asking is in the answer: what's sent meanwhile stays the reader's until a later one.
        const asked = new Set(this.sent);
        const changes = await readChanges(this.board, this.state.view.seq);
        // Access can end while the board is open: the owner turned the link off.
        if (typeof changes === "string") return this.set({ phase: changes, view: null });
        this.sent = this.sent.filter((action) => !asked.has(action));
        const accessSettled = !this.sharing && shares === this.shareCount;
        this.set({ view: receive(this.state.view, changes), role: changes.role, ...(accessSettled ? { access: changes.access } : {}) });
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

  /** The tab is going: a delete Undo was holding is sent at once (§2). */
  private readonly pageHide = () => this.sendHeld(true);

  /**
   * The queue lives only in this tab (Q20), so leaving with actions waiting asks first. A held delete
   * doesn't ask: it's sent, unless the tab is offline, when sending it would fail.
   */
  private readonly beforeUnload = (event: BeforeUnloadEvent) => {
    if (this.queue.length === 0 && !(this.state.undo && this.state.offline)) return;
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
        return "This wording changed; take another look.";
      case "board_closed":
        return "This board closed while you were away.";
      case "not_allowed":
        return "Your role on this board doesn’t allow that.";
      case "no_access":
        return "You no longer have access to this board.";
      default:
        return "1 action couldn't be sent.";
    }
  }
  return "1 action couldn't be sent.";
}

