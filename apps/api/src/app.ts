import Fastify, { type FastifyInstance } from "fastify";

/** Build the single API surface that serves all front-end apps. */
export function buildApp(): FastifyInstance {
  const app = Fastify({ logger: false });
  app.get("/healthz", async () => ({ status: "ok" }));
  return app;
}
