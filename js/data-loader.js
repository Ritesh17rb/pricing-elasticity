/**
 * Data Loader Module
 * Loads and preprocesses all data files for the Price Elasticity POC
 *
 * Dependencies: None (Vanilla JavaScript)
 *
 * Usage:
 *   import { loadAllData } from './data-loader.js';
 *   const data = await loadAllData();
 */

import { parseCSV } from './csv-utils.js';

// Global data cache to avoid redundant fetches
const dataCache = {
  weeklyAggregated: null,
  elasticityParams: null,
  scenarios: null,
  segmentsAvailable: false
};

/**
 * Load all data files in parallel
 * @returns {Promise<Object>} Object containing all loaded datasets
 */
export async function loadAllData() {
  try {
    const [elasticityParams, scenarios, weeklyAggregated] = await Promise.all([
      loadElasticityParams(),
      loadScenarios(),
      loadWeeklyAggregated()
    ]);

    // Load segment data (non-blocking - graceful degradation if not available)
    try {
      const segmentLoaded = await loadSegmentData();
      dataCache.segmentsAvailable = segmentLoaded;
    } catch (error) {
      console.warn('Segment data not available, continuing with tier-level analysis only', error);
      dataCache.segmentsAvailable = false;
    }

    return {
      elasticityParams,
      scenarios,
      weeklyAggregated,
      segmentsAvailable: dataCache.segmentsAvailable
    };
  } catch (error) {
    console.error('Error loading data:', error);
    throw new Error('Failed to load required data files');
  }
}

/**
 * Load elasticity parameters from JSON
 * @returns {Promise<Object>} Elasticity parameters object
 */
export async function loadElasticityParams() {
  if (dataCache.elasticityParams) {
    return dataCache.elasticityParams;
  }

  try {
    const response = await fetch('data/elasticity-params.json');
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();
    dataCache.elasticityParams = data;
    return data;
  } catch (error) {
    console.error('Error loading elasticity parameters:', error);
    throw error;
  }
}

/**
 * Load scenario definitions from JSON
 * @returns {Promise<Array>} Array of scenario objects
 */
export async function loadScenarios() {
  if (dataCache.scenarios) {
    return dataCache.scenarios;
  }

  try {
    // Add cache-busting parameter to force reload
    const response = await fetch(`data/scenarios.json?v=${Date.now()}`);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();
    dataCache.scenarios = data;
    return data;
  } catch (error) {
    console.error('Error loading scenarios:', error);
    throw error;
  }
}

/**
 * Load weekly aggregated data from CSV
 * @returns {Promise<Array>} Array of weekly aggregated records
 */
export async function loadWeeklyAggregated() {
  if (dataCache.weeklyAggregated) {
    return dataCache.weeklyAggregated;
  }

  try {
    const response = await fetch('data/channel_weekly.csv');
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const csvText = await response.text();
    const data = parseCSV(csvText);
    const normalized = normalizeChannelWeekly(data);
    dataCache.weeklyAggregated = normalized;
    return normalized;
  } catch (error) {
    console.error('Error loading weekly aggregated data:', error);
    throw error;
  }
}

function channelGroupToTier(group) {
  if (group === 'mass') return 'ad_supported';
  if (group === 'prestige') return 'ad_free';
  return group;
}

function normalizeChannelWeekly(rows) {
  return rows.map(row => ({
    date: row.week_start,
    tier: channelGroupToTier(row.channel_group),
    active_customers: row.active_customers,
    new_customers: row.new_customers,
    repeat_loss_customers: row.repeat_loss_customers,
    net_adds: row.net_adds,
    repeat_loss_rate: row.repeat_loss_rate,
    price: row.price,
    revenue: row.revenue,
    aov: row.aov,
    units_sold: row.units_sold,
    gross_margin_pct: row.gross_margin_pct
  }));
}

/**
 * Get elasticity for a specific tier and segment
 * @param {string} tier - Tier name (ad_supported, ad_free)
 * @param {string} segment - Segment name (optional, e.g., 'new_0_3mo')
 * @returns {Promise<number>} Elasticity coefficient
 */
export async function getElasticity(tier, segment = null) {
  const params = await loadElasticityParams();

  if (!params.tiers[tier]) {
    throw new Error(`Unknown tier: ${tier}`);
  }

  if (segment && params.tiers[tier].segments[segment]) {
    return params.tiers[tier].segments[segment].elasticity;
  }

  return params.tiers[tier].base_elasticity;
}

/**
 * Get scenario by ID
 * @param {string} scenarioId - Scenario ID
 * @returns {Promise<Object>} Scenario object
 */
export async function getScenarioById(scenarioId) {
  const scenarios = await loadScenarios();
  const scenario = scenarios.find(s => s.id === scenarioId);

  if (!scenario) {
    throw new Error(`Scenario not found: ${scenarioId}`);
  }

  return scenario;
}

/**
 * Get scenarios by category
 * @param {string} category - Category name (e.g., 'price_increase')
 * @returns {Promise<Array>} Array of scenario objects
 */
export async function getScenariosByCategory(category) {
  const scenarios = await loadScenarios();
  return scenarios.filter(s => s.category === category);
}

/**
 * Get baseline scenario
 * @returns {Promise<Object>} Baseline scenario object
 */
export async function getBaselineScenario() {
  return await getScenarioById('scenario_baseline');
}

/**
 * Filter weekly data by tier and date range
 * @param {string} tier - Tier name (optional, 'all' for all tiers)
 * @param {string} startDate - Start date (YYYY-MM-DD, optional)
 * @param {string} endDate - End date (YYYY-MM-DD, optional)
 * @returns {Promise<Array>} Filtered data
 */
export async function getWeeklyData(tier = 'all', startDate = null, endDate = null) {
  const data = await loadWeeklyAggregated();
  console.log('Total weekly data records loaded:', data.length);

  let filtered = data;

  // Filter by tier
  if (tier !== 'all') {
    filtered = filtered.filter(d => d.tier === tier);
    console.log(`Filtered to tier "${tier}":`, filtered.length, 'records');
  }

  // Filter by date range
  if (startDate) {
    filtered = filtered.filter(d => d.date >= startDate);
    console.log(`Filtered from ${startDate}:`, filtered.length, 'records');
  }
  if (endDate) {
    filtered = filtered.filter(d => d.date <= endDate);
    console.log(`Filtered to ${endDate}:`, filtered.length, 'records');
  }

  if (filtered.length === 0) {
    console.warn(`Warning: No data found for tier="${tier}", startDate="${startDate}", endDate="${endDate}"`);
    // Show sample of available tiers
    const availableTiers = [...new Set(data.map(d => d.tier))];
    console.log('Available tiers:', availableTiers);
  }

  return filtered;
}

/**
 * Clear data cache (useful for testing or forcing refresh)
 */
export function clearCache() {
  Object.keys(dataCache).forEach(key => {
    dataCache[key] = null;
  });
  console.log('Data cache cleared');
}

/**
 * Get cache status
 * @returns {Object} Object showing which datasets are cached
 */
export function getCacheStatus() {
  const status = {};
  Object.keys(dataCache).forEach(key => {
    status[key] = dataCache[key] !== null ? 'cached' : 'not cached';
  });
  return status;
}

/**
 * Load customer segment data via segmentation engine
 * @returns {Promise<boolean>} True if successful, false otherwise
 */
export async function loadSegmentData() {
  if (!window.segmentEngine) {
    console.warn('Segmentation engine not available');
    return false;
  }

  try {
    const loaded = await window.segmentEngine.loadSegmentData();
    if (loaded) {
      console.log('✓ Customer segment data loaded successfully');
      dataCache.segmentsAvailable = true;
    }
    return loaded;
  } catch (error) {
    console.error('Error loading segment data:', error);
    dataCache.segmentsAvailable = false;
    return false;
  }
}

/**
 * Check if segment data is available
 * @returns {boolean}
 */
export function isSegmentDataAvailable() {
  return dataCache.segmentsAvailable && window.segmentEngine?.isDataLoaded();
}

/**
 * Get channel-level elasticity and price from elasticity-params (our data).
 * Used by Step 4 Channel View. Maps channels to mass/prestige and reads by_channel.
 * @returns {Promise<Array<{channel: string, channelGroup: string, elasticity: number, price: number}>>}
 */
export async function getChannelElasticityData() {
  const params = await loadElasticityParams();
  if (!params?.tiers) return [];

  const massTier = params.tiers.ad_supported;
  const prestigeTier = params.tiers.ad_free;

  const channelToGroup = {
    carryout: 'mass',
    pickup_app: 'mass',
    delivery: 'prestige',
    dine_in: 'prestige'
  };

  const channels = ['carryout', 'pickup_app', 'delivery', 'dine_in'];
  const byChannelMass = massTier?.cohort_elasticity?.by_channel || {};
  const byChannelPrestige = prestigeTier?.cohort_elasticity?.by_channel || {};
  const priceMass = massTier?.price_range?.current ?? 24;
  const pricePrestige = prestigeTier?.price_range?.current ?? 36;

  return channels.map(channel => {
    const group = channelToGroup[channel];
    const elasticity =
      group === 'mass'
        ? (byChannelMass[channel] ?? -2.0)
        : (byChannelPrestige[channel] ?? -1.5);
    const price = group === 'mass' ? priceMass : pricePrestige;
    return { channel, channelGroup: group, elasticity, price };
  });
}

// Export dataCache for advanced usage
export { dataCache };
