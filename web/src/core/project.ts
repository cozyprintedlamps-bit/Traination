// A whole Traination project: element types, the track plan, the train and the settings. Saved
// as a `.trproj` file (JSON with a schema version).
import { BRIDGE_DECK, BRIDGE_HEIGHT, TRACK_HEIGHT, TRACK_WIDTH } from "../presets/gauge";
import { DEFAULT_CONNECTOR_FIT, DEFAULT_PRINTER } from "../presets/print";
import { closeGap } from "./autoclose";
import { analyze, attach, nextPort, rotate } from "./layout";
import type { Layout, Piece, WorldPort } from "./layout";
import { PLAIN, ELEMENT_KINDS, elementShape, ledges, makeElement, newId, pathLength, pointAt, standardElements } from "./track";
import type { ElementType } from "./track";
import { BUILDING_KINDS, SHED_OPENING, makeBuilding } from "./buildings";
import type { Building } from "./buildings";
import { COUPLERS, DECORS, DEFAULT_DESIGN, DEFAULT_FITS, VEHICLE_KINDS, makeVehicle } from "./vehicle";
import type { Fits, Vehicle, VehicleColors, VehicleKind } from "./vehicle";

/** 2: buildings, seven colour slots per vehicle (was: accent), design with decoration. */
export const SCHEMA_VERSION = 2;
export const FILE_EXTENSION = ".trproj";

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

export type TemplateId = "oval" | "circle" | "oval_large" | "siding" | "passing" | "yard" | "eight" | "hill" | "eight_bridge" | "lego" | "empty";
export const TEMPLATES: readonly TemplateId[] = ["oval", "circle", "oval_large", "siding", "passing", "yard", "eight", "hill", "eight_bridge", "lego", "empty"];

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
    let last = "";
    for (const step of steps) {
      const [type, turn] = typeof step === "string" ? [step, undefined] : step;
      // the last piece may close a loop: ask for its free end only when another piece follows
      last = this.add(type, last ? this.end(last) : from, turn ? { turn } : {});
    }
    return last;
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
  // the crossing of the figure eight: its arms fit two 108 mm straights and the large curves exactly
  return [makeElement("crossing", { id: "crossing-148", length: 148 })];
}

/** The plan of a template and the element types it uses (the given ones plus what it adds). */
export function buildTemplate(id: TemplateId, elements: ElementType[]): { layout: Layout; elements: ElementType[] } {
  const have = new Set(elements.map((e) => e.id));
  const t = new TemplateBuilder([...elements, ...templateTypes().filter((e) => !have.has(e.id))]);
  const loop = (first: string, steps: ChainStep[]) => t.chain(t.end(t.root(first)), steps);
  switch (id) {
    case "empty":
      break;
    case "oval":
      loop("straight-144", [...large("left", 4), "straight-144", ...large("left", 4)]);
      break;
    case "circle":
      loop("curve-small", small("left", 7));
      break;
    case "oval_large":
      loop("straight-216", ["straight-216", ...large("left", 4), "straight-216", "straight-216", ...large("left", 4)]);
      break;
    case "lego":
      loop("straight-216-lego", ["straight-216-lego", ...large("left", 4), "straight-216-lego", "straight-216-lego", ...large("left", 4)]);
      break;
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
  return { layout: t.layout, elements: t.types.filter((e) => have.has(e.id) || used.has(e.id)) };
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
    buildings: template === "empty" ? [] : defaultBuildings(built.layout, built.elements),
    settings: structuredClone(DEFAULT_SETTINGS),
  };
}

/** Room between a building and the edge of the track. */
const BUILDING_GAP = 6;

/**
 * Moves buildings that stand on the track (or on each other) to a free spot beside a straight:
 * large ones beside its middle, facing the track, small ones (signals) at its ends. Buildings that
 * are in the way and find no spot go below the plan. `force`: place every one anew.
 */
export function arrangeBuildings(layout: Layout, types: readonly ElementType[], buildings: readonly Building[], force = false): Building[] {
  const analysis = analyze(layout, types);
  const typeOf = new Map(types.map((t) => [t.id, t]));
  /** points of the track centre lines with the half width of the track there */
  const samples: [number, number, number][] = [];
  const straights: { x: number; y: number; heading: number; length: number; left: number; right: number }[] = [];
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
        straights.push({ x: x + pose.x, y: y + pose.y, heading: path.heading + pose.rotation, length, ...side });
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
  let aside = 0;
  for (const b of buildings) {
    if (!force && free(b)) {
      placed.push(b);
      continue;
    }
    let spot: Building | undefined;
    for (const s of straights) {
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

/** A station beside a straight of the plan, facing the track, and a signal at the end of a straight. */
export function defaultBuildings(layout: Layout, types: readonly ElementType[]): Building[] {
  return arrangeBuildings(layout, types, [makeBuilding("station"), makeBuilding("signal")], true);
}

/** Headroom above the track top under the lowest bridge of the plan, for the height check of vehicles. */
export function clearance(project: Project): number {
  const used = new Set(project.layout.pieces.map((p) => p.type));
  const bridges = project.elements.filter((e) => e.kind === "bridge" && used.has(e.id)).map((e) => e.height);
  const underBridge = Math.min(BRIDGE_HEIGHT, ...bridges) - BRIDGE_DECK - TRACK_HEIGHT;
  const sheds = (project.buildings ?? []).some((b) => b.kind === "shed");
  return sheds ? Math.min(underBridge, SHED_OPENING.height - TRACK_HEIGHT) : underBridge;
}

// ------------------------------------------------------------------------------ files

export function serialize(project: Project): string {
  return `${JSON.stringify({ ...project, schema: SCHEMA_VERSION }, null, 2)}\n`;
}

export class ProjectFileError extends Error {}

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
    ? raw.elements.filter((e) => ELEMENT_KINDS.includes(e?.kind)).map((e) => ({ ...makeElement(e.kind), ...e }))
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
  return {
    schema: SCHEMA_VERSION,
    name: typeof raw.name === "string" ? raw.name : "",
    elements,
    layout: { pieces: pieces.map((p) => ({ ...p, variant: { ...PLAIN, ...p.variant }, port: p.port ?? 0 })) },
    vehicles,
    buildings,
    settings: { ...DEFAULT_SETTINGS, ...raw.settings, fits: { ...DEFAULT_FITS, ...raw.settings?.fits } },
  };
}
