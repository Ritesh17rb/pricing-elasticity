# Yum Brands Portfolio Plan

## Product Direction

The application should no longer behave like a single-brand Taco Bell menu simulator.

It now needs to answer portfolio questions:

- where Yum can safely take price by concept
- where value architecture must be protected
- which channels absorb price best
- where lost demand reroutes inside the portfolio
- which products add margin without damaging sales quality

That shift changes both the flow and the dataset.

## New Flow

### Step 1. Portfolio Baseline

Start from current state:

- portfolio sales
- orders
- average check
- digital mix
- latest-week brand cards
- top market-brand combinations

### Step 2. Portfolio Pricing Studio

Run a scenario by:

- brand
- market
- product
- channel
- scenario price
- promo support adjustment

Return:

- baseline vs scenario units, sales, and margin
- channel rerouting
- internal brand recapture
- narrative guidance

### Step 3. Data Explorer

Expose the generated portfolio datasets directly.

### Step 4. Commercial Context

Show active campaign pressure and promo depth so price is not read in isolation.

### Step 5. Consumer Missions

Group risk and opportunity by mission:

- solo value meal
- core meal
- family share
- snack and treat

### Step 6. Brand Comparison

Compare concepts on:

- sales
- order volume
- check architecture
- margin rate
- digital mix
- delivery mix

### Step 7. Acquisition Elasticity

Sweep price moves around the current scenario to show where traffic breaks first.

### Step 8. Retention Curve

Translate immediate unit pressure into a delayed retention-style demand curve.

### Step 9. Migration And Recapture

Separate:

- channel migration inside a brand
- brand migration inside the Yum portfolio

### Step 10. Executive Brief

Rank opportunities that improve margin while keeping revenue risk controlled.

## New Dataset Design

The core modeling grain is:

- `week_start x brand_id x market_id x product_id x channel_id`

Supporting dimensions:

- brand
- market
- network footprint
- channel architecture
- product ladder
- weekly calendar
- macro context
- promo calendar
- cross-brand transfer matrix

Derived summaries:

- portfolio weekly summary
- brand weekly summary
- market-brand weekly summary
- product weekly summary

## Why This Is Better

This structure matches the user request much more closely because Yum Brands is:

- not one business
- not one menu ladder
- not one elasticity curve
- not one channel mix

The updated app treats pricing as a portfolio architecture problem instead of a single-item Taco Bell demo.
