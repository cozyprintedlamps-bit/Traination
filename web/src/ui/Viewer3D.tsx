// The 3D view as a component: owns a canvas and a SceneView.
import { useEffect, useRef, useState } from "react";
import { SceneView } from "./SceneView";
import type { ScenePart } from "./SceneView";
import { tr } from "./i18n";

export function Viewer3D({ parts, fitKey, busy, error }: { parts: ScenePart[]; fitKey: string; busy: boolean; error?: string }) {
  const host = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const view = useRef<SceneView | null>(null);
  const fitted = useRef<string>("");
  const [failed, setFailed] = useState(false);

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

  return (
    <div ref={host} className="viewer" data-testid="viewer" data-state={busy ? "busy" : "idle"} data-parts={parts.length}>
      <canvas ref={canvas} />
      {failed && <p className="viewer-note">{tr("view.no_webgl")}</p>}
      {!failed && busy && parts.length === 0 && <p className="viewer-note">{tr("view.loading")}</p>}
      {error && <p className="viewer-note error">{tr("view.error", { error })}</p>}
    </div>
  );
}
