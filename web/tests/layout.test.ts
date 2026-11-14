import { describe, expect, it } from "vitest";
import { analyze, attach, nextPort, partsList, removePiece } from "../src/core/layout";
import { buildTemplate, newProject, templateLayout, TEMPLATES } from "../src/core/project";
import { elementShape, makeElement, standardElements } from "../src/core/track";
import { CURVE_ANGLE, CURVE_LARGE_RADIUS } from "../src/presets/gauge";

const elements = standardElements();
const byId = (id: string) => elements.find((e) => e.id === id)!;

describe("element shapes", () => {
  it("a straight has a female start and a male end, length apart", () => {
    const { ports } = elementShape(makeElement("straight", { length: 144 }));
    expect(ports).toHaveLength(2);
    expect(ports[0]).toMatchObject({ x: 0, y: 0, gender: "female" });
    expect(Math.abs(ports[0]!.heading)).toBe(180);
    expect(ports[1]!.x).toBeCloseTo(144);
    expect(ports[1]!.gender).toBe("male");
  });

  it("a left curve ends on its circle, turned by its angle", () => {
    const { ports } = elementShape(makeElement("curve"));
    const a = (CURVE_ANGLE * Math.PI) / 180;
    expect(ports[1]!.x).toBeCloseTo(CURVE_LARGE_RADIUS * Math.sin(a));
    expect(ports[1]!.y).toBeCloseTo(CURVE_LARGE_RADIUS * (1 - Math.cos(a)));
    expect(ports[1]!.heading).toBeCloseTo(CURVE_ANGLE);
  });

  it("a mirrored curve turns right", () => {
    const { ports } = elementShape(makeElement("curve"), { mirror: true, swap: false });
    expect(ports[1]!.y).toBeLessThan(0);
    expect(ports[1]!.heading).toBeCloseTo(-CURVE_ANGLE);
  });

  it("swapping turns male into female", () => {
    const { ports } = elementShape(makeElement("straight"), { mirror: false, swap: true });
    expect(ports.map((p) => p.gender)).toEqual(["male", "female"]);
  });

  it("a ramp climbs by its rise", () => {
    const { ports } = elementShape(makeElement("ramp", { height: 10, rise: 30 }));
    expect(ports[0]!.z).toBe(10);
    expect(ports[1]!.z).toBeCloseTo(40);
  });

  it("a crossing has four ends, the second track crosses in the middle", () => {
    const { ports } = elementShape(makeElement("crossing", { length: 144, crossAngle: 90 }));
    expect(ports).toHaveLength(4);
    expect(ports[2]!.x).toBeCloseTo(72);
    expect(ports[2]!.y).toBeCloseTo(-72);
    expect(ports[3]!.y).toBeCloseTo(72);
  });
});

describe("track plan", () => {
  it.each(TEMPLATES.filter((t) => t !== "empty"))("template %s closes without open ends", (id) => {
    const { layout, elements: types } = buildTemplate(id, elements);
    const a = analyze(layout, types);
    // sidings end in buffer stops, which have no free end
    expect(a.open).toHaveLength(0);
    expect(a.missing).toEqual([]);
    if (id === "siding" || id === "yard") expect(layout.pieces.some((p) => p.type === "buffer")).toBe(true);
    expect(a.joints.every((j) => j.fits)).toBe(true);
    // the figure eight closes two loops; the passing loop closes its main line and the oval
    expect(a.joints.filter((j) => j.closed)).toHaveLength(id === "eight" || id === "passing" ? 2 : 1);
    expect(a.floating).toEqual([]);
    expect(a.overlapping).toEqual([]);
  });

  it("the oval needs 8 large curves and 2 straights", () => {
    const list = partsList(templateLayout("oval", elements), elements, true);
    expect(list.find((p) => p.type === "curve-large")?.count).toBe(8);
    expect(list.find((p) => p.type === "straight-144")?.count).toBe(2);
  });

  it("attach turns right when asked, with the right gender", () => {
    const layout = templateLayout("empty", elements);
    layout.pieces.push({ id: "root", type: "straight-144", variant: { mirror: false, swap: false }, port: 0 });
    const a = analyze(layout, elements);
    const end = nextPort(a, "root")!;
    const piece = attach(end, byId("curve-large"), { turn: "right" });
    layout.pieces.push(piece);
    const b = analyze(layout, elements);
    const exit = nextPort(b, piece.id)!;
    expect(exit.heading).toBeLessThan(0);
    expect(b.joints.every((j) => j.fits)).toBe(true);
  });

  it("double-sided track counts a right curve as a turned-over left curve", () => {
    const layout = templateLayout("empty", elements);
    layout.pieces.push({ id: "a", type: "curve-large", variant: { mirror: false, swap: false }, port: 0 });
    layout.pieces.push({ id: "b", type: "curve-large", variant: { mirror: true, swap: false }, parent: { piece: "a", port: 1 }, port: 0 });
    expect(partsList(layout, elements, true)).toHaveLength(1);
    expect(partsList(layout, elements, false)).toHaveLength(2);
  });

  it("removing a piece removes what hangs on it", () => {
    const layout = templateLayout("oval", elements);
    const second = layout.pieces[1]!.id;
    expect(removePiece(layout, second).pieces).toHaveLength(1);
  });

  it("finds overlapping track", () => {
    const layout = templateLayout("empty", elements);
    layout.pieces.push({ id: "a", type: "straight-216", variant: { mirror: false, swap: false }, port: 0 });
    layout.pieces.push({ id: "b", type: "straight-216", variant: { mirror: false, swap: false }, port: 0, at: { x: 100, y: -100, rotation: 90 } });
    expect(analyze(layout, elements).overlapping.sort()).toEqual(["a", "b"]);
  });

  it("flags male meeting male", () => {
    const layout = templateLayout("empty", elements);
    layout.pieces.push({ id: "a", type: "straight-144", variant: { mirror: false, swap: false }, port: 0 });
    layout.pieces.push({ id: "b", type: "straight-144", variant: { mirror: false, swap: true }, parent: { piece: "a", port: 1 }, port: 0 });
    expect(analyze(layout, elements).joints[0]!.fits).toBe(false);
  });

  it("a new project has a train and a closed oval", () => {
    const p = newProject();
    expect(p.vehicles.length).toBeGreaterThan(1);
    expect(analyze(p.layout, p.elements).open).toHaveLength(0);
  });
});
