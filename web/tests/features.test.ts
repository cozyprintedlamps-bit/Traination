// Closing the track, supports under raised track, buildings, vehicle categories, drag and drop.
import { beforeAll, describe, expect, it } from "vitest";
import { Store } from "../src/app/store";
import { closeGap, pairToClose } from "../src/core/autoclose";
import { analyze, removePiece } from "../src/core/layout";
import { deserialize, newProject, serialize, templateLayout } from "../src/core/project";
import { supports, supportParts } from "../src/core/supports";
import { standardElements } from "../src/core/track";
import { CATEGORIES, KINDS_BY_CATEGORY, VEHICLE_KINDS, categoryOf } from "../src/core/vehicle";
import { createEngine } from "../src/geometry/engine";
import type { Engine } from "../src/geometry/engine";
import { buildingItems, vehicleItems } from "../src/export/printItems";
import type { Names } from "../src/export/printItems";

const elements = standardElements();

describe("closing the track", () => {
  it("closes an oval with a piece missing, using standard pieces", () => {
    const layout = templateLayout("oval", elements);
    const gap = removePiece(layout, layout.pieces[layout.pieces.length - 1]!.id);
    const a = analyze(gap, elements);
    expect(a.open).toHaveLength(2);
    const pair = pairToClose(a.open)!;
    const result = closeGap(elements, pair[0], pair[1]);
    if (typeof result === "string") throw new Error(result);
    const closed = { pieces: [...gap.pieces, ...result.pieces] };
    const after = analyze(closed, [...elements, ...result.newTypes]);
    expect(after.open).toHaveLength(0);
    expect(after.joints.every((j) => j.fits)).toBe(true);
    expect(result.newTypes).toHaveLength(0);
  });

  it("closes a gap of odd length with a fitting straight", () => {
    const store = new Store(newProject("empty"));
    // 54 mm on one side, 144 on the other: a gap of 90 mm stays open
    store.addPiece("straight-54");
    for (let i = 0; i < 4; i++) store.addPiece("curve-large", "left");
    store.addPiece("straight-144");
    for (let i = 0; i < 4; i++) store.addPiece("curve-large", "left");
    expect(store.closeTrack()).toBeUndefined();
    const { project } = store.getState();
    const a = analyze(project.layout, project.elements);
    expect(a.open).toHaveLength(0);
    // one fitting straight of 144 − 54 = 90 mm closes the gap
    expect(project.elements.some((e) => e.kind === "straight" && Math.abs(e.length - 90) < 0.1)).toBe(true);
    expect(project.layout.pieces).toHaveLength(11);
  });

  it("closes a half-built loop with curves", () => {
    const store = new Store(newProject("empty"));
    store.addPiece("straight-216");
    for (let i = 0; i < 4; i++) store.addPiece("curve-large", "left");
    expect(store.closeTrack()).toBeUndefined();
    const { project } = store.getState();
    expect(analyze(project.layout, project.elements).open).toHaveLength(0);
  });

  it("puts in a socket–socket adapter when both ends are pegs", () => {
    const a = { x: 0, y: 0, z: 0, heading: 0, gender: "male" as const, piece: "a", index: 1 };
    const b = { x: 300, y: 0, z: 0, heading: 180, gender: "male" as const, piece: "b", index: 1 };
    const result = closeGap(elements, a, b);
    if (typeof result === "string") throw new Error(result);
    const types = new Map([...elements, ...result.newTypes].map((t) => [t.id, t]));
    const kinds = result.pieces.map((p) => types.get(p.type)!);
    expect(kinds[kinds.length - 1]).toMatchObject({ kind: "adapter", adapter: "female" });
    // 300 mm = 270 mm of straights + the 30 mm adapter
    const straight = kinds.filter((t) => t.kind === "straight").reduce((n, t) => n + t.length, 0);
    expect(straight).toBeCloseTo(270, 1);
  });

  it("says why it cannot close", () => {
    const store = new Store(newProject("oval"));
    expect(store.closeTrack()).toBe("no_pair");
  });
});

describe("supports", () => {
  it("the hill template needs none: ramps and bridge stand on the bed", () => {
    const layout = templateLayout("hill", elements);
    expect(supports(layout, elements, analyze(layout, elements))).toHaveLength(0);
  });

  it("raised straights get a support under every joint and in the middle of long pieces", () => {
    const store = new Store(newProject("empty"));
    store.addPiece("ramp-1");
    store.addPiece("straight-216");
    store.addPiece("straight-216");
    const { project } = store.getState();
    const list = supports(project.layout, project.elements, analyze(project.layout, project.elements));
    // joint ramp/straight is carried by the ramp; then middle, joint, middle, end
    expect(list).toHaveLength(4);
    expect(list.every((s) => Math.abs(s.height - 38) < 0.01)).toBe(true);
    expect(supportParts(list)).toEqual([{ height: 38, plain: false, count: 4 }]);
  });
});

describe("vehicles and buildings", () => {
  it("every kind belongs to exactly one category", () => {
    const all = CATEGORIES.flatMap((c) => KINDS_BY_CATEGORY[c]);
    expect(all.sort()).toEqual([...VEHICLE_KINDS].sort());
    expect(new Set(all).size).toBe(all.length);
    expect(categoryOf("cyberbrick")).toBe("loco");
  });

  it("drag and drop puts vehicles in their place", () => {
    const store = new Store(newProject("oval"));
    const ids = store.getState().project.vehicles.map((v) => v.id);
    store.addVehicle("crane", 1);
    expect(store.getState().project.vehicles[1]!.kind).toBe("crane");
    store.moveVehicleTo(ids[0]!, 5);
    const order = store.getState().project.vehicles.map((v) => v.id);
    expect(order[order.length - 1]).toBe(ids[0]);
  });

  it("buildings are saved with the project, old files get colour slots", () => {
    const p = newProject("oval");
    expect(p.buildings.length).toBeGreaterThan(0);
    expect(deserialize(serialize(p))).toEqual(p);
    const old = deserialize(JSON.stringify({ schema: 1, vehicles: [{ kind: "box", colors: { accent: "#123456", body: "#FFFFFF" } }] }));
    expect(old.vehicles[0]!.colors.roof).toBe("#123456");
    expect(old.vehicles[0]!.colors.details).toBe("#123456");
    expect(old.buildings).toEqual([]);
  });
});

describe("print parts", () => {
  let engine: Engine;
  beforeAll(async () => {
    engine = await createEngine();
  });
  const names: Names = { element: (t) => t.id, vehicle: (v) => v.kind, building: (b) => b.kind, part: (p) => p };

  it("split vehicles print roof, chimney and dome on their own, standing on the bed", async () => {
    const project = newProject("empty");
    project.vehicles = project.vehicles.slice(0, 1);
    const items = await vehicleItems(project, engine, names);
    const separate = items.filter((i) => /roof|details/.test(i.name));
    expect(separate.length).toBe(3);
    for (const i of separate) expect(i.part.min[2]).toBeCloseTo(0, 3);
  });

  it("multi-colour vehicles keep their parts as volumes of the body", async () => {
    const project = newProject("empty");
    project.vehicles = project.vehicles.slice(0, 1).map((v) => ({ ...v, design: { ...v.design, split: false } }));
    const items = await vehicleItems(project, engine, names);
    const body = items.find((i) => i.name.endsWith("body"))!;
    expect(body.volumes?.length).toBeGreaterThan(0);
  });

  it("buildings print walls with details, and the roof on its own", async () => {
    const items = await buildingItems(newProject("oval"), engine, names);
    expect(items.some((i) => i.name.startsWith("station") && i.name.endsWith("roof"))).toBe(true);
  });
});
