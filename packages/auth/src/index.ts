export { normalizePhone, isValidPhone } from "./phone.js";
export { isValidPinFormat, isWeakPin, hashPin, verifyPin, generatePin, DUMMY_PIN_HASH } from "./pin.js";
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
export {
  ACTIONS,
  RESOURCES,
  ALL,
  PERMISSION_MATRIX,
  CAPABILITIES,
  CAPABILITY_MATRIX,
  RECONCILIATION_VIEW_ROLES,
  IMPERSONATION_BANNER_HEADER,
  ImpersonationDeniedError,
  can,
  canImpersonate,
  hasCapability,
  canApproveAdjustment,
  canViewReconciliation,
  permissionMatrixRows,
  capabilityMatrixRows,
  requirePermission,
  requireCapability,
  actAs,
  invalidateSessionsOnRoleChange,
  type Action,
  type Resource,
  type Permission,
  type Capability,
  type PermissionRow as RbacPermissionRow,
  type CapabilityRow,
  type PermissionPrincipal,
  type PermissionOutcome,
  type ActAsResult,
  type SessionInvalidator,
} from "./rbac.js";
