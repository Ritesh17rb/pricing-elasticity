# Yum Brands Portfolio Elasticity Command Center

Browser-based pricing strategy application rebuilt around the Yum Brands portfolio rather than a single Taco Bell use case.

## What Changed

- Replaced the Taco Bell-only workflow with a 10-step Yum Brands portfolio flow
- Rebuilt the dataset from scratch at `week_start x brand_id x market_id x product_id x channel_id`
- Added multi-brand coverage for KFC, Taco Bell, Pizza Hut, and Habit Burger & Grill
- Upgraded the scenario engine to account for channel shift, promo support, and internal portfolio recapture
- Deleted the legacy top-level datasets and regenerated the foundation under `data/yum/`

## New Application Flow

1. Portfolio Baseline
2. Portfolio Pricing Studio
3. Data Explorer
4. Commercial Context
5. Consumer Missions
6. Brand Comparison
7. Acquisition Elasticity
8. Retention Curve
9. Migration And Recapture
10. Executive Brief

## Core Datasets

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
- `cross_brand_transfer_matrix.csv`
- `brand_market_product_channel_week_panel.csv`
- `brand_market_channel_week_panel.csv`
- `portfolio_week_summary.csv`
- `brand_week_summary.csv`
- `market_brand_week_summary.csv`
- `product_week_summary.csv`
- `data_quality_checks.csv`

## Generate The Data

```bash
python scripts/build_yum_foundation.py --skip-macro
```

The build clears old files in `data/yum/processed/` before writing the new portfolio foundation.

## Run The App

```bash
python -m http.server 8000
```

Then open `http://localhost:8000`.

## Notes

- The foundation is a modeled public-data portfolio dataset, not internal transaction history.
- The scenario engine is designed for strategic portfolio pricing and architecture work, not exact POS forecasting.
- `data/yum/manifest.json`, `data/yum/metadata.json`, and `data/yum/qa_report.json` describe the generated build.
