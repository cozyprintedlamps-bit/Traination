// The geometry engine: parameters in, meshes out. Runs in a worker in the app and directly in the
// tests. Every build frees its manifold objects afterwards (see kernel.ts).
import type { Manifold } from "manifold-3d";
import type { Building } from "../core/buildings";
import { printedMaterial } from "../core/material";
import type { PartMesh } from "../core/mesh";
import type { ElementType, Variant } from "../core/track";
import type { Fits, Vehicle } from "../core/vehicle";
import { buildBuilding } from "./buildings";
import { createKernel } from "./kernel";
import type { KernelOptions } from "./kernel";
import { buildElement, buildSupport, printFlipped } from "./track";
import type { TrackOptions } from "./track";
import { buildVehicle } from "./vehicle";
import type { SlotKey } from "./vehicle";

export interface VehicleMeshes {
  chassis: PartMesh;
  body: PartMesh;
  /** coloured parts: volumes of the body (separate = false) or own print parts on pins */
  parts: { slot: SlotKey; mesh: PartMesh; separate: boolean }[];
  wheels: { radius: number; mesh: PartMesh; count: number }[];
  axle: PartMesh;
  drive: { name: "worm" | "wormWheel"; mesh: PartMesh }[];
  running: PartMesh;
  inside?: PartMesh;
}

export interface BuildingMeshes {
  base: PartMesh;
  roof?: PartMesh;
  details?: PartMesh;
}

export interface Engine {
  /** the element as it lies in the plan */
  element(type: ElementType, variant: Variant, options: TrackOptions): PartMesh;
  /** the element as it is printed (bridges upside down) */
  printElement(type: ElementType, variant: Variant, options: TrackOptions): PartMesh;
  support(height: number, plain: boolean): PartMesh;
  vehicle(vehicle: Vehicle, fits: Fits): VehicleMeshes;
  building(building: Building): BuildingMeshes;
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
  const data = { positions, indices: new Uint32Array(mesh.triVerts) };
  const volume = solid.volume();
  return {
    mesh: data,
    volume,
    material: printedMaterial(data, volume),
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
    support: (height, plain) => run(() => summarize(buildSupport(wasm, height, plain))),
    vehicle: (v, fits) =>
      run(() => {
        const s = buildVehicle(wasm, v, fits);
        return {
          chassis: summarize(s.chassis),
          body: summarize(s.body),
          parts: s.parts.map((p) => ({ slot: p.slot, mesh: summarize(p.solid), separate: p.separate })),
          wheels: s.wheels.map((w) => ({ radius: w.radius, mesh: summarize(w.solid), count: w.count })),
          axle: summarize(s.axle),
          drive: s.drive.map((d) => ({ name: d.name, mesh: summarize(d.solid) })),
          running: summarize(s.running),
          ...(s.inside ? { inside: summarize(s.inside) } : {}),
        };
      }),
    building: (b) =>
      run(() => {
        const s = buildBuilding(wasm, b);
        const base = s.details ? s.base.subtract(s.details) : s.base;
        return {
          base: summarize(base),
          ...(s.roof ? { roof: summarize(s.roof.solid) } : {}),
          ...(s.details ? { details: summarize(s.details) } : {}),
        };
      }),
  };
}

/** Every mesh of a vehicle result (for transferring the buffers out of a worker). */
export function vehicleMeshList(m: VehicleMeshes): PartMesh[] {
  return [m.chassis, m.body, m.axle, m.running, ...m.parts.map((p) => p.mesh), ...m.wheels.map((w) => w.mesh), ...m.drive.map((d) => d.mesh), ...(m.inside ? [m.inside] : [])];
}

export function buildingMeshList(m: BuildingMeshes): PartMesh[] {
  return [m.base, ...(m.roof ? [m.roof] : []), ...(m.details ? [m.details] : [])];
}
