# Yum Brands Price Elasticity Plan

## Goal

Translate Ritesh Aggarwal's feedback from `meeting.md` into a concrete plan for the Yum Brands price elasticity demo.

## Working Assumption

The transcript mixes feedback on the Supergoop flow with the Yum Brands demo. The key bridge is that Ritesh Kumar says the Yum Brands version is "quite similar" and that he needs to incorporate the same changes there. This plan therefore treats the detailed screen-level feedback as requirements for the Yum Brands experience as well.

## What Ritesh Is Asking For

### 1. Monday demo cut

- Remove Step 2 from the live demo for now.
- Get Step 7 working properly.
- Skip Steps 8 and 9 for the Monday presentation.
- Keep Step 10, but make the AI experience demo-ready with strong example prompts.
- Prepare a clean story/script so he can present it confidently.

### 2. Core Yum price elasticity story

- Start by showing the real data powering the analysis so the app does not feel like mocked HTML.
- Make the flow easier for a busy business user: summary first, actions second, evidence below.
- Bring elasticity earlier in the narrative because promotion impact depends on elasticity.
- Keep the experience focused on simple human decisions, not on making the user interpret many charts.

### 3. UX/content changes he explicitly called out

- Convert long AI summaries into bullet points.
- Add clear recommended next actions, not just observations.
- Base recommended actions on all charts together, not one isolated chart.
- Put actions near the top of the screen, directly under the business summary.
- Clarify whether an insight is for one product/channel or for all products.
- Fix metric inconsistencies across cards and summaries.
- Rename ambiguous labels like "price gap" to "competitor price gap".
- Show change versus prior period for the key metrics, not just current values.
- Add/keep context for price, competitor gap, and social buzz trends.
- Improve chart readability where the visuals are too dense or too small.

### 4. Longer-term asks beyond Monday

- Add a longer-term pricing layer for sticky price moves over 3 to 6 months.
- Keep promotion as the short-term lever and price as the slower strategic lever.
- Bring AI chat onto each screen, instead of forcing all questions to wait until the last screen.

## Current Repo Mapping

The current app already uses the same step numbering Ritesh referenced:

- Step 2: Yum Pricing Studio
- Step 7: Traffic Acquisition Elasticity
- Step 8: Repeat-Visit Loss Elasticity
- Step 9: Order Channel Migration
- Step 10: AI Chat & Advanced Analytics

Primary files likely affected:

- `index.html`
- `js/step-navigation.js`
- `js/acquisition-simple.js`
- `js/chat.js`
- `docs/script.md`

## Recommended Execution Plan

### Phase 1. Simplify the Monday demo flow

- Remove Step 2 from the visible navigation and demo script.
- Hide or bypass Steps 8 and 9 for the Monday build.
- Keep the path focused on:
  - current business overview
  - data credibility / actual tables
  - elasticity / segment insight
  - AI chat
- Update the walkthrough script to match the reduced flow.

### Phase 2. Stabilize Step 7 first

- Make Step 7 the centerpiece of the elasticity story.
- Ensure it clearly shows segment/cohort differences and business impact.
- Add a simple business readout such as:
  - what changed
  - which segment/channel is most sensitive
  - expected order or revenue uplift/downside
- Verify that the step works end-to-end with Yum data.

Known blocker in current code:

- `js/acquisition-simple.js` returns `orderedChannels: tacoBellChannels`, but `tacoBellChannels` is not defined. Step 7 should be treated as unstable until that is fixed.

### Phase 3. Rework the screen narrative around trust and action

- Put the data foundation earlier and make it obvious what tables power the outputs.
- Keep the top of the screen lightweight:
  - AI-generated business summary
  - recommended next actions
- Move detailed charts and issue lists below that summary/action block.
- Make the "why" available underneath for trust-building, but not required for the first read.

### Phase 4. Make the metrics interpretable

- Add prior-period deltas for:
  - revenue
  - average price
  - competitor price gap
  - social buzz / sentiment
- Clarify metric definitions inline.
- Ensure summary text matches the chart values and card values exactly.
- Call out whether an insight is scoped to a single product/channel or rolled up across all products.

### Phase 5. Improve AI demo quality

- Seed Step 10 with stronger suggested prompts tied to the Yum story.
- Make the AI answer from the same surfaced dataset and scenario context shown in the UI.
- If feasible after Monday, expose chat entry points on each major screen.

### Phase 6. Prepare the demo script

- Write a short presenter script focused on:
  - this is powered by real data
  - here is the current business situation
  - here is where elasticity risk/opportunity sits
  - here are the actions the user should take
  - here is how AI answers follow-up questions from the same data

## Proposed Order For The Yum Story

1. Current business overview
2. Data used for the analysis
3. Current elasticity / segment sensitivity
4. Historical promotion performance
5. Forward-looking optimization / scenario view
6. AI-assisted questioning

This reflects Ritesh's point that elasticity should appear before promotion optimization because elasticity is what makes promotion effects interpretable.

## Definition Of Done

- Monday demo uses a reduced flow aligned with Ritesh's requested step cuts.
- Step 7 works reliably and tells a clear elasticity story.
- Summary and recommended actions appear before dense detail.
- Data provenance is visible early in the experience.
- Labels and metrics are unambiguous and internally consistent.
- AI chat includes demo-ready prompts and answers.
- A presenter script exists alongside the updated build.
