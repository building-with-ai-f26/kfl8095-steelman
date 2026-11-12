/**
 * The time, as something the code is handed rather than something it looks up.
 *
 * Nothing in the app reads the system's clock directly. The server is given a
 * Clock when it starts: the real one in production, a fake one in tests, so a
 * test of "a minute later" moves the clock instead of waiting
 * (plans/architecture.md §8).
 */
export interface Clock {
  now(): Date;
}
