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
