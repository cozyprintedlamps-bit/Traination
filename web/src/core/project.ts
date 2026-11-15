// A whole Traination project: element types, the track plan, the train and the settings. Saved
// as a `.trproj` file (JSON with a schema version).
import { BRIDGE_DECK, BRIDGE_HEIGHT, TRACK_HEIGHT, TRACK_WIDTH } from "../presets/gauge";
import { maxRows } from "../presets/bricks";
import { DEFAULT_CONNECTOR_FIT, DEFAULT_PRINTER } from "../presets/print";
import { closeGap } from "./autoclose";
import { analyze, attach, nextPort, rotate } from "./layout";
import type { Layout, Piece, WorldPort } from "./layout";
import { PLAIN, ELEMENT_KINDS, NO_LEDGE, elementShape, hasStuds, ledges, makeElement, newId, noStuds, pathLength, pointAt, standardElements } from "./track";
import type { ElementType, StudSides } from "./track";
import { BUILDING_KINDS, OVER_TRACK, TUNNEL_CLEARANCE, makeBuilding } from "./buildings";
import type { Building, BuildingKind } from "./buildings";
import { COUPLERS, DECORS, DEFAULT_DESIGN, DEFAULT_FITS, VEHICLE_KINDS, makeVehicle } from "./vehicle";
import type { Fits, Vehicle, VehicleColors, VehicleKind } from "./vehicle";

/**
 * 2: buildings, seven colour slots per vehicle (was: accent), design with decoration.
 * 3: stud ledges per side ({ left, right } with kind and rows), switches with a lever.
 */
export const SCHEMA_VERSION = 3;
export const FILE_EXTENSION = ".trproj";
const PIECE_COLOR = /^#[0-9a-fA-F]{6}$/;

export interface Settings {
  /** grooves on both faces: a curve turned over is the other hand */
  doubleSided: boolean;
  /** socket = peg + this (mm) */
  connectorFit: number;
  fits: Fits;
  /** printer id from presets/print */
  printer: string;
  /** track open between sleepers (realistic, a little less filament) */
  sleepers: boolean;
}

export interface Project {
  schema: number;
  name: string;
  elements: ElementType[];
  layout: Layout;
  vehicles: Vehicle[];
  buildings: Building[];
  settings: Settings;
}

export const DEFAULT_SETTINGS: Settings = {
  doubleSided: true,
  connectorFit: DEFAULT_CONNECTOR_FIT,
  fits: { ...DEFAULT_FITS },
  printer: DEFAULT_PRINTER,
  sleepers: true,
};

// ------------------------------------------------------------------------------ templates

export type TemplateId =
  | "oval"
  | "oval_large"
  | "heart"
  | "snake"
  | "dogbone"
  | "eight"
  | "siding"
  | "passing"
  | "yard"
  | "terminus"
  | "hill"
  | "eight_bridge"
  | "mountain"
  | "lego"
  | "empty";
/** The ready-made tracks ("demo tracks"), in the order the page shows them. */
export const DEMO_TEMPLATES: readonly TemplateId[] = ["oval", "oval_large", "heart", "snake", "dogbone", "eight", "siding", "passing", "yard", "terminus", "hill", "eight_bridge", "mountain", "lego"];
/** Every template: the demo tracks and the empty plan ("build your own track"). */
export const TEMPLATES: readonly TemplateId[] = [...DEMO_TEMPLATES, "empty"];

type Turn = "left" | "right";
/** A step of a chain: an element id, or an element id with a turn. */
type ChainStep = string | [string, Turn];

/** Builds a template piece by piece; fitting pieces from "close the track" are added to the types. */
class TemplateBuilder {
  readonly layout: Layout = { pieces: [] };
  readonly types: ElementType[];

  constructor(types: ElementType[]) {
    this.types = [...types];
  }

  private type(id: string): ElementType {
    const t = this.types.find((e) => e.id === id);
    if (!t) throw new Error(`unknown element ${id}`);
    return t;
  }

  root(type: string): string {
    const piece: Piece = { id: newId("p"), type: this.type(type).id, variant: PLAIN, port: 0, at: { x: 0, y: 0, rotation: 0 } };
    this.layout.pieces.push(piece);
    return piece.id;
  }

  /** A free end of a piece: port `index`, or the one that leads on. */
  end(piece: string, index?: number): WorldPort {
    const analysis = analyze(this.layout, this.types);
    const port = index === undefined ? nextPort(analysis, piece) : analysis.open.find((p) => p.piece === piece && p.index === index);
    if (!port) throw new Error("no free end to build on");
    return port;
  }

  add(type: string, on: WorldPort, wish: { turn?: Turn; port?: number } = {}): string {
    const piece = attach(on, this.type(type), wish);
    this.layout.pieces.push(piece);
    return piece.id;
  }

  /** Pieces one after the other, starting at a free end; returns the last piece. */
  chain(from: WorldPort, steps: ChainStep[]): string {
    return this.chainAll(from, steps).at(-1) ?? "";
  }

  /** Like chain, but returns every piece added. */
  chainAll(from: WorldPort, steps: ChainStep[]): string[] {
    const ids: string[] = [];
    for (const step of steps) {
      const [type, turn] = typeof step === "string" ? [step, undefined] : step;
      const last = ids.at(-1);
      // the last piece may close a loop: ask for its free end only when another piece follows
      ids.push(this.add(type, last ? this.end(last) : from, turn ? { turn } : {}));
    }
    return ids;
  }

  /** A building over a piece of the plan (a tunnel): in its middle, along its track. */
  over(piece: string, kind: BuildingKind, patch: Partial<Building> = {}): Building {
    const analysis = analyze(this.layout, this.types);
    const p = this.layout.pieces.find((x) => x.id === piece);
    const type = p && this.types.find((t) => t.id === p.type);
    const pose = analysis.poses.get(piece);
    const path = type && p ? elementShape(type, p.variant).paths[0] : undefined;
    if (!pose || !path) throw new Error("no piece to build over");
    const mid = pointAt(path, pathLength(path) / 2);
    const [x, y] = rotate(mid.x, mid.y, pose.rotation);
    // a curved tunnel turns left in its own frame: over a right-hand curve it is turned around
    const right = path.kind === "arc" && path.sweep < 0;
    const rotation = mid.heading + pose.rotation + (right ? 180 : 0);
    const length = path.kind === "line" ? path.length : undefined;
    return { ...makeBuilding(kind), x: pose.x + x, y: pose.y + y, rotation, ...(length ? { length } : {}), ...patch, fromTemplate: true };
  }

  /** Joins two free ends with "close the track". */
  close(a: WorldPort, b: WorldPort): void {
    const result = closeGap(this.types, a, b, { layout: this.layout });
    if (typeof result === "string") throw new Error(`template does not close: ${result}`);
    this.types.push(...result.newTypes);
    this.layout.pieces.push(...result.pieces);
  }
}

const times = (n: number, step: ChainStep): ChainStep[] => Array.from({ length: n }, () => step);
const large = (turn: Turn, n: number) => times(n, ["curve-large", turn]);
const small = (turn: Turn, n: number) => times(n, ["curve-small", turn]);

/** Element types some templates need besides the standard ones. */
export function templateTypes(): ElementType[] {
  const studs = (left: StudSides["left"], right: StudSides["right"]): StudSides => ({ left, right });
  return [
    // the crossing of the figure eight: its arms fit two 108 mm straights and the large curves exactly
    makeElement("crossing", { id: "crossing-148", length: 148 }),
    // the stud town: LEGO studs inside the loop (two rows), DUPLO studs outside
    makeElement("straight", { id: "straight-216-mixed", length: 216, studs: studs({ kind: "lego", rows: 2 }, { kind: "duplo", rows: 1 }) }),
    makeElement("curve", { id: "curve-large-mixed", studs: studs({ kind: "lego", rows: 2 }, { ...NO_LEDGE }) }),
    // the heart: two of these on each side bring the tip exactly below the notch (2 × 182 = 2 × R)
    makeElement("straight", { id: "straight-182", length: 182 }),
  ];
}

/**
 * Element types with studs that the first versions had among the standard ones. Studs are set in the
 * configurator now, on the plain piece (`base`). On load such a type goes: when no piece uses it, it
 * is dropped; when pieces use it, they move to the plain piece, which takes over the studs (if it has
 * none yet and has the same length, else the type stays).
 */
const LEGACY_STUD_ELEMENTS: readonly { id: string; base: string }[] = [
  { id: "straight-216-lego", base: "straight-216" },
  { id: "straight-216-duplo", base: "straight-216" },
];

function mergeLegacyStudElements<P extends { type: string; color?: string }>(elements: ElementType[], pieces: P[]): { elements: ElementType[]; pieces: P[] } {
  let types = elements;
  let placed = pieces;
  for (const { id, base: baseId } of LEGACY_STUD_ELEMENTS) {
    const legacy = types.find((e) => e.id === id);
    if (!legacy) continue;
    if (placed.some((p) => p.type === id)) {
      const base = types.find((e) => e.id === baseId);
      if (!base || hasStuds(base) || base.kind !== legacy.kind || base.length !== legacy.length) continue;
      types = types.map((e) => (e.id === baseId ? { ...e, studs: structuredClone(legacy.studs) } : e));
      placed = placed.map((p) => (p.type === id ? { ...p, type: baseId, ...(p.color === undefined && legacy.color !== base.color ? { color: legacy.color } : {}) } : p));
    }
    types = types.filter((e) => e.id !== id);
  }
  return { elements: types, pieces: placed };
}

/** The given element types plus the standard ones a template may need that are missing (e.g. removed by the user). */
export function withStandardElements(elements: ElementType[]): ElementType[] {
  const have = new Set(elements.map((e) => e.id));
  return [...elements, ...newProject("empty").elements.filter((e) => !have.has(e.id))];
}

export interface TemplateResult {
  layout: Layout;
  elements: ElementType[];
  /** buildings that belong to the track (tunnels, platforms, stud plates), marked as from the template */
  buildings: Building[];
}

/** The plan of a template, the element types it uses (the given ones plus what it adds) and its buildings. */
export function buildTemplate(id: TemplateId, elements: ElementType[]): TemplateResult {
  const have = new Set(elements.map((e) => e.id));
  const t = new TemplateBuilder([...elements, ...templateTypes().filter((e) => !have.has(e.id))]);
  const loop = (first: string, steps: ChainStep[]) => t.chain(t.end(t.root(first)), steps);
  const loopAll = (first: string, steps: ChainStep[]) => {
    const root = t.root(first);
    return [root, ...t.chainAll(t.end(root), steps)];
  };
  const buildings: Building[] = [];
  /** the user's own buildings are placed beside these pieces first */
  let prefer: string[] = [];
  switch (id) {
    case "empty":
      break;
    case "oval":
      loop("straight-144", [...large("left", 4), "straight-144", ...large("left", 4)]);
      break;
    case "oval_large":
      loop("straight-216", ["straight-216", ...large("left", 4), "straight-216", "straight-216", ...large("left", 4)]);
      break;
    case "heart": {
      // starts in the notch at the top, going right: up over the right lobe, down to the tip and back
      loop("curve-large", [...large("right", 4), "straight-182", "straight-182", ...large("right", 2), "straight-182", "straight-182", ...large("right", 4), ["curve-large", "left"]]);
      break;
    }
    case "snake": {
      // an oval whose far side wiggles in two S-bends of small curves; a calculated straight closes it
      const root = t.root("straight-216");
      const last = t.chain(t.end(root), [
        "straight-216",
        "straight-54",
        ...large("left", 4),
        ...small("left", 1),
        ...small("right", 2),
        ...small("left", 2),
        ...small("right", 2),
        ...small("left", 1),
        ...large("left", 4),
      ]);
      t.close(t.end(last), t.end(root, 0));
      break;
    }
    case "dogbone":
      // two tracks side by side with a balloon loop at each end
      loop("straight-216", ["straight-216", ["curve-large", "right"], ...large("left", 6), ["curve-large", "right"], "straight-216", "straight-216", ["curve-large", "right"], ...large("left", 6), ["curve-large", "right"]]);
      break;
    case "lego": {
      // the stud town: LEGO studs on the inside of the loop, DUPLO studs outside, stud plates inside
      loop("straight-216-mixed", ["straight-216-mixed", ...times(4, ["curve-large-mixed", "left"]), "straight-216-mixed", "straight-216-mixed", ...times(4, ["curve-large-mixed", "left"])]);
      buildings.push({ ...makeBuilding("plate_lego"), x: 136, y: 182, fromTemplate: true }, { ...makeBuilding("plate_duplo"), x: 296, y: 182, fromTemplate: true });
      break;
    }
    case "mountain": {
      // a long oval that runs through a hill: a straight tunnel and two curved ones after it
      const ids = loopAll("straight-216", ["straight-216", ...large("left", 4), "straight-216", "straight-216", ...large("left", 4)]);
      const [s, c1, c2] = [ids[7] as string, ids[8] as string, ids[9] as string];
      buildings.push(t.over(s, "tunnel"), t.over(c1, "tunnel_curve"), t.over(c2, "tunnel_curve"));
      break;
    }
    case "terminus": {
      // an oval with a terminus: three tracks that end at buffer stops, platforms beside them
      const a = t.root("switch-right");
      t.chain(t.end(a, 1), ["straight-216", "straight-216", ...large("left", 4), "straight-216", "straight-216", "straight-144", ...large("left", 4)]);
      const b = t.chain(t.end(a, 2), [["curve-large", "left"], "switch-right"]);
      const track1 = t.chainAll(t.end(b, 1), ["straight-216", "buffer"]);
      const c = t.chain(t.end(b, 2), [["curve-large", "left"], "switch-right"]);
      const track2 = t.chainAll(t.end(c, 1), ["straight-216", "buffer"]);
      const track3 = t.chainAll(t.end(c, 2), [["curve-large", "left"], "straight-216", "buffer"]);
      prefer = [track1[0], track2[0], track3[1]].filter((p): p is string => p !== undefined);
      buildings.push({ ...makeBuilding("station_town"), fromTemplate: true }, { ...makeBuilding("platform"), fromTemplate: true }, { ...makeBuilding("platform"), fromTemplate: true });
      break;
    }
    case "siding": {
      // an oval with a switch, from which a short siding with a buffer stop branches off
      const sw = t.root("switch-right");
      t.chain(t.end(sw, 1), [...large("left", 4), "straight-144", ...large("left", 4)]);
      t.chain(t.end(sw, 2), [["curve-large", "left"], "buffer"]);
      break;
    }
    case "passing": {
      // an oval with a passing loop: two switches, the main line closed with a fitting straight
      const a = t.root("switch-right");
      const branch = t.chain(t.end(a, 2), large("left", 2));
      const b = t.add("switch-left", t.end(branch), { port: 2 });
      t.close(t.end(a, 1), t.end(b, 1));
      const back = t.chain(t.end(b, 0), large("left", 4));
      t.close(t.end(back), t.end(a, 0));
      break;
    }
    case "yard": {
      // an oval; on its outside a yard with three sidings that end at buffer stops
      const a = t.root("switch-right");
      t.chain(t.end(a, 1), ["straight-216", "straight-216", ...large("left", 4), "straight-216", "straight-216", "straight-144", ...large("left", 4)]);
      const s2 = t.chain(t.end(a, 2), [["curve-large", "left"], "switch-right"]);
      t.chain(t.end(s2, 1), ["straight-216", "buffer"]);
      const s3 = t.chain(t.end(s2, 2), [["curve-large", "left"], "switch-right"]);
      t.chain(t.end(s3, 1), ["straight-108", "buffer"]);
      t.chain(t.end(s3, 2), [["curve-large", "left"], "straight-54", "buffer"]);
      break;
    }
    case "eight": {
      // a figure eight over a crossing: one loop to the right, one to the left
      const x = t.root("crossing-148");
      t.chain(t.end(x, 1), ["straight-108", ...large("right", 6), "straight-108"]);
      t.chain(t.end(x, 3), ["straight-108", ...large("left", 6), "straight-108"]);
      break;
    }
    case "hill":
      // up two ramps, over a bridge and down again, closed by curves
      loop("ramp-1", ["ramp-2", "bridge", "ramp-2", "ramp-1", ...large("left", 4), ...times(4, "straight-216"), "straight-144", ...large("left", 4)]);
      break;
    case "eight_bridge":
      // a figure eight whose track crosses itself under a bridge
      loop("ramp-1", [
        "ramp-2",
        "bridge",
        "ramp-2",
        "ramp-1",
        ...small("left", 2),
        "straight-216",
        "straight-54",
        ...small("left", 2),
        "straight-216",
        "straight-144",
        "straight-54",
        ...small("left", 2),
        ...times(5, "straight-144"),
        ...small("right", 2),
        "straight-216",
        "straight-144",
        "straight-54",
        ...small("right", 2),
        "straight-216",
        "straight-54",
        ...small("right", 2),
      ]);
      break;
  }
  // only the template types that are used stay
  const used = new Set(t.layout.pieces.map((p) => p.type));
  const types = t.types.filter((e) => have.has(e.id) || used.has(e.id));
  return { layout: t.layout, elements: types, buildings: arrangeBuildings(t.layout, types, buildings, false, prefer) };
}

/** The plan of a template (for element lists that already hold every type it needs). */
export function templateLayout(id: TemplateId, elements: ElementType[]): Layout {
  return buildTemplate(id, elements).layout;
}

/** Ready-made trains for the vehicles step. */
export type TrainTemplateId = "freight" | "passenger" | "express" | "cyberbrick";
export const TRAIN_TEMPLATES: Readonly<Record<TrainTemplateId, readonly VehicleKind[]>> = {
  freight: ["steam", "tender", "box", "tank", "logs", "container", "caboose"],
  passenger: ["electric", "passenger", "dining", "passenger"],
  express: ["highspeed", "doubledeck", "dining", "doubledeck"],
  cyberbrick: ["cyberbrick", "box", "hopper", "container"],
};
export const TRAIN_TEMPLATE_IDS = Object.keys(TRAIN_TEMPLATES) as TrainTemplateId[];

export function trainTemplate(id: TrainTemplateId): Vehicle[] {
  return TRAIN_TEMPLATES[id].map((kind) => makeVehicle(kind));
}

export function newProject(template: TemplateId = "oval"): Project {
  const built = buildTemplate(template, standardElements());
  return {
    schema: SCHEMA_VERSION,
    name: "",
    elements: built.elements,
    layout: built.layout,
    vehicles: [makeVehicle("steam"), makeVehicle("tender"), makeVehicle("box"), makeVehicle("passenger")],
    // no buildings of its own: only those that belong to the ready-made track
    buildings: built.buildings,
    settings: structuredClone(DEFAULT_SETTINGS),
  };
}

/** Room between a building and the edge of the track. */
const BUILDING_GAP = 6;

/**
 * Moves buildings that stand on the track (or on each other) to a free spot beside a straight:
 * large ones beside its middle, facing the track, small ones (signals) at its ends. Buildings that
 * are in the way and find no spot go below the plan. `force`: place every one anew. Buildings over
 * the track (tunnels, sheds, the hall) stay where they are. The straights of the pieces in `prefer`
 * are tried first.
 */
export function arrangeBuildings(layout: Layout, types: readonly ElementType[], buildings: readonly Building[], force = false, prefer: readonly string[] = []): Building[] {
  const analysis = analyze(layout, types);
  const typeOf = new Map(types.map((t) => [t.id, t]));
  /** points of the track centre lines with the half width of the track there */
  const samples: [number, number, number][] = [];
  const straights: { x: number; y: number; heading: number; length: number; left: number; right: number; piece: string }[] = [];
  for (const piece of layout.pieces) {
    const type = typeOf.get(piece.type);
    const pose = analysis.poses.get(piece.id);
    if (!type || !pose) continue;
    const side = ledges(type, piece.variant);
    const half = TRACK_WIDTH / 2 + Math.max(side.left, side.right);
    for (const path of elementShape(type, piece.variant).paths) {
      const length = pathLength(path);
      for (let s = 0; s <= length; s += 6) {
        const p = pointAt(path, s);
        const [x, y] = rotate(p.x, p.y, pose.rotation);
        samples.push([x + pose.x, y + pose.y, half]);
      }
      if (type.kind === "straight" && path.kind === "line" && Math.abs(pose.z) < 0.5) {
        const [x, y] = rotate(path.x, path.y, pose.rotation);
        straights.push({ x: x + pose.x, y: y + pose.y, heading: path.heading + pose.rotation, length, ...side, piece: piece.id });
      }
    }
  }
  const placed: Building[] = [];
  const free = (b: Building) => {
    const clear = samples.every(([x, y, half]) => {
      const [u, v] = rotate(x - b.x, y - b.y, -b.rotation);
      return Math.abs(u) >= b.length / 2 + half + BUILDING_GAP / 2 || Math.abs(v) >= b.width / 2 + half + BUILDING_GAP / 2;
    });
    return clear && placed.every((o) => Math.hypot(o.x - b.x, o.y - b.y) > (Math.hypot(o.length, o.width) + Math.hypot(b.length, b.width)) / 2);
  };
  /** at `along` mm of a straight, on its left (+1) or right (−1) side */
  const beside = (b: Building, s: (typeof straights)[number], along: number, side: 1 | -1): Building => {
    const out = TRACK_WIDTH / 2 + (side > 0 ? s.left : s.right) + BUILDING_GAP + b.width / 2;
    const [ax, ay] = rotate(along, side * out, s.heading);
    return { ...b, x: s.x + ax, y: s.y + ay, rotation: side > 0 ? s.heading + 180 : s.heading };
  };
  const spots = (b: Building, s: (typeof straights)[number]): Building[] => {
    const middle = [beside(b, s, s.length / 2, 1), beside(b, s, s.length / 2, -1)];
    const ends = [beside(b, s, s.length + 26, -1), beside(b, s, -26, -1)];
    return b.length > 40 ? [...middle, ...ends] : [...ends, ...middle];
  };
  const lowest = samples.reduce((m, [, y, half]) => Math.min(m, y - half), 0);
  const rank = (piece: string) => (prefer.includes(piece) ? prefer.indexOf(piece) : prefer.length);
  const ordered = [...straights].sort((a, b) => rank(a.piece) - rank(b.piece));
  let aside = 0;
  for (const b of buildings) {
    if (OVER_TRACK.has(b.kind) || (!force && free(b))) {
      placed.push(b);
      continue;
    }
    let spot: Building | undefined;
    for (const s of ordered) {
      spot = spots(b, s).find(free);
      if (spot) break;
    }
    if (!spot) {
      // no room beside the track: below the plan, one after the other
      spot = { ...b, x: aside + b.length / 2, y: lowest - 40 - b.width / 2, rotation: 0 };
      aside += b.length + 20;
    }
    placed.push(spot);
  }
  return placed;
}

/** Headroom above the track top under the lowest bridge, tunnel or shed of the plan, for the height check of vehicles. */
export function clearance(project: Project): number {
  const used = new Set(project.layout.pieces.map((p) => p.type));
  const bridges = project.elements.filter((e) => e.kind === "bridge" && used.has(e.id)).map((e) => e.height);
  const underBridge = Math.min(BRIDGE_HEIGHT, ...bridges) - BRIDGE_DECK - TRACK_HEIGHT;
  // tunnels, portals and sheds share the bore; the hall is higher than any bridge
  const covered = (project.buildings ?? []).some((b) => OVER_TRACK.has(b.kind) && b.kind !== "station_hall");
  return covered ? Math.min(underBridge, TUNNEL_CLEARANCE) : underBridge;
}

// ------------------------------------------------------------------------------ files

export function serialize(project: Project): string {
  return `${JSON.stringify({ ...project, schema: SCHEMA_VERSION }, null, 2)}\n`;
}

export class ProjectFileError extends Error {}

/**
 * Stud ledges of a stored element: schema 3 has { left, right } (each with kind, rows and maybe
 * `lowered`); schema 2 had one kind, a side and rows. Rows are kept within the limits, so that a
 * damaged file cannot hang the engine.
 */
function readStuds(e: unknown): StudSides {
  const raw = e as { studs?: unknown; studSide?: unknown; studRows?: unknown; studLowered?: unknown };
  const ledge = (v: unknown, stepped = false): StudSides["left"] => {
    const l = v as { kind?: unknown; rows?: unknown; lowered?: unknown } | undefined;
    const kind = l?.kind === "lego" || l?.kind === "duplo" ? l.kind : "none";
    const rows = typeof l?.rows === "number" && Number.isFinite(l.rows) ? Math.min(Math.max(1, Math.round(l.rows)), maxRows(kind)) : 1;
    return { kind, rows, ...((l?.lowered === true || stepped) && kind !== "none" && rows > 1 ? { lowered: true } : {}) };
  };
  if (typeof raw.studs === "object" && raw.studs !== null) {
    const s = raw.studs as { left?: unknown; right?: unknown };
    return { left: ledge(s.left), right: ledge(s.right) };
  }
  if (raw.studs === "lego" || raw.studs === "duplo") {
    // a stepped-down ledge of the version in between had one flag for the element
    const one = ledge({ kind: raw.studs, rows: raw.studRows }, raw.studLowered === true);
    const side = raw.studSide === "left" || raw.studSide === "right" ? raw.studSide : "both";
    return { left: side !== "right" ? one : { ...NO_LEDGE }, right: side !== "left" ? { ...one } : { ...NO_LEDGE } };
  }
  return noStuds();
}

/** Reads a project file; fills in what older or hand-made files leave out. */
export function deserialize(text: string): Project {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new ProjectFileError("not_json");
  }
  if (typeof data !== "object" || data === null) throw new ProjectFileError("not_project");
  const raw = data as Partial<Project>;
  if (typeof raw.schema !== "number") throw new ProjectFileError("not_project");
  if (raw.schema > SCHEMA_VERSION) throw new ProjectFileError("too_new");
  const base = newProject("empty");
  const elements = Array.isArray(raw.elements)
    ? raw.elements
        .filter((e) => ELEMENT_KINDS.includes(e?.kind))
        .map((e) => {
          // schema 2 fields that schema 3 keeps in `studs`
          const { studSide: _side, studRows: _rows, studLowered: _stepped, ...rest } = e as ElementType & { studSide?: unknown; studRows?: unknown; studLowered?: unknown };
          void _side;
          void _rows;
          void _stepped;
          return { ...makeElement(e.kind), ...rest, studs: readStuds(e), lever: e.lever === true };
        })
    : base.elements;
  const vehicles = Array.isArray(raw.vehicles)
    ? raw.vehicles
        .filter((v) => VEHICLE_KINDS.includes(v?.kind))
        .map((v) => {
          const d = makeVehicle(v.kind);
          // schema 1 had one "accent" colour for roof and details
          const old = (v.colors ?? {}) as Partial<VehicleColors> & { accent?: string };
          const accent = old.accent ? { roof: old.accent, details: old.accent } : {};
          const { accent: _drop, ...colors } = old;
          void _drop;
          const design = { ...DEFAULT_DESIGN, ...v.design };
          if (!DECORS.includes(design.decor)) design.decor = "none";
          return {
            ...d,
            ...v,
            front: COUPLERS.includes(v.front) ? v.front : d.front,
            rear: COUPLERS.includes(v.rear) ? v.rear : d.rear,
            design,
            colors: { ...d.colors, ...accent, ...colors },
            magnet: { ...d.magnet, ...v.magnet },
          };
        })
    : base.vehicles;
  const buildings = Array.isArray(raw.buildings)
    ? raw.buildings.filter((b) => BUILDING_KINDS.includes(b?.kind)).map((b) => {
        const d = makeBuilding(b.kind);
        return { ...d, ...b, colors: { ...d.colors, ...b.colors } };
      })
    : [];
  const pieces = Array.isArray(raw.layout?.pieces) ? raw.layout.pieces.filter((p) => typeof p?.id === "string" && typeof p.type === "string") : [];
  const merged = mergeLegacyStudElements(elements, pieces);
  return {
    schema: SCHEMA_VERSION,
    name: typeof raw.name === "string" ? raw.name : "",
    elements: merged.elements,
    layout: {
      pieces: merged.pieces.map((p) => {
        // an own colour must be "#RRGGBB", else the piece has the colour of its type
        const { color, ...rest } = p;
        return { ...rest, ...(typeof color === "string" && PIECE_COLOR.test(color) ? { color } : {}), variant: { ...PLAIN, ...p.variant }, port: p.port ?? 0 };
      }),
    },
    vehicles,
    buildings,
    settings: { ...DEFAULT_SETTINGS, ...raw.settings, fits: { ...DEFAULT_FITS, ...raw.settings?.fits } },
  };
}
