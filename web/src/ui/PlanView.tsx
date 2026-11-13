// The plan seen from above (SVG): pieces, grooves and free ends. Click a piece to select it, click
// a free end to build on it, drag a piece to move its whole group, drag the background to pan,
// wheel to zoom.
import { useEffect, useMemo, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import type { Analysis } from "../core/layout";
import { rotate } from "../core/layout";
import type { Project } from "../core/project";
import { grooveLines, outline } from "../core/track";
import type { Selection } from "../app/store";
import { GROOVE_SPACING, PEG_HEAD_DIAMETER } from "../presets/gauge";
import { tr } from "./i18n";

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
  onDragStart(piece: string): void;
  onDrag(piece: string, dx: number, dy: number): void;
}

type Pt = [number, number];

export function PlanView(props: Props) {
  const { project, analysis, selection, target, interactive } = props;
  const host = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<[number, number]>([400, 300]);
  const [view, setView] = useState<View | null>(null);
  const drag = useRef<{ kind: "pan" | "piece"; x: number; y: number; piece?: string; moved: boolean } | null>(null);

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

  const bounds = useMemo(() => {
    let lo: Pt = [Infinity, Infinity];
    let hi: Pt = [-Infinity, -Infinity];
    for (const s of shapes) for (const poly of s.polygons) for (const [x, y] of poly) {
      lo = [Math.min(lo[0], x), Math.min(lo[1], y)];
      hi = [Math.max(hi[0], x), Math.max(hi[1], y)];
    }
    if (!Number.isFinite(lo[0])) return { lo: [-200, -150] as Pt, hi: [200, 150] as Pt };
    return { lo, hi };
  }, [shapes]);

  const fitted = (): View => {
    const w = bounds.hi[0] - bounds.lo[0] + 80;
    const h = bounds.hi[1] - bounds.lo[1] + 80;
    return { cx: (bounds.lo[0] + bounds.hi[0]) / 2, cy: (bounds.lo[1] + bounds.hi[1]) / 2, scale: Math.max(w / size[0], h / size[1], 0.2) };
  };
  // fit when the plan first gets pieces or the box grows beyond the view
  const fitKey = `${shapes.length === 0}`;
  useEffect(() => setView(null), [fitKey]);
  const v = view ?? fitted();

  const toWorld = (clientX: number, clientY: number): Pt => {
    const rect = host.current?.getBoundingClientRect();
    const px = clientX - (rect?.left ?? 0);
    const py = clientY - (rect?.top ?? 0);
    return [v.cx + (px - size[0] / 2) * v.scale, v.cy - (py - size[1] / 2) * v.scale];
  };

  const onWheel = (e: React.WheelEvent) => {
    const [wx, wy] = toWorld(e.clientX, e.clientY);
    const factor = Math.exp(e.deltaY * 0.0015);
    const scale = Math.min(Math.max(v.scale * factor, 0.05), 20);
    // keep the point under the mouse in place
    setView({ cx: wx - (wx - v.cx) * (scale / v.scale), cy: wy - (wy - v.cy) * (scale / v.scale), scale });
  };

  const startPan = (e: ReactPointerEvent) => {
    drag.current = { kind: "pan", x: e.clientX, y: e.clientY, moved: false };
    (e.target as Element).setPointerCapture?.(e.pointerId);
  };
  const startPiece = (e: ReactPointerEvent, piece: string) => {
    e.stopPropagation();
    drag.current = { kind: "piece", x: e.clientX, y: e.clientY, piece, moved: false };
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
  };
  const onMove = (e: ReactPointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (!d.moved && Math.hypot(dx, dy) < 4) return;
    if (d.kind === "pan") {
      setView({ ...v, cx: v.cx - dx * v.scale, cy: v.cy + dy * v.scale });
    } else if (d.piece && interactive) {
      if (!d.moved) props.onDragStart(d.piece);
      props.onDrag(d.piece, dx * v.scale, -dy * v.scale);
    }
    d.moved = true;
    d.x = e.clientX;
    d.y = e.clientY;
  };
  const onUp = () => {
    const d = drag.current;
    drag.current = null;
    if (!d || d.moved) return;
    if (d.kind === "pan") props.onSelectPiece(undefined);
    else if (d.piece) props.onSelectPiece(d.piece);
  };

  const viewBox = `${v.cx - (size[0] / 2) * v.scale} ${-v.cy - (size[1] / 2) * v.scale} ${size[0] * v.scale} ${size[1] * v.scale}`;
  const flip = (p: Pt) => `${p[0]},${-p[1]}`;
  const overlapping = new Set(analysis.overlapping);
  const floating = new Set(analysis.floating);
  const portR = PEG_HEAD_DIAMETER / 2;

  return (
    <div ref={host} className="plan" data-testid="plan" onWheel={onWheel}>
      <svg viewBox={viewBox} width={size[0]} height={size[1]} onPointerDown={startPan} onPointerMove={onMove} onPointerUp={onUp} role="img" aria-label={tr("plan.caption")}>
        {shapes
          .slice()
          .sort((a, b) => a.z - b.z)
          .map((s) => {
            const selected = selection.piece === s.piece.id;
            const marked = props.highlightElement === s.type.id;
            const problem = overlapping.has(s.piece.id) ? "overlap" : floating.has(s.piece.id) ? "floating" : "";
            return (
              <g key={s.piece.id} className={`piece${selected ? " selected" : ""}${marked ? " marked" : ""} ${problem}`} onPointerDown={(e) => startPiece(e, s.piece.id)} onPointerMove={onMove} onPointerUp={onUp}>
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
              onPointerDown={(e) => {
                e.stopPropagation();
              }}
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
      {shapes.length === 0 && <p className="plan-empty">{tr("plan.empty")}</p>}
    </div>
  );
}
