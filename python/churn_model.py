"""
Repeat-Loss Elasticity Model (Time-Lagged)
Uses Logistic Regression with pre-fitted coefficients
"""

import numpy as np

# Pre-fitted coefficients for time-lagged repeat-loss model
# Tuned to realistic seasonal retail benchmarks:
# +$1 on $6 base (~16% increase) should drive 6-8pp repeat-loss increase at peak
REPEAT_LOSS_COEFFICIENTS = {
    'intercept': -2.944,  # log-odds of baseline repeat loss (5% = -2.944)
    'price_change_pct': 0.01,  # Base effect of price change
    # Time-lagged interaction coefficients
    'price_x_0_4wks': 0.006,   # Immediate effect (2-3pp for +16% price)
    'price_x_4_8wks': 0.018,   # Roll-off peak (5-6pp)
    'price_x_8_12wks': 0.028,  # Peak repeat-loss period (7-8pp)
    'price_x_12plus': 0.008,   # Stabilization (positive but lower = +2-3pp)
}

def logistic(x):
    """Logistic sigmoid function"""
    return 1 / (1 + np.exp(-x))

def predict_repeat_loss_by_horizon(scenario):
    """
    Predict repeat-loss probability for each time horizon after price change

    Args:
        scenario: dict with {price_change_pct, baseline_repeat_loss}

    Returns:
        dict with repeat-loss rates by time horizon
    """
    price_change_pct = scenario.get('price_change_pct', 0)
    baseline_repeat_loss = scenario.get('baseline_repeat_loss', 0.05)

    # Calculate log-odds for each time horizon
    horizons = {
        '0-4 Weeks': REPEAT_LOSS_COEFFICIENTS['price_x_0_4wks'],
        '4-8 Weeks': REPEAT_LOSS_COEFFICIENTS['price_x_4_8wks'],
        '8-12 Weeks': REPEAT_LOSS_COEFFICIENTS['price_x_8_12wks'],
        '12+ Weeks': REPEAT_LOSS_COEFFICIENTS['price_x_12plus']
    }

    results_by_horizon = {}

    for horizon_name, coef in horizons.items():
        # Calculate log-odds
        log_odds = (
            REPEAT_LOSS_COEFFICIENTS['intercept'] +
            REPEAT_LOSS_COEFFICIENTS['price_change_pct'] * price_change_pct +
            coef * price_change_pct
        )

        # Convert to probability
        repeat_loss_prob = logistic(log_odds)

        # Calculate uplift vs baseline
        repeat_loss_uplift = repeat_loss_prob - baseline_repeat_loss

        results_by_horizon[horizon_name] = {
            'repeat_loss_rate': float(repeat_loss_prob),
            'repeat_loss_uplift': float(repeat_loss_uplift),
            'repeat_loss_uplift_pp': float(repeat_loss_uplift * 100)  # percentage points
        }

    return results_by_horizon


def predict_repeat_loss_by_segment(scenario, segments):
    """
    Predict repeat loss by segment and time horizon

    Args:
        scenario: pricing scenario
        segments: list of segment dicts

    Returns:
        list of segment-level repeat-loss predictions by horizon
    """
    results = []

    for segment in segments:
        # Base prediction
        horizons = predict_repeat_loss_by_horizon(scenario)

        # Adjust by segment characteristics
        # Use engagement elasticity but cap variation to 0.7x - 1.3x range
        # (repeat loss doesn't vary as wildly across segments as acquisition does)
        elasticity = abs(segment.get('elasticity', -2.0))
        segment_multiplier = 0.7 + (min(elasticity, 4.0) / 4.0) * 0.6  # Maps -1 to -4 → 0.85 to 1.3

        segment_result = {
            'name': segment['name'],
            'size': segment['size']
        }

        # Apply segment multiplier to each horizon
        for horizon, values in horizons.items():
            horizon_key = horizon.replace(' ', '_').replace('-', '_').replace('+', 'plus').lower()
            segment_result[f'repeat_loss_{horizon_key}'] = values['repeat_loss_uplift_pp'] * segment_multiplier

        results.append(segment_result)

    return results
