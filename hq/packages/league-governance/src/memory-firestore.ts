import type { FirestoreLike } from "./firestore.ts";

/** In-memory Firestore for tests and local design previews (never production): docs, collections, serialized transactions. */
export class MemoryFirestore implements FirestoreLike {
  readonly docs = new Map<string, Record<string, unknown>>();
  private seq = 0;
  private chain: Promise<unknown> = Promise.resolve();

  private ref(path: string) {
    const docs = this.docs;
    const id = path.split("/").at(-1)!;
    return { id, path, get: async () => snap(id, docs.get(path)) };
  }
  doc(path: string) { return this.ref(path); }
  collection(path: string) {
    return {
      doc: (id?: string) => this.ref(`${path}/${id ?? `auto${++this.seq}`}`),
      get: async () => ({ docs: [...this.docs.entries()].filter(([k]) => k.startsWith(`${path}/`) && k.split("/").length === path.split("/").length + 1).map(([k, v]) => snap(k.split("/").at(-1)!, v)) }),
    };
  }
  runTransaction<T>(update: (tx: never) => Promise<T>): Promise<T> {
    const run = async () => {
      const writes: [string, Record<string, unknown>, boolean, boolean][] = [];
      const tx = {
        get: async (ref: { path: string; id: string }) => snap(ref.id, this.docs.get(ref.path)),
        set: (ref: { path: string }, data: Record<string, unknown>, options?: { merge: boolean }) => { writes.push([ref.path, data, options?.merge ?? false, false]); },
        create: (ref: { path: string }, data: Record<string, unknown>) => { writes.push([ref.path, data, false, true]); },
      };
      const result = await update(tx as never);
      for (const [path, data, merge, create] of writes) {
        if (create && this.docs.has(path)) throw new Error("ALREADY_EXISTS");
        this.docs.set(path, merge ? { ...(this.docs.get(path) ?? {}), ...structuredClone(data) } : structuredClone(data));
      }
      return result;
    };
    const next = this.chain.then(run, run);
    this.chain = next.catch(() => undefined);
    return next;
  }
}

function snap(id: string, data: Record<string, unknown> | undefined) {
  return { id, exists: data !== undefined, data: () => (data ? structuredClone(data) : undefined) };
}
