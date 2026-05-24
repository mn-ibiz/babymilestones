import { expect, it } from "vitest";
import { buildApp } from "./app.js";

it("responds ok on /healthz", async () => {
  const app = buildApp();
  const res = await app.inject({ method: "GET", url: "/healthz" });
  expect(res.statusCode).toBe(200);
  expect(res.json()).toEqual({ status: "ok" });
  await app.close();
});
