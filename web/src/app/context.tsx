// Store and engine for the components.
import { createContext, useContext, useSyncExternalStore } from "react";
import type { ReactNode } from "react";
import type { EngineClient } from "./engineClient";
import type { State, Store } from "./store";

interface AppContext {
  store: Store;
  engine: EngineClient;
}

const Context = createContext<AppContext | null>(null);

export function AppProvider({ store, engine, children }: AppContext & { children: ReactNode }) {
  return <Context.Provider value={{ store, engine }}>{children}</Context.Provider>;
}

function useApp(): AppContext {
  const value = useContext(Context);
  if (!value) throw new Error("AppProvider missing");
  return value;
}

export const useStore = (): Store => useApp().store;
export const useEngine = (): EngineClient => useApp().engine;

export function useAppState(): State {
  const store = useStore();
  return useSyncExternalStore(store.subscribe, store.getState);
}
