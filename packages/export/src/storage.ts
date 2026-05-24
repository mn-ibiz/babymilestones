/**
 * Object storage abstraction for export ZIPs. The launch implementation is an
 * in-memory store standing in for an S3-equivalent with signed URLs; swapping
 * in a real bucket later means implementing this same interface. The API and
 * jobs share one instance so an enqueued job's output is downloadable.
 */
export interface ExportStorage {
  /** Persist a ZIP under an opaque key. Returns the key. */
  put(key: string, data: Buffer): Promise<void>;
  /** Fetch a previously stored ZIP, or null if it is absent/expired. */
  get(key: string): Promise<Buffer | null>;
}

/** In-memory ExportStorage for launch + tests. */
export class InMemoryExportStorage implements ExportStorage {
  private readonly objects = new Map<string, Buffer>();

  async put(key: string, data: Buffer): Promise<void> {
    this.objects.set(key, data);
  }

  async get(key: string): Promise<Buffer | null> {
    return this.objects.get(key) ?? null;
  }
}
