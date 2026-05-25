/** @bm/catalog — interfaces and primitives land with their owning P1 stories. */
export const PACKAGE = "@bm/catalog" as const;

export {
  SERVICE_UNITS,
  createService,
  updateService,
  getService,
  listServices,
  setServicePrice,
  listServicePrices,
  resolveServicePriceAt,
  ServicePriceOrderError,
  type ServiceUnit,
  type CreateServiceInput,
  type UpdateServiceInput,
  type Executor,
} from "./services.js";
