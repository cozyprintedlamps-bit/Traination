// Stations, platforms, tunnels and small buildings beside (or over) the track. They are placed
// freely in the plan (position and turn) and printed as separate parts: the building and its roof
// parts plug together.
import { CURVE_ANGLE, CURVE_LARGE_RADIUS, TRACK_HEIGHT } from "../presets/gauge";
import { VEHICLE_WIDTH } from "../presets/vehicle";
import { rotate } from "./layout";
import { newId } from "./track";

export type BuildingKind =
  | "station"
  | "station_town"
  | "station_halt"
  | "station_hall"
  | "platform"
  | "platform_roof"
  | "platform_island"
  | "tunnel"
  | "tunnel_curve"
  | "portal"
  | "signalbox"
  | "watertower"
  | "shed"
  | "signal"
  | "house"
  | "plate_lego"
  | "plate_duplo";

/** Groups of buildings for the page. */
export type BuildingCategory = "stations" | "platforms" | "tunnels" | "railway" | "town";
export const BUILDING_CATEGORIES: Readonly<Record<BuildingCategory, readonly BuildingKind[]>> = {
  stations: ["station", "station_town", "station_halt", "station_hall"],
  platforms: ["platform", "platform_roof", "platform_island"],
  tunnels: ["tunnel", "tunnel_curve", "portal"],
  railway: ["signalbox", "watertower", "shed", "signal"],
  town: ["house", "plate_lego", "plate_duplo"],
};
export const BUILDING_CATEGORY_IDS = Object.keys(BUILDING_CATEGORIES) as BuildingCategory[];
export const BUILDING_KINDS: readonly BuildingKind[] = BUILDING_CATEGORY_IDS.flatMap((c) => BUILDING_CATEGORIES[c]);

/** Buildings that stand over the track (the train runs through them): they are not moved off it. */
export const OVER_TRACK: ReadonlySet<BuildingKind> = new Set(["shed", "tunnel", "tunnel_curve", "portal", "station_hall"]);
/** Buildings with a sign for a name. */
export const HAS_SIGN: ReadonlySet<BuildingKind> = new Set(["station", "station_town", "station_halt", "house", "signalbox"]);
/** Stud plates: their height is the plate of the system, the size snaps to the stud grid. */
export const IS_PLATE: ReadonlySet<BuildingKind> = new Set(["plate_lego", "plate_duplo"]);
/** Buildings without a roof colour of their own. */
export const NO_ROOF: ReadonlySet<BuildingKind> = new Set(["platform", "platform_island", "signal", "plate_lego", "plate_duplo", "tunnel", "tunnel_curve", "portal"]);

export interface BuildingColors {
  walls: string;
  roof: string;
  /** doors, windows frames, signal lamps, platform edge, tunnel portals */
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
  /** placed by a ready-made track; it is replaced when another one is chosen, until the user changes it */
  fromTemplate?: boolean;
}

const GREY = "#8E9089";
const WHITE = "#FFFFFF";
const DARK = "#545454";
const GREEN = "#3F8E43";

const DEFAULTS: Record<BuildingKind, { length: number; width: number; height: number; colors: BuildingColors }> = {
  station: { length: 160, width: 60, height: 50, colors: { walls: "#F7E6DE", roof: "#9D2235", details: GREEN } },
  station_town: { length: 200, width: 70, height: 116, colors: { walls: "#F7E6DE", roof: DARK, details: "#9D2235" } },
  station_halt: { length: 100, width: 44, height: 46, colors: { walls: "#6F5034", roof: "#C12E1F", details: WHITE } },
  station_hall: { length: 216, width: 120, height: 136, colors: { walls: "#9D432C", roof: GREY, details: WHITE } },
  platform: { length: 216, width: 40, height: 20, colors: { walls: GREY, roof: GREY, details: WHITE } },
  platform_roof: { length: 216, width: 44, height: 64, colors: { walls: GREY, roof: GREEN, details: WHITE } },
  platform_island: { length: 216, width: 56, height: 20, colors: { walls: GREY, roof: GREY, details: WHITE } },
  tunnel: { length: 144, width: 110, height: 100, colors: { walls: GREEN, roof: GREEN, details: GREY } },
  tunnel_curve: { length: 143, width: 110, height: 100, colors: { walls: GREEN, roof: GREEN, details: GREY } },
  portal: { length: 30, width: 110, height: 104, colors: { walls: GREY, roof: GREY, details: DARK } },
  signalbox: { length: 50, width: 40, height: 60, colors: { walls: "#9D432C", roof: DARK, details: WHITE } },
  watertower: { length: 50, width: 50, height: 90, colors: { walls: "#6F5034", roof: DARK, details: "#0086D6" } },
  shed: { length: 200, width: 80, height: 120, colors: { walls: "#9D432C", roof: DARK, details: WHITE } },
  signal: { length: 20, width: 20, height: 80, colors: { walls: DARK, roof: "#000000", details: "#C12E1F" } },
  house: { length: 60, width: 50, height: 45, colors: { walls: "#F4EE2A", roof: "#C12E1F", details: WHITE } },
  plate_lego: { length: 128, width: 64, height: 3.2, colors: { walls: GREEN, roof: GREEN, details: GREEN } },
  plate_duplo: { length: 128, width: 64, height: 4.8, colors: { walls: GREEN, roof: GREEN, details: GREEN } },
};

/** Limits of the size fields. */
export const BUILDING_LIMITS: Record<BuildingKind, { length: [number, number]; width: [number, number]; height: [number, number] }> = {
  station: { length: [100, 250], width: [50, 120], height: [40, 90] },
  station_town: { length: [150, 250], width: [56, 110], height: [100, 150] },
  station_halt: { length: [60, 200], width: [36, 70], height: [36, 70] },
  station_hall: { length: [100, 250], width: [80, 160], height: [120, 200] },
  platform: { length: [54, 250], width: [24, 100], height: [12, 40] },
  platform_roof: { length: [100, 250], width: [36, 90], height: [50, 90] },
  platform_island: { length: [54, 250], width: [40, 120], height: [12, 40] },
  tunnel: { length: [60, 250], width: [90, 180], height: [96, 150] },
  tunnel_curve: { length: [143, 143], width: [90, 180], height: [96, 150] },
  portal: { length: [20, 60], width: [90, 180], height: [96, 150] },
  signalbox: { length: [40, 100], width: [36, 80], height: [45, 100] },
  watertower: { length: [40, 80], width: [40, 80], height: [60, 140] },
  shed: { length: [120, 240], width: [80, 120], height: [100, 150] },
  signal: { length: [16, 30], width: [16, 30], height: [50, 120] },
  house: { length: [40, 150], width: [40, 120], height: [30, 90] },
  plate_lego: { length: [16, 240], width: [16, 240], height: [3.2, 3.2] },
  plate_duplo: { length: [32, 240], width: [32, 240], height: [4.8, 4.8] },
};

export function makeBuilding(kind: BuildingKind, at: { x: number; y: number; rotation: number } = { x: 0, y: 0, rotation: 0 }): Building {
  const d = DEFAULTS[kind];
  return { id: newId("b"), kind, name: "", ...at, length: d.length, width: d.width, height: d.height, colors: { ...d.colors } };
}

/**
 * The bore of a tunnel (and the opening of a portal and an engine shed): straight walls, then a roof at 45° up to a
 * point, so that it prints without support. Seen from the track: width, height of the walls above
 * the floor. At the side of a vehicle it leaves as much room as a bridge.
 */
export const TUNNEL_BORE = { width: 64, wall: 57 } as const;
/** wall of a tunnel around the bore */
export const TUNNEL_WALL = 2.4;
/** the curved tunnel covers one large standard curve */
export const TUNNEL_CURVE = { radius: CURVE_LARGE_RADIUS, angle: CURVE_ANGLE } as const;

/** Height of the bore above the floor at a distance `y` from its middle. */
export function boreHeight(y: number): number {
  const half = TUNNEL_BORE.width / 2;
  const a = Math.abs(y);
  if (a > half) return 0;
  return TUNNEL_BORE.wall + (half - a);
}

/** Room above the track top in a tunnel for a vehicle of the standard width. */
export const TUNNEL_CLEARANCE = boreHeight(VEHICLE_WIDTH / 2) - TRACK_HEIGHT;

/** The hall over the tracks: the eaves stand at least this high, so that trains pass. */
export const HALL_EAVES = 74;

/** The outline seen from above, in the plan (a curved tunnel follows its arc). */
export function footprint(b: Building): [number, number][] {
  const local: [number, number][] =
    b.kind === "tunnel_curve"
      ? curveBand(b.width)
      : [
          [-b.length / 2, -b.width / 2],
          [b.length / 2, -b.width / 2],
          [b.length / 2, b.width / 2],
          [-b.length / 2, b.width / 2],
        ];
  return local.map(([x, y]) => {
    const [rx, ry] = rotate(x, y, b.rotation);
    return [rx + b.x, ry + b.y] as [number, number];
  });
}

/**
 * The curved tunnel in its own frame: the arc's middle at the origin, heading +X, turning left
 * (centre at (0, R)). Turned by 180° it covers a right-hand curve.
 */
export function curveBand(width: number, steps = 12): [number, number][] {
  const { radius: R, angle } = TUNNEL_CURVE;
  const half = ((angle / 2) * Math.PI) / 180;
  const ring = (r: number) => Array.from({ length: steps + 1 }, (_, i) => -half + (2 * half * i) / steps).map((t) => [r * Math.sin(t), R - r * Math.cos(t)] as [number, number]);
  return [...ring(R + width / 2), ...ring(R - width / 2).reverse()];
}

/** Stud plates snap to the grid of their system. */
export function snapPlate(b: Building): Building {
  if (!IS_PLATE.has(b.kind)) return b;
  const pitch = b.kind === "plate_lego" ? 8 : 16;
  const snap = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Math.round(v / pitch) * pitch));
  const limits = BUILDING_LIMITS[b.kind];
  return { ...b, length: snap(b.length, limits.length[0], limits.length[1]), width: snap(b.width, limits.width[0], limits.width[1]), height: DEFAULTS[b.kind].height };
}
