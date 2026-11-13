// Texts and the store, without a browser.
import { describe, expect, it } from "vitest";
import { Store } from "../src/app/store";
import { analyze } from "../src/core/layout";
import { newProject } from "../src/core/project";
import { ELEMENT_KINDS } from "../src/core/track";
import { CATEGORIES, COLOR_SLOTS, COUPLERS, DECORS, VEHICLE_KINDS } from "../src/core/vehicle";
import { BUILDING_KINDS } from "../src/core/buildings";
import { STUD_KINDS } from "../src/presets/bricks";
import { STEPS } from "../src/app/store";
import { TEMPLATES } from "../src/core/project";
import { DE } from "../src/ui/texts_de";
import { EN } from "../src/ui/texts_en";

describe("texts", () => {
  it("German and English have the same keys and no empty text", () => {
    expect(Object.keys(EN).sort()).toEqual(Object.keys(DE).sort());
    for (const [key, text] of [...Object.entries(DE), ...Object.entries(EN)]) expect(text, key).not.toBe("");
  });

  it("every kind, coupler, step and template has a text", () => {
    const keys = [
      ...ELEMENT_KINDS.map((k) => `kind.${k}`),
      ...VEHICLE_KINDS.map((k) => `vkind.${k}`),
      ...COUPLERS.map((c) => `coupler.${c}`),
      ...STEPS.flatMap((s) => [`step.${s}`, `page.${s}`]),
      ...TEMPLATES.map((t) => `template.${t}`),
      ...["chassis", "body", "roof", "details", "load", "decor", "wheel", "axle", "worm", "wormWheel", "support", "base"].map((p) => `part.${p}`),
      ...COLOR_SLOTS.map((s) => `color.${s}`),
      ...CATEGORIES.map((c) => `cat.${c}`),
      ...BUILDING_KINDS.map((k) => `bkind.${k}`),
      ...DECORS.map((d) => `decor.${d}`),
      ...STUD_KINDS.map((k) => `studs.${k}`),
      ...["no_pair", "height", "angle", "no_route"].map((c) => `close.${c}`),
      ...["not_json", "not_project", "too_new"].map((c) => `file.${c}`),
    ];
    for (const key of keys) expect(Object.keys(DE), key).toContain(key);
  });

  it("placeholders match between the languages", () => {
    const names = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
    for (const key of Object.keys(DE) as (keyof typeof DE)[]) expect(names(EN[key]), key).toEqual(names(DE[key]));
  });
});

describe("store", () => {
  it("adds pieces to the free end, undoes and redoes", () => {
    const store = new Store(newProject("empty"));
    store.addPiece("straight-144");
    store.addPiece("curve-large", "left");
    store.addPiece("curve-large", "left");
    const state = store.getState();
    expect(state.project.layout.pieces).toHaveLength(3);
    const a = analyze(state.project.layout, state.project.elements);
    expect(a.joints).toHaveLength(2);
    expect(a.joints.every((j) => j.fits)).toBe(true);
    store.undo();
    expect(store.getState().project.layout.pieces).toHaveLength(2);
    store.redo();
    expect(store.getState().project.layout.pieces).toHaveLength(3);
  });

  it("closes an oval piece by piece", () => {
    const store = new Store(newProject("empty"));
    store.addPiece("straight-144");
    for (let i = 0; i < 4; i++) store.addPiece("curve-large", "left");
    store.addPiece("straight-144");
    for (let i = 0; i < 4; i++) store.addPiece("curve-large", "left");
    const { project } = store.getState();
    const a = analyze(project.layout, project.elements);
    expect(a.open).toHaveLength(0);
    expect(a.joints.filter((j) => j.closed)).toHaveLength(1);
  });

  it("removing an element type removes its pieces", () => {
    const store = new Store(newProject("oval"));
    store.removeElement("curve-large");
    const { project } = store.getState();
    expect(project.elements.some((e) => e.id === "curve-large")).toBe(false);
    expect(project.layout.pieces.every((p) => p.type !== "curve-large")).toBe(true);
  });

  it("keeps the train order when moving a vehicle", () => {
    const store = new Store(newProject("oval"));
    const [first, second] = store.getState().project.vehicles;
    store.moveVehicle(second!.id, -1);
    expect(store.getState().project.vehicles[0]!.id).toBe(second!.id);
    expect(store.getState().project.vehicles[1]!.id).toBe(first!.id);
  });
});
