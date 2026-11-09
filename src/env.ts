export interface Env {
  DB: D1Database;
  AI: Ai;
  ASSETS: Fetcher;
  SESSION_KEY: string;
  COOKIDOO_COUNTRY: string;
  OFFERS_ZIP: string;
  AI_MODEL: string;
}

export type AppVars = {
  session: SessionContext;
};

export interface SessionContext {
  tokenHash: string;
  country: string;
  username: string | null;
  cookiesJson: string;
}
