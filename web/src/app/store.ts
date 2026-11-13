// The state of the page: the project (with undo and redo) and what the user has selected. React
// reads it through useSyncExternalStore; every change replaces the state object.
import { analyze, attach, nextPort, removePiece } from "../core/layout";
import type { Piece, WorldPort } from "../core/layout";
import { DEFAULT_SETTINGS, deserialize, newProject, serialize, templateLayout } from "../core/project";
import type { Project, Settings, TemplateId } from "../core/project";
import { PLAIN, makeElement, newId } from "../core/track";
import type { ElementKind, ElementType } from "../core/track";
import { changeKind, makeVehicle } from "../core/vehicle";
import type { Vehicle, VehicleKind } from "../core/vehicle";

export type StepId = "track" | "elements" | "vehicles" | "design" | "export";
export const STEPS: readonly StepId[] = ["track", "elements", "vehicles", "design", "export"];

export interface Selection {
  piece?: string;
  /** the free end new pieces are plugged into: piece id and port index */
  target?: { piece: string; index: number };
  element?: string;
  vehicle?: string;
}

export interface State {
  project: Project;
  step: StepId;
  selection: Selection;
  canUndo: boolean;
  canRedo: boolean;
  /** bumps when the 3D view should look at everything again */
  fitToken: number;
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
    this.state = { project, step: "track", selection: { vehicle: project.vehicles[0]?.id, element: project.elements[0]?.id }, canUndo: false, canRedo: false, fitToken: 0 };
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
    };
  }

  setStep(step: StepId): void {
    this.set({ step });
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

  addPiece(typeId: string, turn?: "left" | "right"): void {
    const { project } = this.state;
    const type = project.elements.find((e) => e.id === typeId);
    if (!type) return;
    let piece: Piece;
    if (project.layout.pieces.length === 0) {
      piece = { id: newId("p"), type: type.id, variant: turn === "right" && type.kind === "curve" ? { mirror: true, swap: false } : PLAIN, port: 0, at: { x: 0, y: 0, rotation: 0 } };
    } else {
      const target = this.currentTarget();
      if (!target) {
        // a closed plan: start a new piece beside it
        piece = { id: newId("p"), type: type.id, variant: PLAIN, port: 0, at: { x: 0, y: -300, rotation: 0 } };
      } else {
        piece = attach(target, type, turn ? { turn } : {});
      }
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
      const elements = [...p.elements, ...fresh.filter((e) => !have.has(e.id))];
      return { ...p, elements, layout: templateLayout(template, elements) };
    }, { ...this.state.selection, piece: undefined, target: undefined });
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

  addVehicle(kind: VehicleKind): void {
    const v = makeVehicle(kind);
    this.update((p) => ({ ...p, vehicles: [...p.vehicles, v] }), { ...this.state.selection, vehicle: v.id });
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
