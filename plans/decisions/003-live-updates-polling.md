# 003. Live updates by polling "changes after S", server-sent events later

**Status:** accepted · **Date:** 2026-11-11 · **Details:** [architecture.md §3](../architecture.md#3-live-updates-and-ordering)

## Context
A reader's order is held still until they choose Update, so "live" only has to keep counts fresh and tell readers that changes are waiting. Step 1 set the target at ~5 s for the class trial and ~2 s later on.

## Options
| Option | For | Against |
|---|---|---|
| **Polling** every ~3 s while a board is visible | Nothing new to run. The same request handles reconnecting after being offline. ~10 requests a second for 30 readers, mostly "nothing new" | More requests than push at large scale |
| Server-sent events from our own service | Sub-second; fewer requests. Instances share notices through Postgres `LISTEN/NOTIFY` | On Cloud Run an open connection keeps its instance billed and must reconnect at the request timeout |
| A managed realtime service (Supabase Realtime, Ably, Firebase) | Push without running it ourselves | A second system that must agree with Postgres and with our permission checks; another vendor; Firestore would be a second database |

## Decision
Poll the service for changes after the reader's change number. The server keeps no per-reader state. The browser computes "N changes" and applies Update itself. The shared order is recalculated lazily on the first request after the board's tick (60 s for the class trial), with no scheduler.

## Why
Meets the latency target with no new component, and keeps the contract ("changes after S") independent of how it's delivered.

## Revisit if
- Sustained polling passes ~100 requests a second.
- A feature needs sub-second updates, such as Presence (L-08). Then switch to server-sent events with the same answers.
