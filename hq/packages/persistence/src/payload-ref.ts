export type PayloadStorageProvider = "CLOUD_STORAGE" | "LOCAL_REFERENCE" | "EXTERNAL_PROVIDER";

/** A pointer to a large payload; the payload itself is never embedded here. */
export interface PayloadReference {
  readonly storageProvider: PayloadStorageProvider;
  readonly path: string;
  readonly checksum?: string;
  readonly contentType: string;
  readonly schemaVersion: number;
  readonly createdAt: string;
  readonly sizeBytes?: number;
}

export function assertPayloadReference(reference: PayloadReference): void {
  if (!reference.path.trim()) throw new Error("Payload reference path must not be empty.");
  if (reference.sizeBytes !== undefined && reference.sizeBytes < 0) throw new Error("Payload reference size cannot be negative.");
}
