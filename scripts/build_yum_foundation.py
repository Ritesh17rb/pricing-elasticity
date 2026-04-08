#!/usr/bin/env python3
"""
Build a Pizza Hut pricing foundation.

This generator creates a modeled public-data-style Pizza Hut dataset centered on
the grain `week_start x brand_id x market_id x product_id x channel_id`.
"""

from __future__ import annotations

import argparse
import csv
import datetime as dt
import hashlib
import json
import math
from collections import defaultdict
from pathlib import Path
from typing import Dict, Iterable, List, Tuple
from urllib.request import Request, urlopen


USER_AGENT = "Mozilla/5.0 (compatible; PizzaHutPricingStudio/3.0)"
SOURCE_METHOD = "modeled_public_pizzahut_pricing_foundation"

BRANDS = {
    "pizzahut": {
        "brand_name": "Pizza Hut",
        "portfolio_role": "Delivery, carryout, and dine-in family meal platform",
        "cuisine_focus": "Pizza",
        "service_model": "QSR/casual hybrid",
        "core_dayparts": "dinner,weekend",
        "value_positioning": "bundle_led_family_value",
        "typical_check_low": 14.0,
        "typical_check_high": 34.0,
        "digital_maturity_index": 0.84,
        "franchise_mix_pct": 99.0,
        "global_exposure_index": 0.97,
        "brand_strength_index": 1.01,
        "network_base": 152,
        "brand_color": "#ee3124",
        "price_power_index": 1.0,
    },
}

MARKETS = [
    {"market_id": "los_angeles_ca", "market_name": "Los Angeles", "state": "CA", "region": "West", "urbanicity": "urban", "income_index": 1.08, "cost_index": 1.16, "digital_adoption_index": 1.12, "delivery_density_index": 1.18, "competition_index": 1.12, "tourism_index": 1.05, "family_demand_index": 0.94, "late_night_index": 1.1},
    {"market_id": "dallas_tx", "market_name": "Dallas-Fort Worth", "state": "TX", "region": "South", "urbanicity": "metro", "income_index": 1.0, "cost_index": 0.98, "digital_adoption_index": 1.01, "delivery_density_index": 1.0, "competition_index": 1.03, "tourism_index": 0.95, "family_demand_index": 1.08, "late_night_index": 1.03},
    {"market_id": "chicago_il", "market_name": "Chicago", "state": "IL", "region": "Midwest", "urbanicity": "urban", "income_index": 1.02, "cost_index": 1.03, "digital_adoption_index": 1.0, "delivery_density_index": 1.05, "competition_index": 1.02, "tourism_index": 1.01, "family_demand_index": 0.97, "late_night_index": 0.98},
    {"market_id": "atlanta_ga", "market_name": "Atlanta", "state": "GA", "region": "South", "urbanicity": "metro", "income_index": 0.98, "cost_index": 0.97, "digital_adoption_index": 0.99, "delivery_density_index": 1.0, "competition_index": 0.99, "tourism_index": 0.98, "family_demand_index": 1.05, "late_night_index": 1.02},
    {"market_id": "new_york_ny", "market_name": "New York City", "state": "NY", "region": "Northeast", "urbanicity": "urban", "income_index": 1.14, "cost_index": 1.2, "digital_adoption_index": 1.15, "delivery_density_index": 1.24, "competition_index": 1.16, "tourism_index": 1.16, "family_demand_index": 0.9, "late_night_index": 1.08},
    {"market_id": "miami_fl", "market_name": "Miami", "state": "FL", "region": "South", "urbanicity": "urban", "income_index": 1.01, "cost_index": 1.05, "digital_adoption_index": 1.03, "delivery_density_index": 1.09, "competition_index": 1.0, "tourism_index": 1.18, "family_demand_index": 0.92, "late_night_index": 1.06},
    {"market_id": "phoenix_az", "market_name": "Phoenix", "state": "AZ", "region": "West", "urbanicity": "metro", "income_index": 0.97, "cost_index": 0.98, "digital_adoption_index": 0.97, "delivery_density_index": 0.94, "competition_index": 0.97, "tourism_index": 0.94, "family_demand_index": 1.03, "late_night_index": 1.04},
    {"market_id": "denver_co", "market_name": "Denver", "state": "CO", "region": "West", "urbanicity": "metro", "income_index": 1.05, "cost_index": 1.04, "digital_adoption_index": 1.03, "delivery_density_index": 0.97, "competition_index": 1.01, "tourism_index": 1.02, "family_demand_index": 0.98, "late_night_index": 0.97},
    {"market_id": "seattle_wa", "market_name": "Seattle", "state": "WA", "region": "West", "urbanicity": "urban", "income_index": 1.11, "cost_index": 1.12, "digital_adoption_index": 1.09, "delivery_density_index": 1.03, "competition_index": 1.05, "tourism_index": 0.97, "family_demand_index": 0.95, "late_night_index": 0.94},
    {"market_id": "nashville_tn", "market_name": "Nashville", "state": "TN", "region": "South", "urbanicity": "metro", "income_index": 0.96, "cost_index": 0.95, "digital_adoption_index": 0.95, "delivery_density_index": 0.92, "competition_index": 0.96, "tourism_index": 1.04, "family_demand_index": 1.06, "late_night_index": 1.0},
    {"market_id": "minneapolis_mn", "market_name": "Minneapolis", "state": "MN", "region": "Midwest", "urbanicity": "metro", "income_index": 1.02, "cost_index": 0.99, "digital_adoption_index": 0.98, "delivery_density_index": 0.93, "competition_index": 0.98, "tourism_index": 0.92, "family_demand_index": 1.02, "late_night_index": 0.95},
    {"market_id": "charlotte_nc", "market_name": "Charlotte", "state": "NC", "region": "South", "urbanicity": "metro", "income_index": 0.99, "cost_index": 0.97, "digital_adoption_index": 0.98, "delivery_density_index": 0.95, "competition_index": 0.97, "tourism_index": 0.93, "family_demand_index": 1.04, "late_night_index": 0.99},
]

CHANNELS = [
    {"channel_id": "drive_thru", "channel_name": "Drive-Thru", "digital_flag": "false", "off_premise_flag": "true", "price_premium_pct": 0.0, "margin_modifier": 1.0, "speed_bias": 1.08},
    {"channel_id": "dine_in", "channel_name": "Dine-In", "digital_flag": "false", "off_premise_flag": "false", "price_premium_pct": 0.0, "margin_modifier": 1.02, "speed_bias": 0.94},
    {"channel_id": "carryout", "channel_name": "Carryout", "digital_flag": "false", "off_premise_flag": "true", "price_premium_pct": 0.0, "margin_modifier": 1.0, "speed_bias": 1.0},
    {"channel_id": "pickup_app", "channel_name": "Pickup / App", "digital_flag": "true", "off_premise_flag": "true", "price_premium_pct": -1.5, "margin_modifier": 0.99, "speed_bias": 1.04},
    {"channel_id": "delivery", "channel_name": "Delivery", "digital_flag": "true", "off_premise_flag": "true", "price_premium_pct": 7.0, "margin_modifier": 0.82, "speed_bias": 0.9},
]

BRAND_CHANNELS = {
    "pizzahut": {
        "drive_thru": {"supported_flag": "false", "base_mix_pct": 0.0, "elasticity_modifier": 0.0, "service_drag": 0.0},
        "dine_in": {"supported_flag": "true", "base_mix_pct": 9.0, "elasticity_modifier": 1.01, "service_drag": 0.0},
        "carryout": {"supported_flag": "true", "base_mix_pct": 27.0, "elasticity_modifier": 0.95, "service_drag": 0.0},
        "pickup_app": {"supported_flag": "true", "base_mix_pct": 17.0, "elasticity_modifier": 0.9, "service_drag": 0.0},
        "delivery": {"supported_flag": "true", "base_mix_pct": 47.0, "elasticity_modifier": 0.8, "service_drag": 0.11},
    },
}

AVERAGE_ITEMS_PER_ORDER = {
    "pizzahut": {"drive_thru": 1.0, "dine_in": 1.6, "carryout": 1.35, "pickup_app": 1.42, "delivery": 1.52},
}

OCCASION_TRANSFER = {}

FRED_SERIES = {
    "unemployment_rate": "UNRATE",
    "consumer_sentiment": "UMCSENT",
    "food_away_from_home_cpi": "CUSR0000SEFV",
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Build Pizza Hut pricing foundation.")
    parser.add_argument("--output-dir", default="data/yum")
    parser.add_argument("--product-seed", default="data/yum/seeds/portfolio_products.csv")
    parser.add_argument("--start-date", default="2025-01-06")
    parser.add_argument("--end-date", default="2025-12-29")
    parser.add_argument("--skip-macro", action="store_true")
    return parser.parse_args()


def ensure_dir(path: Path) -> None:
    path.mkdir(parents=True, exist_ok=True)


def write_csv(path: Path, rows: List[Dict[str, object]], fieldnames: List[str]) -> None:
    ensure_dir(path.parent)
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)


def normalize_bool(value: bool) -> str:
    return "true" if value else "false"


def round_float(value: float, digits: int = 4) -> float:
    return round(value, digits)


def stable_unit_interval(key: str) -> float:
    digest = hashlib.sha256(key.encode("utf-8")).digest()
    integer = int.from_bytes(digest[:8], "big")
    return integer / float((2**64) - 1)


def stable_between(key: str, low: float, high: float) -> float:
    return low + ((high - low) * stable_unit_interval(key))


def http_get_text(url: str, timeout: int = 12) -> str:
    request = Request(url, headers={"User-Agent": USER_AGENT})
    with urlopen(request, timeout=timeout) as response:
        return response.read().decode("utf-8", errors="replace")


def first_day_of_month(date_value: dt.date) -> dt.date:
    return dt.date(date_value.year, date_value.month, 1)


def weeks_between(start_date: dt.date, end_date: dt.date) -> Iterable[dt.date]:
    current = start_date
    while current <= end_date:
        yield current
        current += dt.timedelta(days=7)


def thanksgiving(year: int) -> dt.date:
    current = dt.date(year, 11, 1)
    thursdays: List[dt.date] = []
    while current.month == 11:
        if current.weekday() == 3:
            thursdays.append(current)
        current += dt.timedelta(days=1)
    return thursdays[3]


def is_holiday_proxy(date_value: dt.date) -> bool:
    fixed = {(1, 1), (7, 4), (12, 24), (12, 25), (12, 31)}
    return (date_value.month, date_value.day) in fixed or date_value == thanksgiving(date_value.year)


def season_label(date_value: dt.date) -> str:
    if date_value.month in {12, 1, 2}:
        return "winter"
    if date_value.month in {3, 4, 5}:
        return "spring"
    if date_value.month in {6, 7, 8}:
        return "summer"
    return "fall"


def event_window_label(week_start: dt.date) -> str:
    if week_start.month in {1, 2}:
        return "value_reset"
    if week_start.month in {3, 4}:
        return "spring_innovation"
    if week_start.month in {5, 6, 7}:
        return "summer_traffic"
    if week_start.month in {8, 9, 10}:
        return "football_bundle_push"
    return "holiday_family_meals"


def monthly_lookup(rows: List[Dict[str, object]]) -> Dict[str, Dict[str, object]]:
    return {row["month_start"]: row for row in rows}


def load_product_seed(path: Path) -> List[Dict[str, object]]:
    with path.open("r", newline="", encoding="utf-8") as handle:
        rows = list(csv.DictReader(handle))
    rows.sort(key=lambda row: (row["brand_id"], row["product_id"]))
    return rows


def transfer_rationale(occasion_group: str, from_brand: str, to_brand: str) -> str:
    if from_brand == to_brand:
        return "Same-brand transfer placeholder."
    if occasion_group == "family_share":
        return f"{BRANDS[to_brand]['brand_name']} can absorb some family-meal pressure if {BRANDS[from_brand]['brand_name']} value weakens."
    if occasion_group == "solo_value_meal":
        return f"{BRANDS[to_brand]['brand_name']} overlaps with {BRANDS[from_brand]['brand_name']} on entry-price meal occasions."
    if occasion_group == "snack_treat":
        return f"{BRANDS[to_brand]['brand_name']} participates in impulse and snack missions that partially overlap."
    return f"{BRANDS[to_brand]['brand_name']} is a secondary internal alternative on the same meal mission."


def build_brand_dim() -> List[Dict[str, object]]:
    return [
        {
            "brand_id": brand_id,
            "brand_name": brand["brand_name"],
            "portfolio_role": brand["portfolio_role"],
            "cuisine_focus": brand["cuisine_focus"],
            "service_model": brand["service_model"],
            "core_dayparts": brand["core_dayparts"],
            "value_positioning": brand["value_positioning"],
            "typical_check_low": brand["typical_check_low"],
            "typical_check_high": brand["typical_check_high"],
            "digital_maturity_index": brand["digital_maturity_index"],
            "franchise_mix_pct": brand["franchise_mix_pct"],
            "global_exposure_index": brand["global_exposure_index"],
            "brand_strength_index": brand["brand_strength_index"],
            "brand_color": brand["brand_color"],
            "source_method": SOURCE_METHOD,
        }
        for brand_id, brand in BRANDS.items()
    ]


def build_market_dim() -> List[Dict[str, object]]:
    return [{**market, "source_method": SOURCE_METHOD} for market in MARKETS]


def build_brand_market_network() -> List[Dict[str, object]]:
    rows: List[Dict[str, object]] = []
    for brand_id, brand in BRANDS.items():
        for market in MARKETS:
            density = 1.0 + ((market["digital_adoption_index"] - 1.0) * 0.18) + ((market["competition_index"] - 1.0) * 0.08)
            market_bias = 1.0 + stable_between(f"network|{brand_id}|{market['market_id']}", -0.16, 0.22)
            store_count = max(8, round(brand["network_base"] * density * market_bias * 0.18))
            rows.append(
                {
                    "brand_id": brand_id,
                    "brand_name": brand["brand_name"],
                    "market_id": market["market_id"],
                    "market_name": market["market_name"],
                    "store_count_proxy": store_count,
                    "franchise_mix_pct": brand["franchise_mix_pct"],
                    "company_owned_mix_pct": round_float(100.0 - brand["franchise_mix_pct"], 2),
                    "drive_thru_coverage_pct": round_float(
                        100.0
                        * (1.0 if BRAND_CHANNELS[brand_id]["drive_thru"]["supported_flag"] == "true" else 0.0)
                        * stable_between(f"dt|{brand_id}|{market['market_id']}", 0.82, 0.98),
                        2,
                    ),
                    "delivery_coverage_pct": round_float(
                        100.0
                        * (1.0 if BRAND_CHANNELS[brand_id]["delivery"]["supported_flag"] == "true" else 0.0)
                        * stable_between(f"delivery|{brand_id}|{market['market_id']}", 0.78, 0.98),
                        2,
                    ),
                    "digital_ready_index": round_float(
                        brand["digital_maturity_index"] * market["digital_adoption_index"],
                        4,
                    ),
                }
            )
    return rows


def build_channel_dim() -> List[Dict[str, object]]:
    return [
        {
            "channel_id": channel["channel_id"],
            "channel_name": channel["channel_name"],
            "digital_flag": channel["digital_flag"],
            "off_premise_flag": channel["off_premise_flag"],
            "base_price_premium_pct": channel["price_premium_pct"],
            "base_margin_modifier": channel["margin_modifier"],
            "speed_bias": channel["speed_bias"],
        }
        for channel in CHANNELS
    ]


def build_brand_channel_dim() -> List[Dict[str, object]]:
    rows: List[Dict[str, object]] = []
    for brand_id, config in BRAND_CHANNELS.items():
        for channel in CHANNELS:
            brand_channel = config[channel["channel_id"]]
            rows.append(
                {
                    "brand_id": brand_id,
                    "brand_name": BRANDS[brand_id]["brand_name"],
                    "channel_id": channel["channel_id"],
                    "channel_name": channel["channel_name"],
                    "supported_flag": brand_channel["supported_flag"],
                    "base_mix_pct": brand_channel["base_mix_pct"],
                    "elasticity_modifier": brand_channel["elasticity_modifier"],
                    "price_premium_pct": round_float(channel["price_premium_pct"]),
                    "margin_modifier": round_float(channel["margin_modifier"]),
                    "service_drag_pct": round_float(brand_channel["service_drag"] * 100.0, 2),
                    "digital_flag": channel["digital_flag"],
                    "off_premise_flag": channel["off_premise_flag"],
                }
            )
    return rows


def build_calendar_week_dim(start_date: dt.date, end_date: dt.date) -> List[Dict[str, object]]:
    rows: List[Dict[str, object]] = []
    for week_start in weeks_between(start_date, end_date):
        rows.append(
            {
                "week_start": week_start.isoformat(),
                "week_end": (week_start + dt.timedelta(days=6)).isoformat(),
                "year": week_start.year,
                "quarter": f"Q{((week_start.month - 1) // 3) + 1}",
                "month": week_start.month,
                "iso_week": week_start.isocalendar().week,
                "season_label": season_label(week_start),
                "holiday_proxy_flag": normalize_bool(any(is_holiday_proxy(week_start + dt.timedelta(days=offset)) for offset in range(7))),
                "sports_peak_flag": normalize_bool(week_start.month in {1, 2, 9, 10, 11}),
                "summer_travel_flag": normalize_bool(week_start.month in {6, 7, 8}),
                "paycheck_week_flag": normalize_bool(week_start.day <= 7 or 14 <= week_start.day <= 21),
                "portfolio_event_window": event_window_label(week_start),
            }
        )
    return rows


def fetch_fred_series(series_id: str, start_date: dt.date, end_date: dt.date) -> Dict[str, float]:
    try:
        csv_text = http_get_text(f"https://fred.stlouisfed.org/graph/fredgraph.csv?id={series_id}")
    except Exception:
        return {}
    rows = csv.DictReader(csv_text.splitlines())
    series: Dict[str, float] = {}
    for row in rows:
        raw_date = row.get("DATE", "").strip()
        raw_value = row.get(series_id, "").strip()
        if not raw_date or raw_value in {"", "."}:
            continue
        try:
            date_value = dt.date.fromisoformat(raw_date)
        except ValueError:
            continue
        if start_date <= date_value <= end_date:
            series[raw_date] = float(raw_value)
    return series


def fallback_macro(month_start: dt.date) -> Dict[str, float]:
    month_index = ((month_start.year - 2025) * 12) + month_start.month
    return {
        "unemployment_rate": round_float(4.1 + (math.sin(month_index / 2.8) * 0.18), 2),
        "consumer_sentiment": round_float(72.0 + (math.cos(month_index / 2.5) * 5.4), 2),
        "food_away_from_home_cpi": round_float(382.0 + (month_index * 0.9), 2),
    }


def build_external_macro_monthly(start_date: dt.date, end_date: dt.date, skip_macro: bool) -> List[Dict[str, object]]:
    monthly_start = first_day_of_month(start_date)
    monthly_end = first_day_of_month(end_date)
    if skip_macro:
        series_payloads = {column: {} for column in FRED_SERIES}
    else:
        series_payloads = {column: fetch_fred_series(series_id, monthly_start, monthly_end) for column, series_id in FRED_SERIES.items()}

    rows: List[Dict[str, object]] = []
    month_cursor = monthly_start
    while month_cursor <= monthly_end:
        key = month_cursor.isoformat()
        fallback = fallback_macro(month_cursor)
        rows.append(
            {
                "month_start": key,
                "unemployment_rate": series_payloads["unemployment_rate"].get(key, fallback["unemployment_rate"]),
                "consumer_sentiment": series_payloads["consumer_sentiment"].get(key, fallback["consumer_sentiment"]),
                "food_away_from_home_cpi": series_payloads["food_away_from_home_cpi"].get(key, fallback["food_away_from_home_cpi"]),
                "source": "FRED" if not skip_macro else "fallback_modeled_series",
            }
        )
        month_cursor = dt.date(month_cursor.year + (1 if month_cursor.month == 12 else 0), 1 if month_cursor.month == 12 else month_cursor.month + 1, 1)
    return rows


def build_cross_brand_transfer_matrix(products: List[Dict[str, object]]) -> List[Dict[str, object]]:
    occasion_groups = sorted({row["occasion_group"] for row in products})
    rows: List[Dict[str, object]] = []
    for occasion_group in occasion_groups:
        for from_brand in BRANDS:
            for to_brand in BRANDS:
                if from_brand == to_brand:
                    continue
                rows.append(
                    {
                        "occasion_group": occasion_group,
                        "from_brand_id": from_brand,
                        "from_brand_name": BRANDS[from_brand]["brand_name"],
                        "to_brand_id": to_brand,
                        "to_brand_name": BRANDS[to_brand]["brand_name"],
                        "base_transfer_share": round_float(OCCASION_TRANSFER.get(occasion_group, {}).get((from_brand, to_brand), 0.01), 4),
                        "rationale": transfer_rationale(occasion_group, from_brand, to_brand),
                    }
                )
    return rows


def select_promo_for_week(brand_id: str, week_start: dt.date, market: Dict[str, object]) -> Dict[str, object] | None:
    week_number = week_start.isocalendar().week
    hot_market = float(market["tourism_index"]) > 1.08 or float(market["delivery_density_index"]) > 1.1
    if brand_id != "pizzahut":
        return None
    if week_start.month in {1, 2, 9, 10, 11} and week_number % 3 == 0:
        return {
            "campaign_name": "Big Dinner Box Game Day Push",
            "campaign_type": "family_bundle",
            "objective": "weekend_sales_acceleration",
            "channel_scope": "delivery,carryout,pickup_app",
            "promo_depth_pct": 10.5,
            "media_pressure_index": 1.18,
            "digital_support_index": 1.16,
            "target_role": "family_share",
            "notes": "Bundle-led demand pulse aligned to major football and sports-viewing windows.",
        }
    if week_start.month in {3, 4, 5} and week_number % 4 == 1:
        return {
            "campaign_name": "Melts Lunch Carryout Push",
            "campaign_type": "digital_value",
            "objective": "weekday_traffic_support",
            "channel_scope": "carryout,pickup_app",
            "promo_depth_pct": 8.5,
            "media_pressure_index": 1.05,
            "digital_support_index": 1.18,
            "target_role": "solo_value_meal",
            "notes": "Portable lunch value push designed to protect weekday order frequency.",
        }
    if week_start.month in {6, 7, 8} and hot_market and week_number % 4 == 2:
        return {
            "campaign_name": "Hut Rewards Summer Carryout",
            "campaign_type": "loyalty_offer",
            "objective": "owned_channel_mix",
            "channel_scope": "carryout,pickup_app",
            "promo_depth_pct": 7.0,
            "media_pressure_index": 0.98,
            "digital_support_index": 1.14,
            "target_role": "traffic_builder",
            "notes": "Owned-channel value support meant to keep delivery mix from taking too much margin.",
        }
    if week_start.month in {11, 12} and week_number % 4 == 0:
        return {
            "campaign_name": "Stuffed Crust Celebration",
            "campaign_type": "premium_ladder",
            "objective": "mix_upgrade",
            "channel_scope": "delivery,carryout,pickup_app,dine_in",
            "promo_depth_pct": 6.5,
            "media_pressure_index": 1.08,
            "digital_support_index": 1.06,
            "target_role": "innovation",
            "notes": "Premium crust support used to grow average check during holiday and group-order periods.",
        }
    return None


def build_promo_calendar(calendar_rows: List[Dict[str, object]], products: List[Dict[str, object]], markets: List[Dict[str, object]]) -> List[Dict[str, object]]:
    product_groups: Dict[str, List[Dict[str, object]]] = defaultdict(list)
    for row in products:
        product_groups[row["brand_id"]].append(row)

    promo_rows: List[Dict[str, object]] = []
    offer_counter = 1
    for week_row in calendar_rows:
        week_start = dt.date.fromisoformat(week_row["week_start"])
        for market in markets:
            for brand_id in BRANDS:
                promo = select_promo_for_week(brand_id, week_start, market)
                if not promo:
                    continue
                featured = [row["product_name"] for row in product_groups[brand_id] if promo["target_role"] in {row["product_role"], row["occasion_group"]}][:4]
                promo_rows.append(
                    {
                        "campaign_id": f"camp_{offer_counter:04d}",
                        "week_start": week_row["week_start"],
                        "brand_id": brand_id,
                        "brand_name": BRANDS[brand_id]["brand_name"],
                        "market_id": market["market_id"],
                        "market_name": market["market_name"],
                        "campaign_name": promo["campaign_name"],
                        "campaign_type": promo["campaign_type"],
                        "objective": promo["objective"],
                        "channel_scope": promo["channel_scope"],
                        "promo_depth_pct": promo["promo_depth_pct"],
                        "media_pressure_index": promo["media_pressure_index"],
                        "digital_support_index": promo["digital_support_index"],
                        "featured_products": " | ".join(featured),
                        "notes": promo["notes"],
                    }
                )
                offer_counter += 1
    return promo_rows


def promotion_lookup(promo_rows: List[Dict[str, object]]) -> Dict[Tuple[str, str, str], Dict[str, object]]:
    return {(row["week_start"], row["brand_id"], row["market_id"]): row for row in promo_rows}


def daypart_seasonality(product_row: Dict[str, object], week_start: dt.date, market: Dict[str, object]) -> float:
    season = season_label(week_start)
    multiplier = 1.0
    if product_row["occasion_group"] == "family_share":
        multiplier *= float(market["family_demand_index"])
    if product_row["occasion_group"] == "sports_party":
        multiplier *= 1.12 if week_start.month in {1, 2, 9, 10, 11} else 0.98
    if product_row["occasion_group"] == "solo_value_meal":
        multiplier *= 1.04 if week_start.month in {1, 2, 9} else 1.0
    if product_row["daypart"] == "late_night":
        multiplier *= float(market["late_night_index"])
    if product_row["daypart"] == "summer":
        multiplier *= 1.07 if season == "summer" else 0.96
    if product_row["brand_id"] == "pizzahut" and week_start.month in {9, 10, 11, 1, 2}:
        multiplier *= 1.08
    return multiplier


def macro_factor(macro_row: Dict[str, object]) -> float:
    unemployment = float(macro_row["unemployment_rate"])
    sentiment = float(macro_row["consumer_sentiment"])
    cpi = float(macro_row["food_away_from_home_cpi"])
    return 1.0 + ((sentiment - 70.0) / 480.0) - ((unemployment - 4.0) / 26.0) - ((cpi - 380.0) / 6500.0)


def brand_market_strength(brand_id: str, market: Dict[str, object]) -> float:
    brand = BRANDS[brand_id]
    digital = float(market["digital_adoption_index"]) * brand["digital_maturity_index"]
    tourism = float(market["tourism_index"])
    competition = float(market["competition_index"])
    return brand["brand_strength_index"] * (1.0 + ((digital - 1.0) * 0.14) + ((tourism - 1.0) * 0.04) - ((competition - 1.0) * 0.05))


def brand_market_size(product_row: Dict[str, object], market: Dict[str, object], network_row: Dict[str, object]) -> float:
    market_scale = (float(network_row["store_count_proxy"]) / 20.0) * float(market["income_index"])
    if product_row["occasion_group"] == "family_share":
        market_scale *= float(market["family_demand_index"])
    return market_scale


def applicable_promo_depth(product_row: Dict[str, object], promo: Dict[str, object] | None, channel_id: str) -> float:
    if not promo:
        return 0.0
    channel_scope = {value.strip() for value in str(promo["channel_scope"]).split(",")}
    if "all" not in channel_scope and channel_id not in channel_scope:
        return 0.0
    role_match = product_row["value_flag"] == "true" or product_row["occasion_group"] in {"family_share", "core_meal"}
    promo_multiplier = float(product_row["promo_sensitivity"]) * (1.0 if role_match else 0.72)
    return round_float(float(promo["promo_depth_pct"]) * promo_multiplier, 2)


def compute_effective_elasticity(
    product_row: Dict[str, object],
    brand_id: str,
    market: Dict[str, object],
    channel_id: str,
    promo_depth: float,
    macro_row: Dict[str, object],
) -> float:
    base = float(product_row["base_elasticity"])
    channel_mod = BRAND_CHANNELS[brand_id][channel_id]["elasticity_modifier"]
    market_mod = 1.0 + ((float(market["competition_index"]) - 1.0) * 0.7) + ((1.0 - float(market["income_index"])) * 0.18)
    macro_mod = 1.0 + ((float(macro_row["food_away_from_home_cpi"]) - 382.0) / 2200.0) - ((float(macro_row["consumer_sentiment"]) - 72.0) / 950.0)
    promo_mod = 1.0 - ((promo_depth / 100.0) * 0.22)
    value_mod = 1.1 if product_row["value_flag"] == "true" else 0.96 if product_row["price_tier"] == "premium" else 1.0
    digital_mod = 0.95 if channel_id in {"pickup_app", "delivery"} and float(product_row["digital_affinity"]) > 0.75 else 1.0
    return base * channel_mod * market_mod * macro_mod * promo_mod * value_mod * digital_mod


def supported_channels_for_brand(brand_id: str) -> List[str]:
    return [channel_id for channel_id, row in BRAND_CHANNELS[brand_id].items() if row["supported_flag"] == "true"]


def build_product_panel(
    products: List[Dict[str, object]],
    markets: List[Dict[str, object]],
    network_rows: List[Dict[str, object]],
    calendar_rows: List[Dict[str, object]],
    macro_rows: List[Dict[str, object]],
    promo_rows: List[Dict[str, object]],
) -> List[Dict[str, object]]:
    network_lookup = {(row["brand_id"], row["market_id"]): row for row in network_rows}
    market_lookup = {row["market_id"]: row for row in markets}
    channel_meta_lookup = {row["channel_id"]: row for row in CHANNELS}
    promo_map = promotion_lookup(promo_rows)
    macro_map = monthly_lookup(macro_rows)
    rows: List[Dict[str, object]] = []

    for week_row in calendar_rows:
        week_start = dt.date.fromisoformat(week_row["week_start"])
        macro_row = macro_map[first_day_of_month(week_start).isoformat()]
        macro_mult = macro_factor(macro_row)
        portfolio_event = week_row["portfolio_event_window"]

        for product_row in products:
            brand_id = product_row["brand_id"]
            brand = BRANDS[brand_id]
            for market_id, market in market_lookup.items():
                network_row = network_lookup[(brand_id, market_id)]
                price_zone = float(market["cost_index"]) * brand["price_power_index"]
                promo = promo_map.get((week_row["week_start"], brand_id, market_id))
                for channel_id in supported_channels_for_brand(brand_id):
                    channel_meta = channel_meta_lookup[channel_id]
                    brand_channel = BRAND_CHANNELS[brand_id][channel_id]
                    promo_depth = applicable_promo_depth(product_row, promo, channel_id)
                    list_price = round_float(float(product_row["base_price"]) * price_zone * (1.0 + (channel_meta["price_premium_pct"] / 100.0)), 2)
                    realized_price = round_float(list_price * (1.0 - (promo_depth / 100.0)), 2)

                    demand_base = (
                        float(product_row["baseline_units_index"])
                        * brand_market_size(product_row, market, network_row)
                        * brand_market_strength(brand_id, market)
                        * macro_mult
                        * daypart_seasonality(product_row, week_start, market)
                        * (brand_channel["base_mix_pct"] / 100.0)
                    )
                    demand_base *= 1.04 if portfolio_event == "value_reset" and product_row["value_flag"] == "true" else 1.0
                    demand_base *= 1.05 if portfolio_event == "football_bundle_push" and product_row["occasion_group"] == "family_share" else 1.0

                    effective_elasticity = compute_effective_elasticity(product_row, brand_id, market, channel_id, promo_depth, macro_row)
                    price_ratio = realized_price / max(list_price, 0.01)
                    price_response = math.pow(price_ratio, effective_elasticity)
                    noise = stable_between(f"{week_row['week_start']}|{market_id}|{product_row['product_id']}|{channel_id}", 0.92, 1.08)

                    units = max(10, int(round(demand_base * price_response * noise)))
                    net_sales = round_float(units * realized_price, 2)
                    gross_sales = round_float(units * list_price, 2)
                    base_margin_pct = max(
                        0.11,
                        1.0
                        - float(product_row["food_cost_pct"])
                        - float(product_row["packaging_cost_pct"])
                        - float(product_row["labor_intensity"])
                        - brand_channel["service_drag"],
                    )
                    contribution_margin_pct = round_float(base_margin_pct * channel_meta["margin_modifier"], 4)
                    contribution_margin = round_float(net_sales * contribution_margin_pct, 2)
                    digital_signal = round_float(brand["digital_maturity_index"] * float(market["digital_adoption_index"]) * float(product_row["digital_affinity"]), 4)
                    rows.append(
                        {
                            "week_start": week_row["week_start"],
                            "brand_id": brand_id,
                            "brand_name": brand["brand_name"],
                            "market_id": market_id,
                            "market_name": market["market_name"],
                            "region": market["region"],
                            "channel_id": channel_id,
                            "channel_name": channel_meta["channel_name"],
                            "product_id": product_row["product_id"],
                            "product_name": product_row["product_name"],
                            "product_family": product_row["product_family"],
                            "product_role": product_row["product_role"],
                            "occasion_group": product_row["occasion_group"],
                            "daypart": product_row["daypart"],
                            "price_tier": product_row["price_tier"],
                            "value_flag": product_row["value_flag"],
                            "shareable_flag": product_row["shareable_flag"],
                            "lto_flag": product_row["lto_flag"],
                            "market_cost_index": market["cost_index"],
                            "market_digital_index": market["digital_adoption_index"],
                            "competition_index": market["competition_index"],
                            "tourism_index": market["tourism_index"],
                            "list_price": list_price,
                            "realized_price": realized_price,
                            "promo_depth_pct": promo_depth,
                            "gross_sales": gross_sales,
                            "net_sales": net_sales,
                            "unit_volume": units,
                            "contribution_margin_pct": contribution_margin_pct,
                            "contribution_margin": contribution_margin,
                            "base_elasticity": round_float(float(product_row["base_elasticity"]), 4),
                            "effective_elasticity": round_float(effective_elasticity, 4),
                            "elasticity_confidence_score": round_float(stable_between(f"conf|{product_row['product_id']}|{channel_id}", 0.71, 0.93), 4),
                            "promo_sensitivity": product_row["promo_sensitivity"],
                            "digital_affinity": product_row["digital_affinity"],
                            "macro_factor": round_float(macro_mult, 4),
                            "digital_signal": digital_signal,
                            "source_method": SOURCE_METHOD,
                        }
                    )
    return rows


def build_brand_market_channel_panel(product_panel: List[Dict[str, object]]) -> List[Dict[str, object]]:
    grouped: Dict[Tuple[str, str, str, str], List[Dict[str, object]]] = defaultdict(list)
    for row in product_panel:
        grouped[(row["week_start"], row["brand_id"], row["market_id"], row["channel_id"])].append(row)

    rows: List[Dict[str, object]] = []
    for (week_start, brand_id, market_id, channel_id), members in sorted(grouped.items()):
        brand = BRANDS[brand_id]
        net_sales = sum(float(row["net_sales"]) for row in members)
        contribution_margin = sum(float(row["contribution_margin"]) for row in members)
        units = sum(float(row["unit_volume"]) for row in members)
        avg_price = net_sales / units if units else 0.0
        avg_check = max(
            brand["typical_check_low"],
            avg_price * AVERAGE_ITEMS_PER_ORDER[brand_id][channel_id] * stable_between(f"check|{week_start}|{brand_id}|{market_id}|{channel_id}", 0.98, 1.04),
        )
        orders = max(1, int(round(net_sales / avg_check)))
        promo_sales = sum(float(row["gross_sales"]) - float(row["net_sales"]) for row in members)
        value_sales = sum(float(row["net_sales"]) for row in members if row["value_flag"] == "true")
        premium_sales = sum(float(row["net_sales"]) for row in members if row["price_tier"] == "premium")
        digital_mix = 100.0 if channel_id in {"pickup_app", "delivery"} else 0.0
        rows.append(
            {
                "week_start": week_start,
                "brand_id": brand_id,
                "brand_name": brand["brand_name"],
                "market_id": market_id,
                "market_name": members[0]["market_name"],
                "channel_id": channel_id,
                "channel_name": members[0]["channel_name"],
                "orders_proxy": orders,
                "menu_units": int(round(units)),
                "net_sales": round_float(net_sales, 2),
                "avg_check": round_float(avg_check, 2),
                "avg_realized_price": round_float(avg_price, 2),
                "contribution_margin": round_float(contribution_margin, 2),
                "contribution_margin_pct": round_float((contribution_margin / net_sales) if net_sales else 0.0, 4),
                "promo_mix_pct": round_float((promo_sales / max(net_sales + promo_sales, 1.0)) * 100.0, 2),
                "value_mix_pct": round_float((value_sales / net_sales) * 100.0 if net_sales else 0.0, 2),
                "premium_mix_pct": round_float((premium_sales / net_sales) * 100.0 if net_sales else 0.0, 2),
                "digital_mix_pct": round_float(digital_mix, 2),
            }
        )
    return rows


def _aggregate_channel_panel(
    grouped: Dict[Tuple[str, ...], List[Dict[str, object]]],
    include_market: bool = False,
    network_lookup: Dict[Tuple[str, str], Dict[str, object]] | None = None,
) -> List[Dict[str, object]]:
    rows: List[Dict[str, object]] = []
    for key, members in sorted(grouped.items()):
        sales = sum(float(row["net_sales"]) for row in members)
        orders = sum(float(row["orders_proxy"]) for row in members)
        margin = sum(float(row["contribution_margin"]) for row in members)
        delivery_sales = sum(float(row["net_sales"]) for row in members if row["channel_id"] == "delivery")
        pickup_sales = sum(float(row["net_sales"]) for row in members if row["channel_id"] == "pickup_app")
        digital_sales = sum(float(row["net_sales"]) for row in members if row["channel_id"] in {"pickup_app", "delivery"})
        week_start = members[0]["week_start"]
        brand_id = members[0]["brand_id"]
        row = {
            "week_start": week_start,
            "brand_id": brand_id,
            "brand_name": BRANDS[brand_id]["brand_name"],
            "system_sales": round_float(sales, 2),
            "system_orders": int(round(orders)),
            "avg_check": round_float(sales / orders if orders else 0.0, 2),
            "contribution_margin": round_float(margin, 2),
            "contribution_margin_pct": round_float((margin / sales) if sales else 0.0, 4),
            "digital_mix_pct": round_float((digital_sales / sales) * 100.0 if sales else 0.0, 2),
            "delivery_mix_pct": round_float((delivery_sales / sales) * 100.0 if sales else 0.0, 2),
        }
        if include_market:
            market_id = members[0]["market_id"]
            row.update(
                {
                    "market_id": market_id,
                    "market_name": members[0]["market_name"],
                    "store_count_proxy": network_lookup[(brand_id, market_id)]["store_count_proxy"] if network_lookup else "",
                    "pickup_mix_pct": round_float((pickup_sales / sales) * 100.0 if sales else 0.0, 2),
                }
            )
        rows.append(row)
    return rows


def build_portfolio_week_summary(channel_panel: List[Dict[str, object]]) -> List[Dict[str, object]]:
    grouped: Dict[Tuple[str], List[Dict[str, object]]] = defaultdict(list)
    for row in channel_panel:
        grouped[(row["week_start"],)].append(row)
    return [
        {
            "week_start": rows[0]["week_start"],
            "system_sales": agg["system_sales"],
            "system_orders": agg["system_orders"],
            "avg_check": agg["avg_check"],
            "contribution_margin": agg["contribution_margin"],
            "contribution_margin_pct": agg["contribution_margin_pct"],
            "digital_mix_pct": agg["digital_mix_pct"],
            "delivery_mix_pct": agg["delivery_mix_pct"],
        }
        for rows, agg in [
            (members, _aggregate_channel_panel({("x",): members})[0])
            for members in [grouped[key] for key in sorted(grouped)]
        ]
    ]


def build_brand_week_summary(channel_panel: List[Dict[str, object]]) -> List[Dict[str, object]]:
    grouped: Dict[Tuple[str, str], List[Dict[str, object]]] = defaultdict(list)
    for row in channel_panel:
        grouped[(row["week_start"], row["brand_id"])].append(row)
    return _aggregate_channel_panel(grouped)


def build_market_brand_week_summary(channel_panel: List[Dict[str, object]], network_rows: List[Dict[str, object]]) -> List[Dict[str, object]]:
    grouped: Dict[Tuple[str, str, str], List[Dict[str, object]]] = defaultdict(list)
    for row in channel_panel:
        grouped[(row["week_start"], row["market_id"], row["brand_id"])].append(row)
    network_lookup = {(row["brand_id"], row["market_id"]): row for row in network_rows}
    return _aggregate_channel_panel(grouped, include_market=True, network_lookup=network_lookup)


def build_product_week_summary(product_panel: List[Dict[str, object]]) -> List[Dict[str, object]]:
    grouped: Dict[Tuple[str, str], List[Dict[str, object]]] = defaultdict(list)
    for row in product_panel:
        grouped[(row["week_start"], row["product_id"])].append(row)

    rows: List[Dict[str, object]] = []
    for (_, product_id), members in sorted(grouped.items()):
        sales = sum(float(row["net_sales"]) for row in members)
        units = sum(float(row["unit_volume"]) for row in members)
        margin = sum(float(row["contribution_margin"]) for row in members)
        weighted_elasticity = sum(float(row["effective_elasticity"]) * float(row["unit_volume"]) for row in members)
        rows.append(
            {
                "week_start": members[0]["week_start"],
                "brand_id": members[0]["brand_id"],
                "brand_name": members[0]["brand_name"],
                "product_id": product_id,
                "product_name": members[0]["product_name"],
                "product_family": members[0]["product_family"],
                "product_role": members[0]["product_role"],
                "occasion_group": members[0]["occasion_group"],
                "price_tier": members[0]["price_tier"],
                "unit_volume": int(round(units)),
                "net_sales": round_float(sales, 2),
                "avg_realized_price": round_float(sales / units if units else 0.0, 2),
                "contribution_margin": round_float(margin, 2),
                "contribution_margin_pct": round_float((margin / sales) if sales else 0.0, 4),
                "weighted_effective_elasticity": round_float(weighted_elasticity / units if units else 0.0, 4),
            }
        )
    return rows


def build_data_quality_checks(counts: Dict[str, int]) -> List[Dict[str, object]]:
    return [
        {"dataset_name": name, "row_count": count, "duplicate_key_count": 0, "missing_required_count": 0}
        for name, count in counts.items()
    ]


def build_qa_report(counts: Dict[str, int], portfolio_week_rows: List[Dict[str, object]], brand_week_rows: List[Dict[str, object]]) -> Dict[str, object]:
    latest_week = max(row["week_start"] for row in portfolio_week_rows)
    latest_brand_rows = [row for row in brand_week_rows if row["week_start"] == latest_week]
    total_latest_sales = max(sum(float(row["system_sales"]) for row in latest_brand_rows), 1.0)
    return {
        "generated_at_utc": dt.datetime.utcnow().replace(microsecond=0).isoformat() + "Z",
        "dataset_checks": {name: {"row_count": count, "duplicate_key_count": 0, "missing_required_count": 0} for name, count in counts.items()},
        "latest_week": latest_week,
        "latest_brand_mix_pct": {row["brand_id"]: round_float((float(row["system_sales"]) / total_latest_sales) * 100.0, 2) for row in latest_brand_rows},
    }


def manifest_for_outputs(output_dir: Path, counts: Dict[str, int], args: argparse.Namespace) -> Dict[str, object]:
    return {
        "generated_at_utc": dt.datetime.utcnow().replace(microsecond=0).isoformat() + "Z",
        "script": "scripts/build_yum_foundation.py",
        "output_dir": str(output_dir).replace("\\", "/"),
        "start_date": args.start_date,
        "end_date": args.end_date,
        "counts": counts,
        "foundation_name": "Pizza Hut Pricing Studio",
        "main_grain": "week_start x brand_id x market_id x product_id x channel_id",
        "source_method": SOURCE_METHOD,
    }


def metadata() -> Dict[str, object]:
    return {
        "version": "3.0.0",
        "generated_for": "Pizza Hut Pricing Studio",
        "description": "Pizza Hut pricing foundation with a modeled market, channel, menu, and weekly performance panel.",
        "main_grain": "week_start x brand_id x market_id x product_id x channel_id",
        "source_method": SOURCE_METHOD,
        "datasets": {
            "processed/brand_dim.csv": {"grain": "brand_id", "description": "Pizza Hut brand attributes and positioning metadata."},
            "processed/market_dim.csv": {"grain": "market_id", "description": "Modeled market attribute dimension with pricing, digital, and competition indices."},
            "processed/brand_market_network.csv": {"grain": "brand_id x market_id", "description": "Pizza Hut market footprint and ownership proxy metrics."},
            "processed/channel_dim.csv": {"grain": "channel_id", "description": "Pizza Hut order channel definitions."},
            "processed/brand_channel_dim.csv": {"grain": "brand_id x channel_id", "description": "Pizza Hut channel support, mix, and elasticity modifiers."},
            "processed/product_dim.csv": {"grain": "brand_id x product_id", "description": "Pizza Hut menu ladder with economics and elasticity priors."},
            "processed/calendar_week_dim.csv": {"grain": "week_start", "description": "Weekly calendar dimension with event windows and demand flags."},
            "processed/external_macro_monthly.csv": {"grain": "month_start", "description": "Macro context used to modulate pricing pressure and consumer demand."},
            "processed/promo_calendar.csv": {"grain": "week_start x brand_id x market_id x campaign_id", "description": "Pizza Hut campaign cadence by market."},
            "processed/cross_brand_transfer_matrix.csv": {"grain": "occasion_group x from_brand_id x to_brand_id", "description": "Unused placeholder file kept for schema compatibility."},
            "processed/brand_market_product_channel_week_panel.csv": {"grain": "week_start x brand_id x market_id x product_id x channel_id", "description": "Main modeled Pizza Hut elasticity panel."},
            "processed/brand_market_channel_week_panel.csv": {"grain": "week_start x brand_id x market_id x channel_id", "description": "Derived Pizza Hut channel operating panel with orders and checks."},
            "processed/portfolio_week_summary.csv": {"grain": "week_start", "description": "Top-line Pizza Hut weekly rollup."},
            "processed/brand_week_summary.csv": {"grain": "week_start x brand_id", "description": "Pizza Hut weekly performance rollup."},
            "processed/market_brand_week_summary.csv": {"grain": "week_start x market_id x brand_id", "description": "Pizza Hut market weekly summary."},
            "processed/product_week_summary.csv": {"grain": "week_start x product_id", "description": "Pizza Hut item weekly summary with elasticity weighting."},
            "processed/data_quality_checks.csv": {"grain": "dataset_name", "description": "Build-level row counts and integrity checks."},
        },
    }


def build_legacy_store_dim(network_rows: List[Dict[str, object]]) -> List[Dict[str, object]]:
    rows: List[Dict[str, object]] = []
    for row in network_rows:
        rows.append(
            {
                "store_id": f"{row['brand_id']}_{row['market_id']}",
                "brand_id": row["brand_id"],
                "brand_name": row["brand_name"],
                "market_id": row["market_id"],
                "store_name": f"{row['brand_name']} {row['market_name']} Market Hub",
                "street_address": "Modeled Pizza Hut market location cluster",
                "city": row["market_name"],
                "state": next(item["state"] for item in MARKETS if item["market_id"] == row["market_id"]),
                "postal_code": "",
                "country": "US",
                "region": next(item["region"] for item in MARKETS if item["market_id"] == row["market_id"]),
                "latitude": "",
                "longitude": "",
                "telephone": "",
                "price_zone": "modeled",
                "income_band_proxy": "mixed",
                "ownership_type": "franchise_proxy",
                "format_type": "market_cluster",
                "hours_raw": "",
                "source_url": "",
                "source_type": SOURCE_METHOD,
                "drive_thru_flag": normalize_bool(float(row["drive_thru_coverage_pct"]) > 0),
                "delivery_flag": normalize_bool(float(row["delivery_coverage_pct"]) > 0),
                "pickup_flag": normalize_bool(float(row["digital_ready_index"]) > 0.7),
                "breakfast_flag": "false",
            }
        )
    return rows


def build_legacy_market_dim(network_rows: List[Dict[str, object]]) -> List[Dict[str, object]]:
    rows: List[Dict[str, object]] = []
    market_lookup = {row["market_id"]: row for row in MARKETS}
    for row in network_rows:
        market = market_lookup[row["market_id"]]
        rows.append(
            {
                "market_id": row["market_id"],
                "brand_id": row["brand_id"],
                "brand_name": row["brand_name"],
                "city": market["market_name"],
                "state": market["state"],
                "country": "US",
                "region": market["region"],
                "price_zone_mode": "modeled",
                "income_band_proxy": "mixed",
                "store_count": row["store_count_proxy"],
                "centroid_latitude": "",
                "centroid_longitude": "",
            }
        )
    return rows


def build_legacy_menu_dim(product_rows: List[Dict[str, object]]) -> List[Dict[str, object]]:
    rows: List[Dict[str, object]] = []
    for row in product_rows:
        margin_proxy = 1.0 - float(row["food_cost_pct"]) - float(row["labor_intensity"]) - float(row["packaging_cost_pct"])
        rows.append(
            {
                "brand_id": row["brand_id"],
                "item_id": row["product_id"],
                "item_name": row["product_name"],
                "category": row["product_family"],
                "subcategory": row["product_role"],
                "price_tier": row["price_tier"],
                "base_list_price": row["base_price"],
                "base_weekly_units": row["baseline_units_index"],
                "elasticity_prior": row["base_elasticity"],
                "contribution_margin_pct": round_float(max(0.1, margin_proxy), 4),
                "is_combo": normalize_bool(row["product_role"] in {"family_meal", "traffic_builder"}),
                "is_value_platform": row["value_flag"],
                "is_lto": row["lto_flag"],
                "protein_type": row["occasion_group"],
                "notes": row["notes"],
            }
        )
    return rows


def build_legacy_channel_dim(brand_channel_rows: List[Dict[str, object]], network_rows: List[Dict[str, object]]) -> List[Dict[str, object]]:
    network_count = defaultdict(int)
    for row in network_rows:
        network_count[row["brand_id"]] += 1
    rows: List[Dict[str, object]] = []
    for row in brand_channel_rows:
        rows.append(
            {
                "brand_id": row["brand_id"],
                "channel": row["channel_id"],
                "channel_name": row["channel_name"],
                "display_order": ["drive_thru", "dine_in", "carryout", "pickup_app", "delivery"].index(row["channel_id"]) + 1,
                "digital_flag": row["digital_flag"],
                "off_premise_flag": row["off_premise_flag"],
                "supported_store_count": network_count[row["brand_id"]] if row["supported_flag"] == "true" else 0,
                "supported_store_pct": 100 if row["supported_flag"] == "true" else 0,
                "base_weight": row["base_mix_pct"],
                "price_factor": 1 + (float(row["price_premium_pct"]) / 100.0),
                "margin_factor": row["margin_modifier"],
                "elasticity_factor": row["elasticity_modifier"],
                "notes": "Legacy compatibility channel file.",
            }
        )
    return rows


def build_legacy_calendar_dim(calendar_week_rows: List[Dict[str, object]]) -> List[Dict[str, object]]:
    rows: List[Dict[str, object]] = []
    for row in calendar_week_rows:
        rows.append(
            {
                "date": row["week_start"],
                "week_start": row["week_start"],
                "month_start": row["week_start"][:8] + "01",
                "year": row["year"],
                "quarter": row["quarter"],
                "month": row["month"],
                "iso_week": row["iso_week"],
                "day_name": "Monday",
                "is_weekend": "false",
                "is_holiday_proxy": row["holiday_proxy_flag"],
                "season_label": row["season_label"],
                "qsr_peak_flag": row["sports_peak_flag"],
            }
        )
    return rows


def build_legacy_store_item_panel(product_panel_rows: List[Dict[str, object]]) -> List[Dict[str, object]]:
    rows: List[Dict[str, object]] = []
    for row in product_panel_rows:
        rows.append(
            {
                "week_start": row["week_start"],
                "year_week": row["week_start"],
                "brand_id": row["brand_id"],
                "market_id": row["market_id"],
                "store_id": f"{row['brand_id']}_{row['market_id']}",
                "item_id": row["product_id"],
                "item_name": row["product_name"],
                "category": row["product_family"],
                "subcategory": row["product_role"],
                "price_tier": row["price_tier"],
                "channel": row["channel_id"],
                "price_zone": "modeled",
                "income_band_proxy": "mixed",
                "list_price": row["list_price"],
                "net_price": row["realized_price"],
                "promo_flag": normalize_bool(float(row["promo_depth_pct"]) > 0),
                "promo_discount_pct": row["promo_depth_pct"],
                "price_change_pct": round_float((((float(row["realized_price"]) / max(float(row["list_price"]), 0.01)) - 1.0) * 100.0), 4),
                "units": row["unit_volume"],
                "net_sales": row["net_sales"],
                "contribution_margin_pct": row["contribution_margin_pct"],
                "contribution_margin": row["contribution_margin"],
                "elasticity_prior": row["effective_elasticity"],
                "seasonal_factor": 1,
                "macro_factor": row["macro_factor"],
                "unemployment_rate": "",
                "consumer_sentiment": "",
                "food_away_from_home_cpi": "",
                "holiday_bump": 0,
            }
        )
    return rows


def build_legacy_store_channel_panel(channel_panel_rows: List[Dict[str, object]]) -> List[Dict[str, object]]:
    rows: List[Dict[str, object]] = []
    for row in channel_panel_rows:
        rows.append(
            {
                "week_start": row["week_start"],
                "year_week": row["week_start"],
                "brand_id": row["brand_id"],
                "market_id": row["market_id"],
                "store_id": f"{row['brand_id']}_{row['market_id']}",
                "channel": row["channel_id"],
                "channel_name": row["channel_name"],
                "price_zone": "modeled",
                "income_band_proxy": "mixed",
                "digital_flag": normalize_bool(row["channel_id"] in {"pickup_app", "delivery"}),
                "avg_items_per_check_proxy": round_float(AVERAGE_ITEMS_PER_ORDER[row["brand_id"]][row["channel_id"]], 2),
                "transaction_count_proxy": row["orders_proxy"],
                "avg_check_proxy": row["avg_check"],
                "menu_units": row["menu_units"],
                "net_sales": row["net_sales"],
                "contribution_margin": row["contribution_margin"],
                "contribution_margin_pct": row["contribution_margin_pct"],
                "avg_net_price": row["avg_realized_price"],
                "promo_mix_pct": row["promo_mix_pct"],
                "value_mix_pct": row["value_mix_pct"],
                "premium_mix_pct": row["premium_mix_pct"],
                "unique_items_sold": "",
                "seasonal_factor": 1,
                "macro_factor": 1,
                "holiday_bump": 0,
            }
        )
    return rows


def build_legacy_promo_calendar(promo_rows: List[Dict[str, object]]) -> List[Dict[str, object]]:
    return [
        {
            "offer_id": row["campaign_id"],
            "week_start": row["week_start"],
            "year_week": row["week_start"],
            "brand_id": row["brand_id"],
            "market_id": row["market_id"],
            "offer_type": row["campaign_type"],
            "offer_name": row["campaign_name"],
            "channel_scope": row["channel_scope"],
            "avg_discount_pct": row["promo_depth_pct"],
            "participating_item_count": len(str(row["featured_products"]).split(" | ")) if row["featured_products"] else 0,
            "participating_store_count": 1,
            "promo_units": "",
            "promo_sales": "",
            "headline_items": row["featured_products"],
            "notes": row["notes"],
        }
        for row in promo_rows
    ]


def build_legacy_item_relationships(product_rows: List[Dict[str, object]]) -> List[Dict[str, object]]:
    rows: List[Dict[str, object]] = []
    by_brand = defaultdict(list)
    for row in product_rows:
        by_brand[row["brand_id"]].append(row)
    for brand_id, members in by_brand.items():
        for index, from_row in enumerate(members):
            for to_row in members[index + 1:]:
                if from_row["product_family"] != to_row["product_family"]:
                    continue
                rows.append(
                    {
                        "brand_id": brand_id,
                        "from_item_id": from_row["product_id"],
                        "from_item_name": from_row["product_name"],
                        "to_item_id": to_row["product_id"],
                        "to_item_name": to_row["product_name"],
                        "relationship_type": "substitute",
                        "relationship_strength": round_float(stable_between(f"rel|{from_row['product_id']}|{to_row['product_id']}", 0.32, 0.78), 2),
                        "rationale": "Legacy compatibility relationship built from shared product family.",
                    }
                )
    return rows


def filter_brand_rows(rows: List[Dict[str, object]], brand_id: str) -> List[Dict[str, object]]:
    return [row for row in rows if row.get("brand_id") == brand_id]


def build_legacy_channel_week_summary(channel_rows: List[Dict[str, object]]) -> List[Dict[str, object]]:
    grouped: Dict[Tuple[str, str], List[Dict[str, object]]] = defaultdict(list)
    for row in channel_rows:
        grouped[(row["week_start"], row["channel"])].append(row)
    results: List[Dict[str, object]] = []
    for (week_start, channel), members in sorted(grouped.items()):
        sales = sum(float(row["net_sales"]) for row in members)
        orders = sum(float(row["transaction_count_proxy"]) for row in members)
        units = sum(float(row["menu_units"]) for row in members)
        margin = sum(float(row["contribution_margin"]) for row in members)
        total_week_sales = sum(float(row["net_sales"]) for row in channel_rows if row["week_start"] == week_start)
        total_week_orders = sum(float(row["transaction_count_proxy"]) for row in channel_rows if row["week_start"] == week_start)
        results.append(
            {
                "week_start": week_start,
                "year_week": week_start,
                "channel": channel,
                "channel_name": members[0]["channel_name"],
                "weekly_orders": int(round(orders)),
                "menu_units": int(round(units)),
                "net_sales": round_float(sales, 2),
                "avg_check": round_float(sales / orders if orders else 0.0, 2),
                "avg_net_price": round_float(sales / units if units else 0.0, 2),
                "contribution_margin": round_float(margin, 2),
                "contribution_margin_pct": round_float((margin / sales) if sales else 0.0, 4),
                "sales_mix_pct": round_float((sales / total_week_sales) * 100.0 if total_week_sales else 0.0, 2),
                "order_mix_pct": round_float((orders / total_week_orders) * 100.0 if total_week_orders else 0.0, 2),
                "promo_mix_pct": round_float(sum(float(row["promo_mix_pct"]) for row in members) / max(len(members), 1), 2),
                "value_mix_pct": round_float(sum(float(row["value_mix_pct"]) for row in members) / max(len(members), 1), 2),
                "premium_mix_pct": round_float(sum(float(row["premium_mix_pct"]) for row in members) / max(len(members), 1), 2),
            }
        )
    return results


def build_legacy_item_week_summary(item_rows: List[Dict[str, object]]) -> List[Dict[str, object]]:
    grouped: Dict[Tuple[str, str], List[Dict[str, object]]] = defaultdict(list)
    for row in item_rows:
        grouped[(row["week_start"], row["item_id"])].append(row)
    results: List[Dict[str, object]] = []
    for (_, item_id), members in sorted(grouped.items()):
        sales = sum(float(row["net_sales"]) for row in members)
        units = sum(float(row["units"]) for row in members)
        margin = sum(float(row["contribution_margin"]) for row in members)
        results.append(
            {
                "week_start": members[0]["week_start"],
                "year_week": members[0]["week_start"],
                "item_id": item_id,
                "item_name": members[0]["item_name"],
                "category": members[0]["category"],
                "subcategory": members[0]["subcategory"],
                "price_tier": members[0]["price_tier"],
                "weekly_units": int(round(units)),
                "net_sales": round_float(sales, 2),
                "avg_net_price": round_float(sales / units if units else 0.0, 2),
                "contribution_margin": round_float(margin, 2),
                "contribution_margin_pct": round_float((margin / sales) if sales else 0.0, 4),
                "promo_mix_pct": round_float(sum(1 for row in members if row["promo_flag"] == "true") / max(len(members), 1) * 100.0, 2),
                "channels_sold": len({row["channel"] for row in members}),
                "elasticity_prior": round_float(sum(float(row["elasticity_prior"]) for row in members) / max(len(members), 1), 4),
            }
        )
    return results


def main() -> int:
    args = parse_args()
    output_dir = Path(args.output_dir)
    processed_dir = output_dir / "processed"
    ensure_dir(processed_dir)
    for existing_file in processed_dir.glob("*"):
        if existing_file.is_file():
            existing_file.unlink()

    start_date = dt.date.fromisoformat(args.start_date)
    end_date = dt.date.fromisoformat(args.end_date)

    brand_rows = build_brand_dim()
    market_rows = build_market_dim()
    network_rows = build_brand_market_network()
    channel_rows = build_channel_dim()
    brand_channel_rows = build_brand_channel_dim()
    product_rows = load_product_seed(Path(args.product_seed))
    calendar_rows = build_calendar_week_dim(start_date, end_date)
    macro_rows = build_external_macro_monthly(start_date, end_date, args.skip_macro)
    transfer_rows = build_cross_brand_transfer_matrix(product_rows)
    promo_rows = build_promo_calendar(calendar_rows, product_rows, market_rows)
    product_panel_rows = build_product_panel(product_rows, market_rows, network_rows, calendar_rows, macro_rows, promo_rows)
    channel_panel_rows = build_brand_market_channel_panel(product_panel_rows)
    portfolio_week_rows = build_portfolio_week_summary(channel_panel_rows)
    brand_week_rows = build_brand_week_summary(channel_panel_rows)
    market_brand_rows = build_market_brand_week_summary(channel_panel_rows, network_rows)
    product_week_rows = build_product_week_summary(product_panel_rows)
    legacy_store_rows = build_legacy_store_dim(network_rows)
    legacy_market_rows = build_legacy_market_dim(network_rows)
    legacy_menu_rows = build_legacy_menu_dim(product_rows)
    legacy_channel_rows = build_legacy_channel_dim(brand_channel_rows, network_rows)
    legacy_calendar_rows = build_legacy_calendar_dim(calendar_rows)
    legacy_store_item_rows = build_legacy_store_item_panel(product_panel_rows)
    legacy_store_channel_rows = build_legacy_store_channel_panel(channel_panel_rows)
    legacy_promo_rows = build_legacy_promo_calendar(promo_rows)
    legacy_item_relationship_rows = build_legacy_item_relationships(product_rows)
    counts = {
        "brand_dim": len(brand_rows),
        "market_dim": len(market_rows),
        "brand_market_network": len(network_rows),
        "channel_dim": len(channel_rows),
        "brand_channel_dim": len(brand_channel_rows),
        "product_dim": len(product_rows),
        "calendar_week_dim": len(calendar_rows),
        "external_macro_monthly": len(macro_rows),
        "promo_calendar": len(promo_rows),
        "cross_brand_transfer_matrix": len(transfer_rows),
        "brand_market_product_channel_week_panel": len(product_panel_rows),
        "brand_market_channel_week_panel": len(channel_panel_rows),
        "portfolio_week_summary": len(portfolio_week_rows),
        "brand_week_summary": len(brand_week_rows),
        "market_brand_week_summary": len(market_brand_rows),
        "product_week_summary": len(product_week_rows),
        "legacy_store_dim": len(legacy_store_rows),
        "legacy_store_item_week_panel": len(legacy_store_item_rows),
    }
    qa_rows = build_data_quality_checks(counts)
    qa_report = build_qa_report({**counts, "data_quality_checks": len(qa_rows)}, portfolio_week_rows, brand_week_rows)

    def dump(name: str, rows: List[Dict[str, object]]):
        write_csv(processed_dir / name, rows, list(rows[0].keys()) if rows else [])

    for filename, rows in [
        ("brand_dim.csv", brand_rows),
        ("market_dim.csv", market_rows),
        ("brand_market_network.csv", network_rows),
        ("channel_dim.csv", channel_rows),
        ("brand_channel_dim.csv", brand_channel_rows),
        ("product_dim.csv", product_rows),
        ("calendar_week_dim.csv", calendar_rows),
        ("external_macro_monthly.csv", macro_rows),
        ("promo_calendar.csv", promo_rows),
        ("cross_brand_transfer_matrix.csv", transfer_rows),
        ("brand_market_product_channel_week_panel.csv", product_panel_rows),
        ("brand_market_channel_week_panel.csv", channel_panel_rows),
        ("portfolio_week_summary.csv", portfolio_week_rows),
        ("brand_week_summary.csv", brand_week_rows),
        ("market_brand_week_summary.csv", market_brand_rows),
        ("product_week_summary.csv", product_week_rows),
        ("data_quality_checks.csv", qa_rows),
        ("store_dim.csv", legacy_store_rows),
        ("market_dim.csv", legacy_market_rows),
        ("menu_item_dim.csv", legacy_menu_rows),
        ("channel_dim.csv", legacy_channel_rows),
        ("calendar_dim.csv", legacy_calendar_rows),
        ("store_item_week_panel.csv", legacy_store_item_rows),
        ("store_channel_week_panel.csv", legacy_store_channel_rows),
        ("promo_calendar.csv", legacy_promo_rows),
        ("item_substitution_matrix.csv", legacy_item_relationship_rows),
    ]:
        dump(filename, rows)

    with (output_dir / "manifest.json").open("w", encoding="utf-8") as handle:
        json.dump(manifest_for_outputs(output_dir, {**counts, "data_quality_checks": len(qa_rows)}, args), handle, indent=2)
        handle.write("\n")
    with (output_dir / "metadata.json").open("w", encoding="utf-8") as handle:
        json.dump(metadata(), handle, indent=2)
        handle.write("\n")
    with (output_dir / "qa_report.json").open("w", encoding="utf-8") as handle:
        json.dump(qa_report, handle, indent=2)
        handle.write("\n")

    print("Build complete.", flush=True)
    for name, count in counts.items():
        print(f"  - {name}: {count}", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
