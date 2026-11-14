// Stations, platforms, tunnels and small buildings as solids. Frame: X along the track, the track
// side is +Y, Z up, footprint centred on the origin. Roofs are separate print parts on pins;
// details (platform edges, window frames, lamps, tunnel portals) are volumes in their own colour.
//
// Everything prints without support in the orientation it stands in: walls are upright, openings
// end in a 45° point, raised details stand at most about a millimetre off a wall or have a 45°
// slope below them, and roofs lie on their flat bottom.
import type { CrossSection, Manifold, ManifoldToplevel } from "manifold-3d";
import { HALL_EAVES, TUNNEL_BORE, TUNNEL_CURVE, TUNNEL_WALL } from "../core/buildings";
import type { Building } from "../core/buildings";
import { cleanLettering } from "../core/vehicle";
import { DUPLO, LEGO, STUD_FIT } from "../presets/bricks";
import { textOutline, textWidth } from "./text";
import { PROFILE_TO_TRACK, archOutline, sweep } from "./track";
import { SECTION_PIN_DIAMETER, SECTION_PIN_FIT, SECTION_PIN_HEIGHT, box, cylinderX, sideProfile } from "./vehicle";

const SEG = 48;
/** windows and doors are this deep */
const RECESS = 1.5;
/** raised details stand this far off a wall */
const RELIEF = 0.8;
/** the slab of a station and a halt */
const STATION_SLAB = 14;
/** the slab of a platform with a roof */
const PLATFORM_SLAB = 20;

type Pt = [number, number];
/** x0, x1, z0, z1 of an opening in a wall */
type Rect = [number, number, number, number];

export interface Roof {
  solid: Manifold;
  /** flat bottom at z */
  z: number;
  pins: Pt[];
}

export interface BuildingSolids {
  base: Manifold;
  /** printed separately, each on its flat bottom */
  roofs: Roof[];
  details?: Manifold;
}

/** Counter-clockwise order (the kernel fills only positive polygons). */
function ccw(points: Pt[]): Pt[] {
  let area = 0;
  for (let i = 0; i < points.length; i++) {
    const [x0, y0] = points[i] as Pt;
    const [x1, y1] = points[(i + 1) % points.length] as Pt;
    area += x0 * y1 - x1 * y0;
  }
  return area < 0 ? [...points].reverse() : points;
}

/** A section in (x, z) made solid from y0 to y1. */
function xzSolid(section: CrossSection, y0: number, y1: number): Manifold {
  return section.extrude(y1 - y0).rotate([90, 0, 0]).translate([0, y1, 0]);
}

/** A section in (y, z) made solid from x0 to x1. */
function yzSolid(section: CrossSection, x0: number, x1: number): Manifold {
  return section.extrude(x1 - x0).transform(PROFILE_TO_TRACK).translate([x0, 0, 0]);
}

const polygon = (wasm: ManifoldToplevel, points: Pt[]) => wasm.CrossSection.ofPolygons([ccw(points)]);

/** Evenly spread places between x0 and x1, about `step` apart. */
function spread(x0: number, x1: number, step: number): number[] {
  const n = Math.max(1, Math.floor((x1 - x0) / step));
  return Array.from({ length: n }, (_, i) => x0 + ((x1 - x0) * (i + 0.5)) / n);
}

/**
 * A gable roof over x0…x1, across ±half around y0, from z (flat bottom) up by `rise`. With
 * `courses` the slopes are stepped like rows of tiles: each row rises gently, then a small upright
 * step; every face looks up or sideways, so it prints as it lies.
 */
function gable(wasm: ManifoldToplevel, x0: number, x1: number, half: number, z: number, rise: number, y0 = 0, courses = 0): Manifold {
  const left: Pt[] = [[y0 - half, 0]];
  if (courses > 1) {
    const w = half / courses;
    const h = rise / courses;
    const step = Math.min(0.8, h / 3);
    for (let k = 0; k < courses - 1; k++) {
      const y = y0 - half + (k + 1) * w;
      left.push([y, (k + 1) * h - step], [y, (k + 1) * h]);
    }
  }
  left.push([y0, rise]);
  const right = left.slice(0, -1).map(([y, v]) => [2 * y0 - y, v] as Pt).reverse();
  return yzSolid(polygon(wasm, [...left, ...right]), x0, x1).translate([0, 0, z]);
}

/** Rectangular recesses (windows, doors) in the wall at y = face (sign: +1 the wall faces +Y). */
function recesses(wasm: ManifoldToplevel, face: number, sign: number, rects: Rect[], depth = RECESS): Manifold[] {
  return rects.map(([x0, x1, z0, z1]) => box(wasm, sign > 0 ? [x0, x1, face - depth, face + 1, z0, z1] : [x0, x1, face - 1, face + depth, z0, z1]));
}

/** Openings with a pointed top: recesses of `depth`, or through the wall between y0 and y1. */
function pointed(wasm: ManifoldToplevel, rects: Rect[], y0: number, y1: number): Manifold[] {
  return rects.map(([x0, x1, z0, z1]) => {
    const outline = archOutline(x0, x1, z0, z1);
    return outline ? xzSolid(polygon(wasm, outline), y0, y1) : box(wasm, [x0, x1, y0, y1, z0, z1]);
  });
}

const recessSpan = (face: number, sign: number, depth = RECESS): [number, number] => (sign > 0 ? [face - depth, face + 1] : [face - 1, face + depth]);

/** Window frames: a thin raised ring around each window (details colour). */
function frames(wasm: ManifoldToplevel, face: number, sign: number, rects: Rect[], open = false): Manifold[] {
  return rects.map(([x0, x1, z0, z1]) => {
    // a door frame (open) starts at the floor, a window frame goes round
    const bottom = open ? z0 : z0 - 1;
    const outer = box(wasm, sign > 0 ? [x0 - 1, x1 + 1, face - 0.5, face + 0.6, bottom, z1 + 1] : [x0 - 1, x1 + 1, face - 0.6, face + 0.5, bottom, z1 + 1]);
    const inner = box(wasm, [x0, x1, face - 2, face + 2, open ? z0 - 2 : z0, z1]);
    return outer.subtract(inner);
  });
}

/** Window bars: a cross in each window recess, a little behind the wall face. */
function muntins(wasm: ManifoldToplevel, face: number, sign: number, rects: Rect[], cross = true): Manifold[] {
  const [y0, y1] = sign > 0 ? [face - RECESS - 0.01, face - 0.4] : [face + 0.4, face + RECESS + 0.01];
  return rects.flatMap(([x0, x1, z0, z1]) => {
    const xm = (x0 + x1) / 2;
    const zm = (z0 + z1) / 2;
    const bars = [box(wasm, [xm - 0.5, xm + 0.5, y0, y1, z0, z1])];
    if (cross) bars.push(box(wasm, [x0, x1, y0, y1, zm - 0.5, zm + 0.5]));
    return bars;
  });
}

/** A band along a wall at height z with a 45° slope below it (cornice). */
function cornice(wasm: ManifoldToplevel, x0: number, x1: number, face: number, sign: number, z: number, out = 1.2): Manifold {
  const s = sign;
  const points: Pt[] = [
    [face - s * 0.5, z - 2 * out],
    [face, z - 2 * out],
    [face + s * out, z - out],
    [face + s * out, z],
    [face - s * 0.5, z],
  ];
  return yzSolid(polygon(wasm, points), x0, x1);
}

/** A clock on the wall at y = face (facing +Y): ring, hands and centre, raised. */
function clock(wasm: ManifoldToplevel, face: number, x: number, z: number, r: number): Manifold {
  const { CrossSection } = wasm;
  const ring = CrossSection.circle(r, SEG).subtract(CrossSection.circle(r - 1.2, SEG));
  const hour = CrossSection.square([1, r * 0.5], false).translate([-0.5, 0]).rotate(-60);
  const minute = CrossSection.square([0.8, r * 0.75], false).translate([-0.4, 0]);
  const centre = CrossSection.circle(1.1, 16);
  const shape = ring.add(hour).add(minute).add(centre).translate([x, z]);
  return xzSolid(shape, face - 0.3, face + RELIEF);
}

/** A lamp on a post: the head widens at 45° (prints without support). */
function lamp(wasm: ManifoldToplevel, x: number, y: number, z0: number, height: number): Manifold {
  const { Manifold } = wasm;
  const post = Manifold.cylinder(height - 4, 1.5, 1.2, 24).translate([x, y, z0]);
  const foot = Manifold.cylinder(1.2, 2.6, 2.6, 24).translate([x, y, z0]);
  const head = Manifold.cylinder(1.8, 1.2, 3, 24).translate([x, y, z0 + height - 4]);
  const cap = Manifold.cylinder(2.2, 3, 1.6, 24).translate([x, y, z0 + height - 2.2]);
  return Manifold.union([post, foot, head, cap]);
}

/** A solid bench: seat and backrest (facing +Y or −Y). */
function bench(wasm: ManifoldToplevel, x: number, y: number, z0: number, facing: 1 | -1, length = 16): Manifold {
  const seat = box(wasm, [x - length / 2, x + length / 2, y - 2, y + 2, z0, z0 + 3.5]);
  const back = box(wasm, [x - length / 2, x + length / 2, facing > 0 ? y - 2 : y + 1, facing > 0 ? y - 1 : y + 2, z0, z0 + 7]);
  return seat.add(back);
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

function pinHoles(wasm: ManifoldToplevel, pins: Pt[], z: number): Manifold {
  const r = (SECTION_PIN_DIAMETER + SECTION_PIN_FIT) / 2;
  return wasm.Manifold.union(pins.map(([x, y]) => wasm.Manifold.cylinder(SECTION_PIN_HEIGHT + 0.6, r, r, 24).translate([x, y, z - 0.01])));
}

function pinsOn(wasm: ManifoldToplevel, pins: Pt[], z: number): Manifold {
  const r = SECTION_PIN_DIAMETER / 2;
  return wasm.Manifold.union(pins.map(([x, y]) => wasm.Manifold.cylinder(SECTION_PIN_HEIGHT + 1, r, r - 0.2, 24).translate([x, y, z - 1])));
}

/** The base gets the pins of its roofs, each roof the holes for them. */
function finish(wasm: ManifoldToplevel, base: Manifold, roofs: Roof[], details: Manifold[] = []): BuildingSolids {
  let withPins = base;
  for (const r of roofs) if (r.pins.length > 0) withPins = withPins.add(pinsOn(wasm, r.pins, r.z));
  return {
    base: withPins,
    roofs: roofs.map((r) => ({ ...r, solid: r.pins.length > 0 ? r.solid.subtract(pinHoles(wasm, r.pins, r.z)) : r.solid })),
    ...(details.length > 0 ? { details: wasm.Manifold.union(details) } : {}),
  };
}

/** A platform slab with sloped ends. */
function slab(wasm: ManifoldToplevel, L: number, W: number, h: number): Manifold {
  return sideProfile(
    wasm,
    [
      [-L / 2, 0],
      [L / 2, 0],
      [L / 2 - 6, h],
      [-L / 2 + 6, h],
    ],
    W / 2,
  );
}

/** The white line along a platform edge at y (on the side `sign` faces). */
function edgeLine(wasm: ManifoldToplevel, L: number, y: number, sign: number, h: number): Manifold {
  const [y0, y1] = sign > 0 ? [y - 5, y - 2.5] : [y + 2.5, y + 5];
  return box(wasm, [-L / 2 + 8, L / 2 - 8, y0, y1, h - 0.01, h + 0.6]);
}

// ------------------------------------------------------------------------------ tunnels

/** The bore of a tunnel in (y, z): straight walls and a 45° point, reaching below the floor. */
function boreSection(wasm: ManifoldToplevel): CrossSection {
  const b = TUNNEL_BORE.width / 2;
  const w = TUNNEL_BORE.wall;
  return polygon(wasm, [
    [-b, -5],
    [b, -5],
    [b, w],
    [0, w + b],
    [-b, w],
  ]);
}

const aboveFloor = (wasm: ManifoldToplevel) => wasm.CrossSection.square([1000, 1000], false).translate([-500, 0]);

/** The rocky outline of a hill (half width and height as fractions), every step steep enough to print. */
const ROCKS: readonly Pt[] = [
  [1, 0],
  [0.88, 0.14],
  [0.92, 0.22],
  [0.8, 0.36],
  [0.84, 0.46],
  [0.74, 0.6],
  [0.76, 0.66],
  [0.6, 0.78],
  [0.4, 0.9],
  [0.16, 1],
];

/** The cross-section of a tunnel: a rocky hill around the bore, open below. */
function hillSection(wasm: ManifoldToplevel, W: number, H: number): CrossSection {
  const right = ROCKS.map(([u, v]) => [u * (W / 2), v * H] as Pt);
  const left = right.map(([y, z]) => [-y, z] as Pt).reverse();
  const rocks = polygon(wasm, [...right, ...left]);
  const around = boreSection(wasm).offset(TUNNEL_WALL, "Round", 2, 24);
  return rocks.add(around).intersect(aboveFloor(wasm)).subtract(boreSection(wasm));
}

/** The stone arch around a bore (details), as a section. */
function portalRing(wasm: ManifoldToplevel): CrossSection {
  const apex = TUNNEL_BORE.wall + TUNNEL_BORE.width / 2;
  const ring = boreSection(wasm).offset(4.5, "Miter", 2).subtract(boreSection(wasm)).intersect(aboveFloor(wasm));
  const key = polygon(wasm, [
    [-3, apex + 1],
    [3, apex + 1],
    [4, apex + 9],
    [-4, apex + 9],
  ]);
  return ring.add(key);
}

/** The stone arches stand this far off the ends of the hill, within the length of the tunnel (tunnels can meet end to end). */
const PORTAL_DEPTH = 1.2;

/**
 * A rocky peak on top of a hill: a pyramid from a base inside the hill (above the bore) to a point
 * a little off its middle. Every face looks up, so it prints without support.
 */
function peak(wasm: ManifoldToplevel, b: Building, x: number, halfX: number, rise: number): Manifold {
  const z0 = Math.min(TUNNEL_BORE.wall + TUNNEL_BORE.width / 2 + TUNNEL_WALL + 0.5, b.height - 2);
  const halfY = Math.min(0.34 * (b.width / 2), 22);
  const top = b.height + rise;
  return wasm.Manifold.hull([box(wasm, [x - halfX, x + halfX, -halfY, halfY, z0, z0 + 0.1]), box(wasm, [x + halfX * 0.2 - 0.5, x + halfX * 0.2 + 0.5, halfY * 0.15 - 0.5, halfY * 0.15 + 0.5, top - 0.1, top])]);
}

function tunnel(wasm: ManifoldToplevel, b: Building): BuildingSolids {
  const L = b.length;
  const d = PORTAL_DEPTH;
  // a hill with two peaks of different height along it
  const peaks = [peak(wasm, b, -L * 0.22, Math.min(28, L * 0.2), 26), peak(wasm, b, L * 0.24, Math.min(20, L * 0.15), 16)];
  const hill = yzSolid(hillSection(wasm, b.width, b.height), -L / 2 + d, L / 2 - d).add(wasm.Manifold.union(peaks));
  const ring = portalRing(wasm);
  const portals = [yzSolid(ring, L / 2 - d, L / 2), yzSolid(ring, -L / 2, -L / 2 + d)];
  return finish(wasm, hill, [], portals);
}

function curvedTunnel(wasm: ManifoldToplevel, b: Building): BuildingSolids {
  const { radius: R, angle } = TUNNEL_CURVE;
  const half = angle / 2;
  const t = (half * Math.PI) / 180;
  const end = { x: R * Math.sin(t), y: R * (1 - Math.cos(t)) };
  // the hill stops short of the ends by the depth of the arches
  const inset = (PORTAL_DEPTH / R) * (180 / Math.PI);
  const ti = ((half - inset) * Math.PI) / 180;
  const hill = sweep(wasm, hillSection(wasm, b.width, b.height), { kind: "arc", x: -R * Math.sin(ti), y: R * (1 - Math.cos(ti)), heading: -(half - inset), radius: R, sweep: angle - 2 * inset, z: 0 }).add(peak(wasm, b, 0, 24, 22));
  const ring = portalRing(wasm);
  const atEnd = yzSolid(ring, -PORTAL_DEPTH, 0).rotate([0, 0, half]).translate([end.x, end.y, 0]);
  const atStart = yzSolid(ring, 0, PORTAL_DEPTH).rotate([0, 0, -half]).translate([-end.x, end.y, 0]);
  return finish(wasm, hill, [], [atEnd, atStart]);
}

function portal(wasm: ManifoldToplevel, b: Building): BuildingSolids {
  const { Manifold } = wasm;
  const L = b.length;
  const W = b.width;
  const H = b.height;
  // the faces of the wall stand back by the depth of the arches: a portal can meet a tunnel end to end
  const d = PORTAL_DEPTH;
  const face = L / 2 - d;
  let wall = box(wasm, [-face, face, -W / 2, W / 2, 0, H]);
  // battlements on top
  const crenels = spread(-W / 2 + 6, W / 2 - 6, 14).map((y) => box(wasm, [-L / 2 - 1, L / 2 + 1, y - 3.5, y + 3.5, H - 5, H + 1]));
  // joints between the stones on both faces: shallow grooves
  const joints: Manifold[] = [];
  for (let z = 10; z < H - 8; z += 10) {
    joints.push(box(wasm, [face - 0.6, face + 1, -W / 2 - 1, W / 2 + 1, z, z + 0.8]), box(wasm, [-face - 1, -face + 0.6, -W / 2 - 1, W / 2 + 1, z, z + 0.8]));
  }
  wall = wall.subtract(Manifold.union([...crenels, ...joints, yzSolid(boreSection(wasm), -L / 2 - 1, L / 2 + 1)]));
  const ring = portalRing(wasm);
  return finish(wasm, wall, [], [yzSolid(ring, face, L / 2), yzSolid(ring, -L / 2, -face)]);
}

// ------------------------------------------------------------------------------ stations

function station(wasm: ManifoldToplevel, b: Building): BuildingSolids {
  const { Manifold } = wasm;
  const L = b.length;
  const W = b.width;
  const H = b.height;
  const ph = STATION_SLAB;
  const base = box(wasm, [-L / 2, L / 2, -W / 2, W / 2, 0, ph]);
  const bw = W * 0.55;
  const bx = L * 0.36;
  const y0 = -W / 2 + 2;
  const y1 = y0 + bw;
  const rise = Math.min(bw * 0.38, 16);
  const wallTop = H - rise;
  let walls = box(wasm, [-bx, bx, y0, y1, ph - 0.01, wallTop]);
  const door: Rect = [-7, 7, ph, ph + 18];
  const windows = ([
    [-bx + 6, -bx + 18, ph + 7, ph + 18],
    [bx - 18, bx - 6, ph + 7, ph + 18],
    [-bx + 24, -14, ph + 7, ph + 18],
    [14, bx - 24, ph + 7, ph + 18],
  ] as Rect[]).filter(([a, c]) => c - a > 4);
  walls = walls.subtract(Manifold.union(recesses(wasm, y1, 1, [door, ...windows])));
  walls = walls.add(cornice(wasm, -bx, bx, y1, 1, wallTop));
  const det = [edgeLine(wasm, L, W / 2, 1, ph), ...frames(wasm, y1, 1, windows), ...frames(wasm, y1, 1, [door], true), ...muntins(wasm, y1, 1, windows)];
  const nameH = Math.min(6, Math.max(3, wallTop - 3 - (ph + 19)));
  const name = nameOn(wasm, b.name, y1, 0, ph + 19 + nameH / 2, bx * 2 - 10, nameH);
  if (name) det.push(name);
  // on the platform: two lamps and a bench
  for (const x of [-L / 2 + 14, L / 2 - 14]) det.push(lamp(wasm, x, W / 2 - 10, ph, 26));
  const benchY = Math.min(y1 + 6, W / 2 - 14);
  const furniture = bench(wasm, bx - 12, benchY, ph, 1);
  const roof = gable(wasm, -bx - 2, bx + 2, bw / 2 + 2, wallTop, rise + 2, (y0 + y1) / 2, Math.max(2, Math.round(rise / 3)));
  // the chimney sits on the roof (printed with it)
  const chimney = box(wasm, [bx * 0.4, bx * 0.4 + 6, (y0 + y1) / 2 - 3, (y0 + y1) / 2 + 3, wallTop, H + 6]);
  const pins: Pt[] = [
    [-bx + 6, (y0 + y1) / 2],
    [bx - 6, (y0 + y1) / 2],
  ];
  return finish(wasm, Manifold.union([base, walls, furniture]), [{ solid: roof.add(chimney), z: wallTop, pins }], det);
}

/** A town station: two floors with pointed windows, a clock tower in the middle with its own roof. */
function townStation(wasm: ManifoldToplevel, b: Building): BuildingSolids {
  const { Manifold } = wasm;
  const L = b.length;
  const W = b.width;
  const H = b.height;
  const ph = STATION_SLAB;
  const base = box(wasm, [-L / 2, L / 2, -W / 2, W / 2, 0, ph]);
  const bw = Math.min(W * 0.6, W - 18);
  const y0 = -W / 2 + 2;
  const y1 = y0 + bw;
  const bx = L * 0.42;
  const tw = 13;
  const floor = 20;
  const eaves = ph + 2 * floor;
  const towerTop = Math.max(H - 22, eaves + 16);
  const ty1 = y1 + 2;
  let walls = box(wasm, [-bx, bx, y0, y1, ph - 0.01, eaves]).add(box(wasm, [-tw, tw, y0, ty1, ph - 0.01, towerTop]));
  const xs = spread(-bx + 6, -tw - 4, 14);
  const both = (rects: Rect[]): Rect[] => [...rects, ...rects.map(([a, c, z0, z1]) => [-c, -a, z0, z1] as Rect)];
  const ground = both(xs.map((x) => [x - 4, x + 4, ph + 4, ph + 17] as Rect));
  const upper = both(xs.map((x) => [x - 4, x + 4, ph + floor + 3, ph + floor + 16] as Rect));
  const door: Rect = [-6, 6, ph, ph + 17];
  const clockZ = towerTop - 10;
  const towerWindow: Rect = [-4, 4, eaves + 1, Math.min(clockZ - 9, eaves + 15)];
  const cuts = [...pointed(wasm, [...ground, ...upper], ...recessSpan(y1, 1)), ...pointed(wasm, [door], ...recessSpan(ty1, 1))];
  if (towerWindow[3] - towerWindow[2] >= 12) cuts.push(...pointed(wasm, [towerWindow], ...recessSpan(ty1, 1)));
  walls = walls.subtract(Manifold.union(cuts));
  // string course between the floors and a cornice under the roof, beside the tower
  for (const [a, c] of [
    [-bx, -tw],
    [tw, bx],
  ] as [number, number][]) {
    walls = walls.add(cornice(wasm, a, c, y1, 1, ph + floor, 0.8)).add(cornice(wasm, a, c, y1, 1, eaves));
  }
  walls = walls.add(cornice(wasm, -tw, tw, ty1, 1, towerTop));
  const det = [edgeLine(wasm, L, W / 2, 1, ph), clock(wasm, ty1, 0, clockZ, Math.min(8, tw - 4)), ...muntins(wasm, y1, 1, [...ground, ...upper], false)];
  const name = nameOn(wasm, b.name, ty1, 0, ph + floor + 1, 2 * tw - 4, 5);
  if (name) det.push(name);
  for (const x of [-L / 2 + 14, L / 2 - 14]) det.push(lamp(wasm, x, W / 2 - 10, ph, 26));
  const free = (ty1 + W / 2 - 6) / 2;
  const furniture = Manifold.union([bench(wasm, -bx / 2, free, ph, 1), bench(wasm, bx / 2, free, ph, 1)]);

  // the main roof in two halves beside the tower, the tower with a pyramid
  const rise = Math.min(bw * 0.4, 18);
  const mid = (y0 + y1) / 2;
  const main = gable(wasm, -bx - 2, bx + 2, bw / 2 + 2, eaves, rise + 2, mid, Math.max(2, Math.round(rise / 3)))
    .subtract(box(wasm, [-tw - 0.4, tw + 0.4, y0 - 5, y1 + 5, eaves - 1, H + 10]))
    .add(box(wasm, [bx * 0.55, bx * 0.55 + 6, mid - 3, mid + 3, eaves, eaves + rise + 6]))
    .add(box(wasm, [-bx * 0.55 - 6, -bx * 0.55, mid - 3, mid + 3, eaves, eaves + rise + 6]));
  const ty = (y0 + ty1) / 2;
  const spire = Manifold.hull([box(wasm, [-tw - 1.5, tw + 1.5, y0 - 1.5, ty1 + 1.5, towerTop, towerTop + 1]), box(wasm, [-0.5, 0.5, ty - 0.5, ty + 0.5, H - 1, H])]);
  return finish(
    wasm,
    Manifold.union([base, walls, furniture]),
    [
      { solid: main, z: eaves, pins: [[-bx + 8, mid], [bx - 8, mid]] },
      { solid: spire, z: towerTop, pins: [[0, ty]] },
    ],
    det,
  );
}

/** A halt: a low platform with a shelter (back wall, side walls with windows, flat roof). */
function halt(wasm: ManifoldToplevel, b: Building): BuildingSolids {
  const { Manifold } = wasm;
  const L = b.length;
  const W = b.width;
  const H = b.height;
  const ph = STATION_SLAB;
  const base = box(wasm, [-L / 2, L / 2, -W / 2, W / 2, 0, ph]);
  const sl = Math.min(32, L / 2 - 8);
  const sd = Math.min(20, W - 18);
  const y0 = -W / 2 + 2;
  const y1 = y0 + sd;
  const wall = 3.6;
  const wallTop = H - 3;
  const back = box(wasm, [-sl, sl, y0, y0 + wall, ph - 0.01, wallTop]);
  let sides = Manifold.union([box(wasm, [-sl, -sl + wall, y0, y1, ph - 0.01, wallTop]), box(wasm, [sl - wall, sl, y0, y1, ph - 0.01, wallTop])]);
  // a pointed window through each side wall
  const window = archOutline(y0 + wall + 2, y1 - 3, ph + 10, wallTop - 4);
  if (window) sides = sides.subtract(yzSolid(polygon(wasm, window), -sl - 1, sl + 1));
  const det = [edgeLine(wasm, L, W / 2, 1, ph), lamp(wasm, L / 2 - 10, W / 2 - 10, ph, 26)];
  const name = nameOn(wasm, b.name, y0 + wall, 0, wallTop - 8, 2 * sl - 12, 5);
  if (name) det.push(name);
  const seat = bench(wasm, 0, y0 + wall + 2.5, ph, 1, 2 * sl - 2 * wall - 4);
  const roof = box(wasm, [-sl - 3, sl + 3, y0 - 2, y1 + 4, wallTop, wallTop + 2.4]).add(box(wasm, [-sl - 3, sl + 3, y1 + 2.4, y1 + 4, wallTop + 2.4, wallTop + 3.4]));
  const pins: Pt[] = [
    [-sl + wall / 2, (y0 + y1) / 2],
    [sl - wall / 2, (y0 + y1) / 2],
  ];
  return finish(wasm, Manifold.union([base, back, sides, seat]), [{ solid: roof, z: wallTop, pins }], det);
}

/** A hall over two tracks: side walls with tall pointed windows, a roof at 45° that is open at both ends. */
function hall(wasm: ManifoldToplevel, b: Building): BuildingSolids {
  const { Manifold } = wasm;
  const L = b.length;
  const half = b.width / 2;
  const wall = 4;
  const outer = half + 2;
  const eaves = Math.max(HALL_EAVES, b.height - outer);
  const bays = Math.max(2, Math.round(L / 36));
  const pillars = Array.from({ length: bays + 1 }, (_, i) => -L / 2 + 2.5 + ((L - 5) * i) / bays);
  const sides: Manifold[] = [];
  const glazing: Manifold[] = [];
  for (const s of [1, -1]) {
    const [w0, w1] = s > 0 ? [half - wall, half] : [-half, -half + wall];
    let side = box(wasm, [-L / 2, L / 2, w0, w1, 0, eaves]);
    // a foot inside for a steady stand
    side = side.add(box(wasm, [-L / 2, L / 2, s > 0 ? w0 - 4 : w1, s > 0 ? w0 : w1 + 4, 0, 3]));
    const windows: Rect[] = [];
    for (let i = 0; i + 1 < pillars.length; i++) {
      const a = (pillars[i] as number) + 4.5;
      const c = (pillars[i + 1] as number) - 4.5;
      if (c - a >= 10) windows.push([a, c, 10, eaves - 8]);
    }
    side = side.subtract(Manifold.union(pointed(wasm, windows, w0 - 1, w1 + 1)));
    // pilasters outside between the windows
    const [p0, p1] = s > 0 ? [w1, w1 + 3] : [w0 - 3, w0];
    for (const x of pillars) side = side.add(box(wasm, [x - 2.5, x + 2.5, p0, p1, 0, eaves - 6]));
    sides.push(side);
    // a bar up the middle of every window, from the sill into the point
    for (const [a, c] of windows) glazing.push(box(wasm, [(a + c) / 2 - 0.8, (a + c) / 2 + 0.8, (w0 + w1) / 2 - 0.8, (w0 + w1) / 2 + 0.8, 9, eaves - 7]));
  }
  // the roof: a shell at 45°, thicker ribs at both ends, a lantern along the ridge
  const inner = half - wall;
  const shell = gable(wasm, -L / 2 - 2, L / 2 + 2, outer, eaves, outer).subtract(gable(wasm, -L / 2 - 3, L / 2 + 3, inner, eaves - 0.01, inner));
  const ribs = [L / 2 - 2, -L / 2 - 2].map((x0) => gable(wasm, x0, x0 + 4, outer, eaves, outer).subtract(gable(wasm, x0 - 1, x0 + 5, inner - 4, eaves - 0.01, inner - 4)));
  const ridge = eaves + outer;
  const lantern = yzSolid(
    polygon(wasm, [
      [-6, ridge - 6.5],
      [6, ridge - 6.5],
      [6, ridge + 2],
      [0, ridge + 8],
      [-6, ridge + 2],
    ]),
    -L / 2 + 12,
    L / 2 - 12,
  );
  const roof = Manifold.union([shell, ...ribs, lantern]);
  const pins: Pt[] = [L / 2 - 12, -L / 2 + 12].flatMap((x) => [[x, half - wall / 2] as Pt, [x, -half + wall / 2] as Pt]);
  return finish(wasm, Manifold.union(sides), [{ solid: roof, z: eaves, pins }], glazing);
}

// ------------------------------------------------------------------------------ platforms

function platform(wasm: ManifoldToplevel, b: Building, island: boolean): BuildingSolids {
  const { Manifold } = wasm;
  const L = b.length;
  const W = b.width;
  const H = b.height;
  const body = slab(wasm, L, W, H);
  const det = [edgeLine(wasm, L, W / 2, 1, H)];
  const furniture: Manifold[] = [];
  if (island) {
    det.push(edgeLine(wasm, L, -W / 2, -1, H));
    for (const x of [-L / 3, L / 3]) det.push(lamp(wasm, x, 0, H, 26));
    for (const x of spread(-L / 2 + 20, L / 2 - 20, 54)) furniture.push(bench(wasm, x, 4, H, 1, 14), bench(wasm, x, -4, H, -1, 14));
  } else {
    for (const x of [-L / 4, L / 4]) det.push(lamp(wasm, x, -W / 2 + 7, H, 26));
    furniture.push(bench(wasm, 0, -W / 2 + 6, H, 1));
  }
  return finish(wasm, Manifold.union([body, ...furniture]), [], det);
}

/** A side platform with a canopy on a row of posts with 45° brackets. */
function coveredPlatform(wasm: ManifoldToplevel, b: Building): BuildingSolids {
  const { Manifold } = wasm;
  const L = b.length;
  const W = b.width;
  const H = b.height;
  const ph = Math.min(PLATFORM_SLAB, H - 30);
  const canopyZ = H - 5;
  const body = slab(wasm, L, W, ph);
  const xs = spread(-L / 2 + 16, L / 2 - 16, 50);
  const posts: Manifold[] = [];
  for (const x of xs) {
    posts.push(box(wasm, [x - 2.5, x + 2.5, -2.5, 2.5, ph - 0.01, canopyZ]));
    for (const s of [1, -1]) {
      const bracket = polygon(wasm, [
        [s * 2.4, canopyZ - 10],
        [s * 2.4, canopyZ],
        [s * 12.4, canopyZ],
      ]);
      posts.push(yzSolid(bracket, x - 1, x + 1));
    }
  }
  // benches between the posts, at the back of the platform
  const furniture = xs.slice(1).map((x, i) => bench(wasm, (x + (xs[i] as number)) / 2, -W / 2 + 6, ph, 1, 14));
  const canopy = box(wasm, [-L / 2 + 4, L / 2 - 4, -W / 2 + 2, W / 2 - 2, canopyZ, canopyZ + 2.4]).add(gable(wasm, -L / 2 + 4, L / 2 - 4, W / 2 - 2, canopyZ + 2.4, 3, 0, 3));
  const det = [edgeLine(wasm, L, W / 2, 1, ph)];
  return finish(wasm, Manifold.union([body, ...posts, ...furniture]), [{ solid: canopy, z: canopyZ, pins: xs.map((x) => [x, 0] as Pt) }], det);
}

// ------------------------------------------------------------------------------ railway and town

function houseOrBox(wasm: ManifoldToplevel, b: Building): BuildingSolids {
  const { Manifold } = wasm;
  const L = b.length;
  const W = b.width;
  const H = b.height;
  const house = b.kind === "house";
  const rise = Math.min(W * (house ? 0.4 : 0.3), 22);
  const wallTop = H - rise;
  let walls = box(wasm, [-L / 2, L / 2, -W / 2, W / 2, 0, wallTop]);
  const det: Manifold[] = [];
  const door: Rect = house ? [-5, 5, 0, 16] : [-L / 2 + 6, -L / 2 + 14, 0, 16];
  const windows: Rect[] = house
    ? ([
        [-L / 2 + 5, -L / 2 + 15, 18, 28],
        [L / 2 - 15, L / 2 - 5, 18, 28],
      ] as Rect[]).filter(([a, c]) => c - a > 3 && 28 < wallTop - 2)
    : [[-L / 2 + 4, L / 2 - 4, wallTop - 18, wallTop - 6]];
  walls = walls.subtract(Manifold.union(recesses(wasm, W / 2, 1, [door, ...windows])));
  det.push(...frames(wasm, W / 2, 1, windows), ...frames(wasm, W / 2, 1, [door], true));
  if (house) {
    det.push(...muntins(wasm, W / 2, 1, windows));
    // flower boxes under the windows, with a 45° slope below
    for (const [a, c, z0] of windows) det.push(yzSolid(polygon(wasm, [[W / 2 - 0.3, z0 - 6], [W / 2, z0 - 6], [W / 2 + 2.5, z0 - 3.5], [W / 2 + 2.5, z0 - 1.2], [W / 2 - 0.3, z0 - 1.2]]), a, c));
  } else {
    // signal box: window band on both sides with bars, an outside stair to the upper door
    walls = walls.subtract(Manifold.union(recesses(wasm, -W / 2, -1, windows)));
    det.push(...muntins(wasm, W / 2, 1, windows, false), ...muntins(wasm, -W / 2, -1, windows, false));
    for (const [a, c, z0, z1] of windows) {
      for (const x of spread(a, c, 9).slice(1)) det.push(box(wasm, [x - 0.5, x + 0.5, W / 2 - RECESS - 0.01, W / 2 - 0.4, z0, z1]));
    }
    const stairTop = wallTop - 20;
    if (stairTop > 8) {
      const steps = Math.max(3, Math.round(stairTop / 4));
      const run = (W - 6) / steps;
      const profile: Pt[] = [[-W / 2 + 3, 0]];
      for (let i = 0; i < steps; i++) profile.push([-W / 2 + 3 + i * run, ((i + 1) * stairTop) / steps], [-W / 2 + 3 + (i + 1) * run, ((i + 1) * stairTop) / steps]);
      profile.push([W / 2 - 3, 0]);
      walls = walls.add(yzSolid(polygon(wasm, profile), L / 2, L / 2 + 8));
      walls = walls.subtract(box(wasm, [L / 2 - RECESS, L / 2 + 1, W / 2 - 13, W / 2 - 5, stairTop, Math.min(stairTop + 16, wallTop - 2)]));
    }
  }
  const name = nameOn(wasm, b.name, W / 2, 0, house ? wallTop - 5 : wallTop - 23, L - 8, 5);
  if (name) det.push(name);
  walls = walls.add(cornice(wasm, -L / 2, L / 2, W / 2, 1, wallTop, 0.8)).add(cornice(wasm, -L / 2, L / 2, -W / 2, -1, wallTop, 0.8));
  const roof = gable(wasm, -L / 2 - 2, L / 2 + 2, W / 2 + 2, wallTop, rise + 2, 0, Math.max(2, Math.round(rise / 3)));
  const chimney = house ? box(wasm, [L / 4 - 3, L / 4 + 3, -W / 4 - 3, -W / 4 + 3, wallTop, H + 4]) : undefined;
  const pins: Pt[] = [
    [-L / 2 + 6, 0],
    [L / 2 - 6, 0],
  ];
  return finish(wasm, walls, [{ solid: chimney ? roof.add(chimney) : roof, z: wallTop, pins }], det);
}

function waterTower(wasm: ManifoldToplevel, b: Building): BuildingSolids {
  const { Manifold } = wasm;
  const H = b.height;
  const r = Math.min(b.length, b.width) / 2 - 2;
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
  // the bottom of the tank widens at 45°
  const bottom = Manifold.cylinder(cone, 4, r, SEG).translate([0, 0, legTop - cone]);
  let tank = Manifold.cylinder(tankTop - legTop, r, r, SEG).translate([0, 0, legTop]);
  // the staves of the tank: upright grooves
  const staves = Array.from({ length: 24 }, (_, i) => box(wasm, [r - 0.6, r + 1, -0.4, 0.4, legTop + 1.5, tankTop - 1.5]).rotate([0, 0, i * 15]));
  tank = tank.subtract(Manifold.union(staves));
  const base = Manifold.union([...legs, column, bottom, tank, box(wasm, [-r, r, -r, r, 0, 2])]);
  const ring = Manifold.cylinder(2.5, r + 0.6, r + 0.6, SEG).subtract(Manifold.cylinder(4, r - 1, r - 1, SEG).translate([0, 0, -1])).translate([0, 0, (legTop + tankTop) / 2]);
  // the spout leaves the tank going up at 45° (no overhang)
  const spout = Manifold.cylinder(10, 2, 2, 24)
    .rotate([0, 45, 0])
    .translate([r - 3, 0, tankTop - 16]);
  const roof = Manifold.cylinder(H - tankTop, r + 1.5, 1.5, SEG).translate([0, 0, tankTop]);
  return finish(wasm, base, [{ solid: roof, z: tankTop, pins: [[0, 0]] }], [ring, spout.subtract(Manifold.cylinder(tankTop, r - 0.5, r - 0.5, SEG))]);
}

function shed(wasm: ManifoldToplevel, b: Building): BuildingSolids {
  const { Manifold } = wasm;
  const L = b.length;
  const W = b.width;
  const H = b.height;
  const wall = 4;
  const rise = Math.min(W * 0.3, 24);
  const apex = TUNNEL_BORE.wall + TUNNEL_BORE.width / 2;
  const wallTop = Math.max(H - rise, apex + 6);
  const sides = [1, -1].map((s) => box(wasm, [-L / 2, L / 2, s > 0 ? W / 2 - wall : -W / 2, s > 0 ? W / 2 : -W / 2 + wall, 0, wallTop]));
  // end walls with an opening for the train like a tunnel bore: its top ends in a 45° point
  const ends = [1, -1].map((s) => box(wasm, [s > 0 ? L / 2 - wall : -L / 2, s > 0 ? L / 2 : -L / 2 + wall, -W / 2, W / 2, 0, wallTop]));
  let base = Manifold.union([...sides, ...ends]).subtract(yzSolid(boreSection(wasm), -L / 2 - 1, L / 2 + 1));
  const windows: Rect[] = [];
  for (let x = -L / 2 + 20; x + 12 < L / 2 - 14; x += 26) windows.push([x, x + 12, wallTop - 26, wallTop - 10]);
  base = base.subtract(Manifold.union([...recesses(wasm, W / 2, 1, windows), ...recesses(wasm, -W / 2, -1, windows)]));
  const det = Manifold.union([...frames(wasm, W / 2, 1, windows), ...frames(wasm, -W / 2, -1, windows), ...muntins(wasm, W / 2, 1, windows), ...muntins(wasm, -W / 2, -1, windows), yzSolid(portalRing(wasm), L / 2, L / 2 + 1.2), yzSolid(portalRing(wasm), -L / 2 - 1.2, -L / 2)]);
  const vents = spread(-L / 2 + 30, L / 2 - 30, 60).map((x) => gable(wasm, x - 7, x + 7, 6, wallTop + rise - 4, 8));
  const roof = gable(wasm, -L / 2 - 2, L / 2 + 2, W / 2 + 2, wallTop, rise + 2, 0, Math.max(2, Math.round(rise / 3))).add(Manifold.union(vents));
  const pins: Pt[] = [
    [-L / 2 + 10, W / 2 - wall / 2],
    [L / 2 - 10, W / 2 - wall / 2],
    [-L / 2 + 10, -W / 2 + wall / 2],
    [L / 2 - 10, -W / 2 + wall / 2],
  ];
  return finish(wasm, base, [{ solid: roof, z: wallTop, pins }], [det]);
}

function signal(wasm: ManifoldToplevel, b: Building): BuildingSolids {
  const { Manifold } = wasm;
  const L = b.length;
  const W = b.width;
  const H = b.height;
  const foot = box(wasm, [-L / 2, L / 2, -W / 2, W / 2, 0, 3]);
  const post = Manifold.cylinder(H - 18, 2.4, 2.2, 32).translate([0, 0, 3]);
  const head = box(wasm, [-3, 3, -4.5, 4.5, H - 18, H]).subtract(box(wasm, [2, 4, -3.5, 3.5, H - 16, H - 2]));
  const lamps = Manifold.union([cylinderX(wasm, 2.2, 1.6, 3.4, 0, H - 13), cylinderX(wasm, 2.2, 1.6, 3.4, 0, H - 6)]);
  // a hood over each lamp, sloped at 45° below
  const hoods = [H - 13, H - 6].map((z) =>
    sideProfile(
      wasm,
      [
        [1.9, z + 1.5],
        [4.9, z + 4.5],
        [1.9, z + 4.5],
      ],
      2.8,
    ),
  );
  return finish(wasm, Manifold.union([foot, post, head, ...hoods]).subtract(lamps), [], [lamps]);
}

/** A plate with studs on top (LEGO®- or DUPLO®-compatible grid). */
function studPlate(wasm: ManifoldToplevel, b: Building): BuildingSolids {
  const { Manifold } = wasm;
  const sys = b.kind === "plate_duplo" ? DUPLO : LEGO;
  const nx = Math.max(1, Math.round(b.length / sys.pitch));
  const ny = Math.max(1, Math.round(b.width / sys.pitch));
  const L = nx * sys.pitch;
  const W = ny * sys.pitch;
  const plate = box(wasm, [-L / 2, L / 2, -W / 2, W / 2, 0, sys.plate]);
  const r = (sys.diameter + STUD_FIT) / 2;
  let stud = Manifold.cylinder(sys.height + 0.01, r, r, 32).translate([0, 0, sys.plate - 0.01]);
  if (sys.hollow > 0) stud = stud.subtract(Manifold.cylinder(sys.height + 1, sys.hollow / 2, sys.hollow / 2, 24).translate([0, 0, sys.plate + 0.3]));
  const studs: Manifold[] = [];
  for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) studs.push(stud.translate([-L / 2 + (i + 0.5) * sys.pitch, -W / 2 + (j + 0.5) * sys.pitch, 0]));
  return finish(wasm, plate.add(Manifold.union(studs)), []);
}

export function buildBuilding(wasm: ManifoldToplevel, b: Building): BuildingSolids {
  switch (b.kind) {
    case "station":
      return station(wasm, b);
    case "station_town":
      return townStation(wasm, b);
    case "station_halt":
      return halt(wasm, b);
    case "station_hall":
      return hall(wasm, b);
    case "platform":
      return platform(wasm, b, false);
    case "platform_island":
      return platform(wasm, b, true);
    case "platform_roof":
      return coveredPlatform(wasm, b);
    case "tunnel":
      return tunnel(wasm, b);
    case "tunnel_curve":
      return curvedTunnel(wasm, b);
    case "portal":
      return portal(wasm, b);
    case "house":
    case "signalbox":
      return houseOrBox(wasm, b);
    case "watertower":
      return waterTower(wasm, b);
    case "shed":
      return shed(wasm, b);
    case "signal":
      return signal(wasm, b);
    case "plate_lego":
    case "plate_duplo":
      return studPlate(wasm, b);
  }
}
