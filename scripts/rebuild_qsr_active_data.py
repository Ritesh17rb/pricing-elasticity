
from __future__ import annotations

import csv
import json
import math
import random
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data"
PROC_DIR = DATA_DIR / "yum" / "processed"
RNG = random.Random(17)

CHANNEL_GROUP_MAP = {"carryout": "mass", "pickup_app": "mass", "delivery": "prestige", "dine_in": "prestige"}
GROUP_PRICE = {"mass": 24.0, "prestige": 36.0}
GROUP_LABEL = {"mass": "Entry & Value Mix", "prestige": "Core & Premium Mix"}

ACQ = ["seasonal_first_time", "routine_refill", "gift_buyer", "influencer_discovered", "promo_triggered"]
ENG = ["prestige_loyalist", "value_seeker", "deal_hunter", "occasional_shop", "channel_switcher"]
MON = ["single_sku_staple", "multi_sku_builder", "value_bundle_buyer", "premium_add_on", "trial_size_sampler"]

ACQ_FACTORS = {
    "seasonal_first_time": {"elasticity": 0.24, "repeat": 0.015, "aov": -1.4, "cac": 1.1, "promo": 0.03, "size": -40},
    "routine_refill": {"elasticity": -0.16, "repeat": -0.02, "aov": 0.6, "cac": -0.4, "promo": -0.03, "size": 75},
    "gift_buyer": {"elasticity": -0.04, "repeat": 0.008, "aov": 3.4, "cac": 0.5, "promo": 0.01, "size": 30},
    "influencer_discovered": {"elasticity": 0.12, "repeat": 0.025, "aov": 0.5, "cac": 1.8, "promo": 0.04, "size": -10},
    "promo_triggered": {"elasticity": 0.31, "repeat": 0.05, "aov": -2.1, "cac": 1.3, "promo": 0.07, "size": -55},
}
ENG_FACTORS = {
    "prestige_loyalist": {"elasticity": -0.12, "repeat": -0.04, "aov": 2.8, "promo": -0.03, "migration": -0.2, "size": 95},
    "value_seeker": {"elasticity": 0.05, "repeat": 0.012, "aov": -0.6, "promo": 0.02, "migration": 0.14, "size": 45},
    "deal_hunter": {"elasticity": 0.16, "repeat": 0.06, "aov": -1.2, "promo": 0.07, "migration": 0.38, "size": -35},
    "occasional_shop": {"elasticity": 0.08, "repeat": 0.028, "aov": 0.0, "promo": 0.03, "migration": 0.22, "size": -15},
    "channel_switcher": {"elasticity": 0.12, "repeat": 0.024, "aov": -0.2, "promo": 0.04, "migration": 0.48, "size": 5},
}
MON_FACTORS = {
    "single_sku_staple": {"elasticity": 0.05, "aov": -3.4, "units": -0.38, "margin": -0.01, "size": 20},
    "multi_sku_builder": {"elasticity": -0.06, "aov": 4.8, "units": 0.48, "margin": 0.03, "size": 55},
    "value_bundle_buyer": {"elasticity": -0.02, "aov": 2.5, "units": 0.32, "margin": 0.0, "size": 65},
    "premium_add_on": {"elasticity": -0.1, "aov": 6.2, "units": 0.24, "margin": 0.04, "size": -5},
    "trial_size_sampler": {"elasticity": 0.12, "aov": -1.8, "units": -0.15, "margin": -0.02, "size": -20},
}

COHORT_PROFILES = {
    "brand_loyal": {"label": "Family Ritual Loyalists", "description": "High-frequency households that routinely anchor dinner around QSR.", "acquisition_elasticity": -0.82, "repeat_loss_elasticity": 0.48, "migration_upgrade": 1.34, "migration_downgrade": 0.62, "tenure_decay_rate": 0.08, "engagement_offset": 0.34, "price_history_habituation": 0.19, "repeat_loss_curve_type": "delayed_ramp", "migration_asymmetry_factor": 1.7, "time_lag_distribution": {"0_4_weeks": 0.06, "4_8_weeks": 0.12, "8_12_weeks": 0.2, "12_16_weeks": 0.34, "16_20_weeks": 0.28}},
    "value_conscious": {"label": "Value Bundle Shoppers", "description": "Guests who watch check size closely and respond to clear bundle value.", "acquisition_elasticity": -1.72, "repeat_loss_elasticity": 0.92, "migration_upgrade": 0.92, "migration_downgrade": 1.34, "tenure_decay_rate": 0.03, "engagement_offset": 0.18, "price_history_habituation": 0.06, "repeat_loss_curve_type": "moderate", "migration_asymmetry_factor": 2.15, "time_lag_distribution": {"0_4_weeks": 0.16, "4_8_weeks": 0.26, "8_12_weeks": 0.28, "12_16_weeks": 0.2, "16_20_weeks": 0.1}},
    "deal_seeker": {"label": "Coupon-Driven Guests", "description": "Promo-first guests with the highest lapse risk once discounts fade.", "acquisition_elasticity": -2.48, "repeat_loss_elasticity": 1.34, "migration_upgrade": 0.62, "migration_downgrade": 1.86, "tenure_decay_rate": 0.01, "engagement_offset": 0.08, "price_history_habituation": 0.02, "repeat_loss_curve_type": "sharp_spike_plateau", "migration_asymmetry_factor": 3.3, "time_lag_distribution": {"0_4_weeks": 0.38, "4_8_weeks": 0.32, "8_12_weeks": 0.18, "12_16_weeks": 0.08, "16_20_weeks": 0.04}},
    "trend_driven": {"label": "Premium Crust Explorers", "description": "Discovery-oriented guests who over-index on premium crust and innovation news.", "acquisition_elasticity": -1.95, "repeat_loss_elasticity": 0.86, "migration_upgrade": 1.12, "migration_downgrade": 1.0, "tenure_decay_rate": 0.05, "engagement_offset": 0.24, "price_history_habituation": 0.12, "repeat_loss_curve_type": "conditional_spike", "migration_asymmetry_factor": 2.0, "time_lag_distribution": {"0_4_weeks": 0.14, "4_8_weeks": 0.24, "8_12_weeks": 0.28, "12_16_weeks": 0.22, "16_20_weeks": 0.12}},
    "channel_switcher": {"label": "Carryout / App Switchers", "description": "Guests who move between delivery and owned channels as relative value changes.", "acquisition_elasticity": -1.88, "repeat_loss_elasticity": 1.05, "migration_upgrade": 1.0, "migration_downgrade": 1.56, "tenure_decay_rate": 0.04, "engagement_offset": 0.2, "price_history_habituation": 0.1, "repeat_loss_curve_type": "moderate", "migration_asymmetry_factor": 2.55, "time_lag_distribution": {"0_4_weeks": 0.18, "4_8_weeks": 0.28, "8_12_weeks": 0.26, "12_16_weeks": 0.18, "16_20_weeks": 0.1}},
    "premium_loyal": {"label": "Premium Pizza Loyalists", "description": "Higher-ticket loyal guests comfortable with premium crusts and box meals.", "acquisition_elasticity": -1.16, "repeat_loss_elasticity": 0.58, "migration_upgrade": 1.48, "migration_downgrade": 0.5, "tenure_decay_rate": 0.06, "engagement_offset": 0.3, "price_history_habituation": 0.15, "repeat_loss_curve_type": "gentle_slope", "migration_asymmetry_factor": 1.12, "time_lag_distribution": {"0_4_weeks": 0.1, "4_8_weeks": 0.14, "8_12_weeks": 0.2, "12_16_weeks": 0.28, "16_20_weeks": 0.28}},
    "at_risk": {"label": "Lapse-Risk Guests", "description": "Infrequent QSR guests with weak habits and high drop-off probability.", "acquisition_elasticity": -2.14, "repeat_loss_elasticity": 1.28, "migration_upgrade": 0.64, "migration_downgrade": 1.72, "tenure_decay_rate": -0.01, "engagement_offset": 0.12, "price_history_habituation": 0.05, "repeat_loss_curve_type": "accelerating", "migration_asymmetry_factor": 2.95, "time_lag_distribution": {"0_4_weeks": 0.24, "4_8_weeks": 0.3, "8_12_weeks": 0.24, "12_16_weeks": 0.14, "16_20_weeks": 0.08}},
    "baseline": {"label": "All Visit Missions", "description": "Weighted aggregate of QSR guest behavior across all modeled cohorts.", "acquisition_elasticity": -1.55, "repeat_loss_elasticity": 0.92, "migration_upgrade": 1.0, "migration_downgrade": 1.18, "tenure_decay_rate": 0.05, "engagement_offset": 0.2, "price_history_habituation": 0.1, "repeat_loss_curve_type": "moderate", "migration_asymmetry_factor": 2.1, "time_lag_distribution": {"0_4_weeks": 0.16, "4_8_weeks": 0.26, "8_12_weeks": 0.28, "12_16_weeks": 0.2, "16_20_weeks": 0.1}},
}

PROMO_METADATA = {
    "PROMO_MELTS_CARRYOUT_2025": {"promo_id": "PROMO_MELTS_CARRYOUT_2025", "campaign_name": "Melt Combo Carryout Push", "start_date": "2025-03-03", "end_date": "2025-05-04", "discount_pct": 10, "discount_type": "percentage", "duration_weeks": 9, "duration_months": 2.1, "eligible_tiers": ["ad_supported"], "eligible_cohorts": ["promo_triggered", "seasonal_first_time", "value_seeker"], "eligible_channels": ["carryout", "pickup_app"], "exclusions": [], "roll_off_date": "2025-05-11", "roll_off_type": "soft", "roll_off_window_weeks": 1, "promo_code": "MELTS10", "attribution_window_days": 7, "target_adds": 6400, "actual_adds": 6180, "target_roi": 1.45, "actual_roi": 1.49, "marketing_spend_usd": 54000, "incremental_revenue_usd": 101000, "repeat_loss_expected": False, "repeat_loss_lag_weeks": 0, "notes": "Supports lunch and solo-value missions on carryout and app pickup."},
    "PROMO_REWARD_SUMMER_2025": {"promo_id": "PROMO_REWARD_SUMMER_2025", "campaign_name": "Summer App Rewards", "start_date": "2025-06-02", "end_date": "2025-08-03", "discount_pct": 8, "discount_type": "percentage", "duration_weeks": 9, "duration_months": 2.1, "eligible_tiers": ["ad_supported"], "eligible_cohorts": ["routine_refill", "gift_buyer", "seasonal_first_time"], "eligible_channels": ["carryout", "pickup_app"], "exclusions": [], "roll_off_date": "2025-08-10", "roll_off_type": "soft", "roll_off_window_weeks": 1, "promo_code": "REWARD8", "attribution_window_days": 14, "target_adds": 7100, "actual_adds": 6940, "target_roi": 1.55, "actual_roi": 1.61, "marketing_spend_usd": 47000, "incremental_revenue_usd": 112000, "repeat_loss_expected": False, "repeat_loss_lag_weeks": 0, "notes": "Family reward mechanic designed to protect summer carryout frequency."},
    "PROMO_BIG_DINNER_BOX_2025": {"promo_id": "PROMO_BIG_DINNER_BOX_2025", "campaign_name": "Family Meal Box Game-Day Push", "start_date": "2025-08-04", "end_date": "2025-10-05", "discount_pct": 11, "discount_type": "percentage", "duration_weeks": 9, "duration_months": 2.1, "eligible_tiers": ["ad_supported", "ad_free"], "eligible_cohorts": ["gift_buyer", "routine_refill", "channel_switcher"], "eligible_channels": ["delivery", "carryout", "pickup_app"], "exclusions": [], "roll_off_date": "2025-10-12", "roll_off_type": "soft", "roll_off_window_weeks": 1, "promo_code": "BOX11", "attribution_window_days": 7, "target_adds": 9800, "actual_adds": 10120, "target_roi": 1.5, "actual_roi": 1.57, "marketing_spend_usd": 69000, "incremental_revenue_usd": 146000, "repeat_loss_expected": True, "repeat_loss_lag_weeks": 4, "notes": "Sports and family-share demand window with broad bundle relevance."},
    "PROMO_STUFFED_CRUST_2025": {"promo_id": "PROMO_STUFFED_CRUST_2025", "campaign_name": "Stuffed Crust Celebration", "start_date": "2025-09-08", "end_date": "2025-10-12", "discount_pct": 6, "discount_type": "percentage", "duration_weeks": 5, "duration_months": 1.2, "eligible_tiers": ["ad_free"], "eligible_cohorts": ["trend_driven", "premium_loyal", "prestige_loyalist"], "eligible_channels": ["delivery", "dine_in"], "exclusions": [], "roll_off_date": "2025-10-19", "roll_off_type": "soft", "roll_off_window_weeks": 1, "promo_code": "STUFFED6", "attribution_window_days": 7, "target_adds": 5200, "actual_adds": 5060, "target_roi": 1.72, "actual_roi": 1.76, "marketing_spend_usd": 36000, "incremental_revenue_usd": 85000, "repeat_loss_expected": False, "repeat_loss_lag_weeks": 0, "notes": "Premium crust trade-up window anchored to delivery-led premium occasions."},
}


def read_csv(path: Path) -> list[dict[str, str]]:
    with path.open(newline="", encoding="utf-8") as handle:
        return list(csv.DictReader(handle))


def write_csv(path: Path, rows: list[dict], fieldnames: list[str]) -> None:
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)


def write_json(path: Path, payload) -> None:
    with path.open("w", encoding="utf-8") as handle:
        json.dump(payload, handle, indent=2)


def num(value, fallback=0.0) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return float(fallback)


def clamp(value: float, low: float, high: float) -> float:
    return max(low, min(high, value))


def load_foundation():
    brand_week = read_csv(PROC_DIR / "brand_week_summary.csv")
    calendar = {row["week_start"]: row for row in read_csv(PROC_DIR / "calendar_week_dim.csv")}
    channel_rows = read_csv(PROC_DIR / "brand_market_channel_week_panel.csv")
    item_rows = read_csv(PROC_DIR / "brand_market_product_channel_week_panel.csv")
    promo_rows = read_csv(PROC_DIR / "promo_calendar.csv")
    return brand_week, calendar, channel_rows, item_rows, promo_rows

def aggregate_active_base(brand_week, calendar, channel_rows, item_rows):
    weeks = [row["week_start"] for row in brand_week if row["brand_id"] == "qsr"]
    avg_orders = sum(num(row["system_orders"]) for row in brand_week if row["brand_id"] == "qsr") / max(1, len(weeks))

    channel_by_week_group = defaultdict(list)
    item_by_week_group = defaultdict(list)
    for row in channel_rows:
        if row["brand_id"] != "qsr":
            continue
        group = CHANNEL_GROUP_MAP.get(row["channel_id"])
        if group:
            channel_by_week_group[(row["week_start"], group)].append(row)
    for row in item_rows:
        if row["brand_id"] != "qsr":
            continue
        group = CHANNEL_GROUP_MAP.get(row["channel_id"])
        if group:
            item_by_week_group[(row["week_start"], group)].append(row)

    channel_weekly, price_calendar, market_signals, social_signals, season_calendar = [], [], [], [], []
    previous_effective = {"mass": GROUP_PRICE["mass"], "prestige": GROUP_PRICE["prestige"]}

    for index, week in enumerate(weeks):
        cal = calendar[week]
        brand = next(row for row in brand_week if row["week_start"] == week and row["brand_id"] == "qsr")
        sports = cal["sports_peak_flag"].lower() == "true"
        summer = cal["summer_travel_flag"].lower() == "true"
        payday = cal["paycheck_week_flag"].lower() == "true"
        holiday = cal["holiday_proxy_flag"].lower() == "true"
        season_phase = cal["portfolio_event_window"]
        demand_index = num(brand["system_orders"]) / avg_orders
        promo_strength = 0

        for group in ("mass", "prestige"):
            c_rows = channel_by_week_group[(week, group)]
            i_rows = item_by_week_group[(week, group)]
            orders = round(sum(num(row["orders_proxy"]) for row in c_rows))
            units = round(sum(num(row["unit_volume"]) for row in i_rows))
            revenue = round(sum(num(row["net_sales"]) for row in i_rows), 2)
            contribution = round(sum(num(row["contribution_margin"]) for row in i_rows), 2)
            weighted_promo = sum(num(row["promo_depth_pct"]) * num(row["unit_volume"]) for row in i_rows) / max(1, units)
            weighted_margin = contribution / max(1.0, revenue)
            aov = revenue / max(1, orders)
            active_customers = round(orders * (1.31 if group == "mass" else 1.18))
            base_new = 0.051 if group == "mass" else 0.039
            new_rate = base_new + (0.015 if sports else 0) + (0.01 if payday and group == "mass" else 0) + weighted_promo / 260
            repeat_rate = (0.061 if group == "mass" else 0.044) + (0.004 if holiday else 0) + (0.005 if group == "prestige" and sports else 0) + (0.004 if season_phase == "football_bundle_push" and group == "mass" else 0) + weighted_promo / 450
            repeat_rate = clamp(repeat_rate, 0.028, 0.12)
            new_customers = round(active_customers * clamp(new_rate, 0.018, 0.11))
            repeat_loss_customers = round(active_customers * repeat_rate)
            list_price = GROUP_PRICE[group]
            effective_price = round(list_price * (1 - min(weighted_promo, 18) / 100), 2)
            inventory_position = round(clamp(0.9 - index * 0.007 + (0.03 if holiday else 0), 0.42, 0.96), 2)
            markdown_risk = round(clamp(0.05 + weighted_promo / 120 + (0.02 if summer and group == "mass" else 0), 0.03, 0.22), 2)
            channel_weekly.append({"week_start": week, "channel_group": group, "season_phase": season_phase, "active_customers": active_customers, "new_customers": new_customers, "repeat_loss_customers": repeat_loss_customers, "net_adds": new_customers - repeat_loss_customers, "repeat_loss_rate": round(repeat_rate, 3), "price": f"{list_price:.2f}", "effective_price": f"{effective_price:.2f}", "promo_depth_pct": round(weighted_promo, 1), "units_sold": units, "revenue": f"{revenue:.2f}", "aov": f"{aov:.2f}", "gross_margin_pct": round(weighted_margin, 3), "inventory_position": inventory_position, "markdown_risk": markdown_risk})
            price_calendar.append({"week_start": week, "channel_group": group, "list_price": f"{list_price:.2f}", "promo_flag": "True" if weighted_promo > 0.2 else "False", "promo_discount_pct": round(weighted_promo, 1), "effective_price": f"{effective_price:.2f}", "price_changed": "True" if abs(effective_price - previous_effective[group]) > 0.01 else "False", "price_change_pct": round(((effective_price - previous_effective[group]) / previous_effective[group]) * 100, 1), "promo_type": "promotional" if weighted_promo > 0.2 else "full_price", "promo_message": f"{GROUP_LABEL[group]} pricing for QSR"})
            previous_effective[group] = effective_price
            promo_strength = max(promo_strength, weighted_promo)

        competitor_a = round(20.9 + math.sin(index / 5.0) * 1.2 + (0.3 if sports else 0), 2)
        competitor_b = round(24.7 + math.cos(index / 4.4) * 1.4 + (0.4 if summer else 0), 2)
        competitor_c = round(17.9 + math.sin(index / 3.7) * 1.1 + (0.4 if payday else 0), 2)
        market_signals.append({"week_start": week, "competitor_price_a": competitor_a, "competitor_price_b": competitor_b, "competitor_price_c": competitor_c, "competitor_avg_price": round((competitor_a + competitor_b + competitor_c) / 3, 2), "competitor_promo_flag": 1 if promo_strength >= 6 else 0, "macro_cpi": round(307.2 + index * 0.18, 2), "consumer_sentiment": round(97.2 + math.sin(index / 6.0) * 5.6 + (2.2 if payday else 0), 2), "unemployment_rate": round(4.22 - index * 0.01 + math.sin(index / 8.5) * 0.07, 2), "category_demand_index": round(demand_index, 2), "promo_clutter_index": round(clamp(0.22 + promo_strength / 35 + (0.1 if sports else 0), 0.15, 0.92), 2)})
        mentions = int(4100 + num(brand["system_orders"]) * 0.17 + (2100 if sports else 0) + promo_strength * 70)
        paid = round(25000 + promo_strength * 1800 + (8000 if sports else 0), 2)
        earned = round(mentions * (2.35 + promo_strength * 0.06), 2)
        social_signals.append({"week_start": week, "total_social_mentions": mentions, "tiktok_mentions": int(mentions * 0.34), "instagram_mentions": int(mentions * 0.39), "social_sentiment": round(clamp(0.58 + promo_strength / 120 + (0.06 if sports else 0), 0.48, 0.9), 2), "influencer_score": round(clamp(0.3 + promo_strength / 50 + (0.08 if season_phase == "spring_innovation" else 0), 0.2, 0.94), 2), "paid_social_spend": paid, "earned_social_value": earned, "total_social_spend": round(paid + earned, 2)})
        season_calendar.append({"week_start": week, "season_phase": season_phase, "demand_index": round(demand_index, 2), "inventory_position": round(clamp(0.88 - index * 0.006 + (0.03 if holiday else 0), 0.42, 0.96), 2), "markdown_risk": round(clamp(0.05 + promo_strength / 130 + (0.02 if summer else 0), 0.03, 0.22), 2)})

    return channel_weekly, price_calendar, market_signals, social_signals, season_calendar


def build_events_and_windows(promo_rows):
    events, seen = [], set()
    for row in promo_rows:
        if row["brand_id"] != "qsr":
            continue
        key = (row["week_start"], row["offer_name"])
        if key in seen:
            continue
        seen.add(key)
        offer_name = row["offer_name"]
        discount = round(num(row["avg_discount_pct"]), 1)
        if "Stuffed" in offer_name:
            group, channel, before_price = "prestige", "delivery", 36.0
        elif "Melts" in offer_name or "Carryout" in offer_name:
            group, channel, before_price = "mass", "pickup_app", 24.0
        else:
            group, channel, before_price = "mass", "delivery", 24.0
        events.append({"event_id": f"EVT_{len(events)+1:03d}", "week_start": row["week_start"], "event_type": "Retail Event", "channel_group": group, "affected_channel": channel, "price_before": before_price, "price_after": round(before_price * (1 - discount / 100), 2), "promo_id": row["offer_id"], "promo_discount_pct": discount, "notes": row["offer_name"], "validation_window": "clean" if discount <= 11 else "test"})
    events.extend([
        {"event_id": "EVT_COMP_01", "week_start": "2025-10-13", "event_type": "Competitor Price Drop", "channel_group": "mass", "affected_channel": "delivery", "price_before": 24.0, "price_after": 24.0, "promo_id": "COMP_DROP", "promo_discount_pct": 0.0, "notes": "Competitors lean into football-value offers in delivery.", "validation_window": "confounded"},
        {"event_id": "EVT_SOC_01", "week_start": "2025-03-24", "event_type": "Social Spike", "channel_group": "prestige", "affected_channel": "delivery", "price_before": 36.0, "price_after": 36.0, "promo_id": "SOCIAL_SPIKE", "promo_discount_pct": 0.0, "notes": "March basketball conversation lifts delivery occasions and wing attach.", "validation_window": "test"},
    ])
    validation_windows = {"validation_windows": [
        {"window_id": "train_q1", "type": "train", "status": "clean", "start": "2025-01-06", "end": "2025-05-25", "weeks": 20, "purpose": "Stable pre-summer estimation window."},
        {"window_id": "train_q2", "type": "train", "status": "clean", "start": "2025-06-02", "end": "2025-08-31", "weeks": 13, "purpose": "Summer and Summer Rewards carryout behavior."},
        {"window_id": "test_football", "type": "test", "status": "test", "start": "2025-09-01", "end": "2025-10-12", "weeks": 6, "purpose": "Football and Stuffed Crust demand pulse."},
        {"window_id": "conf_football", "type": "test", "status": "confounded", "start": "2025-10-13", "end": "2025-10-26", "weeks": 2, "purpose": "Competitor football value spike."},
    ]}
    return events, validation_windows


def build_segments():
    segment_rows, customer_rows, segment_kpis = [], [], []
    elasticity = {"ad_supported": {"segment_elasticity": {}}, "ad_free": {"segment_elasticity": {}}}
    customer_index = 1
    for tier, channel_group in (("ad_supported", "mass"), ("ad_free", "prestige")):
        base = {"aov": 28.6 if tier == "ad_supported" else 36.8, "units": 2.02 if tier == "ad_supported" else 2.31, "repeat": 0.128 if tier == "ad_supported" else 0.104, "cac": 8.4 if tier == "ad_supported" else 9.6, "promo": 0.22 if tier == "ad_supported" else 0.16, "margin": 0.39 if tier == "ad_supported" else 0.43, "elasticity": -2.02 if tier == "ad_supported" else -1.54, "count": 870 if tier == "ad_supported" else 760}
        for acq in ACQ:
            for eng in ENG:
                for mon in MON:
                    segment_key = f"{acq}|{eng}|{mon}"
                    acq_factor, eng_factor, mon_factor = ACQ_FACTORS[acq], ENG_FACTORS[eng], MON_FACTORS[mon]
                    customer_count = int(clamp(base["count"] + acq_factor["size"] + eng_factor["size"] + mon_factor["size"] + RNG.randint(-55, 55), 320, 1680))
                    avg_order_value = round(clamp(base["aov"] + acq_factor["aov"] + eng_factor["aov"] + mon_factor["aov"] + RNG.uniform(-1.0, 1.0), 20.0, 56.0), 2)
                    avg_units = round(clamp(base["units"] + mon_factor["units"] + RNG.uniform(-0.14, 0.14), 1.1, 3.2), 2)
                    repeat_loss = round(clamp(base["repeat"] + acq_factor["repeat"] + eng_factor["repeat"] + RNG.uniform(-0.012, 0.012), 0.06, 0.23), 3)
                    avg_cac = round(clamp(base["cac"] + acq_factor["cac"] + RNG.uniform(-0.8, 0.8), 5.6, 14.6), 2)
                    promo_rate = round(clamp(base["promo"] + acq_factor["promo"] + eng_factor["promo"] + RNG.uniform(-0.03, 0.03), 0.07, 0.36), 2)
                    margin_rate = round(clamp(base["margin"] + mon_factor["margin"] + RNG.uniform(-0.02, 0.02), 0.29, 0.56), 2)
                    acquisition_elasticity = round(base["elasticity"] + acq_factor["elasticity"] + eng_factor["elasticity"] + mon_factor["elasticity"] + RNG.uniform(-0.08, 0.08), 4)
                    repeat_loss_elasticity = round(clamp(0.52 + (repeat_loss - 0.08) * 4.3 + eng_factor["migration"] * 0.2 + RNG.uniform(-0.05, 0.05), 0.42, 1.55), 4)
                    curve_type = "sharp_spike_plateau" if eng == "deal_hunter" else ("conditional_spike" if eng == "channel_switcher" else ("delayed_ramp" if eng == "prestige_loyalist" else "moderate"))
                    lag = COHORT_PROFILES["deal_seeker"]["time_lag_distribution"] if eng == "deal_hunter" else (COHORT_PROFILES["channel_switcher"]["time_lag_distribution"] if eng == "channel_switcher" else (COHORT_PROFILES["brand_loyal"]["time_lag_distribution"] if eng == "prestige_loyalist" else COHORT_PROFILES["baseline"]["time_lag_distribution"]))
                    upgrade = round(clamp(1.0 + (0.34 if mon == "premium_add_on" else 0) + (0.15 if mon == "multi_sku_builder" else 0) - (0.12 if mon == "trial_size_sampler" else 0) + (0.08 if tier == "ad_free" else -0.03), 0.7, 1.6), 2)
                    downgrade = round(clamp(1.08 + eng_factor["migration"] - (0.18 if mon == "premium_add_on" else 0) + (0.22 if acq == "promo_triggered" else 0), 0.55, 2.0), 2)
                    asymmetry = round(clamp(1.45 + eng_factor["migration"] * 2.1 + (0.3 if acq == "promo_triggered" else 0), 1.05, 3.4), 2)
                    segment_kpis.append({"segment_key": segment_key, "channel_group": channel_group, "customer_count": customer_count, "repeat_loss_rate": repeat_loss, "avg_order_value": avg_order_value, "avg_units_per_order": avg_units, "avg_cac": avg_cac, "promo_redemption_rate": promo_rate, "margin_rate": margin_rate})
                    elasticity[tier]["segment_elasticity"][segment_key] = {
                        "acquisition_axis": {"elasticity": acquisition_elasticity, "tenure_decay_rate": round(clamp(0.03 + (0.02 if acq == "routine_refill" else 0) - (0.01 if acq == "promo_triggered" else 0), 0.01, 0.08), 3), "engagement_offset": round(clamp(0.14 + (0.08 if eng == "prestige_loyalist" else 0) + (0.05 if eng == "channel_switcher" else 0), 0.08, 0.36), 3), "price_history_habituation": round(clamp(0.05 + (0.07 if acq == "routine_refill" else 0) + (0.04 if eng == "prestige_loyalist" else 0), 0.02, 0.22), 3)},
                        "repeat_loss_axis": {"elasticity": repeat_loss_elasticity, "repeat_loss_curve_type": curve_type, "time_lag_distribution": lag},
                        "engagement_axis": {"elasticity": repeat_loss_elasticity, "repeat_loss_curve_type": curve_type, "time_lag_distribution": lag},
                        "migration_axis": {"upgrade_willingness": upgrade, "downgrade_propensity": downgrade, "asymmetry_factor": asymmetry},
                        "profile_weights": {"brand_loyal": 0.24 if eng == "prestige_loyalist" else 0.12, "value_conscious": 0.24 if acq == "promo_triggered" or eng == "value_seeker" else 0.16, "deal_seeker": 0.22 if eng == "deal_hunter" else 0.12, "trend_driven": 0.2 if acq == "influencer_discovered" or mon == "premium_add_on" else 0.1, "channel_switcher": 0.2 if eng == "channel_switcher" else 0.1, "premium_loyal": 0.18 if mon == "premium_add_on" and tier == "ad_free" else 0.08, "at_risk": 0.12 if eng == "occasional_shop" else 0.06},
                    }
                    sample_count = max(10, min(80, round(customer_count / 32)))
                    for _ in range(sample_count):
                        customer_id = f"PHCUST{customer_index:06d}"
                        customer_index += 1
                        segment_rows.append({"customer_id": customer_id, "channel_group": channel_group, "acquisition_segment": acq, "engagement_segment": eng, "monetization_segment": mon, "segment_key": segment_key})
                        customer_rows.append({"customer_id": customer_id, "channel_group": channel_group, "home_market": RNG.choice(["Dallas-Fort Worth", "Chicago", "Atlanta", "Phoenix", "Charlotte", "Los Angeles"]), "primary_channel": RNG.choice(["carryout", "pickup_app"] if channel_group == "mass" else ["delivery", "dine_in"]), "avg_order_value": round(avg_order_value + RNG.uniform(-4.0, 4.0), 2), "visit_frequency_90d": RNG.randint(1, 9), "promo_affinity": round(clamp(promo_rate + RNG.uniform(-0.08, 0.08), 0.02, 0.6), 2), "segment_key": segment_key})
    return segment_rows, customer_rows, segment_kpis, elasticity

def build_elasticity_params():
    return {
        "metadata": {"generated_date": "2026-04-08", "version": "5.0", "description": "QSR pricing elasticity parameters for U.S. order channels and menu ladders.", "estimation_method": "Modeled calibration built from the QSR operating foundation and public-menu-style pricing anchors.", "data_source": "Modeled QSR transaction panel grounded in public menu, channel, and promotion structure.", "real_world_validation": "Delivery remains the least price-sensitive channel while carryout and pickup absorb more value-driven behavior.", "confidence_level": 0.9},
        "tiers": {
            "ad_supported": {"base_elasticity": -2.0, "confidence_interval": 0.28, "std_error": 0.15, "interpretation": "Entry and value missions are highly responsive to price changes.", "price_range": {"min": 18.0, "max": 30.0, "current": 24.0}, "segments": {"new_0_3mo": {"elasticity": -2.42, "confidence_interval": 0.34, "size_pct": 0.29, "description": "New QSR guests or returning lapsed trial."}, "tenured_3_12mo": {"elasticity": -2.0, "confidence_interval": 0.26, "size_pct": 0.39, "description": "Developing habit guests in the first year."}, "tenured_12plus": {"elasticity": -1.68, "confidence_interval": 0.22, "size_pct": 0.32, "description": "Established value-oriented loyal guests."}}, "cohort_elasticity": {"by_age": {"18-24": -2.34, "25-34": -2.18, "35-44": -2.02, "45-54": -1.9, "55+": -1.78}, "by_device": {"mobile": -2.18, "web": -2.02, "in_store": -1.74, "call_center": -1.88, "omni": -1.7}, "by_channel": {"carryout": -2.18, "pickup_app": -2.26, "delivery": -1.56, "dine_in": -1.64}, "by_promo_status": {"full_price": -1.9, "promotional": -2.58}}},
            "ad_free": {"base_elasticity": -1.52, "confidence_interval": 0.24, "std_error": 0.12, "interpretation": "Core and premium QSR demand is less elastic than value-led missions.", "price_range": {"min": 28.0, "max": 42.0, "current": 36.0}, "segments": {"new_0_3mo": {"elasticity": -1.86, "confidence_interval": 0.28, "size_pct": 0.25, "description": "New premium-order guests and recent returners."}, "tenured_3_12mo": {"elasticity": -1.52, "confidence_interval": 0.22, "size_pct": 0.37, "description": "Developing premium and delivery habits."}, "tenured_12plus": {"elasticity": -1.21, "confidence_interval": 0.18, "size_pct": 0.38, "description": "Loyal premium and family-share households."}}, "cohort_elasticity": {"by_age": {"18-24": -1.72, "25-34": -1.62, "35-44": -1.5, "45-54": -1.42, "55+": -1.32}, "by_device": {"mobile": -1.62, "web": -1.55, "in_store": -1.33, "call_center": -1.46, "omni": -1.36}, "by_channel": {"carryout": -1.42, "pickup_app": -1.48, "delivery": -1.26, "dine_in": -1.34}, "by_promo_status": {"full_price": -1.43, "promotional": -1.86}}},
        },
        "time_horizon_adjustments": {"short_term_0_3mo": {"multiplier": 1.08, "description": "Short-run reactions are sharper around offers and menu changes."}, "medium_term_3_12mo": {"multiplier": 1.0, "description": "Medium-run elasticity baseline."}, "long_term_12plus": {"multiplier": 0.86, "description": "Long-run behavior softens as habits and rituals build."}},
        "external_factor_adjustments": {"macroeconomic": {"high_inflation": {"elasticity_multiplier": 1.08, "description": "Higher inflation increases value sensitivity."}, "high_unemployment": {"elasticity_multiplier": 1.14, "description": "Traffic becomes more price-sensitive in labor stress."}, "low_consumer_sentiment": {"elasticity_multiplier": 1.06, "description": "Weak sentiment nudges guests toward value ladders."}}, "competitive": {"competitor_price_increase": {"elasticity_multiplier": 0.9, "description": "When competitors raise prices, QSR elasticity eases."}, "competitor_price_decrease": {"elasticity_multiplier": 1.16, "description": "Competitive value pressure raises sensitivity."}, "major_competitor_promo": {"elasticity_multiplier": 1.1, "description": "Heavy competitor deal activity increases guest price response."}}, "social": {"viral_spike": {"elasticity_multiplier": 0.92, "description": "Strong social attention reduces short-run price sensitivity."}, "negative_sentiment": {"elasticity_multiplier": 1.08, "description": "Weak sentiment increases trade-down pressure."}}},
        "willingness_to_pay": {"ad_supported": {"mean": 25.1, "median": 24.0, "std_dev": 4.4, "percentiles": {"p10": 18.0, "p25": 21.4, "p50": 24.0, "p75": 27.8, "p90": 31.6}}, "ad_free": {"mean": 37.4, "median": 36.2, "std_dev": 5.8, "percentiles": {"p10": 28.0, "p25": 32.0, "p50": 36.2, "p75": 41.4, "p90": 46.0}}},
        "repeat_loss_elasticity": {"ad_supported": {"repeat_loss_elasticity": 0.88, "baseline_repeat_loss": 0.058, "interpretation": "Value-led guests are quicker to trim frequency after a price increase."}, "ad_free": {"repeat_loss_elasticity": 0.67, "baseline_repeat_loss": 0.044, "interpretation": "Premium and family-share demand holds longer before visits soften."}},
        "acquisition_elasticity": {"ad_supported": {"acquisition_elasticity": -1.7, "interpretation": "Value traffic acquisition is strongly price-sensitive."}, "ad_free": {"acquisition_elasticity": -1.36, "interpretation": "Premium acquisition still responds to price, but less sharply."}},
    }


def build_scenarios():
    return [
        {"id": "scenario_001", "name": "Carryout Value Protection", "category": "promotion", "model_type": "acquisition", "description": "Apply a value-led discount to protect carryout and app pickup traffic.", "impact_summary": "Projected +16% new orders, +8% units, moderate margin pressure", "config": {"tier": "ad_supported", "current_price": 24.0, "new_price": 21.6, "price_change_pct": -10.0, "promotion": {"type": "value_discount", "duration_months": 1.5, "discount_pct": 10, "promo_code": "VALUE10", "eligibility": "carryout_pickup", "start_date": "2025-03-03", "end_date": "2025-04-13"}, "target_segment": "promo_triggered", "effective_date": "2025-03-03", "grandfathering": False}, "constraints": {"platform_compliant": True, "price_change_12mo_limit": True, "notice_period_30d": False, "min_price": 18.0, "max_price": 30.0}, "priority": "high", "business_rationale": "Protect lunch and value-seeking traffic without leaning on full-system discounting."},
        {"id": "scenario_002", "name": "Stuffed Crust Premium Trade-Up", "category": "promotion", "model_type": "acquisition", "description": "Use a lighter premium discount to support Stuffed Crust trade-up.", "impact_summary": "Projected +8% premium orders, +4% net sales", "config": {"tier": "ad_free", "current_price": 36.0, "new_price": 33.84, "price_change_pct": -6.0, "promotion": {"type": "premium_trade_up", "duration_months": 1.0, "discount_pct": 6, "promo_code": "STUFFED6", "eligibility": "delivery_dinein", "start_date": "2025-09-08", "end_date": "2025-10-12"}, "target_segment": "premium_add_on", "effective_date": "2025-09-08", "grandfathering": False}, "constraints": {"platform_compliant": True, "price_change_12mo_limit": True, "notice_period_30d": False, "min_price": 28.0, "max_price": 42.0}, "priority": "high", "business_rationale": "Support premium crust demand without collapsing premium price architecture."},
        {"id": "scenario_003", "name": "Delivery Fee Pressure Test", "category": "price_increase", "model_type": "churn", "description": "Increase the effective delivery check to protect margin under cost pressure.", "impact_summary": "Projected +4% revenue, -2% units, repeat-loss risk rises", "config": {"tier": "ad_free", "current_price": 36.0, "new_price": 38.0, "price_change_pct": 5.56, "promotion": None, "target_segment": "channel_switcher", "effective_date": "2025-05-15", "grandfathering": False}, "constraints": {"platform_compliant": True, "price_change_12mo_limit": True, "notice_period_30d": True, "min_price": 28.0, "max_price": 45.0}, "priority": "medium", "business_rationale": "Tests whether delivery economics can improve before traffic migrates to owned channels."},
        {"id": "scenario_004", "name": "Late-Summer Value Reset", "category": "promotion", "model_type": "churn", "description": "Restore stronger value support after summer fatigue in the entry menu ladder.", "impact_summary": "Projected +18% units, -7% margin, improved short-run repeat behavior", "config": {"tier": "ad_supported", "current_price": 24.0, "new_price": 20.88, "price_change_pct": -13.0, "promotion": {"type": "value_reset", "duration_months": 1.0, "discount_pct": 13, "promo_code": "RESET13", "eligibility": "value_ladder", "start_date": "2025-08-11", "end_date": "2025-09-07"}, "target_segment": "value_bundle_buyer", "effective_date": "2025-08-11", "grandfathering": False}, "constraints": {"platform_compliant": True, "price_change_12mo_limit": False, "notice_period_30d": False, "min_price": 18.0, "max_price": 30.0}, "priority": "medium", "business_rationale": "Refresh value optics before football demand peaks."},
        {"id": "scenario_005", "name": "Digital Pickup Incentive Pack", "category": "new_tier", "model_type": "migration", "description": "Launch a pickup-led digital bundle to pull traffic from delivery into owned channels.", "impact_summary": "Projected +5% owned-channel mix, +3% revenue", "config": {"tier": "bundle", "current_price": 36.0, "new_price": 29.0, "price_change_pct": -19.44, "promotion": None, "target_segment": "channel_switcher", "effective_date": "2025-06-02", "grandfathering": False, "bundle_components": {"pizza_bundle": {"tier": "ad_free", "standalone_price": 36.0}, "pickup_value": {"tier": "ad_supported", "standalone_price": 24.0}, "bundle_discount": 7.0, "bundle_discount_pct": 19}}, "constraints": {"platform_compliant": True, "price_change_12mo_limit": False, "notice_period_30d": False, "min_price": 24.0, "max_price": 34.0}, "priority": "high", "business_rationale": "Use owned-channel pricing to improve mix without a broad delivery discount."},
        {"id": "scenario_006", "name": "Entry Meal Trial Build", "category": "new_tier", "model_type": "migration", "description": "Introduce a lower-entry offer to capture more price-sensitive solo trial.", "impact_summary": "Projected +11% new guests, slightly lower margin, stronger trial conversion", "config": {"tier": "basic", "current_price": None, "new_price": 14.0, "price_change_pct": None, "promotion": None, "target_segment": "seasonal_first_time", "effective_date": "2025-04-07", "grandfathering": False, "tier_features": {"bundle": "solo_trial", "channel": "pickup_app", "unit_count": 1}}, "constraints": {"platform_compliant": True, "price_change_12mo_limit": False, "notice_period_30d": False, "min_price": 10.0, "max_price": 18.0}, "priority": "medium", "business_rationale": "Lower the barrier to first trial without discounting the full menu ladder."},
        {"id": "scenario_007", "name": "Premium Box Price Lift", "category": "price_increase", "model_type": "churn", "description": "Increase premium bundle pricing where family demand remains strong.", "impact_summary": "Projected +4% revenue, modest unit pressure, small repeat-loss lift", "config": {"tier": "ad_free", "current_price": 36.0, "new_price": 38.0, "price_change_pct": 5.56, "promotion": None, "target_segment": "brand_loyal", "effective_date": "2025-10-20", "grandfathering": False}, "constraints": {"platform_compliant": True, "price_change_12mo_limit": True, "notice_period_30d": True, "min_price": 28.0, "max_price": 45.0}, "priority": "low", "business_rationale": "Capture margin in less elastic family-share demand after peak football weeks."},
        {"id": "scenario_008", "name": "Core & Premium Mix Shift", "category": "bundling", "model_type": "migration", "description": "Use premium meal merchandising to shift more traffic into the higher-value ladder.", "impact_summary": "Projected +5% core and premium mix, +3% revenue", "config": {"tier": "premium", "current_price": 36.0, "new_price": 36.0, "price_change_pct": 0, "promotion": {"type": "premium_merchandising", "duration_months": 2, "discount_pct": 0, "promo_code": "PREMIUMMIX", "eligibility": "delivery_dinein", "start_date": "2025-09-08", "end_date": "2025-11-02"}, "target_segment": "premium_add_on", "effective_date": "2025-09-08", "grandfathering": False}, "constraints": {"platform_compliant": True, "price_change_12mo_limit": False, "notice_period_30d": False, "min_price": 28.0, "max_price": 45.0}, "priority": "medium", "business_rationale": "Lean into premium attachments and box meals without a direct list-price cut."},
        {"id": "scenario_baseline", "name": "Do Nothing (Baseline)", "category": "baseline", "model_type": "baseline", "description": "Maintain current QSR pricing and promotion settings with no change.", "impact_summary": "Baseline scenario for comparison", "config": {"tier": "all", "current_price": None, "new_price": None, "price_change_pct": 0, "promotion": None, "target_segment": "all", "effective_date": "2025-03-15", "grandfathering": False}, "constraints": {"platform_compliant": True, "price_change_12mo_limit": True, "notice_period_30d": True, "min_price": None, "max_price": None}, "priority": "n/a", "business_rationale": "Control scenario to measure incremental change."},
    ]


def build_metadata():
    return {
        "scope": "QSR active root data bundle",
        "generated_at": "2026-04-08",
        "datasets": {
            "customers": {"description": "Sample customer-level QSR records with channel mix and visit behavior.", "columns": {"customer_id": {"description": "Synthetic QSR customer identifier."}, "channel_group": {"description": "Internal group used by legacy models."}, "segment_key": {"description": "Composite 3-axis segment id."}}},
            "channel_weekly": {"description": "Weekly KPI panel by internal channel group, rebuilt for QSR.", "columns": {"week_start": {"description": "Week start date."}, "channel_group": {"description": "Internal compatibility grouping."}, "active_customers": {"description": "Proxy for active weekly order customers."}, "new_customers": {"description": "Modeled weekly new or reactivated guests."}, "repeat_loss_customers": {"description": "Modeled guests losing repeat frequency."}, "price": {"description": "Strategic list-price anchor used by scenario models."}, "effective_price": {"description": "List-price anchor adjusted for promo depth."}, "revenue": {"description": "Weekly net sales."}, "aov": {"description": "Average order value."}}},
            "season_calendar": {"description": "Demand windows and operational pressure indices for QSR.", "columns": {"week_start": {"description": "Week start date."}, "season_phase": {"description": "Modeled seasonal window."}, "demand_index": {"description": "Relative demand index vs average week."}}},
            "price_calendar": {"description": "Weekly list and effective pricing by internal group.", "columns": {"week_start": {"description": "Week start date."}, "channel_group": {"description": "Internal compatibility grouping."}, "list_price": {"description": "Strategic list-price anchor."}, "promo_discount_pct": {"description": "Average modeled promo discount."}, "effective_price": {"description": "List-price anchor after discount."}}},
            "market_signals": {"description": "External market and competitive proxies aligned to QSR weeks.", "columns": {"week_start": {"description": "Week start date."}, "competitor_avg_price": {"description": "Modeled competitive market price."}, "macro_cpi": {"description": "Macro inflation proxy."}, "consumer_sentiment": {"description": "Consumer sentiment proxy."}}},
            "social_signals": {"description": "Modeled social attention and paid support aligned to QSR demand windows.", "columns": {"week_start": {"description": "Week start date."}, "total_social_mentions": {"description": "Modeled total social mentions."}, "social_sentiment": {"description": "Relative positive sentiment."}}},
            "retail_events": {"description": "Promo and competitive event log aligned to QSR pricing analysis.", "columns": {"event_id": {"description": "Event identifier."}, "week_start": {"description": "Week start date."}, "event_type": {"description": "Event classification."}, "promo_discount_pct": {"description": "Associated discount depth."}}},
            "segments": {"description": "Sample customer-to-segment assignments for QSR.", "columns": {"customer_id": {"description": "Sample customer identifier."}, "channel_group": {"description": "Internal compatibility grouping."}, "segment_key": {"description": "Composite segment id."}}},
            "segment_kpis": {"description": "Segment-level KPIs used by cohort and comparison views.", "columns": {"segment_key": {"description": "Composite segment id."}, "customer_count": {"description": "Modeled segment population."}, "repeat_loss_rate": {"description": "Modeled repeat-loss rate."}, "avg_order_value": {"description": "Average order value."}}},
        },
        "business_glossary": {"AOV": {"definition": "Average order value."}, "Repeat Loss": {"definition": "Modeled reduction in visit frequency after price or promo changes."}, "Promo Mix": {"definition": "Share of orders touched by promotional pricing or bundle support."}, "Owned Channel": {"definition": "Carryout or pickup app ordering where QSR keeps more economics than delivery."}},
    }


def main():
    brand_week, calendar, channel_rows, item_rows, promo_rows = load_foundation()
    channel_weekly, price_calendar, market_signals, social_signals, season_calendar = aggregate_active_base(brand_week, calendar, channel_rows, item_rows)
    retail_events, validation_windows = build_events_and_windows(promo_rows)
    segments, customers, segment_kpis, segment_elasticity = build_segments()
    write_csv(DATA_DIR / "channel_weekly.csv", channel_weekly, list(channel_weekly[0].keys()))
    write_csv(DATA_DIR / "segments.csv", segments, list(segments[0].keys()))
    write_csv(DATA_DIR / "segment_kpis.csv", segment_kpis, list(segment_kpis[0].keys()))
    write_json(DATA_DIR / "segment_elasticity.json", segment_elasticity)
    write_json(DATA_DIR / "cohort_coefficients.json", {"metadata": {"description": "QSR cohort profiles", "version": "6.0", "generation_date": "2026-04-08", "method": "Modeled QSR cohort calibration"}, **COHORT_PROFILES})
    write_json(DATA_DIR / "elasticity-params.json", build_elasticity_params())
    write_json(DATA_DIR / "scenarios.json", build_scenarios())
    print("Rebuilt QSR active data bundle.")


if __name__ == "__main__":
    main()
