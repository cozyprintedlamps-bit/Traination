// Vehicles as pure data: kind (in four categories), length, couplers, design and colours, plus
// the sizes derived from the standard. Every vehicle is printed as a chassis (with couplers), a
// body that is pressed onto the chassis, and wheels and axles; roof, chimney, load and other
// main parts can be printed as separate parts in their own colour and plugged on.
//
// Chassis, seen from the front (Z up, Y across):
//   deck       ███████████████████████████   z = deckBottom … deckTop
//   skirt  █ ○ █████ beam █████ ○ █          the wheels (○) sit between beam and skirt
//   the axle runs through skirt, wheel, beam, wheel, skirt
import { DRIVE } from "../presets/cyberbrick";
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

export type VehicleCategory = "loco" | "freight" | "passenger" | "special";
export const CATEGORIES: readonly VehicleCategory[] = ["loco", "freight", "passenger", "special"];

export type VehicleKind =
  | "steam"
  | "tankloco"
  | "diesel"
  | "shunter"
  | "electric"
  | "highspeed"
  | "cyberbrick"
  | "box"
  | "reefer"
  | "tank"
  | "flat"
  | "logs"
  | "container"
  | "hopper"
  | "passenger"
  | "doubledeck"
  | "dining"
  | "tender"
  | "crane"
  | "caboose"
  | "mail";

/** The kinds of every category, in the order the palette shows them. */
export const KINDS_BY_CATEGORY: Readonly<Record<VehicleCategory, readonly VehicleKind[]>> = {
  loco: ["steam", "tankloco", "diesel", "shunter", "electric", "highspeed", "cyberbrick"],
  freight: ["box", "reefer", "tank", "flat", "logs", "container", "hopper"],
  passenger: ["passenger", "doubledeck", "dining"],
  special: ["tender", "crane", "caboose", "mail"],
};

export const VEHICLE_KINDS: readonly VehicleKind[] = CATEGORIES.flatMap((c) => KINDS_BY_CATEGORY[c]);
export const LOCOMOTIVES: ReadonlySet<VehicleKind> = new Set(KINDS_BY_CATEGORY.loco);

export function categoryOf(kind: VehicleKind): VehicleCategory {
  return CATEGORIES.find((c) => KINDS_BY_CATEGORY[c].includes(kind)) ?? "freight";
}

/** magnet: a magnet in a head; hook: a pin pointing up; eye: a plate with a hole that drops over a hook */
export type Coupler = "magnet" | "hook" | "eye" | "none";
export const COUPLERS: readonly Coupler[] = ["magnet", "hook", "eye", "none"];

/** The main parts, each with its own colour. */
export interface VehicleColors {
  chassis: string;
  body: string;
  roof: string;
  /** chimney, dome, pantograph, lamps, buffers, crane */
  details: string;
  /** coal, logs, crates, container */
  load: string;
  /** stripes, dots, stars, lettering */
  decor: string;
  wheels: string;
}
export const COLOR_SLOTS: readonly (keyof VehicleColors)[] = ["body", "roof", "details", "load", "decor", "chassis", "wheels"];

export type Decor = "none" | "stripe" | "rivets" | "dots" | "stars" | "hearts";
export const DECORS: readonly Decor[] = ["none", "stripe", "rivets", "dots", "stars", "hearts"];

export interface VehicleDesign {
  /** window recesses in cab or walls */
  windows: boolean;
  /** steam locomotives */
  chimney: "tall" | "short" | "funnel" | "none";
  /** steam locomotives, tank wagon */
  dome: boolean;
  /** roof shape of cabs, box and passenger wagons */
  roof: "round" | "flat" | "peaked";
  /** wagons that carry something */
  load: boolean;
  /** body height above the deck (mm); 0 = the kind's default */
  height: number;
  /** pattern on the sides */
  decor: Decor;
  /** a friendly face on the front of a locomotive */
  face: boolean;
  /** headlamps at the front of locomotives */
  lamps: boolean;
  /** buffers at both ends */
  buffers: boolean;
  /** a cow catcher at the front (steam locomotives) */
  cowcatcher: boolean;
  /** name or number on both sides (A–Z, 0–9, up to 10 characters) */
  lettering: string;
  /** print roof, chimney, load … as separate parts that plug on (otherwise one part with several filaments) */
  split: boolean;
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

export const DEFAULT_DESIGN: VehicleDesign = {
  windows: true,
  chimney: "tall",
  dome: true,
  roof: "round",
  load: true,
  height: 0,
  decor: "none",
  face: false,
  lamps: true,
  buffers: true,
  cowcatcher: true,
  lettering: "",
  split: true,
};

const c = (chassis: string, body: string, roof: string, details: string, load: string, decor: string, wheels: string): VehicleColors => ({ chassis, body, roof, details, load, decor, wheels });
const BLACK = "#000000";
const GREY = "#545454";
const SILVER = "#A6A9AA";
const WHITE = "#FFFFFF";
const GOLD = "#E4BD68";
const YELLOW = "#F4EE2A";
const RED = "#C12E1F";

const KIND_DEFAULTS: Record<VehicleKind, { length: number; height: number; colors: VehicleColors }> = {
  steam: { length: 110, height: 34, colors: c(BLACK, RED, BLACK, BLACK, BLACK, GOLD, GOLD) },
  tankloco: { length: 100, height: 32, colors: c(BLACK, "#3F8E43", BLACK, BLACK, BLACK, GOLD, RED) },
  diesel: { length: 110, height: 30, colors: c(GREY, YELLOW, GREY, GREY, BLACK, BLACK, BLACK) },
  shunter: { length: 80, height: 30, colors: c(GREY, "#FF6A13", GREY, BLACK, BLACK, YELLOW, BLACK) },
  electric: { length: 120, height: 30, colors: c(GREY, "#0056B8", SILVER, SILVER, BLACK, WHITE, BLACK) },
  highspeed: { length: 140, height: 30, colors: c(GREY, WHITE, WHITE, SILVER, BLACK, RED, BLACK) },
  cyberbrick: { length: 150, height: 34, colors: c(GREY, "#00B1B7", "#545454", BLACK, BLACK, WHITE, BLACK) },
  box: { length: 80, height: 28, colors: c(GREY, "#9D432C", "#D1D3D5", GREY, BLACK, WHITE, BLACK) },
  reefer: { length: 80, height: 28, colors: c(GREY, WHITE, SILVER, GREY, BLACK, "#0086D6", BLACK) },
  tank: { length: 80, height: 24, colors: c(GREY, WHITE, GREY, GREY, BLACK, RED, BLACK) },
  flat: { length: 80, height: 14, colors: c(GREY, "#6F5034", GREY, "#00AE42", "#00AE42", WHITE, BLACK) },
  logs: { length: 90, height: 18, colors: c(GREY, "#6F5034", GREY, BLACK, "#AE835B", WHITE, BLACK) },
  container: { length: 100, height: 24, colors: c(GREY, "#545454", GREY, GREY, "#0056B8", WHITE, BLACK) },
  hopper: { length: 72, height: 22, colors: c(GREY, "#8E9089", GREY, BLACK, BLACK, WHITE, BLACK) },
  passenger: { length: 100, height: 30, colors: c(GREY, "#3F8E43", "#D1D3D5", GREY, BLACK, YELLOW, BLACK) },
  doubledeck: { length: 110, height: 40, colors: c(GREY, RED, "#D1D3D5", GREY, BLACK, WHITE, BLACK) },
  dining: { length: 100, height: 30, colors: c(GREY, "#9D2235", "#D1D3D5", GOLD, BLACK, GOLD, BLACK) },
  tender: { length: 64, height: 20, colors: c(BLACK, RED, BLACK, BLACK, BLACK, GOLD, GOLD) },
  crane: { length: 90, height: 14, colors: c(GREY, YELLOW, GREY, RED, GREY, BLACK, BLACK) },
  caboose: { length: 72, height: 28, colors: c(GREY, RED, BLACK, BLACK, BLACK, WHITE, BLACK) },
  mail: { length: 90, height: 28, colors: c(GREY, YELLOW, "#D1D3D5", GREY, BLACK, BLACK, BLACK) },
};

/** Vehicles that carry a load; locomotives that can have a chimney and so on (for the design page). */
export const HAS_LOAD: ReadonlySet<VehicleKind> = new Set(["tender", "flat", "logs", "container", "hopper", "crane"]);
export const HAS_ROOF: ReadonlySet<VehicleKind> = new Set(["steam", "tankloco", "diesel", "shunter", "electric", "highspeed", "cyberbrick", "box", "reefer", "passenger", "doubledeck", "dining", "caboose", "mail"]);
export const HAS_WINDOWS: ReadonlySet<VehicleKind> = new Set(["steam", "tankloco", "diesel", "shunter", "electric", "highspeed", "cyberbrick", "passenger", "doubledeck", "dining", "caboose", "mail"]);
export const HAS_CHIMNEY: ReadonlySet<VehicleKind> = new Set(["steam", "tankloco"]);
export const HAS_DOME: ReadonlySet<VehicleKind> = new Set(["steam", "tankloco", "tank"]);

export function makeVehicle(kind: VehicleKind, patch: Partial<Vehicle> = {}): Vehicle {
  const d = KIND_DEFAULTS[kind];
  const loco = LOCOMOTIVES.has(kind);
  return {
    id: newId("v"),
    name: "",
    kind,
    length: d.length,
    axles: 2,
    front: "magnet",
    rear: "magnet",
    magnet: { ...DEFAULT_MAGNET },
    design: { ...DEFAULT_DESIGN, lamps: loco, cowcatcher: kind === "steam" || kind === "tankloco", buffers: kind !== "highspeed" },
    colors: { ...d.colors },
    ...patch,
  };
}

/** A new kind keeps length and colours only if the user changed them from the old kind's default. */
export function changeKind(vehicle: Vehicle, kind: VehicleKind): Vehicle {
  const old = KIND_DEFAULTS[vehicle.kind];
  const next = KIND_DEFAULTS[kind];
  const sameColors = JSON.stringify(vehicle.colors) === JSON.stringify(old.colors);
  const loco = LOCOMOTIVES.has(kind);
  return {
    ...vehicle,
    kind,
    length: vehicle.length === old.length ? next.length : vehicle.length,
    axles: kind === "cyberbrick" ? 2 : vehicle.axles,
    colors: sameColors ? { ...next.colors } : vehicle.colors,
    design: { ...vehicle.design, lamps: loco ? vehicle.design.lamps || !LOCOMOTIVES.has(vehicle.kind) : false },
  };
}

export const bodyHeight = (v: Vehicle) => (v.design.height > 0 ? v.design.height : KIND_DEFAULTS[v.kind].height);
export const defaultLength = (kind: VehicleKind) => KIND_DEFAULTS[kind].length;
export const defaultColors = (kind: VehicleKind): VehicleColors => ({ ...KIND_DEFAULTS[kind].colors });

// ------------------------------------------------------------------------------ derived sizes

export interface Fits {
  axle: number;
  wheelPress: number;
  magnet: number;
}

export const DEFAULT_FITS: Fits = { axle: DEFAULT_AXLE_FIT, wheelPress: DEFAULT_WHEEL_PRESS, magnet: DEFAULT_MAGNET_FIT };

export interface AxleSizes {
  x: number;
  /** wheel radius on this axle */
  radius: number;
  /** height of the axle above the bottom of the chassis */
  z: number;
  /** driven by the motor (CyberBrick) */
  driven: boolean;
}

/** Every size of the chassis, from the standard (Z = 0 at the bottom of the chassis). */
export interface ChassisSizes {
  length: number;
  width: number;
  axles: AxleSizes[];
  /** the plain axles: height and wheel radius */
  axleZ: number;
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

/** A wheel reaches down to the bottom of the groove; the chassis keeps TRACK_CLEARANCE above the track top. */
const axleHeight = (radius: number) => radius - GROOVE_DEPTH - TRACK_CLEARANCE;

export function chassisSizes(v: Vehicle, fits: Fits = DEFAULT_FITS): ChassisSizes {
  const r = WHEEL_DIAMETER / 2;
  const reach = v.length / 2 - AXLE_END_DISTANCE;
  let axles: AxleSizes[];
  if (v.kind === "cyberbrick") {
    const big = DRIVE.drivenWheelDiameter / 2;
    axles = [
      { x: v.length / 2 - big - 8, radius: big, z: axleHeight(big), driven: true },
      { x: -reach, radius: r, z: axleHeight(r), driven: false },
    ];
  } else {
    const xs = v.axles === 3 ? [reach, 0, -reach] : [reach, -reach];
    axles = xs.map((x) => ({ x, radius: r, z: axleHeight(r), driven: false }));
  }
  const deckBottom = Math.max(...axles.map((a) => a.z + a.radius)) + WHEEL_TOP_GAP;
  return {
    length: v.length,
    width: VEHICLE_WIDTH,
    axles,
    axleZ: axleHeight(r),
    wheelRadius: r,
    beamHalf: WHEEL_SPACING / 2 - WHEEL_WIDTH / 2 - WHEEL_SIDE_GAP,
    skirtInner: WHEEL_SPACING / 2 + WHEEL_WIDTH / 2 + WHEEL_SIDE_GAP,
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

/** The CyberBrick locomotive needs room for motor, shield and battery. */
export const CYBERBRICK_MIN_LENGTH = 140;

export type VehicleIssue =
  | { code: "length"; min: number; max: number }
  | { code: "magnet_too_big"; max: number }
  | { code: "magnet_too_deep"; max: number }
  | { code: "too_tall"; height: number; limit: number }
  | { code: "couplers_mixed" }
  | { code: "cyberbrick_length"; min: number };

export function vehicleIssues(v: Vehicle, clearance: number, fits: Fits = DEFAULT_FITS): VehicleIssue[] {
  const issues: VehicleIssue[] = [];
  if (v.length < VEHICLE_MIN_LENGTH || v.length > VEHICLE_MAX_LENGTH) issues.push({ code: "length", min: VEHICLE_MIN_LENGTH, max: VEHICLE_MAX_LENGTH });
  if (v.kind === "cyberbrick" && v.length < CYBERBRICK_MIN_LENGTH) issues.push({ code: "cyberbrick_length", min: CYBERBRICK_MIN_LENGTH });
  const c = couplerSizes(v, fits);
  const ch = chassisSizes(v, fits);
  const usesMagnet = v.front === "magnet" || v.rear === "magnet";
  if (usesMagnet) {
    const room = Math.min(2 * Math.min(c.centerZ, ch.deckTop - c.centerZ), c.headWidth);
    const maxDiameter = room - 2 * MIN_WALL - fits.magnet;
    if (v.magnet.diameter > maxDiameter) issues.push({ code: "magnet_too_big", max: Math.floor(maxDiameter * 10) / 10 });
    if (c.pocketDepth > c.reach - MIN_WALL) issues.push({ code: "magnet_too_deep", max: c.reach - MIN_WALL - fits.magnet });
  }
  const height = vehicleHeight(v);
  if (height > clearance) issues.push({ code: "too_tall", height: Math.round(height), limit: clearance });
  const kinds = new Set([v.front, v.rear].filter((x) => x !== "none").map((x) => (x === "magnet" ? "magnet" : "hook")));
  if (kinds.size > 1) issues.push({ code: "couplers_mixed" });
  return issues;
}

/** Highest point of a vehicle above the track top (mm), without small details on the roof. */
export const vehicleHeight = (v: Vehicle) => chassisSizes(v).deckTop + bodyHeight(v) + TRACK_CLEARANCE;

/** Letters the lettering can show. */
export const LETTERING_MAX = 10;
export const cleanLettering = (text: string) =>
  text
    .toUpperCase()
    .replace(/[ÄÖÜ]/g, (m) => ({ Ä: "AE", Ö: "OE", Ü: "UE" })[m] ?? m)
    .replace(/[^A-Z0-9 .\-!]/g, "")
    .slice(0, LETTERING_MAX);
