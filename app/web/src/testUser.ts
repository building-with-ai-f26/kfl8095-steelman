// No sign-in in M0. The browser says which test account it is acting as, and
// keeps the choice per tab, so two tabs can be two people. The service only
// listens in development and tests (server/src/app.ts).

const KEY = "steelman.testUser";

export interface TestUser {
  id: string;
  username: string;
}

export function chosenTestUser(): string | null {
  return sessionStorage.getItem(KEY);
}

export function chooseTestUser(id: string): void {
  sessionStorage.setItem(KEY, id);
}

export async function listTestUsers(): Promise<TestUser[]> {
  const response = await fetch("/api/test-users");
  if (!response.ok) return [];
  return ((await response.json()) as { users: TestUser[] }).users;
}
