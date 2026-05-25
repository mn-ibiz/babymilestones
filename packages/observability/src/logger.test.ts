import { describe, expect, it } from "vitest";
import { createLogger, REDACTED, REDACT_PATHS } from "./logger.js";

/** Capture pino output as parsed JSON lines via a stream sink. */
function captureLogger(extra: Parameters<typeof createLogger>[0] = {}) {
  const lines: Array<Record<string, unknown>> = [];
  const stream = {
    write(chunk: string) {
      lines.push(JSON.parse(chunk) as Record<string, unknown>);
    },
  };
  const logger = createLogger({ level: "debug", ...extra }, stream);
  return { logger, lines };
}

describe("createLogger", () => {
  it("emits structured JSON", () => {
    const { logger, lines } = captureLogger();
    logger.info({ event: "test" }, "hello");
    expect(lines).toHaveLength(1);
    const line = lines[0]!;
    expect(line.event).toBe("test");
    expect(line.msg).toBe("hello");
    expect(typeof line.level).toBe("number");
    expect(typeof line.time).toBe("number");
  });

  it("includes a base service name", () => {
    const { logger, lines } = captureLogger({ service: "api" });
    logger.info("up");
    expect(lines[0]!.service).toBe("api");
  });

  it("carries a correlation id on a child logger", () => {
    const { logger, lines } = captureLogger();
    const child = logger.child({ correlationId: "cid-42" });
    child.info("scoped");
    expect(lines[0]!.correlationId).toBe("cid-42");
  });

  it("redacts secrets and PII so they are never logged", () => {
    const { logger, lines } = captureLogger();
    logger.info(
      {
        pin: "1234",
        password: "hunter2",
        apiKey: "sk_live_abc",
        token: "tok_secret",
        authorization: "Bearer xyz",
        phone: "+254700000000",
      },
      "sensitive",
    );
    const line = lines[0]!;
    for (const key of ["pin", "password", "apiKey", "token", "authorization", "phone"]) {
      expect(line[key]).toBe(REDACTED);
    }
  });

  it("redacts nested secret paths", () => {
    const { logger, lines } = captureLogger();
    logger.info({ user: { pin: "9999" }, headers: { authorization: "Bearer t" } }, "nested");
    const line = lines[0]!;
    expect((line.user as Record<string, unknown>).pin).toBe(REDACTED);
    expect((line.headers as Record<string, unknown>).authorization).toBe(REDACTED);
  });

  it("never logs the raw value of a redacted field", () => {
    const { logger, lines } = captureLogger();
    logger.info({ pin: "1234" }, "msg");
    expect(JSON.stringify(lines[0])).not.toContain("1234");
  });

  it("exposes the redaction path list including pin", () => {
    expect(REDACT_PATHS).toContain("pin");
    expect(REDACT_PATHS).toContain("password");
  });
});
