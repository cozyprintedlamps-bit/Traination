// The structure tree below the plan: its rows, and the own colour of a piece.
import { describe, expect, it } from "vitest";
import { Store } from "../src/app/store";
import { partsList, pieceColor, removePiece } from "../src/core/layout";
import type { Layout, Piece } from "../src/core/layout";
import { deserialize, newProject, serialize, TEMPLATES, templateLayout } from "../src/core/project";
import { structureRows } from "../src/core/structure";
import { PLAIN, standardElements } from "../src/core/track";

const elements = standardElements();
const piece = (id: string, parent?: string): Piece => ({ id, type: "straight-144", variant: PLAIN, port: 0, ...(parent ? { parent: { piece: parent, port: 1 } } : { at: { x: 0, y: 0, rotation: 0 } }) });

describe("structure rows", () => {
  it("a loop is one flat chain, numbered in order", () => {
    const layout = templateLayout("oval", elements);
    const rows = structureRows(layout);
    expect(rows).toHaveLength(layout.pieces.length);
    expect(rows.every((r) => r.depth === 0)).toBe(true);
    expect(rows.map((r) => r.number)).toEqual(rows.map((_, i) => i + 1));
    expect(rows.map((r) => r.followers)).toEqual(rows.map((_, i) => rows.length - 1 - i));
  });

  it("goes one level down only where the track branches", () => {
    const layout: Layout = { pieces: [piece("a"), piece("b", "a"), piece("c", "a"), piece("d", "b"), piece("e", "d")] };
    expect(structureRows(layout).map((r) => [r.piece.id, r.depth])).toEqual([
      ["a", 0],
      ["b", 1],
      ["d", 1],
      ["e", 1],
      ["c", 1],
    ]);
  });

  it("every piece shows once, loose pieces and pieces whose parent is gone start a chain", () => {
    const layout: Layout = { pieces: [piece("a"), piece("b", "a"), piece("loose"), piece("orphan", "missing")] };
    const rows = structureRows(layout);
    expect(rows.map((r) => r.piece.id).sort()).toEqual(["a", "b", "loose", "orphan"]);
    expect(rows.filter((r) => r.depth === 0)).toHaveLength(4);
  });

  it("the followers are what the bin removes with the piece, in every template", () => {
    for (const id of TEMPLATES) {
      const layout = templateLayout(id, elements);
      for (const row of structureRows(layout)) {
        const removed = layout.pieces.length - removePiece(layout, row.piece.id).pieces.length;
        expect(removed, `${id} ${row.piece.id}`).toBe(1 + row.followers);
      }
    }
  });

  it("a very long chain is no problem", () => {
    const pieces = [piece("p0")];
    for (let i = 1; i < 20000; i++) pieces.push(piece(`p${i}`, `p${i - 1}`));
    const rows = structureRows({ pieces });
    expect(rows).toHaveLength(20000);
    expect(rows[0]!.followers).toBe(19999);
    expect(rows[19999]!.piece.id).toBe("p19999");
  });
});

describe("own colour of a piece", () => {
  const first = (store: Store) => store.getState().project.layout.pieces[0]!;

  it("colours one piece, not its type, and goes back to the type's colour", () => {
    const store = new Store(newProject("oval"));
    const { pieces } = store.getState().project.layout;
    const [a, b] = [pieces[0]!, pieces[1]!];
    store.setPieceColor(a.id, "#C12E1F");
    const project = store.getState().project;
    const type = project.elements.find((e) => e.id === a.type)!;
    expect(pieceColor(project.layout.pieces[0]!, type)).toBe("#C12E1F");
    expect(pieceColor(project.layout.pieces[1]!, project.elements.find((e) => e.id === b.type)!)).toBe(type.color);
    expect(type.color).not.toBe("#C12E1F");
    store.setPieceColor(a.id, undefined);
    expect("color" in first(store)).toBe(false);
  });

  it("the colour of the type is no own colour; undo brings the colour back", () => {
    const store = new Store(newProject("oval"));
    const a = first(store);
    const typeColor = store.getState().project.elements.find((e) => e.id === a.type)!.color;
    store.setPieceColor(a.id, "#C12E1F");
    store.setPieceColor(a.id, typeColor.toLowerCase());
    expect("color" in first(store)).toBe(false);
    store.undo();
    expect(first(store).color).toBe("#C12E1F");
  });

  it("the parts list counts pieces of one type apart by colour", () => {
    const store = new Store(newProject("oval"));
    const straight = store.getState().project.layout.pieces.find((p) => p.type === "straight-144")!;
    const before = partsList(store.getState().project.layout, store.getState().project.elements, true);
    store.setPieceColor(straight.id, "#C12E1F");
    const { layout, elements: types } = store.getState().project;
    const after = partsList(layout, types, true).filter((p) => p.type === "straight-144");
    expect(after.map((p) => p.count).sort()).toEqual([1, before.find((p) => p.type === "straight-144")!.count - 1].sort());
    expect(after.find((p) => p.color === "#C12E1F")?.count).toBe(1);
  });

  it("is saved with the project; a broken colour is dropped", () => {
    const store = new Store(newProject("oval"));
    const a = first(store);
    store.setPieceColor(a.id, "#C12E1F");
    const loaded = deserialize(serialize(store.getState().project));
    expect(loaded.layout.pieces[0]!.color).toBe("#C12E1F");
    expect("color" in loaded.layout.pieces[1]!).toBe(false);

    const broken = JSON.parse(serialize(store.getState().project));
    broken.layout.pieces[1].color = "red";
    broken.layout.pieces[2].color = 12;
    const fixed = deserialize(JSON.stringify(broken));
    expect(fixed.layout.pieces[0]!.color).toBe("#C12E1F");
    expect("color" in fixed.layout.pieces[1]!).toBe(false);
    expect("color" in fixed.layout.pieces[2]!).toBe(false);
  });
});
