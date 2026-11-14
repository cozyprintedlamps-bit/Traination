// Switches with a lever: where the slider lies and how it moves. Pure data (no 3D kernel); the
// geometry builds the slider and the slot in the track from it.
//
// At the switch point the two grooves on one side of the track run into each other: the groove is
// wider there, and a wheel could take either route. The blade of the slider fills the part of the
// widened groove that only the other route uses. Route A (path 0) open: the blade lies in the part
// of route B. Moving the slider across by one groove width puts it into the part of route A, which
// opens route B. Both parts have the same shape (each is a groove minus the other), so a straight
// push across is enough: no pivot, no flexing.
//
// A post links the blade to an arm under the groove floor; the arm leaves the track at its side
// through a slot and ends in a knob. Where the arm passes under an open groove it stays below the
// groove floor, so that the wheels roll over it.
import {
  GROOVE_DEPTH,
  GROOVE_SPACING,
  GROOVE_WIDTH,
  LEVER_ARM_WIDTH,
  LEVER_BLADE_MIN,
  LEVER_FIT,
  LEVER_KNOB_DEPTH,
  LEVER_KNOB_GAP,
  LEVER_KNOB_LENGTH,
  LEVER_LOW_CLEAR,
  LEVER_POST_SPREAD,
  LEVER_TOP_GAP,
  TRACK_HEIGHT,
  TRACK_WIDTH,
} from "../presets/gauge";
import { elementShape, hasLever, pathLength, pointAt } from "./track";
import type { ElementType, Path, Variant } from "./track";

export type Interval = [number, number];

export interface LeverLayout {
  /** the side of the track (+1 left, −1 right) where the slider works and the knob sticks out */
  side: 1 | -1;
  /** move of the slider along Y from route A open to route B open */
  shift: number;
  /** outline of the blade seen from above, route A open (closed polygon, counter-clockwise or not) */
  blade: [number, number][];
  /** the post and the arm along the track */
  arm: Interval;
  /** across: the post (under the blade) and the whole arm from the post to the knob */
  post: Interval;
  reach: Interval;
  /** parts of the arm that stay below the groove floor (across) */
  low: Interval[];
  /** the knob outside the track (across) */
  knob: Interval;
  /** heights: blade bottom, slider top, top of the low parts of the arm */
  bladeBottom: number;
  top: number;
  lowTop: number;
  /** the cut through the track for post and arm: along, across (full height) */
  slot: { x: Interval; y: Interval };
  /** where the grooves have parted: the blade ends here */
  tip: number;
}

const STEP = 0.5;

/** Y of the groove centre line on `side` of a path at abscissa x (the path starts at the origin along +X). */
function grooveTrack(path: Path, side: number, offset: number): (x: number) => number {
  const length = Math.min(pathLength(path), 160);
  const xs: number[] = [];
  const ys: number[] = [];
  for (let s = 0; s <= length; s += STEP) {
    const p = pointAt(path, s);
    const h = (p.heading * Math.PI) / 180;
    xs.push(p.x - Math.sin(h) * side * offset);
    ys.push(p.y + Math.cos(h) * side * offset);
  }
  return (x: number) => {
    if (x <= (xs[0] as number)) return ys[0] as number;
    for (let i = 1; i < xs.length; i++) {
      const x1 = xs[i] as number;
      if (x <= x1) {
        const x0 = xs[i - 1] as number;
        const t = x1 === x0 ? 0 : (x - x0) / (x1 - x0);
        return (ys[i - 1] as number) + ((ys[i] as number) - (ys[i - 1] as number)) * t;
      }
    }
    return ys[ys.length - 1] as number;
  };
}

const overlap = (a: Interval, b: Interval): Interval | undefined => {
  const lo = Math.max(a[0], b[0]);
  const hi = Math.min(a[1], b[1]);
  return hi > lo ? [lo, hi] : undefined;
};

/** The slider of a switch with a lever, in the local frame of the element as used. */
export function leverLayout(type: ElementType, variant: Variant): LeverLayout | undefined {
  if (!hasLever(type)) return undefined;
  const shape = elementShape(type, variant);
  const [a, b] = shape.paths;
  if (!a || !b) return undefined;
  // the slider works on the side away from the turn of the branch (a Y-switch: the right side)
  const turn = b.kind === "arc" ? Math.sign(b.sweep) : 1;
  const side: 1 | -1 = type.kind === "yswitch" ? -1 : turn > 0 ? -1 : 1;
  const g = GROOVE_WIDTH;
  const c = LEVER_FIT / 2;
  const ya = grooveTrack(a, side, GROOVE_SPACING / 2);
  const yb = grooveTrack(b, side, GROOVE_SPACING / 2);
  // how far the grooves of route B and route A on this side have moved apart
  const spread = (x: number) => yb(x) - ya(x);
  let tip = 0;
  for (let x = 0; x < 160; x += STEP) {
    if (Math.abs(spread(x)) >= g) {
      tip = x;
      break;
    }
  }
  if (tip === 0) return undefined;
  const dir = Math.sign(spread(tip));
  // the part of the groove only route B uses (route A open: the blade lies there)
  const onlyB = (x: number): Interval => (dir > 0 ? [ya(x) + g / 2, yb(x) + g / 2] : [yb(x) - g / 2, ya(x) - g / 2]);
  const shift = -dir * g;

  // the blade: from where it is wide enough to the tip
  const upper: [number, number][] = [];
  const lower: [number, number][] = [];
  for (let x = 0; x <= tip - c + 1e-9; x += STEP / 2) {
    const [lo, hi] = onlyB(x);
    if (hi - lo - 2 * c < LEVER_BLADE_MIN) continue;
    lower.push([x, lo + c]);
    upper.push([x, hi - c]);
  }
  const blade = [...lower, ...upper.reverse()];

  // post and arm: where the grooves are LEVER_POST_SPREAD apart, clear of the tip
  let at = tip - LEVER_ARM_WIDTH;
  for (let x = 0; x < tip; x += STEP) {
    if (Math.abs(spread(x)) >= LEVER_POST_SPREAD) {
      at = Math.min(x, tip - LEVER_ARM_WIDTH / 2 - 1);
      break;
    }
  }
  const arm: Interval = [at - LEVER_ARM_WIDTH / 2, at + LEVER_ARM_WIDTH / 2];
  // the post fits under the blade along the whole width of the arm
  const atStart = onlyB(arm[0]);
  const atEnd = onlyB(arm[1]);
  const post: Interval = [Math.max(atStart[0], atEnd[0]) + c, Math.min(atStart[1], atEnd[1]) - c];

  // the outer edge of the track on this side, along the arm
  const edge = (x: number) => [a, b].map((p) => grooveTrack(p, side, TRACK_WIDTH / 2)(x));
  const edges = [...edge(arm[0]), ...edge(arm[1])];
  const outer = side > 0 ? Math.max(...edges) : Math.min(...edges);

  // knob: in the inner one of the two positions it keeps LEVER_KNOB_GAP from the side of the track
  const inward = side > 0 ? Math.min(0, shift) : Math.max(0, shift);
  const knobInner = outer + side * LEVER_KNOB_GAP - inward;
  const knob: Interval = side > 0 ? [knobInner, knobInner + LEVER_KNOB_DEPTH] : [knobInner - LEVER_KNOB_DEPTH, knobInner];
  const reach: Interval = side > 0 ? [post[0], knob[0] + 1] : [knob[1] - 1, post[1]];

  // the arm stays low where it lies under an open groove: route A in its own position, route B after the shift
  const across = (f: (x: number) => number, x: number): Interval => [f(x) - g / 2, f(x) + g / 2];
  const bandA: Interval = [Math.min(across(ya, arm[0])[0], across(ya, arm[1])[0]), Math.max(across(ya, arm[0])[1], across(ya, arm[1])[1])];
  const bandB0: Interval = [Math.min(across(yb, arm[0])[0], across(yb, arm[1])[0]), Math.max(across(yb, arm[0])[1], across(yb, arm[1])[1])];
  const bandB: Interval = [bandB0[0] - shift, bandB0[1] - shift];
  // the part of the arm outside the post
  const armOnly: Interval = side > 0 ? [post[1], reach[1]] : [reach[0], post[0]];
  const margin = 0.3;
  const low = [bandA, bandB]
    .map((band) => overlap(armOnly, [band[0] - margin, band[1] + margin]))
    .filter((i): i is Interval => i !== undefined)
    .sort((p, q) => p[0] - q[0]);

  // the slot through the track: the post and the arm in both positions, out beyond the edge
  const ys = [post[0], post[1], post[0] + shift, post[1] + shift];
  const slotY: Interval = side > 0 ? [Math.min(...ys) - c, outer + 2] : [outer - 2, Math.max(...ys) + c];
  const slot = { x: [arm[0] - c, arm[1] + c] as Interval, y: slotY };

  const floor = TRACK_HEIGHT - GROOVE_DEPTH;
  return {
    side,
    shift,
    blade,
    arm,
    post,
    reach,
    low,
    knob,
    bladeBottom: floor,
    top: TRACK_HEIGHT - LEVER_TOP_GAP,
    lowTop: floor - LEVER_LOW_CLEAR,
    slot,
    tip,
  };
}

/** The open groove band of a route on the lever side at x (for checks). */
export function grooveBand(type: ElementType, variant: Variant, route: 0 | 1, x: number): Interval | undefined {
  const layout = leverLayout(type, variant);
  const path = elementShape(type, variant).paths[route];
  if (!layout || !path) return undefined;
  const y = grooveTrack(path, layout.side, GROOVE_SPACING / 2)(x);
  return [y - GROOVE_WIDTH / 2, y + GROOVE_WIDTH / 2];
}
