# GainTrack Telemetry Usage Playbook

Turn telemetry into weekly product decisions instead of passive dashboards.

## Goal

Use existing telemetry to improve activation, retention, conversion, and app reliability with a fixed weekly operating loop.

## What To Measure Weekly

1. Activation rate
2. Week-1 retention
3. Paywall CTA rate
4. Purchase-from-CTA rate
5. Crash-free rate

## Operating Loop (Weekly)

1. Monday: Review the 5 core metrics.
2. Monday: Identify the single biggest bottleneck (largest drop or regression).
3. Tuesday: Define one focused experiment for that bottleneck.
4. Ship by end of week.
5. Next Monday: Compare before/after and keep, iterate, or revert.

## How To Use Existing Event Streams

### 1) Activation

- Use onboarding and first-workout telemetry.
- Key question: How many new users reach first meaningful value (first completed workout)?
- Action if weak: Reduce onboarding friction and shorten time-to-first-workout.

### 2) Retention

- Use engagement and workout activity telemetry.
- Key question: Do users return in week 1 and week 4?
- Action if weak: Prioritize habit loops (reminders, streak reinforcement, recap surfaces).

### 3) Monetization

- Use paywall events (`view`, `cta_click`, `purchase_completed`, `dismiss`).
- Key question: Where does the paywall funnel break?
- Action rules:
  - High views + low CTA: improve paywall copy, offer framing, and placement relevance.
  - High CTA + low purchase: investigate pricing friction or checkout flow issues.

### 4) Pro Feature Demand

- Use superset telemetry (attempt, blocked, paywall view, completion).
- Key question: Is demand high enough to justify additional Pro polishing?
- Action if strong blocked demand: Add contextual upsell at moment of intent and clarify Pro value.

### 5) Integration Roadmap

- Use health integration telemetry and readiness score.
- Key question: Is Strava/wearable scope justified now?
- Action if weak signal: defer and continue measurement; invest only after threshold is met.

### 6) Reliability

- Use crash telemetry by screen/platform/version.
- Key question: Which top crash signatures affect active users most?
- Action: Fix top 3 crash signatures every release cycle before net-new feature expansion.

## KPI Board Template

Track this table every week:

| KPI | Formula | Baseline | Current | Target | Owner | Status |
|---|---|---:|---:|---:|---|---|
| Activation rate | first_workout_completed_users / new_users |  |  |  |  |  |
| Week-1 retention | returning_users_day_7 / new_users |  |  |  |  |  |
| Paywall CTA rate | paywall_cta_clicks / paywall_views |  |  |  |  |  |
| Purchase from CTA | purchases / paywall_cta_clicks |  |  |  |  |  |
| Crash-free rate | 1 - (users_with_crash / active_users) |  |  |  |  |  |

## Decision Thresholds

Use these simple triggers to force action:

1. Activation drops by >= 10% week-over-week: focus only on onboarding and first-workout path.
2. Paywall CTA rate < 15% for 2 consecutive weeks: revise paywall placement and copy.
3. Purchase-from-CTA < 20% with stable CTA rate: audit checkout/pricing friction.
4. Crash-free rate < 99.5%: shift next sprint capacity to reliability fixes.
5. Superset blocked attempts are high but paywall conversion is low: redesign contextual Pro upsell moment.

## 30-Day Execution Plan

1. Week 1: Establish baseline values for the 5 core KPIs.
2. Week 2: Run activation-focused experiment (first-workout completion).
3. Week 3: Run monetization-focused experiment (paywall CTA lift).
4. Week 4: Run reliability-focused hardening sprint (top crashes).

## Reporting Format (Weekly Update)

Use this exact summary in team updates:

- Bottleneck KPI:
- Hypothesis:
- Change shipped:
- Result after 7 days:
- Decision (keep/iterate/revert):
- Next KPI focus:

## Guardrails

1. Do not track extra events unless they answer an active product question.
2. Keep one primary KPI owner per experiment.
3. Avoid running multiple major funnel experiments in the same week.
4. Prioritize reliability issues before conversion experiments if crash-free rate is below target.
