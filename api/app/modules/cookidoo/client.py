"""Duenner async Wrapper um `cookidoo_api`.

Kapselt das aiohttp-Session-Handling (inkl. der von Cookidoo benoetigten
``CookieJar(unsafe=True)`` fuer den domainuebergreifenden OAuth2-Flow), den
Login und die Cookie-Persistenz. Der Rest der App spricht nur mit diesem
Wrapper bzw. dem darauf aufbauenden Service - nie direkt mit der Bibliothek.
"""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from pathlib import Path

import aiohttp
from cookidoo_api import (
    Cookidoo,
    CookidooConfig,
    get_localization_options,
)

_LOGGER = logging.getLogger(__name__)


async def _build_config(email: str, password: str, country: str) -> CookidooConfig:
    options = await get_localization_options(country=country)
    if not options:
        raise ValueError(f"Keine Cookidoo-Lokalisierung fuer Land '{country}'")
    # Fuer AT existiert genau eine Option (de-AT). Erste nehmen.
    return CookidooConfig(localization=options[0], email=email, password=password)


@asynccontextmanager
async def cookidoo_session(
    email: str,
    password: str,
    country: str = "at",
    cookie_path: str | Path | None = None,
    force_login: bool = False,
):
    """Async-Kontextmanager, der einen einsatzbereiten `Cookidoo`-Client liefert.

    Nutzt vorhandene Cookies (``cookie_path``), um Re-Logins zu vermeiden; faellt
    bei fehlenden/abgelaufenen Cookies automatisch auf ``login()`` zurueck und
    persistiert die Cookies anschliessend.
    """
    cfg = await _build_config(email, password, country)
    # unsafe=True ist zwingend fuer den domainuebergreifenden OAuth2-Login.
    jar = aiohttp.CookieJar(unsafe=True)
    async with aiohttp.ClientSession(cookie_jar=jar) as session:
        client = Cookidoo(session, cfg)
        needs_login = force_login
        if cookie_path and Path(cookie_path).exists() and not force_login:
            try:
                await client.load_cookies(str(cookie_path))
            except Exception as exc:  # noqa: BLE001
                _LOGGER.info("Cookie-Load fehlgeschlagen (%s), logge neu ein", exc)
                needs_login = True
        else:
            needs_login = True

        if needs_login:
            await client.login()
            if cookie_path:
                await client.save_cookies(str(cookie_path))

        try:
            yield client
        finally:
            # Cookies nach der Nutzung aktualisieren (Token-Rotation).
            if cookie_path:
                try:
                    await client.save_cookies(str(cookie_path))
                except Exception:  # noqa: BLE001
                    pass
