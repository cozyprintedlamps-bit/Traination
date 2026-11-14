// The plan seen from above (SVG): pieces, grooves, free ends, supports and buildings. It always
// shows the whole track (no zoom, no panning). Click a piece or building to select it, click a free
// end to build on it, drag a piece to move its whole group, drag a building to move it. Pieces
// dragged from the palette snap to the nearest free end.
import { useEffect, useMemo, useRef, useState } from "react";
import type { DragEvent, PointerEvent as ReactPointerEvent } from "react";
import { footprint } from "../core/buildings";
import type { Analysis } from "../core/layout";
import { rotate } from "../core/layout";
import type { Project } from "../core/project";
import { supports } from "../core/supports";
import { grooveLines, outline } from "../core/track";
import type { Selection } from "../app/store";
import { GROOVE_SPACING, PEG_HEAD_DIAMETER, SUPPORT_LENGTH, TRACK_WIDTH } from "../presets/gauge";
import { buildingName, tr } from "./i18n";
import { ELEMENT_DRAG, endId } from "./TrackTools";
import type { DropHit } from "./Viewer3D";

interface View {
  cx: number;
  cy: number;
  /** mm per pixel */
  scale: number;
}

interface Props {
  project: Project;
  analysis: Analysis;
  selection: Selection;
  target?: { piece: string; index: number };
  interactive: boolean;
  highlightElement?: string;
  onSelectPiece(id: string | undefined): void;
  onSelectPort(piece: string, index: number): void;
  onSelectBuilding(id: string): void;
  onDragStart(): void;
  onDrag(piece: string, dx: number, dy: number): void;
  onDragBuilding(id: string, dx: number, dy: number): void;
  /** a palette item was dropped onto the plan */
  onDropElement?(data: string, hit: DropHit): void;
}

type Pt = [number, number];
type Drag = { kind: "background" | "piece" | "building"; x: number; y: number; id?: string; moved: boolean };
/** A drop this close to a free end (pixels) goes to it. */
const DROP_REACH = 40;

export function PlanView(props: Props) {
  const { project, analysis, selection, target, interactive } = props;
  const host = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<[number, number]>([400, 300]);
  /** while something is dragged the view stays as it was, then it fits the plan again */
  const [frozen, setFrozen] = useState<View | null>(null);
  const drag = useRef<Drag | null>(null);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const update = () => setSize([Math.max(el.clientWidth, 50), Math.max(el.clientHeight, 50)]);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const typeOf = useMemo(() => new Map(project.elements.map((e) => [e.id, e])), [project.elements]);

  const shapes = useMemo(() => {
    return project.layout.pieces.flatMap((piece) => {
      const type = typeOf.get(piece.type);
      const pose = analysis.poses.get(piece.id);
      if (!type || !pose) return [];
      const place = ([x, y]: Pt): Pt => {
        const [rx, ry] = rotate(x, y, pose.rotation);
        return [rx + pose.x, ry + pose.y];
      };
      return [
        {
          piece,
          type,
          z: pose.z,
          polygons: outline(type, piece.variant).map((poly) => poly.map(place)),
          grooves: grooveLines(type, piece.variant, GROOVE_SPACING).map((line) => line.map(place)),
        },
      ];
    });
  }, [project.layout, typeOf, analysis]);

  const pillars = useMemo(() => supports(project.layout, project.elements, analysis), [project.layout, project.elements, analysis]);
  const houses = useMemo(() => project.buildings.map((b) => ({ b, corners: footprint(b) })), [project.buildings]);

  const bounds = useMemo(() => {
    let lo: Pt = [Infinity, Infinity];
    let hi: Pt = [-Infinity, -Infinity];
    const take = ([x, y]: Pt) => {
      lo = [Math.min(lo[0], x), Math.min(lo[1], y)];
      hi = [Math.max(hi[0], x), Math.max(hi[1], y)];
    };
    for (const s of shapes) for (const poly of s.polygons) poly.forEach(take);
    for (const h of houses) h.corners.forEach(take);
    if (!Number.isFinite(lo[0])) return { lo: [-200, -150] as Pt, hi: [200, 150] as Pt };
    return { lo, hi };
  }, [shapes, houses]);

  const fitted = (): View => {
    const w = bounds.hi[0] - bounds.lo[0] + 80;
    const h = bounds.hi[1] - bounds.lo[1] + 80;
    return { cx: (bounds.lo[0] + bounds.hi[0]) / 2, cy: (bounds.lo[1] + bounds.hi[1]) / 2, scale: Math.max(w / size[0], h / size[1], 0.2) };
  };
  const v = frozen ?? fitted();

  const toWorld = (clientX: number, clientY: number): Pt => {
    const rect = host.current?.getBoundingClientRect();
    const px = clientX - (rect?.left ?? 0);
    const py = clientY - (rect?.top ?? 0);
    return [v.cx + (px - size[0] / 2) * v.scale, v.cy - (py - size[1] / 2) * v.scale];
  };

  const start = (e: ReactPointerEvent, kind: Drag["kind"], id?: string) => {
    if (kind !== "background") e.stopPropagation();
    drag.current = { kind, x: e.clientX, y: e.clientY, ...(id ? { id } : {}), moved: false };
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
  };
  const onMove = (e: ReactPointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (!d.moved && Math.hypot(dx, dy) < 4) return;
    if (d.kind !== "background" && d.id && interactive) {
      if (!d.moved) {
        props.onDragStart();
        setFrozen(v);
      }
      if (d.kind === "piece") props.onDrag(d.id, dx * v.scale, -dy * v.scale);
      else props.onDragBuilding(d.id, dx * v.scale, -dy * v.scale);
    }
    d.moved = true;
    d.x = e.clientX;
    d.y = e.clientY;
  };
  const onUp = () => {
    const d = drag.current;
    drag.current = null;
    setFrozen(null);
    if (!d || d.moved) return;
    if (d.kind === "background") props.onSelectPiece(undefined);
    else if (d.kind === "piece" && d.id) props.onSelectPiece(d.id);
    else if (d.kind === "building" && d.id) props.onSelectBuilding(d.id);
  };

  const accepts = (e: DragEvent) => props.onDropElement !== undefined && e.dataTransfer.types.includes(ELEMENT_DRAG);
  const onDragOver = (e: DragEvent) => {
    if (!accepts(e)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  };
  const onDrop = (e: DragEvent) => {
    if (!accepts(e)) return;
    e.preventDefault();
    const [x, y] = toWorld(e.clientX, e.clientY);
    const near = analysis.open
      .map((p) => ({ p, d: Math.hypot(p.x - x, p.y - y) }))
      .filter((n) => n.d <= DROP_REACH * v.scale)
      .sort((a, b) => a.d - b.d)[0];
    props.onDropElement?.(e.dataTransfer.getData(ELEMENT_DRAG), near ? { marker: endId(near.p.piece, near.p.index) } : { ground: [x, y] });
  };

  const viewBox = `${v.cx - (size[0] / 2) * v.scale} ${-v.cy - (size[1] / 2) * v.scale} ${size[0] * v.scale} ${size[1] * v.scale}`;
  const flip = (p: Pt) => `${p[0]},${-p[1]}`;
  const overlapping = new Set(analysis.overlapping);
  const portR = PEG_HEAD_DIAMETER / 2;

  return (
    <div ref={host} className="plan" data-testid="plan" onDragOver={onDragOver} onDrop={onDrop}>
      <svg viewBox={viewBox} width={size[0]} height={size[1]} onPointerDown={(e) => start(e, "background")} onPointerMove={onMove} onPointerUp={onUp} role="img" aria-label={tr("plan.caption")}>
        {houses.map(({ b, corners }) => (
          <g
            key={b.id}
            className={`building${selection.building === b.id ? " selected" : ""}`}
            onPointerDown={(e) => start(e, "building", b.id)}
            onPointerMove={onMove}
            onPointerUp={onUp}
          >
            <polygon points={corners.map(flip).join(" ")} style={{ fill: b.colors.walls }} vectorEffect="non-scaling-stroke" />
            <text x={b.x} y={-b.y} fontSize={Math.max(8, Math.min(b.width, b.length) / 4)} textAnchor="middle" dominantBaseline="middle">
              {buildingName(b)}
            </text>
          </g>
        ))}
        {pillars.map((s, i) => {
          const corners: Pt[] = [
            [-SUPPORT_LENGTH / 2, -TRACK_WIDTH / 2 - 3],
            [SUPPORT_LENGTH / 2, -TRACK_WIDTH / 2 - 3],
            [SUPPORT_LENGTH / 2, TRACK_WIDTH / 2 + 3],
            [-SUPPORT_LENGTH / 2, TRACK_WIDTH / 2 + 3],
          ].map(([x, y]) => {
            const [rx, ry] = rotate(x as number, y as number, s.heading);
            return [rx + s.x, ry + s.y] as Pt;
          });
          return <polygon key={`s${i}`} className="support" points={corners.map(flip).join(" ")} vectorEffect="non-scaling-stroke" />;
        })}
        {shapes
          .slice()
          .sort((a, b) => a.z - b.z)
          .map((s) => {
            const selected = selection.piece === s.piece.id;
            const marked = props.highlightElement === s.type.id;
            const problem = overlapping.has(s.piece.id) ? "overlap" : "";
            return (
              <g key={s.piece.id} className={`piece${selected ? " selected" : ""}${marked ? " marked" : ""}${s.z > 0.5 ? " raised" : ""} ${problem}`} onPointerDown={(e) => start(e, "piece", s.piece.id)} onPointerMove={onMove} onPointerUp={onUp}>
                {s.polygons.map((poly, i) => (
                  <polygon key={i} points={poly.map(flip).join(" ")} style={{ fill: s.type.color }} vectorEffect="non-scaling-stroke" />
                ))}
                {s.grooves.map((line, i) => (
                  <polyline key={`g${i}`} className="groove" points={line.map(flip).join(" ")} vectorEffect="non-scaling-stroke" />
                ))}
              </g>
            );
          })}
        {analysis.joints
          .filter((j) => !j.fits)
          .map((j, i) => (
            <circle key={`bad${i}`} className="bad-joint" cx={j.a.x} cy={-j.a.y} r={portR * 1.4} vectorEffect="non-scaling-stroke" />
          ))}
        {analysis.open.map((p) => {
          const isTarget = target?.piece === p.piece && target.index === p.index;
          const [ox, oy] = rotate(portR + 3, 0, p.heading);
          return (
            <g
              key={`${p.piece}:${p.index}`}
              className={`port ${p.gender}${isTarget ? " target" : ""}`}
              data-testid="open-end"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                props.onSelectPort(p.piece, p.index);
              }}
            >
              <circle cx={p.x + ox} cy={-(p.y + oy)} r={portR * (isTarget ? 1.5 : 1.1)} vectorEffect="non-scaling-stroke" />
            </g>
          );
        })}
      </svg>
      {shapes.length === 0 && houses.length === 0 && <p className="plan-empty">{tr("plan.empty")}</p>}
    </div>
  );
}
