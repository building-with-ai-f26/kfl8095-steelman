// The smoke test after each deploy (M1-14c; plans/architecture.md §6), run by
// the deploy workflow against the address it just deployed to. Signed out, by
// the builder's decision (Nov 17): it needs no way in that production doesn't
// have. The signed-in path (voting, a second session) stays with the browser
// tests, and the builder's own try after a deploy.
//
// Returns what's wrong, in words, or nothing when all is well.

export async function smokeTest(base: string, send: typeof fetch = fetch): Promise<string[]> {
  const failures: string[] = [];
  const get = (path: string, init?: RequestInit) => send(new URL(path, base), { redirect: "manual", signal: AbortSignal.timeout(15_000), ...init });

  // The page, with its security headers.
  let page: Response;
  try {
    page = await get("/");
  } catch (error) {
    return [`The page didn't load: ${(error as Error).cause ?? (error as Error).message}`];
  }
  const html = await page.text();
  if (page.status !== 200 || !page.headers.get("content-type")?.startsWith("text/html")) failures.push(`The page answered ${page.status} ${page.headers.get("content-type") ?? ""}`);
  if (!html.includes('<div id="root">')) failures.push("The page isn't the web app (no root element)");
  if (!page.headers.get("content-security-policy")?.includes("default-src 'self'")) failures.push("The page has no Content Security Policy");
  if (page.headers.get("cache-control") !== "no-cache") failures.push(`The page may be cached: cache-control ${page.headers.get("cache-control")}`);

  // The app's own script, from the build.
  const script = /src="(\/assets\/[^"]+\.js)"/.exec(html)?.[1];
  if (!script) failures.push("The page names no built script");
  else {
    const loaded = await get(script);
    if (loaded.status !== 200 || !loaded.headers.get("content-type")?.startsWith("text/javascript")) failures.push(`The app's script answered ${loaded.status}`);
  }

  // A board's address gets the app too.
  const board = await get("/b/abcdefghijkl");
  if (board.status !== 200) failures.push(`A board's address answered ${board.status}`);

  // The service: up, configured, and refusing what a signed-out visitor may not do.
  const health = await get("/api/health");
  const healthy = ((await health.json().catch(() => null)) as { status?: string } | null)?.status === "ok";
  if (health.status !== 200 || !healthy) failures.push(`GET /api/health answered ${health.status}`);
  const config = await get("/api/config");
  if (config.status !== 200) failures.push(`GET /api/config answered ${config.status}`);
  const session = await get("/api/auth/get-session");
  if (session.status !== 200) failures.push(`Sign-in is off: GET /api/auth/get-session answered ${session.status}`);
  const account = await get("/api/account");
  if (account.status !== 401) failures.push(`GET /api/account, signed out, answered ${account.status}, not 401`);
  const create = await get("/api/boards", { method: "POST", headers: { "content-type": "application/json", origin: base }, body: JSON.stringify({ question: "Smoke test?", options: ["Yes", "No"] }) });
  if (create.status !== 401) failures.push(`POST /api/boards, signed out, answered ${create.status}, not 401`);

  return failures;
}
