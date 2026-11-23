# Mtoni simulation rules

This is a deterministic educational model, not a hydrological forecast. Scenario quantities are fictional water units and budget credits. `mtoni_v1.json` is a placeholder pending team review. A turn represents one week; turn numbers and the inflow schedule are one-based, while a new session starts at turn 0.

## Turn calculation

For action submission at turn `t`, validate without mutating the input, then compute turn `n = t + 1` in this order:

1. Charge the configured action cost. Reject before any state change if the action is unknown, parameters do not match its schema, prerequisites fail, a one-time action has already been used, or the budget is insufficient.
2. Apply due scheduled effects for turn `n`, then apply immediate effects. Effects with a positive `delay_turns` are scheduled for `n + delay_turns`. Effects never create water.
3. Read the scenario inflow for turn `n`. Let `gross_water = opening_reservoir + inflow`; `overflow = max(0, gross_water - capacity)` and `available_water = gross_water - overflow`.
4. Actual leakage is `min(configured_leakage, available_water)`. Subtract it before allocating water to sectors.
5. Allocate the remaining water using the selected scenario policy. First reserve each critical sector's configured minimum service share (clinic and school). If there is not enough water to satisfy all critical minimums, divide the available critical water in proportion to their minimum requirements. Then distribute the remainder among every sector by the policy weights, iteratively capping each sector at its remaining demand. No sector receives more than its demand.
6. Record actual sector withdrawals and unmet demand (`demand - withdrawal`). Service level is `withdrawal / demand`, or `1.0` when demand is zero. Close the reservoir with `gross_water - overflow - actual_leakage - sum(withdrawals)`.
7. Set the new budget to `opening_budget - action_cost`. Clamp crop health and wellbeing to `[0, 100]` using the formulas below. Append the scripted event for turn `n`, if present.

Water accounting invariant (SIM-04):

```text
opening_reservoir + inflow
  = closing_reservoir + total_sector_withdrawals + actual_leakage + overflow
```

All terms are non-negative. The engine uses decimal-safe arithmetic internally; persisted JSON uses ordinary JSON numbers. The invariant must hold within `1e-8` for each turn.

## Indicator updates

Let `service(sector)` be the just-calculated service share, in `[0, 1]`:

```text
crop_health' = clamp(crop_health + round(10 * (service(farms) - 0.7)), 0, 100)
wellbeing'   = clamp(wellbeing + round(6 * (service(households) - 0.7)
                                    + 8 * (service(clinic) - 0.7)), 0, 100)
```

The irrigation action changes farm demand after its configured delay. The crop-health formula then reflects whether the resulting farm service is sufficient. No AI output participates in any numeric calculation.

## Allocation policies

The scenario configures `balanced`, `household_focus`, and `farm_focus`. These are deterministic relative weights applied only after clinic/school minimum service has been reserved. All policies obey demand caps and the same accounting invariant. If a policy's weighted allocation reaches a sector's cap, the remaining water is redistributed among uncapped sectors until water or eligible demand is exhausted.

## Action timing

Action costs are charged when a decision is accepted. Pipe repair reduces leakage during the submitted turn. Allocation changes apply during the submitted turn. Storage changes capacity but does not add water. Conservation and efficient irrigation schedule their configured demand changes; with `delay_turns: 1`, they take effect on the turn after the submitted turn. One-time flags are stored in world state and enforced by the engine.

## Bounds and replay

The reservoir is always within `[0, capacity]`, budget never becomes negative, demand/leakage are non-negative, service shares are within `[0, 1]`, and crop health/wellbeing are within `[0, 100]`. The engine has no unseeded randomness. A replay creates a separate session from the same immutable scenario version and initial state; the source session is unchanged.
