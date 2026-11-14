// What the 3D view shows in each step, built from engine meshes (asynchronously, cached).
import { useEffect, useMemo, useState } from "react";
import type { EngineClient } from "../app/engineClient";
import type { State } from "../app/store";
import type { Building } from "../core/buildings";
import { analyze } from "../core/layout";
import type { Analysis } from "../core/layout";
import type { Project } from "../core/project";
import { route, trainPoses } from "../core/route";
import { supports } from "../core/supports";
import { makeElement, PLAIN } from "../core/track";
import { chassisSizes } from "../core/vehicle";
import type { Vehicle } from "../core/vehicle";
import { trackOptions } from "../export/printItems";
import { TRACK_HEIGHT } from "../presets/gauge";
import { COUPLER_REACH } from "../presets/vehicle";
import { TRACK_CLEARANCE } from "../presets/print";
import type { ScenePart } from "./SceneView";

export interface SceneResult {
  parts: ScenePart[];
  busy: boolean;
  error?: string;
  /** what the parts show (step and subject): the view looks at everything when it changes */
  key: string;
}

const SUPPORT_COLOR = "#8E9089";

async function trackParts(engine: EngineClient, project: Project, analysis: Analysis, highlight: { piece?: string }): Promise<ScenePart[]> {
  const typeOf = new Map(project.elements.map((e) => [e.id, e]));
  const pieces = await Promise.all(
    project.layout.pieces.map(async (piece) => {
      const type = typeOf.get(piece.type);
      const pose = analysis.poses.get(piece.id);
      if (!type || !pose) return undefined;
      const mesh = await engine.element(type, piece.variant, trackOptions(project));
      const part: ScenePart = { mesh: mesh.mesh, color: type.color, x: pose.x, y: pose.y, z: pose.z, rotation: pose.rotation, highlight: piece.id === highlight.piece };
      return part;
    }),
  );
  const pillars = await Promise.all(
    supports(project.layout, project.elements, analysis).map(async (s): Promise<ScenePart> => {
      const mesh = await engine.support(s.height, s.plain);
      return { mesh: mesh.mesh, color: SUPPORT_COLOR, x: s.x, y: s.y, z: 0, rotation: s.heading };
    }),
  );
  return [...pieces.filter((p): p is ScenePart => p !== undefined), ...pillars];
}

async function buildingParts(engine: EngineClient, b: Building, highlight: boolean): Promise<ScenePart[]> {
  const m = await engine.building(b);
  const at = (mesh: typeof m.base, color: string): ScenePart => ({ mesh: mesh.mesh, color, x: b.x, y: b.y, z: 0, rotation: b.rotation, highlight });
  return [at(m.base, b.colors.walls), ...m.roofs.map((r) => at(r, b.colors.roof)), ...(m.details ? [at(m.details, b.colors.details)] : [])];
}

/** A vehicle in place: chassis bottom above the track top, body on the deck. */
async function vehicleParts(engine: EngineClient, project: Project, v: Vehicle, at: { x: number; y: number; z: number; rotation: number }, options: { highlight?: boolean; inside?: boolean } = {}): Promise<ScenePart[]> {
  const m = await engine.vehicle(v, project.settings.fits);
  const s = chassisSizes(v, project.settings.fits);
  const z = at.z + TRACK_HEIGHT + TRACK_CLEARANCE;
  const glass = options.inside && m.inside ? 0.35 : undefined;
  const place = (mesh: typeof m.chassis, color: string, dz: number, opacity?: number): ScenePart => ({
    mesh: mesh.mesh,
    color,
    x: at.x,
    y: at.y,
    z: z + dz,
    rotation: at.rotation,
    ...(options.highlight ? { highlight: true } : {}),
    ...(opacity !== undefined ? { opacity } : {}),
  });
  return [
    place(m.chassis, v.colors.chassis, 0),
    place(m.running, v.colors.wheels, 0),
    place(m.body, v.colors.body, s.deckTop, glass),
    ...m.parts.map((p) => place(p.mesh, v.colors[p.slot], s.deckTop, glass)),
    ...(options.inside && m.inside ? [place(m.inside, "#2F6FBF", 0)] : []),
  ];
}

export function useAnalysis(project: Project): Analysis {
  return useMemo(() => analyze(project.layout, project.elements), [project.layout, project.elements]);
}

/** The whole train in a row on straight track, the first vehicle in front (+X). */
async function trainRow(engine: EngineClient, project: Project, selected?: string): Promise<ScenePart[]> {
  const gap = 2 * COUPLER_REACH;
  const total = project.vehicles.reduce((n, v) => n + v.length + gap, 0);
  const rail = makeElement("straight", { length: 216, color: project.elements[0]?.color ?? "#E4BD68" });
  const railMesh = await engine.element(rail, PLAIN, trackOptions(project));
  const rails: ScenePart[] = [];
  for (let x = -total / 2 - 30; x < total / 2 + 30; x += rail.length) rails.push({ mesh: railMesh.mesh, color: rail.color, x, y: 0, z: 0, rotation: 0 });
  let cursor = total / 2;
  const cars: ScenePart[] = [];
  for (const v of project.vehicles) {
    const x = cursor - gap / 2 - v.length / 2;
    cars.push(...(await vehicleParts(engine, project, v, { x, y: 0, z: 0, rotation: 0 }, { highlight: v.id === selected && project.vehicles.length > 1 })));
    cursor -= v.length + gap;
  }
  return [...rails, ...cars];
}

export function useScene(engine: EngineClient, state: State): SceneResult {
  const { project, step, selection, trainView } = state;
  const analysis = useAnalysis(project);
  const [result, setResult] = useState<SceneResult>({ parts: [], busy: true, key: "" });
  const vehicleStep = step === "vehicles" || step === "design";
  const subject =
    step === "elements" ? selection.element : vehicleStep ? (trainView ? `train${project.vehicles.length}` : selection.vehicle) : `${project.layout.pieces.length}|${project.vehicles.length}|${project.buildings.length}`;
  const key = `${vehicleStep ? "vehicles" : step === "export" || step === "overview" ? "track" : step}|${subject}`;

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
      if (vehicleStep) {
        if (trainView) return trainRow(engine, project, selection.vehicle);
        const v = project.vehicles.find((x) => x.id === selection.vehicle);
        if (!v) return [];
        // the vehicle on a piece of straight track
        const rail = makeElement("straight", { length: Math.max(144, v.length + 60), color: project.elements[0]?.color ?? "#E4BD68" });
        const railMesh = await engine.element(rail, PLAIN, trackOptions(project));
        const railPart: ScenePart = { mesh: railMesh.mesh, color: rail.color, x: -rail.length / 2, y: 0, z: 0, rotation: 0 };
        return [railPart, ...(await vehicleParts(engine, project, v, { x: 0, y: 0, z: 0, rotation: 0 }, { inside: v.kind === "cyberbrick" }))];
      }
      const track = await trackParts(engine, project, analysis, step === "track" ? { piece: selection.piece } : {});
      const houses = await Promise.all(project.buildings.map((b) => buildingParts(engine, b, step === "track" && b.id === selection.building)));
      const points = route(project.layout, project.elements, analysis);
      const poses = trainPoses(points, project.vehicles.map((v) => v.length));
      const train = await Promise.all(project.vehicles.map((v, i) => (poses[i] ? vehicleParts(engine, project, v, poses[i]) : Promise.resolve([]))));
      return [...track, ...houses.flat(), ...train.flat()];
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
  }, [engine, project, step, selection.element, selection.vehicle, selection.piece, selection.building, analysis, key, trainView, vehicleStep]);

  return result;
}
