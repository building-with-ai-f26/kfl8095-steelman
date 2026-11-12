# 005. Frontend: React + TypeScript, built with Vite, served by the same service

**Status:** accepted · **Date:** 2026-11-11 · **Details:** [architecture.md §4](../architecture.md#4-system-components)

## Context
The prototype is a single 470 KB buildless HTML file that re-renders by hand. The real app adds routing, data fetching, an offline queue, sign-in, and many screens. The builder reviews code that Claude writes, so the framework should be widely documented. The prototype's look (tokens and CSS) must carry over.

## Options
| Option | For | Against |
|---|---|---|
| **React + TypeScript + Vite**, a single-page app | The most documented choice. Shares TypeScript with the API (ordering, `staleCount()`, input rules). Vite builds static files the service serves | A build step, unlike Build 1 |
| Keep vanilla JavaScript, split into modules | No new concepts; closest to the prototype | The prototype already shows where hand-managed re-rendering leads at this size |
| Next.js | Popular, full-stack | Server rendering we don't need (boards are behind sign-in); a second runtime model to learn |
| Svelte / SvelteKit | Smaller, pleasant | Less documented; less familiar to reviewers |

## Decision
React + TypeScript built with Vite into static files, served by the Steelman service on the same origin as the API. The prototype's `tokens.css` and CSS classes are reused unchanged, so components render the same markup. Pure logic moves first into shared modules with tests.

## Why
It's the best-documented way to organize an app this size, and it lets the browser and server share code that must agree.

## Revisit if
- Public boards need search-engine indexing (then render public board pages on the server).
- Bundle size or start-up time on phones becomes a measured problem.
