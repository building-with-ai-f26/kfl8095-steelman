# 004. Sign-in with Better Auth, accounts in our own Postgres

**Status:** accepted · **Date:** 2026-11-11 · **Details:** [architecture.md §4](../architecture.md#4-system-components), [§7](../architecture.md#7-security-and-privacy)

## Context
Decided earlier: sign in with Google or a one-time email link; no passwords; both confirm the email; a unique username on first sign-in. Data export and account deletion must be complete. Mail scanners at schools can use up one-time links before people click them.

## Options
| Option | For | Against |
|---|---|---|
| **Better Auth** (open-source TypeScript library), tables in our Postgres | Accounts in one database, so export and deletion touch one place. Handles sessions, CSRF, and account linking. Standard OpenID Connect for Google | We run it ourselves; its stewardship changed (it took over Auth.js in Sept 2025; Vercel announced on July 7, 2026 that it is acquiring the company, and the library stays MIT-licensed) |
| Managed identity (Google Identity Platform, AWS Cognito) | Hosted and maintained for us | A second user store to keep in sync for export and deletion; lock-in. Cognito's passwordless sign-in uses codes, and its page doesn't mention links |
| Hand-written sessions (following the Lucia guide) | Fully explainable | Security-sensitive code we'd own and maintain |

## Decision
Better Auth with Google and email links, storing accounts and sessions in our Postgres. Sessions are `HttpOnly`, `Secure`, `SameSite=Lax` cookies. Email links are single-use, expire in 15 minutes, and open a **Continue** page, so scanners can't consume them.

## Why
It keeps all personal data in one database and avoids hand-writing session security, without a vendor between us and our users.

## Revisit if
- Better Auth stops being maintained or changes license. Our data stays in our tables, so leaving means rewriting the sign-in code, not migrating users.
- Requirements arrive that a library handles poorly (e.g. school single sign-on with SAML).
