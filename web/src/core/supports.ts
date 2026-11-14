// Supports under raised track: wherever flat track lies above the bed (after a ramp, not on a
// bridge), a pillar is added under every joint and under the middle of long pieces. Ramps and
// bridges stand on the bed themselves and need none.
import { SUPPORT_SPAN } from "../presets/gauge";
import { HEIGHT_TOLERANCE, rotate } from "./layout";
import type { Analysis, Layout } from "./layout";
import { elementShape, ledges, normDeg, pathLength, pointAt, standsOnGround } from "./track";
import type { ElementType } from "./track";

export interface Support {
  x: number;
  y: number;
  /** direction of the track (degrees, 0…180) */
  heading: number;
  /** height of the track bottom = height of the pillar (mm) */
  height: number;
  /** the track has a stud ledge here: no side lips */
  plain: boolean;
}

const SAME_PLACE = 5;

export function supports(layout: Layout, types: readonly ElementType[], analysis: Analysis): Support[] {
  const typeOf = new Map(types.map((t) => [t.id, t]));
  const found: Support[] = [];
  const grounded: { x: number; y: number }[] = [];
  for (const piece of layout.pieces) {
    const type = typeOf.get(piece.type);
    const pose = analysis.poses.get(piece.id);
    if (!type || !pose || !standsOnGround(type.kind)) continue;
    for (const port of elementShape(type, piece.variant).ports) {
      const [x, y] = rotate(port.x, port.y, pose.rotation);
      grounded.push({ x: x + pose.x, y: y + pose.y });
    }
  }
  const add = (s: Support) => {
    if (s.height <= HEIGHT_TOLERANCE) return;
    if (grounded.some((g) => Math.hypot(g.x - s.x, g.y - s.y) < SAME_PLACE)) return;
    const twin = found.find((f) => Math.hypot(f.x - s.x, f.y - s.y) < SAME_PLACE && Math.abs(f.height - s.height) < 1);
    if (twin) {
      twin.plain = twin.plain || s.plain;
      return;
    }
    found.push(s);
  };
  for (const piece of layout.pieces) {
    const type = typeOf.get(piece.type);
    const pose = analysis.poses.get(piece.id);
    if (!type || !pose || standsOnGround(type.kind)) continue;
    const ledge = ledges(type, piece.variant);
    const plain = ledge.left + ledge.right > 0;
    for (const path of elementShape(type, piece.variant).paths) {
      const length = pathLength(path);
      const stops = [0, length];
      if (length > SUPPORT_SPAN) stops.push(length / 2);
      for (const s of stops) {
        const p = pointAt(path, s);
        const [x, y] = rotate(p.x, p.y, pose.rotation);
        const heading = ((normDeg(p.heading + pose.rotation) % 180) + 180) % 180;
        add({ x: x + pose.x, y: y + pose.y, heading, height: p.z + pose.z, plain });
      }
    }
  }
  return found;
}

/** Supports of the same height (and kind) are the same print part. */
export function supportParts(list: Support[]): { height: number; plain: boolean; count: number }[] {
  const parts = new Map<string, { height: number; plain: boolean; count: number }>();
  for (const s of list) {
    const height = Math.round(s.height * 10) / 10;
    const key = `${height}|${s.plain}`;
    const entry = parts.get(key) ?? { height, plain: s.plain, count: 0 };
    entry.count += 1;
    parts.set(key, entry);
  }
  return [...parts.values()].sort((a, b) => a.height - b.height);
}
