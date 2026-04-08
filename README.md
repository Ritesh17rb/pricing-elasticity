# Pizza Hut Pricing Elasticity Studio

Browser-based pricing strategy application rebuilt around a Pizza Hut-specific operating foundation and pricing workflow.

## Current Scope

- Single-brand build for Pizza Hut only
- Root experience aligned back to the original `pricingstudio` step flow
- Active shell and copy rebuilt for a Pizza Hut pricing workflow
- Modeled Pizza Hut operating foundation generated under `data/yum/`
- Pizza Hut-oriented top-level cohort, scenario, and analytics data under `data/`

## Application Flow

1. Current Business Overview
2. Data Foundation Explorer
3. Promotion Performance & Calendar
4. Customer Cohorts & Elasticity
5. Segment Elasticity Comparison
6. Traffic Acquisition Elasticity
7. Repeat-Visit Loss Elasticity
8. Order Channel Migration
9. AI Chat & Decision Support

## Data Foundation

Generated under `data/yum/processed/`:

- `brand_dim.csv`
- `market_dim.csv`
- `brand_market_network.csv`
- `channel_dim.csv`
- `brand_channel_dim.csv`
- `product_dim.csv`
- `calendar_week_dim.csv`
- `external_macro_monthly.csv`
- `promo_calendar.csv`
- `brand_market_product_channel_week_panel.csv`
- `brand_market_channel_week_panel.csv`
- `brand_week_summary.csv`
- `market_brand_week_summary.csv`
- `product_week_summary.csv`
- `data_quality_checks.csv`

## Generate The Data

```bash
python scripts/build_yum_foundation.py --skip-macro
```

This rebuilds the Pizza Hut operating foundation and refreshes the generated files under `data/yum/processed/`.

## Run The App

```bash
python -m http.server 8000
```

Then open `http://localhost:8000`.

## Notes

- The app uses modeled public-data foundations, not internal Pizza Hut transaction history.
- The generated Pizza Hut foundation is the source of truth for the current-business, pricing-studio, and promotion-calendar layers.
- `plan.md` documents the full Pizza Hut rebuild plan, dataset strategy, and implementation phases.
