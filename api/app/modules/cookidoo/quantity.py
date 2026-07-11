"""Parsing und Normalisierung von Cookidoo-Mengenangaben.

Cookidoo liefert Zutaten als ``(name, description)``. Die Bibliothek
``cookidoo_api`` setzt ``description`` deterministisch aus dem Backend zusammen:

    description = f"{menge} {einheit}"

wobei ``menge`` entweder ein Ganzzahlwert ("200") oder ein Bereich ("1 - 2")
ist und ``einheit`` die Notation aus dem Backend (z. B. "g", "kg", "ml", "EL",
"Stk"). Fehlt ein Teil, steht dort der Python-Literal-String ``"None"`` bzw. der
Teil ist leer (z. B. bei "Salz" -> "None None").

Weil das Format kontrolliert und vorhersehbar ist, koennen wir es zuverlaessig
in eine strukturierte :class:`Quantity` zurueckparsen. Freitext-Parsing (wie bei
handschriftlichen Rezepten) ist dadurch NICHT noetig.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from enum import Enum


class Dimension(str, Enum):
    """Physikalische bzw. logische Dimension einer Einheit."""

    MASS = "mass"            # g, kg, mg   -> Basis g, summierbar
    VOLUME = "volume"        # ml, l, cl   -> Basis ml, summierbar
    SPOON = "spoon"          # EL, TL, Msp -> Kochmass, nur gleiche Notation summieren
    COUNT = "count"          # Stk, Bund, Zehe, Dose, Packung ...
    QUALITATIVE = "qualitative"  # Prise, etwas, "nach Bedarf", ohne Menge


# Notation (lowercase) -> (canonical_unit, dimension, faktor_auf_basiseinheit)
# Basiseinheiten: MASS -> "g", VOLUME -> "ml".
_UNIT_REGISTRY: dict[str, tuple[str, Dimension, float]] = {
    # Masse
    "g": ("g", Dimension.MASS, 1.0),
    "gr": ("g", Dimension.MASS, 1.0),
    "gramm": ("g", Dimension.MASS, 1.0),
    "kg": ("g", Dimension.MASS, 1000.0),
    "mg": ("g", Dimension.MASS, 0.001),
    "dag": ("g", Dimension.MASS, 10.0),   # Dekagramm (in AT gebraeuchlich!)
    "deka": ("g", Dimension.MASS, 10.0),
    # Volumen
    "ml": ("ml", Dimension.VOLUME, 1.0),
    "l": ("ml", Dimension.VOLUME, 1000.0),
    "liter": ("ml", Dimension.VOLUME, 1000.0),
    "cl": ("ml", Dimension.VOLUME, 10.0),
    "dl": ("ml", Dimension.VOLUME, 100.0),
    # Kochmasse (nicht automatisch in ml umrechnen -> Einkauf braucht das nicht)
    "el": ("EL", Dimension.SPOON, 1.0),
    "essloeffel": ("EL", Dimension.SPOON, 1.0),
    "tl": ("TL", Dimension.SPOON, 1.0),
    "teeloeffel": ("TL", Dimension.SPOON, 1.0),
    "msp": ("Msp", Dimension.SPOON, 1.0),
    "messerspitze": ("Msp", Dimension.SPOON, 1.0),
    # Zaehlbar
    "stk": ("Stk", Dimension.COUNT, 1.0),
    "stk.": ("Stk", Dimension.COUNT, 1.0),
    "stueck": ("Stk", Dimension.COUNT, 1.0),
    "bund": ("Bund", Dimension.COUNT, 1.0),
    "zehe": ("Zehe", Dimension.COUNT, 1.0),
    "zehen": ("Zehe", Dimension.COUNT, 1.0),
    "dose": ("Dose", Dimension.COUNT, 1.0),
    "dosen": ("Dose", Dimension.COUNT, 1.0),
    "packung": ("Packung", Dimension.COUNT, 1.0),
    "pkg": ("Packung", Dimension.COUNT, 1.0),
    "glas": ("Glas", Dimension.COUNT, 1.0),
    "becher": ("Becher", Dimension.COUNT, 1.0),
    "scheibe": ("Scheibe", Dimension.COUNT, 1.0),
    "scheiben": ("Scheibe", Dimension.COUNT, 1.0),
    "blatt": ("Blatt", Dimension.COUNT, 1.0),
    "blaetter": ("Blatt", Dimension.COUNT, 1.0),
    "wuerfel": ("Wuerfel", Dimension.COUNT, 1.0),
    "tropfen": ("Tropfen", Dimension.COUNT, 1.0),
    # Qualitativ (keine sinnvolle Zahl)
    "prise": ("Prise", Dimension.QUALITATIVE, 1.0),
    "prisen": ("Prise", Dimension.QUALITATIVE, 1.0),
    "etwas": ("etwas", Dimension.QUALITATIVE, 1.0),
}

# Tokens die "keine Angabe" bedeuten und wie leer behandelt werden.
_EMPTY_TOKENS = {"", "none", "nan", "n.b.", "nb", "nach bedarf"}

_WS_RE = re.compile(r"\s+")

_QTY_RE = re.compile(
    r"^\s*"
    r"(?:"
    r"(?P<from>\d+(?:[.,]\d+)?)\s*-\s*(?P<to>\d+(?:[.,]\d+)?)"  # Bereich "1 - 2"
    r"|(?P<val>\d+(?:[.,]\d+)?)"                                 # Einzelwert "200"
    r")?"
    r"\s*(?P<unit>.*?)\s*$"
)


def _to_float(raw: str | None) -> float | None:
    if raw is None:
        return None
    raw = raw.strip().replace(",", ".")
    if raw.lower() in _EMPTY_TOKENS:
        return None
    try:
        return float(raw)
    except ValueError:
        return None


@dataclass(frozen=True)
class Quantity:
    """Strukturierte Menge.

    Einzelwert -> ``low == high``. Bereich ("1 - 2") -> ``low=1, high=2``.
    Keine Zahl -> ``low is None and high is None`` (qualitativ).
    """

    low: float | None
    high: float | None
    unit: str | None            # kanonische Notation, z. B. "g", "EL", "Stk"
    dimension: Dimension
    raw: str                    # unveraenderter Original-String
    base_low: float | None      # in Basiseinheit (g / ml) falls MASS/VOLUME
    base_high: float | None

    @property
    def has_value(self) -> bool:
        return self.low is not None

    @property
    def is_range(self) -> bool:
        return self.low is not None and self.high is not None and self.low != self.high

    def merge_key(self) -> tuple[Dimension, str | None]:
        """Zwei Mengen sind summierbar, wenn ihr merge_key identisch ist.

        MASS/VOLUME werden ueber die Basiseinheit zusammengefasst (kg + g),
        alle anderen nur bei exakt gleicher Notation.
        """
        if self.dimension in (Dimension.MASS, Dimension.VOLUME):
            base = "g" if self.dimension is Dimension.MASS else "ml"
            return (self.dimension, base)
        return (self.dimension, self.unit)


def _lookup_unit(token: str) -> tuple[str | None, Dimension, float]:
    key = token.strip().lower().rstrip(".")
    # Umlaut-tolerante Normalisierung fuer die Registry-Keys.
    key = (
        key.replace("ä", "ae").replace("ö", "oe")
        .replace("ü", "ue").replace("ß", "ss")
    )
    if key in _EMPTY_TOKENS:
        return (None, Dimension.QUALITATIVE, 1.0)
    if key in _UNIT_REGISTRY:
        canon, dim, factor = _UNIT_REGISTRY[key]
        return (canon, dim, factor)
    # Unbekannte, aber vorhandene Einheit: als zaehlbar mit Originalnotation
    # behandeln, damit nur exakt Gleiches summiert wird.
    return (token.strip(), Dimension.COUNT, 1.0)


def parse_quantity(description: str | None) -> Quantity:
    """Parst einen Cookidoo-``description``-String in eine :class:`Quantity`."""
    raw = (description or "").strip()
    # Cookidoo fuegt bei fehlendem Wert/fehlender Einheit den Literal-String
    # "None" ein (z. B. "None None" bei "Salz", "None g", "200 None"). Diese
    # Tokens vorab entfernen; ein echter Zutatenname steht nie in description.
    cleaned = _WS_RE.sub(" ", re.sub(r"\bNone\b", " ", raw)).strip()
    m = _QTY_RE.match(cleaned)
    if not m:
        return Quantity(None, None, None, Dimension.QUALITATIVE, raw, None, None)

    val = _to_float(m.group("val"))
    frm = _to_float(m.group("from"))
    to = _to_float(m.group("to"))
    unit_token = (m.group("unit") or "").strip()

    if frm is not None or to is not None:
        low, high = frm, (to if to is not None else frm)
    elif val is not None:
        low = high = val
    else:
        low = high = None

    canon_unit, dimension, factor = _lookup_unit(unit_token)

    # Ohne Zahl UND ohne echte Einheit -> rein qualitativ.
    if low is None and canon_unit is None:
        dimension = Dimension.QUALITATIVE

    if dimension in (Dimension.MASS, Dimension.VOLUME):
        base_low = low * factor if low is not None else None
        base_high = high * factor if high is not None else None
    else:
        base_low = low
        base_high = high

    return Quantity(
        low=low,
        high=high,
        unit=canon_unit,
        dimension=dimension,
        raw=raw,
        base_low=base_low,
        base_high=base_high,
    )


def format_number(x: float | None) -> str:
    """Zahl huebsch formatieren: 200.0 -> '200', 1.5 -> '1,5' (DE)."""
    if x is None:
        return ""
    if abs(x - round(x)) < 1e-9:
        return str(int(round(x)))
    return f"{x:.2f}".rstrip("0").rstrip(".").replace(".", ",")
