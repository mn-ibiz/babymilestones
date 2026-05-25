import { pino, type Logger, type LoggerOptions, type DestinationStream } from "pino";

/** Replacement token written in place of any redacted secret/PII value. */
export const REDACTED = "[REDACTED]" as const;

/**
 * Secret/PII field names that must never appear in logs. Listed both as
 * top-level keys and under common nesting points (user, headers, body, params,
 * query, *.headers) so structured payloads are scrubbed regardless of shape.
 * PINs and keys are explicitly covered (never log PINs/keys).
 */
const SECRET_KEYS = [
  "pin",
  "password",
  "passcode",
  "otp",
  "token",
  "accessToken",
  "refreshToken",
  "resetToken",
  "apiKey",
  "secret",
  "consumerSecret",
  "passkey",
  "authorization",
  "cookie",
  "setCookie",
  "phone",
  "msisdn",
] as const;

const NESTS = ["user", "headers", "body", "params", "query", "req.headers", "res.headers", "*"];

/** The full pino `redact.paths` list applied by `createLogger`. */
export const REDACT_PATHS: string[] = [
  ...SECRET_KEYS,
  ...NESTS.flatMap((nest) => SECRET_KEYS.map((key) => `${nest}.${key}`)),
];

export interface CreateLoggerOptions extends Omit<LoggerOptions, "redact"> {
  /** Service name stamped on every line (api, jobs, platform, pos, admin). */
  service?: string;
}

/**
 * Build the canonical structured (JSON) logger with secret/PII redaction.
 * An optional destination stream is accepted for tests; production omits it so
 * pino writes JSON to stdout. Correlation ids ride on child loggers, e.g.
 * `logger.child({ correlationId })`.
 */
export function createLogger(
  options: CreateLoggerOptions = {},
  destination?: DestinationStream,
): Logger {
  const { service, base, ...rest } = options;
  const opts: LoggerOptions = {
    ...rest,
    base: { ...(service ? { service } : {}), ...(base ?? {}) },
    redact: { paths: REDACT_PATHS, censor: REDACTED },
  };
  return destination ? pino(opts, destination) : pino(opts);
}

export type { Logger, DestinationStream as LogDestination };
