// What a project prints: track parts (with their counts from the parts list) and the supports
// under raised track; per vehicle its chassis, body (with coloured volumes or separate parts),
// wheels, axles and drive gears; per building its base and roof. Meshes come from the engine
// (worker or direct).
import type { Building } from "../core/buildings";
import { analyze, partsList } from "../core/layout";
import type { PartMesh } from "../core/mesh";
import type { Project } from "../core/project";
import { supportParts, supports } from "../core/supports";
import type { ElementType, Variant } from "../core/track";
import type { Fits, Vehicle } from "../core/vehicle";
import type { BuildingMeshes, VehicleMeshes } from "../geometry/engine";
import type { TrackOptions } from "../geometry/track";
import type { SlotKey } from "../geometry/vehicle";
import type { PrintItem } from "./plates";

type MaybePromise<T> = T | Promise<T>;

export interface MeshSource {
  printElement(type: ElementType, variant: Variant, options: TrackOptions): MaybePromise<PartMesh>;
  support(height: number, plain: boolean): MaybePromise<PartMesh>;
  vehicle(vehicle: Vehicle, fits: Fits): MaybePromise<VehicleMeshes>;
  building(building: Building): MaybePromise<BuildingMeshes>;
}

export type PartName = "chassis" | "body" | "wheel" | "axle" | "worm" | "wormWheel" | "support" | "base" | SlotKey;

export interface Names {
  element(type: ElementType, variant: Variant): string;
  vehicle(vehicle: Vehicle, index: number): string;
  building(building: Building, index: number): string;
  part(part: PartName): string;
}

export const trackOptions = (project: Project): TrackOptions => ({ doubleSided: project.settings.doubleSided, connectorFit: project.settings.connectorFit, sleepers: project.settings.sleepers !== false });

export async function trackItems(project: Project, source: MeshSource, names: Names): Promise<PrintItem[]> {
  const typeOf = new Map(project.elements.map((e) => [e.id, e]));
  const items: PrintItem[] = [];
  for (const entry of partsList(project.layout, project.elements, project.settings.doubleSided)) {
    const type = typeOf.get(entry.type);
    if (!type) continue;
    const part = await source.printElement(type, entry.variant, trackOptions(project));
    items.push({ name: names.element(type, entry.variant), color: type.color, part, count: entry.count });
  }
  const color = project.elements[0]?.color ?? "#8E9089";
  for (const s of supportParts(supports(project.layout, project.elements, analyze(project.layout, project.elements)))) {
    items.push({ name: `${names.part("support")} ${s.height} mm`, color, part: await source.support(s.height, s.plain), count: s.count });
  }
  return items;
}

/** A part lies on the bed: its flat bottom at Z = 0 (separate parts are modelled in place). */
function onBed(part: PartMesh): PartMesh {
  const dz = part.min[2];
  if (Math.abs(dz) < 1e-6) return part;
  const positions = new Float32Array(part.mesh.positions);
  for (let i = 2; i < positions.length; i += 3) positions[i] = (positions[i] as number) - dz;
  return { ...part, mesh: { positions, indices: part.mesh.indices }, min: [part.min[0], part.min[1], 0], max: [part.max[0], part.max[1], part.max[2] - dz] };
}

export async function vehicleItems(project: Project, source: MeshSource, names: Names): Promise<PrintItem[]> {
  const items: PrintItem[] = [];
  for (const [index, v] of project.vehicles.entries()) {
    const m = await source.vehicle(v, project.settings.fits);
    const name = names.vehicle(v, index);
    const label = (p: PartName) => `${name} – ${names.part(p)}`;
    items.push({ name: label("chassis"), color: v.colors.chassis, part: m.chassis, count: 1 });
    const volumes = m.parts.filter((p) => !p.separate).map((p) => ({ name: label(p.slot), color: v.colors[p.slot], part: p.mesh }));
    items.push({ name: label("body"), color: v.colors.body, part: m.body, count: 1, ...(volumes.length > 0 ? { volumes } : {}) });
    m.parts
      .filter((p) => p.separate)
      .forEach((p) => items.push({ name: label(p.slot), color: v.colors[p.slot], part: onBed(p.mesh), count: 1 }));
    for (const w of m.wheels) items.push({ name: m.wheels.length > 1 ? `${label("wheel")} Ø${w.radius * 2}` : label("wheel"), color: v.colors.wheels, part: w.mesh, count: w.count });
    items.push({ name: label("axle"), color: v.colors.wheels, part: m.axle, count: v.kind === "cyberbrick" ? 2 : v.axles });
    for (const d of m.drive) items.push({ name: label(d.name), color: v.colors.details, part: d.mesh, count: 1 });
  }
  return items;
}

export async function buildingItems(project: Project, source: MeshSource, names: Names): Promise<PrintItem[]> {
  const items: PrintItem[] = [];
  for (const [index, b] of project.buildings.entries()) {
    const m = await source.building(b);
    const name = names.building(b, index);
    items.push({
      name: `${name} – ${names.part("base")}`,
      color: b.colors.walls,
      part: m.base,
      count: 1,
      ...(m.details ? { volumes: [{ name: `${name} – ${names.part("details")}`, color: b.colors.details, part: m.details }] } : {}),
    });
    if (m.roof) items.push({ name: `${name} – ${names.part("roof")}`, color: b.colors.roof, part: onBed(m.roof), count: 1 });
  }
  return items;
}

/** CyberBrick parts to buy for the driven locomotives of the train. */
export function shoppingList(project: Project): number {
  return project.vehicles.filter((v) => v.kind === "cyberbrick").length;
}
