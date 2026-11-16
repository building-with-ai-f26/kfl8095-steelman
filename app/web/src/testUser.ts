// Instead of signing in, a tab can act as a test account: the browser says
// which, and keeps the choice per tab, so two tabs can be two people. The
// service only listens in development and tests (server/src/app.ts).

const KEY = "steelman.testUser";

export interface TestUser {
  id: string;
  username: string;
}

/** The test account this tab acts as, or null. Outside a browser (rendering in a test) there's none. */
export function chosenTestUser(): string | null {
  return typeof sessionStorage === "undefined" ? null : sessionStorage.getItem(KEY);
}

export function chooseTestUser(id: string): void {
  sessionStorage.setItem(KEY, id);
}

/** After the account it acted as is deleted, the tab acts as nobody. */
export function forgetTestUser(): void {
  sessionStorage.removeItem(KEY);
}

export async function listTestUsers(): Promise<TestUser[]> {
  const response = await fetch("/api/test-users");
  if (!response.ok) return [];
  return ((await response.json()) as { users: TestUser[] }).users;
}
