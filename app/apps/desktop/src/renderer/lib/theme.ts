import { useEffect, useState } from "react";
import type { ThemeChoice } from "@sage/contracts/storage";

export function useTheme() {
  const [choice, setChoice] = useState<ThemeChoice>("system");
  const [systemDark, setSystemDark] = useState(() => matchMedia("(prefers-color-scheme: dark)").matches);

  useEffect(() => { void window.sage.settings.get().then((settings) => setChoice(settings.theme)); }, []);
  useEffect(() => {
    const media = matchMedia("(prefers-color-scheme: dark)");
    const listener = () => setSystemDark(media.matches);
    media.addEventListener("change", listener);
    return () => media.removeEventListener("change", listener);
  }, []);

  const resolved: "light" | "dark" = choice === "dark" || (choice === "system" && systemDark) ? "dark" : "light";
  useEffect(() => { document.documentElement.dataset.theme = resolved; }, [resolved]);

  const select = async (next: ThemeChoice) => {
    setChoice(next);
    await window.sage.settings.update({ theme: next });
    await window.sage.window.applyTheme(next);
  };
  return { choice, resolved, select };
}
