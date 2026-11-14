// "Close the track": finds pieces that lead from one free end to another. The route is
// curves – straight – curves – straight (with the plan's curve), the straights are made of the
// standard straights plus, if needed, one fitting straight of exactly the missing length. If the
// two ends have the same gender, an adapter goes in front of the target end.
import { MIN_FILL_LENGTH } from "../presets/gauge";
import { attach, meets, poseAgainst, toWorld } from "./layout";
import type { Piece, WorldPort } from "./layout";
import { elementShape, makeElement, normDeg } from "./track";
import type { ElementType, Gender } from "./track";

export type CloseError = "no_pair" | "height" | "angle" | "no_route";

export interface CloseResult {
  pieces: Piece[];
  /** element types the route needs that the project does not have yet (fitting straight, adapter) */
  newTypes: ElementType[];
}

const RAD = Math.PI / 180;
const MAX_FILL = 250;

interface Step {
  type: ElementType;
  turn?: "left" | "right";
}

/** Where `count` curves (signed: + = left) starting with heading h end, relative to the start. */
export function arcOffset(h: number, count: number, radius: number, angle: number): [number, number] {
  if (count === 0) return [0, 0];
  const theta = count * angle * RAD;
  const sign = Math.sign(theta);
  const a = h * RAD;
  return [sign * radius * (Math.sin(a + theta) - Math.sin(a)), sign * radius * (Math.cos(a) - Math.cos(a + theta))];
}

/**
 * Standard straights plus at most one fitting straight for the rest, with as few pieces as
 * possible (a fitting straight counts a little more than a standard one); undefined if impossible.
 */
export function fillStraight(length: number, straights: number[]): { standard: number[]; fill: number } | undefined {
  if (length < 0.5) return { standard: [], fill: 0 };
  if (length < MIN_FILL_LENGTH) return undefined;
  const kinds = [...new Set(straights)].sort((a, b) => b - a).slice(0, 4);
  let best: { standard: number[]; fill: number; cost: number } | undefined;
  const search = (k: number, chosen: number[], rest: number) => {
    if (k === kinds.length) {
      const exact = Math.abs(rest) < 0.5;
      if (!exact && (rest < MIN_FILL_LENGTH || rest > MAX_FILL)) return;
      const cost = chosen.length + (exact ? 0 : 1.2);
      if (!best || cost < best.cost) best = { standard: [...chosen], fill: exact ? 0 : Math.round(rest * 10) / 10, cost };
      return;
    }
    const s = kinds[k] as number;
    for (let n = 0; n * s <= rest + 0.5 && n <= 12; n++) {
      search(k + 1, [...chosen, ...Array<number>(n).fill(s)], rest - n * s);
    }
  };
  search(0, [], length);
  return best ? { standard: best.standard, fill: best.fill } : undefined;
}

/**
 * Pieces from free end `a` to free end `b`. `types` are the project's element types: the route
 * uses the large curve (or the first plain curve) and the plain straights.
 */
export function closeGap(types: readonly ElementType[], a: WorldPort, b: WorldPort): CloseResult | CloseError {
  if (Math.abs(a.z - b.z) > 0.5) return "height";
  const curve = types.find((t) => t.id === "curve-large") ?? types.find((t) => t.kind === "curve" && t.studs === "none");
  if (!curve) return "no_route";
  const newTypes: ElementType[] = [];

  // the chain keeps the gender of the end it starts at; for an end of the same gender an adapter
  // sits right in front of it, so the route leads to the far end of the adapter
  let adapter: ElementType | undefined;
  let goal: WorldPort = b;
  if (a.gender === b.gender) {
    const wanted: Gender = a.gender === "male" ? "female" : "male";
    adapter = types.find((t) => t.kind === "adapter" && t.adapter === wanted);
    if (!adapter) {
      adapter = makeElement("adapter", { adapter: wanted, color: curve.color });
      newTypes.push(adapter);
    }
    goal = {
      ...b,
      x: b.x + Math.cos(b.heading * RAD) * adapter.length,
      y: b.y + Math.sin(b.heading * RAD) * adapter.length,
      gender: a.gender === "male" ? "female" : "male",
    };
  }

  const angle = curve.angle;
  const turns = Math.round(360 / angle);
  const delta = normDeg(goal.heading + 180 - a.heading);
  const n = Math.round(delta / angle);
  if (Math.abs(n * angle - delta) > 1) return "angle";
  const straights = types
    .filter((t) => t.kind === "straight" && t.studs === "none" && t.id.startsWith("straight-"))
    .map((t) => t.length)
    .sort((x, y) => y - x);

  let best: { k1: number; k2: number; s1: number; s2: number; cost: number } | undefined;
  for (let k1 = -(turns - 1); k1 <= turns - 1; k1++) {
    for (const m of [-1, 0, 1]) {
      const k2 = n - k1 + m * turns;
      if (Math.abs(k2) >= turns) continue;
      const h1 = a.heading + k1 * angle;
      const h2 = h1 + k2 * angle;
      const [o1x, o1y] = arcOffset(a.heading, k1, curve.radius, angle);
      const [o2x, o2y] = arcOffset(h1, k2, curve.radius, angle);
      const dx = goal.x - a.x - o1x - o2x;
      const dy = goal.y - a.y - o1y - o2y;
      const u1 = [Math.cos(h1 * RAD), Math.sin(h1 * RAD)] as const;
      const u2 = [Math.cos(h2 * RAD), Math.sin(h2 * RAD)] as const;
      const det = u1[0] * u2[1] - u1[1] * u2[0];
      let s1: number;
      let s2: number;
      if (Math.abs(det) < 1e-6) {
        // parallel: the gap must lie on the line
        if (Math.abs(dx * u1[1] - dy * u1[0]) > 0.5) continue;
        s1 = dx * u1[0] + dy * u1[1];
        s2 = 0;
      } else {
        s1 = (dx * u2[1] - dy * u2[0]) / det;
        s2 = (u1[0] * dy - u1[1] * dx) / det;
      }
      if (s1 < -0.5 || s2 < -0.5) continue;
      const f1 = fillStraight(Math.max(s1, 0), straights);
      const f2 = fillStraight(Math.max(s2, 0), straights);
      if (!f1 || !f2) continue;
      const cost = Math.abs(k1) + Math.abs(k2) + f1.standard.length + f2.standard.length + (f1.fill ? 1.5 : 0) + (f2.fill ? 1.5 : 0) + (s1 + s2) / 2000;
      if (!best || cost < best.cost) best = { k1, k2, s1: Math.max(s1, 0), s2: Math.max(s2, 0), cost };
    }
  }
  if (!best) return "no_route";

  const straightOf = (length: number): ElementType => {
    const have = [...types, ...newTypes].find((t) => t.kind === "straight" && t.studs === "none" && Math.abs(t.length - length) < 0.05);
    if (have) return have;
    const made = makeElement("straight", { length, color: curve.color });
    newTypes.push(made);
    return made;
  };
  const steps: Step[] = [];
  const curves = (k: number) => {
    for (let i = 0; i < Math.abs(k); i++) steps.push({ type: curve, turn: k > 0 ? "left" : "right" });
  };
  const straight = (s: number) => {
    const f = fillStraight(s, straights);
    if (!f) return;
    for (const len of f.standard) steps.push({ type: straightOf(len) });
    if (f.fill) steps.push({ type: straightOf(f.fill) });
  };
  curves(best.k1);
  straight(best.s1);
  curves(best.k2);
  straight(best.s2);
  if (adapter) steps.push({ type: adapter });

  const pieces: Piece[] = [];
  let target: WorldPort = a;
  for (const step of steps) {
    const piece = attach(target, step.type, step.turn ? { turn: step.turn } : {});
    pieces.push(piece);
    const ports = elementShape(step.type, piece.variant).ports;
    const own = ports[piece.port];
    const exitIndex = ports.findIndex((_, i) => i !== piece.port);
    const exit = ports[exitIndex];
    if (!own || !exit) return "no_route";
    target = { ...toWorld(exit, poseAgainst(own, target)), piece: piece.id, index: exitIndex };
  }
  if (!meets(target, b)) return "no_route";
  return { pieces, newTypes };
}

/** The two free ends to join: the chosen one and the nearest other at the same height, or the only two. */
export function pairToClose(open: WorldPort[], chosen?: { piece: string; index: number }): [WorldPort, WorldPort] | undefined {
  const first = (chosen && open.find((p) => p.piece === chosen.piece && p.index === chosen.index)) ?? open[0];
  if (!first) return undefined;
  const others = open.filter((p) => p !== first && Math.abs(p.z - first.z) < 0.5);
  if (others.length === 0) return undefined;
  others.sort((p, q) => Math.hypot(p.x - first.x, p.y - first.y) - Math.hypot(q.x - first.x, q.y - first.y));
  return [first, others[0] as WorldPort];
}
