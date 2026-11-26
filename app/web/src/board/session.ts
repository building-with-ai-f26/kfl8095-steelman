// One open board in one tab: what the reader holds, the actions waiting to
// send, and the polling that keeps both moving (plans/architecture.md §3).
// Every decision about what's on screen is made by the shared rules
// (`openView`, `receive`, `pressUpdate`, `pillCount`, `enqueue`); this only
// runs them at the right moments and tells React when something changed.

import { enqueue, leaveOut, openView, pillCount, pressUpdate, putBack, receive, showMoved, tooManyMessage } from "@steelman/shared";
import type { Access, BoardChanges, BoardOrder, CommentLinkState, CommentTarget, BoardSnapshot, Closing, CombinePreview, HistoryEntry, Person, QueuedAction, ReaderView, ReportReason, Role, Standing } from "@steelman/shared";
import { Unreachable, addComment, addOption, deleteComment, setCommentHidden, setResolved, citeSource, combineWording, deleteOption, readCombinePreview, separateWording, undoChange, readBoard, readChanges, readCommentLink, readHistory, readPeople, invite, removeMember, renameOption, renameQuestion, restoreOption, setClosed, setClosingTime, send, setAccess, setHidden, setReport, setRole, setUnavailable } from "../api.ts";
import type { Answer, Closed } from "../api.ts";
import { browserIds } from "../system.ts";

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

/** A combine or separation the reader just made (M3a-7): for ten seconds, Undo sends its undo. */
export interface Restructured {
  /** The change's number, which Undo names. */
  seq: number;
  label: string;
  /** Where the Undo bar sits: under the row the wording is in now. */
  optionId: string;
  after: string | null;
  /** What was on screen before, so Undo puts everything back where it was; null once the reader has pressed Update since. */
  before: BoardOrder | null;
  /** The wording that moved, where the cursor goes after Undo. */
  versionId: string;
}

export interface SessionState {
  /** Ready, or why the board can't be shown: no such board, no access to it, or signed out. */
  phase: "loading" | Closed | "ready";
  view: ReaderView | null;
  /** The board's question: as it was when the board opened, then as the Owner renames it (M3b-2). */
  question: string;
  /** Actions not yet accepted by the service. */
  waiting: number;
  offline: boolean;
  /** Over a rate limit (architecture §7): what the reader is told, while the queue waits to send again; null otherwise. */
  tooMany: string | null;
  /** How many were sent on coming back, while that note is up; null otherwise. */
  backOnline: number | null;
  /** The reader's own choices, newest first: queued, or sent but not yet in the rows the reader holds. */
  mine: readonly QueuedAction[];
  /** What the board last said, for the live region. */
  status: string;
  /** Who can get in, and the reader's own role, as the service last said. */
  access: Access | null;
  role: Role | null;
  /** Whether the board is closed and when, as the service last said (M3b-5); null when it's open with no closing time. */
  closing: Closing | null;
  /**
   * What the service said of the comment the board's link points to (M3b-13), asked once, as the board opens, and only
   * when the board didn't send that comment; null otherwise.
   */
  commentLink: CommentLinkState | null;
  /** Wordings the reader assessed after they changed, so the assessment wasn't counted: until they assess again. */
  stale: readonly string[];
  /** The reader's own deletions, kept off the screen (leaveOut): held for Undo, on their way, or back. */
  leftOut: readonly string[];
  /** The delete Undo can still take back. */
  undo: Held | null;
  /** An option the reader deleted, held for Undo (M3a-2), or null. */
  optionGone: { id: string; name: string } | null;
  /** Options the reader deleted, kept off the screen: held for Undo, or sent and not yet answered. */
  optionsLeftOut: readonly string[];
  /** The newest change-log row a poll has brought (History reads the log again when it moves, M3a-4); 0 before any. */
  logSeq: number;
  /** The reader's own combine or separation, while its Undo lasts (M3a-7), or null. */
  restructured: Restructured | null;
  /**
   * Why the last thing the reader did wasn't done (the service refused it, or couldn't be reached), shown at the foot
   * of the window until they dismiss it or something they do works (M-14); null when there's nothing to say.
   */
  problem: string | null;
  /**
   * The counts the latest poll changed because people voted, by argument ID for importance and by wording ID for
   * articulation, with the view that poll drew, so that those numbers roll while that view is shown (M3d-8). A count a
   * combine, a separation, or an edit changed isn't among them; null before any poll.
   */
  recounted: { view: ReaderView; ids: ReadonlySet<string> } | null;
}

export class BoardSession {
  private state: SessionState = {
    phase: "loading",
    view: null,
    question: "",
    waiting: 0,
    offline: false,
    tooMany: null,
    backOnline: null,
    mine: [],
    status: "",
    access: null,
    role: null,
    closing: null,
    commentLink: null,
    stale: [],
    leftOut: [],
    undo: null,
    optionGone: null,
    optionsLeftOut: [],
    logSeq: 0,
    restructured: null,
    problem: null,
    recounted: null,
  };
  private readonly listeners = new Set<() => void>();
  private queue: QueuedAction[] = [];
  /** Sent, and waiting for the next answer to "changes after S" to show them. */
  private sent: QueuedAction[] = [];
  private sending = false;
  private pollTimer: number | undefined;
  private backOnlineTimer: number | undefined;
  private undoTimer: number | undefined;
  private optionTimer: number | undefined;
  private restructureTimer: number | undefined;
  /** How many times Update has been pressed: a screen kept from before one is out of date. */
  private updates = 0;
  /** The wordings polls have brought added or with new text since the last Update, which Update rings (M3d-8). */
  private changedSinceUpdate = new Set<string>();
  /** The reader's own combine or separation the rows don't show yet (the read after it failed): the wording that moved. */
  private movedUnseen: string | null = null;
  /** Told before the reader's own combine, separation, or its undo is sent, and just before it shows (M3d-7). */
  private moveListeners = new Set<(versionId: string, next: ReaderView | null) => void>();
  private tooManyTimer: number | undefined;
  /** Polls since the tab was hidden. */
  private hiddenPolls = 0;
  private stopped = false;
  /** The owner's access changes: whether one is being sent, the latest not yet sent, and what the service last accepted. */
  private sharing = false;
  /** While the Owner's own close or reopen is being read back, which says so in its own words (M3b-6). */
  private closingOwn = false;
  private wanted: Access | null = null;
  private accepted: Access | null = null;
  /** Counts the owner's changes, so a poll that started before one doesn't put the old access back. */
  private shareCount = 0;

  /** @param comment The comment the board's link points to (M3b-13), if it was a comment's link. */
  constructor(
    private readonly board: string,
    private readonly comment: string | null = null,
  ) {}

  // ── For React (useSyncExternalStore) ──
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
  snapshot = () => this.state;

  /**
   * Calls the listener twice for the reader's own combine, separation, or its undo, from the bar or from History
   * (M3d-7): with the wording's ID and null as it's sent, while the screen still shows the wording where it was, and
   * with the view about to be shown just before it's shown. One the service refuses gets only the first call. Other
   * people's changes, and Update, never call it.
   */
  onMove = (listener: (versionId: string, next: ReaderView | null) => void) => {
    this.moveListeners.add(listener);
    return () => {
      this.moveListeners.delete(listener);
    };
  };

  private willMove(versionId: string, next: ReaderView | null): void {
    for (const listener of this.moveListeners) listener(versionId, next);
  }

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
      const snapshot = await this.firstRead();
      if (this.stopped) return;
      if (!this.opened(snapshot)) return;
    } catch (error) {
      if (!(error instanceof Unreachable)) throw error;
      // Opened while offline: try again on the next poll.
      this.set({ offline: true });
    }
    this.schedulePoll();
  }

  /**
   * The board's first read. For a comment's link (M3b-13) whose comment the board didn't send, the service is also
   * asked where it leads, since it sends no comment whose subject is gone; the answer is in place before the board
   * shows, so the board opens on the right note at once.
   */
  private async firstRead(): Promise<(BoardSnapshot & Standing) | Closed> {
    const snapshot = await readBoard(this.board);
    const comment = this.comment;
    if (typeof snapshot === "string" || comment === null || (snapshot.comments ?? []).some((row) => row.id === comment)) return snapshot;
    this.state = { ...this.state, commentLink: await readCommentLink(this.board, comment) };
    return snapshot;
  }

  /** Shows the board just read, or why it can't be. Returns whether it's showing. */
  private opened(snapshot: (BoardSnapshot & Standing) | Closed): boolean {
    if (typeof snapshot === "string") {
      this.set({ phase: snapshot, view: null });
      return false;
    }
    this.set({ phase: "ready", view: openView(snapshot), question: snapshot.board.question, access: snapshot.access, role: snapshot.role, closing: snapshot.closing ?? null });
    return true;
  }

  stop(): void {
    // Leaving the board sends what Undo was holding.
    this.sendHeld(true);
    this.sendHeldOption(true);
    this.stopped = true;
    window.clearTimeout(this.pollTimer);
    window.clearTimeout(this.backOnlineTimer);
    window.clearTimeout(this.tooManyTimer);
    window.clearTimeout(this.restructureTimer);
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
    // A vote says what it did, for a screen reader (M2-11); a refusal, once the service answers, says why instead.
    const said = voteNote(action);
    // While the service asks to wait, the wait is what's said: the vote is only queued.
    if (said && !this.state.tooMany) this.announce(said);
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
    this.sendHeldOption();
    this.endRestructured();
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

  /**
   * The wordings that arrived on a poll since the last Update, added or with new words, which the board rings when
   * Update draws them (M3d-8), and forgets them. The board leaves out the reader's own, by author.
   */
  takeChanged(): string[] {
    const ids = [...this.changedSinceUpdate];
    this.changedSinceUpdate.clear();
    return ids;
  }

  /** Update: draws the board in the newest shared order. */
  update(status = "Board updated."): void {
    if (!this.state.view) return;
    this.updates++;
    this.changedSinceUpdate.clear();
    // An Undo bar still showing keeps its Undo, but no longer the screen from before: Update has redrawn it.
    const restructured = this.state.restructured ? { ...this.state.restructured, before: null } : null;
    this.set({ view: pressUpdate(this.state.view), status, restructured });
  }

  /**
   * Says that something the reader did wasn't done, and why: in the status line, for a screen reader, and on screen,
   * where it stays until it's dismissed or something else they do works (M-14). One at a time: a newer one replaces it.
   */
  private fail(why: string): void {
    this.set({ problem: why });
    this.announce(why);
  }

  /** The reader closes the message. */
  dismissProblem(): void {
    if (this.state.problem !== null) this.set({ problem: null });
  }

  /** Something the reader did worked, so an earlier message no longer says how things stand. */
  private worked(): void {
    if (this.state.problem !== null) this.set({ problem: null });
  }

  announce(status: string): void {
    // The same words twice in a row change nothing on the page, so a screen reader wouldn't read them again: the
    // repeat gets a no-break space, which looks and reads the same (M2-11).
    const same = this.state.status.replace(/\u00a0$/, "") === status;
    this.set({ status: same && !this.state.status.endsWith("\u00a0") ? `${status}\u00a0` : status });
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
    this.worked();
    this.announce(now.general === "link" ? `Anyone with the link can ${{ viewer: "view", voter: "vote", contributor: "contribute" }[now.linkRole]}.` : "Only invited people can open it.");
    await this.poll();
  }

  /** Reports a wording (M2-3). Not queued: it needs the service there to answer. */
  report(versionId: string, report: { reason: ReportReason; note: string }): Promise<boolean> {
    return this.sendReport(versionId, report, "Reported. Editors will see it.");
  }

  withdrawReport(versionId: string): Promise<boolean> {
    return this.sendReport(versionId, null, "Report withdrawn.");
  }

  /** An Editor or the Owner hides a wording (M2-4), in the prototype's words. Not queued, like a report. */
  hide(versionId: string, reason: ReportReason): Promise<boolean> {
    return this.moderate(() => setHidden(this.board, versionId, reason), "Hidden.");
  }

  restore(versionId: string): Promise<boolean> {
    return this.moderate(() => setHidden(this.board, versionId, null), "Restored.");
  }

  /** Reports that a source can't be opened (M3a-3, C-02). Not queued, like a report of a wording. */
  reportSource(sourceId: string): Promise<boolean> {
    return this.moderate(
      () => setUnavailable(this.board, sourceId, true),
      "You reported that this source can’t be opened. It shows as unavailable on every wording that cites it.",
      "Someone already reported that this source can’t be opened.",
    );
  }

  /** Takes back the reader's own report, or, for an Editor or the Owner, clears someone else's. */
  clearSourceReport(sourceId: string, own: boolean): Promise<boolean> {
    return this.moderate(
      () => setUnavailable(this.board, sourceId, false),
      own ? "You withdrew your report." : "You cleared the report, so the source shows as available.",
      "The report was already cleared.",
    );
  }

  private sendReport(versionId: string, report: { reason: ReportReason; note: string } | null, done: string): Promise<boolean> {
    return this.moderate(() => setReport(this.board, versionId, report), done);
  }

  /**
   * Adds an option at the end (M3a-2), with the ID the browser made, and names
   * it. Not queued, like a moderator's action. Answers whether it was added.
   */
  addOption(id: string, name: string): Promise<boolean> {
    return this.moderate(() => addOption(this.board, { id, name }), `You added the option “${name}”.`);
  }

  /**
   * Renames the board's question (M3b-2, I-01). Not queued: it's sent now, and the heading changes once the service
   * has it. Refused or unreachable, the old question stays and the message says why.
   */
  async renameQuestion(question: string): Promise<boolean> {
    const answer = await this.ask(() => renameQuestion(this.board, question));
    if (!answer) return false;
    this.set({ question });
    // Already done means another tab made this same rename first: nothing changed here, so nothing is said.
    if (answer.status === "done") this.announce("The question was renamed.");
    await this.refresh();
    return true;
  }

  /**
   * Closes the board now, or reopens it (M3b-6, I-05): the Owner's, sent at once and not queued, with no confirmation.
   * Once the service has it, the board is read again and the status line says what happened.
   */
  async setClosed(closed: boolean): Promise<boolean> {
    const answer = await this.ask(() => setClosed(this.board, closed));
    if (!answer) return false;
    this.closingOwn = true;
    try {
      await this.refresh();
    } finally {
      this.closingOwn = false;
    }
    this.announce(closed ? "The board is closed." : "The board is open again.");
    return true;
  }

  /**
   * Sets the moment the board closes, or clears it with null (M3b-6). Answers "past" when the service says the moment
   * has passed, which the panel says under the field, and false when it couldn't be sent, which the message says.
   */
  async setClosingTime(closesAt: string | null, said: string): Promise<true | false | "past"> {
    let answer: Answer;
    try {
      answer = await setClosingTime(this.board, closesAt);
    } catch (error) {
      if (!(error instanceof Unreachable)) throw error;
      this.fail("Couldn’t reach Steelman. Try again.");
      return false;
    }
    if (answer.status === "invalid") return "past";
    if (answer.status === "refused" && answer.reason === "too_many" && answer.retryAfter !== undefined) {
      this.fail(tooManyMessage(answer.retryAfter));
      return false;
    }
    if (answer.status !== "done" && answer.status !== "already_done") {
      this.fail(refusalNote(answer));
      return false;
    }
    this.worked();
    // Not quieted as Close now is: a new time on a board its time had closed opens it again, which is news.
    await this.refresh();
    this.announce(said);
    return true;
  }

  renameOption(id: string, name: string): Promise<boolean> {
    return this.moderate(() => renameOption(this.board, id, name), "You renamed the option.");
  }

  /** Deletes an empty option: off the screen at once and held ten seconds for Undo, like deleting a wording. */
  holdOptionDelete(option: { id: string; name: string }): void {
    this.sendHeld();
    this.sendHeldOption();
    this.endRestructured();
    this.set({ optionGone: option, optionsLeftOut: [...this.state.optionsLeftOut, option.id], status: "You deleted the option. Undo is available for ten seconds." });
    this.optionTimer = window.setTimeout(() => this.sendHeldOption(), UNDO_MS);
  }

  undoOptionDelete(): void {
    const gone = this.state.optionGone;
    if (!gone) return;
    window.clearTimeout(this.optionTimer);
    this.set({ optionGone: null, optionsLeftOut: this.state.optionsLeftOut.filter((id) => id !== gone.id), status: "The option is back." });
  }

  /**
   * Sends the held option delete. The option stays off the screen until the
   * service answers: once it's gone from the rows too, or back, with the
   * reason, if it was refused or couldn't be sent.
   */
  private sendHeldOption(closing = false): void {
    const gone = this.state.optionGone;
    if (!gone) return;
    window.clearTimeout(this.optionTimer);
    this.set({ optionGone: null });
    if (closing) {
      void deleteOption(this.board, gone.id, true).catch(() => undefined);
      return;
    }
    void this.moderate(() => deleteOption(this.board, gone.id), "").finally(() => this.set({ optionsLeftOut: this.state.optionsLeftOut.filter((id) => id !== gone.id) }));
  }

  /**
   * Sends a report or a moderator's action, says how it went (unless `done` is empty), and asks for changes. Answers
   * whether it was taken. `already` is said instead when someone else had already done it, if it reads differently.
   */
  private async moderate(request: () => Promise<Answer>, done: string, already = done): Promise<boolean> {
    const answer = await this.ask(request);
    if (!answer) return false;
    const said = answer.status === "already_done" ? already : done;
    if (said) this.announce(said);
    await this.refresh();
    return true;
  }

  /**
   * Asks for changes after a write the service took. When that read fails, the write still stands: the poll already
   * scheduled asks again, so the failure isn't the caller's to handle.
   */
  private async refresh(): Promise<void> {
    try {
      await this.poll();
    } catch {
      // The next poll brings what this one would have.
    }
  }

  /** Sends a write that isn't queued. Answers what the service said when it was taken; otherwise says why not, and answers null. */
  private async ask(request: () => Promise<Answer>): Promise<Extract<Answer, { status: "done" | "already_done" }> | null> {
    let answer: Answer;
    try {
      answer = await request();
    } catch (error) {
      if (!(error instanceof Unreachable)) throw error;
      this.fail("Couldn’t reach Steelman. Try again.");
      return null;
    }
    if (answer.status === "refused" && answer.reason === "too_many" && answer.retryAfter !== undefined) {
      this.fail(tooManyMessage(answer.retryAfter));
      return null;
    }
    if (answer.status !== "done" && answer.status !== "already_done") {
      this.fail(refusalNote(answer));
      return null;
    }
    this.worked();
    return answer;
  }

  /**
   * Combines a wording into another argument in its option (M3a-7, A-10). Not queued, like a moderator's action: it's
   * sent now, and the wording moves on screen once the service has it. Ten seconds of Undo follow, which send its undo
   * (J-05). When it was its argument's last wording, the two arguments become one, and the Undo bar says so.
   */
  combine(versionId: string, intoId: string): Promise<boolean> {
    const from = this.state.view?.rows.versions[versionId]?.argumentId;
    // What it says comes from what the service did: whether the argument it left became one with the other.
    const words = (view: ReaderView) =>
      from && view.rows.arguments[from]?.mergedInto
        ? { label: "You combined the arguments.", said: "The arguments are combined." }
        : { label: "You combined the wording with that argument.", said: "The wording now sits with the other argument’s wordings." };
    return this.restructure(() => combineWording(this.board, versionId, intoId), versionId, words);
  }

  /** Makes a wording its own argument, at the end of its option (M3a-7), with ten seconds of Undo. */
  separate(versionId: string): Promise<boolean> {
    return this.restructure(() => separateWording(this.board, versionId, browserIds.itemId()), versionId, () => ({
      label: "You made the wording its own argument.",
      said: "The wording is now its own argument, at the end of this option.",
    }));
  }

  /** What combining would do, for its dialog: whether the arguments become one, and who'd be asked to vote again. */
  combinePreview(versionId: string, intoId: string): Promise<CombinePreview | null> {
    return readCombinePreview(this.board, versionId, intoId);
  }

  private async restructure(request: () => Promise<Answer>, versionId: string, wordsFor: (view: ReaderView) => { label: string; said: string }): Promise<boolean> {
    this.sendHeld();
    this.sendHeldOption();
    this.endRestructured();
    const updates = this.updates;
    const shownBefore = this.state.view?.shown ?? null;
    this.willMove(versionId, null);
    const answer = await this.ask(request);
    if (!answer) return false;
    await this.refresh();
    const view = this.state.view;
    if (!view) return true;
    // Update pressed while it was being sent has already redrawn the screen: Undo doesn't bring the old one back.
    const before = this.updates === updates ? shownBefore : null;
    // The read after it failed, so the rows don't show the move yet: it's shown as the reader's own when they arrive.
    const unseen = answer.status === "done" && view.seq < answer.seq;
    this.movedUnseen = unseen ? versionId : null;
    // The reader's own change shows at once, as their deletion does; others see it on their next Update.
    const moved = unseen ? view : showMoved(view, versionId);
    if (!unseen) this.willMove(versionId, moved);
    const version = moved.rows.versions[versionId];
    const argument = version ? moved.rows.arguments[version.argumentId] : undefined;
    if (answer.status !== "done") {
      this.set({ view: moved });
      this.announce("That was already done.");
      return true;
    }
    const words = wordsFor(moved);
    if (!argument) {
      this.set({ view: moved });
      this.announce(words.said);
      return true;
    }
    this.set({ view: moved, restructured: { seq: answer.seq, label: words.label, optionId: argument.optionId, after: argument.id, before, versionId }, status: `${words.said} Undo is available for ten seconds.` });
    window.clearTimeout(this.restructureTimer);
    this.restructureTimer = window.setTimeout(() => this.endRestructured(), UNDO_MS);
    return true;
  }

  /** Undo for the reader's own combine or separation: sends its undo, and puts the board back as it was on screen. */
  async undoRestructure(): Promise<boolean> {
    const held = this.state.restructured;
    if (!held) return false;
    this.endRestructured();
    const updates = this.updates;
    this.willMove(held.versionId, null);
    const answer = await this.ask(() => undoChange(this.board, held.seq));
    if (!answer) {
      // Not taken: the bar comes back for another ten seconds, so there's still a way to try again.
      window.clearTimeout(this.restructureTimer);
      this.set({ restructured: this.updates === updates ? held : { ...held, before: null } });
      this.restructureTimer = window.setTimeout(() => this.endRestructured(), UNDO_MS);
      return false;
    }
    await this.refresh();
    // The screen from before the change, unless the reader pressed Update since: then only the wording goes back,
    // and the order Update drew stays.
    const before = this.updates === updates ? held.before : null;
    this.showUndone(held.versionId, answer, before);
    this.announce("The wording is back where it was.");
    return true;
  }

  /** Shows a wording back where an undo put it, at once; or, when the read after the undo failed, once the rows arrive. */
  private showUndone(versionId: string, answer: { status: "done"; seq: number } | { status: "already_done" }, before: BoardOrder | null = null): void {
    const view = this.state.view;
    if (!view) return;
    if (answer.status === "done" && view.seq < answer.seq) {
      this.movedUnseen = versionId;
      return;
    }
    this.movedUnseen = null;
    const next = before ? putBack(view, before) : showMoved(view, versionId);
    this.willMove(versionId, next);
    this.set({ view: next });
  }

  /**
   * Undoes a combine or a separation from History (M3a-8, J-04), after its ten seconds: the wording goes back, and
   * shows where it is now at once, as the reader's own change does.
   */
  async undoChange(seq: number, versionId: string): Promise<boolean> {
    if (this.state.restructured?.seq === seq) return this.undoRestructure();
    // Another change's undo: the bar's screen from before is out of date now, so the bar goes.
    this.endRestructured();
    this.willMove(versionId, null);
    const answer = await this.ask(() => undoChange(this.board, seq));
    if (!answer) return false;
    await this.refresh();
    this.showUndone(versionId, answer);
    this.announce(answer.status === "done" ? "The wording is back where it was." : "That was already undone.");
    return true;
  }

  private endRestructured(): void {
    window.clearTimeout(this.restructureTimer);
    if (this.state.restructured) this.set({ restructured: null });
  }

  /**
   * Adds someone by their username (M3b-7, H-01). Not queued: it's sent now. Answers null when they were added, or
   * the sentence the panel shows under the field when they weren't.
   */
  async invite(username: string, role: Exclude<Role, "owner">): Promise<string | null> {
    const name = username.trim().replace(/^@/, "").toLowerCase();
    if (!name) return "Type who you want to add.";
    let answer: Answer;
    try {
      answer = await invite(this.board, name, role);
    } catch (error) {
      if (!(error instanceof Unreachable)) throw error;
      return "Couldn’t reach Steelman. Try again.";
    }
    if (answer.status === "not_found" || answer.status === "invalid") return `No one is called ${name}. Check the username.`;
    if (answer.status === "already_done" || (answer.status === "refused" && answer.reason === "already_member")) return `${name} already has access.`;
    if (answer.status === "refused" && answer.reason === "too_many" && answer.retryAfter !== undefined) return tooManyMessage(answer.retryAfter);
    if (answer.status !== "done") return answer.status === "refused" ? refusalNote(answer) : "Type a username.";
    this.announce(`${name} can ${CAN[role]}.`);
    await this.refresh();
    return null;
  }

  /**
   * Adds a comment on the question, an option, or a wording (M3b-11, D-01). Not queued: it's sent now, and when it
   * can't be added its text stays in the box (architecture §3). Answers null once it's added, or the sentence the
   * panel shows when it isn't. The same ID with the same text is safe to send again: the service answers that it's
   * already done.
   */
  async addComment(target: CommentTarget, id: string, body: string): Promise<string | null> {
    const text = body.trim();
    if (!text) return "Write a comment first.";
    const on = target === "question" ? {} : target;
    let answer: Answer;
    try {
      answer = await addComment(this.board, { id, ...on, body: text });
    } catch (error) {
      if (!(error instanceof Unreachable)) throw error;
      return "You’re offline, so your comment wasn’t sent. It is still in the box.";
    }
    if (answer.status === "invalid") return "Write a comment first.";
    if (answer.status === "not_found" || (answer.status === "refused" && (answer.reason === "version_deleted" || answer.reason === "option_deleted"))) return "This wording was removed, so your comment wasn’t added.";
    if (answer.status === "refused" && answer.reason === "too_many" && answer.retryAfter !== undefined) return tooManyMessage(answer.retryAfter);
    if (answer.status === "refused") return refusalNote(answer);
    this.announce("Your comment was added.");
    // Not waited for: the box is free for the next comment while the poll brings this one in.
    void this.refresh();
    return null;
  }

  /**
   * Replies to a thread (M3b-12, D-01), sent with the thread's own subject. Not queued, like a comment: answers null
   * once it's added, or the sentence the reply form shows when it isn't, with the text still in its box. A reply to a
   * thread someone resolved meanwhile is refused (architecture §3), and the board is read again so the thread shows it.
   */
  async addReply(target: CommentTarget, parentId: string, id: string, body: string): Promise<string | null> {
    const text = body.trim();
    if (!text) return "Write a reply first.";
    const on = target === "question" ? {} : target;
    let answer: Answer;
    try {
      answer = await addComment(this.board, { id, ...on, parentId, body: text });
    } catch (error) {
      if (!(error instanceof Unreachable)) throw error;
      return "You’re offline, so your reply wasn’t sent. It is still in the box.";
    }
    if (answer.status === "done" || answer.status === "already_done") {
      this.announce("Your reply was added.");
      void this.refresh();
      return null;
    }
    void this.refresh();
    if (answer.status === "invalid") return "Write a reply first.";
    if (answer.status === "refused" && answer.reason === "too_many" && answer.retryAfter !== undefined) return tooManyMessage(answer.retryAfter);
    if (answer.status === "refused" && answer.reason === "thread_resolved") return "This thread was resolved, so your reply wasn’t added.";
    if (answer.status === "refused" && answer.reason === "thread_deleted") return "This comment was deleted, so your reply wasn’t added.";
    if (answer.status === "not_found" || (answer.status === "refused" && (answer.reason === "version_deleted" || answer.reason === "option_deleted"))) return "This wording was removed, so your reply wasn’t added.";
    return refusalNote(answer);
  }

  /**
   * Resolves a thread by its first comment, or with `false` reopens it (M3b-12, D-01). Each says what the thread
   * should be, so pressing it twice is safe. Answers null once it's done, or the sentence that says why it wasn't.
   */
  async setResolved(threadId: string, resolved: boolean): Promise<string | null> {
    let answer: Answer;
    try {
      answer = await setResolved(this.board, threadId, resolved);
    } catch (error) {
      if (!(error instanceof Unreachable)) throw error;
      return resolved ? "You’re offline, so the thread wasn’t resolved." : "You’re offline, so the thread wasn’t reopened.";
    }
    if (answer.status === "done" || answer.status === "already_done") {
      this.announce(resolved ? "The thread is resolved. It is under Resolved." : "The thread is open again.");
      void this.refresh();
      return null;
    }
    void this.refresh();
    if (answer.status === "not_found") return "This comment is no longer on the board.";
    if (answer.status === "refused" && answer.reason === "thread_deleted") return resolved ? "This comment was deleted, so its thread can’t be resolved." : "This comment was deleted, so its thread can’t be reopened.";
    return refusalNote(answer);
  }

  /**
   * Deletes the reader's own comment (M3b-12, D-01), after the panel has asked. Its text and author are erased and
   * its place kept (architecture §2). Answers null once it's deleted, or the sentence that says why it wasn't.
   */
  async deleteComment(id: string): Promise<string | null> {
    let answer: Answer;
    try {
      answer = await deleteComment(this.board, id);
    } catch (error) {
      if (!(error instanceof Unreachable)) throw error;
      return "You’re offline, so your comment wasn’t deleted.";
    }
    if (answer.status === "done" || answer.status === "already_done") {
      this.announce("Your comment was deleted.");
      void this.refresh();
      return null;
    }
    void this.refresh();
    if (answer.status === "not_found") return "This comment is no longer on the board.";
    if (answer.status === "refused" && answer.reason === "not_author") return "Only the person who wrote a comment can delete it.";
    return refusalNote(answer);
  }

  /**
   * An Editor or the Owner hides someone else's comment with one of the report reasons (M3b-14, D-01, J-02), or with
   * `null` restores it. Not queued, like hiding a wording. The board is read again before it answers, so the panel has
   * drawn Restore, or Hide, by the time it puts the focus there. Answers null once it's done, or why it wasn't.
   */
  async setCommentHidden(id: string, reason: ReportReason | null): Promise<string | null> {
    let answer: Answer;
    try {
      answer = await setCommentHidden(this.board, id, reason);
    } catch (error) {
      if (!(error instanceof Unreachable)) throw error;
      return reason ? "You’re offline, so the comment wasn’t hidden." : "You’re offline, so the comment wasn’t restored.";
    }
    if (answer.status === "done" || answer.status === "already_done") {
      this.announce(reason ? "The comment is hidden." : "The comment is restored.");
      await this.refresh();
      return null;
    }
    void this.refresh();
    if (answer.status === "not_found") return "This comment is no longer on the board.";
    if (answer.status === "refused" && answer.reason === "comment_deleted") return reason ? "This comment was deleted, so it wasn’t hidden." : "This comment was deleted, so it wasn’t restored.";
    if (answer.status === "refused" && answer.reason === "own_comment") return reason ? "You can’t hide your own comment." : "You can’t restore your own comment.";
    return refusalNote(answer);
  }

  /** Removes a member (M3b-7, H-01), at once and with no confirmation, as Google Drive does. */
  async removeMember(person: Person): Promise<boolean> {
    const answer = await this.ask(() => removeMember(this.board, person.id));
    if (!answer) return false;
    const name = person.name ?? "That person";
    const byLink = this.state.access?.general === "link" ? ` ${name} can still open this steelman with the link.` : "";
    this.announce(`${name} no longer has access.${byLink}`);
    await this.refresh();
    return true;
  }

  /** The board's History (M3a-4, J-03), newest first, or null when it can't be read now. */
  history(): Promise<HistoryEntry[] | null> {
    return readHistory(this.board);
  }

  /** Restores a deleted option from History (M3a-4). Not queued, like deleting one. */
  restoreOption(option: { id: string; name: string }): Promise<boolean> {
    return this.moderate(() => restoreOption(this.board, option.id), `You restored the option “${option.name}”.`, "That option is already back.");
  }

  /** Puts a source taken off a wording back on it, from History (M3a-4). Its credibility starts over, as with any change of sources. */
  putSourceBack(versionId: string, sourceId: string): Promise<boolean> {
    return this.moderate(() => citeSource(this.board, versionId, sourceId), "You put the source back on the wording. The credibility score resets.", "That source is already on the wording.");
  }

  /** Restores a hidden wording from History (M3a-4), saying so in a sentence. */
  restoreHidden(versionId: string): Promise<boolean> {
    return this.moderate(() => setHidden(this.board, versionId, null), "You restored the wording.", "That wording is already restored.");
  }

  /** Everyone on the board, for Share's people list, or null when it can't be read now. */
  people(): Promise<Person[] | null> {
    return readPeople(this.board);
  }

  /** The owner sets someone's role (M2-2b). Answers whether the service took it. */
  async setRole(person: Person, role: Exclude<Role, "owner">): Promise<boolean> {
    let answer: Answer;
    try {
      answer = await setRole(this.board, person.id, role);
    } catch (error) {
      if (!(error instanceof Unreachable)) throw error;
      this.fail("Couldn’t reach Steelman. Try again.");
      return false;
    }
    if (answer.status !== "done" && answer.status !== "already_done") {
      this.fail(answer.status === "not_found" ? `${person.name ?? "They"} is no longer on this board.` : refusalNote(answer));
      return false;
    }
    this.worked();
    this.announce(`${person.name ?? "They"} ${MEMBER_CAN[role]}.`);
    return true;
  }

  private stopSharing(why: string): void {
    this.wanted = null;
    this.set({ access: this.accepted });
    this.fail(why);
  }

  pillCount(): number {
    return this.state.view ? pillCount(leaveOptionsOut(leaveOut(this.state.view, this.state.leftOut), this.state.optionsLeftOut)) : 0;
  }

  // ── Sending ──
  private async flush(): Promise<void> {
    if (this.sending || this.state.offline || this.state.tooMany !== null) return;
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
        // Over a rate limit nothing was saved: the action stays queued, with the rest, and is sent once the wait has passed.
        if (answer.status === "refused" && answer.reason === "too_many") {
          this.waitToSend(answer.retryAfter ?? 60);
          return;
        }
        // By this action, not by place: a newer choice made while it was on its way may have replaced it in the queue.
        this.queue = this.queue.filter((queued) => queued !== action);
        if (answer.status === "done" || answer.status === "already_done") this.sent.push(action);
        else if (action.kind === "assess" && answer.status === "refused" && answer.reason === "revision_changed") {
          // The card itself says this, beside the answer it couldn't take, so it isn't said again at the foot of the window.
          this.announce(refusalNote(answer));
          this.set({ stale: [...this.state.stale, action.versionId] });
        } else {
          this.fail(refusalNote(answer));
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

  private waitToSend(seconds: number): void {
    const note = tooManyMessage(seconds);
    this.set({ tooMany: note, status: note });
    window.clearTimeout(this.tooManyTimer);
    this.tooManyTimer = window.setTimeout(() => {
      this.set({ tooMany: null });
      void this.flush();
    }, seconds * 1000);
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
        if (!this.opened(await this.firstRead())) return;
      } else if (this.state.view) {
        const shares = this.shareCount;
        // Only what was sent before asking is in the answer: what's sent meanwhile stays the reader's until a later one.
        const asked = new Set(this.sent);
        const changes = await readChanges(this.board, this.state.view.seq);
        // Access can end while the board is open: the owner turned the link off.
        if (typeof changes === "string") return this.set({ phase: changes, view: null });
        this.sent = this.sent.filter((action) => !asked.has(action));
        const accessSettled = !this.sharing && shares === this.shareCount;
        const wasModerator = moderates(this.state.role);
        const logSeq = Math.max(this.state.logSeq, ...changes.log.map((row) => row.seq));
        const recountedIds = this.noteChanges(this.state.view, changes);
        let view = receive(this.state.view, changes);
        // The reader's own move, whose rows a failed read kept back: shown as theirs now, not marked as someone else's.
        const movedNow = this.movedUnseen !== null && changes.versions.some((version) => version.id === this.movedUnseen) ? this.movedUnseen : null;
        if (movedNow !== null) {
          view = showMoved(view, movedNow);
          this.movedUnseen = null;
          this.willMove(movedNow, view);
        }
        const wasClosed = this.state.closing?.closed ?? false;
        const closing = changes.closing ?? null;
        this.set({ view, recounted: { view, ids: recountedIds }, role: changes.role, logSeq, closing, ...(accessSettled ? { access: changes.access } : {}), ...(changes.question === undefined ? {} : { question: changes.question }) });
        // Said once, when it changes: the board closed, by hand or by its time, or opened again (M3b-5).
        if ((closing?.closed ?? false) !== wasClosed && !this.closingOwn) this.announce(closing?.closed ? "This board is closed." : "This board is open again.");
        // Reports are sent only to an Editor or the owner (M2-3): becoming one, or no longer being one, needs every wording again.
        if (moderates(changes.role) !== wasModerator) {
          const fresh = await readBoard(this.board);
          if (typeof fresh !== "string" && this.state.view) {
            // Comments too (M3b-10): the change number moves to the snapshot's, so one stamped since the poll is sent only here.
            const { options, arguments: args, versions, sources, comments } = fresh;
            this.set({ view: receive(this.state.view, { seq: Math.max(fresh.board.seq, this.state.view.seq), options, arguments: args, versions, sources, ...(comments ? { comments } : {}), order: null, log: [] }) });
          }
        }
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

  /**
   * What a poll's answer changes, from the rows held before it (M3d-8). Wordings added, or whose words changed, are kept
   * for Update's ring. It answers the counts that changed because people voted: an argument's importance, unless it
   * gained or lost an argument combined into it or a wording in this answer, and a wording's articulation, unless it
   * moved or was edited. An answer older than what's held changes nothing.
   */
  private noteChanges(held: ReaderView, changes: BoardChanges): Set<string> {
    const recounted = new Set<string>();
    if (changes.seq < held.seq) return recounted;
    const rows = held.rows;
    const restructured = new Set<string>();
    for (const argument of changes.arguments) {
      const was = rows.arguments[argument.id];
      if (!was || was.mergedInto === argument.mergedInto) continue;
      restructured.add(argument.id);
      if (argument.mergedInto) restructured.add(argument.mergedInto);
      if (was.mergedInto) restructured.add(was.mergedInto);
    }
    for (const version of changes.versions) {
      const was = rows.versions[version.id];
      const reworded = was !== undefined && (was.wording !== version.wording || was.context !== version.context);
      if (!version.deleted && !version.hidden && (!was || (reworded && !was.hidden))) this.changedSinceUpdate.add(version.id);
      if (!was) continue;
      if (was.argumentId !== version.argumentId || was.rev !== version.rev) restructured.add(was.argumentId).add(version.argumentId).add(version.id);
    }
    for (const argument of changes.arguments) {
      const was = rows.arguments[argument.id];
      if (was && !restructured.has(argument.id) && was.importance !== argument.importance) recounted.add(argument.id);
    }
    for (const version of changes.versions) {
      const was = rows.versions[version.id];
      if (was && !restructured.has(version.id) && was.articulation !== version.articulation) recounted.add(version.id);
    }
    return recounted;
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

  /** The tab is going: a delete Undo was holding, of a wording or an option, is sent at once (§2). */
  private readonly pageHide = () => {
    this.sendHeld(true);
    this.sendHeldOption(true);
  };

  /**
   * The queue lives only in this tab (Q20), so leaving with actions waiting asks first. A held delete
   * doesn't ask: it's sent, unless the tab is offline, when sending it would fail.
   */
  private readonly beforeUnload = (event: BeforeUnloadEvent) => {
    if (this.quiet()) return;
    event.preventDefault();
    event.returnValue = "";
  };

  /**
   * Whether the board can be left without the leave prompt: nothing waits to send, and no held delete would fail to
   * send. A board opened from the list is left inside the page only then (M3d-9), else by loading the page, which asks.
   */
  quiet(): boolean {
    return this.queue.length === 0 && !((this.state.undo || this.state.optionGone) && this.state.offline);
  }
}

/** What's on screen without the options the reader deleted (M3a-2). They're empty, so nothing else moves. */
export function leaveOptionsOut(view: ReaderView, optionIds: readonly string[]): ReaderView {
  if (optionIds.length === 0) return view;
  return { ...view, shown: { ...view.shown, arguments: Object.fromEntries(Object.entries(view.shown.arguments).filter(([id]) => !optionIds.includes(id))) } };
}

/** Whether a role sees a wording's open reports (M2-3). */
const moderates = (role: Role | null) => role === "editor" || role === "owner";

/** What a role lets someone do, as the announcement after setting it says. */
const MEMBER_CAN = { viewer: "can view", voter: "can vote", contributor: "can contribute", editor: "can edit" } as const;

/** What a vote is announced as (M2-11, M-04), or null for anything else. */
export function voteNote(action: QueuedAction): string | null {
  if (action.kind === "importance") return action.value === null ? "You took back your importance vote." : `You voted this argument ${action.value === 1 ? "more" : "less"} important.`;
  if (action.kind === "articulation") return action.value === null ? "You took back your articulation vote." : `You voted this wording ${action.value === 1 ? "better" : "less well"} articulated.`;
  return null;
}

/** What each role may do, as the sentence after an invitation says it: "lin.zhao can contribute." */
const CAN: Record<Exclude<Role, "owner">, string> = { viewer: "view", voter: "vote", contributor: "contribute", editor: "edit" };

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
      case "option_deleted":
        return "1 action couldn't be sent: that option was deleted.";
      case "option_not_empty":
        return "That option has arguments now, so it wasn’t deleted.";
      case "too_few_options":
        return "A question needs at least two options.";
      case "too_many_options":
        return "A question can have at most four options.";
      case "option_name_taken":
        return "Another option already has that name.";
      case "not_same_option":
        return "A wording can only be combined with an argument in its own option.";
      case "only_wording":
        return "That argument has only that wording, so it can’t be separated.";
      case "combined_since":
        return "Something was combined or separated since, so this can’t be undone yet.";
      case "cant_undo":
        return "That change can’t be undone this way.";
      default:
        return "1 action couldn't be sent.";
    }
  }
  return "1 action couldn't be sent.";
}

