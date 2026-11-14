// Track elements as solids: the cross-section is swept along every path of the element, the
// grooves are cut, sockets cut into the female ends and pegs added to the male ends.
//
// Sweeps: a cross-section in (u = across, left positive; v = up) is extruded along +X for lines
// and revolved around the curve centre for arcs.
import type { CrossSection, Manifold, ManifoldToplevel } from "manifold-3d";
import { elementShape, ledges, pathLength, pointAt, sleeperGaps, smoothstep, standsOnGround } from "../core/track";
import { STUD_FIT, studSystem } from "../presets/bricks";
import type { ElementType, Path, Port, Variant } from "../core/track";
import {
  ARCH_CROWN,
  ARCH_FOOT,
  ARCH_MIN_HEIGHT,
  ARCH_PIER,
  BRIDGE_DECK,
  BRIDGE_PILLAR_LENGTH,
  BUFFER_BLOCK_HEIGHT,
  BUFFER_BLOCK_LENGTH,
  GROOVE_DEPTH,
  GROOVE_SPACING,
  GROOVE_WIDTH,
  PEG_HEAD_DIAMETER,
  PEG_HEIGHT,
  PEG_NECK_WIDTH,
  PEG_REACH,
  RAMP_RIB_SPACING,
  RAMP_WALL,
  SLEEPER_GAP,
  SLEEPER_GAP_ROUND,
  SLEEPER_GAP_WIDTH,
  SLEEPER_PITCH,
  TRACK_EDGE_CHAMFER,
  TRACK_HEIGHT,
  TRACK_WIDTH,
  SUPPORT_FIT,
  SUPPORT_FOOT,
  SUPPORT_FOOT_GROW,
  SUPPORT_LENGTH,
  SUPPORT_LIP,
  SUPPORT_LIP_THICKNESS,
} from "../presets/gauge";

export interface TrackOptions {
  doubleSided: boolean;
  connectorFit: number;
  /** open the track between sleepers (absent: closed, like wooden track) */
  sleepers?: boolean;
}

export { BUFFER_BLOCK_HEIGHT, BUFFER_BLOCK_LENGTH };
/** the arc is drawn with one segment per this many degrees */
const ARC_STEP = 1.5;
/** cutters reach this far beyond the ends, so that no skin remains */
const OVERCUT = 1;
const CIRCLE_SEGMENTS = 64;

export function trackProfile(wasm: ManifoldToplevel): CrossSection {
  const w = TRACK_WIDTH / 2;
  const h = TRACK_HEIGHT;
  const c = TRACK_EDGE_CHAMFER;
  return wasm.CrossSection.ofPolygons([
    [
      [-w + c, 0],
      [w - c, 0],
      [w, c],
      [w, h - c],
      [w - c, h],
      [-w + c, h],
      [-w, h - c],
      [-w, c],
    ],
  ]);
}

/** The grooves as a cross-section: on top, and on the bottom for double-sided track. */
export function grooveProfile(wasm: ManifoldToplevel, bottom: boolean): CrossSection {
  const rects: [number, number][][] = [];
  for (const side of [-1, 1]) {
    const u0 = side * (GROOVE_SPACING / 2) - GROOVE_WIDTH / 2;
    const u1 = u0 + GROOVE_WIDTH;
    rects.push([
      [u0, TRACK_HEIGHT - GROOVE_DEPTH],
      [u1, TRACK_HEIGHT - GROOVE_DEPTH],
      [u1, TRACK_HEIGHT + OVERCUT],
      [u0, TRACK_HEIGHT + OVERCUT],
    ]);
    if (bottom) {
      rects.push([
        [u0, -OVERCUT],
        [u1, -OVERCUT],
        [u1, GROOVE_DEPTH],
        [u0, GROOVE_DEPTH],
      ]);
    }
  }
  return wasm.CrossSection.ofPolygons(rects);
}

/** Column-major 4×4: profile x (across) → world Y, profile y (up) → world Z, extrusion → world X. */
const PROFILE_TO_TRACK: [number, number, number, number, number, number, number, number, number, number, number, number, number, number, number, number] = [
  0, 1, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0, 0, 1,
];

/** Sweeps a profile along a path (with `extend` mm more at both ends). */
export function sweep(wasm: ManifoldToplevel, profile: CrossSection, path: Path, extend = 0, shorten = 0): Manifold {
  if (path.kind === "line") {
    const length = path.length - shorten;
    const divisions = path.z0 === path.z1 ? 0 : Math.ceil(path.length / 3);
    let solid = profile.extrude(length + 2 * extend, divisions).transform(PROFILE_TO_TRACK).translate([-extend, 0, 0]);
    if (path.z0 !== path.z1) {
      const { z0, z1 } = path;
      const total = path.length;
      solid = solid.warp((v) => {
        v[2] += z0 + (z1 - z0) * smoothstep(v[0] / total);
      });
    } else if (path.z0 !== 0) {
      solid = solid.translate([0, 0, path.z0]);
    }
    return solid.rotate([0, 0, path.heading]).translate([path.x, path.y, 0]);
  }
  const angle = Math.abs(path.sweep);
  const extendDeg = (extend / path.radius) * (180 / Math.PI);
  const total = angle + 2 * extendDeg;
  const segments = Math.max(8, Math.ceil(360 / ARC_STEP));
  const left = path.sweep > 0;
  // across → radius: R − u for a left turn (centre on the left), R + u for a right one
  const radial = left ? profile.mirror([1, 0]).translate([path.radius, 0]) : profile.translate([path.radius, 0]);
  let solid = radial.revolve(segments, total);
  // revolve starts at +X and turns counter-clockwise; the start of the track lies at −90° (left) or +90° − angle (right)
  solid = left
    ? solid.rotate([0, 0, -90 - extendDeg]).translate([0, path.radius, 0])
    : solid.rotate([0, 0, 90 - angle - extendDeg]).translate([0, -path.radius, 0]);
  return solid.translate([0, 0, path.z]).rotate([0, 0, path.heading]).translate([path.x, path.y, 0]);
}

/** The outline of a peg seen from above, pointing along +X from the end at x = 0. */
function pegOutline(wasm: ManifoldToplevel, grow: number, inside: number): CrossSection {
  const d = PEG_HEAD_DIAMETER + grow;
  const w = PEG_NECK_WIDTH + grow;
  const centre = PEG_REACH - PEG_HEAD_DIAMETER / 2;
  const neck = wasm.CrossSection.square([centre + inside, w], false).translate([-inside, -w / 2]);
  const head = wasm.CrossSection.circle(d / 2, CIRCLE_SEGMENTS).translate([centre, 0]);
  return neck.add(head);
}

function placeAtPort(solid: Manifold, port: Port, inward: boolean): Manifold {
  return solid.rotate([0, 0, port.heading + (inward ? 180 : 0)]).translate([port.x, port.y, port.z]);
}

export function peg(wasm: ManifoldToplevel, port: Port, height = PEG_HEIGHT): Manifold {
  return placeAtPort(pegOutline(wasm, 0, 1).extrude(height), port, false);
}

export function socket(wasm: ManifoldToplevel, port: Port, fit: number): Manifold {
  // the socket reaches the fit deeper than the peg and opens at the end
  const outline = pegOutline(wasm, fit, OVERCUT).translate([fit / 2, 0]);
  return placeAtPort(outline.extrude(TRACK_HEIGHT + 2 * OVERCUT).translate([0, 0, -OVERCUT]), port, true);
}

/** The side view of a ramp (x along, y = up) as a polygon from the bed up to just inside the track. */
function rampSide(wasm: ManifoldToplevel, path: Extract<Path, { kind: "line" }>): CrossSection {
  const n = Math.ceil(path.length / 3);
  const top: [number, number][] = [];
  for (let i = 0; i <= n; i++) {
    const x = (path.length * i) / n;
    top.push([x, path.z0 + (path.z1 - path.z0) * smoothstep(x / path.length) + 1]);
  }
  return wasm.CrossSection.ofPolygons([[[0, 0], [path.length, 0], ...top.reverse()]]);
}

/** A side profile (x, up) extruded across the track from y0 to y1. */
function across(section: CrossSection, y0: number, y1: number): Manifold {
  // extrude along Z, then turn: profile y → world Z, extrusion → world −Y
  return section.extrude(y1 - y0).rotate([90, 0, 0]).translate([0, y1, 0]);
}

/**
 * An arched opening seen from the side (a = along the wall, up), counter-clockwise: straight
 * sides and a round top that ends in a 45° point, so that it prints without support. `pointed`
 * gives the bottom the same shape (for parts printed upside down). Undefined if there is no room.
 */
export function archOutline(a0: number, a1: number, bottom: number, top: number, pointed = false): [number, number][] | undefined {
  const height = top - bottom;
  if (height < ARCH_MIN_HEIGHT) return undefined;
  const mid = (a0 + a1) / 2;
  const ends = pointed ? 2 : 1;
  const half = Math.min((a1 - a0) / 2, height / (Math.SQRT2 * ends));
  if (half < 4) return undefined;
  const spring = top - half * Math.SQRT2;
  const base = pointed ? bottom + half * Math.SQRT2 : bottom;
  const arc = (cy: number, from: number, to: number): [number, number][] => {
    const out: [number, number][] = [];
    const n = 6;
    for (let i = 0; i <= n; i++) {
      const t = ((from + ((to - from) * i) / n) * Math.PI) / 180;
      out.push([mid + half * Math.cos(t), cy + half * Math.sin(t)]);
    }
    return out;
  };
  const lower: [number, number][] = pointed ? [[mid, bottom], ...arc(base, -45, 0)] : [[mid - half, bottom], [mid + half, bottom]];
  const upper: [number, number][] = [...arc(spring, 0, 45), [mid, top], ...arc(spring, 135, 180)];
  const close: [number, number][] = pointed ? arc(base, 180, 225) : [];
  return [...lower, ...upper, ...close];
}

/** Openings of the shape above, cut through a wall in the (a, up) plane. */
function openings(wasm: ManifoldToplevel, outlines: ([number, number][] | undefined)[]): CrossSection | undefined {
  const polygons = outlines.filter((o): o is [number, number][] => o !== undefined);
  return polygons.length > 0 ? wasm.CrossSection.ofPolygons(polygons) : undefined;
}

/** Height of the track bottom of a ramp at x. */
const rampBottom = (path: Extract<Path, { kind: "line" }>, x: number) => path.z0 + (path.z1 - path.z0) * smoothstep(x / path.length);

/**
 * Where the cross ribs of a ramp stand: one at each end, the others about RAMP_RIB_SPACING apart,
 * under a sleeper (between two openings), so that the openings stay clear.
 */
function ribPositions(path: Extract<Path, { kind: "line" }>, gaps: number[]): number[] {
  const last = path.length - RAMP_WALL;
  const sleepers = gaps.slice(1).map((s, i) => (s + (gaps[i] as number)) / 2);
  if (sleepers.length === 0) {
    const count = Math.max(2, Math.round(path.length / RAMP_RIB_SPACING) + 1);
    return Array.from({ length: count }, (_, i) => (last * i) / (count - 1));
  }
  // every n-th sleeper carries a rib, so that the arches between them are all alike; of the two
  // choices the one that leaves the end bays closer to the others is taken
  const every = Math.max(1, Math.round(RAMP_RIB_SPACING / SLEEPER_PITCH));
  const options = Array.from({ length: every }, (_, phase) => sleepers.filter((_, i) => i % every === phase).map((c) => c - RAMP_WALL / 2));
  const spread = (ribs: number[]) => Math.abs((ribs[0] ?? 0) - RAMP_RIB_SPACING) + Math.abs(last - (ribs[ribs.length - 1] ?? last) - RAMP_RIB_SPACING);
  const inner = options.reduce((best, o) => (spread(o) < spread(best) ? o : best), options[0] as number[]);
  return [0, ...inner.filter((x) => x > RAMP_WALL + ARCH_PIER && x < last - RAMP_WALL - ARCH_PIER), last];
}

/** The hollow support of a ramp: side walls with arches and cross ribs, each rib with an arch. */
function rampBody(wasm: ManifoldToplevel, path: Extract<Path, { kind: "line" }>, gaps: number[]): Manifold[] {
  const { Manifold } = wasm;
  const half = TRACK_WIDTH / 2;
  const ribs = ribPositions(path, gaps);
  let side = rampSide(wasm, path);
  const bays: ([number, number][] | undefined)[] = [];
  for (let i = 0; i + 1 < ribs.length; i++) {
    const a0 = (ribs[i] as number) + RAMP_WALL + ARCH_PIER;
    const a1 = (ribs[i + 1] as number) - ARCH_PIER;
    const top = Math.min(rampBottom(path, a0), rampBottom(path, a1)) - ARCH_CROWN;
    bays.push(archOutline(a0, a1, ARCH_FOOT, top));
  }
  const windows = openings(wasm, bays);
  if (windows) side = side.subtract(windows);
  const bodies: Manifold[] = [across(side, -half + TRACK_EDGE_CHAMFER, -half + RAMP_WALL), across(side, half - RAMP_WALL, half - TRACK_EDGE_CHAMFER)];
  const full = across(rampSide(wasm, path), -half + TRACK_EDGE_CHAMFER, half - TRACK_EDGE_CHAMFER);
  ribs.forEach((x, i) => {
    const slab = Manifold.cube([RAMP_WALL, TRACK_WIDTH - 2 * TRACK_EDGE_CHAMFER, Math.max(path.z0, path.z1) + TRACK_HEIGHT], false).translate([x, -half + TRACK_EDGE_CHAMFER, 0]);
    let rib = full.intersect(slab);
    // the ribs at the ends stay closed, the others get an arch across the track
    const inner = i > 0 && i < ribs.length - 1;
    const arch = inner ? archOutline(-half + RAMP_WALL + ARCH_PIER, half - RAMP_WALL - ARCH_PIER, ARCH_FOOT, Math.min(rampBottom(path, x), rampBottom(path, x + RAMP_WALL)) - ARCH_CROWN) : undefined;
    if (arch) rib = rib.subtract(wasm.CrossSection.ofPolygons([arch]).extrude(RAMP_WALL + 2 * OVERCUT).transform(PROFILE_TO_TRACK).translate([x - OVERCUT, 0, 0]));
    bodies.push(rib);
  });
  return bodies;
}

/** A bridge pillar (full width) with a pointed opening along the track: it is printed upside down. */
function bridgePillar(wasm: ManifoldToplevel, x: number, height: number): Manifold {
  const half = TRACK_WIDTH / 2;
  const pillar = wasm.Manifold.cube([BRIDGE_PILLAR_LENGTH, TRACK_WIDTH, height], false).translate([x, -half, 0]);
  const arch = archOutline(-half + ARCH_PIER, half - ARCH_PIER, ARCH_FOOT, height - BRIDGE_DECK - ARCH_CROWN, true);
  if (!arch) return pillar;
  return pillar.subtract(wasm.CrossSection.ofPolygons([arch]).extrude(BRIDGE_PILLAR_LENGTH + 2 * OVERCUT).transform(PROFILE_TO_TRACK).translate([x - OVERCUT, 0, 0]));
}

/** The openings between the sleepers as cutters: rounded slots across the middle of the track. */
function sleeperCutters(wasm: ManifoldToplevel, type: ElementType, variant: Variant): Manifold | undefined {
  const gaps = sleeperGaps(type, variant);
  const path = elementShape(type, variant).paths[0];
  if (gaps.length === 0 || !path) return undefined;
  const r = SLEEPER_GAP_ROUND;
  const slot = wasm.CrossSection.square([SLEEPER_GAP - 2 * r, SLEEPER_GAP_WIDTH - 2 * r], true).offset(r, "Round", 2, 16);
  const cutters = gaps.map((s) => {
    const p = pointAt(path, s);
    const heights = [p.z, pointAt(path, s - SLEEPER_GAP / 2).z, pointAt(path, s + SLEEPER_GAP / 2).z];
    // on a bridge the deck stays under the openings
    const bottom = type.kind === "bridge" ? Math.min(...heights) : Math.min(...heights) - OVERCUT;
    const top = Math.max(...heights) + TRACK_HEIGHT + OVERCUT;
    return slot.extrude(top - bottom).translate([0, 0, bottom]).rotate([0, 0, p.heading]).translate([p.x, p.y, 0]);
  });
  return wasm.Manifold.union(cutters);
}

/** The finished solid of an element in its local frame (Z = 0 on the bed). */
export function buildElement(wasm: ManifoldToplevel, type: ElementType, variant: Variant, options: TrackOptions): Manifold {
  const { Manifold } = wasm;
  const shape = elementShape(type, variant);
  const profile = trackProfile(wasm);
  const bottomGrooves = options.doubleSided && !standsOnGround(type.kind) && type.kind !== "buffer";
  const grooves = grooveProfile(wasm, bottomGrooves);
  const half = TRACK_WIDTH / 2;

  const bodies: Manifold[] = shape.paths.map((p) => sweep(wasm, profile, p));
  const cutters: Manifold[] = shape.paths.map((p) => sweep(wasm, grooves, p, OVERCUT, type.kind === "buffer" ? BUFFER_BLOCK_LENGTH : 0));

  const first = shape.paths[0];
  const gaps = options.sleepers ? sleeperGaps(type, variant) : [];
  if (type.kind === "ramp" && first?.kind === "line") {
    // hollow support like a viaduct: side walls with arches and cross ribs under the track
    bodies.push(...rampBody(wasm, first, gaps));
  }
  if (type.kind === "bridge" && first?.kind === "line") {
    const deck = Manifold.cube([first.length, TRACK_WIDTH, BRIDGE_DECK + 1], false).translate([0, -half, first.z0 - BRIDGE_DECK]);
    bodies.push(deck, bridgePillar(wasm, 0, first.z0), bridgePillar(wasm, first.length - BRIDGE_PILLAR_LENGTH, first.z0));
  }
  if (type.kind === "buffer" && first?.kind === "line") {
    const block = Manifold.cube([BUFFER_BLOCK_LENGTH, TRACK_WIDTH, BUFFER_BLOCK_HEIGHT], false).translate([first.length - BUFFER_BLOCK_LENGTH, -half, 0]);
    const beam = Manifold.cube([4, TRACK_WIDTH + 8, 8], false).translate([first.length - BUFFER_BLOCK_LENGTH - 4, -half - 4, BUFFER_BLOCK_HEIGHT - 14]);
    bodies.push(block, beam);
  }

  // stud ledges beside the track (no grooves cut into them: they are added after the grooves)
  const studParts = studLedges(wasm, type, variant);

  let solid = Manifold.union(bodies).subtract(Manifold.union(cutters));
  const sleepers = options.sleepers ? sleeperCutters(wasm, type, variant) : undefined;
  if (sleepers) solid = solid.subtract(sleepers);
  if (studParts) solid = solid.add(studParts);
  const sockets = shape.ports.filter((p) => p.gender === "female").map((p) => socket(wasm, p, options.connectorFit));
  if (sockets.length > 0) solid = solid.subtract(Manifold.union(sockets));
  // a bridge is printed upside down: its pegs reach the full height, so that they lie on the bed
  const pegHeight = type.kind === "bridge" ? TRACK_HEIGHT : PEG_HEIGHT;
  const pegs = shape.ports.filter((p) => p.gender === "male").map((p) => peg(wasm, p, pegHeight));
  if (pegs.length > 0) solid = solid.add(Manifold.union(pegs));
  return solid;
}

/** Bridges are printed upside down, everything else as it lies. */
export const printFlipped = (type: ElementType) => type.kind === "bridge";

/** Ledges with building-brick studs on the left and/or right of the paths of an element. */
function studLedges(wasm: ManifoldToplevel, type: ElementType, variant: Variant): Manifold | undefined {
  const system = studSystem(type.studs);
  const side = ledges(type, variant);
  if (!system || side.left + side.right === 0) return undefined;
  const half = TRACK_WIDTH / 2;
  const parts: Manifold[] = [];
  const studR = (system.diameter + STUD_FIT) / 2;
  for (const path of elementShape(type, variant).paths) {
    const length = pathLength(path);
    for (const [sign, width] of [
      [1, side.left],
      [-1, side.right],
    ] as const) {
      if (width <= 0) continue;
      const u0 = sign > 0 ? half - 0.5 : -half - width;
      const u1 = sign > 0 ? half + width : -half + 0.5;
      const ledge = wasm.CrossSection.ofPolygons([
        [
          [u0, 0],
          [u1, 0],
          [u1, TRACK_HEIGHT],
          [u0, TRACK_HEIGHT],
        ],
      ]);
      parts.push(sweep(wasm, ledge, path));
      // studs on the grid, centred along the path
      const n = Math.floor(length / system.pitch);
      const start = (length - n * system.pitch) / 2 + system.pitch / 2;
      const rows = Math.round(width / system.pitch);
      for (let i = 0; i < n; i++) {
        const p = pointAt(path, start + i * system.pitch);
        const nx = -Math.sin((p.heading * Math.PI) / 180);
        const ny = Math.cos((p.heading * Math.PI) / 180);
        for (let r = 0; r < rows; r++) {
          const u = sign * (half + system.pitch * (r + 0.5));
          let stud = wasm.Manifold.cylinder(system.height + 0.01, studR, studR, 32).translate([0, 0, TRACK_HEIGHT - 0.01]);
          if (system.hollow > 0) stud = stud.subtract(wasm.Manifold.cylinder(system.height + 1, system.hollow / 2, system.hollow / 2, 24).translate([0, 0, TRACK_HEIGHT + 0.3]));
          parts.push(stud.translate([p.x + nx * u, p.y + ny * u, p.z]));
        }
      }
    }
  }
  return wasm.Manifold.union(parts);
}

/** A pillar under raised track: a foot, the column and side lips that hold the track (none if `plain`). */
export function buildSupport(wasm: ManifoldToplevel, height: number, plain: boolean): Manifold {
  const { Manifold } = wasm;
  const inner = TRACK_WIDTH + SUPPORT_FIT;
  const outer = inner + 2 * SUPPORT_LIP_THICKNESS;
  const column = Manifold.cube([SUPPORT_LENGTH, outer, height], false).translate([-SUPPORT_LENGTH / 2, -outer / 2, 0]);
  const foot = Manifold.cube([SUPPORT_LENGTH + SUPPORT_FOOT_GROW, outer + SUPPORT_FOOT_GROW, Math.min(SUPPORT_FOOT, height)], false).translate([
    -(SUPPORT_LENGTH + SUPPORT_FOOT_GROW) / 2,
    -(outer + SUPPORT_FOOT_GROW) / 2,
    0,
  ]);
  let solid = column.add(foot);
  // a tall support becomes a portal: an arch across, the track passes over it
  const leg = ARCH_PIER + SUPPORT_LIP_THICKNESS;
  const arch = archOutline(-outer / 2 + leg, outer / 2 - leg, SUPPORT_FOOT + ARCH_FOOT, height - ARCH_CROWN);
  if (arch) solid = solid.subtract(wasm.CrossSection.ofPolygons([arch]).extrude(SUPPORT_LENGTH + SUPPORT_FOOT_GROW + 2 * OVERCUT).transform(PROFILE_TO_TRACK).translate([-(SUPPORT_LENGTH + SUPPORT_FOOT_GROW) / 2 - OVERCUT, 0, 0]));
  if (!plain) {
    for (const sign of [1, -1]) {
      solid = solid.add(
        Manifold.cube([SUPPORT_LENGTH, SUPPORT_LIP_THICKNESS, SUPPORT_LIP], false).translate([-SUPPORT_LENGTH / 2, sign > 0 ? inner / 2 : -inner / 2 - SUPPORT_LIP_THICKNESS, height]),
      );
    }
  }
  return solid;
}

export { pathLength };
