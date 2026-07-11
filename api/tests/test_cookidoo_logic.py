"""Tests fuer Mengen-Parsing und Aggregation (offline, ohne Netzwerk)."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.modules.cookidoo.aggregate import (  # noqa: E402
    CanonicalIngredient,
    aggregate,
    normalize_name,
)
from app.modules.cookidoo.quantity import Dimension, parse_quantity  # noqa: E402


# ---------------------------------------------------------------- parse_quantity
def test_parse_simple_mass():
    q = parse_quantity("200 g")
    assert (q.low, q.high, q.unit, q.dimension) == (200, 200, "g", Dimension.MASS)
    assert q.base_low == 200


def test_parse_kg_to_base():
    q = parse_quantity("1 kg")
    assert q.unit == "g" and q.base_low == 1000


def test_parse_range():
    q = parse_quantity("1 - 2 EL")
    assert q.is_range and q.low == 1 and q.high == 2
    assert q.dimension is Dimension.SPOON and q.unit == "EL"


def test_parse_decimal_comma():
    q = parse_quantity("1,5 l")
    assert q.unit == "ml" and q.base_low == 1500


def test_parse_dag_austrian():
    q = parse_quantity("25 dag")  # 25 Deka = 250 g
    assert q.dimension is Dimension.MASS and q.base_low == 250


def test_parse_qualitative_none():
    q = parse_quantity("None None")  # z. B. "Salz"
    assert not q.has_value and q.dimension is Dimension.QUALITATIVE


def test_parse_prise():
    q = parse_quantity("1 Prise")
    assert q.dimension is Dimension.QUALITATIVE


def test_parse_countable():
    q = parse_quantity("2 Zehen")
    assert q.dimension is Dimension.COUNT and q.unit == "Zehe" and q.low == 2


# -------------------------------------------------------------------- aggregate
def test_normalize_name_strips_parenthetical():
    assert normalize_name("Zwiebel (rot)") == "zwiebel"


def test_aggregate_sums_same_unit():
    ings = [
        CanonicalIngredient.from_cookidoo("Mozzarella", "200 g", "r1", "Pizza"),
        CanonicalIngredient.from_cookidoo("Mozzarella", "200 g", "r2", "Salat"),
    ]
    res = aggregate(ings)
    assert len(res) == 1
    a = res[0]
    assert a.amounts[0].low == 400 and a.amounts[0].unit == "g"
    assert set(a.source_recipe_ids) == {"r1", "r2"}


def test_aggregate_mixes_kg_and_g():
    ings = [
        CanonicalIngredient.from_cookidoo("Mehl", "500 g"),
        CanonicalIngredient.from_cookidoo("Mehl", "1 kg"),
    ]
    res = aggregate(ings)
    # 1500 g -> als kg angezeigt
    assert res[0].amounts[0].unit == "kg" and res[0].amounts[0].low == 1.5


def test_aggregate_keeps_incompatible_separate():
    ings = [
        CanonicalIngredient.from_cookidoo("Tomaten", "400 g"),
        CanonicalIngredient.from_cookidoo("Tomaten", "2 Stk"),
    ]
    res = aggregate(ings)
    assert len(res[0].amounts) == 2  # g und Stk getrennt


def test_aggregate_ranges_add_bounds():
    ings = [
        CanonicalIngredient.from_cookidoo("Knoblauch", "1 - 2 Zehen"),
        CanonicalIngredient.from_cookidoo("Knoblauch", "2 - 3 Zehen"),
    ]
    res = aggregate(ings)
    a = res[0].amounts[0]
    assert a.low == 3 and a.high == 5 and a.is_range


def test_aggregate_qualitative_collected():
    ings = [
        CanonicalIngredient.from_cookidoo("Salz", "None None"),
        CanonicalIngredient.from_cookidoo("Salz", "1 Prise"),
    ]
    res = aggregate(ings)
    assert res[0].qualitative_notes  # mind. ein Hinweis


if __name__ == "__main__":
    import traceback

    fns = [v for k, v in sorted(globals().items()) if k.startswith("test_")]
    failed = 0
    for fn in fns:
        try:
            fn()
            print(f"PASS  {fn.__name__}")
        except Exception:
            failed += 1
            print(f"FAIL  {fn.__name__}")
            traceback.print_exc()
    print(f"\n{len(fns) - failed}/{len(fns)} passed")
    sys.exit(1 if failed else 0)
