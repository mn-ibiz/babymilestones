/** @bm/catalog — interfaces and primitives land with their owning P1 stories. */
export const PACKAGE = "@bm/catalog" as const;

export {
  SERVICE_UNITS,
  ATTRIBUTION_ROLES,
  isAttributionRole,
  createService,
  updateService,
  getService,
  listServices,
  listServicesByUnit,
  COACHING_FORMATS,
  isCoachingFormat,
  setServicePrice,
  listServicePrices,
  resolveServicePriceAt,
  getServiceAttributionRole,
  checkBookingAttribution,
  serviceAttributionRole,
  TAX_TREATMENTS,
  DEFAULT_TAX_TREATMENT,
  KENYA_VAT_RATE_BPS,
  isTaxTreatment,
  getServiceTaxTreatment,
  serviceTaxTreatment,
  computeLineTax,
  ServicePriceOrderError,
  type ServiceUnit,
  type LineTax,
  type AttributionCheck,
  type CreateServiceInput,
  type UpdateServiceInput,
  type Executor,
} from "./services.js";

export {
  createStaff,
  updateStaff,
  setStaffActive,
  getStaff,
  listStaff,
  type CreateStaffInput,
  type UpdateStaffInput,
} from "./staff.js";

export {
  PRODUCT_SEARCH_MIN_QUERY,
  PRODUCT_SEARCH_LIMIT,
  createProduct,
  findProductByCode,
  searchProductsByName,
  type CreateProductInput,
} from "./products.js";

// Non-POS stock-mutation paths (P4-E04-S05 / Story 29.5): goods-received,
// stock-take, manual admin adjustment — each enqueues a coalesced Woo push.
export { adjustStock } from "./stock-adjustments.js";
export type { AdjustStockInput, StockAdjustmentReason } from "./stock-adjustments.js";

// Commission rates + runs (P3-E01).
export {
  setCommissionRate,
  resolveRateAt,
  getOpenCommissionRate,
  listCommissionRates,
  commissionCents,
  type SetCommissionRateInput,
} from "./commission-rates.js";

export {
  createCommissionRun,
  previewCommissionRun,
  priorMonthPeriod,
  buildPayoutCsv,
  PAYOUT_CSV_COLUMNS,
  type CreateCommissionRunInput,
  type CommissionRunResult,
  type CommissionRunPreview,
  type PayoutRow,
} from "./commission-run.js";

// Public staff-earnings viewer view-model (P3-E02-S01 / S02).
export {
  monthBoundsUtc,
  computeStaffEarnings,
  UNATTRIBUTED,
  type EarningsLedgerEntry,
  type EarningsPayout,
  type MonthBounds,
  type StaffEarningsInput,
  type StaffEarningsView,
  type ServiceCount,
  type ServiceRevenue,
} from "./staff-earnings.js";

export {
  SUBSCRIPTION_PERIODS,
  isSubscriptionPeriod,
  addPeriod,
  PlanPriceOrderError,
  createPlan,
  updatePlan,
  getPlan,
  listPlans,
  setPlanPrice,
  listPlanPrices,
  resolvePlanPriceAt,
  pauseSubscription,
  resumeSubscription,
  requestSubscriptionCancellation,
  reverseSubscriptionCancellation,
  SubscriptionNotFoundError,
  SubscriptionStateError,
  type CreatePlanInput,
  type UpdatePlanInput,
} from "./subscriptions.js";

export {
  SLOT_GENERATION_HORIZON_DAYS,
  hmToMinutes,
  minutesToHm,
  slotWindows,
  addDaysIso,
  dayOfWeekIso,
  enumerateSlotDates,
  createSchedule,
  updateSchedule,
  getSchedule,
  listSchedules,
  generateSlotsForSchedule,
  regenerateActiveSlots,
  deleteFutureUnbookedSlots,
  resyncScheduleSlots,
  listSlotsWithRemaining,
  getSlotWithRemaining,
  isSlotPast,
  browseServiceSlots,
  bookSlot,
  SlotNotFoundError,
  SlotFullError,
  ServicePriceMissingError,
  DuplicateBookingError,
  BookingNotFoundError,
  ServiceMismatchError,
  BookingAlreadyCancelledError,
  slotStartUtcMs,
  isWithinRescheduleCutoff,
  rescheduleBooking,
  cancelBooking,
  type RescheduleResult,
  type CancelResult,
  type SlotWindow,
  type CreateScheduleInput,
  type UpdateScheduleInput,
  type SlotWithRemaining,
  type BrowseSlot,
  type BookSlotInput,
  type BookSlotResult,
} from "./schedules.js";

// Kids-Only Salon Flow: stylist availability + salon slot creation (P3-E03-S01).
export {
  SALON_SLOT_HORIZON_DAYS,
  availabilityCoversDate,
  createStaffAvailability,
  updateStaffAvailability,
  getStaffAvailability,
  listStaffAvailability,
  listSalonServiceDurations,
  generateSalonSlotsForAvailability,
  deleteFutureUnbookedSalonSlots,
  resyncStaffAvailabilitySlots,
  regenerateSalonSlots,
  listSalonSlots,
  listAvailableSalonSlots,
  resolveLeastBusyStylist,
  bookSalonSlot,
  NoStylistAvailableError,
  SalonSlotNotFoundError,
  SalonSlotTakenError,
  SalonServicePriceMissingError,
  SalonStylistMismatchError,
  // Salon counter check-in & service completion (P3-E03-S03 / Story 25.3).
  listSalonBookingsForDate,
  // Salon-specific reporting read model (P3-E03-S05 / Story 25.5).
  listSalonReportingRowsForDate,
  createAdHocSalonSlot,
  completeSalonService,
  noopSalonFeedbackHook,
  SalonBookingNotFoundError,
  SalonNotCheckedInError,
  SalonAlreadyCompletedError,
  // Reassign a salon booking between stylists (P3-E03-S04 / Story 25.4).
  reassignSalonBooking,
  SalonStylistUnavailableError,
  type CreateStaffAvailabilityInput,
  type UpdateStaffAvailabilityInput,
  type SalonServiceDuration,
  type GenerateSalonSlotsOpts,
  type BookSalonSlotInput,
  type BookSalonSlotResult,
  type SalonCounterBookingRow,
  type CreateAdHocSalonSlotInput,
  type SalonFeedbackHook,
  type CompleteSalonServiceInput,
  type CompleteSalonServiceResult,
  type ReassignSalonBookingInput,
  type ReassignSalonBookingResult,
} from "./salon.js";

// Coach availability + 1:1 booking (P5-E01-S02 / Story 31.2). REUSES the generic
// staff_availability table; bookable coaching_slots are capacity-1.
export {
  COACHING_SLOT_HORIZON_DAYS,
  listCoachingOfferingDurations,
  generateCoachingSlotsForAvailability,
  deleteFutureUnbookedCoachingSlots,
  resyncCoachAvailabilitySlots,
  regenerateCoachingSlots,
  listCoachingSlots,
  listAvailableCoachingSlots,
  listAvailableCoachingSlotsWithSeats,
  bookCoachingSlot,
  CoachingSlotNotFoundError,
  CoachingSlotTakenError,
  CoachingSlotFullError,
  CoachingServicePriceMissingError,
  CoachingCoachMismatchError,
  type CoachingOfferingDuration,
  type CoachingSlotWithSeats,
  type GenerateCoachingSlotsOpts,
  type BookCoachingSlotInput,
  type BookCoachingSlotResult,
} from "./coaching.js";

// Salon-specific reporting aggregation (P3-E03-S05 / Story 25.5).
export {
  aggregateSalonDayReport,
  type SalonReportingRow,
  type SalonStylistDayStats,
  type SalonDayReport,
  type AggregateSalonDayReportOpts,
} from "./salon-reporting.js";

// Daily operations dashboard aggregation + read model (P3-E05-S01 / Story 27.1).
export {
  aggregateOperationsDashboard,
  type OperationsBookingRow,
  type OperationsDashboardInput,
  type UnitRevenue,
  type OperationsRevenue,
  type OperationsTopStaff,
  type OperationsDashboard,
  type AggregateOperationsDashboardOpts,
} from "./operations-dashboard.js";
export {
  loadOperationsDashboard,
  type LoadOperationsDashboardOpts,
} from "./operations-dashboard-db.js";

// Revenue by unit, by period — range aggregation + delta (P3-E05-S02 / Story 27.2).
export {
  aggregateRevenueByPeriod,
  precedingPeriod,
  type RevenueBookingRow,
  type RevenueRefundRow,
  type RevenuePeriodRows,
  type RevenuePeriodInput,
  type UnitPeriodRevenue,
  type UnitPeriodDelta,
  type RevenueByPeriod,
} from "./revenue-by-period.js";
export {
  loadRevenueByPeriod,
  type LoadRevenueByPeriodOpts,
} from "./revenue-by-period-db.js";

// Top-staff leaderboard — per-staff revenue / service count / avg ticket + the
// per-staff commission drill-down (P3-E05-S03 / Story 27.3).
export {
  aggregateStaffLeaderboard,
  aggregateStaffCommission,
  type LeaderboardStaffRow,
  type LeaderboardBookingRow,
  type StaffLeaderboardInput,
  type StaffLeaderboardRow,
  type StaffLeaderboard,
  type CommissionLedgerLine,
  type StaffCommissionTotals,
} from "./staff-leaderboard.js";
export {
  loadStaffLeaderboard,
  loadStaffCommissionDrilldown,
  type LoadStaffLeaderboardOpts,
  type LoadStaffCommissionDrilldownOpts,
  type StaffCommissionDrilldown,
} from "./staff-leaderboard-db.js";

// Peak-hours heatmap — active sessions bucketed by weekday × hour (P3-E05-S05 / Story 27.5).
export {
  aggregatePeakHoursHeatmap,
  HEATMAP_WEEKDAYS,
  HEATMAP_HOURS,
  type PeakHoursSessionRow,
  type PeakHoursHeatmapInput,
  type PeakHoursCell,
  type PeakHoursHeatmap,
} from "./peak-hours-heatmap.js";
export {
  loadPeakHoursHeatmap,
  type LoadPeakHoursHeatmapOpts,
} from "./peak-hours-heatmap-db.js";

// Wallet aging report — outstanding balances bucketed by age (P3-E05-S04 / Story 27.4).
export {
  aggregateWalletAging,
  WALLET_AGING_BUCKETS,
  type WalletAgingBucketDef,
  type AgingInvoiceRow,
  type WalletAgingInput,
  type WalletAgingRow,
  type WalletAgingBucket,
  type WalletAgingReport,
} from "./wallet-aging.js";
export {
  loadWalletAging,
  type LoadWalletAgingOpts,
} from "./wallet-aging-db.js";

// Daily dispatch report — online-order status counts + value + pack/dispatch
// timings + sync-health (P4-E04-S04 / Story 29.4).
export {
  aggregateDailyDispatch,
  DISPATCH_LOCAL_STATUSES,
  type DispatchLocalStatus,
  type DailyDispatchOrderRow,
  type DailyDispatchEventRow,
  type DailyDispatchInput,
  type DispatchStatusCount,
  type DailyDispatchReport,
} from "./daily-dispatch.js";
export {
  loadDailyDispatch,
  wooTotalToCents,
  type LoadDailyDispatchOpts,
} from "./daily-dispatch-db.js";
