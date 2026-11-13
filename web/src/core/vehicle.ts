// Vehicles as pure data: kind, length, couplers, design and colours, plus the sizes derived from
// the standard. Every vehicle is printed as a chassis (with couplers), a body that is pressed onto
// the chassis, and wheels and axles.
//
// Chassis, seen from the front (Z up, Y across):
//   deck       ███████████████████████████   z = deckBottom … deckTop
//   skirt  █ ○ █████ beam █████ ○ █          the wheels (○) sit between beam and skirt
//   the axle runs through skirt, wheel, beam, wheel, skirt
import { GROOVE_DEPTH } from "../presets/gauge";
import { DEFAULT_AXLE_FIT, DEFAULT_MAGNET_FIT, DEFAULT_WHEEL_PRESS, MIN_WALL, TRACK_CLEARANCE, WHEEL_SIDE_GAP, WHEEL_TOP_GAP } from "../presets/print";
import {
  AXLE_DIAMETER,
  AXLE_END_DISTANCE,
  COUPLER_ARM_THICKNESS,
  COUPLER_ARM_WIDTH,
  COUPLER_HEIGHT,
  COUPLER_REACH,
  DECK_THICKNESS,
  DEFAULT_MAGNET,
  HOOK_EYE_FIT,
  HOOK_PIN_DIAMETER,
  HOOK_PIN_HEIGHT,
  VEHICLE_MAX_LENGTH,
  VEHICLE_MIN_LENGTH,
  VEHICLE_WIDTH,
  WHEEL_DIAMETER,
  WHEEL_SPACING,
  WHEEL_WIDTH,
} from "../presets/vehicle";
import type { MagnetSize } from "../presets/vehicle";
import { newId } from "./track";

export type VehicleKind = "steam" | "diesel" | "electric" | "tender" | "box" | "tank" | "flat" | "passenger" | "hopper";
export const VEHICLE_KINDS: readonly VehicleKind[] = ["steam", "diesel", "electric", "tender", "box", "tank", "flat", "passenger", "hopper"];
export const LOCOMOTIVES: ReadonlySet<VehicleKind> = new Set(["steam", "diesel", "electric"]);

/** magnet: a magnet in a head; hook: a pin pointing up; eye: a plate with a hole that drops over a hook */
export type Coupler = "magnet" | "hook" | "eye" | "none";
export const COUPLERS: readonly Coupler[] = ["magnet", "hook", "eye", "none"];

export interface VehicleColors {
  chassis: string;
  body: string;
  /** roof, chimney, dome, load */
  accent: string;
  wheels: string;
}

export interface VehicleDesign {
  /** window recesses in cab or walls */
  windows: boolean;
  /** steam locomotive */
  chimney: "tall" | "short" | "none";
  /** steam locomotive, tank wagon */
  dome: boolean;
  /** roof shape of cabs, box and passenger wagons */
  roof: "round" | "flat";
  /** flat wagon, tender, hopper: carries a load */
  load: boolean;
  /** body height above the deck (mm); 0 = the kind's default */
  height: number;
}

export interface Vehicle {
  id: string;
  name: string;
  kind: VehicleKind;
  /** over the vehicle body, without couplers (mm) */
  length: number;
  axles: 2 | 3;
  /** coupler at the front (+X) and at the rear */
  front: Coupler;
  rear: Coupler;
  magnet: MagnetSize;
  design: VehicleDesign;
  colors: VehicleColors;
}

export const DEFAULT_DESIGN: VehicleDesign = { windows: true, chimney: "tall", dome: true, roof: "round", load: true, height: 0 };

const KIND_DEFAULTS: Record<VehicleKind, { length: number; height: number; colors: VehicleColors }> = {
  steam: { length: 110, height: 34, colors: { chassis: "#000000", body: "#C12E1F", accent: "#000000", wheels: "#E4BD68" } },
  diesel: { length: 110, height: 30, colors: { chassis: "#545454", body: "#F4EE2A", accent: "#545454", wheels: "#000000" } },
  electric: { length: 120, height: 30, colors: { chassis: "#545454", body: "#0056B8", accent: "#A6A9AA", wheels: "#000000" } },
  tender: { length: 64, height: 20, colors: { chassis: "#000000", body: "#C12E1F", accent: "#000000", wheels: "#E4BD68" } },
  box: { length: 80, height: 28, colors: { chassis: "#545454", body: "#9D432C", accent: "#D1D3D5", wheels: "#000000" } },
  tank: { length: 80, height: 24, colors: { chassis: "#545454", body: "#FFFFFF", accent: "#545454", wheels: "#000000" } },
  flat: { length: 80, height: 14, colors: { chassis: "#545454", body: "#6F5034", accent: "#00AE42", wheels: "#000000" } },
  passenger: { length: 100, height: 30, colors: { chassis: "#545454", body: "#3F8E43", accent: "#D1D3D5", wheels: "#000000" } },
  hopper: { length: 72, height: 22, colors: { chassis: "#545454", body: "#8E9089", accent: "#000000", wheels: "#000000" } },
};

export function makeVehicle(kind: VehicleKind, patch: Partial<Vehicle> = {}): Vehicle {
  const d = KIND_DEFAULTS[kind];
  return {
    id: newId("v"),
    name: "",
    kind,
    length: d.length,
    axles: 2,
    front: "magnet",
    rear: "magnet",
    magnet: { ...DEFAULT_MAGNET },
    design: { ...DEFAULT_DESIGN },
    colors: { ...d.colors },
    ...patch,
  };
}

/** A new kind keeps length and colours only if the user changed them from the old kind's default. */
export function changeKind(vehicle: Vehicle, kind: VehicleKind): Vehicle {
  const old = KIND_DEFAULTS[vehicle.kind];
  const next = KIND_DEFAULTS[kind];
  const sameColors = JSON.stringify(vehicle.colors) === JSON.stringify(old.colors);
  return {
    ...vehicle,
    kind,
    length: vehicle.length === old.length ? next.length : vehicle.length,
    colors: sameColors ? { ...next.colors } : vehicle.colors,
  };
}

export const bodyHeight = (v: Vehicle) => (v.design.height > 0 ? v.design.height : KIND_DEFAULTS[v.kind].height);

// ------------------------------------------------------------------------------ derived sizes

export interface Fits {
  axle: number;
  wheelPress: number;
  magnet: number;
}

export const DEFAULT_FITS: Fits = { axle: DEFAULT_AXLE_FIT, wheelPress: DEFAULT_WHEEL_PRESS, magnet: DEFAULT_MAGNET_FIT };

/** Every size of the chassis, from the standard (Z = 0 at the bottom of the chassis). */
export interface ChassisSizes {
  length: number;
  width: number;
  axleZ: number;
  axleX: number[];
  wheelRadius: number;
  /** half width of the beam between the wheels */
  beamHalf: number;
  /** inner face of the skirt */
  skirtInner: number;
  deckBottom: number;
  deckTop: number;
  axleHole: number;
  wheelHole: number;
  axleLength: number;
  /** from the bottom of the chassis down to the track top (> 0) */
  trackGap: number;
}

export function chassisSizes(v: Vehicle, fits: Fits = DEFAULT_FITS): ChassisSizes {
  const r = WHEEL_DIAMETER / 2;
  // the wheel reaches down to the bottom of the groove; the chassis keeps TRACK_CLEARANCE above the track top
  const axleZ = r - GROOVE_DEPTH - TRACK_CLEARANCE;
  const deckBottom = axleZ + r + WHEEL_TOP_GAP;
  const reach = v.length / 2 - AXLE_END_DISTANCE;
  const axleX = v.axles === 3 ? [reach, 0, -reach] : [reach, -reach];
  const beamHalf = WHEEL_SPACING / 2 - WHEEL_WIDTH / 2 - WHEEL_SIDE_GAP;
  const skirtInner = WHEEL_SPACING / 2 + WHEEL_WIDTH / 2 + WHEEL_SIDE_GAP;
  return {
    length: v.length,
    width: VEHICLE_WIDTH,
    axleZ,
    axleX,
    wheelRadius: r,
    beamHalf,
    skirtInner,
    deckBottom,
    deckTop: deckBottom + DECK_THICKNESS,
    axleHole: AXLE_DIAMETER + fits.axle,
    wheelHole: AXLE_DIAMETER - fits.wheelPress,
    axleLength: VEHICLE_WIDTH - 1,
    trackGap: TRACK_CLEARANCE,
  };
}

export interface CouplerSizes {
  reach: number;
  /** magnet coupler: head width and the pocket */
  headWidth: number;
  pocketDiameter: number;
  pocketDepth: number;
  centerZ: number;
  /** hook: tongue top, pin; eye: plate and hole */
  hookTop: number;
  pinDiameter: number;
  pinHeight: number;
  eyeBottom: number;
  eyeTop: number;
  eyeHole: number;
  armWidth: number;
}

export function couplerSizes(v: Vehicle, fits: Fits = DEFAULT_FITS): CouplerSizes {
  const hookTop = COUPLER_HEIGHT - 1;
  const eyeBottom = hookTop + 1;
  return {
    reach: COUPLER_REACH,
    headWidth: Math.max(14, v.magnet.diameter + fits.magnet + 2 * MIN_WALL),
    pocketDiameter: v.magnet.diameter + fits.magnet,
    pocketDepth: v.magnet.height + fits.magnet,
    centerZ: COUPLER_HEIGHT,
    hookTop,
    pinDiameter: HOOK_PIN_DIAMETER,
    pinHeight: HOOK_PIN_HEIGHT,
    eyeBottom,
    eyeTop: eyeBottom + COUPLER_ARM_THICKNESS,
    eyeHole: HOOK_PIN_DIAMETER + HOOK_EYE_FIT,
    armWidth: COUPLER_ARM_WIDTH,
  };
}

// ------------------------------------------------------------------------------ checks

export type VehicleIssue =
  | { code: "length"; min: number; max: number }
  | { code: "magnet_too_big"; max: number }
  | { code: "magnet_too_deep"; max: number }
  | { code: "too_tall"; height: number; limit: number }
  | { code: "couplers_mixed" };

export function vehicleIssues(v: Vehicle, clearance: number, fits: Fits = DEFAULT_FITS): VehicleIssue[] {
  const issues: VehicleIssue[] = [];
  if (v.length < VEHICLE_MIN_LENGTH || v.length > VEHICLE_MAX_LENGTH) issues.push({ code: "length", min: VEHICLE_MIN_LENGTH, max: VEHICLE_MAX_LENGTH });
  const c = couplerSizes(v, fits);
  const ch = chassisSizes(v, fits);
  const usesMagnet = v.front === "magnet" || v.rear === "magnet";
  if (usesMagnet) {
    const room = Math.min(2 * Math.min(c.centerZ, ch.deckTop - c.centerZ), c.headWidth);
    const maxDiameter = room - 2 * MIN_WALL - fits.magnet;
    if (v.magnet.diameter > maxDiameter) issues.push({ code: "magnet_too_big", max: Math.floor(maxDiameter * 10) / 10 });
    if (c.pocketDepth > c.reach - MIN_WALL) issues.push({ code: "magnet_too_deep", max: c.reach - MIN_WALL - fits.magnet });
  }
  const height = ch.deckTop + bodyHeight(v) + ch.trackGap;
  if (height > clearance) issues.push({ code: "too_tall", height: Math.round(height), limit: clearance });
  const kinds = new Set([v.front, v.rear].filter((x) => x !== "none").map((x) => (x === "magnet" ? "magnet" : "hook")));
  if (kinds.size > 1) issues.push({ code: "couplers_mixed" });
  return issues;
}

/** Highest point of a vehicle above the track top (mm). */
export const vehicleHeight = (v: Vehicle) => chassisSizes(v).deckTop + bodyHeight(v) + TRACK_CLEARANCE;
