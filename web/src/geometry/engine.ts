// The geometry engine: parameters in, meshes out. Runs in a worker in the app and directly in the
// tests. Every build frees its manifold objects afterwards (see kernel.ts).
import type { Manifold } from "manifold-3d";
import type { PartMesh } from "../core/mesh";
import type { ElementType, Variant } from "../core/track";
import type { Fits, Vehicle } from "../core/vehicle";
import { createKernel } from "./kernel";
import type { KernelOptions } from "./kernel";
import { buildElement, printFlipped } from "./track";
import type { TrackOptions } from "./track";
import { buildVehicle } from "./vehicle";

export interface VehicleMeshes {
  chassis: PartMesh;
  body: PartMesh;
  accent?: PartMesh;
  wheel: PartMesh;
  axle: PartMesh;
  running: PartMesh;
}

export interface Engine {
  /** the element as it lies in the plan */
  element(type: ElementType, variant: Variant, options: TrackOptions): PartMesh;
  /** the element as it is printed (bridges upside down) */
  printElement(type: ElementType, variant: Variant, options: TrackOptions): PartMesh;
  vehicle(vehicle: Vehicle, fits: Fits): VehicleMeshes;
}

export function summarize(solid: Manifold): PartMesh {
  const box = solid.boundingBox();
  const mesh = solid.getMesh();
  const stride = mesh.numProp;
  const count = mesh.vertProperties.length / stride;
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    positions[i * 3] = mesh.vertProperties[i * stride] as number;
    positions[i * 3 + 1] = mesh.vertProperties[i * stride + 1] as number;
    positions[i * 3 + 2] = mesh.vertProperties[i * stride + 2] as number;
  }
  return {
    mesh: { positions, indices: new Uint32Array(mesh.triVerts) },
    volume: solid.volume(),
    min: [box.min[0], box.min[1], box.min[2]],
    max: [box.max[0], box.max[1], box.max[2]],
    status: String(solid.status()),
  };
}

export async function createEngine(options: KernelOptions = {}): Promise<Engine> {
  const kernel = await createKernel(options);
  const { wasm } = kernel;
  const run = <T>(work: () => T): T => {
    try {
      return work();
    } finally {
      kernel.release();
    }
  };
  return {
    element: (type, variant, opts) => run(() => summarize(buildElement(wasm, type, variant, opts))),
    printElement: (type, variant, opts) =>
      run(() => {
        const solid = buildElement(wasm, type, variant, opts);
        if (!printFlipped(type)) return summarize(solid);
        const top = solid.boundingBox().max[2];
        return summarize(solid.rotate([180, 0, 0]).translate([0, 0, top]));
      }),
    vehicle: (v, fits) =>
      run(() => {
        const s = buildVehicle(wasm, v, fits);
        return {
          chassis: summarize(s.chassis),
          body: summarize(s.body),
          ...(s.accent ? { accent: summarize(s.accent) } : {}),
          wheel: summarize(s.wheel),
          axle: summarize(s.axle),
          running: summarize(s.running),
        };
      }),
  };
}
