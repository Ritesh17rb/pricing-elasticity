/**
 * Scenario Engine Module
 * Simulate pricing scenarios and forecast KPIs
 *
 * Dependencies: elasticity-model.js, data-loader.js, pyodide-bridge.js
 */

import {
  forecastDemand,
  forecastChurn,
  forecastAcquisition,
  calculateElasticity
} from './elasticity-model.js';

import { getWeeklyData, getCurrentPrices, loadElasticityParams } from './data-loader.js';

import { pyodideBridge } from './pyodide-bridge.js';

/**
 * Simulate a pricing scenario
 * @param {Object} scenario - Scenario configuration
 * @param {Object} options - Additional options {timeHorizon, startDate}
 * @returns {Promise<Object>} Simulation results
 */
export async function simulateScenario(scenario, options = {}) {
  // Handle baseline "Do Nothing" scenario (tier="all")
  if (scenario.config.tier === 'all') {
    console.log('Baseline scenario detected - returning current state');
    return await simulateBaselineScenario(scenario, options);
  }

  // Check if this is a segment-targeted scenario
  if (options.targetSegment && options.targetSegment !== 'all') {
    console.log('Delegating to segment-targeted simulation');
    return simulateSegmentScenario(scenario, options);
  }

  const timeHorizon = options.timeHorizon || 'medium_term_3_12mo';

  try {
    console.log('Simulating scenario:', scenario.id, 'for tier:', scenario.config.tier);

    // Map new/hypothetical tiers to proxy tiers for baseline data
    const tierMap = {
      'basic': 'ad_supported',  // Basic tier uses ad_supported as proxy
      'premium': 'ad_free',      // Premium tier uses ad_free as proxy
      'bundle': 'ad_free'        // Bundle uses ad_free (already handled)
    };

    const baselineTier = tierMap[scenario.config.tier] || scenario.config.tier;
    // Only "basic" and "premium" are truly new tiers; "bundle" is just a pricing variation of ad_free
    const isNewTier = (scenario.config.tier === 'basic' || scenario.config.tier === 'premium');

    if (tierMap[scenario.config.tier] && isNewTier) {
      console.log(`⚠️ New tier "${scenario.config.tier}" - using "${baselineTier}" as baseline proxy`);
    }

    // Get baseline data (pass scenario for bundle handling)
    const baseline = await getBaselineMetrics(baselineTier, scenario);
    console.log('Baseline metrics retrieved:', baseline);

    // Calculate elasticity for this scenario (use baseline tier for new tiers)
    const elasticityInfo = await calculateElasticity(
      baselineTier,
      null,
      { timeHorizon }
    );

    // Calculate price change percentage
    const priceChangePct = (scenario.config.new_price - scenario.config.current_price) / scenario.config.current_price;

    // Forecast demand
    const demandForecast = forecastDemand(
      scenario.config.current_price,
      scenario.config.new_price,
      baseline.activeCustomers,
      elasticityInfo.elasticity
    );

    // Forecast churn
    const churnForecast = await forecastChurn(
      scenario.config.tier,
      priceChangePct,
      baseline.repeatLossRate
    );

    // Forecast acquisition
    const acquisitionForecast = await forecastAcquisition(
      scenario.config.tier,
      priceChangePct,
      baseline.newCustomers
    );

    console.log('📊 Acquisition Forecast:', {
      tier: scenario.config.tier,
      baseline: baseline.newCustomers,
      forecasted: acquisitionForecast.forecastedAcquisition,
      change: acquisitionForecast.change,
      changePercent: acquisitionForecast.changePercent
    });

    // Calculate revenue impact
    const revenueImpact = calculateRevenueImpact(
      demandForecast.forecastedCustomers,
      scenario.config.new_price,
      baseline.activeCustomers,
      scenario.config.current_price
    );

    // Calculate AOV
    const forecastedAOV = scenario.config.new_price;
    const aovChange = forecastedAOV - baseline.aov;

    // Calculate AOV percentage change, handling zero baseline
    let aovChangePct = 0;
    if (baseline.aov > 0) {
      aovChangePct = (aovChange / baseline.aov) * 100;
    } else if (aovChange !== 0) {
      // If baseline AOV is 0 but there's a change, use a very large number to indicate significant change
      aovChangePct = aovChange > 0 ? 100 : -100;
    }

    // Estimate CLTV (simplified: AOV × average lifetime months)
    const avgLifetimeMonths = 24; // Assumption
    const forecastedCLTV = forecastedAOV * avgLifetimeMonths;
    const baselineCLTV = baseline.aov * avgLifetimeMonths;

    // Calculate net adds (new acquisitions - churn)
    const forecastedRepeatLossCount = Math.round(demandForecast.forecastedCustomers * churnForecast.forecastedRepeatLoss);
    const forecastedNetAdds = acquisitionForecast.forecastedAcquisition - forecastedRepeatLossCount;
    const baselineNetAdds = baseline.newCustomers - Math.round(baseline.activeCustomers * baseline.repeatLossRate);

    // Generate time series forecast (12 months)
    const timeSeries = generateTimeSeries(
      demandForecast,
      churnForecast,
      acquisitionForecast,
      scenario.config.new_price,
      12
    );

    // Compile results
    const result = {
      scenario_id: scenario.id,
      scenario_name: scenario.name,
      model_type: scenario.model_type,
      elasticity: elasticityInfo.elasticity,
      confidence_interval: elasticityInfo.confidenceInterval,

      baseline: {
        customers: baseline.activeCustomers,
        repeat_loss_rate: baseline.repeatLossRate,
        new_customers: baseline.newCustomers,
        revenue: baseline.revenue,
        aov: baseline.aov,
        cltv: baselineCLTV,
        net_adds: baselineNetAdds
      },

      forecasted: {
        customers: demandForecast.forecastedCustomers,
        repeat_loss_rate: churnForecast.forecastedRepeatLoss,
        new_customers: acquisitionForecast.forecastedAcquisition,
        revenue: revenueImpact.forecastedRevenue,
        aov: forecastedAOV,
        cltv: forecastedCLTV,
        net_adds: forecastedNetAdds
      },

      delta: {
        customers: demandForecast.change,
        customers_pct: demandForecast.percentChange,
        repeat_loss_rate: churnForecast.change,
        repeat_loss_rate_pct: churnForecast.changePercent,
        new_customers: acquisitionForecast.change,
        new_customers_pct: acquisitionForecast.changePercent,
        revenue: revenueImpact.change,
        revenue_pct: revenueImpact.percentChange,
        aov: aovChange,
        aov_pct: aovChangePct,
        cltv: forecastedCLTV - baselineCLTV,
        cltv_pct: baselineCLTV > 0 ? ((forecastedCLTV - baselineCLTV) / baselineCLTV) * 100 : 0,
        net_adds: forecastedNetAdds - baselineNetAdds
      },

      time_series: timeSeries,

      warnings: generateWarnings(scenario, churnForecast, demandForecast),

      constraints_met: checkConstraints(scenario)
    };

    return result;

  } catch (error) {
    console.error('Error simulating scenario:', error);
    throw error;
  }
}

/**
 * Simulate baseline "Do Nothing" scenario
 * Returns current state across all tiers with no changes
 * @param {Object} scenario - Baseline scenario configuration
 * @param {Object} options - Additional options
 * @returns {Promise<Object>} Baseline simulation results
 */
async function simulateBaselineScenario(scenario, options = {}) {
  try {
    // Get current data for all three main tiers
    const tiers = ['ad_supported', 'ad_free'];
    const weeklyData = await getWeeklyData('all');

    // Calculate aggregated metrics across all tiers
    let totalSubs = 0;
    let totalRevenue = 0;
    let weightedChurnRate = 0;
    let weightedNewSubs = 0;

    for (const tier of tiers) {
      const tierData = weeklyData.filter(d => d.tier === tier);
      const latestWeek = tierData[tierData.length - 1];

      if (latestWeek) {
        totalSubs += latestWeek.active_customers;
        totalRevenue += latestWeek.revenue;
        weightedChurnRate += latestWeek.repeat_loss_rate * latestWeek.active_customers;
        weightedNewSubs += latestWeek.new_customers;
      }
    }

    const avgChurnRate = weightedChurnRate / totalSubs;
    const avgAOV = totalRevenue / totalSubs;
    const avgLifetimeMonths = 24;
    const baselineCLTV = avgAOV * avgLifetimeMonths;
    const baselineNetAdds = weightedNewSubs - Math.round(totalSubs * avgChurnRate);

    // Generate time series (no change over time for baseline)
    const timeSeries = [];
    for (let month = 0; month <= 12; month++) {
      timeSeries.push({
        month,
        customers: Math.round(totalSubs),
        revenue: Math.round(totalRevenue),
        repeat_loss_rate: avgChurnRate
      });
    }

    return {
      scenario_id: scenario.id,
      scenario_name: scenario.name,
      elasticity: 0, // No price change
      confidence_interval: [0, 0],

      baseline: {
        customers: totalSubs,
        repeat_loss_rate: avgChurnRate,
        new_customers: weightedNewSubs,
        revenue: totalRevenue,
        aov: avgAOV,
        cltv: baselineCLTV,
        net_adds: baselineNetAdds
      },

      forecasted: {
        customers: totalSubs,
        repeat_loss_rate: avgChurnRate,
        new_customers: weightedNewSubs,
        revenue: totalRevenue,
        aov: avgAOV,
        cltv: baselineCLTV,
        net_adds: baselineNetAdds
      },

      delta: {
        customers: 0,
        customers_pct: 0,
        repeat_loss_rate: 0,
        repeat_loss_rate_pct: 0,
        new_customers: 0,
        new_customers_pct: 0,
        revenue: 0,
        revenue_pct: 0,
        aov: 0,
        aov_pct: 0,
        cltv: 0,
        cltv_pct: 0,
        net_adds: 0
      },

      time_series: timeSeries,

      warnings: ['This is a baseline scenario with no changes to pricing or strategy'],

      constraints_met: true
    };
  } catch (error) {
    console.error('Error simulating baseline scenario:', error);
    throw error;
  }
}

/**
 * Get baseline metrics for a tier
 * @param {string} tier - Tier name
 * @param {Object} scenario - Scenario object (for special handling)
 * @returns {Promise<Object>} Baseline metrics
 */
async function getBaselineMetrics(tier, scenario = null) {
  // Special handling for bundle scenarios
  if (tier === 'bundle') {
    console.log('Bundle scenario detected - using ad_free tier as baseline');

    // Use ad_free tier as baseline since bundle includes Supergoop ad-free
    const weeklyData = await getWeeklyData('ad_free');

    if (!weeklyData || weeklyData.length === 0) {
      throw new Error('No data available for ad_free tier (needed for bundle baseline)');
    }

    const latestWeek = weeklyData[weeklyData.length - 1];

    // For bundle scenarios, estimate potential bundle customers as a percentage of ad_free
    // Assumption: ~30% of ad_free users might be interested in bundle
    const bundlePotentialPct = 0.30;
    const estimatedBundleSubs = Math.round((latestWeek.active_customers || 0) * bundlePotentialPct);

    // Bundle baseline AOV should be the CURRENT price, not the new price
    const bundleCurrentAOV = scenario?.config?.current_price || 14.99;

    return {
      activeCustomers: estimatedBundleSubs,
      repeatLossRate: (latestWeek.repeat_loss_rate || 0) * 0.7, // Bundles typically have lower churn
      newCustomers: Math.round((latestWeek.new_customers || 0) * bundlePotentialPct),
      revenue: estimatedBundleSubs * bundleCurrentAOV,
      aov: bundleCurrentAOV,
      isBundle: true,
      baseTier: 'ad_free'
    };
  }

  // Regular tier handling
  const weeklyData = await getWeeklyData(tier);

  if (!weeklyData || weeklyData.length === 0) {
    throw new Error(`No data available for tier: ${tier}. Please ensure data is loaded correctly.`);
  }

  const latestWeek = weeklyData[weeklyData.length - 1];

  if (!latestWeek) {
    throw new Error(`Unable to retrieve latest week data for tier: ${tier}`);
  }

  // Calculate AOV if not available or is zero
  let aov = latestWeek.aov || 0;
  if (aov === 0 && latestWeek.revenue && latestWeek.active_customers > 0) {
    aov = latestWeek.revenue / latestWeek.active_customers;
    console.log(`Calculated AOV from revenue/customers: ${aov.toFixed(2)}`);
  }

  return {
    activeCustomers: latestWeek.active_customers || 0,
    repeatLossRate: latestWeek.repeat_loss_rate || 0,
    newCustomers: latestWeek.new_customers || 0,
    revenue: latestWeek.revenue || 0,
    aov: aov,
    isBundle: false
  };
}

/**
 * Calculate revenue impact
 * @param {number} forecastedSubs - Forecasted customer count
 * @param {number} newPrice - New price
 * @param {number} baselineSubs - Baseline customer count
 * @param {number} currentPrice - Current price
 * @returns {Object} Revenue impact
 */
function calculateRevenueImpact(forecastedSubs, newPrice, baselineSubs, currentPrice) {
  // Monthly revenue = customers × price
  const forecastedRevenue = forecastedSubs * newPrice;
  const baselineRevenue = baselineSubs * currentPrice;
  const change = forecastedRevenue - baselineRevenue;
  const percentChange = (change / baselineRevenue) * 100;

  return {
    baselineRevenue,
    forecastedRevenue,
    change,
    percentChange
  };
}

/**
 * Generate time series forecast
 * @param {Object} demandForecast - Demand forecast object
 * @param {Object} churnForecast - Churn forecast object
 * @param {Object} acquisitionForecast - Acquisition forecast object
 * @param {number} newPrice - New price
 * @param {number} months - Number of months to forecast
 * @returns {Array} Time series data
 */
function generateTimeSeries(demandForecast, churnForecast, acquisitionForecast, newPrice, months) {
  const series = [];
  let currentSubs = demandForecast.baseCustomers;

  for (let month = 0; month <= months; month++) {
    // Month 0 is baseline
    if (month === 0) {
      series.push({
        month: 0,
        customers: currentSubs,
        revenue: currentSubs * (newPrice / (1 + (demandForecast.priceChangePct / 100))),
        repeat_loss_rate: churnForecast.baselineRepeatLoss
      });
      continue;
    }

    // Apply changes gradually over time
    const progressFactor = Math.min(month / 3, 1); // Full effect after 3 months

    // Calculate customer change
    const totalChange = demandForecast.forecastedCustomers - demandForecast.baseCustomers;
    currentSubs = demandForecast.baseCustomers + (totalChange * progressFactor);

    // Calculate churn for this month
    const churnChange = churnForecast.forecastedRepeatLoss - churnForecast.baselineRepeatLoss;
    const monthChurnRate = churnForecast.baselineRepeatLoss + (churnChange * progressFactor);

    // Revenue
    const revenue = currentSubs * newPrice;

    series.push({
      month,
      customers: Math.round(currentSubs),
      revenue: Math.round(revenue),
      repeat_loss_rate: monthChurnRate
    });
  }

  return series;
}

/**
 * Generate time series forecast for segment scenarios
 * @param {Object} baseline - Baseline tier metrics
 * @param {Object} forecasted - Forecasted tier metrics
 * @param {number} forecastedRepeatLoss - Forecasted repeat loss rate
 * @param {number} baselineRepeatLoss - Baseline repeat loss rate
 * @param {number} months - Number of months to forecast
 * @returns {Array} Time series data
 */
function generateTimeSeriesForSegment(baseline, forecasted, forecastedRepeatLoss, baselineRepeatLoss, months) {
  const series = [];

  for (let month = 0; month <= months; month++) {
    // Month 0 is baseline
    if (month === 0) {
      series.push({
        month: 0,
        customers: Math.round(baseline.customers),
        revenue: Math.round(baseline.revenue),
        repeat_loss_rate: baselineRepeatLoss
      });
      continue;
    }

    // Apply changes gradually over time
    const progressFactor = Math.min(month / 3, 1); // Full effect after 3 months

    // Calculate customer change
    const totalSubsChange = forecasted.customers - baseline.customers;
    const currentSubs = baseline.customers + (totalSubsChange * progressFactor);

    // Calculate revenue change
    const totalRevenueChange = forecasted.revenue - baseline.revenue;
    const currentRevenue = baseline.revenue + (totalRevenueChange * progressFactor);

    // Calculate churn for this month
    const repeatLossChange = forecastedRepeatLoss - baselineRepeatLoss;
    const monthRepeatLossRate = baselineRepeatLoss + (repeatLossChange * progressFactor);

    series.push({
      month,
      customers: Math.round(currentSubs),
      revenue: Math.round(currentRevenue),
      repeat_loss_rate: monthRepeatLossRate
    });
  }

  return series;
}

/**
 * Generate warnings based on scenario results
 * @param {Object} scenario - Scenario configuration
 * @param {Object} churnForecast - Churn forecast
 * @param {Object} demandForecast - Demand forecast
 * @returns {Array} Array of warning messages
 */
function generateWarnings(scenario, churnForecast, demandForecast) {
  const warnings = [];

  // Warn if churn increases significantly
  if (churnForecast.changePercent > 10) {
    warnings.push(`Repeat loss increases by ${churnForecast.changePercent.toFixed(1)}% (exceeds 10% threshold)`);
  }

  // Warn if customer loss is significant
  if (demandForecast.percentChange < -5) {
    warnings.push(`Customer base decreases by ${Math.abs(demandForecast.percentChange).toFixed(1)}% (exceeds 5% threshold)`);
  }

  // Warn about large price increases
  const priceChangePct = ((scenario.config.new_price - scenario.config.current_price) / scenario.config.current_price) * 100;
  if (priceChangePct > 20) {
    warnings.push(`Price increase of ${priceChangePct.toFixed(1)}% may be too aggressive`);
  }

  return warnings;
}

/**
 * Check if scenario meets platform and policy constraints
 * @param {Object} scenario - Scenario object
 * @returns {boolean} True if constraints are met
 */
function checkConstraints(scenario) {
  if (!scenario.constraints) return true;

  // Check all constraint flags
  const constraintChecks = [
    scenario.constraints.platform_compliant,
    scenario.constraints.price_change_12mo_limit !== false, // May be missing
    scenario.constraints.notice_period_30d !== false
  ];

  return constraintChecks.every(check => check === true);
}

/**
 * Compare multiple scenarios
 * @param {Array} scenarios - Array of scenario objects
 * @returns {Promise<Array>} Array of simulation results
 */
export async function compareScenarios(scenarios) {
  const results = [];

  for (const scenario of scenarios) {
    try {
      const result = await simulateScenario(scenario);
      results.push(result);
    } catch (error) {
      console.error(`Error simulating scenario ${scenario.id}:`, error);
      results.push({
        scenario_id: scenario.id,
        error: error.message
      });
    }
  }

  return results;
}

/**
 * Rank scenarios by objective function
 * @param {Array} results - Array of simulation results
 * @param {string} objective - Objective ('revenue', 'growth', 'balanced')
 * @returns {Array} Ranked results
 */
export function rankScenarios(results, objective = 'balanced') {
  const validResults = results.filter(r => !r.error);

  const scored = validResults.map(result => {
    let score = 0;

    switch (objective) {
      case 'revenue':
        // Maximize revenue growth
        score = result.delta.revenue_pct;
        break;

      case 'growth':
        // Maximize customer growth
        score = result.delta.customers_pct;
        break;

      case 'balanced':
        // Balance revenue and customer growth
        score = (result.delta.revenue_pct * 0.6) + (result.delta.customers_pct * 0.4);
        // Penalize high churn
        if (result.delta.repeat_loss_rate_pct > 10) {
          score -= 10;
        }
        break;

      default:
        score = result.delta.revenue_pct;
    }

    return { ...result, score };
  });

  // Sort by score descending
  return scored.sort((a, b) => b.score - a.score);
}

/**
 * Export scenario result to CSV-compatible format
 * @param {Object} result - Simulation result
 * @returns {Object} Flattened result for CSV export
 */
export function exportScenarioResult(result) {
  return {
    scenario_id: result.scenario_id,
    scenario_name: result.scenario_name,
    elasticity: result.elasticity,

    baseline_customers: result.baseline.customers,
    baseline_revenue: result.baseline.revenue,
    baseline_repeat_loss_rate: result.baseline.repeat_loss_rate,
    baseline_aov: result.baseline.aov,

    forecasted_customers: result.forecasted.customers,
    forecasted_revenue: result.forecasted.revenue,
    forecasted_repeat_loss_rate: result.forecasted.repeat_loss_rate,
    forecasted_aov: result.forecasted.aov,

    delta_customers: result.delta.customers,
    delta_customers_pct: result.delta.customers_pct,
    delta_revenue: result.delta.revenue,
    delta_revenue_pct: result.delta.revenue_pct,
    delta_repeat_loss_rate: result.delta.repeat_loss_rate,

    warnings: result.warnings.join('; '),
    constraints_met: result.constraints_met
  };
}

// ========== Segment-Targeted Scenario Simulation ==========

/**
 * Simulate a pricing scenario for a specific customer segment
 * @param {Object} scenario - Scenario configuration
 * @param {Object} options - { targetSegment, segmentAxis }
 * @returns {Promise<Object>} Simulation results with segment breakdown
 */
export async function simulateSegmentScenario(scenario, options = {}) {
  const { targetSegment, segmentAxis } = options;

  console.log('Simulating segment-targeted scenario:', { targetSegment, segmentAxis });

  // Validate segment targeting
  if (!targetSegment || targetSegment === 'all') {
    throw new Error('simulateSegmentScenario requires a specific targetSegment');
  }

  const tier = scenario.config.tier;
  const currentPrice = scenario.config.current_price;
  const newPrice = scenario.config.new_price;
  const priceChangePct = (newPrice - currentPrice) / currentPrice;

  // Handle bundle tier - use ad_free as base tier for segment data
  // since bundle includes Supergoop ad-free
  const segmentTier = tier === 'bundle' ? 'ad_free' : tier;

  try {
    // Get segment-specific data (using segmentTier for lookups)
    const segmentElasticity = await getSegmentElasticity(segmentTier, targetSegment, segmentAxis);
    const segmentBaseline = await getSegmentBaseline(segmentTier, targetSegment, segmentAxis);

    console.log('Segment elasticity:', segmentElasticity);
    console.log('Segment baseline:', segmentBaseline);

    // Calculate direct impact on targeted segment
    const demandChangePct = segmentElasticity * priceChangePct;
    const forecastedCustomers = Math.round(segmentBaseline.customers * (1 + demandChangePct));
    const forecastedRevenue = forecastedCustomers * newPrice;

    // Estimate churn impact
    const churnMultiplier = 1 + (segmentElasticity * 0.15 * priceChangePct); // 15% of elasticity affects churn
    const forecastedChurn = segmentBaseline.repeat_loss_rate * churnMultiplier;

    // Calculate segment impact
    const segmentImpact = {
      baseline: segmentBaseline,
      forecasted: {
        customers: forecastedCustomers,
        revenue: forecastedRevenue,
        repeat_loss_rate: forecastedChurn,
        aov: newPrice
      },
      delta: {
        customers: forecastedCustomers - segmentBaseline.customers,
        customers_pct: demandChangePct * 100,
        revenue: forecastedRevenue - segmentBaseline.revenue,
        revenue_pct: ((forecastedRevenue - segmentBaseline.revenue) / segmentBaseline.revenue) * 100,
        repeat_loss_rate: forecastedChurn - segmentBaseline.repeat_loss_rate,
        repeat_loss_rate_pct: ((forecastedChurn - segmentBaseline.repeat_loss_rate) / segmentBaseline.repeat_loss_rate) * 100
      },
      elasticity: segmentElasticity
    };

    // Estimate spillover effects on other segments (use segmentTier for data lookups)
    const spilloverEffects = await estimateSpilloverEffects(
      segmentTier,
      targetSegment,
      priceChangePct,
      demandChangePct,
      segmentBaseline.customers
    );

    // Calculate tier-level totals including spillovers (use segmentTier for data lookups)
    const tierImpact = await calculateTierTotals(segmentTier, {
      targetSegment,
      segmentBaseline,
      segmentForecasted: segmentImpact.forecasted,
      spilloverEffects: spilloverEffects.details
    });

    // Generate warnings
    const warnings = [];
    if (tier === 'bundle') {
      warnings.push(`Note: Bundle scenario uses ad_free tier segment data as baseline (bundle includes Supergoop ad-free)`);
    }
    if (Math.abs(priceChangePct) > 0.15) {
      warnings.push(`Large price change (${(priceChangePct * 100).toFixed(1)}%) may have unpredictable effects`);
    }
    if (Math.abs(demandChangePct) > 0.25) {
      warnings.push(`High demand sensitivity: ${(Math.abs(demandChangePct) * 100).toFixed(1)}% change expected`);
    }
    if (forecastedChurn > 0.20) {
      warnings.push(`High repeat-loss risk: ${(forecastedChurn * 100).toFixed(1)}%`);
    }
    if (spilloverEffects.total_migration > segmentBaseline.customers * 0.15) {
      warnings.push(`Significant spillover effects: ~${spilloverEffects.total_migration.toLocaleString()} customers may migrate`);
    }

    // Generate time series forecast for tier-level totals (12 months)
    const timeSeries = generateTimeSeriesForSegment(
      tierImpact.baseline,
      tierImpact.forecasted,
      forecastedChurn,
      segmentBaseline.repeat_loss_rate,
      12
    );

    return {
      scenario_id: scenario.id,
      scenario_name: scenario.name,
      tier,
      target_segment: targetSegment,
      segment_axis: segmentAxis || 'auto-detected',

      // Segment-specific results
      segment_impact: segmentImpact,

      // Spillover effects
      spillover_effects: spilloverEffects.details,
      spillover_summary: {
        total_migration: spilloverEffects.total_migration,
        net_tier_change: spilloverEffects.net_tier_change
      },

      // Tier-level totals
      tier_impact: tierImpact,

      // Time series forecast
      time_series: timeSeries,

      // For compatibility with regular scenario display
      baseline: tierImpact.baseline,
      forecasted: tierImpact.forecasted,
      delta: tierImpact.delta,

      // Metadata
      elasticity: segmentElasticity,
      price_change_pct: priceChangePct * 100,
      warnings,
      constraints_met: warnings.length === 0,
      timestamp: new Date().toISOString()
    };

  } catch (error) {
    console.error('Error simulating segment scenario:', error);
    throw error;
  }
}

/**
 * Get elasticity for a specific segment
 * @param {string} tier - Tier name
 * @param {string} segmentId - Segment identifier
 * @param {string} axis - Optional axis override
 * @returns {Promise<number>} Elasticity value
 */
async function getSegmentElasticity(tier, segmentId, axis) {
  // Check if segmentEngine has elasticity data
  if (!window.segmentEngine || !window.segmentEngine.segmentElasticity) {
    console.warn('Segment elasticity data not available, using tier-level fallback');
    const params = await loadElasticityParams();
    return params.tiers[tier]?.base_elasticity || -2.0;
  }

  const tierData = window.segmentEngine.segmentElasticity[tier];
  if (!tierData || !tierData.segment_elasticity) {
    console.warn('No segment elasticity for tier:', tier);
    const params = await loadElasticityParams();
    return params.tiers[tier]?.base_elasticity || -2.0;
  }

  // Find segments matching the target segment ID
  const matchingKeys = Object.keys(tierData.segment_elasticity).filter(key => {
    const parts = key.split('|');
    return parts.includes(segmentId);
  });

  if (matchingKeys.length === 0) {
    console.warn('No matching segment found for:', segmentId);
    const params = await loadElasticityParams();
    return params.tiers[tier]?.base_elasticity || -2.0;
  }

  // Use the first matching segment's elasticity
  const compositeKey = matchingKeys[0];
  const segmentData = tierData.segment_elasticity[compositeKey];

  // Determine which axis to use
  let axisKey = axis ? `${axis}_axis` : null;

  // Auto-detect axis if not specified
  if (!axisKey) {
    // Check which position the segment appears in
    const parts = compositeKey.split('|');
    const position = parts.indexOf(segmentId);

    if (position === 0) axisKey = 'acquisition_axis';
    else if (position === 1) axisKey = 'engagement_axis';
    else if (position === 2) axisKey = 'monetization_axis';
    else axisKey = 'engagement_axis'; // Default
  }

  const elasticity = segmentData[axisKey]?.elasticity;

  if (elasticity !== undefined) {
    console.log(`Using segment elasticity: ${elasticity} for ${segmentId} (${axisKey})`);
    return elasticity;
  }

  // Fallback to tier-level
  console.warn('Could not find segment elasticity, using tier-level');
  const params = await loadElasticityParams();
  return params.tiers[tier]?.base_elasticity || -2.0;
}

/**
 * Get baseline metrics for a specific segment
 * @param {string} tier - Tier name
 * @param {string} segmentId - Segment identifier
 * @param {string} axis - Optional axis
 * @returns {Promise<Object>} Baseline metrics
 */
async function getSegmentBaseline(tier, segmentId, axis) {
  if (!window.segmentEngine) {
    throw new Error('Segment engine not initialized');
  }

  const segments = window.segmentEngine.getSegmentsForTier(tier);

  // Filter segments that match the target segment ID on any axis
  const matchingSegments = segments.filter(s =>
    s.acquisition === segmentId ||
    s.engagement === segmentId ||
    s.monetization === segmentId
  );

  if (matchingSegments.length === 0) {
    throw new Error(`No data found for segment: ${segmentId} in tier: ${tier}`);
  }

  console.log(`Found ${matchingSegments.length} matching segments for ${segmentId}`);

  // Aggregate across matching segments
  const totalCustomers = matchingSegments.reduce((sum, s) =>
    sum + parseInt(s.customer_count || 0), 0);

  const weightedRepeatLoss = matchingSegments.reduce((sum, s) => {
    const subs = parseInt(s.customer_count || 0);
    const repeatLoss = parseFloat(s.repeat_loss_rate || 0);
    return sum + (repeatLoss * subs);
  }, 0) / totalCustomers;

  const weightedAOV = matchingSegments.reduce((sum, s) => {
    const subs = parseInt(s.customer_count || 0);
    const aov = parseFloat(s.avg_order_value || 0);
    return sum + (aov * subs);
  }, 0) / totalCustomers;

  const revenue = totalCustomers * weightedAOV;

  return {
    customers: totalCustomers,
    repeat_loss_rate: weightedRepeatLoss,
    aov: weightedAOV,
    revenue,
    segment_count: matchingSegments.length
  };
}

/**
 * Estimate spillover effects on other segments (migration patterns)
 * @param {string} tier - Tier name
 * @param {string} targetSegment - Target segment ID
 * @param {number} priceChangePct - Price change percentage
 * @param {number} demandChangePct - Demand change percentage for target
 * @param {number} targetCustomers - Target segment customers
 * @returns {Promise<Object>} Spillover effects
 */
async function estimateSpilloverEffects(tier, targetSegment, priceChangePct, demandChangePct, targetCustomers) {
  if (!window.segmentEngine) {
    return { details: [], total_migration: 0, net_tier_change: 0 };
  }

  const allSegments = window.segmentEngine.getSegmentsForTier(tier);
  const spillovers = [];

  // Simplified migration model: some repeat_loss_flag customers move to other segments
  // Migration rate is proportional to demand change, capped at 10%
  const migrationRate = Math.min(Math.abs(demandChangePct) * 0.25, 0.10); // Max 10% migration
  const totalMigrants = Math.round(targetCustomers * migrationRate);

  // Distribute migrants across other segments (weighted by their size)
  const otherSegments = allSegments.filter(s =>
    s.acquisition !== targetSegment &&
    s.engagement !== targetSegment &&
    s.monetization !== targetSegment
  );

  const totalOtherSubs = otherSegments.reduce((sum, s) =>
    sum + parseInt(s.customer_count || 0), 0);

  for (const seg of otherSegments) {
    const segSubs = parseInt(seg.customer_count || 0);
    const weight = segSubs / totalOtherSubs;

    // Migration direction: price increase -> outflow, price decrease -> inflow
    const direction = priceChangePct > 0 ? -1 : 1;
    const deltaCustomers = Math.round(totalMigrants * weight * direction);

    if (deltaCustomers !== 0) {
      spillovers.push({
        compositeKey: seg.compositeKey,
        baseline_customers: segSubs,
        delta_customers: deltaCustomers,
        delta_pct: (deltaCustomers / segSubs) * 100
      });
    }
  }

  // Sort by absolute impact
  spillovers.sort((a, b) => Math.abs(b.delta_customers) - Math.abs(a.delta_customers));

  // Calculate net tier change from spillover
  const netTierChange = spillovers.reduce((sum, s) => sum + s.delta_customers, 0);

  return {
    details: spillovers.slice(0, 10), // Top 10 affected segments
    total_migration: totalMigrants,
    net_tier_change: netTierChange
  };
}

/**
 * Calculate tier-level totals including segment impact and spillovers
 * @param {string} tier - Tier name
 * @param {Object} impactData - Segment and spillover data
 * @returns {Promise<Object>} Tier totals
 */
async function calculateTierTotals(tier, impactData) {
  if (!window.segmentEngine) {
    throw new Error('Segment engine not initialized');
  }

  const allSegments = window.segmentEngine.getSegmentsForTier(tier);

  // Calculate baseline tier totals
  const baselineCustomers = allSegments.reduce((sum, s) =>
    sum + parseInt(s.customer_count || 0), 0);

  const baselineRevenue = allSegments.reduce((sum, s) => {
    const customers = parseInt(s.customer_count || 0);
    const aov = parseFloat(s.avg_order_value || 0);
    return sum + (customers * aov);
  }, 0);

  // Calculate forecasted tier totals
  const targetSegmentDelta = impactData.segmentForecasted.customers - impactData.segmentBaseline.customers;
  const spilloverDelta = impactData.spilloverEffects.reduce((sum, s) =>
    sum + (s.delta_customers || 0), 0);

  const forecastedCustomers = baselineCustomers + targetSegmentDelta + spilloverDelta;

  // Revenue calculation (simplified)
  const targetRevenueChange = impactData.segmentForecasted.revenue - impactData.segmentBaseline.revenue;
  const spilloverRevenueChange = impactData.spilloverEffects.reduce((sum, s) => {
    // Assume migrated customers keep similar AOV
    const avgAov = baselineRevenue / baselineCustomers;
    return sum + (s.delta_customers * avgAov);
  }, 0);

  const forecastedRevenue = baselineRevenue + targetRevenueChange + spilloverRevenueChange;
  const forecastedAov = forecastedRevenue / forecastedCustomers;

  return {
    baseline: {
      customers: baselineCustomers,
      revenue: baselineRevenue,
      aov: baselineRevenue / baselineCustomers
    },
    forecasted: {
      customers: forecastedCustomers,
      revenue: forecastedRevenue,
      aov: forecastedAov
    },
    delta: {
      customers: forecastedCustomers - baselineCustomers,
      customers_pct: ((forecastedCustomers - baselineCustomers) / baselineCustomers) * 100,
      revenue: forecastedRevenue - baselineRevenue,
      revenue_pct: ((forecastedRevenue - baselineRevenue) / baselineRevenue) * 100
    }
  };
}

/**
 * NEW: Simulate scenario using Pyodide Python models
 * Uses real statistical models (Poisson, Logit, Multinomial Logit)
 * 
 * @param {Object} scenario - Scenario configuration
 * @param {Object} options - Additional options
 * @returns {Promise<Object>} Simulation results with Python model predictions
 */
export async function simulateScenarioWithPyodide(scenario, options = {}) {
  console.log('🐍 Simulating scenario with Pyodide Python models:', scenario.id);

  try {
    // Map new/hypothetical tiers to proxy tiers for baseline data
    const tierMap = {
      'basic': 'ad_supported',
      'premium': 'ad_free',
      'bundle': 'ad_free'
    };

    const baselineTier = tierMap[scenario.config.tier] || scenario.config.tier;
    // Only "basic" and "premium" are truly new tiers; "bundle" is just a pricing variation of ad_free
    const isNewTier = (scenario.config.tier === 'basic' || scenario.config.tier === 'premium');

    if (tierMap[scenario.config.tier] && isNewTier) {
      console.log(`⚠️ New tier "${scenario.config.tier}" - using "${baselineTier}" as baseline proxy`);
    }

    // Get baseline data
    const baseline = await getBaselineMetrics(baselineTier, scenario);

    // Prepare scenario for Python models
    const pythonScenario = {
      new_price: scenario.config.new_price,
      current_price: scenario.config.current_price,
      price_change_pct: ((scenario.config.new_price - scenario.config.current_price) / scenario.config.current_price) * 100,
      promotion: scenario.config.promotion,
      segment_elasticity: options.segmentElasticity || -1.8,
      baseline_repeat_loss: baseline.repeatLossRate || 0.05,
      ad_supported_price: 5.99,  // TODO: Get from pricing data
      ad_free_price: 9.99
    };

    // Run Python model predictions in parallel
    const [acquisitionResult, churnResult, migrationResult] = await Promise.all([
      pyodideBridge.predictAcquisition(pythonScenario),
      pyodideBridge.predictChurn(pythonScenario),
      pyodideBridge.predictMigration(pythonScenario)
    ]);

    console.log('✅ Python predictions received:', {
      acquisition: acquisitionResult,
      churn: churnResult,
      migration: migrationResult
    });

    // Calculate forecasted KPIs using Python model outputs
    // Acquisition adds are absolute numbers (e.g., 5000 new subs)
    // Churn rate is a fraction (e.g., 0.05 = 5%)
    const repeatLossCustomers = baseline.activeCustomers * churnResult['0-4 Weeks'].repeat_loss_rate;
    const netAdds = acquisitionResult.predicted_adds - repeatLossCustomers;

    const forecasted = {
      activeCustomers: baseline.activeCustomers + netAdds,
      revenue: baseline.revenue * (1 + (pythonScenario.price_change_pct / 100)),
      aov: scenario.config.new_price,
      repeatLossRate: churnResult['0-4 Weeks'].repeat_loss_rate,
      grossAdds: acquisitionResult.predicted_adds,
      netAdds: netAdds
    };

    // Calculate deltas
    const delta = {
      customers: forecasted.activeCustomers - baseline.activeCustomers,
      customers_pct: ((forecasted.activeCustomers - baseline.activeCustomers) / baseline.activeCustomers) * 100,
      revenue: forecasted.revenue - baseline.revenue,
      revenue_pct: ((forecasted.revenue - baseline.revenue) / baseline.revenue) * 100,
      aov: forecasted.aov - baseline.aov,
      aov_pct: ((forecasted.aov - baseline.aov) / baseline.aov) * 100,
      repeat_loss_rate: forecasted.repeatLossRate - baseline.repeatLossRate,
      repeat_loss_rate_pct: ((forecasted.repeatLossRate - baseline.repeatLossRate) / baseline.repeatLossRate) * 100
    };

    // Build result object
    const result = {
      scenario_id: scenario.id,
      scenario_name: scenario.name,
      model_type: scenario.model_type,
      scenario_config: {
        ...scenario.config,
        baseline_tier: baselineTier  // Store proxy tier used for baseline
      },

      baseline: baseline,
      forecasted: forecasted,
      delta: delta,

      // Python model outputs
      python_models: {
        acquisition: acquisitionResult,
        churn: churnResult,
        migration: migrationResult
      },

      is_new_tier: isNewTier,  // Flag to indicate hypothetical tier
      model_source: 'pyodide-python',
      timestamp: new Date().toISOString()
    };

    return result;

  } catch (error) {
    console.error('❌ Pyodide simulation failed:', error);
    // Fallback to JavaScript simulation
    console.log('⚠️ Falling back to JavaScript simulation');
    return await simulateScenario(scenario, options);
  }
}

/**
 * Check if Pyodide models are available
 */
export function isPyodideAvailable() {
  return pyodideBridge.isReady();
}

/**
 * Initialize Pyodide models (call during app startup)
 */
export async function initializePyodideModels() {
  try {
    console.log('🚀 Initializing Pyodide models in background...');
    await pyodideBridge.loadModels();
    console.log('✅ Pyodide models ready');
    return true;
  } catch (error) {
    console.error('❌ Failed to initialize Pyodide:', error);
    return false;
  }
}
