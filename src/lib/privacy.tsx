"use client";
import { createContext, useContext, useState, type ReactNode } from "react";

interface PrivacyCtx {
  hidden: boolean;
  toggle: () => void;
}

const Ctx = createContext<PrivacyCtx>({ hidden: false, toggle: () => {} });

export function PrivacyProvider({ children }: { children: ReactNode }) {
  const [hidden, setHidden] = useState(false);
  return (
    <Ctx.Provider value={{ hidden, toggle: () => setHidden((h) => !h) }}>
      {children}
    </Ctx.Provider>
  );
}

export function usePrivacy() {
  return useContext(Ctx);
}

export function PrivacyToggle() {
  const { hidden, toggle } = usePrivacy();
  return (
    <button
      type="button"
      className="btn-ghost"
      onClick={toggle}
      title={hidden ? "Show financial data" : "Hide financial data"}
      aria-label={hidden ? "Show financial data" : "Hide financial data"}
    >
      <span aria-hidden="true">{hidden ? "🙈" : "👁"}</span>
      <span>{hidden ? "Show $" : "Hide $"}</span>
    </button>
  );
}
