// The track plan: pieces hang on each other as a tree (each piece knows the port of its parent it
// is plugged into), so changing an element type moves everything behind it. Loops are found by
// looking for free ports that meet.
import { TRACK_WIDTH } from "../presets/gauge";
import { PLAIN, elementShape, newId, normDeg, pathLength, pointAt, standsOnGround, variantsOf } from "./track";
import type { ElementType, Gender, Port, Variant } from "./track";

export interface Piece {
  id: string;
  /** id of its element type */
  type: string;
  variant: Variant;
  /** the port of the parent this piece is plugged into; absent for a root piece */
  parent?: { piece: string; port: number };
  /** own port that is plugged into the parent (for a root: the port at the start point) */
  port: number;
  /** root pieces only: where they lie (mm, degrees) */
  at?: { x: number; y: number; rotation: number };
}

export interface Layout {
  pieces: Piece[];
}

export interface Pose {
  x: number;
  y: number;
  z: number;
  /** degrees, counter-clockwise */
  rotation: number;
}

export interface WorldPort extends Port {
  piece: string;
  index: number;
}

/** A pair of ports that meet: plugged by the tree or closed by a loop. */
export interface Joint {
  a: WorldPort;
  b: WorldPort;
  /** false: male meets male or female meets female, an adapter is needed */
  fits: boolean;
  /** found by position, not plugged by the user */
  closed: boolean;
}

export interface Analysis {
  poses: Map<string, Pose>;
  ports: WorldPort[];
  joints: Joint[];
  open: WorldPort[];
  /** pieces that hang in the air without a support (flat track above the bed) */
  floating: string[];
  /** pieces that overlap another one they are not joined to */
  overlapping: string[];
  /** pieces whose type is gone */
  missing: string[];
}

/** Ports closer than this meet (the play of wooden track). */
export const JOIN_DISTANCE = 2;
export const JOIN_ANGLE = 3;
export const HEIGHT_TOLERANCE = 0.5;

const RAD = Math.PI / 180;

export function rotate(x: number, y: number, deg: number): [number, number] {
  const c = Math.cos(deg * RAD);
  const s = Math.sin(deg * RAD);
  return [x * c - y * s, x * s + y * c];
}

/** A port of a piece in world coordinates. */
export function toWorld(port: Port, pose: Pose): Port {
  const [x, y] = rotate(port.x, port.y, pose.rotation);
  return { ...port, x: x + pose.x, y: y + pose.y, z: port.z + pose.z, heading: normDeg(port.heading + pose.rotation) };
}

/** The pose that puts `own` port of a piece against the world port `target`. */
export function poseAgainst(own: Port, target: Port): Pose {
  const rotation = normDeg(target.heading + 180 - own.heading);
  const [x, y] = rotate(own.x, own.y, rotation);
  return { x: target.x - x, y: target.y - y, z: target.z - own.z, rotation };
}

/** Places every piece, finds joints, loops and open ends. */
export function analyze(layout: Layout, types: readonly ElementType[]): Analysis {
  const typeOf = new Map(types.map((t) => [t.id, t]));
  const poses = new Map<string, Pose>();
  const missing: string[] = [];
  const byId = new Map(layout.pieces.map((p) => [p.id, p]));
  const children = new Map<string, Piece[]>();
  for (const piece of layout.pieces) {
    if (!piece.parent) continue;
    const list = children.get(piece.parent.piece) ?? [];
    list.push(piece);
    children.set(piece.parent.piece, list);
  }
  const portsOf = (piece: Piece) => {
    const type = typeOf.get(piece.type);
    return type ? elementShape(type, piece.variant).ports : [];
  };

  // breadth first from the roots, so that a long chain never overflows the stack
  const queue: Piece[] = layout.pieces.filter((p) => !p.parent || !byId.has(p.parent.piece));
  for (const root of queue) {
    const own = portsOf(root)[root.port];
    const at = root.at ?? { x: 0, y: 0, rotation: 0 };
    if (!own) {
      poses.set(root.id, { x: at.x, y: at.y, z: 0, rotation: at.rotation });
      continue;
    }
    // the root's own port lies at the start point; the track leaves it in the direction `rotation`
    const target: Port = { x: at.x, y: at.y, z: 0, heading: normDeg(at.rotation + own.heading - 180), gender: own.gender };
    poses.set(root.id, poseAgainst(own, target));
  }
  for (let i = 0; i < queue.length; i++) {
    const piece = queue[i] as Piece;
    if (!typeOf.has(piece.type)) missing.push(piece.id);
    const pose = poses.get(piece.id) as Pose;
    const ports = portsOf(piece);
    for (const child of children.get(piece.id) ?? []) {
      if (poses.has(child.id)) continue;
      const target = child.parent ? ports[child.parent.port] : undefined;
      const own = portsOf(child)[child.port];
      poses.set(child.id, target && own ? poseAgainst(own, toWorld(target, pose)) : { ...pose });
      queue.push(child);
    }
  }

  const ports: WorldPort[] = [];
  for (const piece of layout.pieces) {
    const pose = poses.get(piece.id);
    if (!pose) continue;
    portsOf(piece).forEach((port, index) => ports.push({ ...toWorld(port, pose), piece: piece.id, index }));
  }
  const key = (p: { piece: string; index: number }) => `${p.piece}:${p.index}`;
  const portByKey = new Map(ports.map((p) => [key(p), p]));
  const used = new Set<string>();
  const joints: Joint[] = [];
  for (const piece of layout.pieces) {
    if (!piece.parent) continue;
    const a = portByKey.get(`${piece.parent.piece}:${piece.parent.port}`);
    const b = portByKey.get(`${piece.id}:${piece.port}`);
    if (!a || !b) continue;
    used.add(key(a));
    used.add(key(b));
    joints.push({ a, b, fits: a.gender !== b.gender, closed: false });
  }
  const free = ports.filter((p) => !used.has(key(p)));
  for (let i = 0; i < free.length; i++) {
    const a = free[i] as WorldPort;
    if (used.has(key(a))) continue;
    for (let j = i + 1; j < free.length; j++) {
      const b = free[j] as WorldPort;
      if (used.has(key(b)) || a.piece === b.piece) continue;
      if (meets(a, b)) {
        used.add(key(a));
        used.add(key(b));
        joints.push({ a, b, fits: a.gender !== b.gender, closed: true });
        break;
      }
    }
  }
  const open = ports.filter((p) => !used.has(key(p)));

  const floating: string[] = [];
  for (const piece of layout.pieces) {
    const pose = poses.get(piece.id);
    const type = typeOf.get(piece.type);
    if (!pose || !type) continue;
    const lowest = Math.min(...elementShape(type, piece.variant).ports.map((p) => p.z + pose.z), pose.z);
    if (standsOnGround(type.kind) ? Math.abs(pose.z) > HEIGHT_TOLERANCE : lowest > HEIGHT_TOLERANCE) floating.push(piece.id);
  }

  return { poses, ports, joints, open, floating, overlapping: overlaps(layout, types, poses, joints), missing };
}

export function meets(a: Port, b: Port): boolean {
  return (
    Math.hypot(a.x - b.x, a.y - b.y) <= JOIN_DISTANCE &&
    Math.abs(a.z - b.z) <= HEIGHT_TOLERANCE &&
    Math.abs(normDeg(a.heading - b.heading - 180)) <= JOIN_ANGLE
  );
}

/**
 * Pieces that overlap without being joined: sample points along every path and look for points
 * of another piece closer than the track width. Joined neighbours, pieces at another height and
 * pieces of the same crossing are left out.
 */
function overlaps(layout: Layout, types: readonly ElementType[], poses: Map<string, Pose>, joints: Joint[]): string[] {
  const typeOf = new Map(types.map((t) => [t.id, t]));
  const neighbours = new Set(joints.flatMap((j) => [`${j.a.piece}|${j.b.piece}`, `${j.b.piece}|${j.a.piece}`]));
  const samples = new Map<string, [number, number, number][]>();
  for (const piece of layout.pieces) {
    const type = typeOf.get(piece.type);
    const pose = poses.get(piece.id);
    if (!type || !pose) continue;
    const list: [number, number, number][] = [];
    for (const path of elementShape(type, piece.variant).paths) {
      const length = pathLength(path);
      const n = Math.max(2, Math.ceil(length / 10));
      // leave out the ends: neighbours touch there
      for (let i = 1; i < n; i++) {
        const s = (length * i) / n;
        const p = pointAt(path, s);
        const [x, y] = rotate(p.x, p.y, pose.rotation);
        list.push([x + pose.x, y + pose.y, p.z + pose.z]);
      }
    }
    samples.set(piece.id, list);
  }
  const ids = [...samples.keys()];
  const hit = new Set<string>();
  const limit = TRACK_WIDTH * 0.8;
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const a = ids[i] as string;
      const b = ids[j] as string;
      if (neighbours.has(`${a}|${b}`)) continue;
      const pa = samples.get(a) as [number, number, number][];
      const pb = samples.get(b) as [number, number, number][];
      const clash = pa.some(([x, y, z]) => pb.some(([u, v, w]) => Math.abs(z - w) < 20 && Math.hypot(x - u, y - v) < limit));
      if (clash) {
        hit.add(a);
        hit.add(b);
      }
    }
  }
  return [...hit];
}

// ------------------------------------------------------------------------------ editing

export interface AttachWish {
  /** curves and switches: to which side the track should turn from the open port */
  turn?: "left" | "right";
}

/**
 * A new piece of `type` plugged into the world port `target`: the variant and the own port are
 * chosen so that the genders fit, the height works and the track turns as wished.
 */
export function attach(target: WorldPort, type: ElementType, wish: AttachWish = {}): Piece {
  let best: { variant: Variant; port: number; score: number } | undefined;
  for (const variant of variantsOf(type.kind)) {
    const ports = elementShape(type, variant).ports;
    ports.forEach((own, index) => {
      const pose = poseAgainst(own, target);
      let score = 0;
      if (own.gender === target.gender) score += 100;
      if (standsOnGround(type.kind) ? Math.abs(pose.z) > HEIGHT_TOLERANCE : pose.z < -HEIGHT_TOLERANCE) score += 1000;
      if (!standsOnGround(type.kind) && pose.z > HEIGHT_TOLERANCE) score += 50;
      if (wish.turn) {
        // how much the track turns from the open port to each other end (+ = left)
        const turns = ports
          .filter((_, i) => i !== index)
          .map((p) => normDeg(toWorld(p, pose).heading - target.heading))
          .filter((d) => Math.abs(d) > 1);
        if (turns.length > 0 && !turns.some((d) => (wish.turn === "left" ? d > 0 : d < 0))) score += 20;
      }
      if (variant.swap) score += 2;
      if (variant.mirror) score += 1;
      if (index !== 0) score += 0.5;
      if (!best || score < best.score) best = { variant, port: index, score };
    });
  }
  const chosen = best ?? { variant: PLAIN, port: 0, score: 0 };
  return { id: newId("p"), type: type.id, variant: chosen.variant, parent: { piece: target.piece, port: target.index }, port: chosen.port };
}

/** Removes a piece and everything that hangs on it. */
export function removePiece(layout: Layout, id: string): Layout {
  const gone = new Set([id]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const p of layout.pieces) {
      if (p.parent && gone.has(p.parent.piece) && !gone.has(p.id)) {
        gone.add(p.id);
        grew = true;
      }
    }
  }
  return { pieces: layout.pieces.filter((p) => !gone.has(p.id)) };
}

/** The open port of a piece that leads on (the first free one that is not its entry). */
export function nextPort(analysis: Analysis, piece: string): WorldPort | undefined {
  const ports = analysis.open.filter((p) => p.piece === piece);
  return ports.find((p) => p.index !== 0) ?? ports[0];
}

// ------------------------------------------------------------------------------ parts list

export interface PartCount {
  type: string;
  variant: Variant;
  count: number;
}

/**
 * How many of each part to print. With double-sided track a mirrored piece is the same part turned
 * over, so it counts as the plain one.
 */
export function partsList(layout: Layout, types: readonly ElementType[], doubleSided: boolean): PartCount[] {
  const typeOf = new Map(types.map((t) => [t.id, t]));
  const counts = new Map<string, PartCount>();
  for (const piece of layout.pieces) {
    const type = typeOf.get(piece.type);
    if (!type) continue;
    const variant = printVariant(type, piece.variant, doubleSided);
    const key = `${type.id}|${variant.mirror}|${variant.swap}`;
    const entry = counts.get(key) ?? { type: type.id, variant, count: 0 };
    entry.count += 1;
    counts.set(key, entry);
  }
  const order = new Map(types.map((t, i) => [t.id, i]));
  return [...counts.values()].sort((a, b) => (order.get(a.type) ?? 0) - (order.get(b.type) ?? 0) || Number(a.variant.mirror) - Number(b.variant.mirror) || Number(a.variant.swap) - Number(b.variant.swap));
}

/** The variant that is actually printed. */
export function printVariant(type: ElementType, variant: Variant, doubleSided: boolean): Variant {
  const flat = !standsOnGround(type.kind);
  return { mirror: variant.mirror && !(doubleSided && flat), swap: variant.swap };
}

export type { Gender };
