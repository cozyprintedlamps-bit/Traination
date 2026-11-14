// Vehicles as solids. Frame: X along the vehicle (front at +X), Y across, Z up; Z = 0 is the
// bottom of the chassis. The body has its own frame with Z = 0 on the deck.
//
// A body is the main shell plus "sections" in their own colour (roof, details, load, decor). In
// split mode a section that has a mount (a flat bottom and pin places) becomes a separate print
// part that plugs onto pins of the body; sections without a mount join the body (decor is then
// engraved). Otherwise every section is a volume of the body object with its own filament.
//
// Print orientation: chassis, body and sections upright as modelled, wheels flat, axles lying on
// their flat.
import type { CrossSection, Manifold, ManifoldToplevel } from "manifold-3d";
import { bodyHeight, chassisSizes, cleanLettering, couplerSizes } from "../core/vehicle";
import type { ChassisSizes, Coupler, Fits, Vehicle } from "../core/vehicle";
import { MIN_WALL } from "../presets/print";
import { AXLE_DIAMETER, WHEEL_SPACING, WHEEL_WIDTH } from "../presets/vehicle";
import { cyberbrickBody, cyberbrickChassis, cyberbrickDrive } from "./cyberbrick";
import { DECOR_EMBED, DECOR_RAISE, ENGRAVE_DEPTH, faceOutline, letteringOutline, onFront, onSides, patternOutline } from "./decor";
import type { Band, FaceSpot } from "./decor";

const SEG = 48;
/** body pins on the deck, pressed into holes in the body */
export const BODY_PIN_DIAMETER = 5;
export const BODY_PIN_HEIGHT = 4;
export const BODY_PIN_FIT = 0.1;
/** pins that hold separately printed sections (roof, chimney, load) */
export const SECTION_PIN_DIAMETER = 3;
export const SECTION_PIN_HEIGHT = 2.5;
export const SECTION_PIN_FIT = 0.15;
/** the flat on the axle (and in the wheel hole), so that the wheels turn with the axle */
export const AXLE_FLAT = 0.4;
const CORNER = 3;
/** the body keeps this much off the deck edge */
const BODY_INSET = 1;
const HALF = 16;

export type SlotKey = "roof" | "details" | "load" | "decor";
export const SLOT_KEYS: readonly SlotKey[] = ["roof", "details", "load", "decor"];

export interface Section {
  slot: SlotKey;
  solid: Manifold;
  /** flat bottom at z with pin places: may be printed separately */
  mount?: { z: number; pins: [number, number][] };
  /** sits on the roof: printed with the roof when the roof is a separate part */
  onRoof?: boolean;
}

type Box = [number, number, number, number, number, number];

export function box(wasm: ManifoldToplevel, [x0, x1, y0, y1, z0, z1]: Box): Manifold {
  return wasm.Manifold.cube([x1 - x0, y1 - y0, z1 - z0], false).translate([x0, y0, z0]);
}

/** A rounded rectangle extruded from z0 to z1. */
export function roundedBlock(wasm: ManifoldToplevel, lx: number, ly: number, r: number, z0: number, z1: number, cx = 0, cy = 0): Manifold {
  const radius = Math.min(r, lx / 2 - 0.01, ly / 2 - 0.01);
  const core = wasm.CrossSection.square([lx - 2 * radius, ly - 2 * radius], true);
  const outline = radius > 0 ? core.offset(radius, "Round", 2, SEG) : core;
  return outline.extrude(z1 - z0).translate([cx, cy, z0]);
}

/** A cylinder along X from x0 to x1 with its axis at (y, z). */
export function cylinderX(wasm: ManifoldToplevel, r: number, x0: number, x1: number, y: number, z: number, r1 = r): Manifold {
  return wasm.Manifold.cylinder(x1 - x0, r, r1, SEG).rotate([0, 90, 0]).translate([x0, y, z]);
}

/** A cylinder along Y centred at (x, z). */
export function cylinderY(wasm: ManifoldToplevel, r: number, length: number, x: number, z: number, segments = SEG): Manifold {
  return wasm.Manifold.cylinder(length, r, r, segments, true).rotate([90, 0, 0]).translate([x, 0, z]);
}

/** A side profile (polygon in x, z) extruded across from −half to +half. */
export function sideProfile(wasm: ManifoldToplevel, points: [number, number][], half: number): Manifold {
  return wasm.CrossSection.ofPolygons([points]).extrude(2 * half).rotate([90, 0, 0]).translate([0, half, 0]);
}

/** The D-shaped section of the axle (and the wheel hole): a circle with a flat at the bottom. */
export function axleSection(wasm: ManifoldToplevel, diameter: number): CrossSection {
  const r = diameter / 2;
  const circle = wasm.CrossSection.circle(r, SEG);
  const keep = wasm.CrossSection.square([diameter + 2, diameter + 2], true).translate([0, AXLE_FLAT + 1]);
  return circle.intersect(keep);
}

// ------------------------------------------------------------------------------ chassis

function coupler(wasm: ManifoldToplevel, v: Vehicle, kind: Coupler, fits: Fits, sizes: ChassisSizes): Manifold | undefined {
  if (kind === "none") return undefined;
  const c = couplerSizes(v, fits);
  const end = sizes.length / 2;
  const root = end - 3; // reaches into the chassis, so that it is one solid
  const tip = end + c.reach;
  if (kind === "magnet") {
    const head = roundedBlock(wasm, tip - root, c.headWidth, 2, 0, sizes.deckTop, (tip + root) / 2, 0);
    const pocket = cylinderX(wasm, c.pocketDiameter / 2, tip - c.pocketDepth, tip + 1, 0, c.centerZ);
    return head.subtract(pocket);
  }
  const hole = c.pinDiameter / 2 + 1.5;
  if (kind === "hook") {
    const tongue = roundedBlock(wasm, tip - root, c.armWidth, 1.5, 0, c.hookTop, (tip + root) / 2, 0);
    const pin = wasm.Manifold.cylinder(c.pinHeight, c.pinDiameter / 2, (c.pinDiameter / 2) * 0.8, SEG).translate([tip - hole, 0, c.hookTop]);
    return tongue.add(pin);
  }
  // eye: a plate over the hook of the next vehicle, carried by a 45° slope (prints without support)
  const width = Math.max(c.armWidth, c.eyeHole + 2 * MIN_WALL + 1);
  const flat = end + 4;
  const plate = sideProfile(
    wasm,
    [
      [root, 0],
      [flat - c.eyeBottom, 0],
      [flat, c.eyeBottom],
      [tip, c.eyeBottom],
      [tip, c.eyeTop],
      [root, c.eyeTop],
    ],
    width / 2,
  );
  const eye = wasm.Manifold.cylinder(c.eyeTop - c.eyeBottom + 2, c.eyeHole / 2, c.eyeHole / 2, SEG).translate([tip - hole, 0, c.eyeBottom - 1]);
  return plate.subtract(eye);
}

/** Two buffers at each end that has a coupler (they stand beside the coupler head). */
function buffers(wasm: ManifoldToplevel, v: Vehicle, s: ChassisSizes): Manifold[] {
  if (!v.design.buffers) return [];
  const list: Manifold[] = [];
  for (const sign of [1, -1]) {
    for (const y of [-12, 12]) {
      const shaft = cylinderX(wasm, 1.8, s.length / 2 - 1, s.length / 2 + 3.5, y, 8);
      const head = cylinderX(wasm, 2.8, s.length / 2 + 3.5, s.length / 2 + 4.7, y, 8);
      const both = shaft.add(head);
      list.push(sign > 0 ? both : both.mirror([1, 0, 0]));
    }
  }
  return list;
}

/** A cow catcher in front of a locomotive without front coupler: a wedge that stands on the bed. */
function cowcatcher(wasm: ManifoldToplevel, v: Vehicle, s: ChassisSizes): Manifold | undefined {
  if (!v.design.cowcatcher || v.front !== "none") return undefined;
  const x = s.length / 2 - 1;
  const wedge = sideProfile(
    wasm,
    [
      [x, 0],
      [x + 9, 0],
      [x + 1, 10],
      [x, 10],
    ],
    13,
  );
  // bars: grooves across the slope
  const grooves = wasm.Manifold.union([-8, -4, 0, 4, 8].map((y) => box(wasm, [x + 1, x + 10, y - 0.6, y + 0.6, 0.6, 11])));
  return wedge.subtract(grooves);
}

export const bodyPins = (v: Vehicle): number[] => (v.kind === "cyberbrick" ? [v.length / 2 - 7, -v.length / 2 + 7] : [v.length / 4, -v.length / 4]);

export function buildChassis(wasm: ManifoldToplevel, v: Vehicle, fits: Fits): Manifold {
  const { Manifold } = wasm;
  const s = chassisSizes(v, fits);
  const L = s.length;
  const W = s.width;
  const parts: Manifold[] = [
    box(wasm, [-L / 2, L / 2, -s.beamHalf, s.beamHalf, 0, s.deckBottom]),
    box(wasm, [-L / 2, L / 2, s.skirtInner, W / 2, 0, s.deckBottom]),
    box(wasm, [-L / 2, L / 2, -W / 2, -s.skirtInner, 0, s.deckBottom]),
    box(wasm, [-L / 2, L / 2, -W / 2, W / 2, s.deckBottom, s.deckTop]),
  ];
  let chassis = Manifold.union(parts).intersect(roundedBlock(wasm, L, W, CORNER, -1, s.deckTop + 1));
  // end beams close the slots between beam and skirts at both ends
  for (const sign of [1, -1]) chassis = chassis.add(roundedBlock(wasm, 4, W, 1, 0, s.deckBottom, sign * (L / 2 - 2), 0));
  const front = coupler(wasm, v, v.front, fits, s);
  const rear = coupler(wasm, v, v.rear, fits, s)?.mirror([1, 0, 0]);
  const extra = [front, rear, cowcatcher(wasm, v, s), ...buffers(wasm, v, s), ...(v.kind === "cyberbrick" ? [] : runningGear(wasm, v, s))].filter((m): m is Manifold => m !== undefined);
  if (extra.length > 0) chassis = chassis.add(Manifold.union(extra));
  // axle holes through skirts and beam
  chassis = chassis.subtract(Manifold.union(s.axles.map((a) => cylinderY(wasm, s.axleHole / 2, W + 2, a.x, a.z))));
  if (v.kind === "cyberbrick") chassis = cyberbrickChassis(wasm, v, s, chassis);
  // body pins
  const pins = bodyPins(v).map((x) => Manifold.cylinder(BODY_PIN_HEIGHT, BODY_PIN_DIAMETER / 2, BODY_PIN_DIAMETER / 2 - 0.3, SEG).translate([x, 0, s.deckTop]));
  return chassis.add(Manifold.union(pins));
}

// ------------------------------------------------------------------------------ bodies

/** What a body builder hands back: the shell, its coloured sections and the places for decoration. */
export interface BodyShape {
  body: Manifold;
  sections: Section[];
  band?: Band;
  /** the band lies on the load (container): engraving goes into the load instead of the body */
  bandOnLoad?: boolean;
  face?: FaceSpot;
  /** headlamps on the front: (y, z) on the front wall at x */
  lamps?: { x: number; spots: [number, number][] };
}

/** Window recesses in both side walls at y = ±half. */
function sideRecesses(wasm: ManifoldToplevel, half: number, xs: number[], w: number, z0: number, z1: number, depth = 1.5): Manifold {
  const list = xs.flatMap((x) => [box(wasm, [x - w / 2, x + w / 2, half - depth, half + 1, z0, z1]), box(wasm, [x - w / 2, x + w / 2, -half - 1, -half + depth, z0, z1])]);
  return wasm.Manifold.union(list);
}

function windowRow(x0: number, x1: number, step: number): number[] {
  const n = Math.max(1, Math.floor((x1 - x0) / step));
  return Array.from({ length: n }, (_, i) => x0 + ((x1 - x0) * (i + 0.5)) / n);
}

/** Details stand at most this far off a wall: they print as a small ledge, without support. */
const RELIEF = 0.8;

/** A raised bar along both side walls (y = ±half) from x0 to x1, centred at height z. */
function sideBar(wasm: ManifoldToplevel, half: number, x0: number, x1: number, z: number, height = 1, out = RELIEF): Manifold {
  return wasm.Manifold.union([box(wasm, [x0, x1, half - 0.3, half + out, z - height / 2, z + height / 2]), box(wasm, [x0, x1, -half - out, -half + 0.3, z - height / 2, z + height / 2])]);
}

/** Louvres: thin horizontal slots in both side walls between x0 and x1, z0 and z1. */
function louvres(wasm: ManifoldToplevel, half: number, x0: number, x1: number, z0: number, z1: number, pitch = 2.2): Manifold | undefined {
  const slots: Manifold[] = [];
  for (let z = z0; z + 1 <= z1; z += pitch) slots.push(sideRecesses(wasm, half, [(x0 + x1) / 2], x1 - x0, z, z + 1, 0.6));
  return slots.length > 0 ? wasm.Manifold.union(slots) : undefined;
}

/** Planks: narrow upright grooves in both side walls, about `pitch` apart, leaving out [skip0, skip1]. */
function planks(wasm: ManifoldToplevel, half: number, x0: number, x1: number, z0: number, z1: number, pitch = 5, skip?: [number, number]): Manifold | undefined {
  const xs = windowRow(x0, x1, pitch).filter((x) => !skip || x < skip[0] || x > skip[1]);
  return xs.length > 0 ? sideRecesses(wasm, half, xs, 0.8, z0, z1, 0.5) : undefined;
}

/** Bands round a boiler or tank (along X, radius r, axis at height cz), standing out a little. */
function bands(wasm: ManifoldToplevel, xs: number[], r: number, cz: number, above: number): Manifold {
  const rings = xs.map((x) => cylinderX(wasm, r + 0.5, x - 0.7, x + 0.7, 0, cz).subtract(cylinderX(wasm, r - 1, x - 1, x + 1, 0, cz)));
  return wasm.Manifold.union(rings).intersect(box(wasm, [-500, 500, -r - 2, r + 2, above, cz + r + 2]));
}

/**
 * The running gear on the outer face of the skirts: an axle box with a leaf spring over every
 * axle; a steam locomotive also gets coupling rods. Reliefs of at most 1.5 mm.
 */
function runningGear(wasm: ManifoldToplevel, v: Vehicle, s: ChassisSizes): Manifold[] {
  const list: Manifold[] = [];
  const top = s.deckBottom - 0.2;
  const rods = (v.kind === "steam" || v.kind === "tankloco") && s.axles.length > 1;
  for (const sign of [1, -1]) {
    const face = (sign * s.width) / 2;
    const span = (out: number): [number, number] => (sign > 0 ? [face - 0.3, face + out] : [face - out, face + 0.3]);
    const [y0, y1] = span(RELIEF);
    for (const a of s.axles) {
      list.push(box(wasm, [a.x - 3, a.x + 3, y0, y1, Math.max(0.3, a.z - 3), Math.min(top, a.z + 3)]));
      if (a.z + 4.4 <= top) list.push(box(wasm, [a.x - 7, a.x + 7, y0, y1, a.z + 3.4, a.z + 4.4]));
    }
    if (rods) {
      const xs = s.axles.map((a) => a.x);
      const z = (s.axles[0] as ChassisSizes["axles"][number]).z;
      const [r0, r1] = span(1.5);
      list.push(box(wasm, [Math.min(...xs) - 3, Math.max(...xs) + 3, r0, r1, Math.max(0.3, z - 1), Math.min(top, z + 1)]));
    }
  }
  return list;
}

/**
 * A box from z = 0 to `top` with a roof: round (barrel), flat or peaked. Returns the whole shape
 * and the roof part (the top `thickness` mm plus the curve), cut off flat.
 */
function roofed(wasm: ManifoldToplevel, v: Vehicle, x0: number, x1: number, half: number, top: number, thickness = 3): { full: Manifold; roof: Section; roofZ: number } {
  const style = v.design.roof;
  const drop = style === "round" ? 4 : style === "peaked" ? Math.min(half * 0.55, 9) : 0;
  let full = box(wasm, [x0, x1, -half, half, 0, top]);
  if (style === "round") {
    const r = (half * half) / (2 * drop) + drop / 2;
    full = full.intersect(cylinderX(wasm, r, x0 - 1, x1 + 1, 0, top - r));
  } else if (style === "peaked") {
    const gable = wasm.CrossSection.ofPolygons([
      [
        [-half - 1, -1],
        [half + 1, -1],
        [half + 1, top - drop],
        [0, top],
        [-half - 1, top - drop],
      ],
    ])
      .extrude(x1 - x0 + 2)
      .rotate([90, 0, 90])
      .translate([x0 - 1, 0, 0]);
    full = full.intersect(gable);
  }
  const roofZ = top - drop - thickness;
  const roof = full.intersect(box(wasm, [x0 - 1, x1 + 1, -half - 1, half + 1, roofZ, top + 1]));
  const len = x1 - x0;
  const pins: [number, number][] = len > 30 ? [[x0 + len * 0.25, 0], [x1 - len * 0.25, 0]] : [[(x0 + x1) / 2, 0]];
  return { full, roof: { slot: "roof", solid: roof, mount: { z: roofZ, pins } }, roofZ };
}

/** A part standing on a seat: a short pad in the body colour up to `seat`, the part above it. */
function seated(wasm: ManifoldToplevel, slot: SlotKey, part: Manifold, padRadius: number, x: number, from: number, seat: number): { pad: Manifold; section: Section } {
  const pad = wasm.Manifold.cylinder(seat - from, padRadius, padRadius, SEG).translate([x, 0, from]);
  const above = part.intersect(box(wasm, [x - 30, x + 30, -30, 30, seat, seat + 100]));
  return { pad, section: { slot, solid: above, mount: { z: seat, pins: [[x, 0]] } } };
}

/** A load (heap, crates …) with a flat bottom at z, pinned in its middle. */
const loadSection = (solid: Manifold, z: number, pins: [number, number][]): Section => ({ slot: "load", solid, mount: { z, pins } });

/** A heap (coal, gravel) with a flat bottom at z: a stretched dome. */
function heap(wasm: ManifoldToplevel, lx: number, ly: number, z: number, rise: number, cx = 0): Manifold {
  return wasm.Manifold.sphere(1, SEG).scale([lx / 2, ly / 2, rise]).intersect(box(wasm, [-lx, lx, -ly, ly, 0, rise + 1])).translate([cx, 0, z]);
}

function openBox(wasm: ManifoldToplevel, L: number, half: number, H: number, floor: number, wall = 2.4, cx = 0): Manifold {
  const outer = roundedBlock(wasm, L, half * 2, 2, 0, H, cx);
  const inner = roundedBlock(wasm, L - 2 * wall, half * 2 - 2 * wall, 1, floor, H + 1, cx);
  return outer.subtract(inner);
}

function steamBody(wasm: ManifoldToplevel, v: Vehicle, H: number, tank: boolean): BodyShape {
  const { Manifold } = wasm;
  const L = v.length - 2 * BODY_INSET;
  const x0 = -L / 2;
  const x1 = L / 2;
  const bunker = tank ? Math.max(14, L * 0.14) : 0;
  const cab = Math.max(26, L * 0.3);
  const cabStart = x0 + bunker;
  const cabEnd = cabStart + cab;
  const { full: cabBox, roof } = roofed(wasm, v, cabStart, cabEnd, HALF, H);
  const r = 11.5;
  const cz = 9;
  const base = box(wasm, [cabEnd - 1, x1, -HALF, HALF, 0, 4]);
  const boiler = cylinderX(wasm, r, cabEnd - 1, x1 - 6, 0, cz).intersect(box(wasm, [cabEnd - 2, x1, -r, r, 0, cz + r]));
  const smokebox = cylinderX(wasm, r + 0.8, x1 - 6, x1, 0, cz).intersect(box(wasm, [x1 - 7, x1 + 1, -r - 1, r + 1, 0, cz + r + 1]));
  const parts = [cabBox, base, boiler, smokebox];
  if (tank) {
    // side tanks beside the boiler and a coal bunker behind the cab
    parts.push(roundedBlock(wasm, x1 - 14 - cabEnd, 2 * HALF, 2, 0, cz + 6, (cabEnd + x1 - 14) / 2, 0));
    parts.push(box(wasm, [x0, cabStart + 1, -HALF, HALF, 0, H * 0.62]));
  }
  let body = Manifold.union(parts);
  if (v.design.windows) {
    body = body.subtract(sideRecesses(wasm, HALF, [cabStart + cab / 2], Math.min(12, cab - 10), H - 17, H - 8));
    // round windows in the front wall of the cab, above the boiler
    if (H - 9 - 3 > cz + r + 1) body = body.subtract(Manifold.union([-8, 8].map((y) => cylinderX(wasm, 2.6, cabEnd - 1.5, cabEnd + 1, y, H - 9))));
  }
  const sections: Section[] = [roof];
  const top = cz + r;
  // a sand dome on the boiler, bands round it, cylinders beside the smokebox
  const sandX = cabEnd + (x1 - 12 - cabEnd) * 0.22;
  body = body.add(Manifold.cylinder(r + 2, 3.2, 3.2, SEG).translate([sandX, 0, cz])).add(Manifold.sphere(3.2, SEG).translate([sandX, 0, cz + r + 2]));
  const detail: Manifold[] = [bands(wasm, [cabEnd + 3, (cabEnd + x1 - 6) / 2, x1 - 7], r, cz, 4.2)];
  for (const y of [HALF - 3.6, -HALF + 3.6]) detail.push(cylinderX(wasm, 3.6, x1 - 16, x1 - 5, y, 4 + 3.6));
  // the smokebox door with its handle (unless the front has a face)
  if (!v.design.face) detail.push(cylinderX(wasm, r - 2.5, x1 - 0.01, x1 + 0.8, 0, cz), cylinderX(wasm, 0.7, x1 + 0.8, x1 + 1.8, 0, cz));
  sections.push({ slot: "details", solid: Manifold.union(detail) });
  // a whistle on the cab roof (printed with the roof)
  sections.push({ slot: "details", solid: Manifold.cylinder(4.5, 1, 0.8, 16).translate([cabEnd - 5, 0, H - 2]).add(Manifold.cylinder(1, 1.6, 1.6, 16).translate([cabEnd - 5, 0, H + 2.5])), onRoof: true });
  if (v.design.chimney !== "none") {
    const hc = v.design.chimney === "tall" ? 13 : v.design.chimney === "funnel" ? 11 : 7;
    const cx = x1 - 12;
    const stack =
      v.design.chimney === "funnel"
        ? Manifold.cylinder(r + hc - 4, 3.8, 3.8, SEG).translate([cx, 0, cz]).add(Manifold.cylinder(5, 3.8, 6.5, SEG).translate([cx, 0, cz + r + hc - 5]))
        : Manifold.cylinder(r + hc, 4, 4.5, SEG).translate([cx, 0, cz]).add(Manifold.cylinder(2.5, 5.5, 5.5, SEG).translate([cx, 0, cz + r + hc - 2.5]));
    const { pad, section } = seated(wasm, "details", stack, 4.2, cx, cz, top + 0.6);
    body = body.add(pad);
    sections.push(section);
  }
  if (v.design.dome) {
    const dx = (cabEnd + x1 - 12) / 2;
    const dome = Manifold.cylinder(r + 3, 4.5, 4.5, SEG).translate([dx, 0, cz]).add(Manifold.sphere(4.5, SEG).translate([dx, 0, cz + r + 3]));
    const { pad, section } = seated(wasm, "details", dome, 4.7, dx, cz, top + 0.6);
    body = body.add(pad);
    sections.push(section);
  }
  return {
    body,
    sections,
    band: { x0: cabStart + 2, x1: cabEnd - 2, z0: 3, z1: v.design.windows ? H - 19 : H - 8, half: HALF },
    face: { x: x1, z: cz, r: r - 0.5 },
    lamps: { x: x1, spots: [[0, cz + r - 2.5]] },
  };
}

function dieselBody(wasm: ManifoldToplevel, v: Vehicle, H: number): BodyShape {
  const { Manifold } = wasm;
  const L = v.length - 2 * BODY_INSET;
  const x0 = -L / 2;
  const x1 = L / 2;
  const shunter = v.kind === "shunter";
  const cab = Math.max(26, L * (shunter ? 0.36 : 0.3));
  // the shunter has its cab near the middle, short hoods on both sides
  const cabStart = shunter ? x0 + L * 0.22 : x1 - cab;
  const cabEnd = cabStart + cab;
  const { full: cabBox, roof } = roofed(wasm, v, cabStart, cabEnd, HALF, H);
  const hoodH = H * 0.66;
  const hoods = shunter
    ? [roundedBlock(wasm, cabStart - x0 + 1, 24, 3, 0, hoodH, (cabStart + x0) / 2, 0), roundedBlock(wasm, x1 - cabEnd + 1, 24, 3, 0, hoodH, (cabEnd + x1) / 2, 0)]
    : [roundedBlock(wasm, cabStart - x0 + 1, 24, 3, 0, hoodH, (cabStart + x0) / 2, 0)];
  const walk = box(wasm, [x0, x1, -HALF, HALF, 0, 3]);
  let body = Manifold.union([cabBox, walk, ...hoods]);
  if (v.design.windows) {
    body = body.subtract(sideRecesses(wasm, HALF, [cabStart + cab / 2], cab - 10, H - 16, H - 8));
    if (!shunter) body = body.subtract(box(wasm, [x1 - 1.5, x1 + 1, -11, 11, H - 16, H - 8]));
  }
  const hoodLen = cabStart - x0;
  // louvres in the side of the hood(s), a handrail above them, a fan and the exhaust on top
  const grilles = [louvres(wasm, 12, x0 + 7, cabStart - 7, 6, hoodH - 6)];
  if (shunter) grilles.push(louvres(wasm, 12, cabEnd + 5, x1 - 5, 6, hoodH - 6));
  for (const g of grilles) if (g) body = body.subtract(g);
  const fanX = (cabStart + x0) / 2;
  body = body.subtract(Manifold.cylinder(1, Math.min(7, hoodLen / 2 - 4), Math.min(7, hoodLen / 2 - 4), SEG).translate([fanX, 0, hoodH - 0.8]));
  body = body.add(Manifold.cylinder(3, 1.8, 1.8, 24).translate([cabStart - 6, 0, hoodH - 0.5]));
  // a door in each side of the cab, below the window
  body = body.subtract(sideRecesses(wasm, HALF, [cabStart + 5], 6, 4, H - 18, 0.8));
  const detail: Manifold[] = [sideBar(wasm, 12, x0 + 4, cabStart - 2, hoodH - 3, 0.8)];
  // fan blades in the recess: a cross
  detail.push(box(wasm, [fanX - 6, fanX + 6, -0.5, 0.5, hoodH - 0.8, hoodH - 0.3]), box(wasm, [fanX - 0.5, fanX + 0.5, -6, 6, hoodH - 0.8, hoodH - 0.3]));
  const frontX = x1;
  return {
    body,
    sections: [roof, { slot: "details", solid: Manifold.union(detail) }],
    band: shunter ? { x0: cabStart + 2, x1: cabEnd - 2, z0: 3, z1: H - 18, half: HALF } : { x0: x0 + 4, x1: cabStart - 4, z0: 4, z1: hoodH - 2, half: 12 },
    face: shunter ? { x: x1, z: hoodH / 2, r: Math.min(hoodH / 2 - 1, 10) } : { x: x1, z: (H - 8) / 2 + 1, r: Math.min((H - 8) / 2 - 1, 10) },
    lamps: { x: frontX, spots: [[-8, 6], [8, 6]] },
  };
}

function electricBody(wasm: ManifoldToplevel, v: Vehicle, H: number, highspeed: boolean): BodyShape {
  const { Manifold } = wasm;
  const L = v.length - 2 * BODY_INSET;
  const x0 = -L / 2;
  const x1 = L / 2;
  const top = H - (highspeed ? 0 : 6);
  const { full, roof } = roofed(wasm, v, x0, x1, HALF, top);
  let body = full;
  // doors near both ends, a skirt line along the bottom
  body = body.subtract(sideRecesses(wasm, HALF, [x0 + 9, x1 - (highspeed ? 40 : 9)], 6, 3, top - 5, 0.8));
  const trim = sideBar(wasm, HALF, x0 + 2, x1 - 2, 2.2, 1);
  if (highspeed) {
    // a long sloped nose at the front
    const nose = sideProfile(
      wasm,
      [
        [x0 - 1, -1],
        [x1 + 1, -1],
        [x1 + 1, top * 0.32],
        [x1 - 34, top + 2],
        [x0 - 1, top + 2],
      ],
      HALF + 1,
    );
    body = body.intersect(nose);
    roof.solid = roof.solid.intersect(nose);
  }
  const trimmed = highspeed ? trim.intersect(sideProfile(wasm, [[x0 - 1, -1], [x1 + 1, -1], [x1 + 1, top * 0.32], [x1 - 34, top + 2], [x0 - 1, top + 2]], HALF + 2)) : trim;
  if (v.design.windows) {
    const xs = windowRow(x0 + 14, x1 - (highspeed ? 38 : 14), 16);
    body = body.subtract(sideRecesses(wasm, HALF, xs, 9, top - 15, top - 8));
    if (!highspeed) body = body.subtract(box(wasm, [x1 - 1.5, x1 + 1, -10, 10, top - 15, top - 7]));
    body = body.subtract(box(wasm, [x0 - 1, x0 + 1.5, -10, 10, top - 15, top - 7]));
  }
  const sections: Section[] = [roof, { slot: "details", solid: trimmed }];
  // equipment boxes on the roof (printed with the roof)
  const boxZ = top - (v.design.roof === "round" ? 2 : v.design.roof === "peaked" ? 4 : 1);
  const kit = (highspeed ? [x0 + L * 0.3, x0 + L * 0.55] : [-L / 4, L / 4]).map((x) => roundedBlock(wasm, 12, 9, 1.5, boxZ, top + 2, x, 0));
  sections.push({ slot: "details", solid: Manifold.union(kit), onRoof: true });
  if (!highspeed) {
    // pantograph: insulators, a base, a mast and arms opening upward at 45° to the contact strip;
    // every face looks up or sideways, so it prints without support
    const pz = top - (v.design.roof === "round" ? 1.5 : v.design.roof === "peaked" ? 0 : 0.5);
    const arms = wasm.CrossSection.ofPolygons([
      [
        [-1, pz + 3],
        [1, pz + 3],
        [1, pz + 4],
        [9, pz + 12],
        [9, pz + 13.5],
        [-9, pz + 13.5],
        [-9, pz + 12],
        [-1, pz + 4],
      ],
    ])
      .extrude(2)
      .rotate([90, 0, 90])
      .translate([-1, 0, 0]);
    const insulators = [-5, 5].flatMap((x) => [-4.5, 4.5].map((y) => Manifold.cylinder(2.5, 1.4, 1.1, 16).translate([x, y, pz - 1])));
    const panto = Manifold.union([box(wasm, [-6, 6, -6, 6, pz - 1, pz + 1.5]), box(wasm, [-1, 1, -1, 1, pz + 1, pz + 4]), arms, ...insulators]);
    // details on the roof go with the roof (one part): the pantograph is a detail without its own mount
    sections.push({ slot: "details", solid: panto, onRoof: true });
  }
  return {
    body,
    sections,
    band: { x0: x0 + 6, x1: x1 - (highspeed ? 40 : 6), z0: 3, z1: v.design.windows ? top - 17 : top - 6, half: HALF },
    face: highspeed ? undefined : { x: x1, z: (top - 8) / 2 + 1, r: Math.min((top - 8) / 2 - 1, 10) },
    lamps: { x: highspeed ? x1 : x1, spots: highspeed ? [[-7, 4], [7, 4]] : [[-9, 5], [9, 5]] },
  };
}

function wagonBody(wasm: ManifoldToplevel, v: Vehicle, H: number): BodyShape {
  const { Manifold } = wasm;
  const L = v.length - 2 * BODY_INSET;
  const x0 = -L / 2;
  const x1 = L / 2;
  const plainBand = (z0: number, z1: number, half = HALF): Band => ({ x0: x0 + 4, x1: x1 - 4, z0, z1, half });
  switch (v.kind) {
    case "tender": {
      const floor = H - 6;
      // a water hatch at the back, planks on the sides
      const hatch = Manifold.cylinder(2.5, 3.5, 3.5, SEG).translate([x0 + 8, 0, floor]);
      const lines = planks(wasm, HALF, x0 + 3, x1 - 3, 3, H - 3, 6);
      const shell = openBox(wasm, L, HALF, H, floor).add(hatch);
      return {
        body: lines ? shell.subtract(lines) : shell,
        sections: v.design.load ? [loadSection(heap(wasm, L - 6, HALF * 2 - 6, floor, 7), floor, [[0, 0]])] : [],
        band: plainBand(3, H - 3),
      };
    }
    case "hopper": {
      const bottom = L * 0.6;
      const shell = sideProfile(
        wasm,
        [
          [-bottom / 2, 0],
          [bottom / 2, 0],
          [x1, H],
          [x0, H],
        ],
        HALF,
      );
      const inner = wasm.CrossSection.ofPolygons([
        [
          [-bottom / 2, 0],
          [bottom / 2, 0],
          [x1, H],
          [x0, H],
        ],
      ])
        .offset(-3, "Miter")
        .translate([0, 3.2])
        .extrude(HALF * 2 - 4.8)
        .rotate([90, 0, 0])
        .translate([0, HALF - 2.4, 0]);
      // upright ribs on the sides where the walls reach the deck
      const ribBars = windowRow(-bottom / 2 + 3, bottom / 2 - 3, 9).map((x) => Manifold.union([box(wasm, [x - 0.7, x + 0.7, HALF - 0.3, HALF + RELIEF, 0, H - 1]), box(wasm, [x - 0.7, x + 0.7, -HALF - RELIEF, -HALF + 0.3, 0, H - 1])]));
      const body = shell.subtract(inner).add(Manifold.union(ribBars));
      const floor = 6.2;
      return {
        body,
        sections: v.design.load ? [loadSection(heap(wasm, L - 10, HALF * 2 - 7, H - 5, 7), H - 5, [])] : [],
        band: { x0: -bottom / 2 + 2, x1: bottom / 2 - 2, z0: 2, z1: Math.min(H - 3, floor + 8), half: HALF },
      };
    }
    case "tank": {
      const r = Math.min(14, H / 2 + 1);
      const cz = H - r;
      const saddle = box(wasm, [x0 + 2, x1 - 2, -12, 12, 0, Math.max(3, cz - r + 3)]);
      const tank = cylinderX(wasm, r, x0 + 2, x1 - 2, 0, cz).intersect(box(wasm, [x0, x1, -r - 1, r + 1, 0, H + 1]));
      const caps = Manifold.union([cylinderX(wasm, r - 1.5, x0, x0 + 2.5, 0, cz), cylinderX(wasm, r - 1.5, x1 - 2.5, x1, 0, cz)]).intersect(box(wasm, [x0 - 1, x1 + 1, -r, r, 0, H]));
      // bands round the tank (above the saddle)
      const sections: Section[] = [{ slot: "details", solid: caps.add(bands(wasm, [x0 + L * 0.22, x1 - L * 0.22], r, cz, Math.max(3, cz - r + 3))) }];
      let body = Manifold.union([saddle, tank]);
      if (v.design.dome) {
        const dome = Manifold.cylinder(r + 4, 5, 5, SEG).translate([0, 0, cz]).add(Manifold.sphere(5, SEG).translate([0, 0, cz + r + 4]));
        const { pad, section } = seated(wasm, "details", dome, 5.2, 0, cz, cz + r + 0.6);
        body = body.add(pad);
        sections.push(section);
      }
      return { body, sections, band: { x0: x0 + 8, x1: x1 - 8, z0: cz - 4, z1: cz + 4, half: r } };
    }
    case "flat":
    case "logs":
    case "container":
    case "crane": {
      const deck = box(wasm, [x0, x1, -HALF, HALF, 0, 3]);
      const stakesWanted = v.kind === "flat" || v.kind === "logs";
      const n = Math.max(2, Math.round(L / 30));
      const stakes = stakesWanted
        ? Array.from({ length: n }, (_, i) => x0 + 3 + ((L - 6) * i) / (n - 1)).flatMap((x) => [
            box(wasm, [x - 1.5, x + 1.5, HALF - 3, HALF, 3, Math.max(H, 10)]),
            box(wasm, [x - 1.5, x + 1.5, -HALF, -HALF + 3, 3, Math.max(H, 10)]),
          ])
        : [];
      // planks of the deck: grooves along the wagon
      const deckLines = Manifold.union([-10, -5, 0, 5, 10].map((y) => box(wasm, [x0 + 2, x1 - 2, y - 0.4, y + 0.4, 2.4, 4])));
      const body = Manifold.union([deck, ...stakes]).subtract(deckLines);
      const sections: Section[] = [];
      const loadPins: [number, number][] = [[-L / 6, 0], [L / 6, 0]];
      if (v.kind === "flat" && v.design.load) {
        const crate = (L - 14) / 2;
        const crates = Manifold.union([roundedBlock(wasm, crate, 22, 1, 3, Math.max(H - 2, 10), x0 + 5 + crate / 2, 0), roundedBlock(wasm, crate, 22, 1, 3, Math.max(H - 5, 8), x1 - 5 - crate / 2, 0)]);
        sections.push(loadSection(crates, 3, [[x0 + 5 + crate / 2, 0], [x1 - 5 - crate / 2, 0]]));
      }
      if (v.kind === "logs" && v.design.load) {
        const lr = 5;
        const len = L - 10;
        const log = (y: number, z: number) => cylinderX(wasm, lr, -len / 2, len / 2, y, z);
        const logs = Manifold.union([log(-5.6, 3 + lr - 0.8), log(5.6, 3 + lr - 0.8), log(0, 3 + 2 * lr + 3.5)]).intersect(box(wasm, [-L, L, -20, 20, 3, 40]));
        sections.push(loadSection(logs, 3, [[-L / 4, -5.6], [L / 4, 5.6]]));
      }
      if (v.kind === "container" && v.design.load) {
        const cl = L - 8;
        let container = box(wasm, [-cl / 2, cl / 2, -15, 15, 3, H + 3]);
        const ribs = Manifold.union(windowRow(-cl / 2 + 3, cl / 2 - 3, 4).flatMap((x) => [box(wasm, [x - 0.8, x + 0.8, 14.4, 16, 5, H + 1]), box(wasm, [x - 0.8, x + 0.8, -16, -14.4, 5, H + 1])]));
        container = container.subtract(ribs);
        sections.push(loadSection(container, 3, loadPins));
        // pattern and lettering go onto the container
        return { body, sections, band: { x0: -cl / 2 + 3, x1: cl / 2 - 3, z0: 6, z1: H + 1, half: 15 }, bandOnLoad: true };
      }
      if (v.kind === "crane") {
        // turret, cab and a jib rising at 45° (prints without support)
        const turret = Manifold.cylinder(5, 12, 12, SEG).translate([-L / 6, 0, 3]);
        const cab = roundedBlock(wasm, 20, 22, 2, 8, 24, -L / 6 - 2, 0);
        const jib = sideProfile(
          wasm,
          [
            [-L / 6 + 6, 8],
            [-L / 6 + 12, 8],
            [-L / 6 + 12 + 26, 34],
            [-L / 6 + 6 + 26, 34],
          ],
          3,
        );
        // a pulley block on the tip of the jib (sits on it, nothing hangs down)
        const pulley = box(wasm, [-L / 6 + 31, -L / 6 + 37, -2, 2, 33, 36]);
        sections.push({ slot: "details", solid: Manifold.union([turret, cab, jib, pulley]), mount: { z: 3, pins: [[-L / 6, 0]] } });
        if (v.design.load) sections.push(loadSection(roundedBlock(wasm, 18, 20, 1, 3, 12, L / 3 - 4, 0), 3, [[L / 3 - 4, 0]]));
      }
      return { body, sections, band: { x0: x0 + 2, x1: x1 - 2, z0: 0.3, z1: 2.7, half: HALF } };
    }
    default:
      return closedWagon(wasm, v, H, x0, x1);
  }
}

/** Box, reefer, mail, caboose, passenger, double-deck and dining cars: a closed body with a roof. */
function closedWagon(wasm: ManifoldToplevel, v: Vehicle, H: number, x0: number, x1: number): BodyShape {
  const { Manifold } = wasm;
  const { full, roof, roofZ } = roofed(wasm, v, x0, x1, HALF, H);
  let body = full;
  const L = x1 - x0;
  let band: Band = { x0: x0 + 4, x1: x1 - 4, z0: 3, z1: Math.min(roofZ - 2, 12), half: HALF };
  const extra: Section[] = [];
  /** small things on the roof (vents, hatches, a chimney): printed with the roof */
  const onRoof = (solid: Manifold) => extra.push({ slot: "details", solid, onRoof: true });
  const roofTop = (y: number) => (v.design.roof === "round" ? H - 4 * (y / HALF) ** 2 : v.design.roof === "peaked" ? H - Math.min(HALF * 0.55, 9) * (Math.abs(y) / HALF) : H);
  switch (v.kind) {
    case "box":
    case "mail": {
      const door = Math.min(26, L * 0.35);
      const frame = sideRecesses(wasm, HALF, [0], door, 3, roofZ - 3, 0.8).subtract(sideRecesses(wasm, HALF + 0.01, [0], door - 3, 4.5, roofZ - 4.5, 2));
      body = body.subtract(frame);
      // planks beside the door, the rail the door runs on
      const lines = planks(wasm, HALF, x0 + 3, x1 - 3, 3, roofZ - 3, 5, [-door / 2 - 2, door / 2 + 2]);
      if (lines) body = body.subtract(lines);
      extra.push({ slot: "details", solid: sideBar(wasm, HALF, -door, door, roofZ - 2, 1) });
      if (v.kind === "mail" && v.design.windows) body = body.subtract(sideRecesses(wasm, HALF, [x0 + L * 0.18, x1 - L * 0.18], 6, roofZ - 8, roofZ - 4));
      band = { x0: x0 + 3, x1: -door / 2 - 2, z0: 3, z1: roofZ - 3, half: HALF };
      break;
    }
    case "reefer": {
      const ribs = sideRecesses(wasm, HALF, windowRow(x0 + 3, x1 - 3, 7), 1.2, 2, roofZ - 2, 0.7);
      body = body.subtract(ribs);
      // ice hatches at both ends of the roof
      onRoof(Manifold.union([x0 + 9, x1 - 9].map((x) => roundedBlock(wasm, 8, 8, 1, roofTop(4) - 1.5, H + 1.5, x, 0))));
      band = { x0: x0 + 4, x1: x1 - 4, z0: roofZ / 2 - 4, z1: roofZ / 2 + 4, half: HALF };
      break;
    }
    case "caboose": {
      if (v.design.windows) body = body.subtract(sideRecesses(wasm, HALF, windowRow(x0 + 8, x1 - 8, 16), 7, roofZ - 11, roofZ - 4));
      // a cupola on the roof, part of the roof
      const cupola = roundedBlock(wasm, L * 0.36, 22, 2, roofZ, H + 9, 0, 0);
      const cupolaWindows = sideRecesses(wasm, 11, [0], L * 0.2, H + 2, H + 7, 1);
      roof.solid = roof.solid.add(cupola.subtract(cupolaWindows));
      // the stove pipe at the far end of the roof
      onRoof(Manifold.cylinder(H + 6 - (roofTop(0) - 1.5), 1.5, 1.5, 24).translate([x1 - 7, 0, roofTop(0) - 1.5]));
      band = { x0: x0 + 4, x1: x1 - 4, z0: 3, z1: roofZ - 13, half: HALF };
      break;
    }
    default: {
      // passenger, double deck, dining
      const rows = v.kind === "doubledeck" ? 2 : 1;
      const width = v.kind === "dining" ? 13 : 8;
      if (v.design.windows) {
        const xs = windowRow(x0 + 12, x1 - 12, v.kind === "dining" ? 18 : 14);
        if (rows === 2) {
          const mid = roofZ / 2;
          body = body.subtract(sideRecesses(wasm, HALF, xs, width, mid + 3, roofZ - 3)).subtract(sideRecesses(wasm, HALF, xs, width, 4, mid - 3));
        } else body = body.subtract(sideRecesses(wasm, HALF, xs, width, roofZ - 12, roofZ - 3));
      }
      // doors at both ends, each with a small window
      body = body.subtract(sideRecesses(wasm, HALF, [x0 + 6, x1 - 6], 7, 3, roofZ - 1, 1));
      body = body.subtract(sideRecesses(wasm, HALF, [x0 + 6, x1 - 6], 4, roofZ - 10, roofZ - 4, 1.8));
      // a line along the side below the windows, vents on the roof
      if (rows === 1) extra.push({ slot: "details", solid: sideBar(wasm, HALF, x0 + 11, x1 - 11, roofZ - 13.5, 1) });
      onRoof(Manifold.union(windowRow(x0 + 14, x1 - 14, 22).map((x) => Manifold.cylinder(3.5, 1.8, 1.8, 24).translate([x, 0, roofTop(0) - 1.5]))));
      band = rows === 2 ? { x0: x0 + 12, x1: x1 - 12, z0: roofZ / 2 - 2.5, z1: roofZ / 2 + 2.5, half: HALF } : { x0: x0 + 12, x1: x1 - 12, z0: 2, z1: roofZ - 14, half: HALF };
    }
  }
  return { body, sections: [roof, ...extra], band };
}

/** The shape of a body by its kind. */
function bodyShape(wasm: ManifoldToplevel, v: Vehicle): BodyShape {
  const H = bodyHeight(v);
  switch (v.kind) {
    case "steam":
      return steamBody(wasm, v, H, false);
    case "tankloco":
      return steamBody(wasm, v, H, true);
    case "diesel":
    case "shunter":
      return dieselBody(wasm, v, H);
    case "electric":
      return electricBody(wasm, v, H, false);
    case "highspeed":
      return electricBody(wasm, v, H, true);
    case "cyberbrick":
      return cyberbrickBody(wasm, v, H);
    default:
      return wagonBody(wasm, v, H);
  }
}

export interface BodyParts {
  /** the body in the body colour (in split mode with pins for the sections) */
  body: Manifold;
  /** coloured parts: volumes of the body object, or separate print parts (separate = true) */
  parts: { slot: SlotKey; solid: Manifold; separate: boolean }[];
}

/** The body and its coloured parts, in the body frame (Z = 0 on the deck). */
export function buildBody(wasm: ManifoldToplevel, v: Vehicle): BodyParts {
  const { Manifold } = wasm;
  const shape = bodyShape(wasm, v);
  const split = v.design.split;
  let body = shape.body;
  let sections = [...shape.sections];
  if (split) {
    // what sits on a separately printed roof is printed with it
    const roof = sections.find((s) => s.slot === "roof" && s.mount);
    if (roof) {
      for (const s of sections.filter((x) => x.onRoof && !x.mount)) roof.solid = roof.solid.add(s.solid);
      sections = sections.filter((x) => !(x.onRoof && !x.mount));
    }
  }

  // decoration: pattern and lettering on the sides, face and lamps on the front
  const raised: Manifold[] = [];
  const engraved: Manifold[] = [];
  const put = (make: (inner: number, outer: number) => Manifold) => {
    if (split) engraved.push(make(ENGRAVE_DEPTH, 1));
    else raised.push(make(DECOR_EMBED, DECOR_RAISE));
  };
  if (shape.band) {
    const band = shape.band;
    const text = letteringOutline(wasm, cleanLettering(v.design.lettering), band);
    const pattern = patternOutline(wasm, v.design.decor, band, text?.width ?? 0);
    if (text) put((i, o) => onSides(text.outline, band, i, o));
    if (pattern) put((i, o) => onSides(pattern, band, i, o));
  }
  if (v.design.face && shape.face) {
    const face = shape.face;
    put((i, o) => onFront(faceOutline(wasm, face.r), face, i, o));
  }
  if (raised.length > 0) sections.push({ slot: "decor", solid: Manifold.union(raised) });
  if (engraved.length > 0) {
    const cut = Manifold.union(engraved);
    const load = shape.bandOnLoad ? sections.find((s) => s.slot === "load") : undefined;
    if (load) load.solid = load.solid.subtract(cut);
    else body = body.subtract(cut);
  }
  if (v.design.lamps && shape.lamps) {
    const lamps = shape.lamps;
    const lampSolid = Manifold.union(lamps.spots.map(([y, z]) => cylinderX(wasm, 2.4, lamps.x - 1, lamps.x + 1.8, y, z)));
    sections.push({ slot: "details", solid: lampSolid });
  }

  // the body takes everything that cannot be printed on its own
  const parts: BodyParts["parts"] = [];
  const pinHoles: Manifold[] = [];
  for (const s of sections) {
    if (split && s.mount) {
      // the separate part takes its place out of the body (a roof is part of the body's box)
      body = body.subtract(s.solid);
      const pins = s.mount.pins.map(([x, y]) => Manifold.cylinder(SECTION_PIN_HEIGHT + 1, SECTION_PIN_DIAMETER / 2, SECTION_PIN_DIAMETER / 2 - 0.2, 24).translate([x, y, s.mount!.z - 1]));
      if (pins.length > 0) {
        body = body.add(Manifold.union(pins));
        const holes = s.mount.pins.map(([x, y]) => Manifold.cylinder(SECTION_PIN_HEIGHT + 0.6, (SECTION_PIN_DIAMETER + SECTION_PIN_FIT) / 2, (SECTION_PIN_DIAMETER + SECTION_PIN_FIT) / 2, 24).translate([x, y, s.mount!.z - 0.01]));
        pinHoles.push(...holes);
        parts.push({ slot: s.slot, solid: s.solid.subtract(Manifold.union(holes)), separate: true });
      } else parts.push({ slot: s.slot, solid: s.solid, separate: true });
    } else if (split) {
      body = body.add(s.solid);
    } else {
      parts.push({ slot: s.slot, solid: s.solid, separate: false });
    }
  }
  void pinHoles;

  // holes for the pins of the chassis
  const holes = Manifold.union(
    bodyPins(v).map((x) => Manifold.cylinder(BODY_PIN_HEIGHT + 0.5, (BODY_PIN_DIAMETER + BODY_PIN_FIT) / 2, (BODY_PIN_DIAMETER + BODY_PIN_FIT) / 2, SEG).translate([x, 0, -0.01])),
  );
  body = body.subtract(holes);
  // coloured volumes of one object must not overlap: the body gives way; nothing below the deck
  const floor = box(wasm, [-v.length, v.length, -40, 40, 0, 200]);
  const merged: BodyParts["parts"] = [];
  for (const slot of ["roof", "details", "load", "decor"] as SlotKey[]) {
    const own = parts.filter((p) => p.slot === slot);
    const separate = own.filter((p) => p.separate);
    const volumes = own.filter((p) => !p.separate);
    for (const p of separate) merged.push(p);
    if (volumes.length > 0) {
      let solid = Manifold.union(volumes.map((p) => p.solid)).intersect(floor).subtract(holes);
      // earlier slots win where volumes overlap
      for (const m of merged.filter((x) => !x.separate)) solid = solid.subtract(m.solid);
      if (!solid.isEmpty()) merged.push({ slot, solid, separate: false });
    }
  }
  for (const p of merged.filter((x) => !x.separate)) body = body.subtract(p.solid);
  return { body, parts: merged };
}

// ------------------------------------------------------------------------------ wheels and axles

/** One wheel of radius r, flat on the bed (axis along Z), with a D-shaped hole. */
export function buildWheel(wasm: ManifoldToplevel, r: number, fits: Fits): Manifold {
  // a cone cuts a small chamfer on the bottom edge (the first layer does not bulge out)
  const chamfered = wasm.Manifold.cylinder(WHEEL_WIDTH, r, r, SEG * 2).intersect(wasm.Manifold.cylinder(WHEEL_WIDTH, r - 0.6, r - 0.6 + WHEEL_WIDTH, SEG * 2));
  const hole = axleSection(wasm, AXLE_DIAMETER - fits.wheelPress).extrude(WHEEL_WIDTH + 2).translate([0, 0, -1]);
  // four shallow recesses on the outer face, like spokes
  const dots = wasm.Manifold.union(
    [0, 90, 180, 270].map((a) => wasm.Manifold.cylinder(1, r * 0.22, r * 0.22, 24).translate([Math.cos((a * Math.PI) / 180) * r * 0.55, Math.sin((a * Math.PI) / 180) * r * 0.55, WHEEL_WIDTH - 0.8])),
  );
  return chamfered.subtract(hole).subtract(dots);
}

/** One axle lying on its flat along X. */
export function buildAxle(wasm: ManifoldToplevel, v: Vehicle, fits: Fits): Manifold {
  const s = chassisSizes(v, fits);
  return axleSection(wasm, AXLE_DIAMETER)
    .extrude(s.axleLength)
    .rotate([0, 90, 0])
    .rotate([90, 0, 0])
    .translate([-s.axleLength / 2, 0, 0]);
}

export interface VehicleSolids {
  chassis: Manifold;
  body: Manifold;
  parts: BodyParts["parts"];
  /** one wheel per size with its count */
  wheels: { radius: number; solid: Manifold; count: number }[];
  axle: Manifold;
  /** drive parts (CyberBrick): worm and worm wheel */
  drive: { name: "worm" | "wormWheel"; solid: Manifold }[];
  /** for the preview: all wheels, axles and gears in place, in the chassis frame */
  running: Manifold;
  /** for the preview: motor, battery and boards (CyberBrick), in the chassis frame */
  inside?: Manifold;
}

export function buildVehicle(wasm: ManifoldToplevel, v: Vehicle, fits: Fits): VehicleSolids {
  const s = chassisSizes(v, fits);
  const chassis = buildChassis(wasm, v, fits);
  const { body, parts } = buildBody(wasm, v);
  const radii = [...new Set(s.axles.map((a) => a.radius))];
  const wheels = radii.map((radius) => ({ radius, solid: buildWheel(wasm, radius, fits), count: 2 * s.axles.filter((a) => a.radius === radius).length }));
  const axle = buildAxle(wasm, v, fits);
  const wheelOf = (r: number) => (wheels.find((w) => w.radius === r) as { solid: Manifold }).solid;
  const wheelInPlace = (x: number, z: number, r: number, side: number) =>
    wheelOf(r)
      .translate([0, 0, -WHEEL_WIDTH / 2])
      .rotate([side > 0 ? -90 : 90, 0, 0])
      .translate([x, (side * WHEEL_SPACING) / 2, z]);
  const axleInPlace = (x: number, z: number) => wasm.Manifold.cylinder(s.axleLength, AXLE_DIAMETER / 2, AXLE_DIAMETER / 2, 24, true).rotate([90, 0, 0]).translate([x, 0, z]);
  const running: Manifold[] = s.axles.flatMap((a) => [wheelInPlace(a.x, a.z, a.radius, 1), wheelInPlace(a.x, a.z, a.radius, -1), axleInPlace(a.x, a.z)]);
  let drive: VehicleSolids["drive"] = [];
  let inside: Manifold | undefined;
  if (v.kind === "cyberbrick") {
    const d = cyberbrickDrive(wasm, v, s, fits);
    drive = [
      { name: "worm", solid: d.worm },
      { name: "wormWheel", solid: d.wheel },
    ];
    running.push(d.wormInPlace, d.wheelInPlace);
    inside = d.inside;
  }
  return { chassis, body, parts, wheels, axle, drive, running: wasm.Manifold.union(running), ...(inside ? { inside } : {}) };
}
