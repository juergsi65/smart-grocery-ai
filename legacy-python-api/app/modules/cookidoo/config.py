"""Konfiguration des Cookidoo-Moduls."""

from __future__ import annotations

import os
from dataclasses import dataclass


@dataclass(frozen=True)
class CookidooSettings:
    default_country: str = os.getenv("COOKIDOO_COUNTRY", "at")
    # Verzeichnis fuer persistierte Session-Cookies (vermeidet Re-Login).
    cookie_dir: str = os.getenv("COOKIDOO_COOKIE_DIR", "/tmp/cookidoo_sessions")
    # Optionale Default-Credentials NUR fuer lokales Testen (nicht fuer Prod).
    default_email: str | None = os.getenv("COOKIDOO_EMAIL")
    default_password: str | None = os.getenv("COOKIDOO_PASSWORD")


settings = CookidooSettings()
os.makedirs(settings.cookie_dir, exist_ok=True)
