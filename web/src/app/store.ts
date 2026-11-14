// The state of the page: the project (with undo and redo) and what the user has selected. React
// reads it through useSyncExternalStore; every change replaces the state object.
import { analyze, attach, nextPort, removePiece } from "../core/layout";
import type { Piece, WorldPort } from "../core/layout";
import { DEFAULT_SETTINGS, arrangeBuildings, buildTemplate, deserialize, newProject, serialize, trainTemplate } from "../core/project";
import type { Project, Settings, TemplateId, TrainTemplateId } from "../core/project";
import { PLAIN, makeElement, newId } from "../core/track";
import type { ElementKind, ElementType } from "../core/track";
import { changeKind, makeVehicle } from "../core/vehicle";
import type { Vehicle, VehicleKind } from "../core/vehicle";
import { closeGap, pairToClose } from "../core/autoclose";
import type { CloseError } from "../core/autoclose";
import { makeBuilding } from "../core/buildings";
import type { Building, BuildingKind } from "../core/buildings";
import { rotate } from "../core/layout";
import { TRACK_WIDTH } from "../presets/gauge";
import { PRINTERS } from "../presets/print";

export type StepId = "track" | "elements" | "vehicles" | "design" | "overview" | "export";
export const STEPS: readonly StepId[] = ["track", "elements", "vehicles", "design", "overview", "export"];

export interface Selection {
  piece?: string;
  /** the free end new pieces are plugged into: piece id and port index */
  target?: { piece: string; index: number };
  element?: string;
  vehicle?: string;
  building?: string;
}

export interface State {
  project: Project;
  step: StepId;
  selection: Selection;
  canUndo: boolean;
  canRedo: boolean;
  /** bumps when the 3D view should look at everything again */
  fitToken: number;
  /** vehicle steps: show the whole train instead of the selected vehicle */
  trainView: boolean;
}

const STORAGE_KEY = "traination.project";
const HISTORY = 100;

function loadSaved(): Project | undefined {
  try {
    const text = localStorage.getItem(STORAGE_KEY);
    return text ? deserialize(text) : undefined;
  } catch {
    return undefined;
  }
}

export class Store {
  private state: State;
  private readonly listeners = new Set<() => void>();
  private undoStack: Project[] = [];
  private redoStack: Project[] = [];
  private saveTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(initial?: Project) {
    const project = initial ?? loadSaved() ?? newProject("oval");
    this.state = { project, step: "track", selection: { vehicle: project.vehicles[0]?.id, element: project.elements[0]?.id }, canUndo: false, canRedo: false, fitToken: 0, trainView: false };
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getState = (): State => this.state;

  private set(patch: Partial<State>): void {
    this.state = { ...this.state, ...patch, canUndo: this.undoStack.length > 0, canRedo: this.redoStack.length > 0 };
    for (const listener of this.listeners) listener();
  }

  private autosave(): void {
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEY, serialize(this.state.project));
      } catch {
        // private window or full storage: the project just is not remembered
      }
    }, 400);
  }

  /** Changes the project; the old one goes on the undo stack. */
  update(change: (p: Project) => Project, selection?: Selection): void {
    const before = this.state.project;
    const after = change(structuredClone(before));
    this.undoStack.push(before);
    if (this.undoStack.length > HISTORY) this.undoStack.shift();
    this.redoStack = [];
    this.set({ project: after, ...(selection ? { selection } : {}) });
    this.autosave();
  }

  undo(): void {
    const previous = this.undoStack.pop();
    if (!previous) return;
    this.redoStack.push(this.state.project);
    this.set({ project: previous, selection: this.validSelection(previous) });
    this.autosave();
  }

  redo(): void {
    const next = this.redoStack.pop();
    if (!next) return;
    this.undoStack.push(this.state.project);
    this.set({ project: next, selection: this.validSelection(next) });
    this.autosave();
  }

  private validSelection(p: Project): Selection {
    const s = this.state.selection;
    const pieces = new Set(p.layout.pieces.map((x) => x.id));
    return {
      ...(s.piece && pieces.has(s.piece) ? { piece: s.piece } : {}),
      ...(s.target && pieces.has(s.target.piece) ? { target: s.target } : {}),
      element: p.elements.some((e) => e.id === s.element) ? s.element : p.elements[0]?.id,
      vehicle: p.vehicles.some((v) => v.id === s.vehicle) ? s.vehicle : p.vehicles[0]?.id,
      ...(s.building && p.buildings.some((b) => b.id === s.building) ? { building: s.building } : {}),
    };
  }

  setStep(step: StepId): void {
    this.set({ step });
  }

  setTrainView(trainView: boolean): void {
    this.set({ trainView });
  }

  // ---------------------------------------------------------------------------- closing the track

  /** Adds the pieces that join two free ends. Returns an error code if no route is found. */
  closeTrack(): CloseError | undefined {
    const { project, selection } = this.state;
    const a = analyze(project.layout, project.elements);
    const pair = pairToClose(a.open, selection.target);
    if (!pair) return "no_pair";
    const bed = (PRINTERS.find((p) => p.id === project.settings.printer) ?? PRINTERS[0])?.bed;
    const result = closeGap(project.elements, pair[0], pair[1], { layout: project.layout, ...(bed ? { bed } : {}) });
    if (typeof result === "string") return result;
    this.update((p) => ({ ...p, elements: [...p.elements, ...result.newTypes], layout: { pieces: [...p.layout.pieces, ...result.pieces] } }), {
      ...selection,
      piece: result.pieces[result.pieces.length - 1]?.id,
      target: undefined,
    });
    return undefined;
  }

  // ---------------------------------------------------------------------------- buildings

  /** A new building beside the selected piece (or beside the plan). */
  addBuilding(kind: BuildingKind): void {
    const { project, selection } = this.state;
    const a = analyze(project.layout, project.elements);
    const piece = selection.piece ? a.poses.get(selection.piece) : undefined;
    const made = makeBuilding(kind);
    let at = { x: 0, y: -120, rotation: 0 };
    if (piece) {
      // beside the selected piece, on its right, facing the track
      const [dx, dy] = rotate(40, -(TRACK_WIDTH / 2 + 6 + made.width / 2), piece.rotation);
      at = { x: piece.x + dx, y: piece.y + dy, rotation: piece.rotation };
    } else if (project.layout.pieces.length > 0) {
      const ys = [...a.poses.values()].map((p) => p.y);
      at = { x: 0, y: Math.min(...ys) - 60 - made.width / 2, rotation: 0 };
    }
    const building = { ...made, ...at };
    this.update((p) => ({ ...p, buildings: [...p.buildings, building] }), { ...selection, building: building.id, piece: undefined });
  }

  changeBuilding(id: string, patch: Partial<Building>, record = true): void {
    const change = (p: Project): Project => ({ ...p, buildings: p.buildings.map((b) => (b.id === id ? { ...b, ...patch, colors: { ...b.colors, ...patch.colors } } : b)) });
    if (record) this.update(change);
    else {
      this.set({ project: change(this.state.project) });
      this.autosave();
    }
  }

  moveBuilding(id: string, dx: number, dy: number): void {
    const b = this.state.project.buildings.find((x) => x.id === id);
    if (b) this.changeBuilding(id, { x: b.x + dx, y: b.y + dy }, false);
  }

  removeBuilding(id: string): void {
    this.update((p) => ({ ...p, buildings: p.buildings.filter((b) => b.id !== id) }), { ...this.state.selection, building: undefined });
  }

  select(patch: Selection): void {
    this.set({ selection: { ...this.state.selection, ...patch } });
  }

  fit(): void {
    this.set({ fitToken: this.state.fitToken + 1 });
  }

  // ---------------------------------------------------------------------------- files

  newProject(template: TemplateId): void {
    const fresh = newProject(template);
    this.update(() => fresh, { vehicle: fresh.vehicles[0]?.id, element: fresh.elements[0]?.id });
    this.fit();
  }

  load(text: string): void {
    const project = deserialize(text);
    this.update(() => project, { vehicle: project.vehicles[0]?.id, element: project.elements[0]?.id });
    this.fit();
  }

  // ---------------------------------------------------------------------------- track plan

  /** The free end new pieces go to: the selected one, else the last free end of the plan. */
  currentTarget(): WorldPort | undefined {
    const { project, selection } = this.state;
    const a = analyze(project.layout, project.elements);
    const chosen = selection.target && a.open.find((p) => p.piece === selection.target?.piece && p.index === selection.target.index);
    if (chosen) return chosen;
    const last = [...project.layout.pieces].reverse().find((piece) => a.open.some((p) => p.piece === piece.id));
    return last ? nextPort(a, last.id) : undefined;
  }

  /**
   * Adds a piece of an element type: at the free end `place.end` (from the "+" in the 3D view or a
   * drop), at the point `place.at` as a new loose piece, or else at the current free end.
   */
  addPiece(typeId: string, turn?: "left" | "right", place: { end?: { piece: string; index: number }; at?: { x: number; y: number } } = {}): void {
    const { project } = this.state;
    const type = project.elements.find((e) => e.id === typeId);
    if (!type) return;
    const loose = (x: number, y: number): Piece => ({ id: newId("p"), type: type.id, variant: turn === "right" && type.kind === "curve" ? { mirror: true, swap: false } : PLAIN, port: 0, at: { x, y, rotation: 0 } });
    const before = analyze(project.layout, project.elements);
    const chosen = place.end && before.open.find((p) => p.piece === place.end?.piece && p.index === place.end.index);
    let piece: Piece;
    if (chosen) piece = attach(chosen, type, turn ? { turn } : {});
    else if (place.at) piece = loose(place.at.x, place.at.y);
    else if (project.layout.pieces.length === 0) piece = loose(0, 0);
    else {
      const target = this.currentTarget();
      // a closed plan: start a new piece beside it
      piece = target ? attach(target, type, turn ? { turn } : {}) : loose(0, -300);
    }
    const after = structuredClone(project);
    after.layout.pieces.push(piece);
    const a = analyze(after.layout, after.elements);
    const next = nextPort(a, piece.id);
    this.update(() => after, { ...this.state.selection, piece: piece.id, target: next ? { piece: next.piece, index: next.index } : undefined });
  }

  removePiece(id: string): void {
    const { project } = this.state;
    const piece = project.layout.pieces.find((p) => p.id === id);
    this.update((p) => ({ ...p, layout: removePiece(p.layout, id) }), {
      ...this.state.selection,
      piece: piece?.parent?.piece,
      target: piece?.parent ? { piece: piece.parent.piece, index: piece.parent.port } : undefined,
    });
  }

  changePiece(id: string, change: (piece: Piece) => Piece): void {
    this.update((p) => ({ ...p, layout: { pieces: p.layout.pieces.map((x) => (x.id === id ? change(x) : x)) } }));
  }

  /** Mirror a piece (left curve ↔ right curve). */
  mirrorPiece(id: string): void {
    this.changePiece(id, (x) => ({ ...x, variant: { ...x.variant, mirror: !x.variant.mirror } }));
  }

  /** Swap male and female ends. */
  swapPiece(id: string): void {
    this.changePiece(id, (x) => ({ ...x, variant: { ...x.variant, swap: !x.variant.swap } }));
  }

  /** Turn a loose piece (one without parent) by 45° or move it. */
  turnRoot(id: string, degrees: number): void {
    this.changePiece(id, (x) => (x.parent ? x : { ...x, at: { x: x.at?.x ?? 0, y: x.at?.y ?? 0, rotation: (x.at?.rotation ?? 0) + degrees } }));
  }

  moveRoot(id: string, dx: number, dy: number, record = true): void {
    const change = (x: Piece): Piece => (x.parent ? x : { ...x, at: { x: (x.at?.x ?? 0) + dx, y: (x.at?.y ?? 0) + dy, rotation: x.at?.rotation ?? 0 } });
    if (record) this.changePiece(id, change);
    else {
      // while dragging: no undo step for every mouse move
      const project = structuredClone(this.state.project);
      project.layout.pieces = project.layout.pieces.map((x) => (x.id === id ? change(x) : x));
      this.set({ project });
      this.autosave();
    }
  }

  /** Remember the state before a drag as one undo step. */
  beginGesture(): void {
    this.undoStack.push(this.state.project);
    this.redoStack = [];
    this.set({});
  }

  /** The root that a piece hangs on (the piece that moves the whole group). */
  rootOf(id: string): string {
    const byId = new Map(this.state.project.layout.pieces.map((p) => [p.id, p]));
    let piece = byId.get(id);
    const seen = new Set<string>();
    while (piece?.parent && byId.has(piece.parent.piece) && !seen.has(piece.id)) {
      seen.add(piece.id);
      piece = byId.get(piece.parent.piece);
    }
    return piece?.id ?? id;
  }

  applyTemplate(template: TemplateId): void {
    this.update((p) => {
      // make sure the standard elements the template needs exist
      const fresh = newProject("empty").elements;
      const have = new Set(p.elements.map((e) => e.id));
      const built = buildTemplate(template, [...p.elements, ...fresh.filter((e) => !have.has(e.id))]);
      // buildings that would stand on the new track move beside it
      return { ...p, elements: built.elements, layout: built.layout, buildings: arrangeBuildings(built.layout, built.elements, p.buildings) };
    }, { ...this.state.selection, piece: undefined, target: undefined });
    this.fit();
  }

  /** Removes every piece of the track (buildings and trains stay). Undo brings it back. */
  clearTrack(): void {
    this.update((p) => ({ ...p, layout: { pieces: [] } }), { ...this.state.selection, piece: undefined, target: undefined });
  }

  /** Replaces the train by a ready-made one. */
  applyTrain(id: TrainTemplateId): void {
    const vehicles = trainTemplate(id);
    this.update((p) => ({ ...p, vehicles }), { ...this.state.selection, vehicle: vehicles[0]?.id });
    this.fit();
  }

  // ---------------------------------------------------------------------------- elements

  addElement(kind: ElementKind): void {
    const element = makeElement(kind);
    this.update((p) => ({ ...p, elements: [...p.elements, element] }), { ...this.state.selection, element: element.id });
  }

  duplicateElement(id: string): void {
    const source = this.state.project.elements.find((e) => e.id === id);
    if (!source) return;
    const copy = { ...source, id: newId("e"), name: "" };
    this.update((p) => ({ ...p, elements: [...p.elements, copy] }), { ...this.state.selection, element: copy.id });
  }

  changeElement(id: string, patch: Partial<ElementType>): void {
    this.update((p) => ({ ...p, elements: p.elements.map((e) => (e.id === id ? { ...e, ...patch } : e)) }));
  }

  /** Removes an element type and the pieces of the plan that use it. */
  removeElement(id: string): void {
    this.update((p) => {
      let layout = p.layout;
      for (const piece of p.layout.pieces.filter((x) => x.type === id)) layout = removePiece(layout, piece.id);
      const elements = p.elements.filter((e) => e.id !== id);
      return { ...p, layout, elements };
    }, { ...this.state.selection, element: this.state.project.elements.find((e) => e.id !== id)?.id, piece: undefined, target: undefined });
  }

  changeSettings(patch: Partial<Settings>): void {
    this.update((p) => ({ ...p, settings: { ...DEFAULT_SETTINGS, ...p.settings, ...patch } }));
  }

  // ---------------------------------------------------------------------------- vehicles

  /** A new vehicle at the end of the train or at `index` (drag and drop). */
  addVehicle(kind: VehicleKind, index?: number): void {
    const v = makeVehicle(kind);
    this.update((p) => {
      const vehicles = [...p.vehicles];
      vehicles.splice(index ?? vehicles.length, 0, v);
      return { ...p, vehicles };
    }, { ...this.state.selection, vehicle: v.id });
  }

  /** Moves a vehicle to position `index` of the train (drag and drop). */
  moveVehicleTo(id: string, index: number): void {
    this.update((p) => {
      const vehicles = [...p.vehicles];
      const i = vehicles.findIndex((v) => v.id === id);
      if (i < 0) return p;
      const [v] = vehicles.splice(i, 1);
      vehicles.splice(index > i ? index - 1 : index, 0, v as Vehicle);
      return { ...p, vehicles };
    });
  }

  duplicateVehicle(id: string): void {
    const source = this.state.project.vehicles.find((v) => v.id === id);
    if (!source) return;
    const copy: Vehicle = { ...structuredClone(source), id: newId("v") };
    this.update((p) => {
      const i = p.vehicles.findIndex((v) => v.id === id);
      const vehicles = [...p.vehicles];
      vehicles.splice(i + 1, 0, copy);
      return { ...p, vehicles };
    }, { ...this.state.selection, vehicle: copy.id });
  }

  changeVehicle(id: string, change: (v: Vehicle) => Vehicle): void {
    this.update((p) => ({ ...p, vehicles: p.vehicles.map((v) => (v.id === id ? change(v) : v)) }));
  }

  setVehicleKind(id: string, kind: VehicleKind): void {
    this.changeVehicle(id, (v) => changeKind(v, kind));
  }

  removeVehicle(id: string): void {
    const rest = this.state.project.vehicles.filter((v) => v.id !== id);
    this.update((p) => ({ ...p, vehicles: p.vehicles.filter((v) => v.id !== id) }), { ...this.state.selection, vehicle: rest[0]?.id });
  }

  moveVehicle(id: string, by: number): void {
    this.update((p) => {
      const vehicles = [...p.vehicles];
      const i = vehicles.findIndex((v) => v.id === id);
      const j = i + by;
      if (i < 0 || j < 0 || j >= vehicles.length) return p;
      [vehicles[i], vehicles[j]] = [vehicles[j] as Vehicle, vehicles[i] as Vehicle];
      return { ...p, vehicles };
    });
  }
}
