// Step 4: the artwork of the selected vehicle (shape options, pattern, lettering, face, lamps) and
// the colour of each main part; whether the parts are printed separately; colours of the track
// pieces and buildings.
import { useAppState, useStore } from "../app/context";
import { COLOR_SLOTS, DECORS, HAS_CHIMNEY, HAS_DOME, HAS_LOAD, HAS_ROOF, HAS_WINDOWS, LETTERING_MAX, LOCOMOTIVES, cleanLettering } from "../core/vehicle";
import type { Decor, Vehicle, VehicleColors, VehicleDesign } from "../core/vehicle";
import { Choice, ColorPicker, Field, NumberField, Section, Toggle } from "./components";
import { buildingName, elementName, tr, vehicleName } from "./i18n";
import type { TextKey } from "./i18n";
import { TrainList } from "./VehiclesPage";

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
  const loco = v ? LOCOMOTIVES.has(v.kind) : false;

  return (
    <>
      <TrainList />
      {v && (
        <Section title={tr("design.for", { name: vehicleName(v, index) })}>
          <h4 className="subhead">{tr("design.options")}</h4>
          {HAS_WINDOWS.has(v.kind) && <Toggle label={tr("field.windows")} checked={v.design.windows} onChange={(windows) => design({ windows })} />}
          {HAS_CHIMNEY.has(v.kind) && (
            <Field label={tr("field.chimney")}>
              <Choice
                value={v.design.chimney}
                options={(["tall", "short", "funnel", "none"] as const).map((c) => ({ value: c, label: tr(`chimney.${c}` as TextKey) }))}
                onChange={(chimney) => design({ chimney })}
              />
            </Field>
          )}
          {HAS_DOME.has(v.kind) && <Toggle label={tr("field.dome")} checked={v.design.dome} onChange={(dome) => design({ dome })} />}
          {HAS_ROOF.has(v.kind) && (
            <Field label={tr("field.roof")}>
              <Choice value={v.design.roof} options={(["round", "flat", "peaked"] as const).map((r) => ({ value: r, label: tr(`roof.${r}` as TextKey) }))} onChange={(roof) => design({ roof })} />
            </Field>
          )}
          {HAS_LOAD.has(v.kind) && v.kind !== "crane" && <Toggle label={tr("field.load")} checked={v.design.load} onChange={(load) => design({ load })} />}
          <NumberField label={tr("field.body_height")} hint={tr("field.body_height_hint")} value={v.design.height} min={0} max={60} onChange={(height) => design({ height })} />

          <h4 className="subhead">{tr("design.art")}</h4>
          <Field label={tr("field.decor")}>
            <Choice<Decor> value={v.design.decor} options={DECORS.map((d) => ({ value: d, label: tr(`decor.${d}` as TextKey) }))} onChange={(decor) => design({ decor })} />
          </Field>
          <Field label={tr("field.lettering")} hint={tr("field.lettering_hint")}>
            <input
              className="input"
              value={v.design.lettering}
              maxLength={LETTERING_MAX + 4}
              placeholder="EMMA 1"
              onChange={(e) => design({ lettering: cleanLettering(e.target.value) })}
              data-testid="lettering"
            />
          </Field>
          {loco && <Toggle label={tr("field.face")} checked={v.design.face} onChange={(face) => design({ face })} />}
          {loco && <Toggle label={tr("field.lamps")} checked={v.design.lamps} onChange={(lamps) => design({ lamps })} />}
          <Toggle label={tr("field.buffers")} checked={v.design.buffers} onChange={(buffers) => design({ buffers })} />
          {loco && <Toggle label={tr("field.cowcatcher")} hint={tr("field.cowcatcher_hint")} checked={v.design.cowcatcher} onChange={(cowcatcher) => design({ cowcatcher })} />}

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
              {b.kind !== "platform" && b.kind !== "signal" && <ColorPicker label={tr("color.building_roof")} value={b.colors.roof} onChange={(c) => store.changeBuilding(b.id, { colors: { ...b.colors, roof: c } })} />}
              <ColorPicker label={tr("color.building_details")} value={b.colors.details} onChange={(c) => store.changeBuilding(b.id, { colors: { ...b.colors, details: c } })} />
            </div>
          ))}
        </Section>
      )}
    </>
  );
}
