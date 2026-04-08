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
  pricingHistory: null,
  externalFactors: null,
  socialSignals: null,
  seasonCalendar: null,
  elasticityParams: null,
  scenarios: null,
  metadata: null,
  segmentsAvailable: false,
  eventCalendar: null,
  promoMetadata: null,
  validationWindows: null
};

/**
 * Load all data files in parallel
 * @returns {Promise<Object>} Object containing all loaded datasets
 */
export async function loadAllData() {
  try {
    const [
      elasticityParams,
      scenarios,
      metadata,
      weeklyAggregated,
      pricingHistory,
      externalFactors,
      socialSignals,
      seasonCalendar,
      eventCalendar,
      promoMetadata,
      validationWindows
    ] = await Promise.all([
      loadElasticityParams(),
      loadScenarios(),
      loadMetadata(),
      loadWeeklyAggregated(),
      loadPricingHistory(),
      loadExternalFactors(),
      loadSocialSignals(),
      loadSeasonCalendar(),
      loadEventCalendar(),
      loadPromoMetadata(),
      loadValidationWindows()
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
      metadata,
      weeklyAggregated,
      pricingHistory,
      externalFactors,
      socialSignals,
      seasonCalendar,
      eventCalendar,
      promoMetadata,
      validationWindows,
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
 * Load metadata from JSON
 * @returns {Promise<Object>} Metadata object
 */
export async function loadMetadata() {
  if (dataCache.metadata) {
    return dataCache.metadata;
  }

  try {
    const response = await fetch('data/metadata.json');
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();
    dataCache.metadata = data;
    return data;
  } catch (error) {
    console.error('Error loading metadata:', error);
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

/**
 * Load pricing history from CSV
 * @returns {Promise<Array>} Array of pricing history records
 */
export async function loadPricingHistory() {
  if (dataCache.pricingHistory) {
    return dataCache.pricingHistory;
  }

  try {
    const response = await fetch('data/price_calendar.csv');
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const csvText = await response.text();
    const data = parseCSV(csvText);
    const normalized = normalizePriceCalendar(data);
    dataCache.pricingHistory = normalized;
    return normalized;
  } catch (error) {
    console.error('Error loading pricing history:', error);
    throw error;
  }
}

/**
 * Load external factors from CSV
 * @returns {Promise<Array>} Array of external factor records
 */
export async function loadExternalFactors() {
  if (dataCache.externalFactors) {
    return dataCache.externalFactors;
  }

  try {
    const response = await fetch('data/market_signals.csv');
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const csvText = await response.text();
    const data = parseCSV(csvText);
    const normalized = normalizeMarketSignals(data);
    dataCache.externalFactors = normalized;
    return normalized;
  } catch (error) {
    console.error('Error loading external factors:', error);
    throw error;
  }
}

/**
 * Load social listening signals from CSV
 * @returns {Promise<Array>} Array of social signal records
 */
export async function loadSocialSignals() {
  if (dataCache.socialSignals) {
    return dataCache.socialSignals;
  }

  try {
    const response = await fetch('data/social_signals.csv');
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const csvText = await response.text();
    const data = parseCSV(csvText);
    dataCache.socialSignals = data;
    return data;
  } catch (error) {
    console.error('Error loading social signals:', error);
    throw error;
  }
}

/**
 * Load season calendar from CSV
 * @returns {Promise<Array>} Array of season calendar records
 */
export async function loadSeasonCalendar() {
  if (dataCache.seasonCalendar) {
    return dataCache.seasonCalendar;
  }

  try {
    const response = await fetch('data/season_calendar.csv');
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const csvText = await response.text();
    const data = parseCSV(csvText);
    dataCache.seasonCalendar = data;
    return data;
  } catch (error) {
    console.error('Error loading season calendar:', error);
    throw error;
  }
}

/**
 * Load event calendar from CSV
 * NEW: RFP-aligned unified event log
 * @returns {Promise<Array>} Array of event records
 */
export async function loadEventCalendar() {
  if (dataCache.eventCalendar) {
    return dataCache.eventCalendar;
  }

  try {
    const response = await fetch('data/retail_events.csv');
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const csvText = await response.text();
    const data = parseCSV(csvText);
    const normalized = normalizeRetailEvents(data);
    dataCache.eventCalendar = normalized;
    console.log(`Loaded ${normalized.length} events from event calendar`);
    return normalized;
  } catch (error) {
    console.error('Error loading event calendar:', error);
    throw error;
  }
}

/**
 * Load promo metadata from JSON
 * NEW: RFP-aligned promo campaign definitions
 * @returns {Promise<Object>} Promo metadata object
 */
export async function loadPromoMetadata() {
  if (dataCache.promoMetadata) {
    return dataCache.promoMetadata;
  }

  try {
    const response = await fetch('data/promo_metadata.json');
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();
    dataCache.promoMetadata = data;
    console.log(`Loaded ${Object.keys(data).length} promo campaigns`);
    return data;
  } catch (error) {
    console.error('Error loading promo metadata:', error);
    throw error;
  }
}

/**
 * Load validation windows from JSON
 * NEW: RFP-aligned train/test period definitions
 * @returns {Promise<Object>} Validation windows object
 */
export async function loadValidationWindows() {
  if (dataCache.validationWindows) {
    return dataCache.validationWindows;
  }

  try {
    const response = await fetch('data/validation_windows.json');
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();
    const normalized = normalizeValidationWindows(data);
    dataCache.validationWindows = normalized;
    console.log(`Loaded validation windows: ${normalized.validation_windows.length} windows defined`);
    return normalized;
  } catch (error) {
    console.error('Error loading validation windows:', error);
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

function normalizePriceCalendar(rows) {
  return rows.map(row => ({
    date: row.week_start,
    tier: channelGroupToTier(row.channel_group),
    base_price: row.list_price,
    is_promo: row.promo_flag,
    promo_discount_pct: row.promo_discount_pct,
    effective_price: row.effective_price,
    price_changed: row.price_changed,
    price_change_pct: row.price_change_pct
  }));
}

function normalizeMarketSignals(rows) {
  return rows.map(row => ({
    date: row.week_start,
    unemployment_rate: row.unemployment_rate,
    cpi: row.macro_cpi,
    consumer_sentiment: row.consumer_sentiment,
    competitor_mass_price: row.competitor_price_a,
    competitor_prestige_price: row.competitor_price_b,
    competitor_marketplace_price: row.competitor_price_c,
    competitor_avg_price: row.competitor_avg_price,
    competitor_promo_flag: row.competitor_promo_flag,
    category_demand_index: row.category_demand_index,
    promo_clutter_index: row.promo_clutter_index
  }));
}

function normalizeRetailEvents(rows) {
  const eventTypeMap = {
    'Competitor Price Drop': 'Price Change',
    'Retail Event': 'Tentpole',
    'Social Spike': 'Promo',
    'Markdown Start': 'Promo'
  };
  return rows.map(row => ({
    event_id: row.event_id,
    date: row.week_start,
    event_type: eventTypeMap[row.event_type] || row.event_type,
    tier: channelGroupToTier(row.channel_group),
    affected_cohort: row.affected_channel,
    price_before: row.price_before,
    price_after: row.price_after,
    promo_id: row.promo_id,
    promo_discount_pct: row.promo_discount_pct,
    notes: row.notes,
    validation_window: row.validation_window
  }));
}

function normalizeValidationWindows(data) {
  if (!data) {
    return { validation_windows: [] };
  }

  if (Array.isArray(data.validation_windows)) {
    return { validation_windows: data.validation_windows };
  }

  const windows = [];
  const pushWindows = (items, status) => {
    if (!Array.isArray(items)) return;
    items.forEach((item, idx) => {
      windows.push({
        window_id: `${status}_${idx + 1}`,
        type: status === 'clean' ? 'train' : 'test',
        status,
        start: item.start || item.start_date,
        end: item.end || item.end_date,
        weeks: item.weeks || null,
        purpose: item.notes || item.purpose || ''
      });
    });
  };

  pushWindows(data.clean_windows, 'clean');
  pushWindows(data.confounded_windows, 'confounded');
  pushWindows(data.test_windows, 'test');

  return { validation_windows: windows };
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
 * Get current pricing for all tiers
 * @returns {Promise<Object>} Object with current prices by tier
 */
export async function getCurrentPrices() {
  const pricingHistory = await loadPricingHistory();

  // Get latest date
  const latestDate = pricingHistory.reduce((max, record) => {
    return record.date > max ? record.date : max;
  }, '2000-01-01');

  // Get prices for latest date
  const latestPrices = pricingHistory
    .filter(record => record.date === latestDate)
    .reduce((acc, record) => {
      acc[record.tier] = {
        base_price: record.base_price,
        effective_price: record.effective_price,
        is_promo: record.is_promo,
        promo_discount_pct: record.promo_discount_pct
      };
      return acc;
    }, {});

  return latestPrices;
}

/**
 * Get column description from metadata
 * @param {string} dataset - Dataset name (e.g., 'customers')
 * @param {string} column - Column name
 * @returns {Promise<string>} Column description
 */
export async function getColumnDescription(dataset, column) {
  const metadata = await loadMetadata();

  if (!metadata.datasets[dataset]) {
    return 'No description available';
  }

  const columnInfo = metadata.datasets[dataset].columns[column];
  return columnInfo ? columnInfo.description : 'No description available';
}

/**
 * Get business term definition
 * @param {string} term - Business term (e.g., 'AOV')
 * @returns {Promise<string>} Term definition
 */
export async function getBusinessTermDefinition(term) {
  const metadata = await loadMetadata();

  if (!metadata.business_glossary[term]) {
    return 'Term not found in glossary';
  }

  return metadata.business_glossary[term].definition;
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
