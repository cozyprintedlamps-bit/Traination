// Step 1: plan the track. Three tabs with preview pictures: templates, track pieces (drag them or
// click), and stations and buildings. Below them closing the loop, the status and the selected piece.
import { useEffect, useMemo, useRef, useState } from "react";
import { useAppState, useEngine, useStore } from "../app/context";
import { TRACK_TABS } from "../app/store";
import type { TrackTab } from "../app/store";
import { BUILDING_KINDS, BUILDING_LIMITS } from "../core/buildings";
import type { Building, BuildingKind } from "../core/buildings";
import { TEMPLATES } from "../core/project";
import type { Project, TemplateId } from "../core/project";
import { supports } from "../core/supports";
import { standsOnGround } from "../core/track";
import type { ElementType } from "../core/track";
import { Field, Notice, NumberField, Section } from "./components";
import { BuildingIcon, KindIcon } from "./Icon";
import { buildingName, elementName, tr } from "./i18n";
import type { TextKey } from "./i18n";
import { buildingKey, buildingKindParts, elementKey, elementParts, elementsKey, templateKey, templateParts } from "./previews";
import { Thumb } from "./Thumb";
import { FROM_ABOVE } from "./thumbnails";
import { startElementDrag } from "./TrackTools";
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

/** A line of the layout that has no picture yet: a dashed oval with a plus. */
function EmptyPlan() {
  return (
    <svg viewBox="0 0 120 70" width="64%" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="3" strokeDasharray="7 6" strokeLinecap="round" opacity="0.45">
      <ellipse cx="60" cy="35" rx="50" ry="26" />
      <path d="M60 25 V45 M50 35 H70" strokeDasharray="none" />
    </svg>
  );
}

function TemplatesTab({ project }: { project: Project }) {
  const store = useStore();
  const engine = useEngine();
  // the pictures show what a template would look like with the types of this project
  const base = useMemo(() => elementsKey(project), [project.elements, project.settings]);
  return (
    <>
      <div className="thumb-grid wide">
        {TEMPLATES.map((id: TemplateId) => (
          <button key={id} type="button" className="thumb-tile click" data-testid={`template-${id}`} onClick={() => store.applyTemplate(id)}>
            <Thumb id={templateKey(id, base)} build={() => templateParts(engine, project, id)} direction={FROM_ABOVE} fallback={id === "empty" ? <EmptyPlan /> : undefined} />
            <span className="thumb-name">{tr(`template.${id}` as TextKey)}</span>
          </button>
        ))}
      </div>
      <p className="muted small">{tr("track.templates_hint")}</p>
    </>
  );
}

function RailTile({ type, project }: { type: ElementType; project: Project }) {
  const store = useStore();
  const engine = useEngine();
  const id = useMemo(() => elementKey(project, type), [type, project.settings]);
  const name = elementName(type);
  const picture = (
    <Thumb
      id={id}
      build={() => elementParts(engine, project, type)}
      fallback={
        <span className="thumb-icon" style={{ color: type.color }}>
          <KindIcon kind={type.kind} />
        </span>
      }
    />
  );
  if (handed(type)) {
    // a curve turns left or right: two buttons, and each can be dragged on its own
    return (
      <div className="thumb-tile grab" draggable onDragStart={(e) => startElementDrag(e, type.id)} data-testid={`element-${type.id}`}>
        {picture}
        <span className="thumb-name">{name}</span>
        <span className="thumb-actions">
          <button type="button" className="button small" draggable onDragStart={(e) => startElementDrag(e, type.id, "left")} onClick={() => store.addPiece(type.id, "left")} title={tr("track.left")}>
            ↶ {tr("track.left")}
          </button>
          <button type="button" className="button small" draggable onDragStart={(e) => startElementDrag(e, type.id, "right")} onClick={() => store.addPiece(type.id, "right")} title={tr("track.right")}>
            {tr("track.right")} ↷
          </button>
        </span>
      </div>
    );
  }
  return (
    <button type="button" className="thumb-tile grab" draggable onDragStart={(e) => startElementDrag(e, type.id)} onClick={() => store.addPiece(type.id)} aria-label={`${tr("track.add")}: ${name}`} data-testid={`element-${type.id}`}>
      {picture}
      <span className="thumb-name">{name}</span>
      <span className="thumb-plus" aria-hidden="true">
        +
      </span>
    </button>
  );
}

function RailsTab({ project, targetName }: { project: Project; targetName?: string }) {
  return (
    <>
      <p className="muted small">{targetName ? tr("track.target", { name: targetName }) : project.layout.pieces.length > 0 ? tr("track.target_none") : tr("track.add_hint")}</p>
      <div className="thumb-grid">
        {project.elements.map((t) => (
          <RailTile key={t.id} type={t} project={project} />
        ))}
      </div>
      <p className="muted small">{tr("track.add_hint")}</p>
      <p className="muted small">{tr("track.drag_hint")}</p>
    </>
  );
}

function BuildingsTab({ building }: { building?: Building }) {
  const store = useStore();
  const engine = useEngine();
  return (
    <>
      <div className="thumb-grid wide">
        {BUILDING_KINDS.map((kind: BuildingKind) => (
          <button key={kind} type="button" className="thumb-tile click" data-testid={`building-${kind}`} onClick={() => store.addBuilding(kind)}>
            <Thumb id={buildingKey(kind)} build={() => buildingKindParts(engine, kind)} fallback={<BuildingIcon kind={kind} />} />
            <span className="thumb-name">{tr(`bkind.${kind}` as TextKey)}</span>
          </button>
        ))}
      </div>
      <p className="muted small">{tr("buildings.hint")}</p>
      <h4 className="subhead">{tr("buildings.selected")}</h4>
      {building ? <BuildingEditor b={building} /> : <p className="muted small">{tr("buildings.none")}</p>}
    </>
  );
}

export function TrackPage() {
  const state = useAppState();
  const store = useStore();
  const { project, selection, trackTab } = state;
  const analysis = useAnalysis(project);
  const [closeMessage, setCloseMessage] = useState<{ kind: "ok" | "warning"; text: string } | null>(null);
  const [askClear, setAskClear] = useState(false);
  const target = store.currentTarget();
  const typeOf = new Map(project.elements.map((e) => [e.id, e]));
  const selected = project.layout.pieces.find((p) => p.id === selection.piece);
  const selectedType = selected ? typeOf.get(selected.type) : undefined;
  const targetType = target ? typeOf.get(project.layout.pieces.find((p) => p.id === target.piece)?.type ?? "") : undefined;
  const building = project.buildings.find((b) => b.id === selection.building);

  // a click on a building in the plan or the tree opens its tab, where it can be changed
  const lastBuilding = useRef(selection.building);
  useEffect(() => {
    if (selection.building && selection.building !== lastBuilding.current) store.setTrackTab("buildings");
    lastBuilding.current = selection.building;
  }, [selection.building, store]);

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
      <div className="tabs" role="tablist" aria-label={tr("page.track")}>
        {TRACK_TABS.map((t: TrackTab) => (
          <button key={t} type="button" role="tab" aria-selected={t === trackTab} className={`tab${t === trackTab ? " selected" : ""}`} data-testid={`tab-${t}`} onClick={() => store.setTrackTab(t)}>
            {tr(`track.tab.${t}` as TextKey)}
          </button>
        ))}
      </div>
      <div className="tab-panel" role="tabpanel" data-testid={`panel-${trackTab}`}>
        {trackTab === "templates" && <TemplatesTab project={project} />}
        {trackTab === "rails" && <RailsTab project={project} {...(target && targetType ? { targetName: elementName(targetType) } : {})} />}
        {trackTab === "buildings" && <BuildingsTab {...(building ? { building } : {})} />}
      </div>

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

    </>
  );
}
