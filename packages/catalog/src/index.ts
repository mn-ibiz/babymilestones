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
  ServicePriceOrderError,
  type ServiceUnit,
  type AttributionCheck,
  type CreateServiceInput,
  type UpdateServiceInput,
  type Executor,
} from "./services.js";
