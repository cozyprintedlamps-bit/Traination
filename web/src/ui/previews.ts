// What the preview pictures show: a template as it would be laid, one track piece, one building.
import type { EngineClient } from "../app/engineClient";
import { makeBuilding } from "../core/buildings";
import type { BuildingKind } from "../core/buildings";
import { analyze } from "../core/layout";
import { buildTemplate, withStandardElements } from "../core/project";
import type { Project, TemplateId } from "../core/project";
import { PLAIN } from "../core/track";
import type { ElementType } from "../core/track";
import { trackOptions } from "../export/printItems";
import type { ScenePart } from "./SceneView";
import { hashKey } from "./thumbnails";
import { buildingParts, trackParts } from "./useScene";

/** Keys: what decides how a picture looks (the types with their colours, the track options). */
export const elementsKey = (project: Project): string => hashKey(JSON.stringify([project.elements, trackOptions(project)]));
export const templateKey = (id: TemplateId, elements: string): string => `template|${id}|${elements}`;
export const elementKey = (project: Project, type: ElementType): string => `element|${hashKey(JSON.stringify([{ ...type, id: "", name: "" }, trackOptions(project)]))}`;
export const buildingKey = (kind: BuildingKind): string => `building|${kind}|${hashKey(JSON.stringify({ ...makeBuilding(kind), id: "" }))}`;

/** The template with the types of the project (as "apply" would lay it), with its supports. */
export async function templateParts(engine: EngineClient, project: Project, id: TemplateId): Promise<ScenePart[]> {
  let built;
  try {
    built = buildTemplate(id, withStandardElements(project.elements));
  } catch {
    // the types of the project may not close this template: no picture
    return [];
  }
  if (built.layout.pieces.length === 0) return [];
  const track = await trackParts(engine, { ...project, elements: built.elements, layout: built.layout }, analyze(built.layout, built.elements), {});
  // what belongs to the ready-made track (tunnels, platforms, stud plates) is in the picture too
  const houses = await Promise.all(built.buildings.map((b) => buildingParts(engine, b, false)));
  return [...track, ...houses.flat()];
}

/** One piece of track, in its colour. */
export async function elementParts(engine: EngineClient, project: Project, type: ElementType): Promise<ScenePart[]> {
  const mesh = await engine.element(type, PLAIN, trackOptions(project));
  return [{ mesh: mesh.mesh, color: type.color, x: 0, y: 0, z: 0, rotation: 0 }];
}

/** A building of this kind as it stands when it is new. */
export function buildingKindParts(engine: EngineClient, kind: BuildingKind): Promise<ScenePart[]> {
  return buildingParts(engine, makeBuilding(kind), false);
}
