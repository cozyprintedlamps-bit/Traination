// The structure tree of the plan: every piece once, in the order it hangs together. A chain of
// pieces (each with one follower) stays on one level, so a loop of 40 pieces is a flat list; the
// level goes down only where the track branches (a switch has two followers).
import type { Layout, Piece } from "./layout";

export interface StructureRow {
  piece: Piece;
  /** 0 for a piece that starts a chain of its own, +1 below every branch */
  depth: number;
  /** 1, 2, 3 … in the order of the rows */
  number: number;
  /** pieces that hang behind this one (they are removed with it) */
  followers: number;
}

/** The rows of the tree. Walks the plan without recursion, so a very long chain is no problem. */
export function structureRows(layout: Layout): StructureRow[] {
  const byId = new Map(layout.pieces.map((p) => [p.id, p]));
  const children = new Map<string, Piece[]>();
  const roots: Piece[] = [];
  for (const piece of layout.pieces) {
    if (piece.parent && byId.has(piece.parent.piece)) {
      const list = children.get(piece.parent.piece) ?? [];
      list.push(piece);
      children.set(piece.parent.piece, list);
    } else roots.push(piece);
  }

  // depth first, first follower first: the stack holds the pieces still to visit
  const rows: StructureRow[] = [];
  const seen = new Set<string>();
  const stack = roots.map((piece) => ({ piece, depth: 0 })).reverse();
  while (stack.length > 0) {
    const { piece, depth } = stack.pop() as { piece: Piece; depth: number };
    if (seen.has(piece.id)) continue;
    seen.add(piece.id);
    rows.push({ piece, depth, number: rows.length + 1, followers: 0 });
    const next = children.get(piece.id) ?? [];
    const below = next.length > 1 ? depth + 1 : depth;
    for (let i = next.length - 1; i >= 0; i--) stack.push({ piece: next[i] as Piece, depth: below });
  }

  // followers: every piece counts for all pieces it hangs on (walk back through the rows)
  const count = new Map<string, number>();
  for (let i = rows.length - 1; i >= 0; i--) {
    const row = rows[i] as StructureRow;
    let n = 0;
    for (const child of children.get(row.piece.id) ?? []) n += 1 + (count.get(child.id) ?? 0);
    count.set(row.piece.id, n);
    row.followers = n;
  }
  return rows;
}
