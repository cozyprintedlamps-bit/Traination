// Step 4: the colour of each main part of the selected vehicle and whether the parts are printed
// separately; colours of the track pieces and buildings. The shape options and the artwork of a
// vehicle (windows, roof, pattern, lettering …) are in step 3 (VehicleLook). The window next to the
// page is the one of step 3: the 3D model of the train and the train in order.
import { useAppState, useStore } from "../app/context";
import { NO_ROOF } from "../core/buildings";
import { COLOR_SLOTS, HAS_CHIMNEY, HAS_DOME, HAS_LOAD, HAS_ROOF, LOCOMOTIVES, cleanLettering } from "../core/vehicle";
import type { Vehicle, VehicleColors, VehicleDesign } from "../core/vehicle";
import { ColorPicker, Section, Toggle } from "./components";
import { buildingName, elementName, tr, vehicleName } from "./i18n";
import type { TextKey } from "./i18n";

/** Which colour slots a kind uses (the others have nothing to colour). */
function slotsOf(v: Vehicle): (keyof VehicleColors)[] {
  return COLOR_SLOTS.filter((slot) => {
    if (slot === "roof") return HAS_ROOF.has(v.kind);
    if (slot === "load") return HAS_LOAD.has(v.kind) && v.design.load;
    if (slot === "details") return HAS_CHIMNEY.has(v.kind) || HAS_DOME.has(v.kind) || LOCOMOTIVES.has(v.kind) || v.kind === "crane" || v.kind === "tank";
    if (slot === "decor") return !v.design.split && (v.design.decor !== "none" || cleanLettering(v.design.lettering) !== "" || v.design.face);
    return true;
  });
}

export function DesignPage() {
  const { project, selection } = useAppState();
  const store = useStore();
  const v = project.vehicles.find((x) => x.id === selection.vehicle);
  const index = project.vehicles.findIndex((x) => x.id === selection.vehicle);
  const design = (patch: Partial<VehicleDesign>) => v && store.changeVehicle(v.id, (x: Vehicle) => ({ ...x, design: { ...x.design, ...patch } }));
  const color = (patch: Partial<VehicleColors>) => v && store.changeVehicle(v.id, (x: Vehicle) => ({ ...x, colors: { ...x.colors, ...patch } }));
  const used = new Set(project.layout.pieces.map((p) => p.type));

  return (
    <>
      {v && (
        <Section title={tr("design.colors_for", { name: vehicleName(v, index) })}>
          <h4 className="subhead">{tr("design.parts")}</h4>
          <Toggle label={tr("design.split")} hint={tr("design.split_hint")} checked={v.design.split} onChange={(split) => design({ split })} />
          {slotsOf(v).map((slot) => (
            <ColorPicker key={slot} label={tr(`color.${slot}` as TextKey)} value={v.colors[slot]} onChange={(c) => color({ [slot]: c })} />
          ))}
        </Section>
      )}
      <Section title={tr("color.track")}>
        {project.elements
          .filter((e) => used.has(e.id))
          .map((e) => (
            <ColorPicker key={e.id} label={elementName(e)} value={e.color} onChange={(c) => store.changeElement(e.id, { color: c })} />
          ))}
      </Section>
      {project.buildings.length > 0 && (
        <Section title={tr("color.buildings")}>
          {project.buildings.map((b, i) => (
            <div key={b.id} className="color-group">
              <p className="strong small">{buildingName(b, i)}</p>
              <ColorPicker label={tr("color.walls")} value={b.colors.walls} onChange={(c) => store.changeBuilding(b.id, { colors: { ...b.colors, walls: c } })} />
              {!NO_ROOF.has(b.kind) && <ColorPicker label={tr("color.building_roof")} value={b.colors.roof} onChange={(c) => store.changeBuilding(b.id, { colors: { ...b.colors, roof: c } })} />}
              <ColorPicker label={tr("color.building_details")} value={b.colors.details} onChange={(c) => store.changeBuilding(b.id, { colors: { ...b.colors, details: c } })} />
            </div>
          ))}
        </Section>
      )}
    </>
  );
}
