# Pizza Hut Pricing Studio Transformation Plan

## Objective

Turn the root `yumbrands` application into a Pizza Hut-specific pricing studio that visually follows the `pricingstudio` interaction model while removing streaming-era language from the live experience and replacing the current multi-brand foundation with a realistic Pizza Hut operating dataset.

## Product Direction

- Keep the overall visual shell, pacing, and progressive disclosure pattern close to `pricingstudio`.
- Make the business story specific to Pizza Hut rather than a multi-brand Yum command center.
- Treat the experience as a strategic pricing and promotion simulator for Pizza Hut U.S.
- Favor credible, public-data-style modeling over fake dashboards with unexplained numbers.

## Official-Source Grounding

The transformed app should be anchored to public Pizza Hut and Yum facts, then extended with transparent modeled assumptions.

### Facts to reflect in the build

- Pizza Hut should be framed as a delivery, carryout, and dine-in pizza brand.
- U.S. digital/app ordering should matter materially.
- The menu ladder should be built around recognizable Pizza Hut categories rather than generic restaurant placeholders.
- Family-share occasions and sports-night attach behavior should matter more than solo subscription-style retention logic.
- Yum affiliation should be acknowledged in metadata and documentation, but the active UI should be Pizza Hut-first.

### What will remain modeled

- Market-level demand volumes
- Channel-level order mix
- Price elasticities
- Promo lift curves
- Retention / repeat-visit sensitivity
- Product substitution and bundle tradeoffs
- Scenario outputs and executive recommendations

## Target Experience

The active root app should mirror the `pricingstudio` structure, but with Pizza Hut content.

### Home

- Pizza Hut pricing studio hero
- Clear business promise: price, promo, traffic, margin, and channel mix decisions
- No streaming, subscriber, ARPU, or tier language

### Step 1. Current Business Overview

- Pizza Hut operating snapshot
- Orders, net sales, average check, contribution margin
- Channel mix and promo dependency
- Pizza Hut-specific business summary

### Step 2. Data Explorer

- Public-data-style Pizza Hut foundation tables
- Clear data dictionary and provenance notes
- Explicit separation between official facts and modeled assumptions

### Step 3. Event / Promo Calendar

- Seasonal demand windows
- Sports and family-share demand pulses
- Pizza Hut deal cadence and campaign windows

### Step 4. Customer Cohorts

- Replace streaming cohorts with Pizza Hut buying missions:
  - value lunch seekers
  - family bundle loyalists
  - digital carryout regulars
  - delivery convenience users
  - premium crust upgraders
  - sports-night wing attachers
  - promo-only lapsers
  - high-value weekend hosts

### Step 5. Segment Elasticity Comparison

- Compare cohorts by price sensitivity, check, promo dependence, channel mix, and margin quality
- Explain where pricing headroom is real and where value optics must be protected

### Step 6. Traffic Acquisition Elasticity

- Replace “subscriber acquisition” framing with order traffic acquisition
- Evaluate price changes against order volume, net sales, and contribution margin
- Highlight mission/channel combinations where price can move without collapsing traffic

### Step 7. Repeat-Visit Loss

- Replace churn framing with repeat-visit loss / lapse risk
- Keep time-lag behavior if the chart remains useful, but rename it to restaurant language
- Make the output useful for price change rollouts after promotions

### Step 8. Channel Migration

- Replace tier migration with order-channel migration
- Focus on carryout, pickup/app, delivery, and dine-in shifts
- Show how price architecture pushes orders between channels and changes margin

### Step 9. AI Decision Support

- Pizza Hut-specific prompts
- No streaming prompts, no portfolio prompts, no Taco Bell defaults
- Summaries should reference Pizza Hut menu ladders, promo pressure, and channel mix

## Data Foundation Plan

## 1. Scope

- Replace the active multi-brand foundation with a Pizza Hut-only foundation for the root app.
- Keep the grain transparent and business-usable.
- Avoid synthetic noise without business meaning.

## 2. Grain

Primary panel:

- `week_start x market_id x channel_id x item_id`

Supporting rollups:

- weekly brand summary
- market summary
- channel summary
- item summary
- campaign calendar
- cohort summary
- substitution matrix

## 3. Pizza Hut entities

### Markets

Use a realistic U.S. market sample rather than all possible geographies.

- Los Angeles
- Dallas-Fort Worth
- Chicago
- Atlanta
- New York City
- Miami
- Phoenix
- Denver
- Seattle
- Nashville
- Minneapolis
- Charlotte

### Channels

- delivery
- carryout
- pickup_app
- dine_in

Drive-thru should not be active for Pizza Hut.

### Menu ladder

The product set should be recognizably Pizza Hut and easy to reason about:

- Personal Pan Pizza
- Medium One-Topping Pizza
- Large One-Topping Pizza
- Original Stuffed Crust / premium pizza ladder
- Melts
- Wings
- Breadsticks / cheese sticks style attach
- Big Dinner Box / family bundle
- Pasta / pasta bakes
- Dessert item

### Occasion groups

- solo value meal
- core meal
- family share
- sports / party occasion
- snack / attach

## 4. Metrics to generate

For each row:

- list price
- realized price
- promo depth
- unit volume
- gross sales
- net sales
- contribution margin percent
- contribution margin dollars
- elasticity prior
- effective elasticity
- digital affinity
- promo sensitivity
- quality / confidence score

Derived summaries:

- weekly orders
- weekly sales
- average check
- digital mix
- delivery mix
- promo-supported mix
- margin rate
- market price index
- attach rate

## 5. Cohort system

Replace all streaming cohorts with Pizza Hut-specific cohorts and coefficients.

Acquisition / traffic cohorts:

- family value loyalists
- app-first convenience seekers
- weeknight dinner planners
- lunch solo savers
- premium pizza occasion buyers
- game-day shareable shoppers
- discount-driven returners
- low-frequency high-ticket hosts

Retention / repeat-loss cohorts:

- promo-conditioned
- convenience anchored
- value anchored
- premium loyal
- lapse-prone
- family ritual

Channel migration cohorts:

- delivery default
- carryout optimizers
- digital pickup switchers
- dine-in social users

## 6. Scenario library

Prebuilt scenarios should be Pizza Hut-specific:

- measured carryout price increase
- premium crust price step-up
- value lunch protection
- delivery fee / premium pressure test
- wing attach promotion
- family bundle reprice
- digital pickup incentive
- broad list-price increase with retention guardrail

## 7. Modeling rules

- Delivery should carry the highest check and the lowest margin rate.
- Pickup/app should have better margin than delivery and strong digital adoption.
- Carryout should be price-competitive and important to value perception.
- Dine-in should be smaller in mix but not zero.
- Family bundles should have lower elasticity than solo items.
- Premium crust items should have stronger check but lower traffic elasticity tolerance.
- Attach items should improve order economics more than traffic growth.
- Promo depth should temporarily increase units while compressing margin.

## Implementation Plan

## Phase 1. Planning and file ownership

Files to update first:

- `plan.md`
- `README.md`
- `scripts/build_yum_foundation.py` or replacement generator
- `js/yum-data-loader.js`
- `js/yum-brand-utils.js`
- `js/app.js`
- `js/acquisition-simple.js`
- `js/churn-simple.js`
- `js/migration-simple.js`
- `js/step-navigation.js`
- `index.html`

## Phase 2. Build the Pizza Hut foundation

- Refactor the generator into a Pizza Hut-focused build path.
- Remove Taco Bell-first defaults.
- Reduce brand metadata to Pizza Hut only for the active root app.
- Regenerate processed CSVs and JSON metadata.
- Validate row counts, null checks, and field consistency.

## Phase 3. Rewire the app to Pizza Hut

- Make Pizza Hut the default and only active brand.
- Remove brand picker dependencies from the active flow where possible.
- Update loaders to read the Pizza Hut-focused data contract.
- Ensure charts and KPI cards use Pizza Hut field names.

## Phase 4. Replace the shell content

- Make the root `index.html` follow the `pricingstudio` section order and language style.
- Replace every user-facing Yum portfolio description with Pizza Hut business framing.
- Keep the same quality bar for navigation, hero, cards, and chart sections.

## Phase 5. Scrub streaming remnants

Active files must not expose:

- streaming
- subscriber / subscribers
- churn in streaming context
- ARPU
- SVOD / OTT
- content release calendar
- Ad-Lite / Ad-Free tier copy
- Netflix / Hulu / Disney references

If a reused technical module still uses legacy internal variable names, the user-facing text must still be corrected. If the module remains central to the active app, the variable names and comments should also be cleaned.

## Phase 6. Documentation refresh

- Rewrite the repo summary around Pizza Hut pricing strategy
- Explain what is official vs modeled
- Document dataset grain and scenario logic
- Remove obsolete streaming and portfolio claims from the root docs

## QA and Verification

## Functional checks

- root app loads without broken imports
- Pizza Hut data appears in KPI cards
- scenario modules use Pizza Hut copy
- step navigation still works
- no empty chart containers on first render

## Content checks

- no visible streaming words in the live root app
- no Taco Bell-first defaults in the live root app
- no multi-brand portfolio story in the active root flow unless explicitly framed as Yum ownership context

## Data checks

- metadata matches generated files
- processed files are internally consistent
- market, item, and channel counts match the Pizza Hut scope
- scenario inputs fall within realistic ranges

## Definition of done

- The root app looks and feels like the `pricingstudio` experience.
- The active business story is Pizza Hut-specific.
- The live data foundation is Pizza Hut-focused and realistically modeled.
- Official-source facts are reflected where appropriate.
- The active root code path is free of streaming copy and Taco Bell-first defaults.
