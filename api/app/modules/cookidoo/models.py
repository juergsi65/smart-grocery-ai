"""Pydantic-Schemas fuer die Cookidoo-API (Request/Response) + Konverter."""

from __future__ import annotations

from pydantic import BaseModel, Field

from .aggregate import AggregatedIngredient, Amount, CanonicalIngredient
from .quantity import Quantity


# ---------------------------------------------------------------- Requests
class LoginRequest(BaseModel):
    email: str
    password: str
    country: str = "at"          # Fokus Oesterreich
    remember_credentials: bool = True  # fuer automatischen Token-Refresh (PoC)


class CombineRequest(BaseModel):
    recipe_ids: list[str] = Field(..., min_length=1)


class SyncRequest(BaseModel):
    recipe_ids: list[str] = Field(..., min_length=1)


# ---------------------------------------------------------------- Responses
class LoginResponse(BaseModel):
    session_id: str
    username: str | None = None
    description: str | None = None


class QuantityOut(BaseModel):
    low: float | None
    high: float | None
    unit: str | None
    dimension: str
    raw: str

    @classmethod
    def of(cls, q: Quantity) -> "QuantityOut":
        return cls(
            low=q.low, high=q.high, unit=q.unit,
            dimension=q.dimension.value, raw=q.raw,
        )


class CanonicalIngredientOut(BaseModel):
    name: str
    quantity: QuantityOut
    source_recipe_id: str | None = None
    source_recipe_name: str | None = None

    @classmethod
    def of(cls, i: CanonicalIngredient) -> "CanonicalIngredientOut":
        return cls(
            name=i.name,
            quantity=QuantityOut.of(i.quantity),
            source_recipe_id=i.source_recipe_id,
            source_recipe_name=i.source_recipe_name,
        )


class AmountOut(BaseModel):
    unit: str | None
    dimension: str
    low: float
    high: float
    display: str

    @classmethod
    def of(cls, a: Amount) -> "AmountOut":
        return cls(
            unit=a.unit, dimension=a.dimension.value,
            low=a.low, high=a.high, display=a.display(),
        )


class AggregatedIngredientOut(BaseModel):
    name: str
    amounts: list[AmountOut]
    qualitative_notes: list[str]
    source_recipe_ids: list[str]
    source_recipe_names: list[str]
    display: str

    @classmethod
    def of(cls, a: AggregatedIngredient) -> "AggregatedIngredientOut":
        return cls(
            name=a.name,
            amounts=[AmountOut.of(x) for x in a.amounts],
            qualitative_notes=a.qualitative_notes,
            source_recipe_ids=a.source_recipe_ids,
            source_recipe_names=a.source_recipe_names,
            display=a.display(),
        )


class RecipeRef(BaseModel):
    id: str
    name: str
    total_time: int | None = None
    thumbnail: str | None = None
    url: str | None = None


class WeekDayOut(BaseModel):
    id: str
    title: str
    recipes: list[RecipeRef]


class RecipeDetailsOut(BaseModel):
    id: str
    name: str
    url: str | None = None
    serving_size: int | None = None
    total_time: int | None = None
    ingredients: list[CanonicalIngredientOut]


class CombineResponse(BaseModel):
    """Ergebnis von 'Rezepte kombinieren + Mengen zusammenrechnen'."""

    recipes: list[RecipeRef]
    items: list[AggregatedIngredientOut]
    unmerged_count: int  # Anzahl Einzelzutaten vor Aggregation (Info)


class ShoppingListItemOut(BaseModel):
    id: str
    name: str
    is_owned: bool
    quantity: QuantityOut | None = None
    kind: str  # "ingredient" | "additional"


class ShoppingListOut(BaseModel):
    items: list[ShoppingListItemOut]
    aggregated: list[AggregatedIngredientOut]
