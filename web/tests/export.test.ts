import { unzipSync, strFromU8 } from "fflate";
import { beforeAll, describe, expect, it } from "vitest";
import { newProject, deserialize, serialize } from "../src/core/project";
import { createEngine } from "../src/geometry/engine";
import type { Engine } from "../src/geometry/engine";
import { pack, writeFiles } from "../src/export/plates";
import { trackItems, vehicleItems } from "../src/export/printItems";
import type { Names } from "../src/export/printItems";
import { printerById } from "../src/presets/print";

let engine: Engine;
beforeAll(async () => {
  engine = await createEngine();
});

const names: Names = {
  element: (t, v) => `${t.id}${v.mirror ? "-m" : ""}${v.swap ? "-s" : ""}`,
  vehicle: (v, i) => `${v.kind}${i + 1}`,
  building: (b, i) => `${b.kind}${i + 1}`,
  part: (p) => p,
};

describe("print beds", () => {
  it("every part lies inside the bed, parts of one bed do not overlap", async () => {
    const project = newProject("siding");
    const printer = printerById("p1s");
    const items = [...(await trackItems(project, engine, names)), ...(await vehicleItems(project, engine, names))];
    const packing = pack(items, printer.bed);
    expect(packing.tooBig).toEqual([]);
    const total = items.reduce((n, i) => n + i.count, 0);
    expect(packing.placed).toHaveLength(total);
    for (const p of packing.placed) {
      expect(Math.abs(p.offset[0]) + p.size[0] / 2).toBeLessThanOrEqual(printer.bed[0] / 2);
      expect(Math.abs(p.offset[1]) + p.size[1] / 2).toBeLessThanOrEqual(printer.bed[1] / 2);
    }
    for (const a of packing.placed) {
      for (const b of packing.placed) {
        if (a === b || a.plate !== b.plate) continue;
        const apart = Math.abs(a.offset[0] - b.offset[0]) >= (a.size[0] + b.size[0]) / 2 - 1e-6 || Math.abs(a.offset[1] - b.offset[1]) >= (a.size[1] + b.size[1]) / 2 - 1e-6;
        expect(apart).toBe(true);
      }
    }
  });

  it("writes 3MF files with at most four plates and the colours of the parts", async () => {
    const project = newProject("oval");
    const printer = printerById("p1s");
    const items = await trackItems(project, engine, names);
    const packing = pack(items, printer.bed);
    const files = writeFiles(packing, "track", printer);
    expect(files.length).toBe(Math.ceil(packing.plates / 4));
    for (const file of files) {
      expect(file.plates).toBeLessThanOrEqual(4);
      const zip = unzipSync(file.data);
      expect(Object.keys(zip)).toContain("3D/3dmodel.model");
      const settings = JSON.parse(strFromU8(zip["Metadata/project_settings.config"]!));
      expect(settings.filament_colour).toContain(project.elements[0]!.color.toUpperCase());
      expect(settings.printer_settings_id).toBe(printer.preset);
    }
  });

  it("a part larger than the bed is reported", async () => {
    const project = newProject("empty");
    const big = { ...project.elements[0]!, id: "big", length: 400 };
    const part = engine.printElement(big, { mirror: false, swap: false }, { doubleSided: true, connectorFit: 0.4 });
    const packing = pack([{ name: "big", color: "#FFFFFF", part, count: 1 }], printerById("a1mini").bed);
    expect(packing.tooBig).toHaveLength(1);
  });
});

describe("project files", () => {
  it("survive a round trip", () => {
    const project = newProject("hill");
    const back = deserialize(serialize(project));
    expect(back).toEqual(project);
  });

  it("fill in missing fields and reject other files", () => {
    const back = deserialize(JSON.stringify({ schema: 1, vehicles: [{ kind: "box" }] }));
    expect(back.vehicles[0]!.design.windows).toBe(true);
    expect(() => deserialize("nope")).toThrow();
    expect(() => deserialize(JSON.stringify({ schema: 99 }))).toThrow();
  });
});
