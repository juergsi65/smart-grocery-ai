"""FastAPI-Router fuer das Cookidoo-Modul.

Hinweis zur Auth: Der In-Memory-Session-Store hier ist bewusst minimal
(PoC-Ebene). In der spaeteren `auth`-/`users`-Ebene wird das durch JWT + pro
Benutzer verschluesselt gespeicherte Cookidoo-Credentials ersetzt. Passwoerter
liegen hier nur im RAM (fuer automatischen Token-Refresh) und werden nirgends
persistiert.
"""

from __future__ import annotations

import datetime as dt
import uuid
from pathlib import Path

from cookidoo_api import CookidooAuthException, CookidooException
from fastapi import APIRouter, Depends, Header, HTTPException

from .config import settings
from .models import (
    CombineRequest,
    CombineResponse,
    LoginRequest,
    LoginResponse,
    RecipeDetailsOut,
    ShoppingListOut,
    SyncRequest,
    WeekDayOut,
)
from .service import CookidooCredentials, combine_recipes, get_recipe_details
from .service import get_shopping_list as svc_shopping_list
from .service import get_user_info, get_week_plan, sync_recipes_to_shopping_list

router = APIRouter(prefix="/cookidoo", tags=["cookidoo"])

# session_id -> CookidooCredentials  (nur RAM, PoC)
_SESSIONS: dict[str, CookidooCredentials] = {}


async def current_creds(
    x_cookidoo_session: str = Header(..., alias="X-Cookidoo-Session"),
) -> CookidooCredentials:
    creds = _SESSIONS.get(x_cookidoo_session)
    if creds is None:
        raise HTTPException(401, "Unbekannte oder abgelaufene Cookidoo-Session")
    return creds


@router.post("/login", response_model=LoginResponse)
async def login(body: LoginRequest) -> LoginResponse:
    session_id = uuid.uuid4().hex
    cookie_path = Path(settings.cookie_dir) / f"{session_id}.json"
    creds = CookidooCredentials(
        email=body.email,
        password=body.password if body.remember_credentials else "",
        country=body.country,
        cookie_path=cookie_path,
    )
    try:
        # force_login erzwingt echten Auth-Flow und schreibt die Cookies.
        async with creds._session(force_login=True) as client:
            info = await client.get_user_info()
    except CookidooAuthException as exc:
        raise HTTPException(401, f"Cookidoo-Login fehlgeschlagen: {exc}") from exc
    except CookidooException as exc:
        raise HTTPException(502, f"Cookidoo-Fehler: {exc}") from exc

    _SESSIONS[session_id] = creds
    return LoginResponse(
        session_id=session_id,
        username=getattr(info, "username", None),
        description=getattr(info, "description", None),
    )


@router.delete("/login")
async def logout(creds: CookidooCredentials = Depends(current_creds),
                 x_cookidoo_session: str = Header(..., alias="X-Cookidoo-Session")):
    _SESSIONS.pop(x_cookidoo_session, None)
    try:
        if creds.cookie_path and Path(creds.cookie_path).exists():
            Path(creds.cookie_path).unlink()
    except OSError:
        pass
    return {"ok": True}


@router.get("/me")
async def me(creds: CookidooCredentials = Depends(current_creds)):
    return await get_user_info(creds)


@router.get("/week", response_model=list[WeekDayOut])
async def week(
    date: dt.date | None = None,
    creds: CookidooCredentials = Depends(current_creds),
) -> list[WeekDayOut]:
    return await get_week_plan(creds, date or dt.date.today())


@router.get("/recipes/{recipe_id}", response_model=RecipeDetailsOut)
async def recipe(
    recipe_id: str, creds: CookidooCredentials = Depends(current_creds)
) -> RecipeDetailsOut:
    return await get_recipe_details(creds, recipe_id)


@router.post("/combine", response_model=CombineResponse)
async def combine(
    body: CombineRequest, creds: CookidooCredentials = Depends(current_creds)
) -> CombineResponse:
    return await combine_recipes(creds, body.recipe_ids)


@router.get("/shopping-list", response_model=ShoppingListOut)
async def shopping_list(
    creds: CookidooCredentials = Depends(current_creds),
) -> ShoppingListOut:
    return await svc_shopping_list(creds)


@router.post("/shopping-list/sync", response_model=ShoppingListOut)
async def shopping_list_sync(
    body: SyncRequest, creds: CookidooCredentials = Depends(current_creds)
) -> ShoppingListOut:
    return await sync_recipes_to_shopping_list(creds, body.recipe_ids)
