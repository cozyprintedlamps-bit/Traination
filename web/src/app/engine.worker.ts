// The geometry engine in a Web Worker: the page stays responsive while parts are built.
import wasmUrl from "manifold-3d/manifold.wasm?url";
import type { Building } from "../core/buildings";
import type { PartMesh } from "../core/mesh";
import type { ElementType, Variant } from "../core/track";
import type { Fits, Vehicle } from "../core/vehicle";
import { buildingMeshList, createEngine, vehicleMeshList } from "../geometry/engine";
import type { BuildingMeshes, VehicleMeshes } from "../geometry/engine";
import type { TrackOptions } from "../geometry/track";

export type WorkerRequest =
  | { id: number; op: "element" | "printElement"; type: ElementType; variant: Variant; options: TrackOptions }
  | { id: number; op: "slider"; type: ElementType; variant: Variant }
  | { id: number; op: "vehicle"; vehicle: Vehicle; fits: Fits }
  | { id: number; op: "support"; height: number; plain: boolean }
  | { id: number; op: "building"; building: Building };

export type WorkerResponse = { id: number; ok: true; result: PartMesh | VehicleMeshes | BuildingMeshes } | { id: number; ok: false; error: string };

const engine = createEngine({ locateFile: () => wasmUrl });

const buffers = (list: PartMesh[]): ArrayBuffer[] => list.flatMap((p) => [p.mesh.positions.buffer as ArrayBuffer, p.mesh.indices.buffer as ArrayBuffer]);

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const request = event.data;
  try {
    const e = await engine;
    switch (request.op) {
      case "vehicle": {
        const result = e.vehicle(request.vehicle, request.fits);
        self.postMessage({ id: request.id, ok: true, result } satisfies WorkerResponse, { transfer: buffers(vehicleMeshList(result)) });
        break;
      }
      case "building": {
        const result = e.building(request.building);
        self.postMessage({ id: request.id, ok: true, result } satisfies WorkerResponse, { transfer: buffers(buildingMeshList(result)) });
        break;
      }
      case "slider": {
        const result = e.slider(request.type, request.variant);
        self.postMessage({ id: request.id, ok: true, result } satisfies WorkerResponse, { transfer: buffers([result]) });
        break;
      }
      case "support": {
        const result = e.support(request.height, request.plain);
        self.postMessage({ id: request.id, ok: true, result } satisfies WorkerResponse, { transfer: buffers([result]) });
        break;
      }
      default: {
        const result = request.op === "element" ? e.element(request.type, request.variant, request.options) : e.printElement(request.type, request.variant, request.options);
        self.postMessage({ id: request.id, ok: true, result } satisfies WorkerResponse, { transfer: buffers([result]) });
      }
    }
  } catch (error) {
    self.postMessage({ id: request.id, ok: false, error: error instanceof Error ? error.message : String(error) } satisfies WorkerResponse);
  }
};
