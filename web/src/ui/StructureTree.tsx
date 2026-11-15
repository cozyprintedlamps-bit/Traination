// The structure tree below the plan. It has three categories that are always there: the track
// pieces (in the order they hang together), the buildings and the vehicles of the train. Each one
// opens and closes on its own; all are closed at the start (the plan then fills the room). A click on
// a row selects the part (the plan marks it blue). Left is the colour field that opens the palette,
// right the bin. Colours and the bin work in the track step; in the other steps the tree only selects.
import { useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent, ReactNode } from "react";
import { useStore } from "../app/context";
import type { Selection, TreeGroup } from "../app/store";
import { TREE_GROUPS } from "../app/store";
import { pieceColor } from "../core/layout";
import type { Project } from "../core/project";
import { structureRows } from "../core/structure";
import { ColorPalette } from "./components";
import { Icon } from "./Icon";
import { buildingName, elementName, tr, vehicleName } from "./i18n";

interface Props {
  project: Project;
  selection: Selection;
  /** which categories are open (their parts show) */
  open: Readonly<Record<TreeGroup, boolean>>;
  onToggle(group: TreeGroup): void;
  /** colours and the bin are available */
  editable: boolean;
  onSelectPiece(id: string): void;
  onSelectBuilding(id: string): void;
  onSelectCar(id: string): void;
}

/** Indent per level below a branch (pixels). */
const INDENT = 14;

interface RowProps {
  depth: number;
  selected: boolean;
  color: string;
  number: number;
  label: string;
  editable: boolean;
  open: boolean;
  removeTitle: string;
  onSelect(): void;
  onToggleColor(): void;
  onRemove(): void;
  rowRef(element: HTMLElement | null): void;
  /** the palette below the row while it is open */
  palette: ReactNode;
}

function Row(p: RowProps) {
  const onKey = (e: KeyboardEvent) => {
    // buttons inside the row handle their own keys
    if (e.target !== e.currentTarget) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      p.onSelect();
    }
  };
  return (
    <>
      <div
        ref={p.rowRef}
        className={`tree-row${p.selected ? " selected" : ""}`}
        role="treeitem"
        aria-level={p.depth + 1}
        aria-selected={p.selected}
        tabIndex={0}
        data-testid="tree-row"
        style={{ paddingLeft: 6 + p.depth * INDENT }}
        onClick={p.onSelect}
        onKeyDown={onKey}
      >
        {p.editable ? (
          <button type="button" className="tree-chip" data-testid="tree-color" style={{ background: p.color }} title={tr("color.pick")} aria-label={`${tr("color.pick")}: ${p.label}`} aria-expanded={p.open} onClick={p.onToggleColor} />
        ) : (
          <span className="tree-chip" style={{ background: p.color }} />
        )}
        <span className="tree-no">{p.number}</span>
        <span className="tree-name">{p.label}</span>
        {p.editable && (
          <button
            type="button"
            className="tree-trash"
            data-testid="tree-remove"
            title={p.removeTitle}
            aria-label={`${p.removeTitle}: ${p.label}`}
            onClick={(e) => {
              e.stopPropagation();
              p.onRemove();
            }}
          >
            <Icon name="trash" />
          </button>
        )}
      </div>
      {p.open && <div className="tree-palette">{p.palette}</div>}
    </>
  );
}

/** One category: its header is always there, its parts show while it is open. */
function Category({ group, count, open, onToggle, children }: { group: TreeGroup; count: number; open: boolean; onToggle(): void; children: ReactNode }) {
  const label = tr(`tree.${group}`, { n: count });
  return (
    <section className={`tree-section${open ? " open" : ""}`} data-testid={`tree-section-${group}`}>
      <button type="button" className="tree-group" data-testid={`tree-group-${group}`} aria-expanded={open} aria-controls={`tree-${group}`} onClick={onToggle}>
        <span className={`tree-fold${open ? "" : " folded"}`}>
          <Icon name="chevron" />
        </span>
        {label}
      </button>
      {open && (
        <div id={`tree-${group}`} className="tree" role="tree" aria-label={label} data-testid={`tree-${group}`}>
          {count === 0 ? <p className="muted small tree-empty">{tr(`tree.empty_${group}`)}</p> : children}
        </div>
      )}
    </section>
  );
}

export function StructureTree({ project, selection, open, onToggle, editable, onSelectPiece, onSelectBuilding, onSelectCar }: Props) {
  const store = useStore();
  /** the row whose palette is open */
  const [coloring, setColoring] = useState<string | undefined>();
  const rows = useRef(new Map<string, HTMLElement>());

  const typeOf = useMemo(() => new Map(project.elements.map((e) => [e.id, e])), [project.elements]);
  const list = useMemo(() => structureRows(project.layout), [project.layout]);
  const selectedKey = selection.piece ? `p:${selection.piece}` : selection.building ? `b:${selection.building}` : selection.car ? `v:${selection.car}` : undefined;

  // a click in the plan: bring the row into view (when its category is open)
  useEffect(() => {
    if (selectedKey) rows.current.get(selectedKey)?.scrollIntoView?.({ block: "nearest" });
  }, [selectedKey, open]);
  // the palette belongs to a row that may be gone or hidden
  useEffect(() => {
    if (!editable) setColoring(undefined);
  }, [editable]);

  const toggleColor = (key: string) => setColoring((now) => (now === key ? undefined : key));
  const rowRef = (key: string) => (el: HTMLElement | null) => {
    if (el) rows.current.set(key, el);
    else rows.current.delete(key);
  };
  const counts: Record<TreeGroup, number> = { track: list.length, buildings: project.buildings.length, trains: project.vehicles.length };

  return (
    <div className="tree-box" role="group" aria-label={tr("tree.title")} data-testid="tree-box">
      {TREE_GROUPS.map((group) => (
        <Category key={group} group={group} count={counts[group]} open={open[group]} onToggle={() => onToggle(group)}>
          {open.track && group === "track" &&
            list.map((row) => {
              const { piece } = row;
              const type = typeOf.get(piece.type);
              const key = `p:${piece.id}`;
              const color = type ? pieceColor(piece, type) : (piece.color ?? "#8E9089");
              return (
                <Row
                  key={piece.id}
                  depth={row.depth}
                  selected={selection.piece === piece.id}
                  color={color}
                  number={row.number}
                  label={type ? elementName(type, piece.variant) : tr("tree.unknown")}
                  editable={editable}
                  open={coloring === key}
                  removeTitle={row.followers > 0 ? tr("tree.remove_many", { n: row.followers }) : tr("tree.remove")}
                  onSelect={() => onSelectPiece(piece.id)}
                  onToggleColor={() => toggleColor(key)}
                  onRemove={() => store.removePiece(piece.id)}
                  rowRef={rowRef(key)}
                  palette={
                    <ColorPalette
                      value={color}
                      onPick={(hex) => {
                        store.setPieceColor(piece.id, hex);
                        setColoring(undefined);
                      }}
                    >
                      {piece.color && type && (
                        <button
                          type="button"
                          className="button small"
                          onClick={() => {
                            store.setPieceColor(piece.id, undefined);
                            setColoring(undefined);
                          }}
                        >
                          {tr("tree.type_color")}
                        </button>
                      )}
                    </ColorPalette>
                  }
                />
              );
            })}

          {open.buildings && group === "buildings" &&
            project.buildings.map((b, i) => {
              const key = `b:${b.id}`;
              return (
                <Row
                  key={b.id}
                  depth={0}
                  selected={selection.building === b.id}
                  color={b.colors.walls}
                  number={i + 1}
                  label={buildingName(b)}
                  editable={editable}
                  open={coloring === key}
                  removeTitle={tr("tree.remove")}
                  onSelect={() => onSelectBuilding(b.id)}
                  onToggleColor={() => toggleColor(key)}
                  onRemove={() => store.removeBuilding(b.id)}
                  rowRef={rowRef(key)}
                  palette={
                    <ColorPalette
                      value={b.colors.walls}
                      onPick={(hex) => {
                        store.changeBuilding(b.id, { colors: { ...b.colors, walls: hex } });
                        setColoring(undefined);
                      }}
                    />
                  }
                />
              );
            })}

          {open.trains && group === "trains" &&
            project.vehicles.map((v, i) => {
              const key = `v:${v.id}`;
              return (
                <Row
                  key={v.id}
                  depth={0}
                  selected={selection.car === v.id}
                  color={v.colors.body}
                  number={i + 1}
                  label={vehicleName(v)}
                  editable={editable}
                  open={coloring === key}
                  removeTitle={tr("tree.remove")}
                  onSelect={() => onSelectCar(v.id)}
                  onToggleColor={() => toggleColor(key)}
                  onRemove={() => store.removeVehicle(v.id)}
                  rowRef={rowRef(key)}
                  palette={
                    <ColorPalette
                      value={v.colors.body}
                      onPick={(hex) => {
                        store.changeVehicle(v.id, (x) => ({ ...x, colors: { ...x.colors, body: hex } }));
                        setColoring(undefined);
                      }}
                    />
                  }
                />
              );
            })}
        </Category>
      ))}
    </div>
  );
}
