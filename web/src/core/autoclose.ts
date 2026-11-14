// "Close the track": finds pieces that lead from one free end to another.
//
// Candidate routes are made of arcs and straights:
// - arc – straight – arc (like Dubins paths) with radii of the standard curves and other radii,
// - a single arc plus a straight with exactly the radius the gap needs,
// - the old route of standard curves – straight – standard curves – straight.
// An arc with the radius of a standard curve is built from standard curves plus at most one fitting
// curve; an arc of another radius from equal fitting curves; a straight from standard straights
// plus at most one fitting straight. Every piece has to fit the print bed. The cheapest route that
// does not run into other track wins. If the two ends have the same gender, an adapter goes in
// front of the target end.
import { MAX_FIT_ANGLE, MAX_FIT_RADIUS, MIN_FILL_LENGTH, MIN_FIT_RADIUS, PEG_REACH } from "../presets/gauge";
import { BED_SPACING } from "../presets/print";
import { analyze, attach, meets, poseAgainst, toWorld } from "./layout";
import type { Layout, Piece, WorldPort } from "./layout";
import { elementShape, makeElement, normDeg, outline } from "./track";
import type { ElementType, Gender } from "./track";

export type CloseError = "no_pair" | "height" | "angle" | "no_route";

export interface CloseResult {
  pieces: Piece[];
  /** element types the route needs that the project does not have yet (fitting pieces, adapter) */
  newTypes: ElementType[];
}

export interface CloseContext {
  /** the plan the route is added to: the route must not run into its pieces */
  layout?: Layout;
  /** print bed (mm): every new piece must fit */
  bed?: [number, number];
}

const RAD = Math.PI / 180;
const MAX_FILL = 250;
/** other radii tried for fitting curves (besides those of the standard curves) */
const FIT_RADII = [120, 150, 220, 270, 330, 400, 500, 650, 850, 1100, 1500, 2000, 3000];
/** fitting curves tighter than this cost a little more (the large standard curve) */
const GENTLE_RADIUS = 182;
/** routes checked against the plan, cheapest first */
const CHECKED = 40;

type Segment = { kind: "arc"; radius: number; angle: number } | { kind: "line"; length: number };

/** A piece of the route: an existing type or a fitting piece still to be made. */
type Spec = { type: ElementType } | { kind: "straight"; length: number } | { kind: "curve"; radius: number; angle: number };

interface Step {
  spec: Spec;
  turn?: "left" | "right";
}

interface Pose2 {
  x: number;
  y: number;
  /** degrees */
  h: number;
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
export function fillStraight(length: number, straights: number[], maxFill = MAX_FILL): { standard: number[]; fill: number } | undefined {
  if (length < 0.5) return { standard: [], fill: 0 };
  if (length < MIN_FILL_LENGTH) return undefined;
  const kinds = [...new Set(straights)].sort((a, b) => b - a).slice(0, 4);
  let best: { standard: number[]; fill: number; cost: number } | undefined;
  const search = (k: number, chosen: number[], rest: number) => {
    if (k === kinds.length) {
      const exact = Math.abs(rest) < 0.5;
      if (!exact && (rest < MIN_FILL_LENGTH || rest > maxFill)) return;
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

// ------------------------------------------------------------------------------ routes

const unit = (h: number): [number, number] => [Math.cos(h * RAD), Math.sin(h * RAD)];
const leftOf = (h: number): [number, number] => [-Math.sin(h * RAD), Math.cos(h * RAD)];

/** Turn from heading `from` to `to` in direction d (+1 left, −1 right), in degrees with sign. */
function turnBy(from: number, to: number, d: number): number {
  let a = (((d * (to - from)) % 360) + 360) % 360;
  if (a > 359.95) a = 0;
  return d * a;
}

/** Arc (radius r1, direction d1) – straight – arc (r2, d2) from p0 to p1. */
function arcLineArc(p0: Pose2, p1: Pose2, r1: number, d1: number, r2: number, d2: number): Segment[] | undefined {
  const n0 = leftOf(p0.h);
  const n1 = leftOf(p1.h);
  const c1 = [p0.x + d1 * r1 * n0[0], p0.y + d1 * r1 * n0[1]];
  const c2 = [p1.x + d2 * r2 * n1[0], p1.y + d2 * r2 * n1[1]];
  const dx = (c2[0] as number) - (c1[0] as number);
  const dy = (c2[1] as number) - (c1[1] as number);
  const k = d2 * r2 - d1 * r1;
  const dist2 = dx * dx + dy * dy - k * k;
  if (dist2 < 0) return undefined;
  const length = Math.sqrt(dist2);
  const alpha = (Math.atan2(dy, dx) - Math.atan2(k, length)) / RAD;
  return [
    { kind: "arc", radius: r1, angle: turnBy(p0.h, alpha, d1) },
    { kind: "line", length },
    { kind: "arc", radius: r2, angle: turnBy(alpha, p1.h, d2) },
  ];
}

/** One arc with exactly the radius the gap needs, with a straight before or after it. */
function arcWithLine(p0: Pose2, p1: Pose2): Segment[] | undefined {
  const theta = normDeg(p1.h - p0.h);
  const u0 = unit(p0.h);
  const u1 = unit(p1.h);
  const wx = p1.x - p0.x;
  const wy = p1.y - p0.y;
  if (Math.abs(theta) < 0.3) {
    // the same direction: a straight if the ends lie on one line
    const along = wx * u0[0] + wy * u0[1];
    const across = -wx * u0[1] + wy * u0[0];
    return Math.abs(across) < 0.3 && along > 0 ? [{ kind: "line", length: along }] : undefined;
  }
  if (Math.abs(theta) > 179) return undefined;
  const det = u0[0] * u1[1] - u0[1] * u1[0];
  const t = (wx * u1[1] - wy * u1[0]) / det;
  const s = (u0[0] * wy - u0[1] * wx) / det;
  if (t <= 0 || s <= 0) return undefined;
  const tangent = Math.min(t, s);
  const radius = tangent / Math.tan((Math.abs(theta) * RAD) / 2);
  if (radius < MIN_FIT_RADIUS || radius > MAX_FIT_RADIUS) return undefined;
  const arc: Segment = { kind: "arc", radius: Math.round(radius * 10) / 10, angle: theta };
  return t > s ? [{ kind: "line", length: t - s }, arc] : [arc, { kind: "line", length: s - t }];
}

/** The route of the first version: standard curves – straight – standard curves – straight. */
function standardRoute(p0: Pose2, p1: Pose2, curve: ElementType, straights: number[]): Segment[] | undefined {
  const angle = curve.angle;
  const turns = Math.round(360 / angle);
  const delta = normDeg(p1.h - p0.h);
  const n = Math.round(delta / angle);
  if (Math.abs(n * angle - delta) > 1) return undefined;
  let best: { segments: Segment[]; cost: number } | undefined;
  for (let k1 = -(turns - 1); k1 <= turns - 1; k1++) {
    for (const m of [-1, 0, 1]) {
      const k2 = n - k1 + m * turns;
      if (Math.abs(k2) >= turns) continue;
      const h1 = p0.h + k1 * angle;
      const h2 = h1 + k2 * angle;
      const [o1x, o1y] = arcOffset(p0.h, k1, curve.radius, angle);
      const [o2x, o2y] = arcOffset(h1, k2, curve.radius, angle);
      const dx = p1.x - p0.x - o1x - o2x;
      const dy = p1.y - p0.y - o1y - o2y;
      const u1 = unit(h1);
      const u2 = unit(h2);
      const det = u1[0] * u2[1] - u1[1] * u2[0];
      let s1: number;
      let s2: number;
      if (Math.abs(det) < 1e-6) {
        if (Math.abs(dx * u1[1] - dy * u1[0]) > 0.5) continue;
        s1 = dx * u1[0] + dy * u1[1];
        s2 = 0;
      } else {
        s1 = (dx * u2[1] - dy * u2[0]) / det;
        s2 = (u1[0] * dy - u1[1] * dx) / det;
      }
      if (s1 < -0.5 || s2 < -0.5) continue;
      if (!fillStraight(Math.max(s1, 0), straights) || !fillStraight(Math.max(s2, 0), straights)) continue;
      const cost = Math.abs(k1) + Math.abs(k2) + (s1 + s2) / 500;
      if (!best || cost < best.cost) {
        best = {
          segments: [
            { kind: "arc", radius: curve.radius, angle: k1 * angle },
            { kind: "line", length: Math.max(s1, 0) },
            { kind: "arc", radius: curve.radius, angle: k2 * angle },
            { kind: "line", length: Math.max(s2, 0) },
          ],
          cost,
        };
      }
    }
  }
  return best?.segments;
}

// ------------------------------------------------------------------------------ pieces

/** Does an element (as it is printed, pegs included) fit the bed, turned if needed? */
export function fitsBed(type: ElementType, bed: [number, number]): boolean {
  const points = outline(type).flat();
  for (const port of elementShape(type).ports) {
    if (port.gender !== "male") continue;
    const [ux, uy] = unit(port.heading);
    points.push([port.x + ux * PEG_REACH, port.y + uy * PEG_REACH]);
  }
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  const size = [Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)].sort((a, b) => a - b);
  const room = [bed[0] - 2 * BED_SPACING, bed[1] - 2 * BED_SPACING].sort((a, b) => a - b);
  return (size[0] as number) <= (room[0] as number) && (size[1] as number) <= (room[1] as number);
}

const specType = (spec: Spec): ElementType =>
  "type" in spec ? spec.type : spec.kind === "straight" ? makeElement("straight", { length: spec.length }) : makeElement("curve", { radius: spec.radius, angle: spec.angle });

interface Builder {
  curves: ElementType[];
  straights: number[];
  straightTypes: ElementType[];
  bed: [number, number];
  maxFill: number;
  /** fitsBed for a fitting curve, remembered by its size */
  fits(spec: Spec): boolean;
}

function arcSteps(b: Builder, radius: number, angle: number): Step[] | undefined {
  const abs = Math.abs(angle);
  if (abs < 0.05) return [];
  const turn = angle > 0 ? "left" : "right";
  const fitting = (r: number, a: number): Step => ({ spec: { kind: "curve", radius: Math.round(r * 10) / 10, angle: Math.round(a * 100) / 100 }, turn });
  const long = (r: number, a: number) => a * RAD * r >= MIN_FILL_LENGTH;
  const standard = b.curves.find((c) => Math.abs(c.radius - radius) < 0.05);
  if (standard) {
    const n = Math.floor((abs + 0.05) / standard.angle);
    const rest = abs - n * standard.angle;
    const many = (k: number): Step[] => Array.from({ length: k }, () => ({ spec: { type: standard }, turn }));
    if (rest < 0.05) return many(n);
    if (long(radius, rest)) return [...many(n), fitting(radius, rest)];
    if (n >= 1 && b.fits(fitting(radius, standard.angle + rest).spec)) return [...many(n - 1), fitting(radius, standard.angle + rest)];
    return undefined;
  }
  // another radius: equal fitting curves, as few as fit the bed
  for (let k = Math.max(1, Math.ceil(abs / MAX_FIT_ANGLE)); k <= 12; k++) {
    const a = abs / k;
    if (!long(radius, a)) return undefined;
    const step = fitting(radius, a);
    if (b.fits(step.spec)) return Array.from({ length: k }, () => step);
  }
  return undefined;
}

function lineSteps(b: Builder, length: number): Step[] | undefined {
  const f = fillStraight(length, b.straights, b.maxFill);
  if (!f) return undefined;
  const steps: Step[] = f.standard.map((l) => ({ spec: { type: b.straightTypes.find((t) => t.length === l) as ElementType } }));
  if (f.fill) steps.push({ spec: { kind: "straight", length: f.fill } });
  return steps;
}

function stepsOf(b: Builder, segments: Segment[]): Step[] | undefined {
  const steps: Step[] = [];
  for (const s of segments) {
    const part = s.kind === "arc" ? arcSteps(b, s.radius, s.angle) : lineSteps(b, s.length);
    if (!part) return undefined;
    steps.push(...part);
  }
  return steps.length > 0 ? steps : undefined;
}

const specKey = (spec: Spec) => ("type" in spec ? spec.type.id : spec.kind === "straight" ? `s${spec.length}` : `c${spec.radius}/${spec.angle}`);

/**
 * Standard pieces count 1, fitting pieces more, every new kind of fitting piece more again (it is a
 * part of its own to print), and fitting curves tighter than the large standard curve a bit more.
 */
function costOf(steps: Step[], segments: Segment[]): number {
  const fitting = steps.filter((s) => !("type" in s.spec));
  const kinds = new Set(fitting.map((s) => specKey(s.spec)));
  const tight = fitting.reduce((n, s) => n + ("radius" in s.spec && s.spec.radius < GENTLE_RADIUS ? (GENTLE_RADIUS - s.spec.radius) / GENTLE_RADIUS : 0), 0);
  const length = segments.reduce((n, s) => n + (s.kind === "line" ? s.length : Math.abs(s.angle) * RAD * s.radius), 0);
  return steps.length + 0.5 * fitting.length + 2.5 * kinds.size + tight + length / 2000;
}

/**
 * Pieces from free end `a` to free end `b`. `types` are the project's element types: the route
 * uses the standard curves and straights and makes fitting pieces where they are needed.
 */
export function closeGap(types: readonly ElementType[], a: WorldPort, b: WorldPort, context: CloseContext = {}): CloseResult | CloseError {
  if (Math.abs(a.z - b.z) > 0.5) return "height";
  const curves = types.filter((t) => t.kind === "curve" && t.studs === "none" && t.id.startsWith("curve-"));
  const large = types.find((t) => t.id === "curve-large") ?? curves[0];
  const color = large?.color ?? types[0]?.color;
  const straightTypes = types.filter((t) => t.kind === "straight" && t.studs === "none" && t.id.startsWith("straight-"));
  const bed = context.bed ?? [256, 256];
  const fitted = new Map<string, boolean>();
  const builder: Builder = {
    fits: (spec) => {
      const key = specKey(spec);
      let ok = fitted.get(key);
      if (ok === undefined) {
        ok = fitsBed(specType(spec), bed);
        fitted.set(key, ok);
      }
      return ok;
    },
    curves,
    straights: straightTypes.map((t) => t.length),
    straightTypes,
    bed,
    maxFill: Math.min(MAX_FILL, Math.max(bed[0], bed[1]) - 2 * BED_SPACING - PEG_REACH),
  };

  // the chain keeps the gender of the end it starts at; for an end of the same gender an adapter
  // sits right in front of it, so that the route leads to the far end of the adapter
  let adapter: ElementType | undefined;
  let adapterIsNew = false;
  let goal: WorldPort = b;
  if (a.gender === b.gender) {
    const wanted: Gender = a.gender === "male" ? "female" : "male";
    adapter = types.find((t) => t.kind === "adapter" && t.adapter === wanted);
    if (!adapter) {
      adapter = makeElement("adapter", { adapter: wanted, ...(color ? { color } : {}) });
      adapterIsNew = true;
    }
    const [ux, uy] = unit(b.heading);
    goal = { ...b, x: b.x + ux * adapter.length, y: b.y + uy * adapter.length, gender: wanted === "male" ? "female" : "male" };
  }

  const p0: Pose2 = { x: a.x, y: a.y, h: a.heading };
  const p1: Pose2 = { x: goal.x, y: goal.y, h: goal.heading + 180 };
  const routes: Segment[][] = [];
  const direct = arcWithLine(p0, p1);
  if (direct) routes.push(direct);
  if (large) {
    const old = standardRoute(p0, p1, large, builder.straights);
    if (old) routes.push(old);
  }
  const radii = [...new Set([...curves.map((c) => c.radius), ...FIT_RADII])];
  for (const r1 of radii) {
    for (const r2 of radii) {
      for (const d1 of [1, -1]) {
        for (const d2 of [1, -1]) {
          const route = arcLineArc(p0, p1, r1, d1, r2, d2);
          if (route) routes.push(route);
        }
      }
    }
  }

  const plans = routes
    .map((segments) => {
      const steps = stepsOf(builder, segments);
      return steps ? { steps, cost: costOf(steps, segments) } : undefined;
    })
    .filter((p): p is { steps: Step[]; cost: number } => p !== undefined)
    .sort((x, y) => x.cost - y.cost);

  const seen = new Set<string>();
  let checked = 0;
  for (const plan of plans) {
    const key = plan.steps.map((s) => `${specKey(s.spec)}${s.turn ?? ""}`).join(",");
    if (seen.has(key)) continue;
    seen.add(key);
    if (checked++ >= CHECKED) break;
    const result = build(plan.steps, types, a, b, adapter, adapterIsNew, color, context.layout);
    if (result) return result;
  }
  return "no_route";
}

/** Places the pieces of a route; undefined if it does not reach `b` or runs into the plan. */
function build(steps: Step[], types: readonly ElementType[], a: WorldPort, b: WorldPort, adapter: ElementType | undefined, adapterIsNew: boolean, color: string | undefined, layout: Layout | undefined): CloseResult | undefined {
  const newTypes: ElementType[] = adapter && adapterIsNew ? [adapter] : [];
  const typeOf = (spec: Spec): ElementType => {
    if ("type" in spec) return spec.type;
    const all = [...types, ...newTypes];
    const have =
      spec.kind === "straight"
        ? all.find((t) => t.kind === "straight" && t.studs === "none" && Math.abs(t.length - spec.length) < 0.05)
        : all.find((t) => t.kind === "curve" && t.studs === "none" && Math.abs(t.radius - spec.radius) < 0.05 && Math.abs(t.angle - spec.angle) < 0.005);
    if (have) return have;
    const made = spec.kind === "straight" ? makeElement("straight", { length: spec.length, ...(color ? { color } : {}) }) : makeElement("curve", { radius: spec.radius, angle: spec.angle, ...(color ? { color } : {}) });
    newTypes.push(made);
    return made;
  };
  const all: { type: ElementType; turn?: "left" | "right" }[] = steps.map((s) => ({ type: typeOf(s.spec), ...(s.turn ? { turn: s.turn } : {}) }));
  if (adapter) all.push({ type: adapter });

  const pieces: Piece[] = [];
  let target: WorldPort = a;
  for (const step of all) {
    const piece = attach(target, step.type, step.turn ? { turn: step.turn } : {});
    pieces.push(piece);
    const ports = elementShape(step.type, piece.variant).ports;
    const own = ports[piece.port];
    const exitIndex = ports.findIndex((_, i) => i !== piece.port);
    const exit = ports[exitIndex];
    if (!own || !exit) return undefined;
    target = { ...toWorld(exit, poseAgainst(own, target)), piece: piece.id, index: exitIndex };
  }
  if (!meets(target, b) || target.gender === b.gender) return undefined;
  if (layout) {
    const ids = new Set(pieces.map((p) => p.id));
    const check = analyze({ pieces: [...layout.pieces, ...pieces] }, [...types, ...newTypes]);
    if (check.overlapping.some((id) => ids.has(id))) return undefined;
  }
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
