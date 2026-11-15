// Step 6: printer, fits, the parts list and the 3MF export of track, trains and buildings.
import { useState } from "react";
import { useAppState, useEngine, useStore } from "../app/context";
import { analyze, partsList } from "../core/layout";
import { serialize } from "../core/project";
import { supportParts, supports } from "../core/supports";
import type { Fits } from "../core/vehicle";
import { pack, writeFiles } from "../export/plates";
import type { PrintItem } from "../export/plates";
import { buildingItems, shoppingList, trackItems, vehicleItems } from "../export/printItems";
import type { Names } from "../export/printItems";
import { PRINTERS, printerById } from "../presets/print";
import { Field, Notice, NumberField, Section } from "./components";
import { download } from "./files";
import { buildingName, elementName, tr, vehicleName } from "./i18n";
import type { TextKey } from "./i18n";

export const exportNames = (): Names => ({
  element: (t, v) => elementName(t, v),
  vehicle: (v, i) => vehicleName(v, i),
  building: (b, i) => buildingName(b, i),
  part: (p) => tr(`part.${p}` as TextKey),
});

type What = "track" | "vehicles" | "buildings";

export function ExportPage() {
  const { project } = useAppState();
  const store = useStore();
  const engine = useEngine();
  const [message, setMessage] = useState<{ kind: "info" | "ok" | "warning" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const printer = printerById(project.settings.printer);
  const typeOf = new Map(project.elements.map((e) => [e.id, e]));
  const parts = partsList(project.layout, project.elements, project.settings.doubleSided);
  const pillars = supportParts(supports(project.layout, project.elements, analyze(project.layout, project.elements)));
  const fits = project.settings.fits;
  const setFits = (patch: Partial<Fits>) => store.changeSettings({ fits: { ...fits, ...patch } });
  const fileBase = (project.name.trim() || "traination").replace(/[^\w.-]+/g, "_");
  const driven = shoppingList(project);
  const anySplit = project.vehicles.some((v) => v.design.split);

  const run = async (what: What) => {
    setBusy(true);
    setMessage({ kind: "info", text: tr("export.working") });
    try {
      const names = exportNames();
      const items: PrintItem[] =
        what === "track" ? await trackItems(project, engine, names) : what === "vehicles" ? await vehicleItems(project, engine, names) : await buildingItems(project, engine, names);
      if (items.length === 0) {
        setMessage({ kind: "warning", text: tr("export.empty") });
        return;
      }
      const packing = pack(items, printer.bed);
      const suffix = what === "track" ? "track" : what === "vehicles" ? "trains" : "buildings";
      const files = packing.placed.length > 0 ? writeFiles(packing, `${fileBase}-${suffix}`, printer) : [];
      for (const f of files) download(f.data, f.name, "model/3mf");
      const text = [tr("export.done", { n: files.length, plates: packing.plates })];
      if (packing.tooBig.length > 0) text.push(tr("export.too_big", { names: packing.tooBig.map((i) => i.name).join(", ") }));
      setMessage({ kind: packing.tooBig.length > 0 ? "warning" : "ok", text: text.join(" · ") });
    } catch (error) {
      setMessage({ kind: "error", text: tr("export.failed", { error: error instanceof Error ? error.message : String(error) }) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Section title={tr("export.printer")}>
        <Field label={tr("export.printer")}>
          <select className="input" value={printer.id} onChange={(e) => store.changeSettings({ printer: e.target.value })}>
            {PRINTERS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label} ({p.bed[0]} × {p.bed[1]} mm)
              </option>
            ))}
          </select>
        </Field>
      </Section>

      <Section title={tr("export.parts")}>
        <h4 className="subhead">{tr("export.track_parts")}</h4>
        <ul className="parts">
          {parts.map((p) => {
            const t = typeOf.get(p.type);
            return t ? (
              <li key={`${p.type}${p.variant.mirror}${p.variant.swap}${p.color}`}>
                <span className="swatch small" style={{ background: p.color }} />
                <span>{elementName(t, p.variant)}</span>
                <span className="count">{tr("export.count", { n: p.count })}</span>
              </li>
            ) : null;
          })}
          {pillars.map((s) => (
            <li key={`s${s.height}${s.plain}`}>
              <span className="swatch small" style={{ background: "#8E9089" }} />
              <span>
                {tr("part.support")} {s.height} mm
              </span>
              <span className="count">{tr("export.count", { n: s.count })}</span>
            </li>
          ))}
        </ul>
        <h4 className="subhead">{tr("export.vehicle_parts")}</h4>
        <ul className="parts">
          {project.vehicles.map((v, i) => (
            <li key={v.id}>
              <span className="swatch small" style={{ background: v.colors.body }} />
              <span className="card-text">
                <span>{vehicleName(v, i)}</span>
                <span className="muted small">
                  1× {tr("part.chassis")}, 1× {tr("part.body")}, {(v.kind === "cyberbrick" ? 2 : v.axles) * 2}× {tr("part.wheel")}, {v.kind === "cyberbrick" ? 2 : v.axles}× {tr("part.axle")}
                  {v.kind === "cyberbrick" ? `, 1× ${tr("part.worm")}, 1× ${tr("part.wormWheel")}` : ""}
                </span>
              </span>
              <span />
            </li>
          ))}
        </ul>
        {project.buildings.length > 0 && (
          <>
            <h4 className="subhead">{tr("export.building_parts")}</h4>
            <ul className="parts">
              {project.buildings.map((b, i) => (
                <li key={b.id}>
                  <span className="swatch small" style={{ background: b.colors.walls }} />
                  <span>{buildingName(b, i)}</span>
                  <span />
                </li>
              ))}
            </ul>
          </>
        )}
        {driven > 0 && <Notice kind="info">{`${driven}× ${tr("cyberbrick.parts")}`}</Notice>}
        <div className="row">
          <button type="button" className="button primary" disabled={busy || parts.length === 0} onClick={() => run("track")}>
            {tr("export.track")}
          </button>
          <button type="button" className="button primary" disabled={busy || project.vehicles.length === 0} onClick={() => run("vehicles")}>
            {tr("export.vehicles")}
          </button>
          <button type="button" className="button primary" disabled={busy || project.buildings.length === 0} onClick={() => run("buildings")}>
            {tr("export.buildings")}
          </button>
        </div>
        <button type="button" className="button" onClick={() => download(new TextEncoder().encode(serialize(project)), `${fileBase}.trproj`, "application/json")}>
          {tr("export.project")}
        </button>
        {message && <Notice kind={message.kind}>{message.text}</Notice>}
      </Section>

      <Section title={tr("export.fits")}>
        <NumberField label={tr("fit.axle")} hint={tr("fit.axle_hint")} value={fits.axle} min={0} max={1.5} step={0.05} onChange={(axle) => setFits({ axle })} />
        <NumberField label={tr("fit.wheel")} hint={tr("fit.wheel_hint")} value={fits.wheelPress} min={0} max={0.6} step={0.05} onChange={(wheelPress) => setFits({ wheelPress })} />
        <NumberField label={tr("fit.magnet")} hint={tr("fit.magnet_hint")} value={fits.magnet} min={0} max={0.6} step={0.05} onChange={(magnet) => setFits({ magnet })} />
      </Section>

      <Section title={tr("export.assembly")}>
        <ol className="steps-text">
          <li>{tr("assembly.track")}</li>
          {pillars.length > 0 && <li>{tr("assembly.supports")}</li>}
          <li>{tr("assembly.wheels")}</li>
          <li>{tr("assembly.magnets")}</li>
          <li>{tr("assembly.body")}</li>
          {anySplit && <li>{tr("assembly.parts")}</li>}
          {driven > 0 && <li>{tr("assembly.cyberbrick")}</li>}
          {project.buildings.length > 0 && <li>{tr("assembly.buildings")}</li>}
        </ol>
      </Section>
    </>
  );
}
