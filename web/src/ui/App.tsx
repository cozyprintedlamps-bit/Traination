// The page: toolbar, steps on the left, the working page, the 3D view as the stage and the plan
// on the right ("Studio" layout from TactileManufactory).
import { useEffect, useState } from "react";
import { useAppState, useEngine, useStore } from "../app/context";
import { STEPS } from "../app/store";
import type { StepId } from "../app/store";
import { ProjectFileError } from "../core/project";
import { DesignPage } from "./DesignPage";
import { ElementsPage } from "./ElementsPage";
import { ExportPage } from "./ExportPage";
import { download, pickTextFile } from "./files";
import { Icon } from "./Icon";
import { LANGUAGES, language, setLanguage, tr } from "./i18n";
import type { Language, TextKey } from "./i18n";
import { PlanView } from "./PlanView";
import { TrackPage } from "./TrackPage";
import { useAnalysis, useScene } from "./useScene";
import { VehiclesPage } from "./VehiclesPage";
import { Viewer3D } from "./Viewer3D";
import { serialize } from "../core/project";

type Theme = "light" | "dark";
const THEME_KEY = "traination.theme";

function readTheme(): Theme {
  try {
    const stored = localStorage.getItem(THEME_KEY);
    if (stored === "light" || stored === "dark") return stored;
  } catch {
    // default below
  }
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

const PAGES: Record<StepId, () => React.JSX.Element> = {
  track: TrackPage,
  elements: ElementsPage,
  vehicles: VehiclesPage,
  design: DesignPage,
  export: ExportPage,
};

/** Steps that show the plan on the right. */
const WITH_PLAN: ReadonlySet<StepId> = new Set(["track", "elements", "export"]);

export function App() {
  const state = useAppState();
  const store = useStore();
  const engine = useEngine();
  const [theme, setTheme] = useState<Theme>(readTheme);
  const [, setLang] = useState<Language>(language());
  const [notice, setNotice] = useState<string>("");
  const { project, step, selection } = state;
  const analysis = useAnalysis(project);
  const scene = useScene(engine, state);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {
      // not remembered
    }
  }, [theme]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement || e.target instanceof HTMLTextAreaElement;
      if (typing) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) store.redo();
        else store.undo();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") {
        e.preventDefault();
        store.redo();
      } else if ((e.key === "Delete" || e.key === "Backspace") && step === "track" && state.selection.piece) {
        store.removePiece(state.selection.piece);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [store, step, state.selection.piece]);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(""), 3500);
    return () => clearTimeout(t);
  }, [notice]);

  const open = async () => {
    const text = await pickTextFile(".trproj,application/json");
    if (!text) return;
    try {
      store.load(text);
      setNotice(tr("file.loaded"));
    } catch (error) {
      const code = error instanceof ProjectFileError ? error.message : "not_project";
      setNotice(tr(`file.${code}` as TextKey));
    }
  };
  const save = () => {
    const base = (project.name.trim() || "traination").replace(/[^\w.-]+/g, "_");
    download(new TextEncoder().encode(serialize(project)), `${base}.trproj`, "application/json");
    setNotice(tr("file.saved"));
  };

  const index = STEPS.indexOf(step);
  const Page = PAGES[step];
  const target = store.currentTarget();
  const showPlan = WITH_PLAN.has(step);
  // the key of the parts that are built (not of the step): the view fits once the new parts are there
  const fitKey = `${scene.key}|${state.fitToken}`;

  return (
    <div className={`app${showPlan ? " with-plan" : ""}`}>
      <header className="toolbar">
        <div className="tb-group">
          <span className="brand">
            <svg viewBox="0 0 32 32" width="22" height="22" aria-hidden="true">
              <rect x="3" y="9" width="20" height="13" rx="3" fill="var(--accent)" />
              <rect x="21" y="5" width="8" height="17" rx="2" fill="var(--accent)" opacity="0.7" />
              <circle cx="9" cy="25" r="3.2" fill="var(--ink)" />
              <circle cx="21" cy="25" r="3.2" fill="var(--ink)" />
            </svg>
            {tr("app.title")}
          </span>
          <button type="button" className="tb-button" onClick={() => store.newProject("oval")} title={tr("tb.new")} aria-label={tr("tb.new")}>
            <Icon name="new" />
          </button>
          <button type="button" className="tb-button" onClick={open} title={tr("tb.open")} aria-label={tr("tb.open")}>
            <Icon name="open" />
          </button>
          <button type="button" className="tb-button" onClick={save} title={tr("tb.save")} aria-label={tr("tb.save")}>
            <Icon name="save" />
          </button>
          <button type="button" className="tb-button" disabled={!state.canUndo} onClick={() => store.undo()} title={`${tr("tb.undo")} (Ctrl+Z)`} aria-label={tr("tb.undo")}>
            <Icon name="undo" />
          </button>
          <button type="button" className="tb-button" disabled={!state.canRedo} onClick={() => store.redo()} title={`${tr("tb.redo")} (Ctrl+Y)`} aria-label={tr("tb.redo")}>
            <Icon name="redo" />
          </button>
        </div>
        <div className="tb-group">
          <button type="button" className="tb-button" onClick={() => store.fit()} title={tr("tb.fit")} aria-label={tr("tb.fit")}>
            <Icon name="fit" />
          </button>
          <button type="button" className="tb-button" onClick={() => setTheme(theme === "dark" ? "light" : "dark")} title={tr("tb.theme")} aria-label={tr("tb.theme")}>
            <Icon name="theme" />
          </button>
          <select
            className="lang"
            value={language()}
            aria-label={tr("tb.language")}
            onChange={(e) => {
              setLanguage(e.target.value as Language);
              setLang(e.target.value as Language);
            }}
          >
            {LANGUAGES.map((l) => (
              <option key={l} value={l}>
                {l.toUpperCase()}
              </option>
            ))}
          </select>
        </div>
      </header>

      <main className="stage">
        <div className="panel-3d">
          <Viewer3D parts={scene.parts} fitKey={fitKey} busy={scene.busy} error={scene.error} />
        </div>

        <nav className="panel steps" aria-label="Steps">
          <ol>
            {STEPS.map((s, i) => (
              <li key={s}>
                <button type="button" data-testid={`step-${s}`} className={`step-button${s === step ? " selected" : ""}`} onClick={() => store.setStep(s)} aria-current={s === step ? "step" : undefined}>
                  <span className="step-no">{i + 1}</span>
                  <span className="step-name">{tr(`step.${s}` as TextKey)}</span>
                </button>
              </li>
            ))}
          </ol>
        </nav>

        <section className="panel panel-page">
          <h2 className="heading">{tr(`page.${step}` as TextKey)}</h2>
          <Page />
        </section>

        <div className="nav-buttons">
          <button type="button" className="button" disabled={index === 0} onClick={() => store.setStep(STEPS[index - 1] as StepId)}>
            ← {tr("nav.back")}
          </button>
          <button type="button" className="button primary" disabled={index === STEPS.length - 1} onClick={() => store.setStep(STEPS[index + 1] as StepId)}>
            {tr("nav.next")} →
          </button>
        </div>

        {showPlan && (
          <aside className="panel panel-plan">
            <header className="section-head">
              <h3>{tr("plan.caption")}</h3>
              <span className="muted small">{tr("plan.hint")}</span>
            </header>
            <PlanView
              project={project}
              analysis={analysis}
              selection={selection}
              target={target ? { piece: target.piece, index: target.index } : undefined}
              interactive={step === "track"}
              highlightElement={step === "elements" ? selection.element : undefined}
              onSelectPiece={(id) => {
                if (step === "elements" && id) {
                  const piece = project.layout.pieces.find((p) => p.id === id);
                  store.select({ element: piece?.type, piece: id });
                } else store.select({ piece: id });
              }}
              onSelectPort={(piece, index) => store.select({ target: { piece, index } })}
              onDragStart={() => store.beginGesture()}
              onDrag={(piece, dx, dy) => store.moveRoot(store.rootOf(piece), dx, dy, false)}
            />
          </aside>
        )}

        <div className="statusbar" aria-live="polite">
          {notice && <span className="toast">{notice}</span>}
        </div>
      </main>
    </div>
  );
}
