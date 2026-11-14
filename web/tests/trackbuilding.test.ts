// Building track: fitting pieces from "close the track", templates with their buildings, clearing
// and placing pieces, ready-made trains, sleepers, arches and the filament estimate.
import { beforeAll, describe, expect, it } from "vitest";
import { Store } from "../src/app/store";
import { closeGap, fitsBed } from "../src/core/autoclose";
import { analyze } from "../src/core/layout";
import type { WorldPort } from "../src/core/layout";
import { printedMaterial } from "../src/core/material";
import { TEMPLATES, TRAIN_TEMPLATE_IDS, newProject, trainTemplate } from "../src/core/project";
import { OVER_TRACK, footprint } from "../src/core/buildings";
import { PLAIN, elementShape, makeElement, pathLength, pointAt, sleeperGaps, standardElements } from "../src/core/track";
import { createEngine } from "../src/geometry/engine";
import type { Engine } from "../src/geometry/engine";
import { archOutline } from "../src/geometry/track";
import { GROOVE_SPACING, GROOVE_WIDTH, MIN_FILL_LENGTH, MIN_FIT_RADIUS, SLEEPER_GAP_WIDTH, TRACK_HEIGHT, TRACK_WIDTH } from "../src/presets/gauge";
import { PRINT_BOTTOM_SKIN, PRINT_INFILL, PRINT_TOP_SKIN, PRINT_WALL } from "../src/presets/print";

const elements = standardElements();
const port = (x: number, y: number, heading: number, gender: "male" | "female", piece: string): WorldPort => ({ x, y, z: 0, heading, gender, piece, index: 1 });

describe("close the track with fitting pieces", () => {
  const cases: [string, WorldPort, WorldPort][] = [
    ["an odd angle", port(0, 0, 0, "male", "a"), port(420, 160, 200, "female", "b")],
    ["a small offset", port(0, 0, 0, "male", "a"), port(300, 12, 180, "female", "b")],
    ["opposite directions", port(0, 0, 0, "male", "a"), port(0, 420, 0, "female", "b")],
    ["a right angle at a distance", port(0, 0, 0, "male", "a"), port(500, 300, 270, "female", "b")],
    ["two pegs (adapter)", port(0, 0, 0, "male", "a"), port(380, -70, 170, "male", "b")],
  ];

  it.each(cases)("closes %s", (_, a, b) => {
    const result = closeGap(elements, a, b);
    if (typeof result === "string") throw new Error(result);
    const types = new Map([...elements, ...result.newTypes].map((t) => [t.id, t]));
    for (const t of result.newTypes) {
      if (t.kind === "curve") {
        expect(t.radius).toBeGreaterThanOrEqual(MIN_FIT_RADIUS);
        expect((t.angle * Math.PI * t.radius) / 180).toBeGreaterThanOrEqual(MIN_FILL_LENGTH - 0.1);
      }
      if (t.kind === "straight") expect(t.length).toBeGreaterThanOrEqual(MIN_FILL_LENGTH);
      expect(fitsBed(t, [256, 256])).toBe(true);
    }
    expect(result.pieces.every((p) => types.has(p.type))).toBe(true);
  });

  it("finds a route for gaps at angles the standard curves cannot make", () => {
    // 30° is no multiple of the 45° curves: the first version said "angle"
    const result = closeGap(elements, port(0, 0, 0, "male", "a"), port(400, 200, 210, "female", "b"));
    expect(typeof result).not.toBe("string");
    if (typeof result === "string") return;
    expect(result.newTypes.some((t) => t.kind === "curve")).toBe(true);
  });

  it("keeps every piece small enough for an A1 mini", () => {
    const result = closeGap(elements, port(0, 0, 0, "male", "a"), port(420, 160, 200, "female", "b"), { bed: [180, 180] });
    if (typeof result === "string") throw new Error(result);
    for (const t of result.newTypes) expect(fitsBed(t, [180, 180])).toBe(true);
  });

  it("closes a plan in the store: no open ends, no overlaps, calculated pieces named in the types", () => {
    const store = new Store(newProject("empty"));
    store.addPiece("straight-144");
    for (let i = 0; i < 3; i++) store.addPiece("curve-large", "left");
    store.addPiece("straight-54");
    store.addPiece("curve-small", "left");
    expect(store.closeTrack()).toBeUndefined();
    const { project } = store.getState();
    const a = analyze(project.layout, project.elements);
    expect(a.open).toHaveLength(0);
    expect(a.overlapping).toEqual([]);
    expect(a.joints.every((j) => j.fits)).toBe(true);
  });
});

describe("templates", () => {
  it.each(TEMPLATES.filter((t) => t !== "empty"))("%s: no buildings of its own; what belongs to it stands beside the track", (id) => {
    const project = newProject(id);
    const a = analyze(project.layout, project.elements);
    const typeOf = new Map(project.elements.map((e) => [e.id, e]));
    const points: [number, number][] = [];
    for (const piece of project.layout.pieces) {
      const type = typeOf.get(piece.type);
      const pose = a.poses.get(piece.id);
      if (!type || !pose) continue;
      for (const path of elementShape(type, piece.variant).paths) {
        for (let s = 0; s <= pathLength(path); s += 5) {
          const p = pointAt(path, s);
          const r = (pose.rotation * Math.PI) / 180;
          points.push([pose.x + p.x * Math.cos(r) - p.y * Math.sin(r), pose.y + p.x * Math.sin(r) + p.y * Math.cos(r)]);
        }
      }
    }
    // only tunnels, platforms and plates that belong to the track, all marked as from the template
    expect(project.buildings.every((b) => b.fromTemplate === true)).toBe(true);
    expect(project.buildings.some((b) => b.kind === "station" || b.kind === "signal")).toBe(false);
    for (const b of project.buildings.filter((x) => !OVER_TRACK.has(x.kind))) {
      const corners = footprint(b);
      // no track centre point inside the footprint grown by half a track width
      for (const [x, y] of points) {
        const r = (-b.rotation * Math.PI) / 180;
        const u = (x - b.x) * Math.cos(r) - (y - b.y) * Math.sin(r);
        const v = (x - b.x) * Math.sin(r) + (y - b.y) * Math.cos(r);
        expect(Math.abs(u) < b.length / 2 + TRACK_WIDTH / 2 && Math.abs(v) < b.width / 2 + TRACK_WIDTH / 2, `${b.kind} at ${corners[0]}`).toBe(false);
      }
    }
  });

  it("applying a template moves the user's buildings off the new track and replaces its own", () => {
    const store = new Store(newProject("mountain"));
    expect(store.getState().project.buildings.filter((b) => b.kind.startsWith("tunnel"))).toHaveLength(3);
    store.addBuilding("station");
    const own = store.getState().project.buildings.at(-1)!;
    // the crossing of the eight lies around (74, 0)
    store.changeBuilding(own.id, { x: 74, y: 0 });
    store.applyTemplate("eight");
    const { project } = store.getState();
    const station = project.buildings.find((b) => b.kind === "station");
    expect(station).toBeDefined();
    expect(Math.hypot((station?.x ?? 0) - 74, station?.y ?? 0)).toBeGreaterThan(60);
    // the tunnels of the mountain line are gone
    expect(project.buildings.some((b) => b.kind.startsWith("tunnel"))).toBe(false);
  });

  it("a tunnel of a template lies over its piece of track", () => {
    const project = newProject("mountain");
    const a = analyze(project.layout, project.elements);
    for (const t of project.buildings.filter((b) => OVER_TRACK.has(b.kind))) {
      // the middle of the tunnel is on the centre line of some piece
      const near = project.layout.pieces.some((piece) => {
        const pose = a.poses.get(piece.id)!;
        const type = project.elements.find((e) => e.id === piece.type)!;
        const path = elementShape(type, piece.variant).paths[0]!;
        const mid = pointAt(path, pathLength(path) / 2);
        const r = (pose.rotation * Math.PI) / 180;
        return Math.hypot(pose.x + mid.x * Math.cos(r) - mid.y * Math.sin(r) - t.x, pose.y + mid.x * Math.sin(r) + mid.y * Math.cos(r) - t.y) < 0.5;
      });
      expect(near, t.kind).toBe(true);
    }
  });

  it("'build your own track' empties the plan and drops the template's buildings, undo brings them back", () => {
    const store = new Store(newProject("lego"));
    const before = store.getState().project;
    expect(before.buildings.length).toBe(2);
    store.startOwnTrack();
    expect(store.getState().project.layout.pieces).toHaveLength(0);
    expect(store.getState().project.buildings).toHaveLength(0);
    store.undo();
    expect(store.getState().project.layout.pieces).toHaveLength(before.layout.pieces.length);
  });

  it.each(TRAIN_TEMPLATE_IDS)("the train template %s starts with a locomotive", (id) => {
    const train = trainTemplate(id);
    expect(train.length).toBeGreaterThan(2);
    expect(["steam", "electric", "highspeed", "cyberbrick"]).toContain(train[0]?.kind);
  });
});

describe("placing and clearing", () => {
  it("clears the whole track, undo brings it back", () => {
    const store = new Store(newProject("oval"));
    const before = store.getState().project.layout.pieces.length;
    store.addBuilding("house");
    store.clearTrack();
    expect(store.getState().project.layout.pieces).toHaveLength(0);
    expect(store.getState().project.buildings.length).toBeGreaterThan(0);
    store.undo();
    expect(store.getState().project.layout.pieces).toHaveLength(before);
  });

  it("adds a piece at a chosen free end and a loose piece at a point", () => {
    const store = new Store(newProject("empty"));
    store.addPiece("straight-144");
    store.addPiece("straight-144");
    const { project } = store.getState();
    const first = project.layout.pieces[0]!;
    // the free end at the start of the first piece (port 0)
    store.addPiece("curve-large", "right", { end: { piece: first.id, index: 0 } });
    const after = store.getState().project;
    const added = after.layout.pieces[after.layout.pieces.length - 1]!;
    expect(added.parent).toEqual({ piece: first.id, port: 0 });
    store.addPiece("buffer", undefined, { at: { x: 500, y: 300 } });
    const loose = store.getState().project.layout.pieces.at(-1)!;
    expect(loose.parent).toBeUndefined();
    expect(loose.at).toMatchObject({ x: 500, y: 300 });
  });

  it("puts a ready-made train in place of the old one", () => {
    const store = new Store(newProject("oval"));
    store.applyTrain("cyberbrick");
    const { project, selection } = store.getState();
    expect(project.vehicles[0]?.kind).toBe("cyberbrick");
    expect(selection.vehicle).toBe(project.vehicles[0]?.id);
  });
});

describe("sleepers, arches and filament", () => {
  let engine: Engine;
  beforeAll(async () => {
    engine = await createEngine();
  });
  const open = { doubleSided: true, connectorFit: 0.4, sleepers: true };
  const closed = { doubleSided: true, connectorFit: 0.4, sleepers: false };

  it.each(standardElements().map((e) => [e.id, e] as const))("%s with sleepers is a clean solid", (_, type) => {
    const part = engine.element(type, PLAIN, open);
    expect(part.status).toBe("NoError");
    expect(part.min[2]).toBeCloseTo(0, 3);
  });

  it("openings lie between the grooves and keep away from the ends", () => {
    const straight = makeElement("straight", { length: 144 });
    const gaps = sleeperGaps(straight);
    expect(gaps.length).toBeGreaterThanOrEqual(5);
    // the female end at 0 keeps its socket in solid track
    expect(Math.min(...gaps)).toBeGreaterThan(22);
    // a wall stays between an opening and the groove
    expect((GROOVE_SPACING - GROOVE_WIDTH) / 2 - SLEEPER_GAP_WIDTH / 2).toBeGreaterThanOrEqual(1.9);
    const withGaps = engine.element(straight, PLAIN, open);
    const without = engine.element(straight, PLAIN, closed);
    expect(withGaps.volume).toBeLessThan(without.volume - gaps.length * 100);
    // the outside stays: same width and height
    expect(withGaps.max[1] - withGaps.min[1]).toBeCloseTo(TRACK_WIDTH, 3);
    expect(withGaps.max[2]).toBeCloseTo(TRACK_HEIGHT, 3);
  });

  it("switches and crossings have no sleeper openings", () => {
    for (const id of ["switch-left", "yswitch", "crossing", "adapter-mm"]) expect(sleeperGaps(elements.find((e) => e.id === id)!)).toEqual([]);
  });

  it("arches end in a 45° point and need some height", () => {
    const arch = archOutline(0, 30, 3, 50)!;
    const top = arch.reduce((m, p) => (p[1] > m[1] ? p : m));
    expect(top).toEqual([15, 50]);
    expect(archOutline(0, 30, 3, 10)).toBeUndefined();
    // every edge of the top climbs at 45° or steeper: no overhang flatter than 45°
    for (let i = 0; i < arch.length; i++) {
      const [x0, y0] = arch[i]!;
      const [x1, y1] = arch[(i + 1) % arch.length]!;
      const goesOver = y0 > 3.01 && y1 > 3.01;
      if (goesOver && Math.abs(x1 - x0) > 1e-6) expect(Math.abs(y1 - y0) / Math.abs(x1 - x0)).toBeGreaterThan(0.99);
    }
  });

  it("the high ramp, the bridge and tall supports are opened up", () => {
    const ramp = elements.find((e) => e.id === "ramp-2")!;
    const part = engine.printElement(ramp, PLAIN, open);
    expect(part.status).toBe("NoError");
    // the side walls of a solid viaduct would be 2 × 3 mm × 216 mm × ~57 mm; the arches take much of it
    expect(part.material).toBeLessThan(part.volume);
    const tall = engine.support(76, false);
    const solid = 16 * (TRACK_WIDTH + 0.6 + 4.8) * 76;
    expect(tall.volume).toBeLessThan(solid * 0.7);
    expect(tall.status).toBe("NoError");
    expect(engine.printElement(elements.find((e) => e.id === "bridge")!, PLAIN, open).status).toBe("NoError");
  });

  it("estimates the printed material from walls, skins and infill", () => {
    // a 10 mm cube: top, bottom and four walls as shell, the rest sparse
    const cube = { positions: new Float32Array([0, 0, 0, 10, 0, 0, 10, 10, 0, 0, 10, 0, 0, 0, 10, 10, 0, 10, 10, 10, 10, 0, 10, 10]), indices: new Uint32Array([0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 1, 2, 6, 1, 6, 5, 2, 3, 7, 2, 7, 6, 3, 0, 4, 3, 4, 7]) };
    const shell = 100 * PRINT_TOP_SKIN + 100 * PRINT_BOTTOM_SKIN + 400 * PRINT_WALL;
    expect(printedMaterial(cube, 1000)).toBeCloseTo(shell + PRINT_INFILL * (1000 - shell), 1);
    // thin parts are printed solid: never more than the volume
    expect(printedMaterial(cube, 100)).toBe(100);
  });
});
