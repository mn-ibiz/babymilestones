import { register, registered } from "./registry.js";
import { createDataExportJob } from "./jobs/data-export.js";

export { createDataExportJob } from "./jobs/data-export.js";

/**
 * Wire the data-export worker (P1-E02-S05) given a live db + storage. The boot
 * shim below registers nothing until real infra is injected (DATABASE_URL +
 * object store land with the deploy story); tests construct the job directly.
 */
export function registerDataExportJob(deps: Parameters<typeof createDataExportJob>[0]): void {
  register(createDataExportJob(deps));
}

console.log(`jobs worker booted; registered: ${registered().join(", ") || "none"}`);
