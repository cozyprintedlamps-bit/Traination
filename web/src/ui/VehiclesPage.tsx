// Step 3: the train: vehicles in order, their kind, length, axles and couplers.
import { useState } from "react";
import { useAppState, useStore } from "../app/context";
import { clearance } from "../core/project";
import { COUPLERS, VEHICLE_KINDS, vehicleIssues } from "../core/vehicle";
import type { Coupler, Vehicle, VehicleIssue, VehicleKind } from "../core/vehicle";
import { MAGNET_CATALOG, VEHICLE_MAX_LENGTH, VEHICLE_MIN_LENGTH } from "../presets/vehicle";
import { Choice, Field, Notice, NumberField, Section } from "./components";
import { tr, vehicleName } from "./i18n";
import type { TextKey } from "./i18n";

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
  }
}

export function TrainList() {
  const { project, selection } = useAppState();
  const store = useStore();
  const [kind, setKind] = useState<VehicleKind>("box");
  return (
    <Section title={tr("vehicles.train")}>
      {project.vehicles.length === 0 && <p className="muted small">{tr("vehicles.empty")}</p>}
      <div className="card-list">
        {project.vehicles.map((v, i) => (
          <div key={v.id} className={`card${v.id === selection.vehicle ? " selected" : ""}`}>
            <button type="button" className="card-main" onClick={() => store.select({ vehicle: v.id })}>
              <span className="swatch small" style={{ background: v.colors.body }} />
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
      </div>
      <div className="row">
        <select className="input" value={kind} onChange={(e) => setKind(e.target.value as VehicleKind)} aria-label={tr("vehicles.kind")}>
          {VEHICLE_KINDS.map((k) => (
            <option key={k} value={k}>
              {tr(`vkind.${k}` as TextKey)}
            </option>
          ))}
        </select>
        <button type="button" className="button primary" onClick={() => store.addVehicle(kind)}>
          + {tr("vehicles.add")}
        </button>
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
      <TrainList />
      {v && (
        <Section title={vehicleName(v, index)}>
          <Field label={tr("vehicles.kind")}>
            <select className="input" value={v.kind} onChange={(e) => store.setVehicleKind(v.id, e.target.value as VehicleKind)}>
              {VEHICLE_KINDS.map((k) => (
                <option key={k} value={k}>
                  {tr(`vkind.${k}` as TextKey)}
                </option>
              ))}
            </select>
          </Field>
          <Field label={tr("field.vname")}>
            <input className="input" value={v.name} placeholder={tr(`vkind.${v.kind}` as TextKey)} onChange={(e) => change({ name: e.target.value })} />
          </Field>
          <NumberField label={tr("field.vlength")} value={v.length} min={VEHICLE_MIN_LENGTH} max={VEHICLE_MAX_LENGTH} onChange={(length) => change({ length })} />
          <Field label={tr("field.axles")}>
            <Choice value={v.axles} options={[{ value: 2, label: "2" }, { value: 3, label: "3" }]} onChange={(axles) => change({ axles })} />
          </Field>
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
