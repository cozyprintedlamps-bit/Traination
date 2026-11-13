import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { AppProvider } from "./app/context";
import { EngineClient } from "./app/engineClient";
import { Store } from "./app/store";
import { App } from "./ui/App";
import { readLanguage, setLanguage } from "./ui/i18n";
import "./ui/styles.css";

setLanguage(readLanguage()); // before the first render, so the page never flashes in German
const store = new Store();
const engine = new EngineClient();

createRoot(document.getElementById("root") as HTMLElement).render(
  <StrictMode>
    <AppProvider store={store} engine={engine}>
      <App />
    </AppProvider>
  </StrictMode>,
);
