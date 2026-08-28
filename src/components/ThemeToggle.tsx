"use client";

import { useEffect, useState } from "react";
import { IconLuna, IconMonitor, IconSol } from "./icons";

type Theme = "light" | "dark" | "system";

const OPTIONS: { value: Theme; label: string; Icon: typeof IconSol }[] = [
  { value: "light", label: "Claro", Icon: IconSol },
  { value: "dark", label: "Oscuro", Icon: IconLuna },
  { value: "system", label: "Sistema", Icon: IconMonitor },
];

/**
 * Selector de tema. Escribe `data-theme` en <html> y lo guarda en
 * localStorage. El parpadeo inicial lo evita el script de `ThemeScript`,
 * que corre antes de pintar.
 */
export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("system");

  useEffect(() => {
    const stored = localStorage.getItem("netflow-theme") as Theme | null;
    if (stored === "light" || stored === "dark" || stored === "system") setTheme(stored);
  }, []);

  function apply(next: Theme) {
    setTheme(next);
    try {
      localStorage.setItem("netflow-theme", next);
    } catch {
      /* modo privado: el tema vale solo para esta pestaña */
    }
    const root = document.documentElement;
    if (next === "system") root.removeAttribute("data-theme");
    else root.setAttribute("data-theme", next);
  }

  return (
    <div
      role="group"
      aria-label="Tema"
      className="inline-flex rounded-lg border border-border bg-surface p-0.5"
    >
      {OPTIONS.map(({ value, label, Icon }) => (
        <button
          key={value}
          type="button"
          onClick={() => apply(value)}
          aria-pressed={theme === value}
          title={label}
          className={`grid min-h-10 min-w-10 place-items-center rounded-md transition-colors ${
            theme === value ? "bg-surface-3 text-text" : "text-faint hover:text-text"
          }`}
        >
          <Icon size={15} />
          <span className="sr-only">{label}</span>
        </button>
      ))}
    </div>
  );
}
