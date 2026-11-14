// Stations and small buildings beside the track. They are placed freely in the plan (position and
// turn) and printed as separate parts: the building and its roof plug together.
import { rotate } from "./layout";
import { newId } from "./track";

export type BuildingKind = "station" | "platform" | "house" | "signalbox" | "watertower" | "shed" | "signal";
export const BUILDING_KINDS: readonly BuildingKind[] = ["station", "platform", "house", "signalbox", "watertower", "shed", "signal"];

export interface BuildingColors {
  walls: string;
  roof: string;
  /** doors, windows frames, signal lamps, platform edge */
  details: string;
}

export interface Building {
  id: string;
  kind: BuildingKind;
  name: string;
  /** middle of the footprint (mm) and turn (degrees) */
  x: number;
  y: number;
  rotation: number;
  /** along the track */
  length: number;
  /** across */
  width: number;
  height: number;
  colors: BuildingColors;
}

const DEFAULTS: Record<BuildingKind, { length: number; width: number; height: number; colors: BuildingColors }> = {
  station: { length: 160, width: 60, height: 50, colors: { walls: "#F7E6DE", roof: "#9D2235", details: "#3F8E43" } },
  platform: { length: 216, width: 40, height: 20, colors: { walls: "#8E9089", roof: "#8E9089", details: "#FFFFFF" } },
  house: { length: 60, width: 50, height: 45, colors: { walls: "#F4EE2A", roof: "#C12E1F", details: "#FFFFFF" } },
  signalbox: { length: 50, width: 40, height: 60, colors: { walls: "#9D432C", roof: "#545454", details: "#FFFFFF" } },
  watertower: { length: 50, width: 50, height: 90, colors: { walls: "#6F5034", roof: "#545454", details: "#0086D6" } },
  shed: { length: 200, width: 72, height: 78, colors: { walls: "#9D432C", roof: "#545454", details: "#FFFFFF" } },
  signal: { length: 20, width: 20, height: 80, colors: { walls: "#545454", roof: "#000000", details: "#C12E1F" } },
};

/** Limits of the size fields. */
export const BUILDING_LIMITS: Record<BuildingKind, { length: [number, number]; width: [number, number]; height: [number, number] }> = {
  station: { length: [100, 250], width: [50, 120], height: [40, 90] },
  platform: { length: [54, 250], width: [24, 100], height: [12, 40] },
  house: { length: [40, 150], width: [40, 120], height: [30, 90] },
  signalbox: { length: [40, 100], width: [36, 80], height: [45, 100] },
  watertower: { length: [40, 80], width: [40, 80], height: [60, 140] },
  shed: { length: [120, 240], width: [64, 120], height: [70, 110] },
  signal: { length: [16, 30], width: [16, 30], height: [50, 120] },
};

export function makeBuilding(kind: BuildingKind, at: { x: number; y: number; rotation: number } = { x: 0, y: 0, rotation: 0 }): Building {
  const d = DEFAULTS[kind];
  return { id: newId("b"), kind, name: "", ...at, length: d.length, width: d.width, height: d.height, colors: { ...d.colors } };
}

/** The four corners of the footprint, in the plan. */
export function footprint(b: Building): [number, number][] {
  return [
    [-b.length / 2, -b.width / 2],
    [b.length / 2, -b.width / 2],
    [b.length / 2, b.width / 2],
    [-b.length / 2, b.width / 2],
  ].map(([x, y]) => {
    const [rx, ry] = rotate(x as number, y as number, b.rotation);
    return [rx + b.x, ry + b.y] as [number, number];
  });
}

/** The engine shed is built over a track: its opening. */
export const SHED_OPENING = { width: 56, height: 66 } as const;
