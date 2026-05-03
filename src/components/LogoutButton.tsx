"use client";

import { useState } from "react";

export function LogoutButton() {
  const [busy, setBusy] = useState(false);

  async function onClick() {
    if (busy) return;
    setBusy(true);
    try {
      await fetch("/api/logout", { method: "POST" });
    } catch {
      /* ignore — we'll redirect anyway */
    }
    window.location.href = "/login";
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className="btn-ghost"
      title="Sign out"
    >
      {busy ? "Signing out…" : "Sign out"}
    </button>
  );
}
