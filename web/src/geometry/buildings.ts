// Stations and small buildings as solids. Frame: X along the track, the track side is +Y, Z up,
// footprint centred on the origin. The roof is a separate print part on pins; details (platform
// edge, window frames, lamps) are volumes in their own colour.
import type { Manifold, ManifoldToplevel } from "manifold-3d";
import { SHED_OPENING } from "../core/buildings";
import type { Building } from "../core/buildings";
import { cleanLettering } from "../core/vehicle";
import { textOutline, textWidth } from "./text";
import { SECTION_PIN_DIAMETER, SECTION_PIN_FIT, SECTION_PIN_HEIGHT, box, cylinderX, sideProfile } from "./vehicle";

const SEG = 48;
const RECESS = 1.5;

export interface BuildingSolids {
  base: Manifold;
  /** printed separately, flat bottom at z */
  roof?: { solid: Manifold; z: number; pins: [number, number][] };
  details?: Manifold;
}

/** A gable roof over x0…x1, across ±half, from z (flat bottom) up to the ridge. */
function gable(wasm: ManifoldToplevel, x0: number, x1: number, half: number, z: number, rise: number, y0 = 0): Manifold {
  return wasm.CrossSection.ofPolygons([
    [
      [y0 - half, 0],
      [y0 + half, 0],
      [y0, rise],
    ],
  ])
    .extrude(x1 - x0)
    .rotate([90, 0, 90])
    .translate([x0, 0, z]);
}

/** Recesses (windows, doors) in the wall at y = face (sign: +1 the wall faces +Y). */
function recesses(wasm: ManifoldToplevel, face: number, sign: number, rects: [number, number, number, number][]): Manifold[] {
  return rects.map(([x0, x1, z0, z1]) => box(wasm, sign > 0 ? [x0, x1, face - RECESS, face + 1, z0, z1] : [x0, x1, face - 1, face + RECESS, z0, z1]));
}

/** Window frames: a thin raised ring around each window (details colour). */
function frames(wasm: ManifoldToplevel, face: number, sign: number, rects: [number, number, number, number][]): Manifold[] {
  return rects.map(([x0, x1, z0, z1]) => {
    const outer = box(wasm, sign > 0 ? [x0 - 1, x1 + 1, face - 0.5, face + 0.6, z0 - 1, z1 + 1] : [x0 - 1, x1 + 1, face - 0.6, face + 0.5, z0 - 1, z1 + 1]);
    const inner = box(wasm, sign > 0 ? [x0, x1, face - 2, face + 2, z0, z1] : [x0, x1, face - 2, face + 2, z0, z1]);
    return outer.subtract(inner);
  });
}

/** A name on the wall at y = face, facing +Y, centred at (x, z). */
function nameOn(wasm: ManifoldToplevel, text: string, face: number, x: number, z: number, maxWidth: number, height = 6): Manifold | undefined {
  const clean = cleanLettering(text);
  if (!clean) return undefined;
  const h = Math.min(height, (height * maxWidth) / Math.max(textWidth(clean, height), 1));
  const outline = textOutline(wasm, clean, h, Math.max(0.9, h * 0.17));
  if (!outline) return undefined;
  // seen from +Y the text runs towards −X: mirror it, then stand it up on the wall
  return outline
    .mirror([1, 0])
    .translate([0, -h / 2])
    .extrude(1.6)
    .rotate([90, 0, 0])
    .mirror([0, 1, 0])
    .translate([x, face - 1, z]);
}

function pinHoles(wasm: ManifoldToplevel, pins: [number, number][], z: number): Manifold {
  const r = (SECTION_PIN_DIAMETER + SECTION_PIN_FIT) / 2;
  return wasm.Manifold.union(pins.map(([x, y]) => wasm.Manifold.cylinder(SECTION_PIN_HEIGHT + 0.6, r, r, 24).translate([x, y, z - 0.01])));
}

function pinsOn(wasm: ManifoldToplevel, pins: [number, number][], z: number): Manifold {
  const r = SECTION_PIN_DIAMETER / 2;
  return wasm.Manifold.union(pins.map(([x, y]) => wasm.Manifold.cylinder(SECTION_PIN_HEIGHT + 1, r, r - 0.2, 24).translate([x, y, z - 1])));
}

/** Base with pins for the roof, the roof with holes. */
function withRoof(wasm: ManifoldToplevel, base: Manifold, roof: Manifold, z: number, pins: [number, number][], details?: Manifold): BuildingSolids {
  return {
    base: base.add(pinsOn(wasm, pins, z)),
    roof: { solid: roof.subtract(pinHoles(wasm, pins, z)), z, pins },
    ...(details ? { details } : {}),
  };
}

export function buildBuilding(wasm: ManifoldToplevel, b: Building): BuildingSolids {
  const { Manifold } = wasm;
  const L = b.length;
  const W = b.width;
  const H = b.height;
  switch (b.kind) {
    case "platform": {
      const slab = sideProfile(
        wasm,
        [
          [-L / 2, 0],
          [L / 2, 0],
          [L / 2 - 6, H],
          [-L / 2 + 6, H],
        ],
        W / 2,
      );
      const edge = box(wasm, [-L / 2 + 8, L / 2 - 8, W / 2 - 5, W / 2 - 2.5, H - 0.01, H + 0.6]);
      const bench = box(wasm, [-12, 12, -W / 2 + 4, -W / 2 + 10, H, H + 5]);
      return { base: slab.add(bench), details: edge };
    }
    case "station": {
      const ph = 14;
      const slab = box(wasm, [-L / 2, L / 2, -W / 2, W / 2, 0, ph]);
      const bw = W * 0.55;
      const bx = L * 0.36;
      const y0 = -W / 2 + 2;
      const y1 = y0 + bw;
      const rise = Math.min(bw * 0.38, 16);
      const wallTop = H - rise;
      let walls = box(wasm, [-bx, bx, y0, y1, ph - 0.01, wallTop]);
      const door: [number, number, number, number] = [-7, 7, ph, ph + 20];
      const windows: [number, number, number, number][] = [
        [-bx + 6, -bx + 18, ph + 8, ph + 20],
        [bx - 18, bx - 6, ph + 8, ph + 20],
        [-bx + 24, -14, ph + 8, ph + 20],
        [14, bx - 24, ph + 8, ph + 20],
      ].filter(([a, c]) => (c as number) - (a as number) > 4) as [number, number, number, number][];
      walls = walls.subtract(Manifold.union(recesses(wasm, y1, 1, [door, ...windows])));
      const edge = box(wasm, [-L / 2 + 6, L / 2 - 6, W / 2 - 5, W / 2 - 2.5, ph - 0.01, ph + 0.6]);
      const det = [edge, ...frames(wasm, y1, 1, windows)];
      const name = nameOn(wasm, b.name, y1, 0, Math.min(wallTop - 6, ph + 26), bx * 2 - 10);
      if (name) det.push(name);
      const roof = gable(wasm, -bx - 2, bx + 2, bw / 2 + 2, wallTop, rise + 2, (y0 + y1) / 2);
      // the chimney sits on the roof (printed with it)
      const chimney = box(wasm, [bx * 0.4, bx * 0.4 + 6, (y0 + y1) / 2 - 3, (y0 + y1) / 2 + 3, wallTop, H + 6]);
      const pins: [number, number][] = [
        [-bx + 6, (y0 + y1) / 2],
        [bx - 6, (y0 + y1) / 2],
      ];
      return withRoof(wasm, slab.add(walls), roof.add(chimney), wallTop, pins, Manifold.union(det));
    }
    case "house":
    case "signalbox": {
      const rise = Math.min(W * (b.kind === "house" ? 0.4 : 0.3), 22);
      const wallTop = H - rise;
      let walls = box(wasm, [-L / 2, L / 2, -W / 2, W / 2, 0, wallTop]);
      let rects: [number, number, number, number][];
      if (b.kind === "house") {
        rects = [
          [-5, 5, 0, 16],
          [-L / 2 + 5, -L / 2 + 15, 18, 28],
          [L / 2 - 15, L / 2 - 5, 18, 28],
        ].filter(([a, c]) => (c as number) - (a as number) > 3) as [number, number, number, number][];
      } else {
        // signal box: a door below, a band of windows above
        rects = [
          [-L / 2 + 6, -L / 2 + 14, 0, 16],
          [-L / 2 + 4, L / 2 - 4, wallTop - 18, wallTop - 6],
        ];
      }
      walls = walls.subtract(Manifold.union(recesses(wasm, W / 2, 1, rects)));
      if (b.kind === "signalbox") walls = walls.subtract(Manifold.union(recesses(wasm, -W / 2, -1, [[-L / 2 + 4, L / 2 - 4, wallTop - 18, wallTop - 6]])));
      const det: Manifold[] = frames(wasm, W / 2, 1, rects.slice(b.kind === "house" ? 1 : 1));
      const name = nameOn(wasm, b.name, W / 2, 0, b.kind === "house" ? wallTop - 5 : wallTop - 23, L - 8, 5);
      if (name) det.push(name);
      const roof = gable(wasm, -L / 2 - 2, L / 2 + 2, W / 2 + 2, wallTop, rise + 2);
      const chimney = b.kind === "house" ? box(wasm, [L / 4 - 3, L / 4 + 3, -W / 4 - 3, -W / 4 + 3, wallTop, H + 4]) : undefined;
      const pins: [number, number][] = [
        [-L / 2 + 6, 0],
        [L / 2 - 6, 0],
      ];
      return withRoof(wasm, walls, chimney ? roof.add(chimney) : roof, wallTop, pins, det.length > 0 ? Manifold.union(det) : undefined);
    }
    case "watertower": {
      const r = Math.min(L, W) / 2 - 2;
      const legTop = H * 0.48;
      const tankTop = H * 0.84;
      const cone = r - 4;
      const legs = [
        [1, 1],
        [1, -1],
        [-1, 1],
        [-1, -1],
      ].map(([sx, sy]) => box(wasm, [(sx as number) * r * 0.6 - 2, (sx as number) * r * 0.6 + 2, (sy as number) * r * 0.6 - 2, (sy as number) * r * 0.6 + 2, 0, legTop]));
      const column = Manifold.cylinder(legTop, 4.5, 4.5, SEG);
      const bottom = Manifold.cylinder(cone, 4, r, SEG).translate([0, 0, legTop - cone]);
      const tank = Manifold.cylinder(tankTop - legTop, r, r, SEG).translate([0, 0, legTop]);
      const base = Manifold.union([...legs, column, bottom, tank, box(wasm, [-r, r, -r, r, 0, 2])]);
      const ring = Manifold.cylinder(2.5, r + 0.6, r + 0.6, SEG).subtract(Manifold.cylinder(4, r - 1, r - 1, SEG).translate([0, 0, -1])).translate([0, 0, (legTop + tankTop) / 2]);
      const spout = cylinderX(wasm, 2, r - 2, r + 8, 0, tankTop - 8);
      const roof = Manifold.cylinder(H - tankTop, r + 1.5, 1.5, SEG).translate([0, 0, tankTop]);
      return withRoof(wasm, base, roof, tankTop, [[0, 0]], ring.add(spout));
    }
    case "shed": {
      const wall = 4;
      const rise = Math.min(W * 0.3, 24);
      const wallTop = Math.max(H - rise, SHED_OPENING.height + 8);
      const open = SHED_OPENING.width;
      const sides = [1, -1].map((s) => box(wasm, [-L / 2, L / 2, s > 0 ? W / 2 - wall : -W / 2, s > 0 ? W / 2 : -W / 2 + wall, 0, wallTop]));
      // end walls with an opening for the train; its top corners slope at 45° (no long bridge)
      const chamfer = 14;
      const hole = sideProfile(
        wasm,
        [
          [-open / 2, -1],
          [open / 2, -1],
          [open / 2, SHED_OPENING.height - chamfer],
          [open / 2 - chamfer, SHED_OPENING.height],
          [-open / 2 + chamfer, SHED_OPENING.height],
          [-open / 2, SHED_OPENING.height - chamfer],
        ],
        wall,
      ).rotate([0, 0, 90]);
      const ends = [1, -1].map((s) => box(wasm, [s > 0 ? L / 2 - wall : -L / 2, s > 0 ? L / 2 : -L / 2 + wall, -W / 2, W / 2, 0, wallTop]).subtract(hole.translate([s * (L / 2 - wall / 2), 0, 0])));
      let base = Manifold.union([...sides, ...ends]);
      const windows: [number, number, number, number][] = [];
      for (let x = -L / 2 + 20; x + 12 < L / 2 - 14; x += 26) windows.push([x, x + 12, wallTop - 26, wallTop - 10]);
      base = base.subtract(Manifold.union([...recesses(wasm, W / 2, 1, windows), ...recesses(wasm, -W / 2, -1, windows)]));
      const det = Manifold.union([...frames(wasm, W / 2, 1, windows), ...frames(wasm, -W / 2, -1, windows)]);
      const roof = gable(wasm, -L / 2 - 2, L / 2 + 2, W / 2 + 2, wallTop, rise + 2);
      const pins: [number, number][] = [
        [-L / 2 + 10, W / 2 - wall / 2],
        [L / 2 - 10, W / 2 - wall / 2],
        [-L / 2 + 10, -W / 2 + wall / 2],
        [L / 2 - 10, -W / 2 + wall / 2],
      ];
      return withRoof(wasm, base, roof, wallTop, pins, det);
    }
    case "signal": {
      const foot = box(wasm, [-L / 2, L / 2, -W / 2, W / 2, 0, 3]);
      const post = Manifold.cylinder(H - 18, 2.4, 2.2, 32).translate([0, 0, 3]);
      const head = box(wasm, [-3, 3, -4.5, 4.5, H - 18, H]).subtract(box(wasm, [2, 4, -3.5, 3.5, H - 16, H - 2]));
      const lamps = Manifold.union([cylinderX(wasm, 2.2, 1.6, 3.4, 0, H - 13), cylinderX(wasm, 2.2, 1.6, 3.4, 0, H - 6)]);
      return { base: Manifold.union([foot, post, head]).subtract(lamps), details: lamps };
    }
  }
}
