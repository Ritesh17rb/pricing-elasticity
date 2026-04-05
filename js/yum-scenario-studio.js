import { loadYumMarketDim, loadYumStoreItemWeekPanel } from './yum-data-loader.js';
import { getBrandItemSummaries, simulateBrandPriceChange } from './yum-elasticity-model.js';
import {
  DEFAULT_YUM_BRAND_ID,
  getSelectedYumBrandId,
  getYumBrandLabel,
  getYumChannelLabel,
  setSelectedYumBrandId,
  sortYumBrandIds,
  sortYumChannels
} from './yum-brand-utils.js';

let studioItems = [];
let studioMarkets = [];
let studioChannels = [];
let availableBrands = [];
let allMarkets = [];
let allPanelRows = [];
let currentBrandId = null;
let controlsBound = false;
let brandListenerBound = false;

function formatCurrency(value) {
  if (!Number.isFinite(value)) return 'N/A';
  return `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatNumber(value) {
  if (!Number.isFinite(value)) return 'N/A';
  return value.toLocaleString();
}

function formatPercent(value) {
  if (!Number.isFinite(value)) return 'N/A';
  const prefix = value > 0 ? '+' : '';
  return `${prefix}${value.toFixed(1)}%`;
}

function byId(id) {
  return document.getElementById(id);
}

function setText(id, value) {
  const element = byId(id);
  if (element) {
    element.textContent = value;
  }
}

function getSelectedItem() {
  const itemId = byId('yum-item-select')?.value;
  return studioItems.find(item => item.itemId === itemId) || studioItems[0] || null;
}

function getSelectedMarketId() {
  return byId('yum-market-select')?.value || 'all';
}

function getSelectedChannel() {
  return byId('yum-channel-select')?.value || 'all';
}

function populateBrandSelect() {
  const select = byId('yum-brand-select');
  if (!select) return;

  select.innerHTML = availableBrands
    .map(brandId => `<option value="${brandId}">${getYumBrandLabel(brandId)}</option>`)
    .join('');

  const selectedBrandId = availableBrands.includes(getSelectedYumBrandId())
    ? getSelectedYumBrandId()
    : (availableBrands[0] || DEFAULT_YUM_BRAND_ID);

  select.value = selectedBrandId;
}

function populateItemSelect() {
  const select = byId('yum-item-select');
  if (!select) return;

  if (!studioItems.length) {
    select.innerHTML = '<option value="">No menu items available</option>';
    return;
  }

  const existingValue = select.value;
  select.innerHTML = studioItems
    .map(item => `<option value="${item.itemId}">${item.itemName} | ${formatCurrency(item.avgNetPrice)} | e=${item.elasticity}</option>`)
    .join('');

  select.value = studioItems.some(item => item.itemId === existingValue)
    ? existingValue
    : studioItems[0].itemId;
}

function populateMarketSelect() {
  const select = byId('yum-market-select');
  if (!select) return;

  const brandLabel = getYumBrandLabel(currentBrandId);
  const existingValue = select.value;
  const options = [
    `<option value="all">All ${brandLabel} markets</option>`,
    ...studioMarkets.map(
      market => `<option value="${market.market_id}">${market.city}, ${market.state} (${market.store_count} stores)</option>`
    )
  ];
  select.innerHTML = options.join('');
  select.value = options.some(option => option.includes(`value="${existingValue}"`)) ? existingValue : 'all';
}

function populateChannelSelect() {
  const select = byId('yum-channel-select');
  if (!select) return;

  const brandLabel = getYumBrandLabel(currentBrandId);
  const existingValue = select.value;
  const options = [
    `<option value="all">All ${brandLabel} channels</option>`,
    ...studioChannels.map(channel => `<option value="${channel}">${getYumChannelLabel(channel)}</option>`)
  ];
  select.innerHTML = options.join('');
  select.value = options.some(option => option.includes(`value="${existingValue}"`)) ? existingValue : 'all';
}

function syncPriceControls(item) {
  const numberInput = byId('yum-price-input');
  const rangeInput = byId('yum-price-slider');
  const hint = byId('yum-price-hint');
  if (!numberInput || !rangeInput || !hint) return;

  if (!item) {
    numberInput.value = '';
    rangeInput.value = '0';
    hint.textContent = 'No pricing controls available for the current brand selection.';
    return;
  }

  const baselinePrice = Number(item.avgNetPrice) || 1;
  const min = Math.max(0.5, baselinePrice * 0.7);
  const max = baselinePrice * 1.3;

  numberInput.min = min.toFixed(2);
  numberInput.max = max.toFixed(2);
  rangeInput.min = min.toFixed(2);
  rangeInput.max = max.toFixed(2);
  rangeInput.step = '0.01';

  if (!numberInput.value || Number(numberInput.dataset.itemBaseline) !== baselinePrice) {
    numberInput.value = baselinePrice.toFixed(2);
    rangeInput.value = baselinePrice.toFixed(2);
  }

  numberInput.dataset.itemBaseline = String(baselinePrice);
  rangeInput.dataset.itemBaseline = String(baselinePrice);
  hint.textContent = `Baseline ${formatCurrency(baselinePrice)}. Slider range ${formatCurrency(min)} to ${formatCurrency(max)}.`;
}

function renderBaseline(item) {
  setText('yum-baseline-item', item?.itemName || '--');
  setText('yum-baseline-week', item?.latestWeek || '--');
  setText('yum-baseline-price', item ? formatCurrency(item.avgNetPrice) : '--');
  setText('yum-baseline-units', item ? formatNumber(item.weeklyUnits) : '--');
  setText('yum-baseline-sales', item ? formatCurrency(item.weeklySales) : '--');
  setText('yum-baseline-margin', item ? formatCurrency(item.weeklyMargin) : '--');
  setText('yum-baseline-elasticity', item ? String(item.elasticity) : '--');
}

function renderBrandHeader() {
  const brandLabel = getYumBrandLabel(currentBrandId);
  const totalUnits = studioItems.reduce((sum, item) => sum + (Number(item.weeklyUnits) || 0), 0);
  const weightedElasticity = totalUnits > 0
    ? studioItems.reduce((sum, item) => sum + ((Number(item.elasticity) || 0) * (Number(item.weeklyUnits) || 0)), 0) / totalUnits
    : 0;

  const heading = byId('yum-studio-heading');
  if (heading) {
    heading.innerHTML = `<i class="bi bi-shop-window me-2"></i>${brandLabel} Pricing Studio`;
  }
  setText('yum-studio-subtitle', `Item-level and channel-aware price simulation on top of the ${brandLabel} operating panel.`);
  setText('yum-studio-badge', brandLabel);
  setText(
    'yum-brand-summary',
    `${studioItems.length} items | ${studioMarkets.length} markets | weighted menu elasticity ${weightedElasticity.toFixed(2)}`
  );
}

function renderImprovementList(item, simulation) {
  const container = byId('yum-improvement-list');
  if (!container) return;

  const brandLabel = getYumBrandLabel(currentBrandId);
  const improvements = [];

  if (item?.priceTier === 'value' || item?.priceTier === 'entry') {
    improvements.push(`Separate ${brandLabel} value-platform pricing from promo cadence. Entry and value ladders need their own elasticity treatment.`);
  }
  if (item?.category === 'beverages') {
    improvements.push('Add attachment modeling so beverage pricing reacts to basket economics, not just standalone demand.');
  }
  if (simulation && Math.abs(simulation.delta.unitsPct) > 20) {
    improvements.push(`This ${brandLabel} item is highly price sensitive in the current model. Add market heterogeneity and confidence bands before using it for decisions.`);
  }

  improvements.push(`Extend ${brandLabel} menu relationships with combo-component mappings and cross-item cannibalization.`);
  improvements.push(`Calibrate delivery fees, app offers, and owned-channel bundles for ${brandLabel} before using channel recommendations operationally.`);

  container.innerHTML = improvements.map(text => `<li>${text}</li>`).join('');
}

async function runSimulation() {
  const item = getSelectedItem();
  const brandLabel = getYumBrandLabel(currentBrandId);
  if (!item) {
    setText('yum-scenario-market', '--');
    setText('yum-scenario-price', '--');
    setText('yum-scenario-units', '--');
    setText('yum-scenario-sales', '--');
    setText('yum-scenario-margin', '--');
    setText('yum-delta-price', '--');
    setText('yum-delta-units', '--');
    setText('yum-delta-sales', '--');
    setText('yum-delta-margin', '--');
    setText('yum-scenario-narrative', `No ${brandLabel} items are available for the current scenario scope.`);
    renderImprovementList(null, null);
    return;
  }

  const marketId = getSelectedMarketId();
  const channel = getSelectedChannel();
  const priceInput = byId('yum-price-input');
  const numberValue = Number(priceInput?.value);
  const newPrice = Number.isFinite(numberValue) && numberValue > 0 ? numberValue : Number(item.avgNetPrice);

  const simulation = await simulateBrandPriceChange({
    brandId: currentBrandId,
    itemId: item.itemId,
    newPrice,
    marketId: marketId === 'all' ? null : marketId,
    channel: channel === 'all' ? null : channel
  });

  const selectedMarket = studioMarkets.find(market => market.market_id === marketId);
  const marketLabel = marketId === 'all'
    ? `All ${brandLabel} markets`
    : selectedMarket
      ? `${selectedMarket.city}, ${selectedMarket.state}`
      : marketId;
  const channelLabel = channel === 'all' ? 'All channels' : getYumChannelLabel(channel);

  setText('yum-scenario-market', `${marketLabel} | ${channelLabel}`);
  setText('yum-baseline-item', item.itemName);
  setText('yum-baseline-week', simulation.latestWeek || item.latestWeek || 'N/A');
  setText('yum-baseline-price', formatCurrency(simulation.baseline.avgNetPrice));
  setText('yum-baseline-units', formatNumber(simulation.baseline.units));
  setText('yum-baseline-sales', formatCurrency(simulation.baseline.sales));
  setText('yum-baseline-margin', formatCurrency(simulation.baseline.margin));
  setText('yum-baseline-elasticity', String(item.elasticity));
  setText('yum-scenario-price', formatCurrency(simulation.scenario.newPrice));
  setText('yum-scenario-units', formatNumber(simulation.scenario.units));
  setText('yum-scenario-sales', formatCurrency(simulation.scenario.sales));
  setText('yum-scenario-margin', formatCurrency(simulation.scenario.margin));
  setText('yum-delta-price', formatPercent(simulation.delta.pricePct));
  setText('yum-delta-units', formatPercent(simulation.delta.unitsPct));
  setText('yum-delta-sales', formatPercent(simulation.delta.salesPct));
  setText('yum-delta-margin', formatPercent(simulation.delta.marginPct));

  const narrative = simulation.delta.salesPct >= 0
    ? `${item.itemName} absorbs this price move reasonably well for ${channelLabel.toLowerCase()} in the current ${brandLabel} panel. Revenue improves, but the next improvement is checking store-level offer variation before trusting the recommendation.`
    : `${item.itemName} loses enough volume that revenue falls for ${channelLabel.toLowerCase()} in the current ${brandLabel} panel. The next improvement is testing whether the pressure is concentrated in value-led markets or in one order channel.`;
  setText('yum-scenario-narrative', narrative);

  renderImprovementList(item, simulation);
}

async function applyBrandSelection(brandId) {
  if (!brandId || (brandId === currentBrandId && studioItems.length)) {
    renderBrandHeader();
    return;
  }

  currentBrandId = brandId;
  studioItems = await getBrandItemSummaries(brandId);
  studioMarkets = allMarkets
    .filter(row => row.brand_id === brandId)
    .sort((left, right) => (Number(right.store_count) || 0) - (Number(left.store_count) || 0));
  studioChannels = sortYumChannels(
    allPanelRows
      .filter(row => row.brand_id === brandId)
      .map(row => row.channel)
  );

  renderBrandHeader();
  populateItemSelect();
  populateMarketSelect();
  populateChannelSelect();

  const item = getSelectedItem();
  syncPriceControls(item);
  renderBaseline(item);
  await runSimulation();
}

function bindEvents() {
  if (controlsBound) return;

  const brandSelect = byId('yum-brand-select');
  const itemSelect = byId('yum-item-select');
  const marketSelect = byId('yum-market-select');
  const channelSelect = byId('yum-channel-select');
  const priceInput = byId('yum-price-input');
  const priceSlider = byId('yum-price-slider');
  const resetButton = byId('yum-reset-price-btn');

  if (!brandSelect || !itemSelect || !marketSelect || !channelSelect || !priceInput || !priceSlider || !resetButton) {
    return;
  }

  brandSelect.addEventListener('change', () => {
    setSelectedYumBrandId(brandSelect.value, 'studio');
  });

  itemSelect.addEventListener('change', async () => {
    const item = getSelectedItem();
    syncPriceControls(item);
    renderBaseline(item);
    await runSimulation();
  });

  marketSelect.addEventListener('change', runSimulation);
  channelSelect.addEventListener('change', runSimulation);

  priceInput.addEventListener('input', async () => {
    priceSlider.value = priceInput.value;
    await runSimulation();
  });

  priceSlider.addEventListener('input', async () => {
    priceInput.value = priceSlider.value;
    await runSimulation();
  });

  resetButton.addEventListener('click', async () => {
    const item = getSelectedItem();
    if (!item) return;
    priceInput.value = Number(item.avgNetPrice).toFixed(2);
    priceSlider.value = Number(item.avgNetPrice).toFixed(2);
    await runSimulation();
  });

  controlsBound = true;
}

function bindBrandListener() {
  if (brandListenerBound) return;

  window.addEventListener('yum-brand-change', async (event) => {
    const brandId = event.detail?.brandId;
    if (!brandId || !availableBrands.includes(brandId)) return;

    const brandSelect = byId('yum-brand-select');
    if (brandSelect && brandSelect.value !== brandId) {
      brandSelect.value = brandId;
    }

    try {
      await applyBrandSelection(brandId);
    } catch (error) {
      console.warn('Failed to refresh Yum pricing studio brand selection:', error);
    }
  });

  brandListenerBound = true;
}

export async function initializeYumScenarioStudio() {
  const root = byId('yum-scenario-studio');
  if (!root) return;

  try {
    const [marketDim, panel] = await Promise.all([
      loadYumMarketDim(),
      loadYumStoreItemWeekPanel()
    ]);

    allMarkets = marketDim;
    allPanelRows = panel;
    availableBrands = sortYumBrandIds([
      ...marketDim.map(row => row.brand_id),
      ...panel.map(row => row.brand_id)
    ]);

    if (!availableBrands.length) {
      throw new Error('No Yum brands found in the generated operating panel.');
    }

    populateBrandSelect();
    bindEvents();
    bindBrandListener();

    const initialBrandId = availableBrands.includes(getSelectedYumBrandId())
      ? getSelectedYumBrandId()
      : availableBrands[0];

    const brandSelect = byId('yum-brand-select');
    if (brandSelect) {
      brandSelect.value = initialBrandId;
    }

    window.yumSelectedBrandId = initialBrandId;
    await applyBrandSelection(initialBrandId);
    root.dataset.ready = 'true';
  } catch (error) {
    console.warn('Yum pricing studio initialization skipped:', error);
    root.innerHTML = `
      <div class="card-body">
        <div class="alert alert-warning mb-0">
          <i class="bi bi-exclamation-triangle me-2"></i>
          Yum Pricing Studio could not initialize. Generate the Yum operating data first, then refresh.
        </div>
      </div>
    `;
  }
}
