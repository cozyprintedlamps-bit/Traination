// The 3D view as a component: owns a canvas and a SceneView. Optional markers ("+" buttons at
// points of the scene) follow the camera; dropped items land on the nearest marker or the bed.
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { DragEvent, ReactNode } from "react";
import { SceneView } from "./SceneView";
import type { ScenePart } from "./SceneView";
import { tr } from "./i18n";

export interface Marker {
  id: string;
  /** position in the scene (mm) */
  x: number;
  y: number;
  z: number;
  title: string;
  /** drawn stronger (the end new pieces go to) */
  active?: boolean;
}

/** What a drop hit: the nearest marker (within reach) or a point on the bed. */
export interface DropHit {
  marker?: string;
  ground?: [number, number];
}

interface Props {
  parts: ScenePart[];
  fitKey: string;
  busy: boolean;
  error?: string;
  markers?: Marker[];
  /** a marker was clicked; `at` is its place in the view (pixels from the top left) */
  onMarker?(id: string, at: { left: number; top: number }): void;
  /** drag data type the view accepts */
  dropType?: string;
  onDrop?(data: string, hit: DropHit): void;
  /** overlays drawn above the canvas (menus) */
  children?: ReactNode;
  /** pixels on the right covered by a panel (the plan) */
  insetRight?: number;
}

/** A drop this close to a marker (pixels) goes to it. */
const DROP_REACH = 110;

export function Viewer3D({ parts, fitKey, busy, error, markers = [], onMarker, dropType, onDrop, children, insetRight = 0 }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const view = useRef<SceneView | null>(null);
  const fitted = useRef<string>("");
  const buttons = useRef(new Map<string, HTMLButtonElement>());
  const markerList = useRef<Marker[]>(markers);
  const [failed, setFailed] = useState(false);
  const [hover, setHover] = useState<string | undefined>();
  markerList.current = markers;

  /** Moves the marker buttons to where their points are seen now. */
  const place = () => {
    const scene = view.current;
    if (!scene) return;
    for (const m of markerList.current) {
      const button = buttons.current.get(m.id);
      if (!button) continue;
      const p = scene.toScreen(m.x, m.y, m.z);
      button.style.transform = `translate(${p.x}px, ${p.y}px) translate(-50%, -50%)`;
      button.style.visibility = p.visible ? "visible" : "hidden";
    }
  };

  useEffect(() => {
    const element = canvas.current;
    const container = host.current;
    if (!element || !container) return;
    let scene: SceneView;
    try {
      scene = new SceneView(element);
    } catch {
      setFailed(true);
      return;
    }
    view.current = scene;
    scene.onRender = place;
    const resize = () => scene.resize(container.clientWidth, container.clientHeight);
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(container);
    return () => {
      observer.disconnect();
      scene.dispose();
      view.current = null;
      fitted.current = "";
    };
    // place reads refs only
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const scene = view.current;
    if (!scene) return;
    scene.setParts(parts);
    // look at everything again when the step or the subject changes
    if (parts.length > 0 && fitted.current !== fitKey) {
      scene.fit();
      fitted.current = fitKey;
    }
  }, [parts, fitKey]);

  useEffect(() => view.current?.setInsetRight(insetRight), [insetRight]);

  // new markers: put them in place before the browser paints
  useLayoutEffect(place, [markers, parts]);

  const local = (e: { clientX: number; clientY: number }) => {
    const rect = host.current?.getBoundingClientRect();
    return { x: e.clientX - (rect?.left ?? 0), y: e.clientY - (rect?.top ?? 0) };
  };
  const nearest = (x: number, y: number): string | undefined => {
    const scene = view.current;
    if (!scene) return undefined;
    let best: { id: string; d: number } | undefined;
    for (const m of markerList.current) {
      const p = scene.toScreen(m.x, m.y, m.z);
      if (!p.visible) continue;
      const d = Math.hypot(p.x - x, p.y - y);
      if (d <= DROP_REACH && (!best || d < best.d)) best = { id: m.id, d };
    }
    return best?.id;
  };
  const accepts = (e: DragEvent) => dropType !== undefined && e.dataTransfer.types.includes(dropType);
  const onDragOver = (e: DragEvent) => {
    if (!accepts(e)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    const p = local(e);
    setHover(nearest(p.x, p.y));
  };
  const onDropHere = (e: DragEvent) => {
    if (!accepts(e) || !dropType) return;
    e.preventDefault();
    setHover(undefined);
    const p = local(e);
    const marker = nearest(p.x, p.y);
    const ground = marker ? undefined : view.current?.toGround(p.x, p.y);
    onDrop?.(e.dataTransfer.getData(dropType), { ...(marker ? { marker } : {}), ...(ground ? { ground } : {}) });
  };

  return (
    <div
      ref={host}
      className={`viewer${hover ? " dropping" : ""}`}
      data-testid="viewer"
      data-state={busy ? "busy" : "idle"}
      data-parts={parts.length}
      onDragOver={onDragOver}
      onDragLeave={() => setHover(undefined)}
      onDrop={onDropHere}
    >
      <canvas ref={canvas} />
      {markers.map((m) => (
        <button
          key={m.id}
          type="button"
          ref={(el) => {
            if (el) buttons.current.set(m.id, el);
            else buttons.current.delete(m.id);
          }}
          className={`marker${m.active ? " active" : ""}${hover === m.id ? " hover" : ""}`}
          data-testid="end-plus"
          title={m.title}
          aria-label={m.title}
          onClick={(e) => {
            const p = local(e);
            onMarker?.(m.id, { left: p.x, top: p.y });
          }}
        >
          +
        </button>
      ))}
      {children}
      {failed && <p className="viewer-note">{tr("view.no_webgl")}</p>}
      {!failed && busy && parts.length === 0 && <p className="viewer-note">{tr("view.loading")}</p>}
      {error && <p className="viewer-note error">{tr("view.error", { error })}</p>}
    </div>
  );
}
