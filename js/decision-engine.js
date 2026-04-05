/**
 * Decision Engine Module
 * Auto-ranks pricing scenarios and provides intelligent recommendations
 * RFP-aligned: Slide 18 compliance (ranked option sets)
 */

/**
 * Rank scenarios by selected objective
 * @param {Array} scenarios - Array of simulated scenario results
 * @param {string} objective - Objective lens (growth-max, revenue-max, churn-capped, mix-targeted)
 * @param {Object} constraints - Optional constraints (repeat_loss_cap, revenue_floor, adfree_share_target)
 * @returns {Array} - Top 3 ranked scenarios with scores and rationale
 */
export function rankScenarios(scenarios, objective = 'revenue-max', constraints = {}) {
  if (!scenarios || scenarios.length === 0) {
    return [];
  }

  // Score each scenario based on objective
  const scoredScenarios = scenarios.map(scenario => {
    const score = calculateObjectiveScore(scenario, objective, constraints);
    const risk = calculateRiskLevel(scenario);
    const passesConstraints = validateConstraints(scenario, constraints);

    return {
      ...scenario,
      decision_score: score,
      risk_level: risk,
      passes_constraints: passesConstraints,
      objective: objective
    };
  });

  // Sort by score (descending) and filter by constraints
  const validScenarios = scoredScenarios.filter(s => s.passes_constraints);
  const rankedScenarios = validScenarios.sort((a, b) => b.decision_score - a.decision_score);

  // Generate "Why it Wins" rationale for top 3
  const top3 = rankedScenarios.slice(0, 3).map((scenario, index) => ({
    ...scenario,
    rank: index + 1,
    rationale: generateRationale(scenario, objective, index === 0)
  }));

  return top3;
}

/**
 * Calculate objective score based on selected lens
 */
function calculateObjectiveScore(scenario, objective, constraints) {
  const delta = scenario.delta || {};
  const forecasted = scenario.forecasted || {};

  switch (objective) {
    case 'growth-max':
      // Maximize customer growth
      const subGrowth = delta.customers_pct || 0;
      const revenueGrowth = delta.revenue_pct || 0;
      const churnPenalty = Math.abs(delta.repeat_loss_rate || 0) * 50; // Penalize high repeat loss
      return (subGrowth * 2) + revenueGrowth - churnPenalty;

    case 'revenue-max':
      // Maximize revenue with acceptable repeat loss
      const revGrowth = delta.revenue_pct || 0;
      const aovGrowth = delta.aov_pct || 0;
      const churnImpact = (delta.repeat_loss_rate || 0) * 100;
      return (revGrowth * 2) + aovGrowth - (churnImpact * 2);

    case 'churn-capped':
      // Minimize repeat loss while maintaining revenue
      const churnDelta = delta.repeat_loss_rate || 0;
      const churnCap = constraints.repeat_loss_cap || 0.05;
      if (churnDelta > churnCap) {
        return -1000; // Fails constraint
      }
      const revMaintain = delta.revenue_pct || 0;
      return -churnDelta * 100 + revMaintain;

    case 'mix-targeted':
      // Optimize tier mix (Ad-Free share growth)
      const adFreeMix = forecasted.ad_free_share || 0;
      const mixTarget = constraints.adfree_share_target || 0.5;
      const mixDelta = Math.abs(adFreeMix - mixTarget);
      const aovBonus = (delta.aov_pct || 0) * 0.5;
      return (100 - mixDelta * 100) + aovBonus;

    default:
      return delta.revenue_pct || 0;
  }
}

/**
 * Calculate risk level (Low/Med/High)
 */
function calculateRiskLevel(scenario) {
  const delta = scenario.delta || {};

  // Risk factors
  const churnRisk = Math.abs(delta.repeat_loss_rate || 0);
  const subDecline = (delta.customers_pct || 0) < -5;
  const revenueDecline = (delta.revenue_pct || 0) < -10;
  const isNewTier = scenario.is_new_tier || false;

  let riskScore = 0;
  if (churnRisk > 0.05) riskScore += 2;
  else if (churnRisk > 0.03) riskScore += 1;

  if (subDecline) riskScore += 2;
  if (revenueDecline) riskScore += 3;
  if (isNewTier) riskScore += 1;

  if (riskScore >= 4) return 'High';
  if (riskScore >= 2) return 'Med';
  return 'Low';
}

/**
 * Validate constraints
 */
function validateConstraints(scenario, constraints) {
  const delta = scenario.delta || {};
  const forecasted = scenario.forecasted || {};

  // Check churn cap
  if (constraints.repeat_loss_cap && delta.repeat_loss_rate > constraints.repeat_loss_cap) {
    return false;
  }

  // Check revenue floor
  if (constraints.revenue_floor && forecasted.revenue < constraints.revenue_floor) {
    return false;
  }

  // Check customer floor
  if (constraints.customer_floor && forecasted.activeCustomers < constraints.customer_floor) {
    return false;
  }

  return true;
}

/**
 * Generate "Why it Wins" rationale
 */
function generateRationale(scenario, objective, isTop) {
  const delta = scenario.delta || {};
  const config = scenario.scenario_config || {};

  const revChange = delta.revenue_pct || 0;
  const subChange = scenario.delta.customers_pct || 0;
  const churnChange = delta.repeat_loss_rate || 0;
  const aovChange = delta.aov_pct || 0;

  let rationale = [];

  // Opening statement
  if (isTop) {
    rationale.push('🏆 <strong>Recommended Option</strong>');
  }

  // Objective-specific highlights
  switch (objective) {
    case 'growth-max':
      if (subChange > 0) {
        rationale.push(`✓ Grows customers by ${Math.abs(subChange).toFixed(1)}%`);
      }
      if (revChange > 0) {
        rationale.push(`✓ Increases revenue by ${revChange.toFixed(1)}%`);
      }
      if (churnChange < 0.02) {
        rationale.push(`✓ Minimal repeat-loss impact (+${(churnChange * 100).toFixed(2)}pp)`);
      }
      break;

    case 'revenue-max':
      if (revChange > 0) {
        rationale.push(`✓ Maximizes revenue (+${revChange.toFixed(1)}%)`);
      }
      if (aovChange > 0) {
        rationale.push(`✓ Boosts AOV by ${aovChange.toFixed(1)}%`);
      }
      if (churnChange <= 0.03) {
        rationale.push(`✓ Repeat loss remains within acceptable range`);
      } else {
        rationale.push(`⚠ Higher repeat-loss risk (+${(churnChange * 100).toFixed(2)}pp)`);
      }
      break;

    case 'churn-capped':
      if (churnChange < 0) {
        rationale.push(`✓ Reduces repeat loss by ${Math.abs(churnChange * 100).toFixed(2)}pp`);
      } else {
        rationale.push(`✓ Keeps repeat loss below cap (+${(churnChange * 100).toFixed(2)}pp)`);
      }
      if (revChange >= 0) {
        rationale.push(`✓ Maintains revenue (+${revChange.toFixed(1)}%)`);
      }
      break;

    case 'mix-targeted':
      const adFreeShare = scenario.forecasted?.ad_free_share || 0;
      rationale.push(`✓ Prestige share: ${(adFreeShare * 100).toFixed(1)}%`);
      if (aovChange > 0) {
        rationale.push(`✓ Higher AOV (+${aovChange.toFixed(1)}%)`);
      }
      break;
  }

  // Risk assessment
  const risk = scenario.risk_level;
  if (risk === 'Low') {
    rationale.push(`✓ Low risk profile`);
  } else if (risk === 'Med') {
    rationale.push(`⚠ Medium risk - monitor closely`);
  } else {
    rationale.push(`⚠ High risk - requires mitigation plan`);
  }

  // Scenario-specific notes
  if (config.promotional_status) {
    rationale.push(`ℹ️ Includes promotional offer`);
  }
  if (scenario.is_new_tier) {
    rationale.push(`ℹ️ Introduces new tier: ${config.tier}`);
  }

  return rationale.join('<br>');
}

/**
 * Get objective display name
 */
export function getObjectiveDisplayName(objective) {
  const names = {
    'growth-max': 'Growth Maximization',
    'revenue-max': 'Revenue Maximization',
    'churn-capped': 'Repeat-Loss Capped (Retention Focus)',
    'mix-targeted': 'Mix-Shift (Channel Optimization)'
  };
  return names[objective] || objective;
}

/**
 * Get objective description
 */
export function getObjectiveDescription(objective) {
  const descriptions = {
    'growth-max': 'Prioritizes customer growth while maintaining revenue health',
    'revenue-max': 'Maximizes revenue and AOV with acceptable repeat loss levels',
    'churn-capped': 'Protects retention by capping repeat loss at acceptable threshold',
    'mix-targeted': 'Optimizes channel mix to increase prestige share and AOV'
  };
  return descriptions[objective] || '';
}

/**
 * Suggest objective based on current business context
 */
export function suggestObjective(scenarios, currentMetrics) {
  // Simple heuristic - can be enhanced with ML in future
  const avgChurn = currentMetrics?.repeat_loss_rate || 0.04;
  const avgRevGrowth = currentMetrics?.revenue_growth || 0;

  if (avgChurn > 0.06) {
    return 'churn-capped'; // High repeat loss - focus on retention
  } else if (avgRevGrowth < 0) {
    return 'revenue-max'; // Negative growth - focus on revenue
  } else if (currentMetrics?.customer_growth < 0) {
    return 'growth-max'; // Customer decline - focus on acquisition
  } else {
    return 'revenue-max'; // Default to revenue optimization
  }
}
