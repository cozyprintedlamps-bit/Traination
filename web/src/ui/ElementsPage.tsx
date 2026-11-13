// Step 2: the kinds of pieces and their parameters, plus the track settings.
import { useState } from "react";
import { useAppState, useStore } from "../app/context";
import { ELEMENT_KINDS, elementShape, outline } from "../core/track";
import type { ElementKind, ElementType } from "../core/track";
import { printerById } from "../presets/print";
import { PEG_REACH } from "../presets/gauge";
import { Choice, ColorPicker, Field, Notice, NumberField, Section, Toggle } from "./components";
import { KindIcon } from "./Icon";
import { elementName, formatNumber, tr } from "./i18n";
import type { TextKey } from "./i18n";

/** Footprint of an element (with pegs) seen from above, to compare with the bed. */
function footprint(t: ElementType): [number, number] {
  const pts = outline(t).flat();
  const ports = elementShape(t).ports.filter((p) => p.gender === "male");
  const xs = [...pts.map((p) => p[0]), ...ports.map((p) => p.x + Math.cos((p.heading * Math.PI) / 180) * PEG_REACH)];
  const ys = [...pts.map((p) => p[1]), ...ports.map((p) => p.y + Math.sin((p.heading * Math.PI) / 180) * PEG_REACH)];
  return [Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)];
}

export function ElementsPage() {
  const { project, selection } = useAppState();
  const store = useStore();
  const [newKind, setNewKind] = useState<ElementKind>("straight");
  const t = project.elements.find((e) => e.id === selection.element);
  const used = (id: string) => project.layout.pieces.filter((p) => p.type === id).length;
  const set = (patch: Partial<ElementType>) => t && store.changeElement(t.id, patch);
  const printer = printerById(project.settings.printer);
  const size = t ? footprint(t) : undefined;
  const tooBig = size && !((size[0] <= printer.bed[0] - 12 && size[1] <= printer.bed[1] - 12) || (size[1] <= printer.bed[0] - 12 && size[0] <= printer.bed[1] - 12));

  return (
    <>
      <Section title={tr("elements.list")}>
        <div className="card-list">
          {project.elements.map((e) => {
            const n = used(e.id);
            return (
              <button key={e.id} type="button" className={`card${e.id === t?.id ? " selected" : ""}`} onClick={() => store.select({ element: e.id })}>
                <span className="palette-icon" style={{ color: e.color }}>
                  <KindIcon kind={e.kind} />
                </span>
                <span className="card-text">
                  <span>{elementName(e)}</span>
                  <span className="muted small">{n > 0 ? tr("elements.used", { n }) : tr("elements.unused")}</span>
                </span>
              </button>
            );
          })}
        </div>
        <div className="row">
          <select className="input" value={newKind} onChange={(e) => setNewKind(e.target.value as ElementKind)} aria-label={tr("elements.add")}>
            {ELEMENT_KINDS.map((k) => (
              <option key={k} value={k}>
                {tr(`kind.${k}` as TextKey)}
              </option>
            ))}
          </select>
          <button type="button" className="button primary" onClick={() => store.addElement(newKind)}>
            + {tr("elements.add")}
          </button>
        </div>
      </Section>

      {t && (
        <Section title={elementName(t)} aside={<span className="muted small">{tr(`kind.${t.kind}` as TextKey)}</span>}>
          <Field label={tr("field.name")}>
            <input className="input" value={t.name} placeholder={tr("field.name_placeholder")} onChange={(e) => set({ name: e.target.value })} />
          </Field>
          {["straight", "switch", "crossing", "ramp", "bridge", "buffer", "adapter"].includes(t.kind) && (
            <NumberField label={tr("field.length")} value={t.length} min={t.kind === "adapter" ? 10 : 30} max={400} step={1} onChange={(length) => set({ length })} />
          )}
          {["curve", "switch", "yswitch"].includes(t.kind) && (
            <>
              <NumberField label={tr("field.radius")} value={t.radius} min={60} max={500} onChange={(radius) => set({ radius })} />
              <NumberField label={tr("field.angle")} value={t.angle} min={5} max={90} step={0.5} unit="°" onChange={(angle) => set({ angle })} />
            </>
          )}
          {t.kind === "switch" && (
            <Field label={tr("field.hand")}>
              <Choice value={t.hand} options={[{ value: "left", label: tr("hand.left") }, { value: "right", label: tr("hand.right") }]} onChange={(hand) => set({ hand })} />
            </Field>
          )}
          {t.kind === "crossing" && <NumberField label={tr("field.cross_angle")} value={t.crossAngle} min={30} max={90} unit="°" onChange={(crossAngle) => set({ crossAngle })} />}
          {t.kind === "ramp" && (
            <>
              <NumberField label={tr("field.height")} value={t.height} min={0} max={150} onChange={(height) => set({ height })} />
              <NumberField label={tr("field.rise")} value={t.rise} min={-t.height} max={80} onChange={(rise) => set({ rise })} />
            </>
          )}
          {t.kind === "bridge" && <NumberField label={tr("field.bridge_height")} value={t.height} min={20} max={150} onChange={(height) => set({ height })} />}
          {t.kind === "adapter" && (
            <Field label={tr("field.adapter")}>
              <Choice value={t.adapter} options={[{ value: "male", label: tr("gender.male") }, { value: "female", label: tr("gender.female") }]} onChange={(adapter) => set({ adapter })} />
            </Field>
          )}
          <ColorPicker label={tr("design.colors")} value={t.color} onChange={(color) => set({ color })} />
          {tooBig && size && <Notice kind="warning">{tr("el.too_big", { size: `${formatNumber(size[0], 0)} × ${formatNumber(size[1], 0)}` })}</Notice>}
          <div className="row">
            <button type="button" className="button" onClick={() => store.duplicateElement(t.id)}>
              {tr("elements.duplicate")}
            </button>
            <button type="button" className="button danger" onClick={() => store.removeElement(t.id)}>
              {used(t.id) > 0 ? tr("elements.remove_used", { n: used(t.id) }) : tr("elements.remove")}
            </button>
          </div>
        </Section>
      )}

      <Section title={tr("settings.track")}>
        <Toggle label={tr("settings.double")} hint={tr("settings.double_hint")} checked={project.settings.doubleSided} onChange={(doubleSided) => store.changeSettings({ doubleSided })} />
        <NumberField label={tr("settings.connector_fit")} hint={tr("settings.connector_fit_hint")} value={project.settings.connectorFit} min={0} max={1.5} step={0.05} onChange={(connectorFit) => store.changeSettings({ connectorFit })} />
        <p className="muted small">{tr("gauge.note")}</p>
      </Section>
    </>
  );
}
