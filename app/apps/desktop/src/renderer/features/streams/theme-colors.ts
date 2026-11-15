import { useEffect, useState } from "react";

/** One 1×1 canvas reads every colour back; a canvas per call (45 a second from a live scope) piled up
 *  hundreds of MB of canvas buffers in the renderer until it crashed. */
let probe: CanvasRenderingContext2D | null | undefined;
const resolved = new Map<string, string>();
const RESOLVED_CAP = 512;

/**
 * Resolves a CSS colour (often oklch, or `var(--tf-*)`) to an rgba string for canvas-based widgets
 * (uPlot, xterm). Results are cached by colour and alpha; a theme switch changes the token values, so
 * it gets fresh entries.
 */
export function resolveColor(value: string, alpha = 1): string {
  const token = /^var\((--[\w-]+)\)$/.exec(value.trim())?.[1];
  if (token) return tokenColor(token, alpha);
  const key = `${value}|${alpha}`;
  const cached = resolved.get(key);
  if (cached) return cached;
  if (probe === undefined) {
    const canvas = document.createElement("canvas");
    canvas.width = 1;
    canvas.height = 1;
    probe = canvas.getContext("2d", { willReadFrequently: true });
  }
  if (!probe) return value;
  probe.clearRect(0, 0, 1, 1);
  // An invalid colour leaves fillStyle as it was: start from black, as a fresh canvas would.
  probe.fillStyle = "#000";
  probe.fillStyle = value;
  probe.fillRect(0, 0, 1, 1);
  const [red, green, blue, opacity] = probe.getImageData(0, 0, 1, 1).data;
  const rgba = `rgba(${red}, ${green}, ${blue}, ${((opacity ?? 255) / 255) * alpha})`;
  if (resolved.size >= RESOLVED_CAP) resolved.clear();
  resolved.set(key, rgba);
  return rgba;
}

/**
 * Resolves a design token (`--tf-*`) to an rgba string; canvas widgets cannot read CSS variables
 * themselves.
 */
export function tokenColor(token: string, alpha = 1): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue(token).trim() || "#888";
  return resolveColor(value, alpha);
}

/** Changes whenever the document theme switches, so canvas widgets can rebuild their colours. */
export function useThemeVersion(): number {
  const [version, setVersion] = useState(0);
  useEffect(() => {
    const observer = new MutationObserver(() => setVersion((value) => value + 1));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "class"] });
    return () => observer.disconnect();
  }, []);
  return version;
}

/** The theme's font stack (`--tf-font-sans` / `--tf-font-mono`) for canvas widgets. */
export function fontStack(family: "sans" | "mono"): string {
  const stack = getComputedStyle(document.documentElement).getPropertyValue(`--tf-font-${family}`).trim();
  return stack || (family === "mono" ? "Consolas, monospace" : "sans-serif");
}

/** A canvas font in the theme's font stack. */
export function tokenFont(size: number, family: "sans" | "mono" = "sans"): string {
  return `${size}px ${fontStack(family)}`;
}
