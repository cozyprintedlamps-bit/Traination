// The geometry engine in a Web Worker: the page stays responsive while parts are built.
import wasmUrl from "manifold-3d/manifold.wasm?url";
import type { PartMesh } from "../core/mesh";
import type { ElementType, Variant } from "../core/track";
import type { Fits, Vehicle } from "../core/vehicle";
import { createEngine } from "../geometry/engine";
import type { VehicleMeshes } from "../geometry/engine";
import type { TrackOptions } from "../geometry/track";

export type WorkerRequest =
  | { id: number; op: "element" | "printElement"; type: ElementType; variant: Variant; options: TrackOptions }
  | { id: number; op: "vehicle"; vehicle: Vehicle; fits: Fits };

export type WorkerResponse = { id: number; ok: true; result: PartMesh | VehicleMeshes } | { id: number; ok: false; error: string };

const engine = createEngine({ locateFile: () => wasmUrl });

const buffers = (p: PartMesh): ArrayBuffer[] => [p.mesh.positions.buffer as ArrayBuffer, p.mesh.indices.buffer as ArrayBuffer];

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const request = event.data;
  try {
    const e = await engine;
    if (request.op === "vehicle") {
      const result = e.vehicle(request.vehicle, request.fits);
      const parts = [result.chassis, result.body, result.wheel, result.axle, result.running, ...(result.accent ? [result.accent] : [])];
      self.postMessage({ id: request.id, ok: true, result } satisfies WorkerResponse, { transfer: parts.flatMap(buffers) });
    } else {
      const result = request.op === "element" ? e.element(request.type, request.variant, request.options) : e.printElement(request.type, request.variant, request.options);
      self.postMessage({ id: request.id, ok: true, result } satisfies WorkerResponse, { transfer: buffers(result) });
    }
  } catch (error) {
    self.postMessage({ id: request.id, ok: false, error: error instanceof Error ? error.message : String(error) } satisfies WorkerResponse);
  }
};
