// A route along the plan, for standing the train on the track in the preview: from the first
// piece along its main path, into the piece plugged into its far end, and so on.
import { COUPLER_REACH } from "../presets/vehicle";
import { rotate } from "./layout";
import type { Analysis, Layout, Pose } from "./layout";
import { elementShape, pathLength, pointAt } from "./track";
import type { ElementType } from "./track";

export interface RoutePoint {
  x: number;
  y: number;
  /** track bottom */
  z: number;
}

const STEP = 4;
const RAD = Math.PI / 180;

export function route(layout: Layout, types: readonly ElementType[], analysis: Analysis, maxLength = 2000): RoutePoint[] {
  const typeOf = new Map(types.map((t) => [t.id, t]));
  const first = layout.pieces[0];
  if (!first) return [];
  // which port of which piece is joined to which
  const other = new Map<string, { piece: string; index: number }>();
  for (const j of analysis.joints) {
    other.set(`${j.a.piece}:${j.a.index}`, { piece: j.b.piece, index: j.b.index });
    other.set(`${j.b.piece}:${j.b.index}`, { piece: j.a.piece, index: j.a.index });
  }
  const byId = new Map(layout.pieces.map((p) => [p.id, p]));
  const points: RoutePoint[] = [];
  let length = 0;
  let piece = first;
  let entry = 0;
  const visited = new Set<string>();
  while (length < maxLength) {
    const key = `${piece.id}:${entry}`;
    if (visited.has(key)) break;
    visited.add(key);
    const type = typeOf.get(piece.type);
    const pose = analysis.poses.get(piece.id);
    if (!type || !pose) break;
    const shape = elementShape(type, piece.variant);
    const entryPort = shape.ports[entry];
    if (!entryPort) break;
    // the path that starts or ends at the entry port; the straight branch of a switch first
    const near = (x: number, y: number) => Math.hypot(x - entryPort.x, y - entryPort.y) < 0.5;
    let chosen: { path: (typeof shape.paths)[number]; forward: boolean } | undefined;
    for (const path of shape.paths) {
      const a = pointAt(path, 0);
      const b = pointAt(path, pathLength(path));
      if (near(a.x, a.y)) chosen = chosen ?? { path, forward: true };
      else if (near(b.x, b.y)) chosen = chosen ?? { path, forward: false };
    }
    if (!chosen) break;
    const total = pathLength(chosen.path);
    const n = Math.max(1, Math.ceil(total / STEP));
    for (let i = 0; i <= n; i++) {
      const s = chosen.forward ? (total * i) / n : total - (total * i) / n;
      const p = pointAt(chosen.path, s);
      const [x, y] = rotate(p.x, p.y, pose.rotation);
      const point = { x: x + pose.x, y: y + pose.y, z: p.z + pose.z };
      const last = points[points.length - 1];
      if (last) length += Math.hypot(point.x - last.x, point.y - last.y);
      if (!last || Math.hypot(point.x - last.x, point.y - last.y) > 0.01) points.push(point);
    }
    // the port at the far end of the path, and what is plugged into it
    const end = pointAt(chosen.path, chosen.forward ? total : 0);
    const exit = shape.ports.findIndex((p, i) => i !== entry && Math.hypot(p.x - end.x, p.y - end.y) < 0.5);
    if (exit < 0) break;
    const next = other.get(`${piece.id}:${exit}`);
    const nextPiece = next ? byId.get(next.piece) : undefined;
    if (!next || !nextPiece) break;
    piece = nextPiece;
    entry = next.index;
  }
  return points;
}

/** Where a vehicle of length L stands, its middle at distance s along the route. */
export function poseOnRoute(points: RoutePoint[], s: number, length: number): Pose | undefined {
  const at = (d: number) => pointAtDistance(points, d);
  const front = at(s + length / 3);
  const back = at(s - length / 3);
  const mid = at(s);
  if (!front || !back || !mid) return undefined;
  return { x: (front.x + back.x) / 2, y: (front.y + back.y) / 2, z: mid.z, rotation: Math.atan2(front.y - back.y, front.x - back.x) / RAD };
}

function pointAtDistance(points: RoutePoint[], d: number): RoutePoint | undefined {
  if (points.length < 2 || d < 0) return undefined;
  let walked = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1] as RoutePoint;
    const b = points[i] as RoutePoint;
    const seg = Math.hypot(b.x - a.x, b.y - a.y);
    if (walked + seg >= d) {
      const t = seg === 0 ? 0 : (d - walked) / seg;
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t };
    }
    walked += seg;
  }
  return undefined;
}

/** Poses of a train, the first vehicle in front (driving along the route). */
export function trainPoses(points: RoutePoint[], lengths: number[], start = 30): (Pose | undefined)[] {
  const gap = 2 * COUPLER_REACH;
  const poses: (Pose | undefined)[] = new Array(lengths.length);
  let cursor = start;
  for (let i = lengths.length - 1; i >= 0; i--) {
    const L = lengths[i] as number;
    poses[i] = poseOnRoute(points, cursor + L / 2, L);
    cursor += L + gap;
  }
  return poses;
}
