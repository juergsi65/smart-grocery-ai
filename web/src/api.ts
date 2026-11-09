import type {
  CombineResponse, OfferRow, OfferStats, OptimizeResponse, Settings, ShoppingListResponse, WeekDay,
} from "./types";

const KEY = "sg.session";
export const session = {
  get: (): { token: string; username: string | null } | null => {
    try { return JSON.parse(localStorage.getItem(KEY) ?? "null"); } catch { return null; }
  },
  set: (v: { token: string; username: string | null }) => { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch { /* privat */ } },
  clear: () => { try { localStorage.removeItem(KEY); } catch { /* privat */ } },
};

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

let onUnauthorized: () => void = () => {};
export const setUnauthorizedHandler = (fn: () => void) => { onUnauthorized = fn; };

async function req<T>(path: string, init: RequestInit = {}): Promise<T> {
  const s = session.get();
  const headers = new Headers(init.headers);
  if (init.body) headers.set("Content-Type", "application/json");
  if (s) headers.set("Authorization", `Bearer ${s.token}`);
  const res = await fetch(`/api${path}`, { ...init, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && s) onUnauthorized();
    throw new ApiError(res.status, (data as { error?: string }).error ?? `Fehler ${res.status}`);
  }
  return data as T;
}
const post = <T,>(path: string, body: unknown) => req<T>(path, { method: "POST", body: JSON.stringify(body) });

export const api = {
  login: (email: string, password: string) =>
    post<{ token: string; username: string | null }>("/cookidoo/login", { email, password }),
  logout: () => req<{ ok: boolean }>("/cookidoo/login", { method: "DELETE" }),
  week: (date: string) => req<WeekDay[]>(`/cookidoo/week?date=${date}`),
  combine: (recipeIds: string[]) => post<CombineResponse>("/cookidoo/combine", { recipeIds }),
  shoppingList: () => req<ShoppingListResponse>("/cookidoo/shopping-list"),
  syncShoppingList: (recipeIds: string[]) => post<ShoppingListResponse>("/cookidoo/shopping-list/sync", { recipeIds }),
  optimize: (body: { source: "recipes" | "shopping-list" | "manual"; recipeIds?: string[]; items?: string[] }) =>
    post<OptimizeResponse>("/optimize", body),
  offerStats: () => req<OfferStats>("/offers/stats"),
  offerSearch: (q: string) => req<OfferRow[]>(`/offers/search?q=${encodeURIComponent(q)}`),
  offerRefresh: (chunk: number) =>
    post<{ offers: number; termsTried: number; termsFailed: number; firstError?: string }>("/offers/refresh", { chunk }),
  offerImport: (offers: unknown[]) =>
    post<{ imported: number; skipped: number; errors: string[] }>("/offers/import", { offers }),
  settings: () => req<Settings>("/optimize/settings"),
  saveSettings: (s: Settings) => req<{ ok: boolean }>("/optimize/settings", { method: "PUT", body: JSON.stringify(s) }),
};
