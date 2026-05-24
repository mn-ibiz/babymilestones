export { normalizePhone, isValidPhone } from "./phone.js";
export { isValidPinFormat, isWeakPin, hashPin, verifyPin, DUMMY_PIN_HASH } from "./pin.js";
export { LoginRateLimiter, type RateLimitResult } from "./rate-limit.js";
export { ResetRateLimiter, type ResetRateLimitResult } from "./reset-rate-limit.js";
export {
  InMemorySessionStore,
  SESSION_COOKIE_NAME,
  CSRF_COOKIE_NAME,
  CSRF_HEADER_NAME,
  serializeSessionCookie,
  serializeCsrfCookie,
  generateCsrfToken,
  clearAuthCookies,
  parseCookies,
  type SessionStore,
  type SessionData,
} from "./session.js";
export {
  validateSession,
  guardRole,
  type AuthenticatedUser,
  type GuardRequest,
  type GuardOutcome,
  type ResolveUser,
  type ValidateSessionDeps,
  type RoleGuardResult,
} from "./middleware.js";
export {
  OTP_TTL_MS,
  generateOtpCode,
  hashOtpCode,
  verifyOtpCode,
} from "./otp.js";
export {
  RESET_TOKEN_AUDIENCE,
  issueResetToken,
  verifyResetToken,
  InMemoryConsumedTokenStore,
  type ResetTokenPayload,
  type VerifyResetTokenResult,
  type IssueResetTokenOpts,
  type VerifyResetTokenOpts,
  type ConsumedTokenStore,
} from "./reset-token.js";
export {
  ALL_ROLES,
  STAFF_ROLES,
  isStaffRole,
  landingForRole,
  staffUserSeed,
  type Role,
} from "./staff.js";
