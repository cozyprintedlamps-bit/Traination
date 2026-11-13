// What a project prints: one item per track part (with its count from the parts list) and per
// vehicle its chassis, body, wheels and axles. Meshes come from the engine (worker or direct).
import type { PartMesh } from "../core/mesh";
import { partsList } from "../core/layout";
import type { Project } from "../core/project";
import type { ElementType, Variant } from "../core/track";
import type { Fits, Vehicle } from "../core/vehicle";
import type { VehicleMeshes } from "../geometry/engine";
import type { TrackOptions } from "../geometry/track";
import type { PrintItem } from "./plates";

type MaybePromise<T> = T | Promise<T>;

export interface MeshSource {
  printElement(type: ElementType, variant: Variant, options: TrackOptions): MaybePromise<PartMesh>;
  vehicle(vehicle: Vehicle, fits: Fits): MaybePromise<VehicleMeshes>;
}

export interface Names {
  element(type: ElementType, variant: Variant): string;
  vehicle(vehicle: Vehicle, index: number): string;
  part(part: "chassis" | "body" | "accent" | "wheel" | "axle"): string;
}

export const trackOptions = (project: Project): TrackOptions => ({ doubleSided: project.settings.doubleSided, connectorFit: project.settings.connectorFit });

export async function trackItems(project: Project, source: MeshSource, names: Names): Promise<PrintItem[]> {
  const typeOf = new Map(project.elements.map((e) => [e.id, e]));
  const items: PrintItem[] = [];
  for (const entry of partsList(project.layout, project.elements, project.settings.doubleSided)) {
    const type = typeOf.get(entry.type);
    if (!type) continue;
    const part = await source.printElement(type, entry.variant, trackOptions(project));
    items.push({ name: names.element(type, entry.variant), color: type.color, part, count: entry.count });
  }
  return items;
}

export async function vehicleItems(project: Project, source: MeshSource, names: Names): Promise<PrintItem[]> {
  const items: PrintItem[] = [];
  for (const [index, v] of project.vehicles.entries()) {
    const m = await source.vehicle(v, project.settings.fits);
    const name = names.vehicle(v, index);
    items.push({ name: `${name} – ${names.part("chassis")}`, color: v.colors.chassis, part: m.chassis, count: 1 });
    items.push({
      name: `${name} – ${names.part("body")}`,
      color: v.colors.body,
      part: m.body,
      count: 1,
      ...(m.accent ? { volumes: [{ name: `${name} – ${names.part("accent")}`, color: v.colors.accent, part: m.accent }] } : {}),
    });
    items.push({ name: `${name} – ${names.part("wheel")}`, color: v.colors.wheels, part: m.wheel, count: v.axles * 2 });
    items.push({ name: `${name} – ${names.part("axle")}`, color: v.colors.wheels, part: m.axle, count: v.axles });
  }
  return items;
}
