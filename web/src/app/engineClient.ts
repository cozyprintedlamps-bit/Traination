// The page's side of the engine worker. Results are cached by their parameters: a plan uses the
// same few parts many times, and switching steps must not rebuild anything.
import type { PartMesh } from "../core/mesh";
import type { ElementType, Variant } from "../core/track";
import type { Fits, Vehicle } from "../core/vehicle";
import type { VehicleMeshes } from "../geometry/engine";
import type { TrackOptions } from "../geometry/track";
import type { MeshSource } from "../export/printItems";
import type { WorkerRequest, WorkerResponse } from "./engine.worker";

type Request = WorkerRequest extends infer R ? (R extends { id: number } ? Omit<R, "id"> : never) : never;

const CACHE_LIMIT = 200;

export class EngineClient implements MeshSource {
  private readonly worker: Worker;
  private readonly pending = new Map<number, { resolve(v: unknown): void; reject(e: Error): void }>();
  private readonly cache = new Map<string, Promise<unknown>>();
  private nextId = 1;

  constructor() {
    this.worker = new Worker(new URL("./engine.worker.ts", import.meta.url), { type: "module" });
    this.worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const message = event.data;
      const entry = this.pending.get(message.id);
      if (!entry) return;
      this.pending.delete(message.id);
      if (message.ok) entry.resolve(message.result);
      else entry.reject(new Error(message.error));
    };
    this.worker.onerror = (event) => {
      const error = new Error(event.message || "worker error");
      for (const entry of this.pending.values()) entry.reject(error);
      this.pending.clear();
    };
  }

  private send<T>(request: Request): Promise<T> {
    const key = JSON.stringify(request);
    const cached = this.cache.get(key);
    if (cached) return cached as Promise<T>;
    const promise = new Promise<T>((resolve, reject) => {
      const id = this.nextId++;
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject });
      this.worker.postMessage({ ...request, id });
    });
    promise.catch(() => this.cache.delete(key));
    this.cache.set(key, promise);
    if (this.cache.size > CACHE_LIMIT) {
      const oldest = this.cache.keys().next().value;
      if (oldest !== undefined) this.cache.delete(oldest);
    }
    return promise;
  }

  element(type: ElementType, variant: Variant, options: TrackOptions): Promise<PartMesh> {
    return this.send({ op: "element", type: strip(type), variant, options });
  }

  printElement(type: ElementType, variant: Variant, options: TrackOptions): Promise<PartMesh> {
    return this.send({ op: "printElement", type: strip(type), variant, options });
  }

  vehicle(vehicle: Vehicle, fits: Fits): Promise<VehicleMeshes> {
    // name and colours do not change the geometry
    return this.send({ op: "vehicle", vehicle: { ...vehicle, id: "", name: "", colors: { chassis: "", body: "", accent: "", wheels: "" } }, fits });
  }
}

/** Name, colour and id do not change the geometry: leave them out of the cache key. */
const strip = (type: ElementType): ElementType => ({ ...type, id: "", name: "", color: "" });
