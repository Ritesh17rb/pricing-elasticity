/**
 * Main Application Module
 * Orchestrates the Pizza Hut pricing elasticity studio
 *
 * Dependencies: data-loader.js, scenario-engine.js, charts.js
 */

import { loadScenarios, getWeeklyData, loadElasticityParams } from './data-loader.js';
import {
  simulateScenario,
  simulateScenarioWithPyodide,
  initializePyodideModels,
  isPyodideAvailable,
  compareScenarios as compareScenariosEngine
} from './scenario-engine.js';
import { renderDemandCurve, renderElasticityHeatmap, renderTierMixShift, renderTradeoffsScatter, renderComparisonBarChart, renderRadarChart } from './charts.js';
import { initializeChat, configureLLM, sendMessage, clearHistory } from './chat.js';
import { initializeDataViewer } from './data-viewer.js';
import { renderSegmentKPICards, renderSegmentElasticityHeatmap, render3AxisRadialChart, renderSegmentScatterPlot, exportSVG } from './segment-charts.js';
import { getAcquisitionCohorts, getChurnCohorts } from './cohort-aggregator.js';
import { pyodideBridge } from './pyodide-bridge.js';
import { initializeEventCalendar } from './event-calendar-pricingstudio.js';
import { rankScenarios, getObjectiveDescription } from './decision-engine.js';
import { exportToPDF, exportToXLSX } from './decision-pack.js';
import {
  loadYumFoundation,
  getYumFoundationSummary,
  loadYumBrandDim,
  loadYumBrandWeekSummary,
  loadYumBrandMarketProductChannelWeekPanel,
  loadYumBrandMarketChannelWeekPanel,
  loadYumPromoCalendar
} from './yum-data-loader.js';
import { getBrandItemSummaries, simulateBrandPriceChange } from './yum-elasticity-model.js';
import { initializeYumScenarioStudio } from './yum-scenario-studio.js';
import {
  DEFAULT_YUM_BRAND_ID,
  getSelectedYumBrandId,
  getYumBrandLabel,
  getYumChannelLabel,
  sortYumBrandIds
} from './yum-brand-utils.js';

// Global state
let allScenarios = [];
let dataLoaded = false;

const modelTypes = ['acquisition', 'churn', 'migration'];
let activeModelType = 'acquisition';

let selectedScenarioByModel = {
  acquisition: null,
  churn: null,
  migration: null
};

let currentResultByModel = {
  acquisition: null,
  churn: null,
  migration: null
};

let savedScenariosByModel = {
  acquisition: [],
  churn: [],
  migration: []
};

let allSimulationResultsByModel = {
  acquisition: [],
  churn: [],
  migration: []
};

let selectedScenario = selectedScenarioByModel[activeModelType];
let savedScenarios = savedScenariosByModel[activeModelType];
let currentResult = currentResultByModel[activeModelType];
let availableYumBrands = [];
let yumBrandProfiles = new Map();

const CHANNEL_PRICE = {
  ad_supported: 24.0,
  ad_free: 36.0
};

// Format helpers
function formatNumber(num) {
  // Check for null, undefined, NaN, and Infinity
  if (num === null || num === undefined || !Number.isFinite(num)) {
    return 'N/A';
  }
  return num.toLocaleString();
}

function formatCurrency(num) {
  // Check for null, undefined, NaN, and Infinity
  if (num === null || num === undefined || !Number.isFinite(num)) {
    return 'N/A';
  }
  return `$${num.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
}

function formatPercent(num, decimals = 1) {
  // Check for null, undefined, NaN, and Infinity
  if (num === null || num === undefined || !Number.isFinite(num)) {
    return 'N/A';
  }
  return `${num.toFixed(decimals)}%`;
}

function getModelTypeFromTabId(tabId) {
  if (tabId === 'acquisition-tab') return 'acquisition';
  if (tabId === 'churn-tab') return 'churn';
  if (tabId === 'migration-tab') return 'migration';
  return activeModelType;
}

function syncScenarioSelectionUI() {
  const activePane = document.querySelector('.tab-pane.active');
  if (!activePane) return;
  activePane.querySelectorAll('.scenario-card-tab').forEach(card => card.classList.remove('selected'));
  if (selectedScenario) {
    const card = activePane.querySelector(`.scenario-card-tab[data-scenario-id="${selectedScenario.id}"]`);
    if (card) card.classList.add('selected');
  }
}

function updateScenarioComparisonUI() {
  const count = savedScenarios.length;
  const countLabel = document.getElementById('saved-scenarios-count');
  const compareBtn = document.getElementById('compare-btn');
  const comparisonSection = document.getElementById('comparison-section');
  const comparisonCharts = document.getElementById('comparison-charts');

  if (countLabel) {
    countLabel.textContent = `${count} scenario${count !== 1 ? 's' : ''} saved`;
  }
  if (compareBtn) {
    compareBtn.disabled = count < 2;
  }
  if (comparisonSection) {
    comparisonSection.style.display = count > 0 ? 'block' : 'none';
  }
  if (comparisonCharts && count < 2) {
    comparisonCharts.style.display = 'none';
  }
}

function updateSimulateButtonState() {
  const simulateBtn = document.getElementById('simulate-btn-models');
  if (simulateBtn) {
    simulateBtn.disabled = !selectedScenario;
  }
}

function updateResultContainerForModel() {
  const resultContainer = document.getElementById('result-container-models');
  if (!resultContainer) return;
  const resolvedModelType = resolveModelTypeForResult(currentResult);
  if (!currentResult || (resolvedModelType && resolvedModelType !== activeModelType)) {
    resultContainer.style.display = 'none';
    clearResultsUI();
    return;
  }
  displayResultsInTabs(currentResult);
  resultContainer.style.display = 'block';
}

function clearResultsUI() {
  const cards = document.getElementById('result-cards-models');
  if (cards) cards.innerHTML = '';
  const warning = document.getElementById('new-tier-warning');
  if (warning) {
    warning.style.display = 'none';
    warning.innerHTML = '';
  }
  const acquisitionDetail = document.getElementById('acquisition-results-detail');
  const churnDetail = document.getElementById('churn-results-detail');
  const migrationDetail = document.getElementById('migration-results-detail');
  if (acquisitionDetail) acquisitionDetail.style.display = 'none';
  if (churnDetail) churnDetail.style.display = 'none';
  if (migrationDetail) migrationDetail.style.display = 'none';
}

function hideScenarioResults() {
  const resultContainer = document.getElementById('result-container-models');
  if (resultContainer) {
    resultContainer.style.display = 'none';
  }
  clearResultsUI();
}

/**
 * Update Decision Engine ranking display for the current active model type
 */
function updateDecisionEngineDisplay() {
  const container = document.getElementById('top-scenarios-container');
  const list = document.getElementById('top-scenarios-list');

  if (!container || !list) return;

  // Check if rankings exist for the current model type
  const currentTop3 = window.currentTop3ScenariosByModel?.[activeModelType];

  if (currentTop3 && currentTop3.length > 0) {
    // Rankings exist for this model, display them
    displayTop3Scenarios(currentTop3);
  } else {
    // No rankings for this model, hide the container
    container.style.display = 'none';
    list.innerHTML = '';
  }
}

function setActiveModelType(modelType) {
  if (!modelTypes.includes(modelType)) return;
  activeModelType = modelType;
  selectedScenario = selectedScenarioByModel[modelType];
  savedScenarios = savedScenariosByModel[modelType];
  currentResult = currentResultByModel[modelType];
  allSimulationResults = allSimulationResultsByModel[modelType];

  // Debug logging
  console.log(`🔄 Switching to ${modelType} model`, {
    hasResult: !!currentResult,
    resultModelType: currentResult?.model_type,
    resultScenarioId: currentResult?.scenario_id,
    storedResults: Object.keys(currentResultByModel).reduce((acc, key) => {
      acc[key] = currentResultByModel[key] ? {
        model_type: currentResultByModel[key].model_type,
        scenario_id: currentResultByModel[key].scenario_id
      } : null;
      return acc;
    }, {})
  });

  const comparisonCharts = document.getElementById('comparison-charts');
  if (comparisonCharts) comparisonCharts.style.display = 'none';
  // Clear any previously displayed results from other models
  hideScenarioResults();
  // Re-render results for this model if they exist
  if (currentResult) {
    displayResultsInTabs(currentResult, true); // Pass true to indicate this is a re-display, not a new simulation
    const resultContainer = document.getElementById('result-container-models');
    if (resultContainer) resultContainer.style.display = 'block';
  }
  syncScenarioSelectionUI();
  updateScenarioComparisonUI();
  updateSimulateButtonState();
  // Update Decision Engine display for this model
  updateDecisionEngineDisplay();
}

function resolveModelTypeForResult(result) {
  if (!result) return null;
  if (result.model_type) return result.model_type;
  if (result.scenario_config?.model_type) return result.scenario_config.model_type;
  if (result.scenario_id) {
    const match = allScenarios.find(s => s.id === result.scenario_id);
    if (match?.model_type) return match.model_type;
  }
  return null;
}

function startSimulateLoading() {
  const loadingEl = document.getElementById('simulate-loading');
  const labelEl = document.getElementById('simulate-loading-label');
  const barEl = document.getElementById('simulate-loading-bar');

  if (!loadingEl || !labelEl || !barEl) {
    return {
      done: Promise.resolve(),
      stop: () => {}
    };
  }

  const duration = 2600 + Math.random() * 1000;
  const start = performance.now();

  loadingEl.style.display = 'block';
  labelEl.textContent = 'Running scenario simulation...';
  barEl.style.width = '0%';
  barEl.textContent = '0%';
  barEl.setAttribute('aria-valuenow', '0');

  let resolveDone;
  const done = new Promise(resolve => {
    resolveDone = resolve;
  });

  const tick = (now) => {
    const elapsed = now - start;
    const progress = Math.min(elapsed / duration, 1);
    const percent = Math.round(progress * 100);
    barEl.style.width = `${percent}%`;
    barEl.textContent = `${percent}%`;
    barEl.setAttribute('aria-valuenow', String(percent));

    if (progress < 1) {
      requestAnimationFrame(tick);
    } else {
      labelEl.textContent = 'Finalizing...';
      resolveDone();
    }
  };

  requestAnimationFrame(tick);

  return {
    done,
    stop: () => {
      loadingEl.style.display = 'none';
    }
  };
}

async function initializeYumFoundationWorkspace() {
  try {
    const foundation = await loadYumFoundation();
    const brandId = getSelectedYumBrandId();
    const summary = await getYumFoundationSummary(brandId);
    const itemSummaries = await getBrandItemSummaries(brandId);

    window.yumFoundation = {
      foundation,
      brandId,
      summary,
      itemSummaries,
      getYumFoundationSummary,
      getBrandItemSummaries,
      simulateBrandPriceChange
    };

    console.log('Pizza Hut operating foundation ready', summary);
  } catch (error) {
    console.warn('Pizza Hut operating foundation initialization skipped:', error);
  }
}

function toNumeric(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function aggregateYumPanelRows(rows) {
  const units = rows.reduce((sum, row) => sum + getUnitsValue(row), 0);
  const sales = rows.reduce((sum, row) => sum + toNumeric(row.net_sales), 0);
  const margin = rows.reduce((sum, row) => sum + toNumeric(row.contribution_margin), 0);
  const promoUnits = rows.reduce((sum, row) => sum + (isPromoSupportedRow(row) ? getUnitsValue(row) : 0), 0);
  const elasticityWeighted = rows.reduce((sum, row) => sum + (getElasticityValue(row) * getUnitsValue(row)), 0);

  return {
    units,
    sales,
    margin,
    avgPrice: units > 0 ? sales / units : 0,
    marginRate: sales > 0 ? (margin / sales) * 100 : 0,
    promoMix: units > 0 ? (promoUnits / units) * 100 : 0,
    elasticity: units > 0 ? elasticityWeighted / units : 0,
    itemCount: new Set(rows.map(row => row.item_id || row.product_id)).size
  };
}

function aggregateStoreChannelRows(rows) {
  const transactions = rows.reduce((sum, row) => sum + getOrdersValue(row), 0);
  const units = rows.reduce((sum, row) => sum + getUnitsValue(row), 0);
  const sales = rows.reduce((sum, row) => sum + toNumeric(row.net_sales), 0);
  const margin = rows.reduce((sum, row) => sum + toNumeric(row.contribution_margin), 0);
  return {
    transactions,
    units,
    sales,
    margin,
    avgCheck: transactions > 0 ? sales / transactions : 0,
    marginRate: sales > 0 ? (margin / sales) * 100 : 0
  };
}

function formatChannelLabel(channel) {
  return getYumChannelLabel(channel);
}

function formatSignedNumber(value, decimals = 1) {
  if (!Number.isFinite(value)) return 'N/A';
  const prefix = value > 0 ? '+' : '';
  return `${prefix}${value.toFixed(decimals)}`;
}

function calculatePercentChange(currentValue, previousValue) {
  if (!Number.isFinite(currentValue) || !Number.isFinite(previousValue) || previousValue === 0) {
    return 0;
  }
  return ((currentValue / previousValue) - 1) * 100;
}

function setChangeIndicator(elementId, text, direction = 'neutral') {
  const element = document.getElementById(elementId);
  if (!element) return;

  const directionToClass = {
    positive: 'text-success',
    negative: 'text-danger',
    neutral: 'text-muted'
  };
  const directionToIcon = {
    positive: 'bi-arrow-up',
    negative: 'bi-arrow-down',
    neutral: 'bi-dash'
  };

  element.className = `small ${directionToClass[direction] || directionToClass.neutral}`;
  element.innerHTML = `<i class="bi ${directionToIcon[direction] || directionToIcon.neutral}"></i> ${text}`;
}

function setElementText(elementId, text) {
  const element = document.getElementById(elementId);
  if (element) {
    element.textContent = text;
  }
}

function setElementHTML(selector, html) {
  const element = typeof selector === 'string' ? document.querySelector(selector) : null;
  if (element) {
    element.innerHTML = html;
  }
}

function formatWeekLabel(weekStart) {
  if (!weekStart) return 'latest available week';
  const date = new Date(`${weekStart}T00:00:00`);
  if (Number.isNaN(date.getTime())) return weekStart;
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
}

function normalizeChannelKey(row) {
  return row?.channel || row?.channel_id || 'unknown';
}

function formatDescriptorText(value) {
  return String(value ?? '')
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function formatTitleCase(value) {
  return formatDescriptorText(value)
    .split(' ')
    .filter(Boolean)
    .map((token) => token.charAt(0).toUpperCase() + token.slice(1).toLowerCase())
    .join(' ');
}

function joinNaturalList(values = []) {
  const items = values.filter(Boolean);
  if (!items.length) return '';
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`;
}

function formatDelimitedValues(value, delimiter = ',') {
  return joinNaturalList(
    String(value ?? '')
      .split(delimiter)
      .map(token => formatDescriptorText(token).toLowerCase())
      .filter(Boolean)
  );
}

function formatCurrencyRange(low, high) {
  if (!Number.isFinite(low) && !Number.isFinite(high)) return 'N/A';
  if (Number.isFinite(low) && Number.isFinite(high)) {
    return `${formatCurrency(low)} to ${formatCurrency(high)}`;
  }
  return Number.isFinite(low) ? `Above ${formatCurrency(low)}` : `Up to ${formatCurrency(high)}`;
}

function getOrdersValue(row) {
  return toNumeric(row?.orders_proxy ?? row?.transaction_count_proxy);
}

function getUnitsValue(row) {
  return toNumeric(row?.unit_volume ?? row?.units ?? row?.menu_units);
}

function getElasticityValue(row) {
  const candidates = [row?.effective_elasticity, row?.elasticity_prior, row?.base_elasticity];
  const match = candidates.find(value => Number.isFinite(Number(value)));
  return Number.isFinite(Number(match)) ? Number(match) : 0;
}

function isPromoSupportedRow(row) {
  if (row?.promo_depth_pct !== undefined && row?.promo_depth_pct !== null && row?.promo_depth_pct !== '') {
    return toNumeric(row.promo_depth_pct) > 0;
  }
  return String(row?.promo_flag).toLowerCase() === 'true';
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function setListItems(elementId, items = []) {
  const element = document.getElementById(elementId);
  if (!element) return;

  if (!items.length) {
    element.innerHTML = '<li>No insights available yet.</li>';
    return;
  }

  element.innerHTML = items.map(item => `<li>${escapeHtml(item)}</li>`).join('');
}

function rollupChannels(storeChannelRows = []) {
  const byChannel = new Map();

  storeChannelRows.forEach(row => {
    const channel = normalizeChannelKey(row);
    const existing = byChannel.get(channel) || {
      channel,
      sales: 0,
      orders: 0,
      margin: 0,
      menuUnits: 0,
      weightedPromoMix: 0,
      weightedValueMix: 0,
      weightedPremiumMix: 0
    };

    const menuUnits = getUnitsValue(row);
    existing.sales += toNumeric(row.net_sales);
    existing.orders += getOrdersValue(row);
    existing.margin += toNumeric(row.contribution_margin);
    existing.menuUnits += menuUnits;
    existing.weightedPromoMix += toNumeric(row.promo_mix_pct) * menuUnits;
    existing.weightedValueMix += toNumeric(row.value_mix_pct) * menuUnits;
    existing.weightedPremiumMix += toNumeric(row.premium_mix_pct) * menuUnits;
    byChannel.set(channel, existing);
  });

  return [...byChannel.values()]
    .map(entry => ({
      ...entry,
      avgCheck: entry.orders > 0 ? entry.sales / entry.orders : 0,
      marginRate: entry.sales > 0 ? (entry.margin / entry.sales) * 100 : 0,
      promoMix: entry.menuUnits > 0 ? entry.weightedPromoMix / entry.menuUnits : 0,
      valueMix: entry.menuUnits > 0 ? entry.weightedValueMix / entry.menuUnits : 0,
      premiumMix: entry.menuUnits > 0 ? entry.weightedPremiumMix / entry.menuUnits : 0
    }))
    .sort((left, right) => right.sales - left.sales);
}

function getElasticityWatchItems(itemRows = [], count = 2) {
  const byItem = new Map();

  itemRows.forEach(row => {
    const key = row.item_id || row.product_id;
    const existing = byItem.get(key) || {
      itemName: row.item_name || row.product_name,
      sales: 0,
      units: 0,
      elasticityWeighted: 0
    };
    const units = getUnitsValue(row);
    existing.sales += toNumeric(row.net_sales);
    existing.units += units;
    existing.elasticityWeighted += getElasticityValue(row) * units;
    byItem.set(key, existing);
  });

  return [...byItem.values()]
    .map(item => ({
      ...item,
      elasticity: item.units > 0 ? item.elasticityWeighted / item.units : 0,
      watchScore: Math.abs(item.units > 0 ? item.elasticityWeighted / item.units : 0) * Math.max(item.sales, 1)
    }))
    .sort((left, right) => right.watchScore - left.watchScore)
    .slice(0, count)
    .map(item => item.itemName);
}

function getTopGroupMix(rows = [], field, count = 2) {
  const byGroup = new Map();

  rows.forEach((row) => {
    const key = formatDescriptorText(row?.[field]) || 'unknown';
    const existing = byGroup.get(key) || { key, sales: 0, units: 0 };
    existing.sales += toNumeric(row.net_sales);
    existing.units += getUnitsValue(row);
    byGroup.set(key, existing);
  });

  const totalSales = [...byGroup.values()].reduce((sum, row) => sum + row.sales, 0);

  return [...byGroup.values()]
    .map((entry) => ({
      ...entry,
      share: totalSales > 0 ? (entry.sales / totalSales) * 100 : 0
    }))
    .sort((left, right) => right.sales - left.sales)
    .slice(0, count);
}

function isTruthyFlag(value) {
  return value === true || value === 'true' || value === 1 || value === '1';
}

function getWeightedRealizedPrice(rows = []) {
  const totals = rows.reduce((accumulator, row) => {
    const units = Math.max(getUnitsValue(row), 1);
    accumulator.weightedPrice += toNumeric(row.realized_price) * units;
    accumulator.weight += units;
    return accumulator;
  }, { weightedPrice: 0, weight: 0 });

  return totals.weight > 0 ? totals.weightedPrice / totals.weight : 0;
}

function getPriceBand(rows = []) {
  return rows.reduce((band, row) => {
    const price = toNumeric(row.realized_price);
    if (!(price > 0)) return band;
    return {
      min: Math.min(band.min, price),
      max: Math.max(band.max, price)
    };
  }, { min: Number.POSITIVE_INFINITY, max: 0 });
}

function getTopProductMix(rows = [], count = 3) {
  const byProduct = new Map();

  rows.forEach((row) => {
    const key = row.product_id || row.item_id || row.product_name || 'unknown';
    const existing = byProduct.get(key) || { name: row.product_name || row.item_name || 'Unknown item', sales: 0, units: 0 };
    existing.sales += toNumeric(row.net_sales);
    existing.units += getUnitsValue(row);
    byProduct.set(key, existing);
  });

  return [...byProduct.values()]
    .sort((left, right) => right.sales - left.sales)
    .slice(0, count);
}

function getRowsForTopProducts(rows = [], topProducts = []) {
  const productNames = new Set(topProducts.map((item) => item.name));
  return rows.filter((row) => productNames.has(row.product_name || row.item_name));
}

function renderYumOverviewNarrative({
  brandLabel,
  brandProfile,
  latestBrandWeek,
  latestAggregate,
  latestItemAggregate,
  latestWeek,
  transactionsChangePct,
  salesChangePct,
  avgCheckChangePct,
  marginRateChangePts,
  latestStoreChannelRows,
  latestItemRows,
  latestPromoRows,
  foundationSummary,
  metadata,
  manifest,
  qaReport,
  dataQualityChecks
}) {
  const channels = rollupChannels(latestStoreChannelRows);
  const topChannel = channels[0];
  const watchItems = getElasticityWatchItems(latestItemRows, 2);
  const topFamilies = getTopGroupMix(latestItemRows, 'product_family', 2);
  const activeOffers = [...new Set((latestPromoRows || []).map(row => row.offer_name).filter(Boolean))];
  const checkLow = toNumeric(brandProfile?.typical_check_low);
  const checkHigh = toNumeric(brandProfile?.typical_check_high);
  const averageOrderBand = formatCurrencyRange(checkLow, checkHigh);
  const avgCheckStatus = Number.isFinite(checkLow) && latestAggregate.avgCheck < checkLow
    ? 'below'
    : Number.isFinite(checkHigh) && latestAggregate.avgCheck > checkHigh
      ? 'above'
      : 'within';
  const topChannelShare = topChannel ? (topChannel.sales / Math.max(latestAggregate.sales, 1)) * 100 : 0;
  const valueLaneRows = latestItemRows.filter((row) => isTruthyFlag(row.value_flag) || row.product_role === 'traffic_builder');
  const familyLaneRows = latestItemRows.filter((row) =>
    row.product_role === 'family_meal'
    || row.product_role === 'innovation'
    || row.product_role === 'core_meal'
    || (isTruthyFlag(row.shareable_flag) && row.product_role !== 'attach')
    || (row.price_tier === 'premium' && row.product_role !== 'attach')
  );
  const primaryLaneRows = valueLaneRows.length
    ? valueLaneRows
    : latestItemRows.filter((row) => row.product_role === 'traffic_builder' || row.product_role === 'core_meal');
  const secondaryLaneRows = familyLaneRows.length
    ? familyLaneRows
    : latestItemRows.filter((row) => row.product_role === 'family_meal' || row.product_role === 'innovation' || row.product_role === 'core_meal');
  const primaryAnchor = getWeightedRealizedPrice(primaryLaneRows) || (checkLow > 0 ? checkLow : Math.max(latestAggregate.avgCheck * 0.82, 10));
  const secondaryAnchor = getWeightedRealizedPrice(secondaryLaneRows) || (checkHigh > 0 ? checkHigh : Math.max(latestAggregate.avgCheck * 1.18, primaryAnchor + 4));
  const primaryFamily = topFamilies[0]?.key || 'Core pizza';
  const secondaryFamily = topFamilies[1]?.key || 'Bundles and add-ons';
  const primaryTopProducts = getTopProductMix(primaryLaneRows, 4);
  const secondaryTopProducts = getTopProductMix(secondaryLaneRows, 4);
  const primaryProducts = primaryTopProducts.map((item) => item.name);
  const secondaryProducts = secondaryTopProducts.map((item) => item.name);
  const primaryAnchorRows = getRowsForTopProducts(primaryLaneRows, primaryTopProducts);
  const secondaryAnchorRows = getRowsForTopProducts(secondaryLaneRows, secondaryTopProducts);
  const primaryChannel = getTopGroupMix(primaryLaneRows, 'channel_name', 1)[0]?.key || 'Pickup App';
  const secondaryChannel = getTopGroupMix(secondaryLaneRows, 'channel_name', 1)[0]?.key || 'Delivery';
  const primaryLaneSales = primaryLaneRows.reduce((sum, row) => sum + toNumeric(row.net_sales), 0);
  const secondaryLaneSales = secondaryLaneRows.reduce((sum, row) => sum + toNumeric(row.net_sales), 0);
  const primaryLaneShare = latestAggregate.sales > 0 ? (primaryLaneSales / latestAggregate.sales) * 100 : 0;
  const secondaryLaneShare = latestAggregate.sales > 0 ? (secondaryLaneSales / latestAggregate.sales) * 100 : 0;
  const primaryBand = getPriceBand(primaryAnchorRows.length ? primaryAnchorRows : primaryLaneRows);
  const secondaryBand = getPriceBand(secondaryAnchorRows.length ? secondaryAnchorRows : secondaryLaneRows);
  const primaryMinPrice = Number.isFinite(primaryBand.min) ? primaryBand.min : primaryAnchor;
  const primaryMaxPrice = primaryBand.max > 0 ? primaryBand.max : primaryAnchor;
  const secondaryMinPrice = Number.isFinite(secondaryBand.min) ? secondaryBand.min : secondaryAnchor;
  const secondaryMaxPrice = secondaryBand.max > 0 ? secondaryBand.max : secondaryAnchor;
  const primaryExamples = primaryProducts.slice(0, 3);
  const secondaryExamples = secondaryProducts.slice(0, 3);
  const offerSummary = activeOffers.length
    ? `${activeOffers[0]}${activeOffers.length > 1 ? ` plus ${activeOffers.length - 1} more current offer${activeOffers.length > 2 ? 's' : ''}` : ''}`
    : 'always-on value support';
  const watchSummary = watchItems.length ? joinNaturalList(watchItems) : 'the most elastic menu ladders';
  const averageOrderRead = averageOrderBand !== 'N/A'
    ? `${avgCheckStatus} the modeled ${averageOrderBand} average-order-value band`
    : 'loaded without a modeled average-order-value band';
  const orderTrend = `${formatSignedNumber(transactionsChangePct, 1)}% vs prior week`;
  const salesTrend = `${formatSignedNumber(salesChangePct, 1)}% vs prior week`;
  const marginTrend = `${formatSignedNumber(marginRateChangePts, 1)} pp vs prior week`;
  const channelRead = topChannel
    ? `${formatChannelLabel(topChannel.channel)} currently leads at ${topChannelShare.toFixed(1)}% of sales`
    : 'The current leading channel is not available';

  setElementHTML('#section-1 .insight-box .icon', '<i class="bi bi-lightbulb"></i>');
  setElementText('overview-tier-primary-band', 'Traffic Builder Ladder');
  setElementText('overview-tier-primary-name', 'Entry Value & Solo Meals');
  setElementText('overview-tier-primary-price', `From ${formatCurrency(primaryMinPrice)}`);
  setElementText(
    'overview-tier-primary-products',
    primaryExamples.length ? `Anchor items: ${primaryExamples.join(' | ')}` : `Anchor items: ${primaryFamily}`
  );
  setElementText(
    'overview-tier-primary-copy',
    `${formatCurrency(primaryMinPrice)} to ${formatCurrency(primaryMaxPrice)} across the latest week. ${primaryChannel} leads this ladder, and it drives ${primaryLaneShare.toFixed(1)}% of latest sales. ${offerSummary} keeps this lane competitive.`
  );
  setElementText('overview-tier-secondary-band', 'Family Share Ladder');
  setElementText('overview-tier-secondary-name', 'Family Bundles & Premium');
  setElementText('overview-tier-secondary-price', `From ${formatCurrency(secondaryMinPrice)}`);
  setElementText(
    'overview-tier-secondary-products',
    secondaryExamples.length ? `Anchor items: ${secondaryExamples.join(' | ')}` : `Anchor items: ${secondaryFamily}`
  );
  setElementText(
    'overview-tier-secondary-copy',
    `${formatCurrency(secondaryMinPrice)} to ${formatCurrency(secondaryMaxPrice)} across the latest week. ${secondaryChannel} is strongest here, and this ladder carries ${secondaryLaneShare.toFixed(1)}% of latest sales. Test selective premium pricing here first.`
  );
  setElementText('kpi-insight-title', 'The Pricing Question');
  setElementText(
    'kpi-insight-text',
    `${brandLabel} delivered ${formatCurrency(latestAggregate.sales)} from ${formatNumber(Math.round(latestAggregate.transactions))} weekly orders. Average order value is ${formatCurrency(latestAggregate.avgCheck)}, ${averageOrderRead}. ${channelRead}. The current ladder starts around ${formatCurrency(primaryMinPrice)} for traffic builders and ${formatCurrency(secondaryMinPrice)} for family and premium missions. Promo-supported units are ${latestItemAggregate.promoMix.toFixed(1)}%, and ${watchSummary} should be reviewed first if pricing changes expand. Orders are ${orderTrend}, sales are ${salesTrend}, and margin rate moved ${marginTrend}.`
  );
}

// Load KPI data
async function loadKPIs(selectedBrandId = getSelectedYumBrandId()) {
  try {
    const [brandDim, brandWeekSummary, yumItemPanel, yumStoreChannelPanel, yumPromoCalendar] = await Promise.all([
      loadYumBrandDim(),
      loadYumBrandWeekSummary(),
      loadYumBrandMarketProductChannelWeekPanel(),
      loadYumBrandMarketChannelWeekPanel(),
      loadYumPromoCalendar()
    ]);

    yumBrandProfiles = new Map(brandDim.map(row => [row.brand_id, row]));
    availableYumBrands = sortYumBrandIds([
      ...brandDim.map(row => row.brand_id),
      ...brandWeekSummary.map(row => row.brand_id),
      ...yumItemPanel.map(row => row.brand_id),
      ...yumStoreChannelPanel.map(row => row.brand_id)
    ]);

    if (!availableYumBrands.length) {
      throw new Error('No Pizza Hut brand rows available for Current State Overview KPIs.');
    }

    const brandId = availableYumBrands.includes(selectedBrandId) ? selectedBrandId : availableYumBrands[0];
    window.yumSelectedBrandId = brandId;

    const brandItemRows = yumItemPanel.filter(row => row.brand_id === brandId);
    const brandStoreChannelRows = yumStoreChannelPanel.filter(row => row.brand_id === brandId);
    const brandWeekRows = brandWeekSummary.filter(row => row.brand_id === brandId);
    const brandProfile = yumBrandProfiles.get(brandId) || null;

    if (brandItemRows.length === 0 || brandStoreChannelRows.length === 0 || brandWeekRows.length === 0) {
      throw new Error(`No ${getYumBrandLabel(brandId)} operating panel rows available for Current State Overview KPIs.`);
    }

    const weeks = [...new Set(brandWeekRows.map(row => row.week_start))].sort();
    const latestWeek = weeks[weeks.length - 1];
    const priorWeek = weeks.length > 1 ? weeks[weeks.length - 2] : latestWeek;
    const latestItemRows = brandItemRows.filter(row => row.week_start === latestWeek);
    const latestStoreChannelRows = brandStoreChannelRows.filter(row => row.week_start === latestWeek);
    const latestBrandWeek = brandWeekRows.find(row => row.week_start === latestWeek) || null;
    const priorBrandWeek = brandWeekRows.find(row => row.week_start === priorWeek) || latestBrandWeek;
    const latestPromoRows = yumPromoCalendar.filter(row => row.brand_id === brandId && row.week_start === latestWeek);
    const channelAggregate = aggregateStoreChannelRows(latestStoreChannelRows);
    const priorChannelRows = brandStoreChannelRows.filter(row => row.week_start === priorWeek);
    const priorChannelAggregate = aggregateStoreChannelRows(priorChannelRows);
    const latestAggregate = {
      ...channelAggregate,
      transactions: toNumeric(latestBrandWeek?.system_orders) || channelAggregate.transactions,
      sales: toNumeric(latestBrandWeek?.system_sales) || channelAggregate.sales,
      avgCheck: toNumeric(latestBrandWeek?.avg_check) || channelAggregate.avgCheck,
      margin: toNumeric(latestBrandWeek?.contribution_margin) || channelAggregate.margin,
      marginRate: toNumeric(latestBrandWeek?.contribution_margin_pct) > 0
        ? toNumeric(latestBrandWeek.contribution_margin_pct) * 100
        : channelAggregate.marginRate
    };
    const priorAggregate = {
      ...priorChannelAggregate,
      transactions: toNumeric(priorBrandWeek?.system_orders) || priorChannelAggregate.transactions,
      sales: toNumeric(priorBrandWeek?.system_sales) || priorChannelAggregate.sales,
      avgCheck: toNumeric(priorBrandWeek?.avg_check) || priorChannelAggregate.avgCheck,
      margin: toNumeric(priorBrandWeek?.contribution_margin) || priorChannelAggregate.margin,
      marginRate: toNumeric(priorBrandWeek?.contribution_margin_pct) > 0
        ? toNumeric(priorBrandWeek.contribution_margin_pct) * 100
        : priorChannelAggregate.marginRate
    };
    const latestItemAggregate = aggregateYumPanelRows(latestItemRows);
    const brandLabel = getYumBrandLabel(brandId);

    setElementText('kpi-metrics-heading', `Key Performance Metrics (Week of ${formatWeekLabel(latestWeek)})`);
    setElementText('kpi-customers-label', 'Weekly Orders');
    setElementText('kpi-revenue-label', 'Weekly Net Sales');
    setElementText('kpi-aov-label', 'Average Order Value');
    setElementText('kpi-churn-label', 'Contribution Margin Rate');
    setElementText('kpi-customers', formatNumber(Math.round(latestAggregate.transactions)));
    setElementText('kpi-revenue', formatCurrency(latestAggregate.sales));
    setElementText('kpi-aov', formatCurrency(latestAggregate.avgCheck));
    setElementText('kpi-churn', formatPercent(latestAggregate.marginRate));

    const transactionsChangePct = calculatePercentChange(latestAggregate.transactions, priorAggregate.transactions);
    const salesChangePct = calculatePercentChange(latestAggregate.sales, priorAggregate.sales);
    const avgCheckChangePct = calculatePercentChange(latestAggregate.avgCheck, priorAggregate.avgCheck);
    const marginRateChangePts = latestAggregate.marginRate - priorAggregate.marginRate;

    setChangeIndicator(
      'kpi-customers-change',
      `${formatSignedNumber(transactionsChangePct, 1)}% vs prior week`,
      transactionsChangePct > 0 ? 'positive' : transactionsChangePct < 0 ? 'negative' : 'neutral'
    );
    setChangeIndicator(
      'kpi-revenue-change',
      `${formatSignedNumber(salesChangePct, 1)}% vs prior week`,
      salesChangePct > 0 ? 'positive' : salesChangePct < 0 ? 'negative' : 'neutral'
    );

    if (Math.abs(avgCheckChangePct) < 0.05) {
      setChangeIndicator('kpi-aov-change', 'Flat vs prior week', 'neutral');
    } else {
      setChangeIndicator('kpi-aov-change', `${formatSignedNumber(avgCheckChangePct, 1)}% vs prior week`, 'neutral');
    }

    setChangeIndicator(
      'kpi-churn-change',
      `${formatSignedNumber(marginRateChangePts, 1)} pp vs prior week`,
      marginRateChangePts > 0 ? 'positive' : marginRateChangePts < 0 ? 'negative' : 'neutral'
    );

    renderYumOverviewNarrative({
      brandId,
      brandLabel,
      brandProfile,
      latestBrandWeek,
      latestAggregate,
      latestItemAggregate,
      latestWeek,
      transactionsChangePct,
      salesChangePct,
      avgCheckChangePct,
      marginRateChangePts,
      latestStoreChannelRows,
      latestItemRows,
      latestPromoRows
    });
  } catch (error) {
    console.error('Error loading KPIs:', error);
  }
}

// Load scenarios data only (no UI rendering)
async function loadScenariosData() {
  try {
    allScenarios = await loadScenarios();
    console.log(`✅ Loaded ${allScenarios.length} scenarios`);
  } catch (error) {
    console.error('Error loading scenarios:', error);
  }
}

// [OLD SIMULATION FUNCTIONS REMOVED - Using tabbed interface]

// Update elasticity analysis with scenario data
async function updateElasticityAnalysis(result) {
  try {
    const params = await loadElasticityParams();
    const weeklyData = await getWeeklyData('all');

    // Get baseline data
    const latestWeek = {};
    ['ad_supported', 'ad_free'].forEach(tier => {
      const tierData = weeklyData.filter(d => d.tier === tier);
      latestWeek[tier] = tierData[tierData.length - 1];
    });

    // Determine which tier was affected by the scenario
    const affectedTier = result.tier || selectedScenario?.config?.tier;
    const scenarioPrice = result.new_price || selectedScenario?.config?.new_price;

    const demandCurveData = {
      tiers: [
        {
          name: 'Entry & Value Mix',
          elasticity: params.tiers.ad_supported.base_elasticity,
          currentPrice: CHANNEL_PRICE.ad_supported,
          currentSubs: latestWeek.ad_supported.active_customers,
          newPrice: affectedTier === 'ad_supported' ? scenarioPrice : null,
          newSubs: affectedTier === 'ad_supported' ? result.forecasted.customers : null,
          color: '#dc3545'
        },
        {
          name: 'Core & Premium Mix',
          elasticity: params.tiers.ad_free.base_elasticity,
          currentPrice: CHANNEL_PRICE.ad_free,
          currentSubs: latestWeek.ad_free.active_customers,
          newPrice: affectedTier === 'ad_free' ? scenarioPrice : null,
          newSubs: affectedTier === 'ad_free' ? result.forecasted.customers : null,
          color: '#ffc107'
        },
        
      ]
    };

    renderDemandCurve('demand-curve-chart', demandCurveData, { width: 1100, height: 500 });
  } catch (error) {
    console.error('Error updating elasticity analysis:', error);
  }
}

// Load and render elasticity analytics
async function loadElasticityAnalytics() {
  try {
    const params = await loadElasticityParams();
    const weeklyData = await getWeeklyData('all');

    // Prepare demand curve data
    const latestWeek = {};
    ['ad_supported', 'ad_free'].forEach(tier => {
      const tierData = weeklyData.filter(d => d.tier === tier);
      latestWeek[tier] = tierData[tierData.length - 1];
    });

    const demandCurveData = {
      tiers: [
        {
          name: 'Entry & Value Mix',
          elasticity: params.tiers.ad_supported.base_elasticity,
          currentPrice: CHANNEL_PRICE.ad_supported,
          currentSubs: latestWeek.ad_supported.active_customers,
          color: '#dc3545'
        },
        {
          name: 'Core & Premium Mix',
          elasticity: params.tiers.ad_free.base_elasticity,
          currentPrice: CHANNEL_PRICE.ad_free,
          currentSubs: latestWeek.ad_free.active_customers,
          color: '#ffc107'
        },
        
      ]
    };

    renderDemandCurve('demand-curve-chart', demandCurveData, { width: 1100, height: 500 });

    // Prepare heatmap data
    const segments = ['new_0_3mo', 'tenured_3_12mo', 'tenured_12plus'];
    const tiers = ['ad_supported', 'ad_free'];
    const values = segments.map(segment =>
      tiers.map(tier => {
        if (params.tiers[tier].segments && params.tiers[tier].segments[segment]) {
          return params.tiers[tier].segments[segment].elasticity;
        }
        return params.tiers[tier].base_elasticity;
      })
    );

    const heatmapData = {
      segments: ['Game-Day Trial', 'Weekly Routine', 'Family Loyalist'],
      tiers: ['Entry & Value Mix', 'Core & Premium Mix'],
      values: values
    };

    renderElasticityHeatmap('elasticity-heatmap', heatmapData, { cellSize: 100 });

  } catch (error) {
    console.error('Error loading elasticity analytics:', error);
  }
}

// Store all simulation results for chatbot access
let allSimulationResults = allSimulationResultsByModel[activeModelType];

// Initialize chat context with scenario-focused tools
async function initializeChatContext() {
  try {
    const yumSummary = await getYumFoundationSummary(getSelectedYumBrandId());

    // Get current KPI values
    const weeklyData = await getWeeklyData('all');
    const latestWeek = {};
    ['ad_supported', 'ad_free'].forEach(tier => {
      const tierData = weeklyData.filter(d => d.tier === tier);
      latestWeek[tier] = tierData[tierData.length - 1];
    });

    const totalSubs = Object.values(latestWeek).reduce((sum, d) => sum + d.active_customers, 0);
    const totalRevenue = Object.values(latestWeek).reduce((sum, d) => sum + d.revenue, 0) * 4;
    const avgChurn = Object.values(latestWeek).reduce((sum, d) => sum + d.repeat_loss_rate, 0) / 2;

    // Load elasticity parameters for visualization context
    const elasticityParams = await loadElasticityParams();

    // Create scenario-focused context for chat
    const context = {
      // All scenario definitions
      allScenarios: allScenarios,

      // Current simulation result (if any)
      getCurrentSimulation: () => currentResult,

      // All saved scenarios for comparison
      getSavedScenarios: () => savedScenarios,

      // All simulation results
      getAllSimulationResults: () => allSimulationResults,

      // Business context
      businessContext: {
        currentCustomers: Math.round(yumSummary?.latestUnits || totalSubs),
        currentRevenue: yumSummary?.latestRevenue || totalRevenue,
        currentChurn: avgChurn,
        elasticityByTier: {
          ad_supported: elasticityParams.tiers.ad_supported.base_elasticity,
          ad_free: elasticityParams.tiers.ad_free.base_elasticity,
          
        },
        tierPricing: {
          ad_supported: CHANNEL_PRICE.ad_supported,
          ad_free: CHANNEL_PRICE.ad_free
        }
      },

      // Visualization data context
      getVisualizationData: () => ({
        demandCurve: {
          description: "Shows price elasticity - how demand changes with price for each tier",
          tiers: [
            { name: 'Entry & Value Mix', elasticity: elasticityParams.tiers.ad_supported.base_elasticity, price: CHANNEL_PRICE.ad_supported },
            { name: 'Core & Premium Mix', elasticity: elasticityParams.tiers.ad_free.base_elasticity, price: CHANNEL_PRICE.ad_free }
          ]
        },
        tierMix: currentResult ? {
          description: "Baseline vs Forecasted customer distribution across tiers",
          baseline: currentResult.baseline,
          forecasted: currentResult.forecasted
        } : null,
        forecast: currentResult ? {
          description: "12-month customer forecast with 90% confidence intervals",
          timeSeries: currentResult.time_series
        } : null
      }),

      // SCENARIO-FOCUSED TOOLS

      // Interpret a specific scenario's results
      interpretScenario: async (scenarioId) => {
        // Check if we have results for this scenario
        let result = allSimulationResults.find(r => r.scenario_id === scenarioId);

        // If not, check if it's the current result
        if (!result && currentResult && currentResult.scenario_id === scenarioId) {
          result = currentResult;
        }

        // If still not found, run the simulation
        if (!result) {
          const scenario = allScenarios.find(s => s.id === scenarioId);
          if (!scenario) {
            throw new Error(`Scenario ${scenarioId} not found`);
          }
          result = await simulateScenario(scenario);
        }

        // Build interpretation
        const interpretation = {
          scenario_id: result.scenario_id,
          scenario_name: result.scenario_name,

          // Key metrics
          metrics: {
            revenue: {
              change_pct: result.delta.revenue_pct,
              change_amount: result.delta.revenue,
              forecasted: result.forecasted.revenue,
              baseline: result.baseline.revenue
            },
            customers: {
              change_pct: result.delta.customers_pct,
              change_amount: result.delta.customers,
              forecasted: result.forecasted.customers,
              baseline: result.baseline.customers
            },
            churn: {
              change_pct: result.delta.repeat_loss_rate_pct,
              forecasted_rate: result.forecasted.repeat_loss_rate,
              baseline_rate: result.baseline.repeat_loss_rate
            },
            aov: {
              change_pct: result.delta.aov_pct,
              forecasted: result.forecasted.aov,
              baseline: result.baseline.aov
            }
          },

          // Trade-offs
          tradeoffs: {
            revenue_vs_customers: `${result.delta.revenue_pct >= 0 ? 'Gain' : 'Loss'} ${Math.abs(result.delta.revenue_pct).toFixed(1)}% revenue, ${result.delta.customers_pct >= 0 ? 'gain' : 'lose'} ${Math.abs(result.delta.customers_pct).toFixed(1)}% customers`,
            price_sensitivity: result.elasticity < -2.0 ? 'High' : result.elasticity < -1.5 ? 'Medium' : 'Low'
          },

          // Warnings and risks
          warnings: result.warnings || [],

          // Elasticity info
          elasticity: result.elasticity,

          // Time series forecast
          forecast_12m: result.time_series,

          summary: `${result.scenario_name} analysis: Revenue ${result.delta.revenue_pct >= 0 ? 'increases' : 'decreases'} by ${Math.abs(result.delta.revenue_pct).toFixed(1)}% while customers ${result.delta.customers_pct >= 0 ? 'grow' : 'decline'} by ${Math.abs(result.delta.customers_pct).toFixed(1)}%. Repeat loss ${result.delta.repeat_loss_rate_pct >= 0 ? 'increases' : 'decreases'} by ${Math.abs(result.delta.repeat_loss_rate_pct).toFixed(1)}%.`
        };

        return interpretation;
      },

      // Suggest a new scenario based on business goal
      suggestScenario: async (goal) => {
        const goalMap = {
          maximize_revenue: {
            strategy: 'Price lift on core and premium mix',
            tier: 'ad_free',
            priceChange: +2.00,
            rationale: 'Prestige channel is less elastic, allowing modest price lifts with limited volume loss'
          },
          grow_customers: {
            strategy: 'Defensive promo on entry and value mix',
            tier: 'ad_supported',
            priceChange: -3.00,
            rationale: 'Mass channel is more elastic, so discounts drive volume during competitive pressure'
          },
          reduce_churn: {
            strategy: 'Hold price and reduce promo depth',
            tier: 'ad_free',
            priceChange: -1.00,
            rationale: 'A modest core and premium mix adjustment protects repeat rate without heavy discounting'
          },
          maximize_aov: {
            strategy: 'Prestige channel price increase',
            tier: 'ad_free',
            priceChange: +3.00,
            rationale: 'Prestige shoppers accept higher pricing when demand is strong'
          }
        };

        const suggestion = goalMap[goal];
        if (!suggestion) {
          throw new Error(`Unknown goal: ${goal}. Valid goals: ${Object.keys(goalMap).join(', ')}`);
        }

        const tierPrices = { ...CHANNEL_PRICE };

        const currentPrice = tierPrices[suggestion.tier];
        const newPrice = currentPrice + suggestion.priceChange;

        return {
          goal: goal,
          suggested_scenario: {
            name: `${suggestion.strategy} - ${suggestion.tier.replace('_', ' ')}`,
            tier: suggestion.tier,
            current_price: currentPrice,
            new_price: newPrice,
            price_change: suggestion.priceChange,
            price_change_pct: (suggestion.priceChange / currentPrice) * 100
          },
          rationale: suggestion.rationale,
          estimated_impact: `For ${goal.replace('_', ' ')}, this strategy is optimal based on elasticity analysis`,
          next_steps: 'Use the scenario editor to create this scenario, then simulate to see detailed forecasts'
        };
      },

      // Analyze a specific chart/visualization
      analyzeChart: async (chartName) => {
        const chartAnalysis = {
          demand_curve: {
            name: 'Demand Curve by Menu Ladder',
            description: 'Shows price elasticity - how quantity demanded changes with price',
            interpretation: [
              'Steeper curve = higher elasticity = more price-sensitive customers',
              `Entry & Value Mix (elasticity ${elasticityParams.tiers.ad_supported.base_elasticity}): Most price-sensitive`,
              `Core & Premium Mix (elasticity ${elasticityParams.tiers.ad_free.base_elasticity}): Moderately price-sensitive`
            ],
            insights: 'Use this to identify optimal price points for each menu ladder. Flatter curves allow for price increases with less order loss.'
          },
          tier_mix: currentResult ? {
            name: 'Menu-Ladder Mix: Baseline vs Forecasted',
            description: 'Compares current vs forecasted order distribution across demand ladders',
            baseline: currentResult.baseline,
            forecasted: currentResult.forecasted,
            interpretation: `Scenario "${currentResult.scenario_name}" shifts channel distribution. Revenue impact depends on AOV differences.`
          } : null,
          forecast: currentResult ? {
            name: '12-Month Customer Forecast',
            description: 'Projects customer count over 12 months with 90% confidence intervals',
            timeSeries: currentResult.time_series,
            interpretation: 'Confidence intervals widen over time due to increasing uncertainty. Use for medium-term planning (3-6 months most reliable).'
          } : null,
          heatmap: {
            name: 'Elasticity Heatmap by Cohort',
            description: 'Shows how price sensitivity varies by visit mission and menu ladder',
            interpretation: [
              'Value-led and game-day trial guests are typically more price-sensitive',
              'Routine and loyalist missions tend to hold better when price moves are selective',
              'This guides targeted Pizza Hut pricing strategies by segment'
            ]
          }
        };

        const analysis = chartAnalysis[chartName];
        if (!analysis) {
          throw new Error(`Unknown chart: ${chartName}. Available charts: ${Object.keys(chartAnalysis).join(', ')}`);
        }

        return analysis;
      },

      // Deep comparison of multiple scenarios
      compareOutcomes: async (scenarioIds) => {
        if (scenarioIds.length < 2) {
          throw new Error('Need at least 2 scenarios to compare');
        }

        const scenarios = scenarioIds.map(id => allScenarios.find(s => s.id === id)).filter(s => s);
        if (scenarios.length === 0) {
          throw new Error('No valid scenarios found');
        }

        // Run all scenarios if not already simulated
        const results = [];
        for (const scenario of scenarios) {
          let result = allSimulationResults.find(r => r.scenario_id === scenario.id);
          if (!result && currentResult && currentResult.scenario_id === scenario.id) {
            result = currentResult;
          }
          if (!result) {
            result = await simulateScenario(scenario);
            allSimulationResults.push(result);
          }
          results.push(result);
        }

        // Analyze trade-offs
        const comparison = {
          scenarios: results.map(r => ({
            id: r.scenario_id,
            name: r.scenario_name,
            revenue_pct: r.delta.revenue_pct,
            customers_pct: r.delta.customers_pct,
            repeat_loss_pct: r.delta.repeat_loss_rate_pct,
            aov_pct: r.delta.aov_pct
          })),

          best_for: {
            revenue: results.reduce((best, r) => r.delta.revenue_pct > best.delta.revenue_pct ? r : best).scenario_name,
            customers: results.reduce((best, r) => r.delta.customers_pct > best.delta.customers_pct ? r : best).scenario_name,
            churn: results.reduce((best, r) => r.delta.repeat_loss_rate_pct < best.delta.repeat_loss_rate_pct ? r : best).scenario_name,
            aov: results.reduce((best, r) => r.delta.aov_pct > best.delta.aov_pct ? r : best).scenario_name
          },

          tradeoffs: results.map(r => ({
            scenario: r.scenario_name,
            tradeoff: `Revenue ${r.delta.revenue_pct >= 0 ? '+' : ''}${r.delta.revenue_pct.toFixed(1)}% vs Orders ${r.delta.customers_pct >= 0 ? '+' : ''}${r.delta.customers_pct.toFixed(1)}%`,
            risk_level: r.warnings && r.warnings.length > 0 ? 'High' : Math.abs(r.delta.customers_pct) > 10 ? 'Medium' : 'Low'
          })),

          recommendation: `Best scenario depends on business priority. For revenue: ${results.reduce((best, r) => r.delta.revenue_pct > best.delta.revenue_pct ? r : best).scenario_name}. For growth: ${results.reduce((best, r) => r.delta.customers_pct > best.delta.customers_pct ? r : best).scenario_name}.`
        };

        return comparison;
      },

      // Create a new scenario from parameters
      createScenario: async (parameters) => {
        const { tier, price_change, promotion_discount, promotion_duration } = parameters;

        if (!tier || !['ad_supported', 'ad_free'].includes(tier)) {
          throw new Error('Invalid tier. Must be: ad_supported or ad_free');
        }

        const tierPrices = { ...CHANNEL_PRICE };

        const currentPrice = tierPrices[tier];
        let newPrice;
        let scenarioType;

        if (promotion_discount && promotion_duration) {
          // Promotion scenario
          newPrice = currentPrice * (1 - promotion_discount / 100);
          scenarioType = 'promotion';
        } else if (price_change !== undefined) {
          // Price change scenario
          newPrice = currentPrice + price_change;
          scenarioType = 'price_change';
        } else {
          throw new Error('Must specify either price_change or (promotion_discount and promotion_duration)');
        }

        const newScenario = {
          id: `scenario_custom_${Date.now()}`,
          name: scenarioType === 'promotion'
            ? `${promotion_discount}% Off Promo (${promotion_duration}mo) - ${tier.replace('_', ' ')}`
            : `${tier.replace('_', ' ')} ${price_change >= 0 ? '+' : ''}$${price_change.toFixed(2)}`,
          description: `Custom scenario created via chatbot`,
          category: scenarioType,
          config: {
            tier: tier,
            current_price: currentPrice,
            new_price: newPrice,
            price_change_pct: ((newPrice - currentPrice) / currentPrice) * 100
          },
          constraints: {
            min_price: currentPrice * 0.5,
            max_price: currentPrice * 1.5
          }
        };

        if (scenarioType === 'promotion') {
          newScenario.config.promotion = {
            discount_pct: promotion_discount,
            duration_months: promotion_duration
          };
        }

        // Add to scenarios list
        allScenarios.push(newScenario);

        return {
          created: true,
          scenario: newScenario,
          message: `Created scenario: ${newScenario.name}. Use interpretScenario('${newScenario.id}') to simulate and analyze results.`
        };
      }
    };

    // Initialize chat module with scenario-focused context
    initializeChat(context);
  } catch (error) {
    console.error('Error initializing chat context:', error);
    throw error;
  }
}

// Load data with progress bar
async function loadData() {
  const btn = document.getElementById('load-data-btn');
  const progressContainer = document.getElementById('loading-progress');
  const progressBar = document.getElementById('loading-progress-bar');
  const progressText = document.getElementById('loading-percentage');
  const stageText = document.getElementById('loading-stage');

  // Hide button, show progress
  btn.style.display = 'none';
  progressContainer.style.display = 'block';

  // Ensure loading UI elements exist and are visible
  if (!progressContainer || !progressBar || !progressText || !stageText) {
    console.error('Loading UI elements not found');
    return;
  }

  // Force visibility
  progressContainer.style.display = 'block';
  progressContainer.style.visibility = 'visible';

  // Define loading stages
  const stages = [
    { progress: 5, text: 'Initializing data loader...' },
    { progress: 15, text: 'Loading CSV files...' },
    { progress: 30, text: 'Parsing weekly aggregated data...' },
    { progress: 45, text: 'Calculating KPIs...' },
    { progress: 60, text: 'Loading pricing scenarios...' },
    { progress: 75, text: 'Analyzing price elasticity...' },
    { progress: 85, text: 'Initializing AI chat context...' },
    { progress: 95, text: 'Finalizing data viewer...' },
    { progress: 100, text: 'Complete!' }
  ];

  // Random total duration between 2-7 seconds
  const totalDuration = 2000 + Math.random() * 5000;
  const stageInterval = totalDuration / stages.length;

  try {
    console.log('Starting data load with visible progress bar');

    // Show progress through stages
    for (let i = 0; i < stages.length; i++) {
      const stage = stages[i];

      console.log(`Loading stage ${i+1}/${stages.length}: ${stage.text} (${stage.progress}%)`);

      // Update UI
      progressBar.style.width = stage.progress + '%';
      progressBar.style.minWidth = '5%'; // Always show at least 5%
      progressBar.setAttribute('aria-valuenow', stage.progress);
      progressText.textContent = stage.progress + '%';
      stageText.textContent = stage.text;

      // Add color transition as we progress
      if (stage.progress >= 75) {
        progressBar.classList.remove('bg-primary');
        progressBar.classList.add('bg-success');
      }

      // Wait for stage interval
      await new Promise(resolve => setTimeout(resolve, stageInterval));

      // Load actual data at specific stages
      if (stage.progress === 45) {
        await loadKPIs();
      } else if (stage.progress === 60) {
        await loadScenariosData();
        // Populate elasticity model tabs with filtered scenarios
        populateElasticityModelTabs();
        // Load segmentation data
        if (window.segmentEngine) {
          const segmentDataLoaded = await window.segmentEngine.loadSegmentData();
          if (!segmentDataLoaded) {
            console.error('Failed to load segmentation data');
          }
        } else {
          console.error('Segmentation engine not available');
        }
      } else if (stage.progress === 75) {
        await loadElasticityAnalytics();
      } else if (stage.progress === 85) {
        await initializeChatContext();
      } else if (stage.progress === 95) {
        initializeDataViewer();
        await initializeYumFoundationWorkspace();
        await initializeYumScenarioStudio();
      }
    }

    // Wait a bit before transitioning
    await new Promise(resolve => setTimeout(resolve, 500));

    // Hide loading progress, show KPI dashboard
    const loadDataSection = document.getElementById('load-data-section');
    const kpiSection = document.getElementById('kpi-section');
    if (loadDataSection) loadDataSection.style.display = 'none';
    if (kpiSection) kpiSection.style.display = 'block';

    // The old channel promo simulator is intentionally hidden in this Pizza Hut build.

    // NOTE: We're already on Step 1 (navigated before loadData was called)
    // All section visibility is now controlled by step navigation
    // After data loads, we auto-navigate to Step 1 which shows:
    // - load-data-section (hidden after load completes)
    // - kpi-section (with dashboard KPI cards)
    //
    // Other sections controlled by their respective steps:
    // Step 2-4: Individual elasticity models (insight boxes only)
    // Step 5: Scenario Analysis (elasticity-models-section with full scenarios)
    // Step 6: Customer Segmentation
    // Step 7: Event Calendar
    // Step 8: Data Explorer & Chat

    // Initialize segmentation section if data is available (but keep hidden)
    if (window.segmentEngine && window.segmentEngine.isDataLoaded()) {
      initializeSegmentationSection();
      initializeSegmentComparison();
      // initializeFilterPresets(); // Removed - Quick Presets feature removed from UI
      initializeExportButtons();
    }

    // Initialize Event Calendar (RFP-aligned: Slide 12)
    try {
      await initializeEventCalendar();
      console.log('✅ Event Calendar initialized');
    } catch (error) {
      console.error('⚠️ Event Calendar initialization failed:', error);
    }

    // Re-initialize popovers for newly visible sections
    initializePopovers();

    dataLoaded = true;

    // Initialize Pyodide models in background (non-blocking)
    initializePyodideModels().then(success => {
      if (success) {
        console.log('✅ Pyodide Python models ready to use');
      } else {
        console.log('⚠️ Pyodide initialization failed, using JavaScript fallback');
      }
    });

  } catch (error) {
    console.error('Error loading data:', error);

    // Show error state
    progressBar.classList.remove('bg-success');
    progressBar.classList.add('bg-danger');
    stageText.textContent = 'Error loading data: ' + error.message;

    // Reset after 3 seconds
    await new Promise(resolve => setTimeout(resolve, 3000));
    progressContainer.style.display = 'none';
    btn.style.display = 'inline-block';
    btn.disabled = false;
  }
}

async function loadDataStyled() {
  const btn = document.getElementById('load-data-btn');
  const progressContainer = document.getElementById('loading-progress');
  const progressBar = document.getElementById('loading-progress-bar');
  const progressText = document.querySelector('.ld-pct') || document.getElementById('loading-percentage');
  const stageText = document.getElementById('loading-stage');
  const segments = Array.from(document.querySelectorAll('.ld-seg'));

  if (!btn || !progressBar || !progressText || !stageText) {
    console.error('Loading UI elements not found');
    return;
  }

  btn.style.display = 'none';
  if (progressContainer) {
    progressContainer.style.display = 'none';
    progressContainer.style.visibility = 'hidden';
  }
  document.body.classList.add('app-loading-step');

  const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const easeOutCubic = (value) => 1 - Math.pow(1 - value, 3);
  const updateProgress = (value) => {
    const progress = Math.max(0, Math.min(100, value));
    const displayProgress = Math.max(progress, 5);
    progressBar.style.width = `${displayProgress}%`;
    progressBar.setAttribute('aria-valuenow', String(Math.round(progress)));
    progressText.textContent = `${Math.round(progress)}%`;
    if (progress >= 84) {
      progressBar.classList.add('ld-progress-done');
    } else {
      progressBar.classList.remove('ld-progress-done');
    }
  };
  const setActiveSegment = (index) => {
    if (!segments.length) return;
    segments.forEach((segment, segmentIndex) => {
      segment.classList.remove('ld-seg-active', 'ld-seg-done');
      if (segmentIndex < index) segment.classList.add('ld-seg-done');
      if (segmentIndex === index) segment.classList.add('ld-seg-active');
    });
  };
  const animateStage = (fromValue, toValue, label, activeIndex, duration = 360) => new Promise((resolve) => {
    const start = performance.now();
    stageText.textContent = label;
    setActiveSegment(activeIndex);

    const tick = (now) => {
      const elapsed = Math.min(1, (now - start) / duration);
      const nextValue = fromValue + ((toValue - fromValue) * easeOutCubic(elapsed));
      updateProgress(nextValue);
      if (elapsed < 1) {
        requestAnimationFrame(tick);
      } else {
        resolve(toValue);
      }
    };

    requestAnimationFrame(tick);
  });

  const stages = [
    { progress: 10, text: 'Opening Pizza Hut data foundation...', pause: 140 },
    {
      progress: 28,
      text: 'Building weekly KPI baselines...',
      task: async () => {
        await loadKPIs();
      }
    },
    {
      progress: 48,
      text: 'Loading pricing scenarios and segment inputs...',
      task: async () => {
        await loadScenariosData();
        populateElasticityModelTabs();
        if (window.segmentEngine) {
          const segmentDataLoaded = await window.segmentEngine.loadSegmentData();
          if (!segmentDataLoaded) {
            console.error('Failed to load segmentation data');
          }
        } else {
          console.error('Segmentation engine not available');
        }
      }
    },
    {
      progress: 68,
      text: 'Preparing elasticity views and current-state workspace...',
      task: async () => {
        await loadElasticityAnalytics();
      }
    },
    {
      progress: 84,
      text: 'Connecting AI guidance to loaded context...',
      task: async () => {
        await initializeChatContext();
      }
    },
    {
      progress: 96,
      text: 'Finalizing explorer surfaces...',
      task: async () => {
        initializeDataViewer();
        await initializeYumFoundationWorkspace();
        await initializeYumScenarioStudio();
      }
    },
    { progress: 100, text: 'Data foundation ready.', pause: 220 }
  ];

  try {
    updateProgress(0);
    setActiveSegment(0);

    let currentProgress = 0;
    for (let i = 0; i < stages.length; i++) {
      const stage = stages[i];
      currentProgress = await animateStage(
        currentProgress,
        stage.progress,
        stage.text,
        Math.min(i, Math.max(segments.length - 1, 0))
      );

      if (stage.task) {
        await stage.task();
      }

      if (stage.pause) {
        await delay(stage.pause);
      }
    }

    segments.forEach((segment) => {
      segment.classList.remove('ld-seg-active');
      segment.classList.add('ld-seg-done');
    });

    await delay(420);

    const loadDataSection = document.getElementById('load-data-section');
    const kpiSection = document.getElementById('kpi-section');
    document.body.classList.remove('app-loading-step');
    if (loadDataSection) loadDataSection.style.display = 'none';
    if (kpiSection) kpiSection.style.display = 'block';

    if (window.segmentEngine && window.segmentEngine.isDataLoaded()) {
      initializeSegmentationSection();
      initializeSegmentComparison();
      initializeExportButtons();
    }

    try {
      await initializeEventCalendar();
      console.log('Event Calendar initialized');
    } catch (error) {
      console.error('Event Calendar initialization failed:', error);
    }

    initializePopovers();
    dataLoaded = true;

    if (window.goToStep && typeof window.goToStep === 'function') {
      const targetStep = Number.isInteger(window.postLoadStep) ? window.postLoadStep : 1;
      window.postLoadStep = null;
      window.goToStep(targetStep);
    }

    initializePyodideModels().then((success) => {
      if (success) {
        console.log('Pyodide Python models ready to use');
      } else {
        console.log('Pyodide initialization failed, using JavaScript fallback');
      }
    });
  } catch (error) {
    console.error('Error loading data:', error);
    progressBar.classList.remove('ld-progress-done');
    progressBar.style.background = 'linear-gradient(90deg, #dc2626, #f97316)';
    stageText.textContent = `Error loading data: ${error.message}`;
    document.body.classList.remove('app-loading-step');
    await delay(3000);
    btn.style.display = 'inline-block';
    btn.disabled = false;
  }
}

// Save current scenario
function saveScenario() {
  const activeResult = currentResultByModel[activeModelType];
  if (!activeResult) return;

  savedScenariosByModel[activeModelType].push({
    ...activeResult,
    savedAt: new Date().toISOString()
  });
  savedScenarios = savedScenariosByModel[activeModelType];

  updateScenarioComparisonUI();

  alert(`Scenario "${activeResult.scenario_name}" saved! You can now compare it with other scenarios.`);
}

// Compare saved scenarios
function compareScenarios() {
  if (savedScenarios.length < 2) {
    alert('Please save at least 2 scenarios to compare.');
    return;
  }

  // Prepare data for grouped bar chart with proper null/undefined handling
  const barChartData = savedScenarios.map(s => {
    // Calculate repeat_loss_pct if not already present
    const repeatLossPct = s.delta.repeat_loss_rate_pct ||
      (s.delta.repeat_loss_rate && s.baseline && s.baseline.repeat_loss_rate
        ? (s.delta.repeat_loss_rate / s.baseline.repeat_loss_rate) * 100
        : 0);

    return {
      name: s.scenario_name || 'Unnamed Scenario',
      customers_pct: s.delta?.customers_pct || 0,
      revenue_pct: s.delta?.revenue_pct || 0,
      aov_pct: s.delta?.aov_pct || 0,
      repeat_loss_pct: repeatLossPct,
      repeat_loss_pct: repeatLossPct
    };
  });

  // Prepare data for radar chart with proper null/undefined handling
  const radarChartData = savedScenarios.map(s => {
    // Calculate repeat_loss_rate_pct if not already present
    const repeatLossPct = s.delta.repeat_loss_rate_pct ||
      (s.delta.repeat_loss_rate && s.baseline && s.baseline.repeat_loss_rate
        ? (s.delta.repeat_loss_rate / s.baseline.repeat_loss_rate) * 100
        : 0);

    // Calculate CLTV change estimate (simple approximation if not available)
    const cltvPct = s.delta?.cltv_pct ||
      ((s.delta?.revenue_pct || 0) - (repeatLossPct * 0.5));

    return {
      name: s.scenario_name || 'Unnamed Scenario',
      dimensions: {
        revenue: s.delta?.revenue_pct || 0,
        growth: s.delta?.customers_pct || 0,
        aov: s.delta?.aov_pct || 0,
        churn: repeatLossPct,
        cltv: cltvPct
      }
    };
  });

  // Render charts
  renderComparisonBarChart('comparison-bar-chart', barChartData, { width: 750, height: 450 });
  renderRadarChart('comparison-radar-chart', radarChartData, { width: 500, height: 500 });

  // Show comparison charts
  document.getElementById('comparison-charts').style.display = 'block';

  // Scroll to comparison
  document.getElementById('comparison-section').scrollIntoView({ behavior: 'smooth' });
}

// Clear saved scenarios
function clearScenarios() {
  if (savedScenarios.length === 0) return;

  if (confirm('Are you sure you want to clear all saved scenarios?')) {
    savedScenariosByModel[activeModelType] = [];
    savedScenarios = savedScenariosByModel[activeModelType];

    // Also clear rankings for this model
    if (window.currentTop3ScenariosByModel) {
      window.currentTop3ScenariosByModel[activeModelType] = null;
    }

    updateScenarioComparisonUI();
    updateDecisionEngineDisplay();
  }
}

function cleanAssistantText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function getElementOwnText(element) {
  if (!element) return '';
  const clone = element.cloneNode(true);
  clone.querySelectorAll('button').forEach((button) => button.remove());
  return cleanAssistantText(clone.textContent);
}

function getTextById(id) {
  return cleanAssistantText(document.getElementById(id)?.textContent || '');
}

function getListTexts(id, limit = 4) {
  return Array.from(document.querySelectorAll(`#${id} li`))
    .map((item) => cleanAssistantText(item.textContent))
    .filter(Boolean)
    .slice(0, limit);
}

function getSelectedOptionText(id) {
  const select = document.getElementById(id);
  if (!select) return '';
  return cleanAssistantText(select.options?.[select.selectedIndex]?.text || select.value || '');
}

function getActivePillTexts(containerId, limit = 6) {
  return Array.from(document.querySelectorAll(`#${containerId} .filter-pill.active`))
    .map((pill) => cleanAssistantText(pill.textContent))
    .filter(Boolean)
    .slice(0, limit);
}

function getCheckedFilterTexts(containerSelector) {
  return Array.from(document.querySelectorAll(`${containerSelector} input[type="checkbox"]:checked`))
    .map((input) => {
      const label = document.querySelector(`label[for="${input.id}"]`);
      return cleanAssistantText(label?.textContent || input.id);
    })
    .filter(Boolean);
}

function getSectionMeta(sectionId) {
  const section = document.getElementById(sectionId);
  if (!section) return null;
  return {
    stepLabel: getElementOwnText(section.querySelector('.section-number')),
    title: getElementOwnText(section.querySelector('.section-title')),
    subtitle: cleanAssistantText(section.querySelector('.section-subtitle')?.textContent || '')
  };
}

function buildDataExplorerContext() {
  const activeDataset = cleanAssistantText(document.querySelector('.dataset-item.active span')?.textContent || '');
  const lines = [];
  if (activeDataset) lines.push(`Selected dataset: ${activeDataset}`);
  if (getTextById('dataset-title')) lines.push(`Dataset title: ${getTextById('dataset-title')}`);
  if (getTextById('dataset-description')) lines.push(`Dataset description: ${getTextById('dataset-description')}`);
  if (getTextById('dataset-records') || getTextById('dataset-columns') || getTextById('dataset-date-range')) {
    lines.push(`Dataset shape: ${[getTextById('dataset-records'), getTextById('dataset-columns'), getTextById('dataset-date-range')].filter(Boolean).join(' | ')}`);
  }
  if (getTextById('dataset-chart-caption')) lines.push(`Current quick visual: ${getTextById('dataset-chart-caption')}`);
  return lines;
}

function buildOverviewContext() {
  const kpis = [
    `${getTextById('kpi-customers-label')}: ${getTextById('kpi-customers')} (${getTextById('kpi-customers-change')})`,
    `${getTextById('kpi-revenue-label')}: ${getTextById('kpi-revenue')} (${getTextById('kpi-revenue-change')})`,
    `${getTextById('kpi-aov-label')}: ${getTextById('kpi-aov')} (${getTextById('kpi-aov-change')})`,
    `${getTextById('kpi-churn-label')}: ${getTextById('kpi-churn')} (${getTextById('kpi-churn-change')})`
  ].filter((line) => !line.includes(':  ()'));

  const lines = [];
  const architecture = [
    `${getTextById('overview-tier-primary-band')} | ${getTextById('overview-tier-primary-name')}: ${getTextById('overview-tier-primary-price')} | ${getTextById('overview-tier-primary-copy')}`,
    `${getTextById('overview-tier-secondary-band')} | ${getTextById('overview-tier-secondary-name')}: ${getTextById('overview-tier-secondary-price')} | ${getTextById('overview-tier-secondary-copy')}`
  ].filter((line) => !line.startsWith(':'));
  if (architecture.length) lines.push(`Current price architecture: ${architecture.join(' || ')}`);
  if (kpis.length) lines.push(`KPIs: ${kpis.join(' | ')}`);
  if (getTextById('kpi-insight-text')) lines.push(`Decision context: ${getTextById('kpi-insight-text')}`);
  return lines;
}

function buildCohortContext() {
  const lines = [
    `Selected axis: ${getSelectedOptionText('segment-axis-select')}`,
    `Selected visualization: ${getSelectedOptionText('segment-viz-select')}`,
    `Filter summary: ${getTextById('filter-stats')}`
  ].filter(Boolean);

  const activeFilters = [
    ...getActivePillTexts('acquisition-filters'),
    ...getActivePillTexts('engagement-filters'),
    ...getActivePillTexts('monetization-filters')
  ];
  if (activeFilters.length) lines.push(`Active cohort filters: ${activeFilters.join(', ')}`);

  const insights = getListTexts('segment-auto-insights-list');
  if (insights.length) lines.push(`Auto insights: ${insights.join(' || ')}`);
  if (getTextById('step4-recommendation-text')) lines.push(`Recommended action: ${getTextById('step4-recommendation-text')}`);
  if (getTextById('segment-detail-body')) lines.push(`Focused cohort detail: ${getTextById('segment-detail-body')}`);
  return lines;
}

function buildSegmentComparisonContext() {
  const lines = [
    `Selected axis: ${getSelectedOptionText('compare-axis-select')} (${getTextById('compare-axis-helper')})`,
    `Selected channel group: ${getSelectedOptionText('compare-tier-select')}`,
    `Sort order: ${getSelectedOptionText('compare-sort-select')}`
  ].filter(Boolean);

  if (getTextById('segment-analysis-insight-title')) {
    lines.push(`Insight banner: ${getTextById('segment-analysis-insight-title')} | ${getTextById('segment-analysis-insight-text')}`);
  }
  if (getTextById('segment-highlight-risk')) lines.push(`Highest risk segment: ${getTextById('segment-highlight-risk')}`);
  if (getTextById('segment-highlight-opportunity')) lines.push(`Best pricing opportunity: ${getTextById('segment-highlight-opportunity')}`);
  const decisionSummary = Array.from(document.querySelectorAll('#segment-decision-summary .segment-analysis-summary-line'))
    .map((line) => cleanAssistantText(line.textContent))
    .filter(Boolean);
  if (decisionSummary.length) lines.push(`Decision summary: ${decisionSummary.join(' || ')}`);
  return lines;
}

function buildAcquisitionContext() {
  const lines = [
    `Selected cohort: ${getSelectedOptionText('acq-cohort-select')}`,
    `Selected order channel: ${getSelectedOptionText('acq-tier-select')}`,
    `Current price test: ${getTextById('acq-price-display')} (${getTextById('acq-price-change')})`,
    `Elasticity coefficient: ${getTextById('acq-elasticity')}`,
    `Traffic impact: ${getTextById('acq-impact')}`,
    `Projected weekly orders: ${getTextById('acq-total-subs')}`,
    `Revenue impact: ${getTextById('acq-total-revenue')}`
  ].filter(Boolean);

  if (getTextById('acq-optimal-range')) {
    lines.push(`Optimal price suggestion: ${getTextById('acq-optimal-context')} | ${getTextById('acq-optimal-range')} | ${getTextById('acq-optimal-supporting')} | ${getTextById('acq-optimal-note')}`);
  }
  const summaryBullets = getListTexts('acq-summary-bullets');
  if (summaryBullets.length) lines.push(`Screen summary: ${summaryBullets.join(' || ')}`);
  const actionBullets = getListTexts('acq-action-bullets');
  if (actionBullets.length) lines.push(`Recommended next actions: ${actionBullets.join(' || ')}`);
  return lines;
}

function buildPromotionContext() {
  const lines = [];
  if (getTextById('event-count-badge')) lines.push(`Visible timeline event count: ${getTextById('event-count-badge')}`);
  if (getTextById('promo-dependency-kicker')) {
    lines.push(`Promo dependency banner: ${getTextById('promo-dependency-kicker')} | ${getTextById('promo-dependency-title')} | ${getTextById('promo-dependency-copy')} | ${getTextById('promo-dependency-note')}`);
  }

  const summaryCards = [
    `Campaign themes: ${getTextById('promo-summary-official-count')} (${getTextById('promo-summary-official-note')})`,
    `Modeled promotion windows: ${getTextById('promo-summary-modeled-count')} (${getTextById('promo-summary-modeled-note')})`,
    `Average discount: ${getTextById('promo-summary-discount')} (${getTextById('promo-summary-discount-note')})`,
    `Primary channel pressure: ${getTextById('promo-summary-channel')} (${getTextById('promo-summary-channel-note')})`,
    `Promo dependency: ${getTextById('promo-summary-dependency')} (${getTextById('promo-summary-dependency-note')})`
  ].filter((line) => !line.includes(':  ()'));
  if (summaryCards.length) lines.push(`Summary cards: ${summaryCards.join(' | ')}`);

  const strategyReadout = getListTexts('promo-strategy-readout');
  if (strategyReadout.length) lines.push(`Campaign strategy readout: ${strategyReadout.join(' || ')}`);
  if (getTextById('campaign-patterns-readout')) lines.push(`Modeled campaign pattern note: ${getTextById('campaign-patterns-readout')}`);
  const checkedFilters = getCheckedFilterTexts('#event-calendar-section .btn-group');
  if (checkedFilters.length) lines.push(`Active timeline filters: ${checkedFilters.join(', ')}`);
  if (getTextById('promo-decision-title')) {
    lines.push(`Decision recommendation: ${getTextById('promo-decision-title')} | ${getTextById('promo-decision-risk')}`);
  }
  return lines;
}

function buildScreenContext(sectionId) {
  const meta = getSectionMeta(sectionId);
  if (!meta) return '';

  let details = [];
  switch (sectionId) {
    case 'section-2':
      details = buildDataExplorerContext();
      break;
    case 'section-1':
      details = buildOverviewContext();
      break;
    case 'section-6':
      details = buildCohortContext();
      break;
    case 'section-7':
      details = buildSegmentComparisonContext();
      break;
    case 'section-3':
      details = buildAcquisitionContext();
      break;
    case 'section-8':
      details = buildPromotionContext();
      break;
    default:
      details = [];
  }

  return [
    `Active step: ${meta.stepLabel} - ${meta.title}`,
    meta.subtitle ? `Screen purpose: ${meta.subtitle}` : '',
    ...details
  ].filter(Boolean).join('\n');
}

function resolveChatContextSectionId(preferredInput = null) {
  const panel = preferredInput?.closest?.('[data-chat-panel]');
  if (panel?.dataset.chatScreen) {
    return panel.dataset.chatScreen;
  }

  const activeSectionId = document.querySelector('.section.active')?.id || window.yumCurrentSectionId || null;
  if (activeSectionId === 'section-9') {
    return window.yumChatPinnedScreenId || window.yumLastAnalysisSectionId || 'section-9';
  }

  return activeSectionId;
}

function setAssistantInputsDisabled(disabled) {
  document.querySelectorAll('.assistant-chat-input, .assistant-chat-send-btn, .suggested-query').forEach((node) => {
    node.disabled = disabled;
  });
}

function getChatInputElement(preferredInput = null) {
  if (preferredInput && preferredInput instanceof HTMLElement) return preferredInput;
  const activeElement = document.activeElement;
  if (activeElement instanceof HTMLElement && activeElement.classList.contains('assistant-chat-input')) {
    return activeElement;
  }
  return document.getElementById('chat-input') || document.querySelector('.assistant-chat-input');
}

// Handle chat message send
async function handleChatSend(preferredInput = null) {
  const input = getChatInputElement(preferredInput);
  if (!input) return;
  const message = input.value.trim();

  if (!message) return;

  input.value = '';
  setAssistantInputsDisabled(true);
  const contextSectionId = resolveChatContextSectionId(input);
  const contextBlock = contextSectionId ? buildScreenContext(contextSectionId) : '';

  try {
    await sendMessage(message, { contextBlock });
  } finally {
    setAssistantInputsDisabled(false);
    input.focus();
  }
}

// Open Scenario Editor
function openScenarioEditor(scenarioId) {
  const scenario = allScenarios.find(s => s.id === scenarioId);
  if (!scenario) return;

  // Populate form
  document.getElementById('edit-scenario-id').value = scenario.id;
  document.getElementById('edit-scenario-name').value = scenario.name;
  document.getElementById('edit-tier').value = scenario.config.tier.replace('_', ' ').toUpperCase();
  document.getElementById('edit-current-price').value = scenario.config.current_price;
  document.getElementById('edit-new-price').value = scenario.config.new_price;

  // Show constraints
  const constraints = scenario.constraints;
  document.getElementById('price-constraints').textContent =
    `Valid range: $${constraints.min_price} - $${constraints.max_price}`;

  // Show promotion settings if applicable
  if (scenario.config.promotion) {
    document.getElementById('promotion-settings').style.display = 'block';
    document.getElementById('edit-discount-pct').value = scenario.config.promotion.discount_pct;
    document.getElementById('edit-duration-months').value = scenario.config.promotion.duration_months;
  } else {
    document.getElementById('promotion-settings').style.display = 'none';
  }

  // Update price change indicator
  updatePriceChangeIndicator();

  // Show modal
  const modal = new bootstrap.Modal(document.getElementById('scenarioEditorModal'));
  modal.show();
}

// Update price change indicator
function updatePriceChangeIndicator() {
  const currentPrice = parseFloat(document.getElementById('edit-current-price').value);
  const newPrice = parseFloat(document.getElementById('edit-new-price').value);

  if (currentPrice && newPrice) {
    const change = ((newPrice - currentPrice) / currentPrice) * 100;
    const indicator = document.getElementById('price-change-indicator');
    indicator.textContent = `${change >= 0 ? '+' : ''}${change.toFixed(1)}%`;
    indicator.className = 'input-group-text';
    if (change > 0) indicator.classList.add('bg-danger', 'text-white');
    else if (change < 0) indicator.classList.add('bg-success', 'text-white');
  }
}

// Save edited scenario
async function saveEditedScenario() {
  const scenarioId = document.getElementById('edit-scenario-id').value;
  const scenario = allScenarios.find(s => s.id === scenarioId);
  if (!scenario) return;

  // Get new values
  const newPrice = parseFloat(document.getElementById('edit-new-price').value);
  const discountPct = document.getElementById('edit-discount-pct').value ?
    parseFloat(document.getElementById('edit-discount-pct').value) : null;
  const durationMonths = document.getElementById('edit-duration-months').value ?
    parseInt(document.getElementById('edit-duration-months').value) : null;

  // Validate constraints
  if (newPrice < scenario.constraints.min_price || newPrice > scenario.constraints.max_price) {
    alert(`Price must be between $${scenario.constraints.min_price} and $${scenario.constraints.max_price}`);
    return;
  }

  // Update scenario
  scenario.config.new_price = newPrice;
  scenario.config.price_change_pct = ((newPrice - scenario.config.current_price) / scenario.config.current_price) * 100;

  if (scenario.config.promotion && discountPct && durationMonths) {
    scenario.config.promotion.discount_pct = discountPct;
    scenario.config.promotion.duration_months = durationMonths;

    // Recalculate promo price
    scenario.config.new_price = scenario.config.current_price * (1 - discountPct / 100);
  }

  // Update description
  if (scenario.category === 'promotion') {
    scenario.name = `Launch ${discountPct}% Off Promo (${durationMonths} months)`;
    scenario.description = `Offer ${discountPct}% discount for ${durationMonths} months on ${scenario.config.tier.replace('_', '-')} tier`;
  } else {
    const priceDiff = newPrice - scenario.config.current_price;
    scenario.name = `${scenario.config.tier.replace('_', ' ')} ${priceDiff >= 0 ? '+' : ''}$${Math.abs(priceDiff).toFixed(2)}`;
  }

  // Close modal properly to avoid focus issues
  const modalElement = document.getElementById('scenarioEditorModal');
  const modalInstance = bootstrap.Modal.getInstance(modalElement);
  if (modalInstance) {
    modalInstance.hide();
  }

  // Wait for modal to close animation
  await new Promise(resolve => setTimeout(resolve, 300));

  // Reload scenario data and refresh tabs
  await loadScenariosData();
  populateElasticityModelTabs();

  // If this was the selected scenario, re-select it
  const modelType = scenario.model_type;
  if (selectedScenarioByModel[modelType] && selectedScenarioByModel[modelType].id === scenarioId) {
    selectedScenarioByModel[modelType] = scenario;
    if (modelType === activeModelType) {
      selectedScenario = scenario;
      syncScenarioSelectionUI();
      updateSimulateButtonState();
    }
  }

  alert('Scenario updated! Click "Simulate" to see the new results.');
}

// Initialize Bootstrap popovers for ML methodology
function initializePopovers() {
  const popoverTriggerList = document.querySelectorAll('[data-bs-toggle="popover"]');
  const popoverList = [...popoverTriggerList].map(popoverTriggerEl => {
    return new bootstrap.Popover(popoverTriggerEl, {
      html: true,
      sanitize: false,
      trigger: 'focus'
    });
  });
}

// ========== Segmentation Section Functions ==========

const SEGMENT_AXIS_HELPERS = {
  acquisition: 'Price Sensitivity - Promo Driven',
  engagement: 'Loyalty & Retention',
  monetization: 'Basket Value & Spend'
};

const SEGMENT_AXIS_VIS_META = {
  acquisition: {
    label: 'Acquisition',
    positive: 'Low sensitivity',
    neutral: 'Moderate',
    negative: 'Highly sensitive'
  },
  engagement: {
    label: 'Engagement',
    positive: 'Stable loyalty',
    neutral: 'Mixed retention',
    negative: 'High repeat-loss risk'
  },
  monetization: {
    label: 'Monetization',
    positive: 'Basket headroom',
    neutral: 'Watch closely',
    negative: 'High basket risk'
  }
};

function setSegmentAxisHelperText() {
  setElementText('segment-axis-helper-acquisition', SEGMENT_AXIS_HELPERS.acquisition);
  setElementText('segment-axis-helper-engagement', SEGMENT_AXIS_HELPERS.engagement);
  setElementText('segment-axis-helper-monetization', SEGMENT_AXIS_HELPERS.monetization);
}

function formatShare(value, total) {
  if (!Number.isFinite(value) || !Number.isFinite(total) || total <= 0) return '0%';
  return `${((value / total) * 100).toFixed(0)}%`;
}

function getSegmentAxisSentiment(axis, value) {
  if (!Number.isFinite(value)) return 'neutral';

  if (axis === 'acquisition') {
    const magnitude = Math.abs(value);
    if (magnitude >= 2.0) return 'negative';
    if (magnitude >= 1.0) return 'neutral';
    return 'positive';
  }

  if (axis === 'engagement') {
    if (value >= 1.5) return 'negative';
    if (value >= 0.7) return 'neutral';
    return 'positive';
  }

  if (value >= 1.3) return 'negative';
  if (value >= 0.8) return 'neutral';
  return 'positive';
}

function renderSegmentVisualizationGuide(vizType, axis, tierSegments, aggregatedKPIs) {
  const container = document.getElementById('segment-viz-guide');
  if (!container) return;

  const axisMeta = SEGMENT_AXIS_VIS_META[axis] || SEGMENT_AXIS_VIS_META.engagement;
  const totalCustomers = Number(aggregatedKPIs?.total_customers || 0);
  const repeatLoss = Number(aggregatedKPIs?.weighted_repeat_loss || 0);
  const aov = Number(aggregatedKPIs?.weighted_aov || 0);
  const totalSegments = Array.isArray(tierSegments) ? tierSegments.length : 0;

  const guideByViz = {
    heatmap: {
      title: `${axisMeta.label} heatmap guide`,
      copy: `Each cell combines two cohort dimensions and rolls up the matching customers into one decision tile. This avoids the over-plotted view and keeps the color scale aligned to the active ${axisMeta.label.toLowerCase()} axis.`,
      items: [
        { label: 'Cell meaning', value: 'One tile = one cohort intersection, weighted by customer count.' },
        { label: 'Primary read', value: `Color shows ${axisMeta.label.toLowerCase()} risk. Tile labels show weighted elasticity.` },
        { label: 'Support metric', value: totalCustomers ? `${formatNumber(totalCustomers)} customers across ${totalSegments} visible cohort combinations.` : 'Waiting for cohort data.' }
      ]
    },
    '3axis': {
      title: '3-axis map guide',
      copy: 'The map now uses the filtered cohort set and keeps points inside a consistent 3-axis frame. Bubble size shows customer base, and color follows the active axis risk instead of always showing repeat loss.',
      items: [
        { label: 'Bubble size', value: 'Larger bubbles = larger customer base.' },
        { label: 'Bubble color', value: `${axisMeta.negative} to ${axisMeta.positive}, based on the active axis.` },
        { label: 'Current view', value: totalCustomers ? `${formatNumber(totalCustomers)} customers with ${formatPercent(repeatLoss, 1)} repeat loss and ${formatCurrency(aov)} AOV.` : 'Waiting for cohort data.' }
      ]
    },
    scatter: {
      title: `${axisMeta.label} scatter guide`,
      copy: 'This scatter isolates the active elasticity axis. It is meant to answer which cohorts are both large enough to matter and risky enough to change the pricing recommendation.',
      items: [
        { label: 'X axis', value: 'Customer count for each filtered cohort combination.' },
        { label: 'Y axis', value: `${axisMeta.label} elasticity for the selected channel group.` },
        { label: 'Bubble size', value: `Average order value, currently ${formatCurrency(aov)} on a weighted basis.` }
      ]
    },
    channel: {
      title: 'Channel readout guide',
      copy: 'This view is kept separate from the cohort maps. Use it to compare channel posture and then bring the pricing decision back to the cohort views for who-to-protect and where-to-push.',
      items: [
        { label: 'Bar chart', value: 'Compares elasticity across channels.' },
        { label: 'Heatmap', value: 'Shows where channel risk clusters by channel group.' },
        { label: 'Use with', value: 'Pair this with cohort views before making a broad price move.' }
      ]
    }
  };

  const guide = guideByViz[vizType] || guideByViz.heatmap;
  container.innerHTML = `
    <div class="segment-viz-guide-title">${guide.title}</div>
    <div class="segment-viz-guide-copy">${guide.copy}</div>
    <div class="segment-viz-guide-grid">
      ${guide.items.map(item => `
        <div class="segment-viz-guide-item">
          <div class="segment-viz-guide-label">${item.label}</div>
          <div class="segment-viz-guide-value">${item.value}</div>
        </div>
      `).join('')}
    </div>
    <div class="segment-viz-guide-scale">
      <span class="segment-viz-guide-chip is-positive">${axisMeta.positive}</span>
      <span class="segment-viz-guide-chip is-neutral">${axisMeta.neutral}</span>
      <span class="segment-viz-guide-chip is-negative">${axisMeta.negative}</span>
    </div>
  `;
}

function aggregateSegmentsByAxis(segments, tier, axisKey) {
  const axisMap = new Map();

  segments.forEach((segment) => {
    const key = segment[axisKey];
    const customers = parseFloat(segment.customer_count || 0);
    const repeatLoss = parseFloat(segment.repeat_loss_rate || 0);
    const aov = parseFloat(segment.avg_order_value || 0);
    const promoRate = parseFloat(segment.promo_redemption_rate || 0);
    const acquisitionElasticity = Math.abs(window.segmentEngine.getElasticity(tier, segment.compositeKey, 'acquisition') || 0);

    const current = axisMap.get(key) || {
      key,
      label: window.segmentEngine.formatSegmentLabel(key),
      customers: 0,
      weightedRepeatLoss: 0,
      weightedAov: 0,
      weightedPromoRate: 0,
      weightedAcquisitionElasticity: 0
    };

    current.customers += customers;
    current.weightedRepeatLoss += repeatLoss * customers;
    current.weightedAov += aov * customers;
    current.weightedPromoRate += promoRate * customers;
    current.weightedAcquisitionElasticity += acquisitionElasticity * customers;
    axisMap.set(key, current);
  });

  return [...axisMap.values()]
    .map((entry) => ({
      ...entry,
      repeatLoss: entry.customers > 0 ? entry.weightedRepeatLoss / entry.customers : 0,
      avgOrderValue: entry.customers > 0 ? entry.weightedAov / entry.customers : 0,
      promoRate: entry.customers > 0 ? entry.weightedPromoRate / entry.customers : 0,
      acquisitionElasticity: entry.customers > 0 ? entry.weightedAcquisitionElasticity / entry.customers : 0
    }))
    .sort((left, right) => right.customers - left.customers);
}

function setSegmentInsightContent(insights = [], recommendationText = 'No recommendation available yet.') {
  setListItems('segment-auto-insights-list', insights);
  setElementText('step4-recommendation-text', recommendationText);
}

function updateSegmentInsightCards(tierSegments, tier, aggregatedKPIs) {
  if (!window.segmentEngine || !tierSegments?.length) {
    setSegmentInsightContent(
      ['No cohorts match the current filters. Widen the filters to rebuild the cohort readout.'],
      'Recommended action: Clear or widen filters before making a pricing decision.'
    );
    return;
  }

  const totalCustomers = tierSegments.reduce((sum, segment) => sum + parseFloat(segment.customer_count || 0), 0);
  const overallRepeatLoss = parseFloat(aggregatedKPIs?.weighted_repeat_loss || 0);
  const overallAov = parseFloat(aggregatedKPIs?.weighted_aov || 0);

  const acquisitionGroups = aggregateSegmentsByAxis(tierSegments, tier, 'acquisition');
  const engagementGroups = aggregateSegmentsByAxis(tierSegments, tier, 'engagement');

  const highSensitivityCustomers = tierSegments.reduce((sum, segment) => {
    const customers = parseFloat(segment.customer_count || 0);
    const acquisitionElasticity = Math.abs(window.segmentEngine.getElasticity(tier, segment.compositeKey, 'acquisition') || 0);
    const promoRate = parseFloat(segment.promo_redemption_rate || 0);
    return sum + ((acquisitionElasticity >= 1.8 || promoRate >= 0.18) ? customers : 0);
  }, 0);

  const highSensitivityShare = totalCustomers > 0 ? (highSensitivityCustomers / totalCustomers) * 100 : 0;
  const topPriceSensitiveGroup = acquisitionGroups
    .filter(group => group.acquisitionElasticity >= 1.8 || group.promoRate >= 0.18)
    .sort((left, right) => (right.customers * right.acquisitionElasticity) - (left.customers * left.acquisitionElasticity))[0] || acquisitionGroups[0];

  const atRiskEngagementGroups = engagementGroups
    .filter(group => group.repeatLoss >= Math.max(overallRepeatLoss * 1.05, 0.12))
    .sort((left, right) => (right.customers * right.repeatLoss) - (left.customers * left.repeatLoss));

  const resilientPricingGroups = engagementGroups
    .filter(group => group.repeatLoss <= Math.max(overallRepeatLoss * 0.9, 0.1) && group.avgOrderValue >= overallAov)
    .sort((left, right) => (right.avgOrderValue * right.customers) - (left.avgOrderValue * left.customers));

  const avoidGroups = [];
  if (topPriceSensitiveGroup) {
    avoidGroups.push(topPriceSensitiveGroup.label);
  }
  if (atRiskEngagementGroups[0] && !avoidGroups.includes(atRiskEngagementGroups[0].label)) {
    avoidGroups.push(atRiskEngagementGroups[0].label);
  }

  const focusGroup = resilientPricingGroups.find(group => !avoidGroups.includes(group.label))
    || engagementGroups
      .slice()
      .sort((left, right) => (left.repeatLoss - right.repeatLoss) || (right.avgOrderValue - left.avgOrderValue))
      .find(group => !avoidGroups.includes(group.label))
    || resilientPricingGroups[0]
    || engagementGroups[0];

  const insights = [
    highSensitivityShare >= 30
      ? `${highSensitivityShare.toFixed(0)}% of customers are in highly price-sensitive cohorts. Avoid broad price increases.`
      : `${highSensitivityShare.toFixed(0)}% of customers are in highly price-sensitive cohorts. Pricing can stay targeted instead of broad-based.`,
    topPriceSensitiveGroup
      ? `${topPriceSensitiveGroup.label} is the biggest sensitivity watch-out, representing ${formatShare(topPriceSensitiveGroup.customers, totalCustomers)} of customers with ${topPriceSensitiveGroup.acquisitionElasticity.toFixed(2)} acquisition elasticity.`
      : 'No single price-sensitive cohort dominates the current mix.',
    focusGroup
      ? `${focusGroup.label} is the best pricing focus cohort right now, with ${formatCurrency(focusGroup.avgOrderValue)} average order value and ${(focusGroup.repeatLoss * 100).toFixed(1)}% repeat-loss risk.`
      : 'No resilient cohort stands out clearly enough yet to concentrate pricing.'
  ];

  const recommendationText = avoidGroups.length && focusGroup
    ? `Recommended action: Avoid price increases for ${joinNaturalList(avoidGroups)}. Focus pricing on ${focusGroup.label}.`
    : highSensitivityShare >= 30
      ? 'Recommended action: Avoid broad price increases and keep pricing changes narrow until the most price-sensitive cohorts are stabilized.'
      : 'Recommended action: Use cohort-level pricing instead of one blanket move, and prioritize the most resilient cohorts first.';

  setSegmentInsightContent(insights, recommendationText);
}

/**
 * Initialize the segmentation section
 */
function initializeSegmentationSection() {
  setSegmentAxisHelperText();

  // Populate filter pills for each axis
  populateFilterPills(
    'acquisition-filters',
    window.segmentEngine.axisDefinitions.acquisition,
    'acquisition'
  );
  populateFilterPills(
    'engagement-filters',
    window.segmentEngine.axisDefinitions.engagement,
    'engagement'
  );
  populateFilterPills(
    'monetization-filters',
    window.segmentEngine.axisDefinitions.monetization,
    'monetization'
  );

  // Set up event listeners for controls
  const tierSelector = document.getElementById('segment-tier-select');
  const axisSelector = document.getElementById('segment-axis-select');
  const vizTypeSelector = document.getElementById('segment-viz-select');
  const clearFiltersBtn = document.getElementById('clear-filters-btn');

  tierSelector.addEventListener('change', updateSegmentVisualization);
  axisSelector.addEventListener('change', updateSegmentVisualization);
  vizTypeSelector.addEventListener('change', updateSegmentVisualization);
  clearFiltersBtn.addEventListener('click', clearAllFilters);

  // 3-axis view buttons
  const reset3AxisBtn = document.getElementById('reset-3axis-btn');
  const export3AxisBtn = document.getElementById('export-3axis-btn');

  if (reset3AxisBtn) {
    reset3AxisBtn.addEventListener('click', () => {
      updateSegmentVisualization();
    });
  }

  if (export3AxisBtn) {
    export3AxisBtn.addEventListener('click', () => {
      const tier = document.getElementById('segment-tier-select').value;
      const filename = `segment-3axis-${tier}-${new Date().toISOString().slice(0, 10)}.svg`;
      exportSVG('three-axis-radial-viz', filename);
    });
  }

  // Initial render
  updateSegmentVisualization();
}

/**
 * Populate cohort selector options
 * @param {string} selectId - Select element ID
 */
function populateCohortSelector(selectId) {
  const selector = document.getElementById(selectId);
  if (!selector || !window.segmentEngine) return;

  const cohorts = window.segmentEngine.getCohortDefinitions();
  if (!cohorts.length) return;

  selector.innerHTML = '';
  cohorts.forEach(cohort => {
    const option = document.createElement('option');
    option.value = cohort.id;
    option.textContent = cohort.label;
    if (cohort.id === window.segmentEngine.getActiveCohort()) {
      option.selected = true;
    }
    selector.appendChild(option);
  });
}

/**
 * Keep cohort selectors in sync (only Step 5 now)
 * @param {string} cohortId - Selected cohort id
 */
function syncCohortSelectors(cohortId) {
  // Only Step 5 has cohort selector now
  const selector = document.getElementById('compare-cohort-select');
  if (selector && selector.value !== cohortId) {
    selector.value = cohortId;
  }
}

/**
 * Populate filter pills for a specific axis
 * @param {string} containerId - Container element ID
 * @param {Array<string>} values - Filter values
 * @param {string} axisType - Axis type (engagement, monetization, acquisition)
 */
function populateFilterPills(containerId, values, axisType) {
  const container = document.getElementById(containerId);
  if (!container) return;

  container.innerHTML = '';

  values.forEach(value => {
    const pill = document.createElement('div');
    pill.className = 'filter-pill';
    pill.dataset.value = value;
    pill.dataset.axis = axisType;
    pill.textContent = window.segmentEngine.formatSegmentLabel(value);

    // Toggle active state on click
    pill.addEventListener('click', () => {
      pill.classList.toggle('active');
      updateSegmentVisualization();
    });

    container.appendChild(pill);
  });
}

/**
 * Update segment visualization based on current filters and selections.
 * Cohort views use segment data (segments.csv, segment_kpis.csv, segment_elasticity.json).
 */
function updateSegmentVisualization() {
  const tier = document.getElementById('segment-tier-select').value;
  const axis = document.getElementById('segment-axis-select').value;
  const vizType = document.getElementById('segment-viz-select').value;

  const heatmapView = document.getElementById('heatmap-view');
  const threeAxisView = document.getElementById('3axis-view');
  const scatterView = document.getElementById('scatter-view');

  // Cohort views require segment engine and data
  if (!window.segmentEngine || !window.segmentEngine.isDataLoaded()) {
    if (heatmapView) heatmapView.style.display = 'none';
    if (threeAxisView) threeAxisView.style.display = 'none';
    if (scatterView) scatterView.style.display = 'none';

    const kpiDashboard = document.getElementById('segment-kpi-dashboard');
    if (kpiDashboard) {
      kpiDashboard.innerHTML =
        '<div class="alert alert-warning mb-0"><i class="bi bi-exclamation-triangle me-2"></i>Cohort data not loaded. Load the data foundation first to use this screen.</div>';
    }
    setSegmentInsightContent(
      ['Cohort data is not loaded yet, so cohort-specific insights are unavailable.'],
      'Recommended action: Load cohort data before using this screen for pricing decisions.'
    );
    renderSegmentVisualizationGuide(vizType, axis, [], null);
    return;
  }

  // Collect active filters
  const filters = {
    acquisition: getActivePillValues('acquisition-filters'),
    engagement: getActivePillValues('engagement-filters'),
    monetization: getActivePillValues('monetization-filters')
  };

  // Get filtered segments (with cohort adjustments applied)
  const filteredSegments = window.segmentEngine.filterSegments(filters);

  // Filter by selected tier
  const tierSegments = filteredSegments.filter(s => s.tier === tier);

  // Aggregate KPIs (cohort adjustments already applied in filterSegments)
  const aggregatedKPIs = window.segmentEngine.aggregateKPIs(tierSegments);

  // Render KPI cards
  renderSegmentKPICards('segment-kpi-dashboard', aggregatedKPIs);
  updateSegmentInsightCards(tierSegments, tier, aggregatedKPIs);
  renderSegmentVisualizationGuide(vizType, axis, tierSegments, aggregatedKPIs);
  updateFilterSummary();

  // Show/hide views based on visualization type
  if (vizType === 'heatmap') {
    if (heatmapView) heatmapView.style.display = 'block';
    if (threeAxisView) threeAxisView.style.display = 'none';
    if (scatterView) scatterView.style.display = 'none';
    renderSegmentElasticityHeatmap('segment-elasticity-heatmap', tier, filters, axis);
  } else if (vizType === '3axis') {
    if (heatmapView) heatmapView.style.display = 'none';
    if (threeAxisView) threeAxisView.style.display = 'block';
    if (scatterView) scatterView.style.display = 'none';
    render3AxisRadialChart('three-axis-radial-viz', tier, axis, tierSegments, null);
  } else if (vizType === 'scatter') {
    if (heatmapView) heatmapView.style.display = 'none';
    if (threeAxisView) threeAxisView.style.display = 'none';
    if (scatterView) scatterView.style.display = 'block';
    renderSegmentScatterPlot('segment-scatter-plot', tier, axis, tierSegments);
  }

  // Refresh watchlist whenever visualization updates
}

/**
 * Get active pill values from a container
 * @param {string} containerId - Container element ID
 * @returns {Array<string>} Array of active filter values
 */
function getActivePillValues(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return [];

  const activePills = container.querySelectorAll('.filter-pill.active');
  return Array.from(activePills).map(pill => pill.dataset.value);
}

/**
 * Clear all filter pills
 */
function clearAllFilters() {
  // Remove active class from all pills
  document.querySelectorAll('.filter-pill.active').forEach(pill => {
    pill.classList.remove('active');
  });

  // Update visualization
  updateSegmentVisualization();
}

/**
 * Render segment comparison table
 */
const SEGMENT_COMPARISON_AXIS_META = {
  acquisition: {
    title: 'Acquisition',
    helper: 'Price Sensitivity - Promo Driven',
    chartLabel: 'Absolute Price Sensitivity',
    guide: [
      { label: 'Highly sensitive', threshold: '< -2.0', note: 'High risk. Avoid broad price increases and keep promo support in place.' },
      { label: 'Moderate', threshold: '-2.0 to -1.0', note: 'Use selective pricing with channel or cohort support.' },
      { label: 'Low sensitivity', threshold: '> -1.0', note: 'Safer for disciplined pricing if demand remains healthy.' }
    ]
  },
  engagement: {
    title: 'Engagement',
    helper: 'Loyalty & Retention',
    chartLabel: 'Repeat-Loss Elasticity',
    guide: [
      { label: 'High risk', threshold: '> 1.5', note: 'High repeat-loss risk. Protect loyalty and avoid blanket price moves.' },
      { label: 'Moderate', threshold: '0.7 to 1.5', note: 'Mixed sensitivity. Use targeted pricing with retention support.' },
      { label: 'Low sensitivity', threshold: '< 0.7', note: 'Stable repeat behavior. Better candidates for selective pricing.' }
    ]
  },
  monetization: {
    title: 'Monetization',
    helper: 'Basket Value & Spend',
    chartLabel: 'Basket / Migration Elasticity',
    guide: [
      { label: 'High risk', threshold: '> 1.3', note: 'High migration risk. Protect value cues before testing price.' },
      { label: 'Moderate', threshold: '0.8 to 1.3', note: 'Some switching risk. Test with focused offers only.' },
      { label: 'Low sensitivity', threshold: '< 0.8', note: 'Stronger basket behavior. Best area for measured pricing tests.' }
    ]
  }
};

function getSegmentComparisonAxisMeta(axis) {
  return SEGMENT_COMPARISON_AXIS_META[axis] || SEGMENT_COMPARISON_AXIS_META.engagement;
}

function getSegmentComparisonTierLabel(tier) {
  return tier === 'ad_supported' ? 'Entry & Value' : 'Core & Premium';
}

function getSegmentComparisonRiskLevel(axis, elasticity) {
  if (axis === 'engagement') {
    return elasticity < 0.7 ? 'Low' : (elasticity < 1.5 ? 'Medium' : 'High');
  }

  if (axis === 'acquisition') {
    const absElasticity = Math.abs(elasticity);
    return absElasticity < 1.0 ? 'Low' : (absElasticity < 2.0 ? 'Medium' : 'High');
  }

  if (axis === 'monetization') {
    return elasticity < 0.8 ? 'Low' : (elasticity < 1.3 ? 'Medium' : 'High');
  }

  return 'Medium';
}

function getSegmentComparisonRiskScore(item, axis) {
  if (axis === 'acquisition') {
    return (Math.abs(item.elasticity) * 100) + ((item.promo_redemption_rate || 0) * 25) + ((item.repeat_loss_rate || 0) * 15);
  }

  if (axis === 'engagement') {
    return (item.elasticity * 100) + ((item.repeat_loss_rate || 0) * 120) - ((item.avg_order_value || 0) * 0.4);
  }

  return (item.elasticity * 100) - ((item.avg_order_value || 0) * 1.4) + ((item.repeat_loss_rate || 0) * 40);
}

function getSegmentComparisonOpportunityScore(item, axis) {
  if (axis === 'acquisition') {
    return ((3 - Math.abs(item.elasticity)) * 100) + ((item.customers || 0) / 100) + ((item.avg_order_value || 0) * 0.4);
  }

  if (axis === 'engagement') {
    return ((2 - item.elasticity) * 100) + (((0.22 - (item.repeat_loss_rate || 0)) * 100)) + ((item.customers || 0) / 120);
  }

  return ((2 - item.elasticity) * 100) + ((item.avg_order_value || 0) * 2.5) + ((item.customers || 0) / 150);
}

function getSegmentComparisonTopRisk(comparisonData, axis, count = 1) {
  return [...comparisonData]
    .sort((a, b) => getSegmentComparisonRiskScore(b, axis) - getSegmentComparisonRiskScore(a, axis))
    .slice(0, count);
}

function getSegmentComparisonTopOpportunities(comparisonData, axis, count = 1) {
  return [...comparisonData]
    .sort((a, b) => getSegmentComparisonOpportunityScore(b, axis) - getSegmentComparisonOpportunityScore(a, axis))
    .slice(0, count);
}

function formatSegmentComparisonLabelList(items, count = 2) {
  const labels = items
    .slice(0, count)
    .map(item => item.label)
    .filter(Boolean);

  if (!labels.length) return 'the selected cohorts';
  if (labels.length === 1) return labels[0];
  if (labels.length === 2) return `${labels[0]} and ${labels[1]}`;
  return `${labels.slice(0, -1).join(', ')}, and ${labels[labels.length - 1]}`;
}

function getWeightedComparisonAverage(comparisonData, field) {
  const totalCustomers = comparisonData.reduce((sum, item) => sum + (item.customers || 0), 0);
  if (!totalCustomers) return 0;

  return comparisonData.reduce((sum, item) => {
    return sum + ((item[field] || 0) * (item.customers || 0));
  }, 0) / totalCustomers;
}

function buildSegmentComparisonData(axis, tier) {
  if (!window.segmentEngine || !window.segmentEngine.isDataLoaded()) {
    return [];
  }

  const segments = window.segmentEngine.getSegmentsForTier(tier);
  const axisSegments = [...new Set(segments.map(segment => segment[axis]))];

  return axisSegments.map(segmentId => {
    const matching = segments.filter(segment => segment[axis] === segmentId);
    const totalCustomers = matching.reduce((sum, segment) => sum + (parseInt(segment.customer_count, 10) || 0), 0);

    const weightedAverage = (field) => {
      if (!totalCustomers) return 0;
      return matching.reduce((sum, segment) => {
        return sum + ((parseFloat(segment[field]) || 0) * (parseInt(segment.customer_count, 10) || 0));
      }, 0) / totalCustomers;
    };

    const weightedElasticity = totalCustomers
      ? matching.reduce((sum, segment) => {
        const elasticity = window.segmentEngine.getElasticity(tier, segment.compositeKey, axis) || 0;
        return sum + (elasticity * (parseInt(segment.customer_count, 10) || 0));
      }, 0) / totalCustomers
      : 0;

    return {
      segment: segmentId,
      label: window.segmentEngine.formatSegmentLabel(segmentId),
      customers: totalCustomers,
      repeat_loss_rate: weightedAverage('repeat_loss_rate'),
      avg_order_value: weightedAverage('avg_order_value'),
      promo_redemption_rate: weightedAverage('promo_redemption_rate'),
      elasticity: weightedElasticity,
      risk_level: getSegmentComparisonRiskLevel(axis, weightedElasticity)
    };
  });
}

function sortSegmentComparisonData(comparisonData, sortBy, axis) {
  comparisonData.sort((a, b) => {
    switch (sortBy) {
      case 'elasticity':
        return axis === 'acquisition' ? a.elasticity - b.elasticity : b.elasticity - a.elasticity;
      case 'customers':
        return b.customers - a.customers;
      case 'churn':
        return b.repeat_loss_rate - a.repeat_loss_rate;
      case 'aov':
        return b.avg_order_value - a.avg_order_value;
      default:
        return 0;
    }
  });
}

function buildSegmentComparisonInsightBanner(axis, comparisonData, highestRisk, bestOpportunity) {
  const highRiskCount = comparisonData.filter(item => item.risk_level === 'High').length;
  const lowRiskCount = comparisonData.filter(item => item.risk_level === 'Low').length;
  const weightedAov = getWeightedComparisonAverage(comparisonData, 'avg_order_value');

  if (axis === 'acquisition') {
    const title = highRiskCount === comparisonData.length
      ? 'All acquisition segments are reading as highly price sensitive'
      : `${highRiskCount} of ${comparisonData.length} acquisition segments are highly price sensitive`;
    const text = `${highestRisk.label} is the most exposed entry cohort, while ${bestOpportunity.label} is the steadiest place to hold the line. Avoid broad price increases and keep promotional support focused on the most promo-driven shoppers.`;
    return { title, text };
  }

  if (axis === 'engagement') {
    const title = 'Engagement segments need targeted pricing, not a blanket move';
    const text = `${bestOpportunity.label} is the most stable loyalty cohort in this view, while ${highestRisk.label} shows the greatest repeat-loss risk. Keep retention-first pricing for the sensitive segments and use selective pricing only where loyalty is holding.`;
    return { title, text };
  }

  const title = `${lowRiskCount} of ${comparisonData.length} monetization segments are low-risk basket segments`;
  const text = `${bestOpportunity.label} has the strongest pricing headroom, supported by average order value near ${formatCurrency(weightedAov)}. ${highestRisk.label} still needs value cues, so keep changes measured instead of pushing the whole basket architecture at once.`;
  return { title, text };
}

function getSegmentComparisonHighlightMetric(axis, item, type) {
  if (type === 'risk') {
    if (axis === 'acquisition') {
      return `Elasticity ${item.elasticity.toFixed(2)} | Promo response ${formatPercent(item.promo_redemption_rate, 1)}`;
    }

    if (axis === 'engagement') {
      return `Repeat-loss elasticity ${item.elasticity.toFixed(2)} | Repeat loss ${formatPercent(item.repeat_loss_rate, 1)}`;
    }

    return `Elasticity ${item.elasticity.toFixed(2)} | AOV ${formatCurrency(item.avg_order_value)}`;
  }

  if (axis === 'acquisition') {
    return `Lowest sensitivity in the current view | ${formatNumber(item.customers)} customers`;
  }

  if (axis === 'engagement') {
    return `Most stable repeat base | ${formatPercent(item.repeat_loss_rate, 1)} repeat loss`;
  }

  return `Best basket-value headroom | AOV ${formatCurrency(item.avg_order_value)}`;
}

function getSegmentComparisonHighlightDetail(axis, item, type) {
  if (type === 'risk') {
    if (axis === 'acquisition') {
      return 'Avoid broad price increases here. Protect traffic with value-led promotions and entry-point offers.';
    }

    if (axis === 'engagement') {
      return 'Lead with retention and loyalty protection here before testing any price movement.';
    }

    return 'Keep value cues and bundle framing in place before testing basket-level pricing changes.';
  }

  if (axis === 'acquisition') {
    return 'If pricing needs to move, start with the least promo-dependent acquisition segment first.';
  }

  if (axis === 'engagement') {
    return 'This is the cleanest loyalty cohort for selective pricing without broad repeat-loss pressure.';
  }

  return 'This segment shows the clearest room for measured price tests with lower churn risk.';
}

function buildSegmentDecisionSummaryLine(axis, tier, selectedAxis) {
  const comparisonData = buildSegmentComparisonData(axis, tier);
  const meta = getSegmentComparisonAxisMeta(axis);

  if (!comparisonData.length) {
    return `
      <div class="segment-analysis-summary-line${selectedAxis === axis ? ' is-active' : ''}">
        <div class="segment-analysis-summary-axis">${meta.title}</div>
        <div>Segment guidance will appear here once the cohort data is loaded.</div>
      </div>
    `;
  }

  const riskSegments = getSegmentComparisonTopRisk(comparisonData, axis, 2);
  const opportunitySegments = getSegmentComparisonTopOpportunities(comparisonData, axis, 2);
  let sentence = '';

  if (axis === 'acquisition') {
    sentence = `Avoid price increases for ${formatSegmentComparisonLabelList(riskSegments)}. Keep promotional support in place and use ${formatSegmentComparisonLabelList(opportunitySegments, 1)} as the safest segment for any disciplined pricing hold.`;
  } else if (axis === 'engagement') {
    sentence = `Apply selective pricing for ${formatSegmentComparisonLabelList(opportunitySegments)}. Protect ${formatSegmentComparisonLabelList(riskSegments)} with loyalty and retention-led offers instead of blanket price moves.`;
  } else {
    sentence = `Increase prices selectively for ${formatSegmentComparisonLabelList(opportunitySegments)} where basket value is strongest. Keep visible value cues for ${formatSegmentComparisonLabelList(riskSegments)} while basket risk stays elevated.`;
  }

  return `
    <div class="segment-analysis-summary-line${selectedAxis === axis ? ' is-active' : ''}">
      <div class="segment-analysis-summary-axis">${meta.title}</div>
      <div>${sentence}</div>
    </div>
  `;
}

function renderSegmentComparisonNarrative(axis, tier, comparisonData) {
  const meta = getSegmentComparisonAxisMeta(axis);
  const tierLabel = getSegmentComparisonTierLabel(tier);
  const helperEl = document.getElementById('compare-axis-helper');
  const kickerEl = document.getElementById('segment-analysis-insight-kicker');
  const titleEl = document.getElementById('segment-analysis-insight-title');
  const textEl = document.getElementById('segment-analysis-insight-text');
  const livePillEl = document.getElementById('segment-analysis-live-pill');
  const guideEl = document.getElementById('segment-elasticity-guide');
  const riskEl = document.getElementById('segment-highlight-risk');
  const opportunityEl = document.getElementById('segment-highlight-opportunity');
  const decisionEl = document.getElementById('segment-decision-summary');

  if (helperEl) helperEl.textContent = meta.helper;
  if (kickerEl) kickerEl.textContent = `${meta.title} pricing readout`;
  if (livePillEl) livePillEl.textContent = `${tierLabel} view`;

  if (!comparisonData.length) {
    if (titleEl) titleEl.textContent = 'No segment comparison data available';
    if (textEl) textEl.textContent = 'Load the data foundation first to generate the comparison narrative.';
    if (guideEl) {
      guideEl.innerHTML = `
        <div class="segment-analysis-guide-chip">
          <div>
            <span class="segment-analysis-guide-label">Waiting for data</span>
            <span class="segment-analysis-guide-note">The elasticity guide will update from the active axis.</span>
          </div>
        </div>
      `;
    }
    if (riskEl) {
      riskEl.innerHTML = '<div class="segment-analysis-highlight-name">No data</div>';
    }
    if (opportunityEl) {
      opportunityEl.innerHTML = '<div class="segment-analysis-highlight-name">No data</div>';
    }
    if (decisionEl) {
      decisionEl.innerHTML = `
        <div class="segment-analysis-summary-line">
          <div>Load the data foundation first to generate pricing guidance.</div>
        </div>
      `;
    }
    return;
  }

  const highestRisk = getSegmentComparisonTopRisk(comparisonData, axis, 1)[0];
  const bestOpportunity = getSegmentComparisonTopOpportunities(comparisonData, axis, 1)[0];
  const banner = buildSegmentComparisonInsightBanner(axis, comparisonData, highestRisk, bestOpportunity);

  if (titleEl) titleEl.textContent = banner.title;
  if (textEl) textEl.textContent = banner.text;

  if (guideEl) {
    guideEl.innerHTML = meta.guide.map(item => `
      <div class="segment-analysis-guide-chip">
        <div>
          <span class="segment-analysis-guide-label">${item.label}</span>
          <span class="segment-analysis-guide-note">${item.note}</span>
        </div>
        <strong>${item.threshold}</strong>
      </div>
    `).join('');
  }

  if (riskEl && highestRisk) {
    riskEl.innerHTML = `
      <div class="segment-analysis-highlight-name">${highestRisk.label}</div>
      <div class="segment-analysis-highlight-metric">${getSegmentComparisonHighlightMetric(axis, highestRisk, 'risk')}</div>
      <div class="segment-analysis-highlight-detail">${getSegmentComparisonHighlightDetail(axis, highestRisk, 'risk')}</div>
      <span class="segment-analysis-highlight-tag is-risk">${highestRisk.risk_level} risk</span>
    `;
  }

  if (opportunityEl && bestOpportunity) {
    opportunityEl.innerHTML = `
      <div class="segment-analysis-highlight-name">${bestOpportunity.label}</div>
      <div class="segment-analysis-highlight-metric">${getSegmentComparisonHighlightMetric(axis, bestOpportunity, 'opportunity')}</div>
      <div class="segment-analysis-highlight-detail">${getSegmentComparisonHighlightDetail(axis, bestOpportunity, 'opportunity')}</div>
      <span class="segment-analysis-highlight-tag is-opportunity">Pricing opportunity</span>
    `;
  }

  if (decisionEl) {
    decisionEl.innerHTML = ['acquisition', 'engagement', 'monetization']
      .map(summaryAxis => buildSegmentDecisionSummaryLine(summaryAxis, tier, axis))
      .join('');
  }
}

function renderSegmentComparisonTable() {
  const axis = document.getElementById('compare-axis-select').value;
  const tier = document.getElementById('compare-tier-select').value;
  const sortBy = document.getElementById('compare-sort-select').value;
  const comparisonData = buildSegmentComparisonData(axis, tier);
  sortSegmentComparisonData(comparisonData, sortBy, axis);
  renderSegmentComparisonNarrative(axis, tier, comparisonData);

  // Render table
  const container = document.getElementById('segment-comparison-table');
  container.innerHTML = `
    <table class="table table-hover">
      <thead class="table-light">
        <tr>
          <th>Segment</th>
          <th class="text-end">Customers</th>
          <th class="text-end">Repeat Loss</th>
          <th class="text-end">Avg Order Value</th>
          <th class="text-end">Elasticity</th>
          <th class="text-center">Risk Level</th>
        </tr>
      </thead>
      <tbody>
        ${comparisonData.map(d => `
          <tr>
            <td><strong>${d.label}</strong></td>
            <td class="text-end">${formatNumber(d.customers)}</td>
            <td class="text-end">${formatPercent(d.repeat_loss_rate, 2)}</td>
            <td class="text-end">${formatCurrency(d.avg_order_value)}</td>
            <td class="text-end">
              <span class="badge ${d.risk_level === 'High' ? 'bg-danger' : (d.risk_level === 'Medium' ? 'bg-warning' : 'bg-success')}">
                ${d.elasticity.toFixed(2)}
              </span>
            </td>
            <td class="text-center">
              <span class="badge ${d.risk_level === 'High' ? 'bg-danger' : (d.risk_level === 'Medium' ? 'bg-warning' : 'bg-success')}">
                ${d.risk_level}
              </span>
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;

  // Render chart
  renderSegmentComparisonChart(comparisonData, axis);
}

/**
 * Render comparison chart (Chart.js bar chart)
 */
function renderSegmentComparisonChart(data, axis) {
  const ctx = document.getElementById('segment-comparison-chart');
  const axisMeta = getSegmentComparisonAxisMeta(axis);
  const chartValues = axis === 'acquisition'
    ? data.map(item => Math.abs(item.elasticity))
    : data.map(item => item.elasticity);

  if (window.comparisonChart) {
    window.comparisonChart.destroy();
  }

  window.comparisonChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: data.map(d => d.label),
      datasets: [{
        label: axisMeta.chartLabel,
        data: chartValues,
        backgroundColor: data.map(d =>
          d.risk_level === 'High' ? '#dc3545' : (d.risk_level === 'Medium' ? '#ffc107' : '#28a745')
        ),
        borderColor: '#fff',
        borderWidth: 1
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (context) => {
              const item = data[context.dataIndex];
              return [`Elasticity: ${item.elasticity.toFixed(2)}`, `Risk: ${item.risk_level}`];
            }
          }
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          title: { display: true, text: axisMeta.chartLabel }
        }
      }
    }
  });
}

/**
 * Initialize segment comparison table
 */
function initializeSegmentComparison() {
  const compareAxisSelect = document.getElementById('compare-axis-select');
  const compareTierSelect = document.getElementById('compare-tier-select');
  const compareSortSelect = document.getElementById('compare-sort-select');

  if (!compareAxisSelect || !compareTierSelect || !compareSortSelect) return;

  compareAxisSelect.addEventListener('change', renderSegmentComparisonTable);
  compareTierSelect.addEventListener('change', renderSegmentComparisonTable);
  compareSortSelect.addEventListener('change', renderSegmentComparisonTable);

  // Initial render
  renderSegmentComparisonTable();

  // Section stays hidden until user clicks "Explore Segments" button
  // document.getElementById('segment-analysis-section').style.display = 'block';
}

/**
 * Initialize filter presets
 */
function initializeFilterPresets() {
  document.querySelectorAll('[data-preset]').forEach(btn => {
    btn.addEventListener('click', () => {
      const preset = btn.dataset.preset;
      applyFilterPreset(preset);
    });
  });

  // Search toggle
  document.getElementById('filter-search-toggle')?.addEventListener('click', () => {
    const searchBox = document.getElementById('filter-search-box');
    searchBox.style.display = searchBox.style.display === 'none' ? 'block' : 'none';
  });

  // Search input
  document.getElementById('segment-search-input')?.addEventListener('input', (e) => {
    searchSegments(e.target.value);
  });
}

/**
 * Apply filter preset
 */
function applyFilterPreset(preset) {
  clearAllFilters();

  const tier = document.getElementById('segment-tier-select').value;
  const segments = window.segmentEngine.getSegmentsForTier(tier);

  let targetSegments = [];

  switch(preset) {
    case 'high-risk':
      // High repeat-loss rate (> 15%)
      targetSegments = segments
        .filter(s => parseFloat(s.repeat_loss_rate) > 0.15)
        .map(s => s.engagement);
      break;
    case 'low-elastic':
      // Low elasticity (> -2.0)
      targetSegments = segments
        .filter(s => {
          const elasticity = window.segmentEngine.getElasticity(tier, s.compositeKey, 'engagement');
          return elasticity > -2.0;
        })
        .map(s => s.engagement);
      break;
    case 'high-value':
      // High AOV (> $40)
      targetSegments = segments
        .filter(s => parseFloat(s.avg_order_value) > 40)
        .map(s => s.monetization);
      break;
    case 'large':
      // Large customer count (> 2000)
      targetSegments = segments
        .filter(s => parseInt(s.customer_count) > 2000)
        .map(s => s.acquisition);
      break;
  }

  // Activate relevant pills
  targetSegments = [...new Set(targetSegments)];
  targetSegments.forEach(segmentId => {
    const pill = document.querySelector(`[data-segment-id="${segmentId}"]`);
    if (pill) pill.classList.add('active');
  });

  updateSegmentVisualization();
  updateFilterSummary();
}

/**
 * Search segments by name
 */
function searchSegments(query) {
  const resultsContainer = document.getElementById('search-results');

  if (!query || query.length < 2) {
    resultsContainer.innerHTML = '';
    return;
  }

  const allSegments = [
    ...window.segmentEngine.axisDefinitions.acquisition,
    ...window.segmentEngine.axisDefinitions.engagement,
    ...window.segmentEngine.axisDefinitions.monetization
  ];

  const matches = allSegments.filter(segmentId => {
    const info = window.segmentEngine.getSegmentInfo(segmentId);
    const label = info ? info.label : segmentId;
    return label.toLowerCase().includes(query.toLowerCase());
  });

  resultsContainer.innerHTML = matches.map(segmentId => {
    const info = window.segmentEngine.getSegmentInfo(segmentId);
    return `
      <button class="btn btn-sm btn-outline-secondary me-2 mb-2"
              onclick="selectSegmentFromSearch('${segmentId}')">
        ${info ? info.label : segmentId}
      </button>
    `;
  }).join('');
}

/**
 * Select segment from search results
 */
window.selectSegmentFromSearch = function(segmentId) {
  const pill = document.querySelector(`[data-segment-id="${segmentId}"]`);
  if (pill) {
    pill.classList.add('active');
    updateSegmentVisualization();
    updateFilterSummary();
  }
};

/**
 * Update filter summary stats
 */
function updateFilterSummary() {
  const filters = {
    acquisition: getActivePillValues('acquisition-filters'),
    engagement: getActivePillValues('engagement-filters'),
    monetization: getActivePillValues('monetization-filters')
  };

  const tier = document.getElementById('segment-tier-select').value;
  const filteredSegments = window.segmentEngine.filterSegments(filters);
  const tierSegments = filteredSegments.filter(s => s.tier === tier);

  const totalSubs = tierSegments.reduce((sum, s) => sum + parseInt(s.customer_count || 0), 0);
  const activeAxis = document.getElementById('segment-axis-select')?.value || 'engagement';
  const axisLabel = SEGMENT_AXIS_VIS_META[activeAxis]?.label || 'Engagement';
  const tierLabel = tier === 'ad_supported' ? 'Entry & Value' : 'Core & Premium';
  const activeFilterCount = Object.values(filters).reduce((sum, values) => sum + values.length, 0);

  const statsElement = document.getElementById('filter-stats');
  if (tierSegments.length === window.segmentEngine.getSegmentsForTier(tier).length) {
    statsElement.innerHTML = `${tierLabel} cohorts | ${axisLabel} axis | ${formatNumber(totalSubs)} customers | No cohort filters applied`;
  } else {
    statsElement.innerHTML = `
      ${tierLabel} cohorts | ${axisLabel} axis | ${tierSegments.length} cohort combinations | ${formatNumber(totalSubs)} customers | ${activeFilterCount} active filter${activeFilterCount === 1 ? '' : 's'}
    `;
  }
}

/**
 * Export segments to CSV
 */
function exportSegmentsToCSV() {
  const tier = document.getElementById('segment-tier-select').value;
  const segments = window.segmentEngine.getSegmentsForTier(tier);
  const cohort = window.segmentEngine.getActiveCohort();

  const headers = [
    'Composite Key',
    'Acquisition',
    'Engagement',
    'Monetization',
    'Customers',
    'Repeat Loss',
    'Avg Order Value',
    'Elasticity'
  ];

  const rows = segments.map(seg => {
    const elasticity = window.segmentEngine.getElasticity(tier, seg.compositeKey, 'engagement');
    return [
      seg.compositeKey,
      seg.acquisition,
      seg.engagement,
      seg.monetization,
      seg.customer_count,
      seg.repeat_loss_rate,
      seg.avg_order_value,
      elasticity
    ];
  });

  const csv = [headers, ...rows].map(row => row.join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `segments-${tier}-${cohort}-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Export visualization to SVG
 */
function exportVisualizationToSVG(containerId, filename) {
  const container = document.getElementById(containerId);
  const svg = container.querySelector('svg');

  if (!svg) {
    alert('No SVG visualization found to export');
    return;
  }

  const serializer = new XMLSerializer();
  const svgString = serializer.serializeToString(svg);
  const blob = new Blob([svgString], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename || `visualization-${new Date().toISOString().slice(0, 10)}.svg`;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Initialize export buttons
 */
function initializeExportButtons() {
  document.getElementById('export-segments-csv')?.addEventListener('click', exportSegmentsToCSV);
  document.getElementById('export-viz-svg')?.addEventListener('click', () => {
    const vizType = document.getElementById('segment-viz-select').value;
    let containerId;
    switch(vizType) {
      case '3axis':
        containerId = 'three-axis-radial-viz';
        break;
      case 'scatter':
        containerId = 'segment-scatter-plot';
        break;
      default:
        containerId = 'segment-elasticity-heatmap';
    }
    exportVisualizationToSVG(containerId, `segment-viz-${vizType}.svg`);
  });
}

// Initialize app
async function init() {
  if (!window.yumSelectedBrandId) {
    window.yumSelectedBrandId = DEFAULT_YUM_BRAND_ID;
  }

  // Add event listeners
  document.getElementById('load-data-btn')?.addEventListener('click', loadData);
  // Old simulate-btn and save-scenario-btn removed - using tabbed interface now
  document.getElementById('save-scenario-btn-models')?.addEventListener('click', saveScenario);
  document.getElementById('compare-btn')?.addEventListener('click', compareScenarios);
  document.getElementById('clear-scenarios-btn')?.addEventListener('click', clearScenarios);

  // Chat event listeners
  document.getElementById('configure-llm')?.addEventListener('click', configureLLM);
  document.addEventListener('click', (event) => {
    const sendButton = event.target.closest('.assistant-chat-send-btn');
    if (sendButton) {
      const panel = sendButton.closest('[data-chat-panel]') || document;
      const input = panel.querySelector('.assistant-chat-input') || document.getElementById('chat-input');
      handleChatSend(input);
      return;
    }

    const resetButton = event.target.closest('.assistant-chat-reset-btn');
    if (resetButton) {
      clearHistory();
      document.querySelectorAll('.assistant-chat-input').forEach((input) => {
        input.value = '';
      });
      document.getElementById('chat-input')?.focus();
      return;
    }

    const suggestedQuery = event.target.closest('.suggested-query');
    if (suggestedQuery) {
      const query = suggestedQuery.textContent.trim();
      const panel = suggestedQuery.closest('[data-chat-panel]') || document;
      const input = panel.querySelector('.assistant-chat-input') || document.getElementById('chat-input');
      if (!input) return;
      input.value = query;
      handleChatSend(input);
      return;
    }

    const openFullChatButton = event.target.closest('[data-open-full-chat]');
    if (openFullChatButton) {
      window.yumChatPinnedScreenId = openFullChatButton.closest('[data-chat-panel]')?.dataset.chatScreen || window.yumLastAnalysisSectionId || null;
      window.goToStep?.(9);
    }
  });

  document.addEventListener('keypress', (event) => {
    const chatInput = event.target.closest('.assistant-chat-input');
    if (chatInput && event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      handleChatSend(chatInput);
    }
  });

  // Initialize popovers (will be initialized again after data loads)
  initializePopovers();

  // Scenario editor event listeners
  document.getElementById('edit-new-price')?.addEventListener('input', updatePriceChangeIndicator);
  document.getElementById('save-edited-scenario-btn')?.addEventListener('click', saveEditedScenario);

  // Make loadData available globally so it can be called when navigating to step 1
  window.loadAppData = loadData;
  window.dataLoaded = false;
}

// Start app
init().catch(error => {
  console.error('Failed to initialize app:', error);
  alert('Failed to load application. Please check console for details.');
});

/**
 * Populate scenarios into elasticity model tabs
 * Filters scenarios by model_type and displays them in respective tabs
 */
function populateElasticityModelTabs() {
  const scenarios = allScenarios;
  if (!scenarios || scenarios.length === 0) {
    console.error('No scenarios loaded');
    return;
  }

  // Filter scenarios by model type
  const acquisitionScenarios = scenarios.filter(s => s.model_type === 'acquisition');
  const churnScenarios = scenarios.filter(s => s.model_type === 'churn');
  const migrationScenarios = scenarios.filter(s => s.model_type === 'migration');

  console.log(`Populating tabs: Acquisition(${acquisitionScenarios.length}), Churn(${churnScenarios.length}), Migration(${migrationScenarios.length})`);

  // Populate acquisition tab
  const acquisitionContainer = document.getElementById('acquisition-scenarios');
  if (acquisitionContainer) {
    acquisitionContainer.innerHTML = acquisitionScenarios.map(scenario => createScenarioCard(scenario)).join('');
  }

  // Populate churn tab
  const churnContainer = document.getElementById('churn-scenarios');
  if (churnContainer) {
    churnContainer.innerHTML = churnScenarios.map(scenario => createScenarioCard(scenario)).join('');
  }

  // Populate migration tab with custom order
  const migrationContainer = document.getElementById('migration-scenarios');
  if (migrationContainer) {
    // Custom order: Bundle first, iOS second, Basic last
    const migrationOrder = ['scenario_008', 'scenario_010', 'scenario_005'];
    const sortedMigration = migrationScenarios.sort((a, b) => {
      const indexA = migrationOrder.indexOf(a.id);
      const indexB = migrationOrder.indexOf(b.id);
      if (indexA === -1 && indexB === -1) return 0;
      if (indexA === -1) return 1;
      if (indexB === -1) return -1;
      return indexA - indexB;
    });
    migrationContainer.innerHTML = sortedMigration.map(scenario => createScenarioCard(scenario)).join('');
  }

  // Add click handlers for scenario cards
  document.querySelectorAll('.scenario-card-tab').forEach(card => {
    card.addEventListener('click', function(e) {
      // Don't select if clicking edit button
      if (e.target.closest('.edit-scenario-btn-tab')) return;

      const pane = this.closest('.tab-pane');
      if (pane) {
        pane.querySelectorAll('.scenario-card-tab').forEach(c => c.classList.remove('selected'));
      }
      this.classList.add('selected');

      const scenarioId = this.dataset.scenarioId;
      const selected = scenarios.find(s => s.id === scenarioId);
      if (selected) {
        selectedScenarioByModel[selected.model_type] = selected;
        if (selected.model_type !== activeModelType) {
          setActiveModelType(selected.model_type);
        } else {
          selectedScenario = selected;
        }
        updateSimulateButtonState();
        console.log('Selected scenario:', scenarioId);
      }
    });
  });

  // Add click handlers for edit buttons in tabs
  document.querySelectorAll('.edit-scenario-btn-tab').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const scenarioId = btn.dataset.scenarioId;
      openScenarioEditor(scenarioId);
    });
  });

  // Add decision engine event listeners (RFP Slide 18)
  const objectiveLensSelect = document.getElementById('objective-lens-select');
  if (objectiveLensSelect) {
    objectiveLensSelect.addEventListener('change', (e) => {
      const description = getObjectiveDescription(e.target.value);
      document.getElementById('objective-description').textContent = description;
    });
  }

  const rankScenariosBtn = document.getElementById('rank-scenarios-btn');
  if (rankScenariosBtn) {
    rankScenariosBtn.addEventListener('click', rankAndDisplayScenarios);
  }

  // Export button event listeners
  const exportPdfBtn = document.getElementById('export-pdf-btn');
  const exportXlsxBtn = document.getElementById('export-xlsx-btn');

  if (exportPdfBtn) {
    exportPdfBtn.addEventListener('click', async () => {
      try {
        exportPdfBtn.disabled = true;
        exportPdfBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Generating PDF...';

        // Get current top 3 scenarios from the UI
        const top3Container = document.getElementById('top-scenarios-list');
        const currentTop3 = window.currentTop3ScenariosByModel?.[activeModelType] || [];
        if (!top3Container || currentTop3.length === 0) {
          alert('Please rank scenarios first to generate a decision pack.');
          return;
        }

        const objective = document.getElementById('objective-lens-select').value;

        await exportToPDF(currentTop3, objective, {});

      } catch (error) {
        console.error('Error exporting PDF:', error);
        alert('Error generating PDF: ' + error.message);
      } finally {
        exportPdfBtn.disabled = false;
        exportPdfBtn.innerHTML = '<i class="bi bi-file-pdf me-2"></i>Export to PDF';
      }
    });
  }

  if (exportXlsxBtn) {
    exportXlsxBtn.addEventListener('click', async () => {
      try {
        exportXlsxBtn.disabled = true;
        exportXlsxBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Generating Excel...';

        // Export all saved scenarios with top 3 highlighted
        if (!savedScenarios || savedScenarios.length === 0) {
          alert('No saved scenarios to export. Please save at least one scenario first.');
          return;
        }

        const currentTop3 = window.currentTop3ScenariosByModel?.[activeModelType] || null;
        await exportToXLSX(savedScenarios, currentTop3);

      } catch (error) {
        console.error('Error exporting XLSX:', error);
        alert('Error generating Excel file: ' + error.message);
      } finally {
        exportXlsxBtn.disabled = false;
        exportXlsxBtn.innerHTML = '<i class="bi bi-file-excel me-2"></i>Export to Excel';
      }
    });
  }

  // Track active model tab for model-scoped state
  document.querySelectorAll('#elasticityTabs .nav-link').forEach(tab => {
    tab.addEventListener('click', (e) => {
      const modelType = getModelTypeFromTabId(e.currentTarget.id);
      setActiveModelType(modelType);
    });
    tab.addEventListener('shown.bs.tab', (e) => {
      const modelType = getModelTypeFromTabId(e.target.id);
      setActiveModelType(modelType);
    });
  });

  // Only auto-detect active tab on first load (when activeModelType is not set)
  // Don't do this on subsequent calls because setActiveModelType is called before populateElasticityModelTabs()
  // Doing auto-detection on every call was causing the active model to be overwritten during step navigation
  // because the tab links weren't being updated, only the tab panes
  if (!activeModelType) {
    const activeTab = document.querySelector('#elasticityTabs .nav-link.active');
    if (activeTab) {
      setActiveModelType(getModelTypeFromTabId(activeTab.id));
    }
  }

  // Add simulate button handler (remove old handler first to prevent duplicates)
  const simulateBtn = document.getElementById('simulate-btn-models');
  if (simulateBtn) {
    // Clone and replace button to remove all event listeners
    const newSimulateBtn = simulateBtn.cloneNode(true);
    simulateBtn.parentNode.replaceChild(newSimulateBtn, simulateBtn);

    newSimulateBtn.addEventListener('click', async function() {
      const activeScenario = selectedScenarioByModel[activeModelType];
      if (!activeScenario) {
        console.warn('⚠️ No scenario selected!');
        return;
      }

      console.log('🎬 Starting simulation for:', activeScenario.id, activeScenario.name);

      const resultContainer = document.getElementById('result-container-models');

      try {
        newSimulateBtn.disabled = true;
        newSimulateBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Simulating...';
        const loadingState = startSimulateLoading();

        console.log('📝 Scenario config:', {
          tier: activeScenario.config.tier,
          current_price: activeScenario.config.current_price,
          new_price: activeScenario.config.new_price,
          price_change: activeScenario.config.new_price - activeScenario.config.current_price,
          price_change_pct: ((activeScenario.config.new_price - activeScenario.config.current_price) / activeScenario.config.current_price * 100).toFixed(2) + '%',
          model_type: activeScenario.model_type
        });

        // Run simulation with Pyodide if available, otherwise fallback to JS
        let result;
        if (isPyodideAvailable()) {
          console.log('✅ Using Pyodide Python models');
          newSimulateBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Running Python models...';
          result = await simulateScenarioWithPyodide(activeScenario, {
            targetSegment: 'all',
            segmentAxis: null
          });
      } else {
        console.log('⚠️ Pyodide not ready, using JavaScript simulation');
        result = await simulateScenario(activeScenario, {
          targetSegment: 'all',
          segmentAxis: null
        });
      }
      result.model_type = activeScenario.model_type;

      // Debug: Verify result has correct model_type before displaying
      console.log(`🎯 Simulation complete for ${activeScenario.model_type}:`, {
        scenario_id: result.scenario_id,
        model_type: result.model_type,
        activeModelType: activeModelType
      });

      await loadingState.done;
      loadingState.stop();

        // Display results in the new containers
        displayResultsInTabs(result);

        resultContainer.style.display = 'block';
        resultContainer.scrollIntoView({ behavior: 'smooth' });

      } catch (error) {
        console.error('Error simulating scenario:', error);
        alert('Error running simulation: ' + error.message);
      } finally {
        newSimulateBtn.disabled = false;
        newSimulateBtn.innerHTML = '<i class="bi bi-play-fill me-2"></i>Simulate Selected Scenario';
        const loadingEl = document.getElementById('simulate-loading');
        if (loadingEl) loadingEl.style.display = 'none';
      }
    });
  }
}

// Expose populateElasticityModelTabs globally for step navigation
window.populateElasticityModelTabs = populateElasticityModelTabs;
window.setActiveModelType = setActiveModelType;
window.hideScenarioResults = hideScenarioResults;
window.getCurrentResultForModel = function(modelType) {
  return currentResultByModel[modelType] || null;
};

/**
 * Create scenario card HTML for tabs
 */
function createScenarioCard(scenario) {
  const priorityBadge = {
    'high': '<span class="badge bg-danger">High</span>',
    'medium': '<span class="badge bg-warning">Medium</span>',
    'low': '<span class="badge bg-secondary">Low</span>',
    'n/a': ''
  }[scenario.priority] || '';

  return `
    <div class="col-md-4">
      <div class="card scenario-card-tab h-100" data-scenario-id="${scenario.id}">
        <div class="card-body">
          <div class="d-flex justify-content-between align-items-center mb-2">
            <h6 class="card-title mb-0 flex-grow-1">${scenario.name}</h6>
            <div class="scenario-card-actions">
              ${priorityBadge}
              <button class="btn btn-sm btn-outline-secondary edit-scenario-btn-tab ms-1" data-scenario-id="${scenario.id}" title="Edit parameters">
                <i class="bi bi-pencil"></i>
              </button>
            </div>
          </div>
          <p class="card-text small text-muted mb-2">${scenario.description}</p>
          <div class="small text-muted">
            <i class="bi bi-lightbulb me-1"></i>
            ${scenario.business_rationale}
          </div>
        </div>
      </div>
    </div>
  `;
}

/**
 * Calculate acquisition payback period (RFP Slide 15)
 * Payback = Months to recover customer acquisition cost through revenue
 * Formula: CAC / (AOV - marginal costs)
 */
function calculateAcquisitionPayback(result) {
  try {
    // Estimate CAC from modeled restaurant traffic benchmarks.
    // For promos, CAC is higher due to discount
    const isPromo = result.scenario_config?.promotional_status === true;
    const baseCAC = 35; // Industry median
    const promoCACMultiplier = isPromo ? 1.4 : 1.0;
    const estimatedCAC = baseCAC * promoCACMultiplier;

    // Monthly contribution margin = AOV - marginal costs (~30% of AOV for fulfillment/marketing)
    const aov = result.forecasted.aov || 0;
    const marginPercent = 0.70; // 70% contribution margin
    const monthlyContribution = aov * marginPercent;

    if (monthlyContribution <= 0) {
      return { value: 'N/A', label: 'Negative margin' };
    }

    const paybackMonths = estimatedCAC / monthlyContribution;

    // Format output
    if (paybackMonths > 24) {
      return { value: '>24', label: 'months' };
    } else if (paybackMonths < 1) {
      return { value: '<1', label: 'month' };
    } else {
      return { value: paybackMonths.toFixed(1), label: 'months' };
    }
  } catch (error) {
    console.error('Error calculating acquisition payback:', error);
    return { value: 'N/A', label: 'calc error' };
  }
}

/**
 * Calculate churn payback period (RFP Slide 16)
 * Churn Payback = Weeks until churn rate stabilizes after price change
 * Based on time-lagged churn model: 0-4, 4-8, 8-12, 12+ weeks
 */
function calculateChurnPayback(result) {
  try {
    // Check if we have time-lagged churn data
    const churnData = result.forecasted.repeat_loss_by_weeks || result.repeat_loss_by_weeks;

    if (churnData) {
      // Find when churn stabilizes (delta < 10% of peak)
      const weeks_0_4 = churnData.weeks_0_4 || 0;
      const weeks_4_8 = churnData.weeks_4_8 || 0;
      const weeks_8_12 = churnData.weeks_8_12 || 0;
      const weeks_12plus = churnData.weeks_12plus || 0;

      const peak = Math.max(weeks_0_4, weeks_4_8, weeks_8_12, weeks_12plus);
      const threshold = peak * 0.1;

      if (weeks_0_4 <= threshold) return { value: '<4', label: 'weeks' };
      if (weeks_4_8 <= threshold) return { value: '4-8', label: 'weeks' };
      if (weeks_8_12 <= threshold) return { value: '8-12', label: 'weeks' };
      return { value: '12+', label: 'weeks' };
    }

    // Fallback: Estimate based on churn delta magnitude
    const churnDelta = Math.abs(result.delta.repeat_loss_rate || 0);

    if (churnDelta < 0.01) {
      // Low impact: stabilizes quickly
      return { value: '<4', label: 'weeks' };
    } else if (churnDelta < 0.03) {
      // Medium impact: stabilizes in 4-8 weeks
      return { value: '4-8', label: 'weeks' };
    } else if (churnDelta < 0.05) {
      // High impact: stabilizes in 8-12 weeks
      return { value: '8-12', label: 'weeks' };
    } else {
      // Very high impact: takes 12+ weeks
      return { value: '12+', label: 'weeks' };
    }
  } catch (error) {
    console.error('Error calculating churn payback:', error);
    return { value: 'N/A', label: 'calc error' };
  }
}

/**
 * Display simulation results in the tabbed interface
 * @param {Object} result - The simulation result to display
 * @param {boolean} isRedisplay - True if this is re-displaying an existing result (don't re-store it)
 */
function displayResultsInTabs(result, isRedisplay = false) {
  const modelType = resolveModelTypeForResult(result);
  if (!modelType) {
    console.warn('Unable to resolve model type for result; skipping render', result);
    return;
  }

  // Ensure the result object has the correct model_type
  if (!result.model_type) {
    result.model_type = modelType;
  }

  // Verify that the result's model_type matches the resolved modelType
  if (result.model_type !== modelType) {
    console.warn(`⚠️ Result model_type mismatch! result.model_type=${result.model_type}, resolved=${modelType}. Using resolved.`);
    result.model_type = modelType;
  }

  // Only store the result if this is a NEW simulation, not a re-display
  if (!isRedisplay) {
    currentResultByModel[modelType] = result;
    console.log(`💾 Storing result for ${modelType} model:`, result.scenario_id);
  } else {
    console.log(`🔁 Re-displaying existing result for ${modelType} model:`, result.scenario_id);
  }

  // Debug logging
  console.log(`📊 displayResultsInTabs called`, {
    resolvedModelType: modelType,
    activeModelType: activeModelType,
    isRedisplay: isRedisplay,
    willRender: modelType === activeModelType,
    scenario_id: result.scenario_id,
    resultModelType: result.model_type,
    storageState: Object.keys(currentResultByModel).reduce((acc, key) => {
      acc[key] = currentResultByModel[key] ? currentResultByModel[key].scenario_id : null;
      return acc;
    }, {})
  });

  // Only render if this result belongs to the active model
  if (modelType !== activeModelType) {
    console.log(`⏭️ Skipping render: modelType (${modelType}) !== activeModelType (${activeModelType})`);
    return;
  }

  // Clear any prior UI before rendering to avoid bleed-through
  hideScenarioResults();

  currentResult = result;
  console.log(`✅ Rendering results for ${modelType} model, scenario: ${result.scenario_id}`);
  const resultContainer = document.getElementById('result-container-models');
  if (resultContainer) resultContainer.style.display = 'block';

  // Debug logging
  console.log('📊 Displaying results:', {
    scenario: result.scenario_id,
    baseline_revenue: result.baseline.revenue,
    forecasted_revenue: result.forecasted.revenue,
    delta_revenue: result.delta.revenue,
    baseline_subs: result.baseline.customers,
    forecasted_subs: result.forecasted.activeCustomers || result.forecasted.customers
  });

  // Store in all simulation results for chatbot access
  if (!allSimulationResultsByModel[modelType].find(r => r.scenario_id === result.scenario_id)) {
    allSimulationResultsByModel[modelType].push(result);
  }

  // Display warning for new ladder scenarios
  const warningContainer = document.getElementById('new-tier-warning');
  if (result.is_new_tier && warningContainer) {
    warningContainer.innerHTML = `
      <div class="alert alert-info border-info mb-3">
        <i class="bi bi-info-circle me-2"></i>
        <strong>New Menu Ladder Simulation:</strong> This scenario introduces a hypothetical "${result.scenario_config.tier}" ladder that does not exist in the observed baseline.
        Results use "${result.scenario_config.baseline_tier}" as the reference ladder for modeling.
      </div>
    `;
    warningContainer.style.display = 'block';
  } else if (warningContainer) {
    warningContainer.style.display = 'none';
  }

  // Display KPI cards
  const container = document.getElementById('result-cards-models');
  const customers = result.forecasted.activeCustomers || result.forecasted.customers;
  const deltaCustomers = result.delta.customers;
  const deltaCustomersPct = result.delta.customers_pct;

  // Calculate Payback Metrics (RFP Slide 15-16)
  const acquisitionPayback = calculateAcquisitionPayback(result);
  const churnPayback = calculateChurnPayback(result);

  console.log(`💳 Rendering KPI cards for ${modelType}:`, {
    scenario_id: result.scenario_id,
    model_type: result.model_type,
    forecasted_revenue: result.forecasted.revenue,
    delta_revenue: result.delta.revenue,
    customers: customers,
    container_exists: !!container,
    delta_new_customers: result.delta?.new_customers,
    delta_new_customers_pct: result.delta?.new_customers_pct,
    forecasted_new_customers: result.forecasted?.new_customers
  });

  container.innerHTML = `
    <div class="col-md-3">
      <div class="card">
        <div class="card-body text-center">
          <div class="text-muted small">Weekly Orders</div>
          <div class="h4 mb-1">${formatNumber(customers)}</div>
          <div class="small ${deltaCustomers >= 0 ? 'text-success' : 'text-danger'}">
            ${deltaCustomers >= 0 ? '+' : ''}${formatNumber(deltaCustomers)}
            (${formatPercent(deltaCustomersPct, 1)})
          </div>
        </div>
      </div>
    </div>
    <div class="col-md-3">
      <div class="card">
        <div class="card-body text-center">
          <div class="text-muted small">Revenue (Monthly)</div>
          <div class="h4 mb-1">${formatCurrency(result.forecasted.revenue)}</div>
          <div class="small ${result.delta.revenue >= 0 ? 'text-success' : 'text-danger'}">
            ${result.delta.revenue >= 0 ? '+' : ''}${formatCurrency(result.delta.revenue)}
            (${formatPercent(result.delta.revenue_pct, 1)})
          </div>
        </div>
      </div>
    </div>
    <div class="col-md-3">
      <div class="card">
        <div class="card-body text-center">
          <div class="text-muted small">AOV</div>
          <div class="h4 mb-1">${formatCurrency(result.forecasted.aov)}</div>
          <div class="small ${result.delta.aov >= 0 ? 'text-success' : 'text-danger'}">
            ${result.delta.aov >= 0 ? '+' : ''}${formatCurrency(result.delta.aov)}
            (${formatPercent(result.delta.aov_pct, 1)})
          </div>
        </div>
      </div>
    </div>
    <div class="col-md-3">
      <div class="card">
        <div class="card-body text-center">
          <div class="text-muted small">Repeat-Loss Rate</div>
          <div class="h4 mb-1">${formatPercent((result.forecasted.repeatLossRate || result.forecasted.repeat_loss_rate || 0), 2)}</div>
          <div class="small ${result.delta.repeat_loss_rate <= 0 ? 'text-success' : 'text-danger'}">
            ${result.delta.repeat_loss_rate >= 0 ? '+' : ''}${formatPercent(result.delta.repeat_loss_rate, 2)}
          </div>
        </div>
      </div>
    </div>
    <div class="col-md-3">
      <div class="card border-primary">
        <div class="card-body text-center">
          <div class="text-muted small">
            <i class="bi bi-calendar-check me-1"></i>Acquisition Payback
          </div>
          <div class="h4 mb-1 text-primary">${acquisitionPayback.value}</div>
          <div class="small text-muted">${acquisitionPayback.label}</div>
        </div>
      </div>
    </div>
    <div class="col-md-2">
      <div class="card border-info">
        <div class="card-body text-center">
          <div class="text-muted small">
            <i class="bi bi-hourglass-split me-1"></i>Churn Payback
          </div>
          <div class="h4 mb-1 text-info">${churnPayback.value}</div>
          <div class="small text-muted">${churnPayback.label}</div>
        </div>
      </div>
    </div>
  `;

  // Render charts
  renderRevenueChartInTabs(result);
  renderCustomerChartInTabs(result);

  // Render dynamic cohort tables
  renderAcquisitionCohortTable(result);
  renderChurnHeatmap(result);
  renderMigrationMatrix(result);

  // Show/hide appropriate detail table based on model type
  const acquisitionDetail = document.getElementById('acquisition-results-detail');
  const churnDetail = document.getElementById('churn-results-detail');
  const migrationDetail = document.getElementById('migration-results-detail');

  if (acquisitionDetail) acquisitionDetail.style.display = (modelType === 'acquisition') ? 'block' : 'none';
  if (churnDetail) churnDetail.style.display = (modelType === 'churn') ? 'block' : 'none';
  if (migrationDetail) migrationDetail.style.display = (modelType === 'migration') ? 'block' : 'none';

  console.log(`👁️ Detail sections visibility:`, {
    modelType: modelType,
    acquisition: acquisitionDetail?.style.display,
    churn: churnDetail?.style.display,
    migration: migrationDetail?.style.display
  });
}

/**
 * Render revenue chart in tabs
 */
function renderRevenueChartInTabs(result) {
  const ctx = document.getElementById('revenue-chart-models');

  console.log(`📊 Rendering revenue chart:`, {
    scenario_id: result.scenario_id,
    model_type: result.model_type,
    baseline_revenue: result.baseline.revenue,
    forecasted_revenue: result.forecasted.revenue,
    chart_exists: !!window.revenueChartModels
  });

  if (window.revenueChartModels) {
    window.revenueChartModels.destroy();
  }

  window.revenueChartModels = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: ['Baseline', 'Scenario'],
      datasets: [{
        label: 'Monthly Revenue',
        data: [result.baseline.revenue, result.forecasted.revenue],
        backgroundColor: ['rgba(108, 117, 125, 0.8)', 'rgba(13, 110, 253, 0.8)']
      }]
    },
    options: {
      responsive: true,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (context) => formatCurrency(context.parsed.y)
          }
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: {
            callback: (value) => formatCurrency(value)
          }
        }
      }
    }
  });
}

/**
 * Render customer chart in tabs
 */
function renderCustomerChartInTabs(result) {
  const ctx = document.getElementById('customer-chart-models');

  if (window.customerChartModels) {
    window.customerChartModels.destroy();
  }

  window.customerChartModels = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: ['Baseline', 'Scenario'],
      datasets: [{
        label: 'Weekly Orders',
        data: [
          result.baseline.activeCustomers || result.baseline.customers,
          result.forecasted.activeCustomers || result.forecasted.customers
        ],
        backgroundColor: ['rgba(108, 117, 125, 0.8)', 'rgba(13, 110, 253, 0.8)']
      }]
    },
    options: {
      responsive: true,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (context) => formatNumber(context.parsed.y)
          }
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: {
            callback: (value) => formatNumber(value)
          }
        }
      }
    }
  });
}

/**
 * Navigation Functions for Contextual Links
 */

// Navigate to segmentation section and optionally filter by model type
window.navigateToSegments = function(modelType) {
  const segmentSection = document.getElementById('segmentation-section');
  const analyticsSection = document.getElementById('analytics-section');
  const comparisonSection = document.getElementById('segment-analysis-section');

  if (segmentSection) {
    // Show the deep dive sections
    segmentSection.style.display = 'block';
    if (analyticsSection) analyticsSection.style.display = 'block';
    if (comparisonSection) comparisonSection.style.display = 'block';

    // Scroll to segmentation section
    segmentSection.scrollIntoView({ behavior: 'smooth', block: 'start' });

    // Optional: Auto-filter segments based on model type
    // This could be enhanced to actually filter the segments
    console.log(`Navigating to segments with focus on: ${modelType}`);
  }
};

// Scroll back to scenario engine
window.scrollToScenarioEngine = function() {
  const scenarioEngine = document.getElementById('elasticity-models-section');
  if (scenarioEngine) {
    scenarioEngine.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
};

// Scroll to scenario engine and switch to specific tab
window.scrollToTab = function(tabName) {
  const scenarioEngine = document.getElementById('elasticity-models-section');
  if (scenarioEngine) {
    scenarioEngine.scrollIntoView({ behavior: 'smooth', block: 'start' });

    // Switch to the specified tab after scrolling
    setTimeout(() => {
      const tabButton = document.getElementById(`${tabName}-tab`);
      if (tabButton) {
        tabButton.click();
      }
    }, 500);
  }
};

/**
 * Render Acquisition Cohort Table dynamically
 */
async function renderAcquisitionCohortTable(result) {
  const tableBody = document.querySelector('#acquisition-cohort-table tbody');
  if (!tableBody) return;

  try {
    // Get tier from scenario
    const tier = result.scenario_config?.tier || 'ad_supported';

    // Get cohorts
    const cohorts = await getAcquisitionCohorts(tier);

    if (!cohorts || cohorts.length === 0) {
      tableBody.innerHTML = '<tr><td colspan="6" class="text-center text-muted">No cohort data available</td></tr>';
      return;
    }

    // Get Python model predictions if available
    let predictions = [];
    if (isPyodideAvailable() && result.python_models) {
      const scenario = {
        new_price: result.scenario_config.new_price,
        current_price: result.scenario_config.current_price,
        promotion: result.scenario_config.promotion
      };

      predictions = await pyodideBridge.predictAcquisitionBySegment(scenario, cohorts);
    }

    // Render table rows
    tableBody.innerHTML = cohorts.map((cohort, index) => {
      const prediction = predictions[index] || {};
      // Correct elasticity formula: elasticity × price_change
      // -5% price change: elasticity × (-5) = lift
      // +5% price change: elasticity × (+5) = lift
      const addsLiftMinus5 = prediction.lift_at_minus_5pct || (cohort.elasticity * (-5));
      const addsLiftPlus5 = prediction.lift_at_plus_5pct || (cohort.elasticity * 5);
      const confidence = prediction.confidence || 2.5;

      // Badge color based on elasticity
      const elasticityBadge = Math.abs(cohort.elasticity) > 2.5 ? 'bg-danger' :
                              Math.abs(cohort.elasticity) > 1.5 ? 'bg-warning' : 'bg-success';

      return `
        <tr>
          <td><strong>${cohort.name}</strong></td>
          <td>${formatNumber(cohort.size)}</td>
          <td><span class="badge ${elasticityBadge}">${cohort.elasticity.toFixed(2)}</span></td>
          <td class="text-success">${addsLiftMinus5 > 0 ? '+' : ''}${addsLiftMinus5.toFixed(1)}%</td>
          <td class="text-danger">${addsLiftPlus5 > 0 ? '+' : ''}${addsLiftPlus5.toFixed(1)}%</td>
          <td><span class="text-muted">±${confidence.toFixed(1)}%</span></td>
        </tr>
      `;
    }).join('');

    console.log(`✅ Rendered ${cohorts.length} acquisition cohorts`);
  } catch (error) {
    console.error('Error rendering acquisition cohort table:', error);
    tableBody.innerHTML = '<tr><td colspan="6" class="text-center text-danger">Error loading cohort data</td></tr>';
  }
}

/**
 * Render Churn Heatmap dynamically
 */
async function renderChurnHeatmap(result) {
  const tableBody = document.querySelector('#churn-heatmap-table tbody');
  if (!tableBody) return;

  try {
    const tier = result.scenario_config?.tier || 'ad_supported';
    const cohorts = await getChurnCohorts(tier);

    if (!cohorts || cohorts.length === 0) {
      tableBody.innerHTML = '<tr><td colspan="5" class="text-center text-muted">No cohort data available</td></tr>';
      return;
    }

    // Get Python model predictions by time horizon
    let predictions = [];
    if (isPyodideAvailable() && result.python_models) {
      const scenario = {
        new_price: result.scenario_config.new_price,
        current_price: result.scenario_config.current_price,
        price_change_pct: ((result.scenario_config.new_price - result.scenario_config.current_price) / result.scenario_config.current_price) * 100,
        baseline_repeat_loss: result.baseline.repeatLossRate || 0.05,
        promotion: result.scenario_config.promotion
      };

      predictions = await pyodideBridge.predictChurnBySegment(scenario, cohorts);
    }

    // Render heatmap rows
    tableBody.innerHTML = cohorts.map((cohort, index) => {
      const prediction = predictions[index] || {};

      // Extract churn uplift by horizon (in percentage points)
      const repeat_loss_0_4 = prediction.repeat_loss_0_4_weeks || (cohort.elasticity * 0.015 * 100);
      const repeat_loss_4_8 = prediction.repeat_loss_4_8_weeks || (cohort.elasticity * 0.035 * 100);
      const repeat_loss_8_12 = prediction.repeat_loss_8_12_weeks || (cohort.elasticity * 0.045 * 100);
      const repeat_loss_12plus = prediction.repeat_loss_12plus_weeks || (cohort.elasticity * 0.020 * 100);

      // Simple color coding - green for decreases (good), red for increases (bad)
      const getColorClass = (value) => {
        if (value < 0) return 'text-success';  // Negative = churn decrease = GOOD
        if (value > 0) return 'text-danger';   // Positive = churn increase = BAD
        return 'text-muted';                    // Zero = no change
      };

      const formatChurn = (val) => `${val > 0 ? '+' : ''}${val.toFixed(1)} pp`;

      return `
        <tr>
          <td><strong>${cohort.name}</strong></td>
          <td class="${getColorClass(repeat_loss_0_4)}">${formatChurn(repeat_loss_0_4)}</td>
          <td class="${getColorClass(repeat_loss_4_8)}">${formatChurn(repeat_loss_4_8)}</td>
          <td class="${getColorClass(repeat_loss_8_12)}">${formatChurn(repeat_loss_8_12)}</td>
          <td class="${getColorClass(repeat_loss_12plus)}">${formatChurn(repeat_loss_12plus)}</td>
        </tr>
      `;
    }).join('');

    console.log(`✅ Rendered ${cohorts.length} churn cohorts`);
  } catch (error) {
    console.error('Error rendering churn heatmap:', error);
    tableBody.innerHTML = '<tr><td colspan="5" class="text-center text-danger">Error loading cohort data</td></tr>';
  }
}

/**
 * Render Migration Matrix dynamically
 */
async function renderMigrationMatrix(result) {
  const tableBody = document.querySelector('#migration-matrix-table tbody');
  const tableCard = tableBody?.closest('.card');
  const tableHeader = document.querySelector('#migration-matrix-table thead');

  if (!tableBody) return;

  // Show the card
  if (tableCard) {
    tableCard.style.display = 'block';
  }

  try {
    // Use Python model migration predictions
    if (!result.python_models || !result.python_models.migration) {
      console.log('⚠️ No migration predictions available');
      tableHeader.innerHTML = `
        <tr>
          <th>Scenario Readout</th>
          <th>Detail</th>
        </tr>
      `;
      tableBody.innerHTML = `
        <tr>
          <td><strong>JavaScript migration build</strong></td>
          <td>The Pizza Hut build currently summarizes migration through the channel-flow chart, share cards, and scenario KPIs above. Detailed scenario-level transition matrices are only emitted when a dedicated migration matrix is present in the simulation output.</td>
        </tr>
      `;
      return;
    }

    const migration = result.python_models.migration;
    const tierConfig = migration.tier_config || '2-tier';

    console.log('📊 Rendering migration matrix - Tier config:', tierConfig);

    // Render based on tier configuration
    if (tierConfig === '3-tier-bundle') {
      renderBundleMigrationMatrix(tableHeader, tableBody, migration);
    } else if (tierConfig === '3-tier-basic') {
      renderBasicMigrationMatrix(tableHeader, tableBody, migration);
    } else {
      render2TierMigrationMatrix(tableHeader, tableBody, migration);
    }

    console.log(`✅ Rendered migration matrix (${tierConfig})`);
  } catch (error) {
    console.error('Error rendering migration matrix:', error);
    tableBody.innerHTML = '<tr><td colspan="5" class="text-center text-danger">Error loading migration data</td></tr>';
  }
}

/**
 * Render 2-tier migration matrix (original)
 */
function render2TierMigrationMatrix(tableHeader, tableBody, migration) {
  // Simple single-row header
  tableHeader.innerHTML = `
    <tr>
      <th>Current Channel</th>
      <th>→ Core & Premium Mix</th>
      <th>→ Entry & Value Mix</th>
      <th>Repeat Loss</th>
      <th>Net Change</th>
    </tr>
  `;

  // Entry & Value Mix row
  const adSuppUpgrade = (migration.from_ad_supported?.to_ad_free || 0) * 100;
  const adSuppCancel = (migration.from_ad_supported?.cancel || 0) * 100;
  const adSuppNetMix = adSuppUpgrade - adSuppCancel;

  // Core & Premium Mix row
  const adFreeDowngrade = (migration.from_ad_free?.to_ad_supported || 0) * 100;
  const adFreeCancel = (migration.from_ad_free?.cancel || 0) * 100;
  const adFreeNetMix = -adFreeDowngrade - adFreeCancel;

  tableBody.innerHTML = `
    <tr>
      <td><strong>Entry & Value Mix</strong></td>
      <td class="text-success">${adSuppUpgrade > 0 ? '+' : ''}${adSuppUpgrade.toFixed(1)}%</td>
      <td class="text-muted">—</td>
      <td class="text-danger">${adSuppCancel > 0 ? '+' : ''}${adSuppCancel.toFixed(1)}%</td>
      <td class="${adSuppNetMix >= 0 ? 'text-success' : 'text-danger'}"><strong>${adSuppNetMix > 0 ? '+' : ''}${adSuppNetMix.toFixed(1)}%</strong></td>
    </tr>
    <tr>
      <td><strong>Core & Premium Mix</strong></td>
      <td class="text-muted">—</td>
      <td class="text-warning">${adFreeDowngrade > 0 ? '+' : ''}${adFreeDowngrade.toFixed(1)}%</td>
      <td class="text-danger">${adFreeCancel > 0 ? '+' : ''}${adFreeCancel.toFixed(1)}%</td>
      <td class="${adFreeNetMix >= 0 ? 'text-success' : 'text-danger'}"><strong>${adFreeNetMix > 0 ? '+' : ''}${adFreeNetMix.toFixed(1)}%</strong></td>
    </tr>
  `;
}

/**
 * Render 3-tier Bundle migration matrix
 */
function renderBundleMigrationMatrix(tableHeader, tableBody, migration) {
  // Simple single-row header
  tableHeader.innerHTML = `
    <tr>
      <th>Current Channel</th>
      <th>→ Core & Premium Mix</th>
      <th>→ Value Set</th>
      <th>→ Entry & Value Mix</th>
      <th>Repeat Loss</th>
      <th>Net Change</th>
    </tr>
  `;

  // FROM Entry & Value Mix
  const as_to_af = (migration.from_ad_supported?.to_ad_free || 0) * 100;
  const as_to_bundle = (migration.from_ad_supported?.to_bundle || 0) * 100;
  const as_cancel = (migration.from_ad_supported?.cancel || 0) * 100;
  const as_net = as_to_af + as_to_bundle - as_cancel;

  // FROM Core & Premium Mix
  const af_to_bundle = (migration.from_ad_free?.to_bundle || 0) * 100;
  const af_to_as = (migration.from_ad_free?.to_ad_supported || 0) * 100;
  const af_cancel = (migration.from_ad_free?.cancel || 0) * 100;
  const af_net = af_to_bundle - af_to_as - af_cancel;

  // FROM Value Set
  const bundle_to_af = (migration.from_bundle?.to_ad_free || 0) * 100;
  const bundle_to_as = (migration.from_bundle?.to_ad_supported || 0) * 100;
  const bundle_cancel = (migration.from_bundle?.cancel || 0) * 100;
  const bundle_net = -bundle_to_af - bundle_to_as - bundle_cancel;

  tableBody.innerHTML = `
    <tr>
      <td><strong>Entry & Value Mix</strong></td>
      <td class="text-success">${as_to_af > 0 ? '+' : ''}${as_to_af.toFixed(1)}%</td>
      <td class="text-primary">${as_to_bundle > 0 ? '+' : ''}${as_to_bundle.toFixed(1)}%</td>
      <td class="text-muted">—</td>
      <td class="text-danger">${as_cancel > 0 ? '+' : ''}${as_cancel.toFixed(1)}%</td>
      <td class="${as_net >= 0 ? 'text-success' : 'text-danger'}"><strong>${as_net > 0 ? '+' : ''}${as_net.toFixed(1)}%</strong></td>
    </tr>
    <tr>
      <td><strong>Core & Premium Mix</strong></td>
      <td class="text-muted">—</td>
      <td class="text-primary">${af_to_bundle > 0 ? '+' : ''}${af_to_bundle.toFixed(1)}%</td>
      <td class="text-warning">${af_to_as > 0 ? '+' : ''}${af_to_as.toFixed(1)}%</td>
      <td class="text-danger">${af_cancel > 0 ? '+' : ''}${af_cancel.toFixed(1)}%</td>
      <td class="${af_net >= 0 ? 'text-success' : 'text-danger'}"><strong>${af_net > 0 ? '+' : ''}${af_net.toFixed(1)}%</strong></td>
    </tr>
    <tr>
      <td><strong>Value Set</strong></td>
      <td class="text-warning">${bundle_to_af > 0 ? '+' : ''}${bundle_to_af.toFixed(1)}%</td>
      <td class="text-muted">—</td>
      <td class="text-warning">${bundle_to_as > 0 ? '+' : ''}${bundle_to_as.toFixed(1)}%</td>
      <td class="text-danger">${bundle_cancel > 0 ? '+' : ''}${bundle_cancel.toFixed(1)}%</td>
      <td class="${bundle_net >= 0 ? 'text-success' : 'text-danger'}"><strong>${bundle_net > 0 ? '+' : ''}${bundle_net.toFixed(1)}%</strong></td>
    </tr>
  `;
}

/**
 * Render 3-tier Basic migration matrix
 */
function renderBasicMigrationMatrix(tableHeader, tableBody, migration) {
  // Simple single-row header
  tableHeader.innerHTML = `
    <tr>
      <th>Current Channel</th>
      <th>→ Entry & Value Mix</th>
      <th>→ Core & Premium Mix</th>
      <th>→ Entry Pack</th>
      <th>Repeat Loss</th>
      <th>Net Change</th>
    </tr>
  `;

  // FROM BASIC
  const basic_to_as = (migration.from_basic?.to_ad_supported || 0) * 100;
  const basic_to_af = (migration.from_basic?.to_ad_free || 0) * 100;
  const basic_cancel = (migration.from_basic?.cancel || 0) * 100;
  const basic_net = basic_to_as + basic_to_af - basic_cancel;

  // FROM Entry & Value Mix
  const as_to_af = (migration.from_ad_supported?.to_ad_free || 0) * 100;
  const as_to_basic = (migration.from_ad_supported?.to_basic || 0) * 100;
  const as_cancel = (migration.from_ad_supported?.cancel || 0) * 100;
  const as_net = as_to_af - as_to_basic - as_cancel;

  // FROM AD-FREE
  const af_to_as = (migration.from_ad_free?.to_ad_supported || 0) * 100;
  const af_to_basic = (migration.from_ad_free?.to_basic || 0) * 100;
  const af_cancel = (migration.from_ad_free?.cancel || 0) * 100;
  const af_net = -af_to_as - af_to_basic - af_cancel;

  tableBody.innerHTML = `
    <tr>
      <td><strong>Entry Pack</strong></td>
      <td class="text-success">${basic_to_as > 0 ? '+' : ''}${basic_to_as.toFixed(1)}%</td>
      <td class="text-primary">${basic_to_af > 0 ? '+' : ''}${basic_to_af.toFixed(1)}%</td>
      <td class="text-muted">—</td>
      <td class="text-danger">${basic_cancel > 0 ? '+' : ''}${basic_cancel.toFixed(1)}%</td>
      <td class="${basic_net >= 0 ? 'text-success' : 'text-danger'}"><strong>${basic_net > 0 ? '+' : ''}${basic_net.toFixed(1)}%</strong></td>
    </tr>
    <tr>
      <td><strong>Entry & Value Mix</strong></td>
      <td class="text-muted">—</td>
      <td class="text-success">${as_to_af > 0 ? '+' : ''}${as_to_af.toFixed(1)}%</td>
      <td class="text-warning">${as_to_basic > 0 ? '+' : ''}${as_to_basic.toFixed(1)}%</td>
      <td class="text-danger">${as_cancel > 0 ? '+' : ''}${as_cancel.toFixed(1)}%</td>
      <td class="${as_net >= 0 ? 'text-success' : 'text-danger'}"><strong>${as_net > 0 ? '+' : ''}${as_net.toFixed(1)}%</strong></td>
    </tr>
    <tr>
      <td><strong>Core & Premium Mix</strong></td>
      <td class="text-warning">${af_to_as > 0 ? '+' : ''}${af_to_as.toFixed(1)}%</td>
      <td class="text-muted">—</td>
      <td class="text-warning">${af_to_basic > 0 ? '+' : ''}${af_to_basic.toFixed(1)}%</td>
      <td class="text-danger">${af_cancel > 0 ? '+' : ''}${af_cancel.toFixed(1)}%</td>
      <td class="${af_net >= 0 ? 'text-success' : 'text-danger'}"><strong>${af_net > 0 ? '+' : ''}${af_net.toFixed(1)}%</strong></td>
    </tr>
  `;
}

/**
 * Rank and display scenarios using decision engine (RFP Slide 18)
 */
async function rankAndDisplayScenarios() {
  if (savedScenarios.length === 0) {
    alert('No saved scenarios to rank. Please simulate and save scenarios first.');
    return;
  }

  try {
    // Get selected objective and constraints
    const objective = document.getElementById('objective-lens-select').value;

    // Rank scenarios
    const rankedScenarios = rankScenarios(savedScenarios, objective, {});

    if (rankedScenarios.length === 0) {
      alert('No scenarios available to rank. Try saving more scenarios.');
      return;
    }

    // Display top 3
    displayTop3Scenarios(rankedScenarios);

  } catch (error) {
    console.error('Error ranking scenarios:', error);
    alert('Error ranking scenarios. See console for details.');
  }
}

/**
 * Display top 3 ranked scenarios
 */
function displayTop3Scenarios(top3) {
  const container = document.getElementById('top-scenarios-container');
  const list = document.getElementById('top-scenarios-list');

  if (!container || !list) return;

  if (!window.currentTop3ScenariosByModel) {
    window.currentTop3ScenariosByModel = {};
  }
  window.currentTop3ScenariosByModel[activeModelType] = top3;

  let html = '';
  top3.forEach((scenario, index) => {
    const rankBadge = index === 0 ? 'bg-warning' : index === 1 ? 'bg-secondary' : 'text-dark';
    const rankIcon = index === 0 ? '🥇' : index === 1 ? '🥈' : '🥉';
    const riskBadge = scenario.risk_level === 'Low' ? 'bg-success' :
                      scenario.risk_level === 'Med' ? 'bg-warning' :
                      'bg-danger';

    html += `
      <div class="col-md-4">
        <div class="card h-100 ${index === 0 ? 'border-warning border-2' : ''}">
          <div class="card-header ${index === 0 ? 'bg-warning-subtle' : ''}">
            <div class="d-flex justify-content-between align-items-center">
              <span class="badge ${rankBadge}">${rankIcon} Rank #${scenario.rank}</span>
              <span class="badge ${riskBadge}">${scenario.risk_level} Risk</span>
            </div>
          </div>
          <div class="card-body">
            <h6 class="card-title">${scenario.scenario_name || scenario.id}</h6>
            <p class="card-text small text-muted mb-2">
              ${scenario.description || ''}
            </p>

            <!-- KPIs -->
            <div class="mb-2">
              <div class="row g-1 small">
                <div class="col-6">
                  <strong>Revenue:</strong>
                  <span class="${scenario.delta.revenue >= 0 ? 'text-success' : 'text-danger'}">
                    ${scenario.delta.revenue >= 0 ? '+' : ''}${formatPercent(scenario.delta.revenue_pct, 1)}
                  </span>
                </div>
                <div class="col-6">
                  <strong>Orders:</strong>
                  <span class="${scenario.delta.customers >= 0 ? 'text-success' : 'text-danger'}">
                    ${scenario.delta.customers >= 0 ? '+' : ''}${formatPercent(scenario.delta.customers_pct, 1)}
                  </span>
                </div>
                <div class="col-6">
                  <strong>Repeat Loss:</strong>
                  <span class="${scenario.delta.repeat_loss_rate <= 0 ? 'text-success' : 'text-danger'}">
                    ${scenario.delta.repeat_loss_rate >= 0 ? '+' : ''}${formatPercent(scenario.delta.repeat_loss_rate, 2)}pp
                  </span>
                </div>
                <div class="col-6">
                  <strong>Score:</strong>
                  <span class="text-primary fw-bold">${scenario.decision_score.toFixed(1)}</span>
                </div>
              </div>
            </div>

            <!-- Rationale -->
            <div class="alert alert-light mb-0 small">
              <strong>Why it wins:</strong><br>
              ${scenario.rationale}
            </div>
          </div>
        </div>
      </div>
    `;
  });

  list.innerHTML = html;
  container.style.display = 'block';

  // Enable export buttons
  const exportPdfBtn = document.getElementById('export-pdf-btn');
  const exportXlsxBtn = document.getElementById('export-xlsx-btn');
  if (exportPdfBtn) exportPdfBtn.disabled = false;
  if (exportXlsxBtn) exportXlsxBtn.disabled = false;

  // Scroll to results
  container.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

