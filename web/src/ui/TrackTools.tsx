// Building track in the 3D view and the plan: palette items can be dragged in, the free ends get
// a "+" that opens a small menu of pieces.
import { useEffect, useRef } from "react";
import type { DragEvent } from "react";
import type { Analysis } from "../core/layout";
import type { ElementType } from "../core/track";
import { TRACK_HEIGHT } from "../presets/gauge";
import { KindIcon } from "./Icon";
import { elementName, tr } from "./i18n";
import type { DropHit, Marker } from "./Viewer3D";

/** Drag data type of a palette item. */
export const ELEMENT_DRAG = "application/x-traination-element";

export interface ElementDrop {
  type: string;
  turn?: "left" | "right";
}

export function startElementDrag(e: DragEvent, type: string, turn?: "left" | "right"): void {
  e.stopPropagation();
  const data: ElementDrop = { type, ...(turn ? { turn } : {}) };
  e.dataTransfer.setData(ELEMENT_DRAG, JSON.stringify(data));
  e.dataTransfer.effectAllowed = "copy";
}

export function readElementDrop(text: string): ElementDrop | undefined {
  try {
    const data = JSON.parse(text) as Partial<ElementDrop>;
    return typeof data.type === "string" ? { type: data.type, ...(data.turn === "left" || data.turn === "right" ? { turn: data.turn } : {}) } : undefined;
  } catch {
    return undefined;
  }
}

/** Marker ids of free ends: piece id and port index. */
export const endId = (piece: string, index: number) => `${piece}:${index}`;
export function parseEnd(id: string): { piece: string; index: number } | undefined {
  const at = id.lastIndexOf(":");
  const index = Number(id.slice(at + 1));
  return at > 0 && Number.isInteger(index) ? { piece: id.slice(0, at), index } : undefined;
}

/** A "+" a little beyond every free end, above the track. */
export function endMarkers(analysis: Analysis, target?: { piece: string; index: number }): Marker[] {
  return analysis.open.map((p) => {
    const out = 16;
    const rad = (p.heading * Math.PI) / 180;
    return {
      id: endId(p.piece, p.index),
      x: p.x + Math.cos(rad) * out,
      y: p.y + Math.sin(rad) * out,
      z: p.z + TRACK_HEIGHT + 6,
      title: tr("view.add_here"),
      active: target?.piece === p.piece && target.index === p.index,
    };
  });
}

/** Turns a drop into a place for the store: a free end, or a point on the bed. */
export function dropPlace(hit: DropHit): { end?: { piece: string; index: number }; at?: { x: number; y: number } } {
  const end = hit.marker ? parseEnd(hit.marker) : undefined;
  if (end) return { end };
  return hit.ground ? { at: { x: hit.ground[0], y: hit.ground[1] } } : {};
}

const handed = (t: ElementType) => t.kind === "curve";

/** The menu of pieces at a "+": one click adds the piece there. */
export function PieceMenu({ elements, at, onPick, onClose }: { elements: ElementType[]; at: { left: number; top: number }; onPick(type: string, turn?: "left" | "right"): void; onClose(): void }) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const away = (e: PointerEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) onClose();
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("pointerdown", away, true);
    window.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("pointerdown", away, true);
      window.removeEventListener("keydown", key);
    };
  }, [onClose]);
  // keep the menu inside the view
  const style = { left: `min(${at.left + 14}px, calc(100% - 314px))`, top: `max(8px, min(${at.top - 20}px, calc(100% - 340px)))` };
  return (
    <div ref={box} className="piece-menu panel" style={style} role="menu" data-testid="piece-menu">
      <header className="piece-menu-head">
        <span className="strong small">{tr("view.menu_title")}</span>
        <button type="button" className="button small ghost" onClick={onClose} aria-label={tr("view.close")}>
          ×
        </button>
      </header>
      <div className="piece-menu-list">
        {elements.map((t) =>
          handed(t) ? (
            <div key={t.id} className="piece-menu-row">
              <span className="palette-icon" style={{ color: t.color }}>
                <KindIcon kind={t.kind} />
              </span>
              <span className="piece-menu-name">{elementName(t)}</span>
              <button type="button" role="menuitem" className="button small" onClick={() => onPick(t.id, "left")}>
                ↶ {tr("track.left")}
              </button>
              <button type="button" role="menuitem" className="button small" onClick={() => onPick(t.id, "right")}>
                {tr("track.right")} ↷
              </button>
            </div>
          ) : (
            <button key={t.id} type="button" role="menuitem" className="piece-menu-row piece-menu-item" onClick={() => onPick(t.id)}>
              <span className="palette-icon" style={{ color: t.color }}>
                <KindIcon kind={t.kind} />
              </span>
              <span className="piece-menu-name">{elementName(t)}</span>
            </button>
          ),
        )}
      </div>
    </div>
  );
}
