import Fastify from "fastify";
import type { FastifyInstance } from "fastify";
import type { Clock, IdSource } from "@steelman/shared";

/** What the service is handed when it starts. Tests hand in stand-ins. */
export interface AppDependencies {
  clock: Clock;
  ids: IdSource;
}

/**
 * Builds the Steelman service without starting it, so tests can call its
 * routes directly and main.ts can listen on a port.
 */
export function buildApp({ clock }: AppDependencies): FastifyInstance {
  const app = Fastify();

  app.get("/api/health", () => ({ status: "ok", time: clock.now().toISOString() }));

  return app;
}
