// Step 3: the train. A palette of vehicles in four categories (drag into the train or click), the
// train in order (drag to reorder), and the selected vehicle's kind, length, axles and couplers.
import { useState } from "react";
import type { DragEvent } from "react";
import { useAppState, useStore } from "../app/context";
import { clearance } from "../core/project";
import { CATEGORIES, COUPLERS, KINDS_BY_CATEGORY, categoryOf, defaultColors, vehicleIssues } from "../core/vehicle";
import type { Coupler, Vehicle, VehicleCategory, VehicleIssue, VehicleKind } from "../core/vehicle";
import { MAGNET_CATALOG, VEHICLE_MAX_LENGTH, VEHICLE_MIN_LENGTH } from "../presets/vehicle";
import { Choice, Field, Notice, NumberField, Section } from "./components";
import { VehicleIcon } from "./Icon";
import { tr, vehicleName } from "./i18n";
import type { TextKey } from "./i18n";

const KIND_TYPE = "application/x-traination-kind";
const VEHICLE_TYPE = "application/x-traination-vehicle";

export function issueText(issue: VehicleIssue): string {
  switch (issue.code) {
    case "length":
      return tr("issue.length", { min: issue.min, max: issue.max });
    case "magnet_too_big":
      return tr("issue.magnet_too_big", { max: issue.max });
    case "magnet_too_deep":
      return tr("issue.magnet_too_deep", { max: issue.max });
    case "too_tall":
      return tr("issue.too_tall", { height: issue.height, limit: issue.limit });
    case "couplers_mixed":
      return tr("issue.couplers_mixed");
    case "cyberbrick_length":
      return tr("issue.cyberbrick_length", { min: issue.min });
  }
}

/** The vehicles to choose from, by category; drag a tile into the train or click it. */
function VehiclePalette() {
  const store = useStore();
  const { project, selection } = useAppState();
  const current = project.vehicles.find((v) => v.id === selection.vehicle);
  const [category, setCategory] = useState<VehicleCategory>(current ? categoryOf(current.kind) : "loco");
  return (
    <Section title={tr("vehicles.palette")}>
      <div className="choices" role="tablist">
        {CATEGORIES.map((c) => (
          <button key={c} type="button" role="tab" aria-selected={c === category} className={`chip${c === category ? " selected" : ""}`} onClick={() => setCategory(c)}>
            {tr(`cat.${c}` as TextKey)}
          </button>
        ))}
      </div>
      <div className="vehicle-grid">
        {KINDS_BY_CATEGORY[category].map((kind) => (
          <button
            key={kind}
            type="button"
            className="tile"
            draggable
            data-testid={`palette-${kind}`}
            onDragStart={(e) => {
              e.dataTransfer.setData(KIND_TYPE, kind);
              e.dataTransfer.effectAllowed = "copy";
            }}
            onClick={() => store.addVehicle(kind)}
          >
            <VehicleIcon kind={kind} color={defaultColors(kind).body} />
            <span>{tr(`vkind.${kind}` as TextKey)}</span>
          </button>
        ))}
      </div>
      <p className="muted small">{tr("vehicles.drag_hint")}</p>
    </Section>
  );
}

/** The train in order; vehicles and palette tiles can be dropped between the cars. */
export function TrainList() {
  const { project, selection, trainView } = useAppState();
  const store = useStore();
  const [dropAt, setDropAt] = useState<number | null>(null);

  const accepts = (e: DragEvent) => e.dataTransfer.types.includes(KIND_TYPE) || e.dataTransfer.types.includes(VEHICLE_TYPE);
  const over = (e: DragEvent, index: number) => {
    if (!accepts(e)) return;
    e.preventDefault();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setDropAt(e.clientY < rect.top + rect.height / 2 ? index : index + 1);
  };
  const drop = (e: DragEvent) => {
    e.preventDefault();
    // a drop on a car must not reach the list as well (that would add the vehicle twice)
    e.stopPropagation();
    const index = dropAt ?? project.vehicles.length;
    setDropAt(null);
    const kind = e.dataTransfer.getData(KIND_TYPE) as VehicleKind;
    const id = e.dataTransfer.getData(VEHICLE_TYPE);
    if (kind) store.addVehicle(kind, index);
    else if (id) store.moveVehicleTo(id, index);
  };

  return (
    <Section
      title={tr("vehicles.train")}
      aside={
        <div className="segmented" role="radiogroup">
          <button type="button" role="radio" aria-checked={!trainView} className={`seg${!trainView ? " selected" : ""}`} onClick={() => store.setTrainView(false)}>
            {tr("view.vehicle")}
          </button>
          <button type="button" role="radio" aria-checked={trainView} className={`seg${trainView ? " selected" : ""}`} onClick={() => store.setTrainView(true)}>
            {tr("view.train")}
          </button>
        </div>
      }
    >
      {project.vehicles.length === 0 && <p className="muted small">{tr("vehicles.empty")}</p>}
      <div
        className="card-list train-list"
        data-testid="train-list"
        onDragOver={(e) => {
          if (accepts(e) && e.target === e.currentTarget) {
            e.preventDefault();
            setDropAt(project.vehicles.length);
          }
        }}
        onDragLeave={(e) => {
          if (e.target === e.currentTarget) setDropAt(null);
        }}
        onDrop={drop}
      >
        {project.vehicles.map((v, i) => (
          <div
            key={v.id}
            className={`card${v.id === selection.vehicle ? " selected" : ""}${dropAt === i ? " drop-before" : ""}${dropAt === i + 1 && i === project.vehicles.length - 1 ? " drop-after" : ""}`}
            draggable
            data-testid="train-car"
            onDragStart={(e) => {
              e.dataTransfer.setData(VEHICLE_TYPE, v.id);
              e.dataTransfer.effectAllowed = "move";
            }}
            onDragOver={(e) => over(e, i)}
            onDrop={drop}
          >
            <span className="grip" aria-hidden="true">
              ⋮⋮
            </span>
            <button type="button" className="card-main" onClick={() => store.select({ vehicle: v.id })}>
              <VehicleIcon kind={v.kind} color={v.colors.body} />
              <span className="card-text">
                <span>{vehicleName(v, i)}</span>
                <span className="muted small">
                  {v.length} mm · {tr(`coupler.${v.front}` as TextKey)} / {tr(`coupler.${v.rear}` as TextKey)}
                </span>
              </span>
            </button>
            <span className="card-actions">
              <button type="button" className="icon-button" disabled={i === 0} onClick={() => store.moveVehicle(v.id, -1)} title={tr("vehicles.up")} aria-label={tr("vehicles.up")}>
                ↑
              </button>
              <button type="button" className="icon-button" disabled={i === project.vehicles.length - 1} onClick={() => store.moveVehicle(v.id, 1)} title={tr("vehicles.down")} aria-label={tr("vehicles.down")}>
                ↓
              </button>
            </span>
          </div>
        ))}
        {dropAt === project.vehicles.length && project.vehicles.length === 0 && <div className="drop-zone">{tr("vehicles.drop")}</div>}
      </div>
    </Section>
  );
}

export function VehiclesPage() {
  const { project, selection } = useAppState();
  const store = useStore();
  const v = project.vehicles.find((x) => x.id === selection.vehicle);
  const index = project.vehicles.findIndex((x) => x.id === selection.vehicle);
  const change = (patch: Partial<Vehicle>) => v && store.changeVehicle(v.id, (x) => ({ ...x, ...patch }));
  const couplerOptions = COUPLERS.map((c) => ({ value: c, label: tr(`coupler.${c}` as TextKey) }));
  const magnetKey = v ? `${v.magnet.diameter}x${v.magnet.height}` : "";
  const issues = v ? vehicleIssues(v, clearance(project), project.settings.fits) : [];

  return (
    <>
      <VehiclePalette />
      <TrainList />
      {v && (
        <Section title={vehicleName(v, index)}>
          <Field label={tr("vehicles.kind")}>
            <select className="input" value={v.kind} onChange={(e) => store.setVehicleKind(v.id, e.target.value as VehicleKind)}>
              {CATEGORIES.map((c) => (
                <optgroup key={c} label={tr(`cat.${c}` as TextKey)}>
                  {KINDS_BY_CATEGORY[c].map((k) => (
                    <option key={k} value={k}>
                      {tr(`vkind.${k}` as TextKey)}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </Field>
          <Field label={tr("field.vname")}>
            <input className="input" value={v.name} placeholder={tr(`vkind.${v.kind}` as TextKey)} onChange={(e) => change({ name: e.target.value })} />
          </Field>
          <NumberField label={tr("field.vlength")} value={v.length} min={VEHICLE_MIN_LENGTH} max={VEHICLE_MAX_LENGTH} onChange={(length) => change({ length })} />
          {v.kind !== "cyberbrick" && (
            <Field label={tr("field.axles")}>
              <Choice value={v.axles} options={[{ value: 2, label: "2" }, { value: 3, label: "3" }]} onChange={(axles) => change({ axles })} />
            </Field>
          )}
          <Field label={tr("coupler.front")}>
            <Choice<Coupler> value={v.front} options={couplerOptions} onChange={(front) => change({ front })} />
          </Field>
          <Field label={tr("coupler.rear")}>
            <Choice<Coupler> value={v.rear} options={couplerOptions} onChange={(rear) => change({ rear })} />
          </Field>
          {(v.front === "magnet" || v.rear === "magnet") && (
            <Field label={tr("field.magnet")}>
              <select
                className="input"
                value={magnetKey}
                onChange={(e) => {
                  const m = MAGNET_CATALOG.find((x) => `${x.diameter}x${x.height}` === e.target.value);
                  if (m) change({ magnet: { ...m } });
                }}
              >
                {MAGNET_CATALOG.map((m) => (
                  <option key={`${m.diameter}x${m.height}`} value={`${m.diameter}x${m.height}`}>
                    {tr("magnet.size", { d: m.diameter, h: m.height })}
                  </option>
                ))}
              </select>
            </Field>
          )}
          <p className="muted small">{tr("hint.couplers")}</p>
          {v.kind === "cyberbrick" && (
            <>
              <h4 className="subhead">{tr("cyberbrick.title")}</h4>
              <p className="muted small">{tr("cyberbrick.hint")}</p>
              <p className="muted small">{tr("cyberbrick.parts")}</p>
            </>
          )}
          {issues.map((issue) => (
            <Notice key={issue.code} kind={issue.code === "couplers_mixed" ? "info" : "warning"}>
              {issueText(issue)}
            </Notice>
          ))}
          <div className="row">
            <button type="button" className="button" onClick={() => store.duplicateVehicle(v.id)}>
              {tr("vehicles.duplicate")}
            </button>
            <button type="button" className="button danger" onClick={() => store.removeVehicle(v.id)}>
              {tr("vehicles.remove")}
            </button>
          </div>
        </Section>
      )}
    </>
  );
}
