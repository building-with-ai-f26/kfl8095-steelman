# 001. Host on Google Cloud (Cloud Run + Cloud SQL)

**Status:** accepted · **Date:** 2026-11-11 · **Details:** [architecture.md §5](../architecture.md#5-cloud-gcp-or-aws)

## Context
The cloud's job is small: run one container, host one Postgres database, keep a few secrets, make one scheduled call a day, and send logs and spend alerts. Sign-in, email, analytics, and payments sit outside the cloud. The builder pays hosting, so it should stay cheap, and the builder is aiming for a role at Google.

## Options
| Option | For | Against |
|---|---|---|
| **GCP: Cloud Run + Cloud SQL** | Scales to zero, HTTPS included, no load balancer at class scale (~$10–15/month). Fewest concepts to learn first. Matches the builder's career goal | Cloud Run's own domain mapping is a preview feature; production on a public scale needs a load balancer |
| AWS: ECS Express Mode + RDS | The largest cloud. App Runner closed to new customers on April 30, 2026; Express Mode replaces it | Always-on Fargate plus a load balancer (~$16/month alone): ~$40/month at class scale. A network, IAM roles, and a certificate on day one |
| An app platform (Render, Fly.io, Railway) | Slightly less setup | Doesn't build the cloud experience the builder wants; Cloud Run is nearly as simple |

## Decision
GCP: Cloud Run and Cloud SQL for PostgreSQL in `us-central1`, with separate staging and production projects, all in Terraform.

## Why
It's the builder's career target, and it's also the better technical fit: cheaper at class scale and simpler to operate alone. Lock-in stays low because the app is a standard container, the database is standard Postgres, and sign-in uses standard OpenID Connect.

## Revisit if
- The builder's target changes to AWS.
- Cloud Run's pricing or limits change so that scale-to-zero no longer saves money.
- Public communities need something Cloud Run can't do (e.g. long-lived connections at a scale where instance billing dominates).
