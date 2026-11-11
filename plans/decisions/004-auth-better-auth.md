# 004. Sign-in with Better Auth, accounts in our own Postgres

**Status:** accepted · **Date:** 2026-11-11 · **Details:** [architecture.md §4](../architecture.md#4-system-components), [§7](../architecture.md#7-security-and-privacy)

## Context
Sign in with Google or by email; no passwords; both confirm the email; a unique username on first sign-in. Data export and account deletion must be complete. The first draft used a one-time email link. On Nov 11 the builder chose a **6-digit code** instead: mail scanners at schools can use up a link before the person clicks it, and a link signs in the device that opened the email (often a phone) rather than the one in use.

## Options
| Option | For | Against |
|---|---|---|
| **Better Auth** (open-source TypeScript library), tables in our Postgres | Accounts in one database, so export and deletion touch one place. Handles sessions, CSRF, and account linking. Standard OpenID Connect for Google | We run it ourselves; its stewardship changed (it took over Auth.js in Sept 2025; Vercel announced on July 7, 2026 that it is acquiring the company, and the library stays MIT-licensed) |
| Managed identity (Google Identity Platform, AWS Cognito) | Hosted and maintained for us | A second user store to keep in sync for export and deletion; lock-in |
| Hand-written sessions (following the Lucia guide) | Fully explainable | Security-sensitive code we'd own and maintain |

## Decision
Better Auth with Google and one-time codes by email, storing accounts and sessions in our Postgres. Sessions are `HttpOnly`, `Secure`, `SameSite=Lax` cookies. A code is 6 digits, single-use, expires in 10 minutes, is cancelled by five wrong tries, and is typed into the page that asked for it.

## Why
It keeps all personal data in one database and avoids hand-writing session security, without a vendor between us and our users.

## Revisit if
- Better Auth stops being maintained or changes license. Our data stays in our tables, so leaving means rewriting the sign-in code, not migrating users.
- Requirements arrive that a library handles poorly (e.g. school single sign-on with SAML).
