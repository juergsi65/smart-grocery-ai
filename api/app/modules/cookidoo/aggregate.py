"""Zusammenfuehren von Zutaten ueber mehrere Rezepte.

Kernaufgabe aus dem Brief: "Mehrere Rezepte kombinieren / Mengen zusammenrechnen /
Doppelkaeufe vermeiden". Diese Ebene arbeitet DETERMINISTISCH und rein lokal:

* gruppiert nach normalisiertem Zutatennamen (exakt),
* summiert Mengen mit kompatibler Einheit (kg + g, l + ml, gleiche Notation),
* haelt inkompatible Mengen der gleichen Zutat als getrennte Teilmengen,
* sammelt qualitative Angaben ("Prise", "etwas") als Hinweise.

Bewusst NICHT hier: semantische Synonyme ("Tomaten" == "Cocktailtomaten") oder
Produktzuordnung. Das ist Aufgabe des spaeteren KI-Matching-Moduls, das auf
dieser sauberen, aggregierten Liste aufsetzt.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field

from .quantity import Dimension, Quantity, format_number, parse_quantity


@dataclass
class CanonicalIngredient:
    """Eine einzelne Zutat aus einem Rezept, strukturiert."""

    name: str
    quantity: Quantity
    source_recipe_id: str | None = None
    source_recipe_name: str | None = None

    @classmethod
    def from_cookidoo(
        cls,
        name: str,
        description: str | None,
        recipe_id: str | None = None,
        recipe_name: str | None = None,
    ) -> "CanonicalIngredient":
        return cls(
            name=name.strip(),
            quantity=parse_quantity(description),
            source_recipe_id=recipe_id,
            source_recipe_name=recipe_name,
        )


@dataclass
class Amount:
    """Eine summierte Teilmenge einer aggregierten Zutat."""

    unit: str | None
    dimension: Dimension
    low: float
    high: float

    @property
    def is_range(self) -> bool:
        return self.low != self.high

    def display(self) -> str:
        unit = f" {self.unit}" if self.unit else ""
        if self.is_range:
            return f"{format_number(self.low)}-{format_number(self.high)}{unit}".strip()
        return f"{format_number(self.low)}{unit}".strip()


@dataclass
class AggregatedIngredient:
    """Zusammengefuehrte Zutat ueber ein oder mehrere Rezepte."""

    name: str
    amounts: list[Amount] = field(default_factory=list)
    qualitative_notes: list[str] = field(default_factory=list)
    source_recipe_ids: list[str] = field(default_factory=list)
    source_recipe_names: list[str] = field(default_factory=list)

    def display(self) -> str:
        parts = [a.display() for a in self.amounts]
        parts += self.qualitative_notes
        joined = " + ".join(p for p in parts if p)
        return f"{joined} {self.name}".strip() if joined else self.name


_WS_RE = re.compile(r"\s+")


def normalize_name(name: str) -> str:
    """Konservative Namens-Normalisierung fuer die Gruppierung.

    Kleinschreibung, Whitespace-Kollaps, abschliessende Klammer-Zusaetze
    entfernen (z. B. "Zwiebel (rot)" -> "zwiebel"). Absichtlich vorsichtig:
    echte Synonym-Aufloesung macht spaeter die KI.
    """
    n = name.strip().lower()
    n = re.sub(r"\s*\([^)]*\)\s*$", "", n)
    n = _WS_RE.sub(" ", n)
    return n.strip()


def _base_to_display_unit(dimension: Dimension, base_low: float, base_high: float):
    """Basiseinheit (g/ml) fuer die Anzeige ggf. auf kg/l hochskalieren."""
    if dimension is Dimension.MASS:
        if base_low >= 1000 and base_high >= 1000:
            return "kg", base_low / 1000, base_high / 1000
        return "g", base_low, base_high
    if dimension is Dimension.VOLUME:
        if base_low >= 1000 and base_high >= 1000:
            return "l", base_low / 1000, base_high / 1000
        return "ml", base_low, base_high
    return None, base_low, base_high


def aggregate(ingredients: list[CanonicalIngredient]) -> list[AggregatedIngredient]:
    """Fuehrt eine flache Zutatenliste zu einer aggregierten Einkaufsliste zusammen."""
    groups: dict[str, AggregatedIngredient] = {}
    # Pro Gruppe: merge_key -> [dimension, canonical_unit, sum_low, sum_high]
    buckets: dict[str, dict[tuple, list]] = {}

    for ing in ingredients:
        key = normalize_name(ing.name)
        if key not in groups:
            groups[key] = AggregatedIngredient(name=ing.name.strip())
            buckets[key] = {}
        agg = groups[key]

        if ing.source_recipe_id and ing.source_recipe_id not in agg.source_recipe_ids:
            agg.source_recipe_ids.append(ing.source_recipe_id)
        if (
            ing.source_recipe_name
            and ing.source_recipe_name not in agg.source_recipe_names
        ):
            agg.source_recipe_names.append(ing.source_recipe_name)

        q: Quantity = ing.quantity
        if not q.has_value:
            note = q.raw or (q.unit or "")
            if note and note not in agg.qualitative_notes:
                agg.qualitative_notes.append(note)
            continue

        mk = q.merge_key()
        b = buckets[key].setdefault(mk, [q.dimension, q.unit, 0.0, 0.0])
        b[2] += q.base_low if q.base_low is not None else 0.0
        b[3] += q.base_high if q.base_high is not None else 0.0

    for key, agg in groups.items():
        for (dimension, unit), (_dim, canon_unit, s_low, s_high) in buckets[key].items():
            if dimension in (Dimension.MASS, Dimension.VOLUME):
                disp_unit, lo, hi = _base_to_display_unit(dimension, s_low, s_high)
            else:
                disp_unit, lo, hi = canon_unit, s_low, s_high
            agg.amounts.append(
                Amount(unit=disp_unit, dimension=dimension, low=lo, high=hi)
            )
        # stabile, lesbare Reihenfolge
        agg.amounts.sort(key=lambda a: (a.dimension.value, a.unit or ""))

    return sorted(groups.values(), key=lambda a: normalize_name(a.name))
