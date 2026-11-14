// Step 1: plan the track. Templates, the palette of pieces, closing the loop, the selected piece,
// the status, and the stations and buildings beside the track.
import { useState } from "react";
import { useAppState, useStore } from "../app/context";
import { BUILDING_KINDS, BUILDING_LIMITS } from "../core/buildings";
import type { Building, BuildingKind } from "../core/buildings";
import { TEMPLATES } from "../core/project";
import type { TemplateId } from "../core/project";
import { supports } from "../core/supports";
import { standsOnGround } from "../core/track";
import type { ElementType } from "../core/track";
import { Field, Notice, NumberField, Section } from "./components";
import { BuildingIcon, KindIcon } from "./Icon";
import { buildingName, elementName, tr } from "./i18n";
import type { TextKey } from "./i18n";
import { useAnalysis } from "./useScene";

const handed = (t: ElementType) => t.kind === "curve";

function BuildingEditor({ b }: { b: Building }) {
  const store = useStore();
  const limits = BUILDING_LIMITS[b.kind];
  const set = (patch: Partial<Building>) => store.changeBuilding(b.id, patch);
  return (
    <>
      <p className="strong">{buildingName(b)}</p>
      {(b.kind === "station" || b.kind === "house" || b.kind === "signalbox") && (
        <Field label={tr("field.sign")} hint={tr("field.sign_hint")}>
          <input className="input" value={b.name} maxLength={12} onChange={(e) => set({ name: e.target.value })} />
        </Field>
      )}
      <NumberField label={tr("field.length")} value={b.length} min={limits.length[0]} max={limits.length[1]} onChange={(length) => set({ length })} />
      <NumberField label={tr("field.width")} value={b.width} min={limits.width[0]} max={limits.width[1]} onChange={(width) => set({ width })} />
      <NumberField label={tr("field.bheight")} value={b.height} min={limits.height[0]} max={limits.height[1]} onChange={(height) => set({ height })} />
      <div className="row">
        <button type="button" className="button" onClick={() => set({ rotation: (b.rotation + 45) % 360 })}>
          {tr("buildings.turn")} 45°
        </button>
        <button type="button" className="button danger" onClick={() => store.removeBuilding(b.id)}>
          {tr("buildings.remove")}
        </button>
      </div>
    </>
  );
}

export function TrackPage() {
  const state = useAppState();
  const store = useStore();
  const { project, selection } = state;
  const analysis = useAnalysis(project);
  const [closeMessage, setCloseMessage] = useState<{ kind: "ok" | "warning"; text: string } | null>(null);
  const target = store.currentTarget();
  const typeOf = new Map(project.elements.map((e) => [e.id, e]));
  const selected = project.layout.pieces.find((p) => p.id === selection.piece);
  const selectedType = selected ? typeOf.get(selected.type) : undefined;
  const targetType = target ? typeOf.get(project.layout.pieces.find((p) => p.id === target.piece)?.type ?? "") : undefined;
  const building = project.buildings.find((b) => b.id === selection.building);

  const mismatched = analysis.joints.filter((j) => !j.fits).length;
  const closed = analysis.joints.filter((j) => j.closed).length;
  const pillars = supports(project.layout, project.elements, analysis).length;
  const problems = mismatched + analysis.overlapping.length;

  const close = () => {
    const before = project.layout.pieces.length;
    const error = store.closeTrack();
    if (error) setCloseMessage({ kind: "warning", text: tr(`close.${error}` as TextKey) });
    else setCloseMessage({ kind: "ok", text: tr("close.done", { n: store.getState().project.layout.pieces.length - before }) });
  };

  return (
    <>
      <Section title={tr("track.templates")}>
        <div className="choices">
          {TEMPLATES.map((id: TemplateId) => (
            <button key={id} type="button" className="chip" onClick={() => store.applyTemplate(id)}>
              {tr(`template.${id}` as TextKey)}
            </button>
          ))}
        </div>
      </Section>

      <Section title={tr("track.add")}>
        <p className="muted small">{target && targetType ? tr("track.target", { name: elementName(targetType) }) : project.layout.pieces.length > 0 ? tr("track.target_none") : tr("track.add_hint")}</p>
        <div className="palette-list">
          {project.elements.map((t) => (
            <div key={t.id} className="palette-item">
              <span className="palette-icon" style={{ color: t.color }}>
                <KindIcon kind={t.kind} />
              </span>
              <span className="palette-name">{elementName(t)}</span>
              {handed(t) ? (
                <span className="palette-actions">
                  <button type="button" className="button small" onClick={() => store.addPiece(t.id, "left")} title={tr("track.left")}>
                    ↶ {tr("track.left")}
                  </button>
                  <button type="button" className="button small" onClick={() => store.addPiece(t.id, "right")} title={tr("track.right")}>
                    {tr("track.right")} ↷
                  </button>
                </span>
              ) : (
                <span className="palette-actions">
                  <button type="button" className="button small" onClick={() => store.addPiece(t.id)} aria-label={`${tr("track.add")}: ${elementName(t)}`}>
                    +
                  </button>
                </span>
              )}
            </div>
          ))}
        </div>
        <p className="muted small">{tr("track.add_hint")}</p>
      </Section>

      <Section title={tr("track.status")}>
        <ul className="status-list">
          <li>{tr("status.pieces", { n: project.layout.pieces.length })}</li>
          {closed > 0 && <li className="ok">{closed === 1 ? tr("status.closed") : tr("status.loops", { n: closed })}</li>}
          {analysis.open.length > 0 && <li>{tr("status.open", { n: analysis.open.length })}</li>}
          {pillars > 0 && <li>{tr("status.supports", { n: pillars })}</li>}
          {mismatched > 0 && <li className="warning">{tr("status.mismatch", { n: mismatched })}</li>}
          {analysis.overlapping.length > 0 && <li className="warning">{tr("status.overlap", { n: analysis.overlapping.length })}</li>}
        </ul>
        {analysis.open.length >= 2 && (
          <>
            <button type="button" className="button primary" data-testid="close-track" onClick={close}>
              ⟲ {tr("track.close")}
            </button>
            <p className="muted small">{tr("track.close_hint")}</p>
          </>
        )}
        {closeMessage && <Notice kind={closeMessage.kind}>{closeMessage.text}</Notice>}
        {problems === 0 && analysis.open.length === 0 && project.layout.pieces.length > 0 && <Notice kind="ok">{tr("status.ok")}</Notice>}
      </Section>

      <Section title={tr("track.selected")}>
        {selected && selectedType ? (
          <>
            <p className="strong">{elementName(selectedType, selected.variant)}</p>
            <div className="choices">
              {!standsOnGround(selectedType.kind) && (
                <button type="button" className="button" onClick={() => store.mirrorPiece(selected.id)}>
                  {tr("track.mirror")}
                </button>
              )}
              <button type="button" className="button" onClick={() => store.swapPiece(selected.id)}>
                {tr("track.swap")}
              </button>
              <button type="button" className="button" onClick={() => store.turnRoot(store.rootOf(selected.id), 45)}>
                {tr("track.turn")} 45°
              </button>
              <button type="button" className="button danger" onClick={() => store.removePiece(selected.id)}>
                {tr("track.remove")}
              </button>
            </div>
          </>
        ) : (
          <p className="muted small">{tr("track.none_selected")}</p>
        )}
      </Section>

      <Section title={tr("buildings.title")}>
        <div className="building-grid">
          {BUILDING_KINDS.map((kind: BuildingKind) => (
            <button key={kind} type="button" className="tile" onClick={() => store.addBuilding(kind)}>
              <BuildingIcon kind={kind} />
              <span>{tr(`bkind.${kind}` as TextKey)}</span>
            </button>
          ))}
        </div>
        <p className="muted small">{tr("buildings.hint")}</p>
        <h4 className="subhead">{tr("buildings.selected")}</h4>
        {building ? <BuildingEditor b={building} /> : <p className="muted small">{tr("buildings.none")}</p>}
      </Section>
    </>
  );
}
