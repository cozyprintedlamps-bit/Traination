// Step 1: plan the track. Templates, the palette of pieces, closing the loop, the selected piece,
// the status, and the stations and buildings beside the track.
import { useState } from "react";
import { useAppState, useStore } from "../app/context";
import { BUILDING_CATEGORIES, BUILDING_CATEGORY_IDS, BUILDING_LIMITS, HAS_SIGN, IS_PLATE } from "../core/buildings";
import type { Building, BuildingCategory, BuildingKind } from "../core/buildings";
import { DEMO_TEMPLATES } from "../core/project";
import type { TemplateId } from "../core/project";
import { supports } from "../core/supports";
import { CATEGORY_IDS, categoryOfKind, standsOnGround } from "../core/track";
import type { ElementType } from "../core/track";
import { Field, Notice, NumberField, Section } from "./components";
import { BuildingIcon, KindIcon } from "./Icon";
import { buildingName, elementName, tr } from "./i18n";
import type { TextKey } from "./i18n";
import { startElementDrag } from "./TrackTools";
import { useAnalysis } from "./useScene";

const handed = (t: ElementType) => t.kind === "curve";

function BuildingEditor({ b }: { b: Building }) {
  const store = useStore();
  const limits = BUILDING_LIMITS[b.kind];
  const set = (patch: Partial<Building>) => store.changeBuilding(b.id, patch);
  const plate = b.kind === "plate_lego" ? 8 : b.kind === "plate_duplo" ? 16 : 1;
  return (
    <>
      <p className="strong">{buildingName(b)}</p>
      {HAS_SIGN.has(b.kind) && (
        <Field label={tr("field.sign")} hint={tr("field.sign_hint")}>
          <input className="input" value={b.name} maxLength={12} onChange={(e) => set({ name: e.target.value })} />
        </Field>
      )}
      {limits.length[0] < limits.length[1] && (
        <NumberField label={tr("field.length")} value={b.length} min={limits.length[0]} max={limits.length[1]} step={plate} onChange={(length) => set({ length })} />
      )}
      <NumberField label={tr("field.width")} value={b.width} min={limits.width[0]} max={limits.width[1]} step={plate} onChange={(width) => set({ width })} />
      {limits.height[0] < limits.height[1] && <NumberField label={tr("field.bheight")} value={b.height} min={limits.height[0]} max={limits.height[1]} onChange={(height) => set({ height })} />}
      {IS_PLATE.has(b.kind) && <p className="muted small">{tr("buildings.plate_hint")}</p>}
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
  const [askClear, setAskClear] = useState(false);
  const [buildingCategory, setBuildingCategory] = useState<BuildingCategory>("stations");
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
    const types = new Set(project.elements.map((e) => e.id));
    const error = store.closeTrack();
    if (error) {
      setCloseMessage({ kind: "warning", text: tr(`close.${error}` as TextKey) });
      return;
    }
    const after = store.getState().project;
    const added = after.layout.pieces.slice(before);
    // pieces of types that did not exist before were calculated for this gap
    const fit = added.filter((p) => !types.has(p.type)).length;
    setCloseMessage({ kind: "ok", text: fit > 0 ? tr("close.done_fit", { n: added.length, fit }) : tr("close.done", { n: added.length }) });
  };

  return (
    <>
      <Section title={tr("track.templates")}>
        <div className="choices">
          {DEMO_TEMPLATES.map((id: TemplateId) => (
            <button key={id} type="button" className="chip" data-testid={`template-${id}`} onClick={() => store.applyTemplate(id)}>
              {tr(`template.${id}` as TextKey)}
            </button>
          ))}
        </div>
        <p className="muted small">{tr("track.demo_hint")}</p>
        <button
          type="button"
          className="button primary own-track"
          data-testid="own-track"
          onClick={() => {
            store.startOwnTrack();
            setCloseMessage({ kind: "ok", text: tr("track.own_started") });
          }}
        >
          ✎ {tr("track.own")}
        </button>
        <p className="muted small">{tr("track.own_hint")}</p>
      </Section>

      <Section title={tr("track.add")}>
        <p className="muted small">{target && targetType ? tr("track.target", { name: elementName(targetType) }) : project.layout.pieces.length > 0 ? tr("track.target_none") : tr("track.add_hint")}</p>
        {CATEGORY_IDS.map((category) => {
          const list = project.elements.filter((t) => categoryOfKind(t.kind) === category);
          if (list.length === 0) return null;
          return (
            <div key={category} className="palette-group">
              <h4 className="subhead">{tr(`ecat.${category}` as TextKey)}</h4>
        <div className="palette-list">
          {list.map((t) => (
            <div key={t.id} className="palette-item" draggable onDragStart={(e) => startElementDrag(e, t.id)} data-testid={`element-${t.id}`}>
              <span className="palette-icon" style={{ color: t.color }}>
                <KindIcon kind={t.kind} />
              </span>
              <span className="palette-name">{elementName(t)}</span>
              {handed(t) ? (
                <span className="palette-actions">
                  <button type="button" className="button small" draggable onDragStart={(e) => startElementDrag(e, t.id, "left")} onClick={() => store.addPiece(t.id, "left")} title={tr("track.left")}>
                    ↶ {tr("track.left")}
                  </button>
                  <button type="button" className="button small" draggable onDragStart={(e) => startElementDrag(e, t.id, "right")} onClick={() => store.addPiece(t.id, "right")} title={tr("track.right")}>
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
            </div>
          );
        })}
        <p className="muted small">{tr("track.add_hint")}</p>
        <p className="muted small">{tr("track.drag_hint")}</p>
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
        {project.layout.pieces.length > 0 &&
          (askClear ? (
            <div className="confirm" role="alertdialog" aria-label={tr("track.clear")}>
              <p className="small">{tr("track.clear_ask")}</p>
              <div className="row">
                <button
                  type="button"
                  className="button danger"
                  data-testid="clear-track-yes"
                  onClick={() => {
                    store.clearTrack();
                    setAskClear(false);
                    setCloseMessage({ kind: "ok", text: tr("track.cleared") });
                  }}
                >
                  {tr("track.clear_yes")}
                </button>
                <button type="button" className="button" onClick={() => setAskClear(false)}>
                  {tr("common.cancel")}
                </button>
              </div>
            </div>
          ) : (
            <button type="button" className="button danger subtle" data-testid="clear-track" onClick={() => setAskClear(true)}>
              {tr("track.clear")}
            </button>
          ))}
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
        <div className="choices" role="tablist">
          {BUILDING_CATEGORY_IDS.map((c) => (
            <button key={c} type="button" role="tab" aria-selected={c === buildingCategory} className={`chip${c === buildingCategory ? " selected" : ""}`} data-testid={`bcat-${c}`} onClick={() => setBuildingCategory(c)}>
              {tr(`bcat.${c}` as TextKey)}
            </button>
          ))}
        </div>
        <div className="building-grid">
          {BUILDING_CATEGORIES[buildingCategory].map((kind: BuildingKind) => (
            <button key={kind} type="button" className="tile" data-testid={`building-${kind}`} onClick={() => store.addBuilding(kind)}>
              <BuildingIcon kind={kind} />
              <span>{tr(`bkind.${kind}` as TextKey)}</span>
            </button>
          ))}
        </div>
        <p className="muted small">{tr(buildingCategory === "tunnels" ? "buildings.tunnel_hint" : "buildings.hint")}</p>
        <h4 className="subhead">{tr("buildings.selected")}</h4>
        {building ? <BuildingEditor b={building} /> : <p className="muted small">{tr("buildings.none")}</p>}
      </Section>
    </>
  );
}
