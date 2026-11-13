// Step 4: design and colours of the selected vehicle, and the colours of the track pieces.
import { useAppState, useStore } from "../app/context";
import type { Vehicle, VehicleColors, VehicleDesign } from "../core/vehicle";
import { Choice, ColorPicker, Field, NumberField, Section, Toggle } from "./components";
import { elementName, tr, vehicleName } from "./i18n";
import { TrainList } from "./VehiclesPage";

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
      <TrainList />
      {v && (
        <Section title={tr("design.for", { name: vehicleName(v, index) })}>
          {["steam", "diesel", "electric", "passenger"].includes(v.kind) && <Toggle label={tr("field.windows")} checked={v.design.windows} onChange={(windows) => design({ windows })} />}
          {v.kind === "steam" && (
            <Field label={tr("field.chimney")}>
              <Choice
                value={v.design.chimney}
                options={[
                  { value: "tall", label: tr("chimney.tall") },
                  { value: "short", label: tr("chimney.short") },
                  { value: "none", label: tr("chimney.none") },
                ]}
                onChange={(chimney) => design({ chimney })}
              />
            </Field>
          )}
          {(v.kind === "steam" || v.kind === "tank") && <Toggle label={tr("field.dome")} checked={v.design.dome} onChange={(dome) => design({ dome })} />}
          {["steam", "diesel", "electric", "box", "passenger"].includes(v.kind) && (
            <Field label={tr("field.roof")}>
              <Choice value={v.design.roof} options={[{ value: "round", label: tr("roof.round") }, { value: "flat", label: tr("roof.flat") }]} onChange={(roof) => design({ roof })} />
            </Field>
          )}
          {["tender", "flat", "hopper"].includes(v.kind) && <Toggle label={tr("field.load")} checked={v.design.load} onChange={(load) => design({ load })} />}
          <NumberField label={tr("field.body_height")} hint={tr("field.body_height_hint")} value={v.design.height} min={0} max={60} onChange={(height) => design({ height })} />
          <h4 className="subhead">{tr("design.colors")}</h4>
          <ColorPicker label={tr("color.body")} value={v.colors.body} onChange={(body) => color({ body })} />
          <ColorPicker label={tr("color.accent")} value={v.colors.accent} onChange={(accent) => color({ accent })} />
          <ColorPicker label={tr("color.chassis")} value={v.colors.chassis} onChange={(chassis) => color({ chassis })} />
          <ColorPicker label={tr("color.wheels")} value={v.colors.wheels} onChange={(wheels) => color({ wheels })} />
        </Section>
      )}
      <Section title={tr("color.track")}>
        {project.elements
          .filter((e) => used.has(e.id))
          .map((e) => (
            <ColorPicker key={e.id} label={elementName(e)} value={e.color} onChange={(c) => store.changeElement(e.id, { color: c })} />
          ))}
      </Section>
    </>
  );
}
