// A stand-in for Google's sign-in, running inside the test on this machine
// (plans/architecture.md §8: "a small fake sign-in provider running inside the
// test, speaking the same standard protocol"). It speaks OpenID Connect as
// Google does: a discovery document, an authorization page that sends the
// browser back with a code, a token endpoint that swaps the code for a signed
// ID token, and the public keys to check that signature. No test calls Google.
//
// What it checks, as Google would: the client ID and secret, that the code is
// used once by the redirect address it was given to, and the PKCE proof that
// the service swapping the code is the one that asked for it.

import { createHash, createSign, generateKeyPairSync } from "node:crypto";
import type { KeyObject } from "node:crypto";
import { createServer } from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";

/** A Google account, as Google would describe it in an ID token. */
export interface GoogleAccount {
  /** Google's own ID for the person; never changes, even if their email does. */
  sub: string;
  email: string;
  /** Whether Google has confirmed the person owns the address. */
  emailVerified: boolean;
  name?: string;
  picture?: string;
}

/** Ways to make the next ID token wrong, as an attacker or a bug might. */
export type IdTokenFault =
  /** Signed by a key that isn't Google's. */
  | "other-key"
  /** Made for another site's client ID. */
  | "other-audience"
  /** Not bound to this sign-in (a token replayed from another one). */
  | "other-nonce"
  /** Expired an hour ago. */
  | "expired"
  /** From another issuer. */
  | "other-issuer";

export interface FakeGoogle {
  readonly issuer: string;
  readonly discoveryUrl: string;
  readonly clientId: string;
  readonly clientSecret: string;
  /** Who is signed in to Google in "the browser", and so who the authorization page approves. */
  signedInAs(account: GoogleAccount): void;
  /** Makes the next ID token wrong in one way. */
  spoilNextIdToken(fault: IdTokenFault): void;
  /** The person cancels on Google's page next time: Google sends the browser back with error=access_denied. */
  cancelNextSignIn(): void;
  close(): Promise<void>;
}

interface Pending {
  account: GoogleAccount;
  redirectUri: string;
  challenge: string;
  nonce: string | undefined;
}

const base64url = (data: string | Buffer) => Buffer.from(data).toString("base64url");

function signJwt(claims: Record<string, unknown>, key: KeyObject, kid: string): string {
  const head = base64url(JSON.stringify({ alg: "RS256", typ: "JWT", kid }));
  const body = base64url(JSON.stringify(claims));
  const signature = createSign("RSA-SHA256").update(`${head}.${body}`).sign(key);
  return `${head}.${body}.${base64url(signature)}`;
}

async function readForm(request: IncomingMessage): Promise<URLSearchParams> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(chunk as Buffer);
  return new URLSearchParams(Buffer.concat(chunks).toString("utf8"));
}

function send(response: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}) {
  response.writeHead(status, { "content-type": "application/json", ...headers });
  response.end(JSON.stringify(body));
}

/** Starts the stand-in on a free port. `now` is the test clock, which ID token times follow. */
export async function startFakeGoogle({ now }: { now: () => Date }): Promise<FakeGoogle> {
  const google = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const stranger = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const kid = "fake-google-key-1";
  const clientId = "steelman-test.apps.googleusercontent.example";
  const clientSecret = "fake-google-client-secret-not-a-secret";

  const pending = new Map<string, Pending>();
  let codes = 0;
  let account: GoogleAccount | undefined;
  let fault: IdTokenFault | undefined;
  let cancelNext = false;
  let issuer = "";

  const idTokenFor = ({ account: who, nonce }: Pending) => {
    const spoil = fault;
    fault = undefined;
    const issuedAt = Math.floor(now().getTime() / 1000) - (spoil === "expired" ? 2 * 3600 : 0);
    const claims: Record<string, unknown> = {
      iss: spoil === "other-issuer" ? "https://accounts.other.example" : issuer,
      aud: spoil === "other-audience" ? "another-site.apps.googleusercontent.example" : clientId,
      azp: clientId,
      sub: who.sub,
      email: who.email,
      email_verified: who.emailVerified,
      iat: issuedAt,
      exp: issuedAt + 3600,
      ...(nonce === undefined ? {} : { nonce: spoil === "other-nonce" ? "a-nonce-from-another-sign-in" : nonce }),
      ...(who.name === undefined ? {} : { name: who.name }),
      ...(who.picture === undefined ? {} : { picture: who.picture }),
    };
    return signJwt(claims, spoil === "other-key" ? stranger.privateKey : google.privateKey, kid);
  };

  const server = createServer((request, response) => {
    void (async () => {
      const url = new URL(request.url ?? "/", issuer);

      if (request.method === "GET" && url.pathname === "/.well-known/openid-configuration") {
        return send(response, 200, {
          issuer,
          authorization_endpoint: `${issuer}/authorize`,
          token_endpoint: `${issuer}/token`,
          userinfo_endpoint: `${issuer}/userinfo`,
          jwks_uri: `${issuer}/certs`,
          response_types_supported: ["code"],
          subject_types_supported: ["public"],
          id_token_signing_alg_values_supported: ["RS256"],
          scopes_supported: ["openid", "email", "profile"],
          code_challenge_methods_supported: ["S256"],
        });
      }

      if (request.method === "GET" && url.pathname === "/certs") {
        return send(response, 200, { keys: [{ ...google.publicKey.export({ format: "jwk" }), kid, alg: "RS256", use: "sig" }] });
      }

      if (request.method === "GET" && url.pathname === "/authorize") {
        const q = url.searchParams;
        const redirectUri = q.get("redirect_uri");
        const challenge = q.get("code_challenge");
        if (q.get("client_id") !== clientId || q.get("response_type") !== "code" || !redirectUri || !challenge || q.get("code_challenge_method") !== "S256") {
          return send(response, 400, { error: "invalid_request" });
        }
        if (cancelNext) {
          cancelNext = false;
          const back = new URL(redirectUri);
          back.searchParams.set("error", "access_denied");
          const state = q.get("state");
          if (state !== null) back.searchParams.set("state", state);
          response.writeHead(302, { location: back.toString() });
          return response.end();
        }
        if (!account) return send(response, 400, { error: "no one is signed in to the fake Google" });
        const code = `fake-code-${++codes}`;
        pending.set(code, { account, redirectUri, challenge, nonce: q.get("nonce") ?? undefined });
        const back = new URL(redirectUri);
        back.searchParams.set("code", code);
        const state = q.get("state");
        if (state !== null) back.searchParams.set("state", state);
        response.writeHead(302, { location: back.toString() });
        return response.end();
      }

      if (request.method === "POST" && url.pathname === "/token") {
        const form = await readForm(request);
        const basic = request.headers.authorization?.match(/^Basic (.+)$/)?.[1];
        const [id, secret] = basic ? Buffer.from(basic, "base64").toString("utf8").split(":").map(decodeURIComponent) : [form.get("client_id"), form.get("client_secret")];
        if (id !== clientId || secret !== clientSecret) return send(response, 401, { error: "invalid_client" });

        const code = form.get("code") ?? "";
        const waiting = pending.get(code);
        pending.delete(code);
        const verifier = form.get("code_verifier") ?? "";
        const proof = base64url(createHash("sha256").update(verifier).digest());
        if (form.get("grant_type") !== "authorization_code" || !waiting || form.get("redirect_uri") !== waiting.redirectUri || proof !== waiting.challenge) {
          return send(response, 400, { error: "invalid_grant" });
        }
        return send(response, 200, { access_token: `fake-access-token-${codes}`, token_type: "Bearer", expires_in: 3599, scope: "openid email", id_token: idTokenFor(waiting) });
      }

      return send(response, 404, { error: "not_found" });
    })().catch((error: unknown) => send(response, 500, { error: String(error) }));
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  issuer = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  return {
    issuer,
    discoveryUrl: `${issuer}/.well-known/openid-configuration`,
    clientId,
    clientSecret,
    signedInAs(who) {
      account = who;
    },
    spoilNextIdToken(next) {
      fault = next;
    },
    cancelNextSignIn() {
      cancelNext = true;
    },
    close: () => new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve()))),
  };
}
