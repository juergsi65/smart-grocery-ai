/**
 * Schlanker Cookidoo-Client fuer Cloudflare Workers.
 *
 * Port der Endpunkte und des Login-Flows aus `cookidoo-api` 0.17.2 (Python,
 * inoffiziell/reverse-engineered). Workers haben keinen Cookie-Jar, daher
 * werden Redirects manuell verfolgt und Cookies ueber domainuebergreifende
 * Redirects (cookidoo.<tld> <-> ciam.prod.cookidoo.vorwerk-digital.com) selbst verwaltet.
 */

const CIAM_LOGIN_SRV_URL = "https://ciam.prod.cookidoo.vorwerk-digital.com/login-srv/login";
const REQUIRED_COOKIES = ["_oauth2_proxy", "v-authenticated"];
const MAX_REDIRECTS = 15;

export class CookidooAuthError extends Error {}
export class CookidooRequestError extends Error {}
export class CookidooParseError extends Error {}

// ------------------------------------------------------------------ Cookie-Jar
export interface StoredCookie {
  name: string;
  value: string;
  domain: string; // ohne fuehrenden Punkt
  hostOnly: boolean;
  path: string;
  secure: boolean;
  expires?: number; // epoch ms
}

export class CookieJar {
  constructor(public cookies: StoredCookie[] = []) {}

  setFromResponse(url: URL, res: Response): void {
    const lines: string[] =
      typeof (res.headers as any).getSetCookie === "function"
        ? (res.headers as any).getSetCookie()
        : (res.headers.get("set-cookie") ?? "").split(/,(?=\s*[^;,]+=)/).filter(Boolean);
    for (const line of lines) this.setFromHeader(url, line);
  }

  private setFromHeader(url: URL, header: string): void {
    const parts = header.split(";").map((p) => p.trim());
    const [nv, ...attrs] = parts;
    const eq = nv.indexOf("=");
    if (eq <= 0) return;
    const c: StoredCookie = {
      name: nv.slice(0, eq),
      value: nv.slice(eq + 1),
      domain: url.hostname.toLowerCase(),
      hostOnly: true,
      path: "/",
      secure: false,
    };
    let deleteIt = false;
    for (const a of attrs) {
      const i = a.indexOf("=");
      const k = (i < 0 ? a : a.slice(0, i)).toLowerCase();
      const v = i < 0 ? "" : a.slice(i + 1);
      if (k === "domain" && v) {
        c.domain = v.replace(/^\./, "").toLowerCase();
        c.hostOnly = false;
      } else if (k === "path" && v.startsWith("/")) c.path = v;
      else if (k === "secure") c.secure = true;
      else if (k === "max-age") {
        const s = Number(v);
        if (Number.isFinite(s)) {
          if (s <= 0) deleteIt = true;
          else c.expires = Date.now() + s * 1000;
        }
      } else if (k === "expires" && c.expires === undefined) {
        const t = Date.parse(v);
        if (!Number.isNaN(t)) {
          if (t <= Date.now()) deleteIt = true;
          else c.expires = t;
        }
      }
    }
    this.cookies = this.cookies.filter(
      (x) => !(x.name === c.name && x.domain === c.domain && x.path === c.path),
    );
    if (!deleteIt && c.value !== "") this.cookies.push(c);
  }

  headerFor(url: URL): string {
    const host = url.hostname.toLowerCase();
    const now = Date.now();
    return this.cookies
      .filter((c) => {
        if (c.expires !== undefined && c.expires <= now) return false;
        if (c.secure && url.protocol !== "https:") return false;
        const domainOk = c.hostOnly ? host === c.domain : host === c.domain || host.endsWith("." + c.domain);
        return domainOk && url.pathname.startsWith(c.path);
      })
      .sort((a, b) => b.path.length - a.path.length)
      .map((c) => `${c.name}=${c.value}`)
      .join("; ");
  }

  hasAuthCookies(): boolean {
    const names = new Set(this.cookies.map((c) => c.name));
    return REQUIRED_COOKIES.every((n) => names.has(n));
  }

  toJSON(): string {
    return JSON.stringify(this.cookies);
  }
  static fromJSON(s: string): CookieJar {
    return new CookieJar(JSON.parse(s) as StoredCookie[]);
  }
}

// ----------------------------------------------------------------- Lokalisierung
/** Cookidoo-Domain je Land (Auszug; Quelle: cookidoo-api localization.json). */
const LOCALIZATION: Record<string, { language: string; url: string }> = {
  at: { language: "de-AT", url: "https://cookidoo.at/foundation/de-AT" },
  de: { language: "de-DE", url: "https://cookidoo.de/foundation/de-DE" },
  ch: { language: "de-CH", url: "https://cookidoo.ch/foundation/de-CH" },
};

export interface Localization {
  language: string;
  origin: string;
}

export function localizationFor(country: string): Localization {
  const loc = LOCALIZATION[country.toLowerCase()];
  if (!loc) throw new CookidooRequestError(`Land '${country}' wird (noch) nicht unterstuetzt`);
  return { language: loc.language, origin: new URL(loc.url).origin };
}

// -------------------------------------------------------------------- Rohtypen
export interface RecipeRef {
  id: string;
  name: string;
  totalTime: number | null;
  thumbnail: string | null;
  url: string;
}
export interface WeekDay {
  id: string;
  title: string;
  recipes: RecipeRef[];
}
export interface RawIngredient {
  id: string;
  name: string;
  description: string;
}
export interface RecipeDetails {
  id: string;
  name: string;
  url: string;
  servingSize: number | null;
  totalTime: number | null;
  ingredients: RawIngredient[];
}
export interface IngredientItem {
  id: string;
  name: string;
  isOwned: boolean;
  description: string;
}
export interface AdditionalItem {
  id: string;
  name: string;
  isOwned: boolean;
}

// ----------------------------------------------------------------------- Client
function quantityToString(q: any): string {
  if (!q) return "";
  if (q.value) return String(q.value);
  if (q.from && q.to) return `${q.from} - ${q.to}`;
  return "";
}

function ingredientDescription(i: any): string {
  const qs = quantityToString(i.quantity);
  if (i.unitNotation && i.quantity) return `${qs} ${i.unitNotation}`;
  return i.quantity ? qs : "";
}

/** Erstes Bild aus descriptiveAssets (square/portrait/landscape), wie cookidoo-api. */
function pickThumbnail(assets: any[]): string | null {
  for (const asset of assets) {
    for (const variant of ["square", "portrait", "landscape"]) {
      const url = asset?.[variant];
      if (typeof url === "string" && url) {
        return url.replace("{transformation}", "t_web_shared_recipe_221x240");
      }
    }
  }
  return null;
}

/** Abgehakt-Status tolerant lesen: Cookidoo nutzt `isOwned`; weitere Feldnamen sind abgedeckt, falls sie auftauchen. */
export function ownedFlag(i: any): boolean {
  return !!(i?.isOwned ?? i?.checked ?? i?.isChecked ?? i?.bought ?? i?.isBought ?? i?.inPantry ?? i?.isInPantry);
}

export class CookidooClient {
  readonly loc: Localization;
  constructor(
    country: string,
    public jar: CookieJar = new CookieJar(),
  ) {
    this.loc = localizationFor(country);
  }

  /** Fetch mit manuellem Redirect-Handling und Cookie-Jar. */
  private async request(url: string, init: RequestInit = {}): Promise<{ res: Response; finalUrl: URL }> {
    let current = new URL(url);
    let method = (init.method ?? "GET").toUpperCase();
    let body = init.body;
    const baseHeaders = new Headers(init.headers);
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      const headers = new Headers(baseHeaders);
      const cookie = this.jar.headerFor(current);
      if (cookie) headers.set("Cookie", cookie);
      headers.set("User-Agent", "Mozilla/5.0 (compatible; smart-grocery-ai/0.2)");
      let res: Response;
      try {
        res = await fetch(current.toString(), { method, headers, body, redirect: "manual" });
      } catch {
        throw new CookidooRequestError("Cookidoo ist gerade nicht erreichbar. Bitte spaeter erneut versuchen.");
      }
      this.jar.setFromResponse(current, res);
      const loc = res.headers.get("location");
      if (res.status >= 300 && res.status < 400 && loc) {
        current = new URL(loc, current);
        if (res.status === 303 || ((res.status === 301 || res.status === 302) && method === "POST")) {
          method = "GET";
          body = undefined;
          baseHeaders.delete("Content-Type");
        }
        continue;
      }
      return { res, finalUrl: current };
    }
    throw new CookidooRequestError("Zu viele Weiterleitungen");
  }

  async login(email: string, password: string): Promise<void> {
    const redirect = encodeURIComponent(`/foundation/${this.loc.language}/for-you`);
    const loginUrl = `${this.loc.origin}/profile/${this.loc.language}/login?redirectAfterLogin=${redirect}`;
    this.jar = new CookieJar();

    const page = await this.request(loginUrl);
    if (page.res.status !== 200) {
      throw new CookidooAuthError(`Login-Seite nicht erreichbar (Status ${page.res.status})`);
    }
    const html = await page.res.text();
    const requestId = extractRequestId(html);

    const form = new URLSearchParams({ requestId, username: email, password });
    const post = await this.request(CIAM_LOGIN_SRV_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form.toString(),
    });
    await post.res.arrayBuffer().catch(() => undefined);

    if (!this.jar.hasAuthCookies()) {
      throw new CookidooAuthError("Login fehlgeschlagen: bitte E-Mail und Passwort pruefen");
    }
  }

  private async api<T>(path: string, init: RequestInit = {}): Promise<T> {
    const headers = new Headers(init.headers);
    headers.set("Accept", "application/json");
    if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
    const { res } = await this.request(`${this.loc.origin}/${path}`, { ...init, headers });
    if (res.status === 401 || res.status === 403) {
      throw new CookidooAuthError("Cookidoo-Session abgelaufen, bitte neu einloggen");
    }
    if (!res.ok) throw new CookidooRequestError(`Cookidoo antwortete mit Status ${res.status}`);
    try {
      return (await res.json()) as T;
    } catch {
      throw new CookidooParseError("Antwort von Cookidoo ist kein gueltiges JSON");
    }
  }

  private recipeUrl(id: string): string {
    return `${this.loc.origin}/recipes/recipe/${this.loc.language}/${id}`;
  }

  async getUserInfo(): Promise<{ id: string; username: string; description: string | null }> {
    const d: any = await this.api("community/profile");
    try {
      return { id: d.id, username: d.userInfo.username, description: d.userInfo.description ?? null };
    } catch {
      throw new CookidooParseError("Profil konnte nicht gelesen werden");
    }
  }

  async getWeek(day: string): Promise<WeekDay[]> {
    const d: any = await this.api(`planning/${this.loc.language}/api/my-week/${day}`);
    try {
      return d.myDays.map((x: any): WeekDay => {
        const toRef = (r: any): RecipeRef => ({
          id: r.id,
          name: r.title,
          totalTime: r.totalTime ?? null,
          thumbnail: r.assets?.images ? pickThumbnail([r.assets.images]) : null,
          url: this.recipeUrl(r.id),
        });
        return {
          id: x.id,
          title: x.title,
          recipes: [...(x.recipes ?? []), ...(x.customerRecipes ?? [])].map(toRef),
        };
      });
    } catch {
      throw new CookidooParseError("Wochenplan konnte nicht gelesen werden");
    }
  }

  async getRecipe(id: string): Promise<RecipeDetails> {
    const d: any = await this.api(`recipes/recipe/${this.loc.language}/${id}`);
    try {
      const time = (type: string): number | null =>
        d.times?.find((t: any) => t.type === type && t.quantity?.value)?.quantity.value ?? null;
      return {
        id: d.id,
        name: d.title,
        url: this.recipeUrl(d.id),
        servingSize: d.servingSize?.quantity?.value ?? null,
        totalTime: time("totalTime"),
        ingredients: d.recipeIngredientGroups.flatMap((g: any) =>
          g.recipeIngredients.map((i: any): RawIngredient => ({
            id: i.localId ?? i.id,
            name: i.ingredientNotation,
            description: ingredientDescription(i),
          })),
        ),
      };
    } catch {
      throw new CookidooParseError("Rezept konnte nicht gelesen werden");
    }
  }

  private shoppingToItems(d: any): IngredientItem[] {
    return [...(d.recipes ?? []), ...(d.customerRecipes ?? [])].flatMap((r: any) =>
      (r.recipeIngredientGroups ?? []).map((i: any): IngredientItem => ({
        id: i.id,
        name: i.ingredientNotation,
        isOwned: ownedFlag(i),
        description: ingredientDescription(i),
      })),
    );
  }

  async getShoppingList(): Promise<{ ingredients: IngredientItem[]; additional: AdditionalItem[] }> {
    const d: any = await this.api(`shopping/${this.loc.language}`);
    try {
      return {
        ingredients: this.shoppingToItems(d),
        additional: (d.additionalItems ?? []).map(
          (i: any): AdditionalItem => ({ id: i.id, name: i.name, isOwned: ownedFlag(i) }),
        ),
      };
    } catch {
      throw new CookidooParseError("Einkaufsliste konnte nicht gelesen werden");
    }
  }

  async addRecipesToShoppingList(recipeIds: string[]): Promise<void> {
    await this.api(`shopping/${this.loc.language}/recipes/add`, {
      method: "POST",
      body: JSON.stringify({ recipeIDs: recipeIds }),
    });
  }
}

export function extractRequestId(html: string): string {
  const m =
    /<input[^>]*name=["']requestId["'][^>]*value=["']([^"']+)["']/.exec(html) ??
    /<input[^>]*value=["']([0-9a-f-]{36})["'][^>]*name=["']requestId["']/.exec(html);
  if (!m) throw new CookidooParseError("requestId auf der Login-Seite nicht gefunden");
  return m[1];
}
