"""Service-Schicht: fachliche Cookidoo-Operationen fuer die App.

Jede Operation oeffnet eine (cookie-gestuetzte) Session ueber
:func:`cookidoo_session`. Rueckgaben sind bereits die Pydantic-Response-Modelle,
sodass der Router nur noch durchreicht.
"""

from __future__ import annotations

import datetime as dt
from pathlib import Path

from .aggregate import CanonicalIngredient, aggregate
from .client import cookidoo_session
from .models import (
    AggregatedIngredientOut,
    CanonicalIngredientOut,
    CombineResponse,
    QuantityOut,
    RecipeDetailsOut,
    RecipeRef,
    ShoppingListItemOut,
    ShoppingListOut,
    WeekDayOut,
)
from .quantity import parse_quantity


class CookidooCredentials:
    """Buendelt die pro Operation benoetigten Zugangsdaten."""

    def __init__(self, email: str, password: str, country: str, cookie_path: str | Path | None):
        self.email = email
        self.password = password
        self.country = country
        self.cookie_path = cookie_path

    def _session(self, force_login: bool = False):
        return cookidoo_session(
            self.email, self.password, self.country,
            cookie_path=self.cookie_path, force_login=force_login,
        )


async def get_user_info(creds: CookidooCredentials) -> dict:
    async with creds._session() as client:
        info = await client.get_user_info()
        return {
            "username": getattr(info, "username", None),
            "description": getattr(info, "description", None),
        }


async def get_week_plan(creds: CookidooCredentials, day: dt.date) -> list[WeekDayOut]:
    async with creds._session() as client:
        days = await client.get_recipes_in_calendar_week(day)
        return [
            WeekDayOut(
                id=d.id,
                title=d.title,
                recipes=[
                    RecipeRef(
                        id=r.id, name=r.name, total_time=r.total_time,
                        thumbnail=r.thumbnail, url=r.url,
                    )
                    for r in d.recipes
                ],
            )
            for d in days
        ]


async def get_recipe_details(creds: CookidooCredentials, recipe_id: str) -> RecipeDetailsOut:
    async with creds._session() as client:
        d = await client.get_recipe_details(recipe_id)
        ingredients = [
            CanonicalIngredientOut.of(
                CanonicalIngredient.from_cookidoo(i.name, i.description, d.id, d.name)
            )
            for i in d.ingredients
        ]
        return RecipeDetailsOut(
            id=d.id, name=d.name, url=d.url,
            serving_size=d.serving_size, total_time=d.total_time,
            ingredients=ingredients,
        )


async def combine_recipes(creds: CookidooCredentials, recipe_ids: list[str]) -> CombineResponse:
    """Mehrere Rezepte holen, Zutaten zusammenfuehren und Mengen summieren."""
    all_ingredients: list[CanonicalIngredient] = []
    recipes: list[RecipeRef] = []
    async with creds._session() as client:
        for rid in recipe_ids:
            d = await client.get_recipe_details(rid)
            recipes.append(
                RecipeRef(id=d.id, name=d.name, total_time=d.total_time, url=d.url)
            )
            for i in d.ingredients:
                all_ingredients.append(
                    CanonicalIngredient.from_cookidoo(i.name, i.description, d.id, d.name)
                )
    aggregated = aggregate(all_ingredients)
    return CombineResponse(
        recipes=recipes,
        items=[AggregatedIngredientOut.of(a) for a in aggregated],
        unmerged_count=len(all_ingredients),
    )


async def get_shopping_list(creds: CookidooCredentials) -> ShoppingListOut:
    async with creds._session() as client:
        ingredient_items = await client.get_ingredient_items()
        additional_items = await client.get_additional_items()

    items: list[ShoppingListItemOut] = []
    canon: list[CanonicalIngredient] = []
    for it in ingredient_items:
        q = parse_quantity(it.description)
        items.append(ShoppingListItemOut(
            id=it.id, name=it.name, is_owned=it.is_owned,
            quantity=QuantityOut.of(q), kind="ingredient",
        ))
        canon.append(CanonicalIngredient(name=it.name, quantity=q))
    for it in additional_items:
        items.append(ShoppingListItemOut(
            id=it.id, name=it.name, is_owned=it.is_owned,
            quantity=None, kind="additional",
        ))

    aggregated = aggregate(canon)
    return ShoppingListOut(
        items=items,
        aggregated=[AggregatedIngredientOut.of(a) for a in aggregated],
    )


async def sync_recipes_to_shopping_list(
    creds: CookidooCredentials, recipe_ids: list[str]
) -> ShoppingListOut:
    """Zutaten der Rezepte in die native Cookidoo-Einkaufsliste uebernehmen."""
    async with creds._session() as client:
        await client.add_ingredient_items_for_recipes(recipe_ids)
    return await get_shopping_list(creds)
