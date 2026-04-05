#!/usr/bin/env python3
"""Generate Supergoop seasonal promo datasets with retail-native schema.
All datasets meet or exceed existing row counts.
"""

import csv
import json
import random
from datetime import date, timedelta

random.seed(42)
DATA_DIR = "data"

CHANNELS = ["sephora", "ulta", "target", "amazon", "dtc"]
CHANNEL_GROUP = {
    "sephora": "prestige",
    "ulta": "prestige",
    "dtc": "prestige",
    "target": "mass",
    "amazon": "mass",
}

CHANNEL_PRICE = {
    "mass": 24.0,
    "prestige": 36.0,
}

REGIONS = ["west", "south", "midwest", "northeast"]
INCOME_BANDS = ["<50k", "50-100k", "100-150k", "150k+"]
AGE_GROUPS = ["18-24", "25-34", "35-44", "45-54", "55+"]

START_DATE = date(2025, 3, 2)
WEEKS = 180
CUSTOMER_COUNT = 500000
SEGMENT_CUSTOMERS = 15000

PROMO_WEEKS = {
    "mass": {6, 7, 14, 15, 24, 25},
    "prestige": {5, 6, 13, 14, 23},
}

EVENT_WEEKS = {
    "sephora": [4, 12, 18, 36, 56],
    "ulta": [5, 13, 19, 37, 57],
    "target": [6, 14, 20, 38, 58],
    "amazon": [7, 15, 21, 39, 59],
    "dtc": [3, 11, 17, 35, 55],
}

SEASONAL_TENTPOLES = {
    6: "Memorial Day Promo",
    15: "Prime Day Competitive",
    26: "Back-to-School Push",
    37: "Labor Day Week",
    48: "Holiday Gifting Kickoff",
    59: "Year-End Clearance"
}


def write_csv(path, rows):
    if not rows:
        return
    with open(path, "w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        writer.writeheader()
        writer.writerows(rows)


def write_json(path, payload):
    with open(path, "w") as f:
        json.dump(payload, f, indent=2)


def season_profile(cycle_week):
    if cycle_week <= 5:
        phase = "start"
        demand_index = round(0.92 + cycle_week * 0.04, 2)
        inventory_position = round(0.95 - cycle_week * 0.03, 2)
        markdown_risk = 0.05
    elif cycle_week <= 15:
        phase = "in_season"
        demand_index = round(1.12 + (cycle_week - 5) * 0.02, 2)
        inventory_position = round(0.8 - (cycle_week - 5) * 0.03, 2)
        markdown_risk = 0.15
    else:
        phase = "late"
        demand_index = round(1.02 - (cycle_week - 15) * 0.03, 2)
        inventory_position = round(0.5 - (cycle_week - 15) * 0.03, 2)
        markdown_risk = 0.35

    inventory_position = max(0.08, inventory_position)
    return phase, demand_index, inventory_position, markdown_risk


# ---------------------------------------------------------------------------
# customers.csv
# ---------------------------------------------------------------------------
customer_rows = []
for i in range(CUSTOMER_COUNT):
    channel = random.choice(CHANNELS)
    group = CHANNEL_GROUP[channel]
    acq_date = START_DATE + timedelta(days=random.randint(0, WEEKS * 7))
    tenure_days = random.randint(30, 900)
    tenure_months = round(tenure_days / 30, 1)
    engagement = round(random.uniform(0.2, 0.95), 3)
    active_days = random.randint(2, 18)
    orders_90d = random.randint(1, 6)
    units_90d = round(random.uniform(1.5, 10.0), 1)
    avg_order_value = round(random.uniform(22.0, 68.0), 2)
    discount_affinity = round(random.uniform(0.1, 0.85), 2)
    social_score = round(random.uniform(0.05, 0.9), 2)
    repeat_loss_flag = random.random() < 0.17
    repeat_loss_date = ""
    if repeat_loss_flag:
        repeat_loss_date = (acq_date + timedelta(days=random.randint(60, 500))).isoformat()
    current_price = CHANNEL_PRICE[group]
    is_active = not repeat_loss_flag

    customer_rows.append({
        "customer_id": f"CUST_{i:06d}",
        "first_purchase_date": acq_date.isoformat(),
        "channel_group": group,
        "sales_channel": channel,
        "region": random.choice(REGIONS),
        "age_group": random.choice(AGE_GROUPS),
        "income_band": random.choice(INCOME_BANDS),
        "tenure_days": tenure_days,
        "tenure_months": tenure_months,
        "engagement_score": engagement,
        "active_days_30d": active_days,
        "orders_90d": orders_90d,
        "units_90d": units_90d,
        "avg_order_value_90d": avg_order_value,
        "discount_affinity": discount_affinity,
        "social_engagement_score": social_score,
        "repeat_loss_flag": str(repeat_loss_flag),
        "repeat_loss_date": repeat_loss_date,
        "current_price": current_price,
        "is_active": str(is_active)
    })

write_csv(f"{DATA_DIR}/customers.csv", customer_rows)

# ---------------------------------------------------------------------------
# season_calendar.csv
# ---------------------------------------------------------------------------
season_rows = []
for w in range(WEEKS):
    week_date = START_DATE + timedelta(days=7 * w)
    cycle_week = (w % 20) + 1
    phase, demand_index, inventory_position, markdown_risk = season_profile(cycle_week)
    season_rows.append({
        "week_start": week_date.isoformat(),
        "season_phase": phase,
        "demand_index": demand_index,
        "inventory_position": inventory_position,
        "markdown_risk": markdown_risk
    })

write_csv(f"{DATA_DIR}/season_calendar.csv", season_rows)

# ---------------------------------------------------------------------------
# price_calendar.csv
# ---------------------------------------------------------------------------
pricing_rows = []
for w in range(WEEKS):
    week_date = START_DATE + timedelta(days=7 * w)
    cycle_week = (w % 20) + 1
    for group in ["mass", "prestige"]:
        list_price = CHANNEL_PRICE[group]
        promo_flag = cycle_week in PROMO_WEEKS[group]
        if promo_flag:
            promo_discount_pct = 0.18 if group == "mass" else 0.08
            promo_type = "competitive_defense" if cycle_week in {14, 15} else "seasonal_push"
        else:
            promo_discount_pct = 0.0
            promo_type = "full_price"
        effective_price = round(list_price * (1 - promo_discount_pct), 2)
        price_changed = promo_flag
        price_change_pct = round((effective_price - list_price) / list_price * 100, 2)
        pricing_rows.append({
            "week_start": week_date.isoformat(),
            "channel_group": group,
            "list_price": list_price,
            "promo_flag": str(promo_flag),
            "promo_discount_pct": round(promo_discount_pct * 100, 1),
            "effective_price": effective_price,
            "price_changed": str(price_changed),
            "price_change_pct": price_change_pct,
            "promo_type": promo_type,
            "promo_message": "Limited-time sun care savings" if promo_flag else "Everyday prestige pricing"
        })

write_csv(f"{DATA_DIR}/price_calendar.csv", pricing_rows)

# ---------------------------------------------------------------------------
# channel_weekly.csv
# ---------------------------------------------------------------------------
weekly_rows = []
for w in range(WEEKS):
    week_date = START_DATE + timedelta(days=7 * w)
    cycle_week = (w % 20) + 1
    phase, demand_index, inventory_position, markdown_risk = season_profile(cycle_week)

    for group in ["mass", "prestige"]:
        base_price = CHANNEL_PRICE[group]
        promo_flag = cycle_week in PROMO_WEEKS[group]
        promo_discount_pct = 0.18 if promo_flag and group == "mass" else (0.08 if promo_flag else 0.0)
        effective_price = round(base_price * (1 - promo_discount_pct), 2)
        season_index = demand_index
        promo_lift = 1.15 if promo_flag else 1.0
        base_active = random.randint(21000, 32000) if group == "mass" else random.randint(14000, 22000)
        active = int(base_active * season_index * promo_lift)

        new_rate = random.uniform(0.02, 0.05)
        new_customers = int(active * new_rate * promo_lift)
        repeat_loss_rate = round(random.uniform(0.035, 0.065) * (1.05 if markdown_risk > 0.3 else 1.0), 3)
        repeat_loss_customers = int(active * repeat_loss_rate)
        net_adds = new_customers - repeat_loss_customers

        units_per_customer = random.uniform(1.1, 1.8) if group == "mass" else random.uniform(1.0, 1.6)
        units_sold = round(active * units_per_customer, 1)
        revenue = round(units_sold * effective_price, 2)
        aov = round(revenue / active, 2) if active else 0
        margin_pct = round(random.uniform(0.42, 0.55), 2) if group == "prestige" else round(random.uniform(0.32, 0.45), 2)

        weekly_rows.append({
            "week_start": week_date.isoformat(),
            "channel_group": group,
            "season_phase": phase,
            "active_customers": active,
            "new_customers": new_customers,
            "repeat_loss_customers": repeat_loss_customers,
            "net_adds": net_adds,
            "repeat_loss_rate": repeat_loss_rate,
            "price": base_price,
            "effective_price": effective_price,
            "promo_depth_pct": round(promo_discount_pct * 100, 1),
            "units_sold": units_sold,
            "revenue": revenue,
            "aov": aov,
            "gross_margin_pct": margin_pct,
            "inventory_position": inventory_position,
            "markdown_risk": markdown_risk
        })

write_csv(f"{DATA_DIR}/channel_weekly.csv", weekly_rows)

# ---------------------------------------------------------------------------
# market_signals.csv
# ---------------------------------------------------------------------------
external_rows = []
for w in range(WEEKS):
    week_date = START_DATE + timedelta(days=7 * w)
    cycle_week = (w % 20) + 1
    comp_a = round(random.uniform(22, 30), 2)  # mass competitor index
    comp_b = round(random.uniform(28, 40), 2)  # prestige competitor index
    comp_c = round(random.uniform(20, 34), 2)  # marketplace competitor index
    avg_comp = round((comp_a + comp_b + comp_c) / 3, 2)
    promo_flag = 1 if cycle_week in {6, 7, 14, 15} else 0
    category_demand = round(random.uniform(0.9, 1.2), 2)
    promo_clutter = round(random.uniform(0.2, 0.6) + (0.2 if promo_flag else 0.0), 2)

    external_rows.append({
        "week_start": week_date.isoformat(),
        "competitor_price_a": comp_a,
        "competitor_price_b": comp_b,
        "competitor_price_c": comp_c,
        "competitor_avg_price": avg_comp,
        "competitor_promo_flag": promo_flag,
        "macro_cpi": round(random.uniform(295, 308), 2),
        "consumer_sentiment": round(random.uniform(92, 118), 2),
        "unemployment_rate": round(random.uniform(3.4, 4.6), 2),
        "category_demand_index": category_demand,
        "promo_clutter_index": promo_clutter
    })

write_csv(f"{DATA_DIR}/market_signals.csv", external_rows)

# ---------------------------------------------------------------------------
# social_signals.csv
# ---------------------------------------------------------------------------
social_rows = []
for w in range(WEEKS):
    week_date = START_DATE + timedelta(days=7 * w)
    cycle_week = (w % 20) + 1
    spike = 1.4 if cycle_week in {4, 5, 6} else 1.0
    tiktok_mentions = int(random.uniform(800, 3200) * spike)
    instagram_mentions = int(random.uniform(1200, 4200) * spike)
    total_mentions = tiktok_mentions + instagram_mentions + int(random.uniform(400, 1200))
    sentiment = round(random.uniform(0.35, 0.75) + (0.1 if spike > 1.1 else 0.0), 2)
    influencer_score = round(random.uniform(0.2, 0.9) * spike, 2)
    paid_social = round(random.uniform(25000, 52000) * spike, 2)
    earned_social = round(random.uniform(12000, 26000) * spike, 2)
    total_spend = round(paid_social + earned_social, 2)
    social_rows.append({
        "week_start": week_date.isoformat(),
        "total_social_mentions": total_mentions,
        "tiktok_mentions": tiktok_mentions,
        "instagram_mentions": instagram_mentions,
        "social_sentiment": sentiment,
        "influencer_score": influencer_score,
        "paid_social_spend": paid_social,
        "earned_social_value": earned_social,
        "total_social_spend": total_spend
    })

write_csv(f"{DATA_DIR}/social_signals.csv", social_rows)

# ---------------------------------------------------------------------------
# retail_events.csv
# ---------------------------------------------------------------------------
event_rows = []
for i, channel in enumerate(CHANNELS, start=1):
    for week in EVENT_WEEKS[channel]:
        event_rows.append({
            "event_id": f"EVT_{i:03d}_{week:02d}",
            "week_start": (START_DATE + timedelta(days=7 * (week - 1))).isoformat(),
            "event_type": "Retail Event",
            "channel_group": CHANNEL_GROUP[channel],
            "affected_channel": channel,
            "price_before": 0,
            "price_after": 0,
            "promo_id": "PROMO_EVENT",
            "promo_discount_pct": 12.0,
            "notes": f"{channel} seasonal highlight",
            "validation_window": "clean"
        })

for week, label in SEASONAL_TENTPOLES.items():
    event_rows.append({
        "event_id": f"EVT_TENT_{week:02d}",
        "week_start": (START_DATE + timedelta(days=7 * (week - 1))).isoformat(),
        "event_type": "Retail Event",
        "channel_group": "all",
        "affected_channel": "all",
        "price_before": 0,
        "price_after": 0,
        "promo_id": "TENTPOLE",
        "promo_discount_pct": 0.0,
        "notes": label,
        "validation_window": "confounded"
    })

for week in [7, 15, 24, 35, 44, 56]:
    event_rows.append({
        "event_id": f"EVT_COMP_{week:02d}",
        "week_start": (START_DATE + timedelta(days=7 * (week - 1))).isoformat(),
        "event_type": "Competitor Price Drop",
        "channel_group": "mass",
        "affected_channel": "amazon",
        "price_before": 0,
        "price_after": 0,
        "promo_id": "COMP_DROP",
        "promo_discount_pct": 0.0,
        "notes": "Competitive set drops price on key SPF SKU",
        "validation_window": "confounded"
    })

for week in [5, 9, 16, 20, 26, 30, 36, 40, 46, 52]:
    event_rows.append({
        "event_id": f"EVT_SOC_{week:02d}",
        "week_start": (START_DATE + timedelta(days=7 * (week - 1))).isoformat(),
        "event_type": "Social Spike",
        "channel_group": "all",
        "affected_channel": "all",
        "price_before": 0,
        "price_after": 0,
        "promo_id": "SOCIAL_SPIKE",
        "promo_discount_pct": 0.0,
        "notes": "Social lift in demand due to influencer content",
        "validation_window": "confounded"
    })

for week in [18, 22, 28, 34, 46]:
    event_rows.append({
        "event_id": f"EVT_MKD_{week:02d}",
        "week_start": (START_DATE + timedelta(days=7 * (week - 1))).isoformat(),
        "event_type": "Markdown Start",
        "channel_group": "all",
        "affected_channel": "all",
        "price_before": 0,
        "price_after": 0,
        "promo_id": "MARKDOWN",
        "promo_discount_pct": 25.0,
        "notes": "Late-season markdown to clear inventory",
        "validation_window": "confounded"
    })

write_csv(f"{DATA_DIR}/retail_events.csv", event_rows)

# ---------------------------------------------------------------------------
# segments.csv + segment_kpis.csv
# ---------------------------------------------------------------------------
acquisition_segments = [
    "seasonal_first_time",
    "routine_refill",
    "gift_buyer",
    "influencer_discovered",
    "promo_triggered"
]
engagement_segments = [
    "prestige_loyalist",
    "value_seeker",
    "deal_hunter",
    "occasional_shop",
    "channel_switcher"
]
monetization_segments = [
    "single_sku_staple",
    "multi_sku_builder",
    "value_bundle_buyer",
    "premium_add_on",
    "trial_size_sampler"
]

segment_rows = []
for i in range(SEGMENT_CUSTOMERS):
    cust_id = f"CUST{str(i+1).zfill(6)}"
    group = random.choice(["mass", "prestige"])
    acq = random.choice(acquisition_segments)
    eng = random.choice(engagement_segments)
    mon = random.choice(monetization_segments)
    segment_rows.append({
        "customer_id": cust_id,
        "channel_group": group,
        "acquisition_segment": acq,
        "engagement_segment": eng,
        "monetization_segment": mon,
        "segment_key": f"{acq}|{eng}|{mon}"
    })

write_csv(f"{DATA_DIR}/segments.csv", segment_rows)

segment_kpis = []
for acq in acquisition_segments:
    for eng in engagement_segments:
        for mon in monetization_segments:
            for group in ["mass", "prestige"]:
                base_aov = random.uniform(24, 46) if group == "mass" else random.uniform(32, 58)
                segment_kpis.append({
                    "segment_key": f"{acq}|{eng}|{mon}",
                    "channel_group": group,
                    "customer_count": random.randint(400, 1600),
                    "repeat_loss_rate": round(random.uniform(0.06, 0.18), 3),
                    "avg_order_value": round(base_aov, 2),
                    "avg_units_per_order": round(random.uniform(1.2, 2.8), 2),
                    "avg_cac": round(random.uniform(6.0, 14.0), 2),
                    "promo_redemption_rate": round(random.uniform(0.08, 0.32), 2),
                    "margin_rate": round(random.uniform(0.32, 0.52), 2)
                })

write_csv(f"{DATA_DIR}/segment_kpis.csv", segment_kpis)

# ---------------------------------------------------------------------------
# segment_elasticity.json
# ---------------------------------------------------------------------------
cohort_profiles = {
    "brand_loyal": 0.28,
    "value_conscious": 0.22,
    "deal_seeker": 0.16,
    "trend_driven": 0.12,
    "channel_switcher": 0.12,
    "premium_loyal": 0.07,
    "at_risk": 0.03
}

segment_elasticity = {
    "ad_supported": {"segment_elasticity": {}},
    "ad_free": {"segment_elasticity": {}}
}

acq_elasticity_map = {
    "seasonal_first_time": -2.4,
    "routine_refill": -1.4,
    "gift_buyer": -1.9,
    "influencer_discovered": -2.2,
    "promo_triggered": -2.8
}

engagement_repeat_loss_map = {
    "prestige_loyalist": 0.55,
    "value_seeker": 0.85,
    "deal_hunter": 1.2,
    "occasional_shop": 1.0,
    "channel_switcher": 1.1
}

monetization_migration_map = {
    "single_sku_staple": (0.9, 1.1),
    "multi_sku_builder": (1.2, 0.8),
    "value_bundle_buyer": (1.05, 0.95),
    "premium_add_on": (1.3, 0.7),
    "trial_size_sampler": (0.8, 1.2)
}

for tier, tier_shift in [("ad_supported", -0.2), ("ad_free", 0.1)]:
    for acq in acquisition_segments:
        for eng in engagement_segments:
            for mon in monetization_segments:
                key = f"{acq}|{eng}|{mon}"
                base_acq = acq_elasticity_map[acq] + tier_shift + random.uniform(-0.15, 0.15)
                repeat_loss_elasticity = engagement_repeat_loss_map[eng] + random.uniform(-0.1, 0.15)
                upgrade_willingness, downgrade_propensity = monetization_migration_map[mon]
                segment_elasticity[tier]["segment_elasticity"][key] = {
                    "acquisition_axis": {
                        "elasticity": base_acq,
                        "tenure_decay_rate": round(random.uniform(0.03, 0.08), 3),
                        "engagement_offset": round(random.uniform(0.12, 0.3), 3),
                        "price_history_habituation": round(random.uniform(0.05, 0.15), 3)
                    },
                    "repeat_loss_axis": {
                        "elasticity": repeat_loss_elasticity,
                        "repeat_loss_curve_type": random.choice(["moderate", "delayed_ramp", "gentle_slope"]),
                        "time_lag_distribution": {
                            "0_4_weeks": round(random.uniform(0.1, 0.2), 3),
                            "4_8_weeks": round(random.uniform(0.18, 0.28), 3),
                            "8_12_weeks": round(random.uniform(0.2, 0.3), 3),
                            "12_16_weeks": round(random.uniform(0.15, 0.25), 3),
                            "16_20_weeks": round(random.uniform(0.08, 0.18), 3)
                        }
                    },
                    "migration_axis": {
                        "upgrade_willingness": round(upgrade_willingness + random.uniform(-0.1, 0.15), 2),
                        "downgrade_propensity": round(downgrade_propensity + random.uniform(-0.1, 0.2), 2),
                        "asymmetry_factor": round(random.uniform(1.4, 3.4), 2)
                    },
                    "profile_weights": cohort_profiles
                }

write_json(f"{DATA_DIR}/segment_elasticity.json", segment_elasticity)

# ---------------------------------------------------------------------------
# cohort_coefficients.json
# ---------------------------------------------------------------------------
cohort_coefficients = {
    "metadata": {
        "description": "Behavioral archetype profiles for seasonal retail cohorts",
        "version": "5.0",
        "generation_date": "2026-02-24",
        "method": "Profile mixing with seasonal adjustments"
    },
    "brand_loyal": {
        "label": "Brand Loyal",
        "description": "High-repeat customers with strong brand affinity",
        "acquisition_elasticity": -0.7,
        "repeat_loss_elasticity": 0.45,
        "migration_upgrade": 1.3,
        "migration_downgrade": 0.6,
        "tenure_decay_rate": 0.08,
        "engagement_offset": 0.35,
        "price_history_habituation": 0.2,
        "repeat_loss_curve_type": "delayed_ramp",
        "migration_asymmetry_factor": 1.7,
        "time_lag_distribution": {
            "0_4_weeks": 0.06,
            "4_8_weeks": 0.12,
            "8_12_weeks": 0.2,
            "12_16_weeks": 0.34,
            "16_20_weeks": 0.28
        }
    },
    "value_conscious": {
        "label": "Value Conscious",
        "description": "Responds to price gaps and smaller discounts",
        "acquisition_elasticity": -1.8,
        "repeat_loss_elasticity": 0.95,
        "migration_upgrade": 0.9,
        "migration_downgrade": 1.4,
        "tenure_decay_rate": 0.03,
        "engagement_offset": 0.18,
        "price_history_habituation": 0.06,
        "repeat_loss_curve_type": "moderate",
        "migration_asymmetry_factor": 2.2,
        "time_lag_distribution": {
            "0_4_weeks": 0.16,
            "4_8_weeks": 0.26,
            "8_12_weeks": 0.28,
            "12_16_weeks": 0.2,
            "16_20_weeks": 0.1
        }
    },
    "deal_seeker": {
        "label": "Deal Seeker",
        "description": "Promo-first shoppers with high drop-off risk",
        "acquisition_elasticity": -2.6,
        "repeat_loss_elasticity": 1.4,
        "migration_upgrade": 0.6,
        "migration_downgrade": 1.9,
        "tenure_decay_rate": 0.01,
        "engagement_offset": 0.08,
        "price_history_habituation": 0.02,
        "repeat_loss_curve_type": "sharp_spike_plateau",
        "migration_asymmetry_factor": 3.4,
        "time_lag_distribution": {
            "0_4_weeks": 0.38,
            "4_8_weeks": 0.32,
            "8_12_weeks": 0.18,
            "12_16_weeks": 0.08,
            "16_20_weeks": 0.04
        }
    },
    "trend_driven": {
        "label": "Trend Driven",
        "description": "Social-led discovery with medium loyalty",
        "acquisition_elasticity": -2.0,
        "repeat_loss_elasticity": 0.9,
        "migration_upgrade": 1.1,
        "migration_downgrade": 1.0,
        "tenure_decay_rate": 0.05,
        "engagement_offset": 0.25,
        "price_history_habituation": 0.12,
        "repeat_loss_curve_type": "conditional_spike",
        "migration_asymmetry_factor": 2.1,
        "time_lag_distribution": {
            "0_4_weeks": 0.14,
            "4_8_weeks": 0.24,
            "8_12_weeks": 0.28,
            "12_16_weeks": 0.22,
            "16_20_weeks": 0.12
        }
    },
    "channel_switcher": {
        "label": "Channel Switcher",
        "description": "Moves between mass and prestige based on price gaps",
        "acquisition_elasticity": -1.9,
        "repeat_loss_elasticity": 1.1,
        "migration_upgrade": 1.0,
        "migration_downgrade": 1.6,
        "tenure_decay_rate": 0.04,
        "engagement_offset": 0.2,
        "price_history_habituation": 0.1,
        "repeat_loss_curve_type": "moderate",
        "migration_asymmetry_factor": 2.6,
        "time_lag_distribution": {
            "0_4_weeks": 0.18,
            "4_8_weeks": 0.28,
            "8_12_weeks": 0.26,
            "12_16_weeks": 0.18,
            "16_20_weeks": 0.1
        }
    },
    "premium_loyal": {
        "label": "Premium Loyal",
        "description": "High AOV shoppers loyal to prestige channel",
        "acquisition_elasticity": -1.2,
        "repeat_loss_elasticity": 0.6,
        "migration_upgrade": 1.5,
        "migration_downgrade": 0.5,
        "tenure_decay_rate": 0.06,
        "engagement_offset": 0.3,
        "price_history_habituation": 0.15,
        "repeat_loss_curve_type": "gentle_slope",
        "migration_asymmetry_factor": 1.1,
        "time_lag_distribution": {
            "0_4_weeks": 0.1,
            "4_8_weeks": 0.14,
            "8_12_weeks": 0.2,
            "12_16_weeks": 0.28,
            "16_20_weeks": 0.28
        }
    },
    "at_risk": {
        "label": "At Risk",
        "description": "Low engagement, high drop-off potential",
        "acquisition_elasticity": -2.2,
        "repeat_loss_elasticity": 1.35,
        "migration_upgrade": 0.6,
        "migration_downgrade": 1.7,
        "tenure_decay_rate": -0.01,
        "engagement_offset": 0.12,
        "price_history_habituation": 0.05,
        "repeat_loss_curve_type": "accelerating",
        "migration_asymmetry_factor": 3.0,
        "time_lag_distribution": {
            "0_4_weeks": 0.24,
            "4_8_weeks": 0.3,
            "8_12_weeks": 0.24,
            "12_16_weeks": 0.14,
            "16_20_weeks": 0.08
        }
    },
    "baseline": {
        "label": "Baseline",
        "description": "Aggregate of all cohorts weighted by population",
        "acquisition_elasticity": -1.6,
        "repeat_loss_elasticity": 0.95,
        "migration_upgrade": 1.0,
        "migration_downgrade": 1.2,
        "tenure_decay_rate": 0.05,
        "engagement_offset": 0.2,
        "price_history_habituation": 0.1,
        "repeat_loss_curve_type": "moderate",
        "migration_asymmetry_factor": 2.2,
        "time_lag_distribution": {
            "0_4_weeks": 0.16,
            "4_8_weeks": 0.26,
            "8_12_weeks": 0.28,
            "12_16_weeks": 0.2,
            "16_20_weeks": 0.1
        }
    }
}

write_json(f"{DATA_DIR}/cohort_coefficients.json", cohort_coefficients)

# ---------------------------------------------------------------------------
# elasticity-params.json
# ---------------------------------------------------------------------------
elasticity_params = {
    "metadata": {
        "generated_date": "2026-02-24",
        "version": "4.0",
        "description": "Price elasticity parameters for seasonal retail promotions across channels",
        "estimation_method": "Synthetic calibration using prestige vs mass promo benchmarks and channel-specific discount sensitivity",
        "data_source": "Composite benchmarks from prestige retail, mass retail, and marketplace promo behavior (2022-2025)",
        "real_world_validation": "Mass channels show higher elasticity than prestige channels; repeat customers are less price-sensitive",
        "benchmark_sources": [
            "Beauty retail promo benchmarks (prestige vs mass channel elasticity ranges)",
            "Marketplace discount response studies (category-level demand shifts)",
            "Seasonal sell-through guidance from beauty and personal care"
        ],
        "confidence_level": 0.88,
        "validation": "Parameters tuned to align with seasonal retail promo behavior while preserving model stability."
    },
    "tiers": {
        "ad_supported": {
            "base_elasticity": -2.1,
            "confidence_interval": 0.3,
            "std_error": 0.16,
            "interpretation": "Elastic demand - 1% price increase leads to 2.1% decrease in units",
            "price_range": {
                "min": 18.0,
                "max": 30.0,
                "current": 24.0
            },
            "segments": {
                "new_0_3mo": {
                    "elasticity": -2.6,
                    "confidence_interval": 0.4,
                    "size_pct": 0.32,
                    "description": "New customers (0-3 months) - highly price sensitive"
                },
                "tenured_3_12mo": {
                    "elasticity": -2.1,
                    "confidence_interval": 0.3,
                    "size_pct": 0.38,
                    "description": "Repeat customers (3-12 months) - moderately price sensitive"
                },
                "tenured_12plus": {
                    "elasticity": -1.7,
                    "confidence_interval": 0.25,
                    "size_pct": 0.3,
                    "description": "Loyal customers (12+ months) - less price sensitive"
                }
            },
            "cohort_elasticity": {
                "by_age": {
                    "18-24": -2.5,
                    "25-34": -2.3,
                    "35-44": -2.1,
                    "45-54": -2.0,
                    "55+": -1.8
                },
                "by_device": {
                    "mobile": -2.3,
                    "web": -2.2,
                    "in_store": -1.9,
                    "marketplace": -2.4,
                    "omni": -1.8
                },
                "by_channel": {
                    "sephora": -1.6,
                    "ulta": -1.7,
                    "target": -2.2,
                    "amazon": -2.4,
                    "dtc": -1.9
                },
                "by_promo_status": {
                    "full_price": -2.0,
                    "promotional": -2.8
                }
            }
        },
        "ad_free": {
            "base_elasticity": -1.5,
            "confidence_interval": 0.25,
            "std_error": 0.12,
            "interpretation": "Moderately elastic demand - 1% price increase leads to 1.5% decrease in units",
            "price_range": {
                "min": 28.0,
                "max": 45.0,
                "current": 36.0
            },
            "segments": {
                "new_0_3mo": {
                    "elasticity": -1.9,
                    "confidence_interval": 0.3,
                    "size_pct": 0.26,
                    "description": "New customers (0-3 months) - moderately price sensitive"
                },
                "tenured_3_12mo": {
                    "elasticity": -1.5,
                    "confidence_interval": 0.2,
                    "size_pct": 0.36,
                    "description": "Repeat customers (3-12 months) - standard price sensitivity"
                },
                "tenured_12plus": {
                    "elasticity": -1.2,
                    "confidence_interval": 0.18,
                    "size_pct": 0.38,
                    "description": "Prestige loyalists (12+ months) - less price sensitive"
                }
            },
            "cohort_elasticity": {
                "by_age": {
                    "18-24": -1.7,
                    "25-34": -1.6,
                    "35-44": -1.5,
                    "45-54": -1.4,
                    "55+": -1.3
                },
                "by_device": {
                    "mobile": -1.6,
                    "web": -1.5,
                    "in_store": -1.3,
                    "marketplace": -1.7,
                    "omni": -1.4
                },
                "by_channel": {
                    "sephora": -1.2,
                    "ulta": -1.3,
                    "target": -1.6,
                    "amazon": -1.8,
                    "dtc": -1.4
                },
                "by_promo_status": {
                    "full_price": -1.4,
                    "promotional": -1.9
                }
            }
        }
    },
    "time_horizon_adjustments": {
        "short_term_0_3mo": {
            "multiplier": 1.1,
            "description": "Short-term elasticity higher due to promo sensitivity"
        },
        "medium_term_3_12mo": {
            "multiplier": 1.0,
            "description": "Medium-term elasticity baseline"
        },
        "long_term_12plus": {
            "multiplier": 0.85,
            "description": "Long-term elasticity lower as loyalty builds"
        }
    },
    "external_factor_adjustments": {
        "description": "How external factors modify price elasticity",
        "macroeconomic": {
            "high_inflation": {
                "elasticity_multiplier": 1.1,
                "description": "During high inflation, shoppers are more price sensitive"
            },
            "high_unemployment": {
                "elasticity_multiplier": 1.2,
                "description": "During high unemployment, price sensitivity increases"
            },
            "low_consumer_sentiment": {
                "elasticity_multiplier": 1.08,
                "description": "During low sentiment, price sensitivity increases"
            }
        },
        "competitive": {
            "competitor_price_increase": {
                "elasticity_multiplier": 0.88,
                "description": "When competitors raise prices, elasticity decreases"
            },
            "competitor_price_decrease": {
                "elasticity_multiplier": 1.18,
                "description": "When competitors lower prices, elasticity increases"
            },
            "major_competitor_promo": {
                "elasticity_multiplier": 1.12,
                "description": "Competitor promos raise price sensitivity"
            }
        },
        "social": {
            "viral_spike": {
                "elasticity_multiplier": 0.9,
                "description": "Viral social moment reduces price sensitivity"
            },
            "negative_sentiment": {
                "elasticity_multiplier": 1.1,
                "description": "Negative sentiment increases price sensitivity"
            }
        }
    },
    "willingness_to_pay": {
        "description": "Distribution of willingness to pay (WTP) by channel group",
        "ad_supported": {
            "mean": 25.0,
            "median": 24.0,
            "std_dev": 4.5,
            "percentiles": {
                "p10": 18.0,
                "p25": 21.5,
                "p50": 24.0,
                "p75": 28.0,
                "p90": 32.0
            },
            "interpretation": "50% of mass-channel shoppers willing to pay $24 or more"
        },
        "ad_free": {
            "mean": 38.0,
            "median": 36.5,
            "std_dev": 6.0,
            "percentiles": {
                "p10": 28.0,
                "p25": 32.0,
                "p50": 36.5,
                "p75": 42.0,
                "p90": 48.0
            },
            "interpretation": "50% of prestige-channel shoppers willing to pay $36.50 or more"
        }
    },
    "repeat_loss_elasticity": {
        "description": "How repeat-loss rate changes with price changes",
        "ad_supported": {
            "repeat_loss_elasticity": 0.85,
            "baseline_repeat_loss": 0.05,
            "interpretation": "1% price increase leads to 0.85% increase in repeat loss"
        },
        "ad_free": {
            "repeat_loss_elasticity": 0.65,
            "baseline_repeat_loss": 0.045,
            "interpretation": "1% price increase leads to 0.65% increase in repeat loss"
        }
    },
    "acquisition_elasticity": {
        "description": "How new customer acquisition changes with price changes",
        "ad_supported": {
            "acquisition_elasticity": -1.7,
            "interpretation": "1% price increase leads to 1.7% decrease in new customers"
        },
        "ad_free": {
            "acquisition_elasticity": -1.4,
            "interpretation": "1% price increase leads to 1.4% decrease in new customers"
        }
    },
    "notes": {
        "estimation_approach": "Retail promo benchmarks and synthetic calibration",
        "methodology": "Elasticity values derived from retail promo response patterns and category benchmarks (2022-2025).",
        "benchmark_validation": "Discount depth and price changes calibrated to typical beauty retail response curves.",
        "data_sources": [
            "Category promo response benchmarks",
            "Marketplace discount response studies",
            "Seasonal sell-through guidance"
        ],
        "assumptions": [
            "Elasticity estimates assume ceteris paribus",
            "Cross-price elasticity assumes competitors maintain current pricing",
            "Segment-level elasticity assumes homogeneity within segments",
            "Time horizon adjustments based on observed retail behavior"
        ],
        "confidence": "High confidence (0.88) - values derived from market observations.",
        "use_case": "Suitable for POC simulation, scenario modeling, and pricing strategy exploration.",
        "update_frequency": "Review annually or after major channel shifts."
    }
}

write_json(f"{DATA_DIR}/elasticity-params.json", elasticity_params)

# ---------------------------------------------------------------------------
# scenarios.json
# ---------------------------------------------------------------------------
scenarios = [
    {
        "id": "scenario_001",
        "name": "Mass Channel Defensive Promo (Target/Amazon)",
        "category": "promotion",
        "model_type": "acquisition",
        "description": "Apply a 15% promo on mass channels to defend volume after competitor price drops.",
        "impact_summary": "Projected +18% new customers, +9% units, -6% margin short-term",
        "config": {
            "tier": "ad_supported",
            "current_price": 24.0,
            "new_price": 20.4,
            "price_change_pct": -15.0,
            "promotion": {
                "type": "seasonal_discount",
                "duration_months": 2,
                "discount_pct": 15,
                "promo_code": "DEFEND15",
                "eligibility": "all_customers",
                "start_date": "2025-06-01",
                "end_date": "2025-08-01"
            },
            "target_segment": "all",
            "effective_date": "2025-06-01",
            "grandfathering": False
        },
        "constraints": {
            "platform_compliant": True,
            "price_change_12mo_limit": True,
            "notice_period_30d": False,
            "min_price": 18.0,
            "max_price": 30.0
        },
        "priority": "high",
        "business_rationale": "Defend share in mass channels when competitors discount on marketplaces."
    },
    {
        "id": "scenario_002",
        "name": "Prestige Channel Light Promo (Sephora/Ulta)",
        "category": "promotion",
        "model_type": "acquisition",
        "description": "Offer 8% prestige promo focused on high-margin SKUs to support season launch.",
        "impact_summary": "Projected +9% new customers, +4% units, -2% margin",
        "config": {
            "tier": "ad_free",
            "current_price": 36.0,
            "new_price": 33.12,
            "price_change_pct": -8.0,
            "promotion": {
                "type": "seasonal_launch",
                "duration_months": 1,
                "discount_pct": 8,
                "promo_code": "LAUNCH8",
                "eligibility": "prestige_channels",
                "start_date": "2025-03-15",
                "end_date": "2025-04-15"
            },
            "target_segment": "loyal",
            "effective_date": "2025-03-15",
            "grandfathering": False
        },
        "constraints": {
            "platform_compliant": True,
            "price_change_12mo_limit": True,
            "notice_period_30d": False,
            "min_price": 28.0,
            "max_price": 45.0
        },
        "priority": "high",
        "business_rationale": "Keep prestige positioning while supporting launch momentum."
    },
    {
        "id": "scenario_003",
        "name": "Reduce Promo Depth in Prestige (Hold Price)",
        "category": "price_increase",
        "model_type": "churn",
        "description": "Pull back discounts in prestige channel to protect margin during viral demand spike.",
        "impact_summary": "Projected -2% units, +5% margin, minimal repeat loss",
        "config": {
            "tier": "ad_free",
            "current_price": 36.0,
            "new_price": 38.0,
            "price_change_pct": 5.56,
            "promotion": None,
            "target_segment": "all",
            "effective_date": "2025-07-01",
            "grandfathering": False
        },
        "constraints": {
            "platform_compliant": True,
            "price_change_12mo_limit": True,
            "notice_period_30d": True,
            "min_price": 28.0,
            "max_price": 45.0
        },
        "priority": "medium",
        "business_rationale": "Monetize demand spike without over-discounting prestige channel."
    },
    {
        "id": "scenario_004",
        "name": "Mass Channel Markdown Start (Late Season)",
        "category": "promotion",
        "model_type": "churn",
        "description": "Introduce 25% markdown to clear inventory before season end.",
        "impact_summary": "Projected +22% units, -9% margin, faster sell-through",
        "config": {
            "tier": "ad_supported",
            "current_price": 24.0,
            "new_price": 18.0,
            "price_change_pct": -25.0,
            "promotion": {
                "type": "markdown",
                "duration_months": 1.5,
                "discount_pct": 25,
                "promo_code": "CLEAR25",
                "eligibility": "all_customers",
                "start_date": "2025-08-15",
                "end_date": "2025-10-01"
            },
            "target_segment": "all",
            "effective_date": "2025-08-15",
            "grandfathering": False
        },
        "constraints": {
            "platform_compliant": True,
            "price_change_12mo_limit": False,
            "notice_period_30d": False,
            "min_price": 16.0,
            "max_price": 30.0
        },
        "priority": "medium",
        "business_rationale": "Accelerate sell-through on seasonal inventory."
    },
    {
        "id": "scenario_005",
        "name": "Seasonal Value Set (DTC Exclusive)",
        "category": "new_tier",
        "model_type": "migration",
        "description": "Launch limited-time value set bundle at $44 to drive channel mix toward DTC.",
        "impact_summary": "Projected +6% mix shift to DTC, +4% revenue lift",
        "config": {
            "tier": "bundle",
            "current_price": 72.0,
            "new_price": 44.0,
            "price_change_pct": -38.9,
            "promotion": None,
            "target_segment": "value_bundle_buyer",
            "effective_date": "2025-06-15",
            "grandfathering": False,
            "bundle_components": {
                "supergoop_core": {
                    "tier": "prestige",
                    "standalone_price": 36.0
                },
                "seasonal_add_on": {
                    "tier": "mass",
                    "standalone_price": 24.0
                },
                "bundle_discount": 16.0,
                "bundle_discount_pct": 26
            }
        },
        "constraints": {
            "platform_compliant": True,
            "price_change_12mo_limit": False,
            "notice_period_30d": False,
            "min_price": 40.0,
            "max_price": 60.0
        },
        "priority": "high",
        "business_rationale": "Drive DTC traffic and capture higher margin bundles."
    },
    {
        "id": "scenario_006",
        "name": "Entry Pack for Mass Channel",
        "category": "new_tier",
        "model_type": "migration",
        "description": "Introduce a trial-size entry pack at $14 to capture price-sensitive shoppers.",
        "impact_summary": "Projected +12% new customers, -3% margin, improved trial conversion",
        "config": {
            "tier": "basic",
            "current_price": None,
            "new_price": 14.0,
            "price_change_pct": None,
            "promotion": None,
            "target_segment": "promo_triggered",
            "effective_date": "2025-04-01",
            "grandfathering": False,
            "tier_features": {
                "bundle": "trial_size",
                "channel": "mass",
                "unit_count": 1
            }
        },
        "constraints": {
            "platform_compliant": True,
            "price_change_12mo_limit": False,
            "notice_period_30d": False,
            "min_price": 10.0,
            "max_price": 18.0
        },
        "priority": "medium",
        "business_rationale": "Lower barrier to entry for price-sensitive shoppers."
    },
    {
        "id": "scenario_007",
        "name": "Prestige Channel Price Lift",
        "category": "price_increase",
        "model_type": "churn",
        "description": "Increase prestige channel price by $2 to protect margin amid strong demand.",
        "impact_summary": "Projected +4% revenue, -2% units, small repeat loss uptick",
        "config": {
            "tier": "ad_free",
            "current_price": 36.0,
            "new_price": 38.0,
            "price_change_pct": 5.56,
            "promotion": None,
            "target_segment": "prestige_loyalist",
            "effective_date": "2025-05-15",
            "grandfathering": False
        },
        "constraints": {
            "platform_compliant": True,
            "price_change_12mo_limit": True,
            "notice_period_30d": True,
            "min_price": 28.0,
            "max_price": 45.0
        },
        "priority": "low",
        "business_rationale": "Capture margin while loyalty remains high."
    },
    {
        "id": "scenario_008",
        "name": "Channel Mix Shift to Prestige",
        "category": "bundling",
        "model_type": "migration",
        "description": "Shift demand toward prestige channel with exclusive gift-with-purchase.",
        "impact_summary": "Projected +5% prestige mix, +3% revenue",
        "config": {
            "tier": "premium",
            "current_price": 36.0,
            "new_price": 36.0,
            "price_change_pct": 0,
            "promotion": {
                "type": "gift_with_purchase",
                "duration_months": 2,
                "discount_pct": 0,
                "promo_code": "GIFT",
                "eligibility": "prestige_channels",
                "start_date": "2025-05-01",
                "end_date": "2025-07-01"
            },
            "target_segment": "premium_add_on",
            "effective_date": "2025-05-01",
            "grandfathering": False
        },
        "constraints": {
            "platform_compliant": True,
            "price_change_12mo_limit": False,
            "notice_period_30d": False,
            "min_price": 28.0,
            "max_price": 45.0
        },
        "priority": "medium",
        "business_rationale": "Encourage migration to prestige without deep discounting."
    },
    {
        "id": "scenario_baseline",
        "name": "Do Nothing (Baseline)",
        "category": "baseline",
        "model_type": "baseline",
        "description": "Maintain current pricing and promotional strategy with no changes",
        "impact_summary": "Baseline scenario for comparison",
        "config": {
            "tier": "all",
            "current_price": None,
            "new_price": None,
            "price_change_pct": 0,
            "promotion": None,
            "target_segment": "all",
            "effective_date": "2025-03-15",
            "grandfathering": False
        },
        "constraints": {
            "platform_compliant": True,
            "price_change_12mo_limit": True,
            "notice_period_30d": True,
            "min_price": None,
            "max_price": None
        },
        "priority": "n/a",
        "business_rationale": "Control scenario to measure incremental impact"
    }
]

write_json(f"{DATA_DIR}/scenarios.json", scenarios)

# ---------------------------------------------------------------------------
# promo_metadata.json – Supergoop / portfolio client (Sephora, Ulta, Target, Amazon, DTC)
# Campaign names and types aligned to real retail promos: Sephora Sun Safety,
# Ulta 21 Days, Target Circle, Amazon Prime Day, DTC bundles.
# ---------------------------------------------------------------------------
promo_metadata = {
    "PROMO_SEPHORA_SUN_SAFETY_2024": {
        "promo_id": "PROMO_SEPHORA_SUN_SAFETY_2024",
        "campaign_name": "Sephora Sun Safety Event",
        "start_date": "2024-04-01",
        "end_date": "2024-04-21",
        "discount_pct": 15,
        "discount_type": "percentage",
        "duration_weeks": 3,
        "duration_months": 0.75,
        "eligible_tiers": ["ad_free"],
        "eligible_cohorts": ["prestige_loyalist", "value_seeker", "seasonal_first_time"],
        "eligible_channels": ["sephora", "paid_social", "email"],
        "exclusions": [],
        "roll_off_date": "2024-04-28",
        "roll_off_type": "soft",
        "roll_off_window_weeks": 1,
        "promo_code": "SUNSAFETY15",
        "attribution_window_days": 7,
        "target_adds": 8200,
        "actual_adds": 7850,
        "target_roi": 1.5,
        "actual_roi": 1.6,
        "marketing_spend_usd": 72000,
        "incremental_revenue_usd": 128000,
        "repeat_loss_expected": False,
        "repeat_loss_lag_weeks": 0,
        "notes": "Sephora prestige sun care event; moderate discount to protect margin while capturing spring demand.",
        "campaign_tags": ["sephora", "prestige", "sun-care", "spring"],
        "success_criteria": {"adds_min": 7500, "repeat_loss_rate_max": 0.16, "payback_months_max": 8, "ltv_cac_ratio_min": 2.0},
        "actual_performance": {"adds_achieved": 7850, "repeat_loss_rate_at_8mo": 0.11, "payback_months": 6.2, "ltv_cac_ratio": 2.1}
    },
    "PROMO_ULTA_21_DAYS_SUNCARE_2024": {
        "promo_id": "PROMO_ULTA_21_DAYS_SUNCARE_2024",
        "campaign_name": "Ulta 21 Days of Beauty – Sun Care Spotlight",
        "start_date": "2024-05-05",
        "end_date": "2024-05-25",
        "discount_pct": 20,
        "discount_type": "percentage",
        "duration_weeks": 3,
        "duration_months": 0.75,
        "eligible_tiers": ["ad_free"],
        "eligible_cohorts": ["value_seeker", "deal_hunter", "seasonal_first_time"],
        "eligible_channels": ["ulta", "paid_social", "display"],
        "exclusions": [],
        "roll_off_date": "2024-06-01",
        "roll_off_type": "soft",
        "roll_off_window_weeks": 1,
        "promo_code": "ULTA21SUN",
        "attribution_window_days": 7,
        "target_adds": 9500,
        "actual_adds": 9120,
        "target_roi": 1.4,
        "actual_roi": 1.45,
        "marketing_spend_usd": 85000,
        "incremental_revenue_usd": 138000,
        "repeat_loss_expected": True,
        "repeat_loss_lag_weeks": 5,
        "notes": "Ulta 21 Days style; sun care featured day. Balance volume with repeat-loss risk post roll-off.",
        "campaign_tags": ["ulta", "21-days", "sun-care", "spring"],
        "success_criteria": {"adds_min": 8500, "repeat_loss_rate_max": 0.20, "payback_months_max": 9, "ltv_cac_ratio_min": 1.8},
        "actual_performance": {"adds_achieved": 9120, "repeat_loss_rate_at_6mo": 0.17, "payback_months": 7.5, "ltv_cac_ratio": 1.9}
    },
    "PROMO_TARGET_CIRCLE_SUNCARE_2024": {
        "promo_id": "PROMO_TARGET_CIRCLE_SUNCARE_2024",
        "campaign_name": "Target Circle Week – Sun Care",
        "start_date": "2024-06-10",
        "end_date": "2024-06-23",
        "discount_pct": 25,
        "discount_type": "percentage",
        "duration_weeks": 2,
        "duration_months": 0.5,
        "eligible_tiers": ["ad_supported"],
        "eligible_cohorts": ["value_seeker", "deal_hunter", "promo_triggered"],
        "eligible_channels": ["target", "paid_search", "display"],
        "exclusions": [],
        "roll_off_date": "2024-06-30",
        "roll_off_type": "hard",
        "roll_off_window_weeks": 1,
        "promo_code": "CIRCLE25",
        "attribution_window_days": 7,
        "target_adds": 11000,
        "actual_adds": 10850,
        "target_roi": 1.35,
        "actual_roi": 1.4,
        "marketing_spend_usd": 92000,
        "incremental_revenue_usd": 152000,
        "repeat_loss_expected": True,
        "repeat_loss_lag_weeks": 6,
        "notes": "Target Circle seasonal sun care; mass channel elastic—deeper promo to win volume vs competitors.",
        "campaign_tags": ["target", "circle", "mass", "sun-care", "summer"],
        "success_criteria": {"adds_min": 10000, "repeat_loss_rate_max": 0.22, "payback_months_max": 9, "ltv_cac_ratio_min": 1.7},
        "actual_performance": {"adds_achieved": 10850, "repeat_loss_rate_at_6mo": 0.19, "payback_months": 8.0, "ltv_cac_ratio": 1.85}
    },
    "PROMO_AMAZON_PRIME_DAY_SUN_2024": {
        "promo_id": "PROMO_AMAZON_PRIME_DAY_SUN_2024",
        "campaign_name": "Amazon Prime Day – Sun Care Lightning Deal",
        "start_date": "2024-07-16",
        "end_date": "2024-07-17",
        "discount_pct": 30,
        "discount_type": "percentage",
        "duration_weeks": 0.3,
        "duration_months": 0.08,
        "eligible_tiers": ["ad_supported"],
        "eligible_cohorts": ["deal_hunter", "promo_triggered", "value_seeker"],
        "eligible_channels": ["amazon", "paid_search", "amazon_ads"],
        "exclusions": [],
        "roll_off_date": "2024-07-18",
        "roll_off_type": "hard",
        "roll_off_window_weeks": 0,
        "promo_code": "PRIMEDAY30",
        "attribution_window_days": 7,
        "target_adds": 14000,
        "actual_adds": 15200,
        "target_roi": 1.25,
        "actual_roi": 1.32,
        "marketing_spend_usd": 78000,
        "incremental_revenue_usd": 118000,
        "repeat_loss_expected": True,
        "repeat_loss_lag_weeks": 8,
        "notes": "Prime Day volume play on Amazon; defend share vs competitor drops. Elastic channel—deeper discount for spike.",
        "campaign_tags": ["amazon", "prime-day", "mass", "defensive", "summer"],
        "success_criteria": {"adds_min": 12000, "repeat_loss_rate_max": 0.24, "payback_months_max": 10, "ltv_cac_ratio_min": 1.5},
        "actual_performance": {"adds_achieved": 15200, "repeat_loss_rate_at_6mo": 0.21, "payback_months": 8.5, "ltv_cac_ratio": 1.65}
    },
    "PROMO_DTC_UNSEEN_BUNDLE_2024": {
        "promo_id": "PROMO_DTC_UNSEEN_BUNDLE_2024",
        "campaign_name": "DTC Unseen Summer Bundle + GWP",
        "start_date": "2024-07-01",
        "end_date": "2024-07-31",
        "discount_pct": 10,
        "discount_type": "percentage",
        "duration_weeks": 4,
        "duration_months": 1,
        "eligible_tiers": ["ad_free"],
        "eligible_cohorts": ["prestige_loyalist", "value_seeker", "seasonal_first_time"],
        "eligible_channels": ["dtc", "email", "paid_social"],
        "exclusions": [],
        "roll_off_date": "2024-08-07",
        "roll_off_type": "soft",
        "roll_off_window_weeks": 1,
        "promo_code": "UNSEEN10",
        "attribution_window_days": 14,
        "target_adds": 6500,
        "actual_adds": 6820,
        "target_roi": 1.8,
        "actual_roi": 1.9,
        "marketing_spend_usd": 42000,
        "incremental_revenue_usd": 95000,
        "repeat_loss_expected": False,
        "repeat_loss_lag_weeks": 0,
        "notes": "DTC hero bundle (Unseen + minis) with gift-with-purchase; lighter discount to protect margin and full-price conversion.",
        "campaign_tags": ["dtc", "bundle", "gwp", "unseen", "summer"],
        "success_criteria": {"adds_min": 6000, "repeat_loss_rate_max": 0.14, "payback_months_max": 7, "ltv_cac_ratio_min": 2.2},
        "actual_performance": {"adds_achieved": 6820, "repeat_loss_rate_at_8mo": 0.10, "payback_months": 5.8, "ltv_cac_ratio": 2.4}
    },
    "PROMO_LATE_SEASON_CLEARANCE_2024": {
        "promo_id": "PROMO_LATE_SEASON_CLEARANCE_2024",
        "campaign_name": "Late Season Clearance – All Channel",
        "start_date": "2024-08-15",
        "end_date": "2024-09-15",
        "discount_pct": 35,
        "discount_type": "percentage",
        "duration_weeks": 4,
        "duration_months": 1,
        "eligible_tiers": ["ad_supported", "ad_free"],
        "eligible_cohorts": ["deal_hunter", "at_risk", "value_seeker"],
        "eligible_channels": ["target", "amazon", "ulta", "email"],
        "exclusions": ["prestige_loyalist"],
        "roll_off_date": "2024-09-22",
        "roll_off_type": "hard",
        "roll_off_window_weeks": 1,
        "promo_code": "CLEAR35",
        "attribution_window_days": 7,
        "target_adds": 8000,
        "actual_adds": 7650,
        "target_roi": 1.15,
        "actual_roi": 1.18,
        "marketing_spend_usd": 58000,
        "incremental_revenue_usd": 82000,
        "repeat_loss_expected": True,
        "repeat_loss_lag_weeks": 4,
        "notes": "End-of-season sell-through before markdown; maximize revenue before clearing inventory.",
        "campaign_tags": ["clearance", "late-season", "inventory", "all-channel"],
        "success_criteria": {"adds_min": 7000, "repeat_loss_rate_max": 0.26, "payback_months_max": 10, "ltv_cac_ratio_min": 1.5},
        "actual_performance": {"adds_achieved": 7650, "repeat_loss_rate_at_4mo": 0.22, "payback_months": 9.2, "ltv_cac_ratio": 1.58}
    }
}

write_json(f"{DATA_DIR}/promo_metadata.json", promo_metadata)

# ---------------------------------------------------------------------------
# validation_windows.json
# ---------------------------------------------------------------------------
validation_windows = {
    "clean_windows": [
        {
            "start_date": "2025-03-02",
            "end_date": "2025-04-05",
            "notes": "Baseline spring launch stability"
        },
        {
            "start_date": "2025-06-01",
            "end_date": "2025-07-06",
            "notes": "Mid-season steady demand"
        }
    ],
    "confounded_windows": [
        {
            "start_date": "2025-06-15",
            "end_date": "2025-07-20",
            "notes": "Competitive price drop period"
        }
    ]
}

write_json(f"{DATA_DIR}/validation_windows.json", validation_windows)

# ---------------------------------------------------------------------------
# metadata.json
# ---------------------------------------------------------------------------
metadata = {
    "customers.csv": "Customer-level records with channel group, region, and purchase behavior.",
    "channel_weekly.csv": "Weekly KPIs by channel group (mass vs prestige).",
    "season_calendar.csv": "Season phases, demand index, and inventory position.",
    "price_calendar.csv": "Promo cadence and effective price by channel group.",
    "market_signals.csv": "Competitor pricing and macro signals aligned to season.",
    "social_signals.csv": "Social listening proxy signals and influencer activity.",
    "retail_events.csv": "Retail events, competitive price moves, and markdown starts.",
    "segments.csv": "Behavioral segments mapped to channel group.",
    "segment_kpis.csv": "Segment KPIs (AOV, repeat loss, CAC, promo redemption)."
}

write_json(f"{DATA_DIR}/metadata.json", metadata)

print("Retail-native datasets generated.")
