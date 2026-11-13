// What the 3D view shows in each step, built from engine meshes (asynchronously, cached).
import { useEffect, useMemo, useState } from "react";
import type { EngineClient } from "../app/engineClient";
import type { State } from "../app/store";
import { analyze } from "../core/layout";
import type { Analysis } from "../core/layout";
import type { Project } from "../core/project";
import { route, trainPoses } from "../core/route";
import { makeElement, PLAIN } from "../core/track";
import { chassisSizes } from "../core/vehicle";
import type { Vehicle } from "../core/vehicle";
import { trackOptions } from "../export/printItems";
import { TRACK_CLEARANCE, } from "../presets/print";
import { TRACK_HEIGHT } from "../presets/gauge";
import type { ScenePart } from "./SceneView";

export interface SceneResult {
  parts: ScenePart[];
  busy: boolean;
  error?: string;
  /** what the parts show (step and subject): the view looks at everything when it changes */
  key: string;
}

async function trackParts(engine: EngineClient, project: Project, analysis: Analysis, highlight: { piece?: string; element?: string }): Promise<ScenePart[]> {
  const typeOf = new Map(project.elements.map((e) => [e.id, e]));
  const parts = await Promise.all(
    project.layout.pieces.map(async (piece) => {
      const type = typeOf.get(piece.type);
      const pose = analysis.poses.get(piece.id);
      if (!type || !pose) return undefined;
      const mesh = await engine.element(type, piece.variant, trackOptions(project));
      const part: ScenePart = { mesh: mesh.mesh, color: type.color, x: pose.x, y: pose.y, z: pose.z, rotation: pose.rotation, highlight: piece.id === highlight.piece || type.id === highlight.element };
      return part;
    }),
  );
  return parts.filter((p): p is ScenePart => p !== undefined);
}

/** A vehicle in place: chassis bottom above the track top, body on the deck. */
async function vehicleParts(engine: EngineClient, project: Project, v: Vehicle, at: { x: number; y: number; z: number; rotation: number }, highlight = false): Promise<ScenePart[]> {
  const m = await engine.vehicle(v, project.settings.fits);
  const s = chassisSizes(v, project.settings.fits);
  const z = at.z + TRACK_HEIGHT + TRACK_CLEARANCE;
  const place = (mesh: typeof m.chassis, color: string, dz: number): ScenePart => ({ mesh: mesh.mesh, color, x: at.x, y: at.y, z: z + dz, rotation: at.rotation, highlight });
  return [
    place(m.chassis, v.colors.chassis, 0),
    place(m.running, v.colors.wheels, 0),
    place(m.body, v.colors.body, s.deckTop),
    ...(m.accent ? [place(m.accent, v.colors.accent, s.deckTop)] : []),
  ];
}

export function useAnalysis(project: Project): Analysis {
  return useMemo(() => analyze(project.layout, project.elements), [project.layout, project.elements]);
}

export function useScene(engine: EngineClient, state: State): SceneResult {
  const { project, step, selection } = state;
  const analysis = useAnalysis(project);
  const [result, setResult] = useState<SceneResult>({ parts: [], busy: true, key: "" });
  const subject =
    step === "elements" ? selection.element : step === "vehicles" || step === "design" ? selection.vehicle : `${project.layout.pieces.length}|${project.vehicles.length}`;
  const key = `${step === "design" ? "vehicles" : step === "export" ? "track" : step}|${subject}`;

  useEffect(() => {
    let cancelled = false;
    setResult((r) => ({ ...r, busy: true }));
    const build = async (): Promise<ScenePart[]> => {
      if (step === "elements") {
        const type = project.elements.find((e) => e.id === selection.element);
        if (!type) return [];
        const mesh = await engine.element(type, PLAIN, trackOptions(project));
        return [{ mesh: mesh.mesh, color: type.color, x: 0, y: 0, z: 0, rotation: 0 }];
      }
      if (step === "vehicles" || step === "design") {
        const v = project.vehicles.find((x) => x.id === selection.vehicle);
        if (!v) return [];
        // the vehicle on a piece of straight track
        const rail = makeElement("straight", { length: Math.max(144, v.length + 60), color: project.elements[0]?.color ?? "#E4BD68" });
        const railMesh = await engine.element(rail, PLAIN, trackOptions(project));
        const railPart: ScenePart = { mesh: railMesh.mesh, color: rail.color, x: -rail.length / 2, y: 0, z: 0, rotation: 0 };
        return [railPart, ...(await vehicleParts(engine, project, v, { x: 0, y: 0, z: 0, rotation: 0 }))];
      }
      const track = await trackParts(engine, project, analysis, step === "track" ? { piece: selection.piece } : {});
      const points = route(project.layout, project.elements, analysis);
      const poses = trainPoses(points, project.vehicles.map((v) => v.length));
      const train = await Promise.all(project.vehicles.map((v, i) => (poses[i] ? vehicleParts(engine, project, v, poses[i]) : Promise.resolve([]))));
      return [...track, ...train.flat()];
    };
    build()
      .then((parts) => {
        if (!cancelled) setResult({ parts, busy: false, key });
      })
      .catch((error: unknown) => {
        if (!cancelled) setResult({ parts: [], busy: false, key, error: error instanceof Error ? error.message : String(error) });
      });
    return () => {
      cancelled = true;
    };
  }, [engine, project, step, selection.element, selection.vehicle, selection.piece, analysis, key]);

  return result;
}
