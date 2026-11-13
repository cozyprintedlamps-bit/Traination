// Track elements as solids: the cross-section is swept along every path of the element, the
// grooves are cut, sockets cut into the female ends and pegs added to the male ends.
//
// Sweeps: a cross-section in (u = across, left positive; v = up) is extruded along +X for lines
// and revolved around the curve centre for arcs.
import type { CrossSection, Manifold, ManifoldToplevel } from "manifold-3d";
import { elementShape, pathLength, smoothstep, standsOnGround } from "../core/track";
import type { ElementType, Path, Port, Variant } from "../core/track";
import {
  BRIDGE_DECK,
  BRIDGE_PILLAR_LENGTH,
  GROOVE_DEPTH,
  GROOVE_SPACING,
  GROOVE_WIDTH,
  PEG_HEAD_DIAMETER,
  PEG_HEIGHT,
  PEG_NECK_WIDTH,
  PEG_REACH,
  RAMP_RIB_SPACING,
  RAMP_WALL,
  TRACK_EDGE_CHAMFER,
  TRACK_HEIGHT,
  TRACK_WIDTH,
} from "../presets/gauge";

export interface TrackOptions {
  doubleSided: boolean;
  connectorFit: number;
}

/** The buffer stop block at the end of a buffer element. */
export const BUFFER_BLOCK_LENGTH = 14;
export const BUFFER_BLOCK_HEIGHT = 30;
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
  if (type.kind === "ramp" && first?.kind === "line") {
    // hollow support: two side walls and cross ribs under the track
    const side = rampSide(wasm, first);
    bodies.push(across(side, -half + TRACK_EDGE_CHAMFER, -half + RAMP_WALL));
    bodies.push(across(side, half - RAMP_WALL, half - TRACK_EDGE_CHAMFER));
    const ribs = Math.max(2, Math.round(first.length / RAMP_RIB_SPACING) + 1);
    for (let i = 0; i < ribs; i++) {
      const x = Math.min(Math.max(((first.length - RAMP_WALL) * i) / (ribs - 1), 0), first.length - RAMP_WALL);
      const slab = Manifold.cube([RAMP_WALL, TRACK_WIDTH - 2 * TRACK_EDGE_CHAMFER, Math.max(first.z0, first.z1) + TRACK_HEIGHT], false).translate([x, -half + TRACK_EDGE_CHAMFER, 0]);
      bodies.push(across(side, -half + TRACK_EDGE_CHAMFER, half - TRACK_EDGE_CHAMFER).intersect(slab));
    }
  }
  if (type.kind === "bridge" && first?.kind === "line") {
    const deck = Manifold.cube([first.length, TRACK_WIDTH, BRIDGE_DECK + 1], false).translate([0, -half, first.z0 - BRIDGE_DECK]);
    const pillar = Manifold.cube([BRIDGE_PILLAR_LENGTH, TRACK_WIDTH, first.z0], false);
    bodies.push(deck, pillar.translate([0, -half, 0]), pillar.translate([first.length - BRIDGE_PILLAR_LENGTH, -half, 0]));
  }
  if (type.kind === "buffer" && first?.kind === "line") {
    const block = Manifold.cube([BUFFER_BLOCK_LENGTH, TRACK_WIDTH, BUFFER_BLOCK_HEIGHT], false).translate([first.length - BUFFER_BLOCK_LENGTH, -half, 0]);
    const beam = Manifold.cube([4, TRACK_WIDTH + 8, 8], false).translate([first.length - BUFFER_BLOCK_LENGTH - 4, -half - 4, BUFFER_BLOCK_HEIGHT - 14]);
    bodies.push(block, beam);
  }

  let solid = Manifold.union(bodies).subtract(Manifold.union(cutters));
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

export { pathLength };
