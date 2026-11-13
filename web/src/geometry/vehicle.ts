// Vehicles as solids. Frame: X along the vehicle (front at +X), Y across, Z up; Z = 0 is the
// bottom of the chassis. The body has its own frame with Z = 0 on the deck.
//
// Print orientation: chassis and body upright as modelled, wheels flat, axles lying on their flat.
import type { CrossSection, Manifold, ManifoldToplevel } from "manifold-3d";
import { bodyHeight, chassisSizes, couplerSizes } from "../core/vehicle";
import type { ChassisSizes, Coupler, Fits, Vehicle } from "../core/vehicle";
import { MIN_WALL } from "../presets/print";
import { AXLE_DIAMETER, WHEEL_SPACING, WHEEL_WIDTH } from "../presets/vehicle";

const SEG = 48;
/** body pins on the deck, pressed into holes in the body */
export const BODY_PIN_DIAMETER = 5;
export const BODY_PIN_HEIGHT = 4;
export const BODY_PIN_FIT = 0.1;
/** the flat on the axle (and in the wheel hole), so that the wheels turn with the axle */
export const AXLE_FLAT = 0.4;
const CORNER = 3;
/** the body keeps this much off the deck edge */
const BODY_INSET = 1;

type Box = [number, number, number, number, number, number];

function box(wasm: ManifoldToplevel, [x0, x1, y0, y1, z0, z1]: Box): Manifold {
  return wasm.Manifold.cube([x1 - x0, y1 - y0, z1 - z0], false).translate([x0, y0, z0]);
}

/** A rounded rectangle extruded from z0 to z1. */
function roundedBlock(wasm: ManifoldToplevel, lx: number, ly: number, r: number, z0: number, z1: number, cx = 0, cy = 0): Manifold {
  const radius = Math.min(r, lx / 2 - 0.01, ly / 2 - 0.01);
  const core = wasm.CrossSection.square([lx - 2 * radius, ly - 2 * radius], true);
  const outline = radius > 0 ? core.offset(radius, "Round", 2, SEG) : core;
  return outline.extrude(z1 - z0).translate([cx, cy, z0]);
}

/** A cylinder along X from x0 to x1 with its axis at (y, z). */
function cylinderX(wasm: ManifoldToplevel, r: number, x0: number, x1: number, y: number, z: number): Manifold {
  return wasm.Manifold.cylinder(x1 - x0, r, r, SEG).rotate([0, 90, 0]).translate([x0, y, z]);
}

/** A cylinder along Y centred at (x, z). */
function cylinderY(wasm: ManifoldToplevel, r: number, length: number, x: number, z: number, segments = SEG): Manifold {
  return wasm.Manifold.cylinder(length, r, r, segments, true).rotate([90, 0, 0]).translate([x, 0, z]);
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
    const pin = wasm.Manifold.cylinder(c.pinHeight, c.pinDiameter / 2, c.pinDiameter / 2 * 0.8, SEG).translate([tip - hole, 0, c.hookTop]);
    return tongue.add(pin);
  }
  // eye: a plate over the hook of the next vehicle, carried by a 45° slope (prints without support)
  const width = Math.max(c.armWidth, c.eyeHole + 2 * MIN_WALL + 1);
  const flat = end + 4;
  const side = wasm.CrossSection.ofPolygons([
    [
      [root, 0],
      [flat - c.eyeBottom, 0],
      [flat, c.eyeBottom],
      [tip, c.eyeBottom],
      [tip, c.eyeTop],
      [root, c.eyeTop],
    ],
  ]);
  const plate = side.extrude(width).rotate([90, 0, 0]).translate([0, width / 2, 0]);
  const eye = wasm.Manifold.cylinder(c.eyeTop - c.eyeBottom + 2, c.eyeHole / 2, c.eyeHole / 2, SEG).translate([tip - hole, 0, c.eyeBottom - 1]);
  return plate.subtract(eye);
}

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
  for (const sign of [1, -1]) {
    chassis = chassis.add(roundedBlock(wasm, 4, W, 1, 0, s.deckBottom, sign * (L / 2 - 2), 0));
  }
  const front = coupler(wasm, v, v.front, fits, s);
  const rear = coupler(wasm, v, v.rear, fits, s)?.mirror([1, 0, 0]);
  if (front) chassis = chassis.add(front);
  if (rear) chassis = chassis.add(rear);
  // axle holes through skirts and beam
  const holes = s.axleX.map((x) => cylinderY(wasm, s.axleHole / 2, W + 2, x, s.axleZ));
  chassis = chassis.subtract(Manifold.union(holes));
  // body pins
  const pins = bodyPinsX(v).map((x) => Manifold.cylinder(BODY_PIN_HEIGHT, BODY_PIN_DIAMETER / 2, BODY_PIN_DIAMETER / 2 - 0.3, SEG).translate([x, 0, s.deckTop]));
  return chassis.add(Manifold.union(pins));
}

export const bodyPinsX = (v: Vehicle) => [v.length / 4, -v.length / 4];

// ------------------------------------------------------------------------------ bodies

interface BodyParts {
  body: Manifold;
  accent?: Manifold;
}

/** Window recesses in both side walls at y = ±half. */
function sideRecesses(wasm: ManifoldToplevel, half: number, xs: number[], w: number, z0: number, z1: number, depth = 1.5): Manifold {
  const list = xs.flatMap((x) => [box(wasm, [x - w / 2, x + w / 2, half - depth, half + 1, z0, z1]), box(wasm, [x - w / 2, x + w / 2, -half - 1, -half + depth, z0, z1])]);
  return wasm.Manifold.union(list);
}

/** A box from z0 to z1 whose top is rounded across (a barrel roof dropping `drop` mm at the sides). */
function barrelBox(wasm: ManifoldToplevel, x0: number, x1: number, half: number, z0: number, z1: number, drop: number): Manifold {
  const b = box(wasm, [x0, x1, -half, half, z0, z1]);
  if (drop <= 0) return b;
  const r = (half * half) / (2 * drop) + drop / 2;
  return b.intersect(cylinderX(wasm, r, x0 - 1, x1 + 1, 0, z1 - r));
}

function roofOf(wasm: ManifoldToplevel, v: Vehicle, x0: number, x1: number, half: number, top: number, thickness = 3): { full: Manifold; roof: Manifold } {
  const drop = v.design.roof === "round" ? 4 : 0;
  const full = barrelBox(wasm, x0, x1, half, 0, top, drop);
  const roof = full.intersect(box(wasm, [x0 - 1, x1 + 1, -half - 1, half + 1, top - drop - thickness, top + 1]));
  return { full, roof };
}

function steam(wasm: ManifoldToplevel, v: Vehicle, H: number): BodyParts {
  const { Manifold } = wasm;
  const L = v.length - 2 * BODY_INSET;
  const half = 16;
  const x0 = -L / 2;
  const x1 = L / 2;
  const cab = Math.max(26, L * 0.32);
  const cabEnd = x0 + cab;
  const { full: cabBox, roof } = roofOf(wasm, v, x0, cabEnd, half, H);
  const r = 11.5;
  const cz = 9;
  const base = box(wasm, [cabEnd - 1, x1, -half, half, 0, 4]);
  const boiler = cylinderX(wasm, r, cabEnd - 1, x1 - 6, 0, cz).intersect(box(wasm, [cabEnd - 2, x1, -r, r, 0, cz + r]));
  const smokebox = cylinderX(wasm, r + 0.8, x1 - 6, x1, 0, cz).intersect(box(wasm, [x1 - 7, x1 + 1, -r - 1, r + 1, 0, cz + r + 1]));
  let body = Manifold.union([cabBox, base, boiler, smokebox]);
  if (v.design.windows) body = body.subtract(sideRecesses(wasm, half, [x0 + cab / 2], Math.min(12, cab - 10), H - 17, H - 8));
  const accents: Manifold[] = [roof, smokebox];
  if (v.design.chimney !== "none") {
    const hc = v.design.chimney === "tall" ? 13 : 7;
    const cx = x1 - 12;
    accents.push(Manifold.cylinder(r + hc, 4, 4.5, SEG).translate([cx, 0, cz]));
    accents.push(Manifold.cylinder(2.5, 5.5, 5.5, SEG).translate([cx, 0, cz + r + hc - 2.5]));
  }
  if (v.design.dome) {
    const dx = (cabEnd + x1 - 12) / 2;
    accents.push(Manifold.cylinder(r + 3, 4.5, 4.5, SEG).translate([dx, 0, cz]).add(Manifold.sphere(4.5, SEG).translate([dx, 0, cz + r + 3])));
  }
  return { body, accent: Manifold.union(accents) };
}

function diesel(wasm: ManifoldToplevel, v: Vehicle, H: number, electric: boolean): BodyParts {
  const { Manifold } = wasm;
  const L = v.length - 2 * BODY_INSET;
  const half = 16;
  const x0 = -L / 2;
  const x1 = L / 2;
  if (electric) {
    const top = H - 6;
    const { full, roof } = roofOf(wasm, v, x0, x1, half, top);
    let body = full;
    if (v.design.windows) {
      const n = Math.max(2, Math.floor((L - 30) / 16));
      const xs = Array.from({ length: n }, (_, i) => x0 + 15 + ((L - 30) * (i + 0.5)) / n);
      body = body.subtract(sideRecesses(wasm, half, xs, 9, top - 15, top - 8));
      body = body.subtract(box(wasm, [x1 - 1.5, x1 + 1, -10, 10, top - 15, top - 7])).subtract(box(wasm, [x0 - 1, x0 + 1.5, -10, 10, top - 15, top - 7]));
    }
    // pantograph: a base and a standing frame, prints without support
    const pz = top - (v.design.roof === "round" ? 1.5 : 0.5);
    const bow = box(wasm, [-1, 1, -9, 9, pz, pz + 7]).subtract(box(wasm, [-2, 2, -7, 7, pz + 0.01, pz + 5]));
    const panto = Manifold.union([box(wasm, [-6, 6, -6, 6, pz - 1, pz + 1.5]), bow]);
    return { body, accent: roof.add(panto) };
  }
  const cab = Math.max(26, L * 0.3);
  const cabStart = x1 - cab;
  const { full: cabBox, roof } = roofOf(wasm, v, cabStart, x1, half, H);
  const hood = roundedBlock(wasm, cabStart - x0 + 1, 24, 3, 0, H * 0.68, (cabStart + x0) / 2, 0);
  const walk = box(wasm, [x0, x1, -half, half, 0, 3]);
  let body = Manifold.union([cabBox, hood, walk]);
  if (v.design.windows) {
    body = body.subtract(sideRecesses(wasm, half, [cabStart + cab / 2], cab - 10, H - 16, H - 8));
    body = body.subtract(box(wasm, [x1 - 1.5, x1 + 1, -11, 11, H - 16, H - 8]));
  }
  const grille = sideRecesses(wasm, 12, [(cabStart + x0) / 2], Math.max(8, cabStart - x0 - 14), 6, H * 0.68 - 5, 0.8);
  body = body.subtract(grille);
  return { body, accent: roof };
}

function openBox(wasm: ManifoldToplevel, L: number, half: number, H: number, floor: number, wall = 2.4): Manifold {
  const outer = roundedBlock(wasm, L, half * 2, 2, 0, H);
  const inner = roundedBlock(wasm, L - 2 * wall, half * 2 - 2 * wall, 1, floor, H + 1);
  return outer.subtract(inner);
}

/** A heap (coal, gravel) inside a box: a stretched dome. */
function heap(wasm: ManifoldToplevel, lx: number, ly: number, z: number, rise: number, cx = 0): Manifold {
  return wasm.Manifold.sphere(1, SEG).scale([lx / 2, ly / 2, rise]).intersect(box(wasm, [-lx, lx, -ly, ly, 0, rise + 1])).translate([cx, 0, z]);
}

function wagon(wasm: ManifoldToplevel, v: Vehicle, H: number): BodyParts {
  const { Manifold } = wasm;
  const L = v.length - 2 * BODY_INSET;
  const half = 16;
  const x0 = -L / 2;
  const x1 = L / 2;
  switch (v.kind) {
    case "tender": {
      const body = openBox(wasm, L, half, H, H - 6);
      return { body, accent: v.design.load ? heap(wasm, L - 6, half * 2 - 6, H - 6.5, 7) : undefined };
    }
    case "hopper": {
      const bottom = L * 0.6;
      const side = wasm.CrossSection.ofPolygons([
        [
          [-bottom / 2, 0],
          [bottom / 2, 0],
          [x1, H],
          [x0, H],
        ],
      ]);
      const shell = side.extrude(half * 2).rotate([90, 0, 0]).translate([0, half, 0]);
      // the inside, lifted so that it opens at the top; the walls lean outwards, so they stay thick
      const inner = side.offset(-3, "Miter").translate([0, 3.2]).extrude(half * 2 - 4.8).rotate([90, 0, 0]).translate([0, half - 2.4, 0]);
      const body = shell.subtract(inner);
      return { body, accent: v.design.load ? heap(wasm, L - 8, half * 2 - 7, H - 5, 7) : undefined };
    }
    case "tank": {
      const r = Math.min(14, H / 2 + 1);
      const cz = H - r;
      const saddle = box(wasm, [x0 + 2, x1 - 2, -12, 12, 0, Math.max(3, cz - r + 3)]);
      const tank = cylinderX(wasm, r, x0 + 2, x1 - 2, 0, cz).intersect(box(wasm, [x0, x1, -r - 1, r + 1, 0, H + 1]));
      const caps = Manifold.union([cylinderX(wasm, r - 1.5, x0, x0 + 2.5, 0, cz), cylinderX(wasm, r - 1.5, x1 - 2.5, x1, 0, cz)]).intersect(box(wasm, [x0 - 1, x1 + 1, -r, r, 0, H]));
      const body = Manifold.union([saddle, tank]);
      const accents = [caps];
      if (v.design.dome) accents.push(Manifold.cylinder(r + 4, 5, 5, SEG).translate([0, 0, cz]).add(Manifold.sphere(5, SEG).translate([0, 0, cz + r + 4])).subtract(tank));
      return { body, accent: Manifold.union(accents) };
    }
    case "flat": {
      const deck = box(wasm, [x0, x1, -half, half, 0, 3]);
      const n = Math.max(2, Math.round(L / 30));
      const stakes = Array.from({ length: n }, (_, i) => x0 + 3 + ((L - 6) * i) / (n - 1)).flatMap((x) => [
        box(wasm, [x - 1.5, x + 1.5, half - 3, half, 3, H]),
        box(wasm, [x - 1.5, x + 1.5, -half, -half + 3, 3, H]),
      ]);
      const accents = [...stakes];
      if (v.design.load) {
        const crate = (L - 14) / 2;
        accents.push(roundedBlock(wasm, crate, 22, 1, 3, H - 2, x0 + 5 + crate / 2, 0), roundedBlock(wasm, crate, 22, 1, 3, H - 5, x1 - 5 - crate / 2, 0));
      }
      return { body: deck, accent: Manifold.union(accents) };
    }
    case "passenger": {
      const { full, roof } = roofOf(wasm, v, x0, x1, half, H);
      let body = full;
      if (v.design.windows) {
        const n = Math.max(2, Math.floor((L - 24) / 14));
        const xs = Array.from({ length: n }, (_, i) => x0 + 12 + ((L - 24) * (i + 0.5)) / n);
        body = body.subtract(sideRecesses(wasm, half, xs, 8, H - 18, H - 9));
      }
      // doors at both ends
      body = body.subtract(sideRecesses(wasm, half, [x0 + 6, x1 - 6], 7, 3, H - 8, 1));
      return { body, accent: roof };
    }
    default: {
      // box wagon
      const { full, roof } = roofOf(wasm, v, x0, x1, half, H);
      const door = Math.min(26, L * 0.35);
      const frame = sideRecesses(wasm, half, [0], door, 3, H - 9, 0.8).subtract(sideRecesses(wasm, half + 0.01, [0], door - 3, 4.5, H - 10.5, 2));
      return { body: full.subtract(frame), accent: roof };
    }
  }
}

/** The body (and its accent parts) in the body frame: Z = 0 on the deck. */
export function buildBody(wasm: ManifoldToplevel, v: Vehicle): BodyParts {
  const H = bodyHeight(v);
  const parts = v.kind === "steam" ? steam(wasm, v, H) : v.kind === "diesel" || v.kind === "electric" ? diesel(wasm, v, H, v.kind === "electric") : wagon(wasm, v, H);
  const holes = wasm.Manifold.union(
    bodyPinsX(v).map((x) => wasm.Manifold.cylinder(BODY_PIN_HEIGHT + 0.5, (BODY_PIN_DIAMETER + BODY_PIN_FIT) / 2, (BODY_PIN_DIAMETER + BODY_PIN_FIT) / 2, SEG).translate([x, 0, -0.01])),
  );
  // accent parts are separate volumes: cut them out of the body, keep them above the deck
  const floor = box(wasm, [-v.length, v.length, -30, 30, 0, H + 40]);
  const accent = parts.accent ? parts.accent.intersect(floor).subtract(holes) : undefined;
  let body = parts.body.subtract(holes);
  if (accent) body = body.subtract(accent);
  return { body, accent: accent && !accent.isEmpty() ? accent : undefined };
}

// ------------------------------------------------------------------------------ wheels and axles

/** One wheel, flat on the bed (axis along Z), with a D-shaped hole. */
export function buildWheel(wasm: ManifoldToplevel, v: Vehicle, fits: Fits): Manifold {
  const s = chassisSizes(v, fits);
  const r = s.wheelRadius;
  // a cone cuts a small chamfer on the bottom edge (the first layer does not bulge out)
  const chamfered = wasm.Manifold.cylinder(WHEEL_WIDTH, r, r, SEG * 2).intersect(wasm.Manifold.cylinder(WHEEL_WIDTH, r - 0.6, r - 0.6 + WHEEL_WIDTH, SEG * 2));
  const hole = axleSection(wasm, s.wheelHole).extrude(WHEEL_WIDTH + 2).translate([0, 0, -1]);
  // four shallow recesses on the outer face, like spokes
  const dots = wasm.Manifold.union(
    [0, 90, 180, 270].map((a) => wasm.Manifold.cylinder(1, 1.8, 1.8, 24).translate([Math.cos((a * Math.PI) / 180) * r * 0.55, Math.sin((a * Math.PI) / 180) * r * 0.55, WHEEL_WIDTH - 0.8])),
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
  accent?: Manifold;
  wheel: Manifold;
  axle: Manifold;
  /** for the preview: all wheels and axles in place, in the chassis frame */
  running: Manifold;
}

export function buildVehicle(wasm: ManifoldToplevel, v: Vehicle, fits: Fits): VehicleSolids {
  const s = chassisSizes(v, fits);
  const chassis = buildChassis(wasm, v, fits);
  const { body, accent } = buildBody(wasm, v);
  const wheel = buildWheel(wasm, v, fits);
  const axle = buildAxle(wasm, v, fits);
  const wheelInPlace = (x: number, side: number) =>
    wheel
      .translate([0, 0, -WHEEL_WIDTH / 2])
      .rotate([side > 0 ? -90 : 90, 0, 0])
      .translate([x, (side * WHEEL_SPACING) / 2, s.axleZ]);
  const axleInPlace = (x: number) => wasm.Manifold.cylinder(s.axleLength, AXLE_DIAMETER / 2, AXLE_DIAMETER / 2, 24, true).rotate([90, 0, 0]).translate([x, 0, s.axleZ]);
  const running = wasm.Manifold.union(s.axleX.flatMap((x) => [wheelInPlace(x, 1), wheelInPlace(x, -1), axleInPlace(x)]));
  return { chassis, body, accent, wheel, axle, running };
}
