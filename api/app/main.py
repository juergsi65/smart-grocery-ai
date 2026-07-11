"""Minimaler FastAPI-Einstieg, der (vorerst) nur das Cookidoo-Modul mountet.

Der vollstaendige Monorepo-Scaffold (auth, users, offers, matching, optimizer,
routing-hints, lists, notifications) folgt in spaeteren Phasen. Dieses main.py
macht das Cookidoo-Modul sofort lauffaehig und dokumentiert unter /docs.
"""

from fastapi import FastAPI

from app.modules.cookidoo.router import router as cookidoo_router

app = FastAPI(
    title="Smart Grocery AI - API",
    version="0.1.0",
    description="Cookidoo-Modul (Phase 1). Weitere Module folgen.",
)
app.include_router(cookidoo_router)


@app.get("/health", tags=["meta"])
async def health():
    return {"status": "ok"}
