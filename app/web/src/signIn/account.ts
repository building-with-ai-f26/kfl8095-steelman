// The web app's way to sign in: the service's /api/auth routes, the ones
// server/src/sign-in.ts lets through (SIGN_IN_ROUTES). Each call answers in
// what the screens need to say, not in Better Auth's error codes.

export interface Me {
  id: string;
  email: string;
  /** Null until they pick one. */
  username: string | null;
}

interface Reply {
  status: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  body: any;
}

/** A POST to a sign-in route, or null when the service can't be reached. */
async function post(path: string, body: unknown): Promise<Reply | null> {
  try {
    const response = await fetch(`/api/auth/${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    return { status: response.status, body: await response.json().catch(() => null) };
  } catch {
    return null;
  }
}

/** Who this browser's session cookie signs in, or null. */
export async function whoIsSignedIn(): Promise<Me | null> {
  try {
    const response = await fetch("/api/auth/get-session");
    if (!response.ok) return null;
    const user = ((await response.json()) as { user?: { id: string; email: string; username?: string | null } } | null)?.user;
    return user ? { id: user.id, email: user.email, username: user.username ?? null } : null;
  } catch {
    return null;
  }
}

export type SendAnswer = "sent" | "too_many" | "failed";

/** Emails a sign-in code, which cancels any code sent before it. */
export async function emailCode(email: string): Promise<SendAnswer> {
  const reply = await post("email-otp/send-verification-otp", { email, type: "sign-in" });
  if (reply?.status === 200) return "sent";
  if (reply?.status === 429) return "too_many";
  return "failed";
}

export type CodeAnswer = "signed_in" | "wrong" | "expired" | "too_many_tries" | "failed";

export async function signInWithCode(email: string, code: string): Promise<CodeAnswer> {
  const reply = await post("sign-in/email-otp", { email, otp: code });
  if (reply?.status === 200) return "signed_in";
  switch (reply?.body?.code) {
    case "INVALID_OTP":
      return "wrong";
    case "OTP_EXPIRED":
      return "expired";
    case "TOO_MANY_ATTEMPTS":
      return "too_many_tries";
    default:
      return "failed";
  }
}

/**
 * Where to send the browser to sign in with Google, or null if Google isn't
 * available. Google sends it back to `returnTo`, signed in, or with ?error=…
 */
export async function googleAddress(returnTo: string): Promise<string | null> {
  const reply = await post("sign-in/social", { provider: "google", callbackURL: returnTo, errorCallbackURL: returnTo });
  return reply?.status === 200 && typeof reply.body?.url === "string" ? reply.body.url : null;
}

export type NameAnswer = "chosen" | "taken" | "invalid" | "failed";

export async function chooseUsername(username: string): Promise<NameAnswer> {
  const reply = await post("update-user", { username });
  if (reply?.status === 200) return "chosen";
  if (reply?.body?.code === "USERNAME_IS_ALREADY_TAKEN") return "taken";
  if (reply?.status === 400) return "invalid";
  return "failed";
}
