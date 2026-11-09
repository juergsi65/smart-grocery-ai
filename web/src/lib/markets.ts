import { useCallback, useState } from "react";

const KEY = "sg.markets";
const read = (): string[] => {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
  } catch { return []; }
};

/** Gewaehlte Maerkte (leer = alle). Wird fuer den naechsten Einkauf vorbelegt. */
export function useMarkets() {
  const [markets, setState] = useState<string[]>(read);
  const set = useCallback((next: string[]) => {
    setState(next);
    try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* privat */ }
  }, []);
  const toggle = useCallback((id: string) => {
    setState((cur) => {
      const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
      try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* privat */ }
      return next;
    });
  }, []);
  return { markets, set, toggle };
}
