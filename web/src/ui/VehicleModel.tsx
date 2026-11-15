// The 3D model in the window next to the page in the steps for vehicles: the selected vehicle, or
// the whole train, on see-through rails. The big 3D view behind shows the track as in every step.
import { useAppState, useEngine } from "../app/context";
import { useVehicleScene } from "./useScene";
import { Viewer3D } from "./Viewer3D";

export function VehicleModel() {
  const engine = useEngine();
  const state = useAppState();
  const scene = useVehicleScene(engine, state);
  return (
    <div className="element-view" data-testid="vehicle-view">
      <Viewer3D testId="vehicle-model" parts={scene.parts} fitKey={scene.key} busy={scene.busy} {...(scene.error ? { error: scene.error } : {})} />
    </div>
  );
}
