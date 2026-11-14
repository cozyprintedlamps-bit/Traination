// Track elements as pure data: their centre-line paths and their connectors (ports). No 3D kernel
// here; the geometry builders sweep the track cross-section along these paths.
//
// Local frame of an element: the entry port (port 0) sits at the origin and points outward along
// −X, the track runs along +X. A "left" curve turns counter-clockwise (towards +Y).
import {
  ADAPTER_LENGTH,
  BRIDGE_HEIGHT,
  BUFFER_BLOCK_LENGTH,
  BUFFER_LENGTH,
  CURVE_ANGLE,
  CURVE_LARGE_RADIUS,
  CROSSING_LENGTH,
  CURVE_SMALL_RADIUS,
  RAMP_LENGTH,
  RAMP_RISE,
  SLEEPER_GAP,
  SLEEPER_KEEP_FEMALE,
  SLEEPER_KEEP_MALE,
  SLEEPER_PITCH,
  STRAIGHT_LENGTHS,
  TRACK_WIDTH,
} from "../presets/gauge";
import { ledgeWidth, maxRows } from "../presets/bricks";
import type { StudKind } from "../presets/bricks";

export type ElementKind = "straight" | "curve" | "switch" | "yswitch" | "crossing" | "ramp" | "bridge" | "buffer" | "adapter";
export type Gender = "male" | "female";

export const ELEMENT_KINDS: readonly ElementKind[] = ["straight", "curve", "switch", "yswitch", "crossing", "ramp", "bridge", "buffer", "adapter"];

/** Groups of kinds for the lists of pieces. */
export type ElementCategory = "straights" | "curves" | "switches" | "levels" | "special";
export const ELEMENT_CATEGORIES: Readonly<Record<ElementCategory, readonly ElementKind[]>> = {
  straights: ["straight"],
  curves: ["curve"],
  switches: ["switch", "yswitch", "crossing"],
  levels: ["ramp", "bridge"],
  special: ["buffer", "adapter"],
};
export const CATEGORY_IDS = Object.keys(ELEMENT_CATEGORIES) as ElementCategory[];
export const categoryOfKind = (kind: ElementKind): ElementCategory => CATEGORY_IDS.find((c) => ELEMENT_CATEGORIES[c].includes(kind)) ?? "special";

/** One ledge with building-brick studs beside the track. */
export interface StudLedge {
  kind: StudKind;
  /** rows of studs */
  rows: number;
}

/** The ledges on the left and the right of the direction of travel (from port 0). */
export interface StudSides {
  left: StudLedge;
  right: StudLedge;
}

export const NO_LEDGE: StudLedge = { kind: "none", rows: 1 };
export const noStuds = (): StudSides => ({ left: { ...NO_LEDGE }, right: { ...NO_LEDGE } });

/** One kind of piece the user can place; its parameters decide the geometry. */
export interface ElementType {
  id: string;
  kind: ElementKind;
  /** own name; empty: the generated name */
  name: string;
  /** "#RRGGBB" */
  color: string;
  /** straight, switch (straight branch), crossing, ramp, bridge, buffer, adapter (mm) */
  length: number;
  /** curve, switch, yswitch (mm, centre line) */
  radius: number;
  /** curve, switch, yswitch (degrees) */
  angle: number;
  /** ramp: height at the low end (mm), bridge: height of the deck (mm) */
  height: number;
  /** ramp: how much it climbs (mm) */
  rise: number;
  /** crossing: angle between the two tracks (degrees) */
  crossAngle: number;
  /** switch: to which side the branch turns */
  hand: "left" | "right";
  /** adapter: both ends male or both female */
  adapter: Gender;
  /** ledges with building-brick studs beside the track (straight, curve, buffer stop), each side its own */
  studs: StudSides;
  /** switch, Y-switch: a slider with a blade and a knob sets the route (separate print part) */
  lever: boolean;
}

/** How a piece is used: mirrored (a left curve becomes a right one) and/or with its genders swapped. */
export interface Variant {
  mirror: boolean;
  swap: boolean;
}

export const PLAIN: Variant = { mirror: false, swap: false };

export interface Port {
  x: number;
  y: number;
  /** height of the track bottom at this end (mm) */
  z: number;
  /** direction pointing out of the piece (degrees, 0 = +X, counter-clockwise) */
  heading: number;
  gender: Gender;
}

export type Path =
  | { kind: "line"; x: number; y: number; heading: number; length: number; z0: number; z1: number }
  | { kind: "arc"; x: number; y: number; heading: number; radius: number; sweep: number; z: number };

export interface ElementShape {
  paths: Path[];
  ports: Port[];
}

// ------------------------------------------------------------------------------ defaults

let counter = 0;
export function newId(prefix: string): string {
  counter += 1;
  return `${prefix}${Date.now().toString(36)}${counter.toString(36)}`;
}

const DEFAULTS: Omit<ElementType, "id" | "kind" | "name" | "color" | "studs"> = {
  length: 144,
  radius: CURVE_LARGE_RADIUS,
  angle: CURVE_ANGLE,
  height: 0,
  rise: RAMP_RISE,
  crossAngle: 90,
  hand: "left",
  adapter: "male",
  lever: false,
};

/** Kinds that can carry a stud ledge. */
export const takesStuds = (kind: ElementKind) => kind === "straight" || kind === "curve" || kind === "buffer";

/** Kinds that can be set with a lever. */
export const takesLever = (kind: ElementKind) => kind === "switch" || kind === "yswitch";

/** A ledge as it is built: a known kind, whole rows within the limits. */
function cleanLedge(ledge: StudLedge | undefined): StudLedge {
  const kind = ledge?.kind === "lego" || ledge?.kind === "duplo" ? ledge.kind : "none";
  const rows = Math.min(Math.max(1, Math.round(ledge?.rows ?? 1)), maxRows(kind));
  return { kind, rows };
}

/** The ledges on the left and the right of the track as used (mirroring swaps the sides). */
export function ledgeSides(type: ElementType, variant: Variant = PLAIN): StudSides {
  if (!takesStuds(type.kind) || !type.studs) return noStuds();
  const left = cleanLedge(type.studs.left);
  const right = cleanLedge(type.studs.right);
  return variant.mirror ? { left: right, right: left } : { left, right };
}

/** True if the element carries studs on at least one side. */
export function hasStuds(type: ElementType): boolean {
  const s = ledgeSides(type);
  return s.left.kind !== "none" || s.right.kind !== "none";
}

/** Width of the ledge on the left and the right of the track as used. */
export function ledges(type: ElementType, variant: Variant = PLAIN): { left: number; right: number } {
  const s = ledgeSides(type, variant);
  return { left: ledgeWidth(s.left.kind, s.left.rows), right: ledgeWidth(s.right.kind, s.right.rows) };
}

/** True if a switch is built with a lever. */
export const hasLever = (type: ElementType) => takesLever(type.kind) && type.lever === true;

export const DEFAULT_TRACK_COLOR = "#E4BD68"; // Bambu PLA Basic Gold: looks like wood

export function makeElement(kind: ElementKind, patch: Partial<ElementType> = {}): ElementType {
  const base: ElementType = { id: newId("e"), kind, name: "", color: DEFAULT_TRACK_COLOR, ...DEFAULTS, studs: noStuds() };
  if (kind === "ramp") base.length = RAMP_LENGTH;
  if (kind === "bridge") Object.assign(base, { length: 144, height: BRIDGE_HEIGHT });
  if (kind === "buffer") base.length = BUFFER_LENGTH;
  if (kind === "adapter") base.length = ADAPTER_LENGTH;
  if (kind === "switch") base.length = 144;
  if (kind === "crossing") base.length = CROSSING_LENGTH;
  return { ...base, ...patch };
}

/** The pieces every new project starts with: what a wooden-railway starter set has. */
export function standardElements(): ElementType[] {
  return [
    ...STRAIGHT_LENGTHS.map((length) => makeElement("straight", { id: `straight-${length}`, length })),
    makeElement("curve", { id: "curve-large", radius: CURVE_LARGE_RADIUS }),
    makeElement("curve", { id: "curve-small", radius: CURVE_SMALL_RADIUS }),
    makeElement("switch", { id: "switch-left", hand: "left" }),
    makeElement("switch", { id: "switch-right", hand: "right" }),
    makeElement("yswitch", { id: "yswitch" }),
    makeElement("crossing", { id: "crossing" }),
    makeElement("ramp", { id: "ramp-1", height: 0 }),
    makeElement("ramp", { id: "ramp-2", height: RAMP_RISE }),
    makeElement("bridge", { id: "bridge" }),
    makeElement("buffer", { id: "buffer" }),
    makeElement("adapter", { id: "adapter-mm", adapter: "male" }),
    makeElement("adapter", { id: "adapter-ff", adapter: "female" }),
    makeElement("straight", { id: "straight-216-lego", length: 216, studs: { left: { kind: "lego", rows: 1 }, right: { kind: "lego", rows: 1 } } }),
    makeElement("straight", { id: "straight-216-duplo", length: 216, studs: { left: { kind: "duplo", rows: 1 }, right: { ...NO_LEDGE } } }),
  ];
}

// ------------------------------------------------------------------------------ shape

const RAD = Math.PI / 180;
export const normDeg = (deg: number) => ((((deg + 180) % 360) + 360) % 360) - 180;

/** A point on a path at distance s from its start: position, height and heading (degrees). */
export function pointAt(path: Path, s: number): { x: number; y: number; z: number; heading: number } {
  if (path.kind === "line") {
    const t = path.length === 0 ? 0 : s / path.length;
    return {
      x: path.x + Math.cos(path.heading * RAD) * s,
      y: path.y + Math.sin(path.heading * RAD) * s,
      z: path.z0 + (path.z1 - path.z0) * smoothstep(t),
      heading: path.heading,
    };
  }
  const sign = Math.sign(path.sweep) || 1;
  const turned = (s / path.radius) * sign; // radians
  const h0 = path.heading * RAD;
  // centre lies to the left (sign > 0) or right of the start heading
  const cx = path.x - Math.sin(h0) * path.radius * sign;
  const cy = path.y + Math.cos(h0) * path.radius * sign;
  const h = h0 + turned;
  return { x: cx + Math.sin(h) * path.radius * sign, y: cy - Math.cos(h) * path.radius * sign, z: path.z, heading: h / RAD };
}

export function pathLength(path: Path): number {
  return path.kind === "line" ? path.length : (Math.abs(path.sweep) * RAD) * path.radius;
}

/** Ramps climb along a smoothstep, so that a train does not hit a kink at either end. */
export function smoothstep(t: number): number {
  const c = Math.min(Math.max(t, 0), 1);
  return c * c * (3 - 2 * c);
}

const end = (path: Path, gender: Gender): Port => {
  const p = pointAt(path, pathLength(path));
  return { x: p.x, y: p.y, z: p.z, heading: normDeg(p.heading), gender };
};
const start = (path: Path, gender: Gender): Port => {
  const p = pointAt(path, 0);
  return { x: p.x, y: p.y, z: p.z, heading: normDeg(p.heading + 180), gender };
};

/** The paths and ports of an element in its local frame, before the variant. */
function baseShape(type: ElementType): ElementShape {
  const line = (length: number, z0 = 0, z1 = z0): Path => ({ kind: "line", x: 0, y: 0, heading: 0, length, z0, z1 });
  const arc = (sweep: number): Path => ({ kind: "arc", x: 0, y: 0, heading: 0, radius: type.radius, sweep, z: 0 });
  switch (type.kind) {
    case "straight": {
      const p = line(type.length);
      return { paths: [p], ports: [start(p, "female"), end(p, "male")] };
    }
    case "curve": {
      const p = arc(type.angle);
      return { paths: [p], ports: [start(p, "female"), end(p, "male")] };
    }
    case "switch": {
      const s = line(type.length);
      const c = arc(type.hand === "left" ? type.angle : -type.angle);
      return { paths: [s, c], ports: [start(s, "female"), end(s, "male"), end(c, "male")] };
    }
    case "yswitch": {
      const l = arc(type.angle);
      const r = arc(-type.angle);
      return { paths: [l, r], ports: [start(l, "female"), end(l, "male"), end(r, "male")] };
    }
    case "crossing": {
      const a = line(type.length);
      const half = type.length / 2;
      const h = type.crossAngle;
      const b: Path = {
        kind: "line",
        x: half - Math.cos(h * RAD) * half,
        y: -Math.sin(h * RAD) * half,
        heading: h,
        length: type.length,
        z0: 0,
        z1: 0,
      };
      return { paths: [a, b], ports: [start(a, "female"), end(a, "male"), start(b, "female"), end(b, "male")] };
    }
    case "ramp": {
      const p = line(type.length, type.height, type.height + type.rise);
      return { paths: [p], ports: [start(p, "female"), end(p, "male")] };
    }
    case "bridge": {
      const p = line(type.length, type.height, type.height);
      return { paths: [p], ports: [start(p, "female"), end(p, "male")] };
    }
    case "buffer": {
      const p = line(type.length);
      return { paths: [p], ports: [start(p, "female")] };
    }
    case "adapter": {
      const p = line(type.length);
      return { paths: [p], ports: [start(p, type.adapter), end(p, type.adapter)] };
    }
  }
}

const flip = (g: Gender): Gender => (g === "male" ? "female" : "male");

/** Paths and ports of an element as used (mirrored at the X axis, genders swapped). */
export function elementShape(type: ElementType, variant: Variant = PLAIN): ElementShape {
  const shape = baseShape(type);
  if (!variant.mirror && !variant.swap) return shape;
  const paths = shape.paths.map((p): Path => {
    if (!variant.mirror) return p;
    return p.kind === "line" ? { ...p, y: -p.y, heading: -p.heading } : { ...p, y: -p.y, heading: -p.heading, sweep: -p.sweep };
  });
  const ports = shape.ports.map((p) => ({
    ...p,
    y: variant.mirror ? -p.y : p.y,
    heading: variant.mirror ? normDeg(-p.heading) : p.heading,
    gender: variant.swap ? flip(p.gender) : p.gender,
  }));
  return { paths, ports };
}

/** Which variants make sense for a kind. */
export function variantsOf(kind: ElementKind): Variant[] {
  const mirrors = kind === "curve" || kind === "switch" || kind === "crossing" ? [false, true] : [false];
  const swaps = kind === "adapter" || kind === "yswitch" ? [false] : [false, true];
  return mirrors.flatMap((mirror) => swaps.map((swap) => ({ mirror, swap })));
}

/** The track stands on the bed (ramps, bridges) or lies flat; elevated flat track needs a support. */
export const standsOnGround = (kind: ElementKind) => kind === "ramp" || kind === "bridge";

/** Kinds with sleepers: one path only (switches and crossings stay closed where tracks meet). */
export const takesSleepers = (kind: ElementKind) => kind === "straight" || kind === "curve" || kind === "ramp" || kind === "bridge" || kind === "buffer";

/**
 * Where the openings between the sleepers lie: distances along the path of the element (centre of
 * each opening). The pattern is centred on the middle of the piece; openings keep away from the
 * ends (the socket of a female end needs solid track around it) and from the block of a buffer.
 */
export function sleeperGaps(type: ElementType, variant: Variant = PLAIN): number[] {
  if (!takesSleepers(type.kind)) return [];
  const shape = elementShape(type, variant);
  const path = shape.paths[0];
  if (!path || shape.paths.length !== 1) return [];
  const length = pathLength(path);
  const end = type.kind === "buffer" ? length - BUFFER_BLOCK_LENGTH - 2 : length;
  const result: number[] = [];
  const steps = Math.floor(length / 2 / SLEEPER_PITCH) + 1;
  for (let k = -steps; k <= steps; k++) {
    const s = length / 2 + k * SLEEPER_PITCH;
    if (s - SLEEPER_GAP / 2 < 0 || s + SLEEPER_GAP / 2 > end) continue;
    const p = pointAt(path, s);
    const clear = shape.ports.every((port) => Math.hypot(port.x - p.x, port.y - p.y) - SLEEPER_GAP / 2 >= (port.gender === "female" ? SLEEPER_KEEP_FEMALE : SLEEPER_KEEP_MALE));
    if (clear) result.push(s);
  }
  return result;
}

/** The outline of an element seen from above, one closed polygon per path (for the plan). */
export function outline(type: ElementType, variant: Variant = PLAIN, step = 4): [number, number][][] {
  const half = TRACK_WIDTH / 2;
  const ledge = ledges(type, variant);
  return elementShape(type, variant).paths.map((path) => {
    const length = pathLength(path);
    const n = Math.max(1, Math.ceil(length / step));
    const left: [number, number][] = [];
    const right: [number, number][] = [];
    for (let i = 0; i <= n; i++) {
      const p = pointAt(path, (length * i) / n);
      const nx = -Math.sin(p.heading * RAD);
      const ny = Math.cos(p.heading * RAD);
      left.push([p.x + nx * (half + ledge.left), p.y + ny * (half + ledge.left)]);
      right.push([p.x - nx * (half + ledge.right), p.y - ny * (half + ledge.right)]);
    }
    return [...left, ...right.reverse()];
  });
}

/** Centre lines of the two grooves of every path, for drawing the plan. */
export function grooveLines(type: ElementType, variant: Variant, spacing: number, step = 4): [number, number][][] {
  return elementShape(type, variant).paths.flatMap((path) => {
    const length = pathLength(path);
    const n = Math.max(1, Math.ceil(length / step));
    return [1, -1].map((side) => {
      const line: [number, number][] = [];
      for (let i = 0; i <= n; i++) {
        const p = pointAt(path, (length * i) / n);
        line.push([p.x - Math.sin(p.heading * RAD) * (spacing / 2) * side, p.y + Math.cos(p.heading * RAD) * (spacing / 2) * side]);
      }
      return line;
    });
  });
}
