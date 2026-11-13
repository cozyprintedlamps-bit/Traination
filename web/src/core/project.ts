// A whole Traination project: element types, the track plan, the train and the settings. Saved
// as a `.trproj` file (JSON with a schema version).
import { BRIDGE_DECK, BRIDGE_HEIGHT, TRACK_HEIGHT } from "../presets/gauge";
import { DEFAULT_CONNECTOR_FIT, DEFAULT_PRINTER } from "../presets/print";
import { analyze, attach, nextPort } from "./layout";
import type { Layout, Piece } from "./layout";
import { PLAIN, ELEMENT_KINDS, makeElement, newId, standardElements } from "./track";
import type { ElementType } from "./track";
import { BUILDING_KINDS, SHED_OPENING, makeBuilding } from "./buildings";
import type { Building } from "./buildings";
import { COUPLERS, DECORS, DEFAULT_DESIGN, DEFAULT_FITS, VEHICLE_KINDS, makeVehicle } from "./vehicle";
import type { Fits, Vehicle, VehicleColors } from "./vehicle";

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
};

// ------------------------------------------------------------------------------ templates

export type TemplateId = "oval" | "siding" | "empty" | "hill";
export const TEMPLATES: readonly TemplateId[] = ["oval", "siding", "hill", "empty"];

/** Builds a chain of pieces: each one goes onto the free end of the one before. */
function chain(elements: ElementType[], steps: { type: string; turn?: "left" | "right"; from?: number }[]): Layout {
  const layout: Layout = { pieces: [] };
  const typeOf = new Map(elements.map((e) => [e.id, e]));
  const placed: string[] = [];
  for (const step of steps) {
    const type = typeOf.get(step.type);
    if (!type) throw new Error(`unknown element ${step.type}`);
    if (layout.pieces.length === 0) {
      const root: Piece = { id: newId("p"), type: type.id, variant: PLAIN, port: 0, at: { x: 0, y: 0, rotation: 0 } };
      layout.pieces.push(root);
      placed.push(root.id);
      continue;
    }
    const analysis = analyze(layout, elements);
    const fromPiece = placed[step.from ?? placed.length - 1] as string;
    const target = nextPort(analysis, fromPiece);
    if (!target) throw new Error("no free end to build on");
    const piece = attach(target, type, step.turn ? { turn: step.turn } : {});
    layout.pieces.push(piece);
    placed.push(piece.id);
  }
  return layout;
}

export function templateLayout(id: TemplateId, elements: ElementType[]): Layout {
  const curves = (n: number) => Array.from({ length: n }, () => ({ type: "curve-large", turn: "left" as const }));
  switch (id) {
    case "empty":
      return { pieces: [] };
    case "oval":
      return chain(elements, [{ type: "straight-144" }, ...curves(4), { type: "straight-144" }, ...curves(4)]);
    case "siding": {
      // an oval with a switch, from which a short siding with a buffer stop branches off
      const layout = chain(elements, [{ type: "switch-right" }, ...curves(4), { type: "straight-144" }, ...curves(4)]);
      const analysis = analyze(layout, elements);
      const sw = layout.pieces[0] as Piece;
      const branch = analysis.open.find((p) => p.piece === sw.id && p.index === 2);
      if (branch) {
        const typeOf = new Map(elements.map((e) => [e.id, e]));
        const curve = attach(branch, typeOf.get("curve-large") as ElementType, { turn: "left" });
        layout.pieces.push(curve);
        const a2 = analyze(layout, elements);
        const end = nextPort(a2, curve.id);
        if (end) layout.pieces.push(attach(end, typeOf.get("buffer") as ElementType));
      }
      return layout;
    }
    case "hill":
      // up two ramps, over a bridge and down again, closed by curves
      return chain(elements, [
        { type: "ramp-1" },
        { type: "ramp-2" },
        { type: "bridge" },
        { type: "ramp-2" },
        { type: "ramp-1" },
        ...curves(4),
        { type: "straight-216" },
        { type: "straight-216" },
        { type: "straight-216" },
        { type: "straight-216" },
        { type: "straight-144" },
        ...curves(4),
      ]);
  }
}

export function newProject(template: TemplateId = "oval"): Project {
  const elements = standardElements();
  return {
    schema: SCHEMA_VERSION,
    name: "",
    elements,
    layout: templateLayout(template, elements),
    vehicles: [makeVehicle("steam"), makeVehicle("tender"), makeVehicle("box"), makeVehicle("passenger")],
    buildings: template === "empty" ? [] : defaultBuildings(),
    settings: structuredClone(DEFAULT_SETTINGS),
  };
}

/** A station beside the first straight of the templates (inside the loop, facing the track) and a signal. */
export function defaultBuildings(): Building[] {
  return [makeBuilding("station", { x: 72, y: 56, rotation: 180 }), makeBuilding("signal", { x: 170, y: -36, rotation: 0 })];
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
