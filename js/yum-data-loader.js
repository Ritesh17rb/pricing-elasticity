import { parseCSV } from './csv-utils.js';

const yumCache = {
  manifest: null,
  metadata: null,
  brandDim: null,
  brandMarketNetwork: null,
  brandWeekSummary: null,
  brandMarketProductChannelWeekPanel: null,
  brandMarketChannelWeekPanel: null,
  dataQualityChecks: null,
  marketDim: null,
  menuItemDim: null,
  channelDim: null,
  calendarDim: null,
  calendarWeekDim: null,
  externalMacroMonthly: null,
  storeItemWeekPanel: null,
  storeChannelWeekPanel: null,
  promoCalendar: null
};

async function fetchJson(path) {
  const response = await fetch(path);
  if (!response.ok) {
    throw new Error(`Failed to load ${path}: ${response.status}`);
  }
  return response.json();
}

async function fetchCsv(path) {
  const response = await fetch(path);
  if (!response.ok) {
    throw new Error(`Failed to load ${path}: ${response.status}`);
  }
  const text = await response.text();
  return parseCSV(text);
}

export async function loadYumManifest() {
  if (!yumCache.manifest) {
    yumCache.manifest = await fetchJson('data/yum/manifest.json');
  }
  return yumCache.manifest;
}

export async function loadYumMetadata() {
  if (!yumCache.metadata) {
    yumCache.metadata = await fetchJson('data/yum/metadata.json');
  }
  return yumCache.metadata;
}

export async function loadYumBrandDim() {
  if (!yumCache.brandDim) {
    yumCache.brandDim = await fetchCsv('data/yum/processed/brand_dim.csv');
  }
  return yumCache.brandDim;
}

export async function loadYumBrandMarketNetwork() {
  if (!yumCache.brandMarketNetwork) {
    yumCache.brandMarketNetwork = await fetchCsv('data/yum/processed/brand_market_network.csv');
  }
  return yumCache.brandMarketNetwork;
}

export async function loadYumBrandWeekSummary() {
  if (!yumCache.brandWeekSummary) {
    yumCache.brandWeekSummary = await fetchCsv('data/yum/processed/brand_week_summary.csv');
  }
  return yumCache.brandWeekSummary;
}

export async function loadYumBrandMarketProductChannelWeekPanel() {
  if (!yumCache.brandMarketProductChannelWeekPanel) {
    yumCache.brandMarketProductChannelWeekPanel = await fetchCsv('data/yum/processed/brand_market_product_channel_week_panel.csv');
  }
  return yumCache.brandMarketProductChannelWeekPanel;
}

export async function loadYumBrandMarketChannelWeekPanel() {
  if (!yumCache.brandMarketChannelWeekPanel) {
    yumCache.brandMarketChannelWeekPanel = await fetchCsv('data/yum/processed/brand_market_channel_week_panel.csv');
  }
  return yumCache.brandMarketChannelWeekPanel;
}

export async function loadYumDataQualityChecks() {
  if (!yumCache.dataQualityChecks) {
    yumCache.dataQualityChecks = await fetchCsv('data/yum/processed/data_quality_checks.csv');
  }
  return yumCache.dataQualityChecks;
}

export async function loadYumMarketDim() {
  if (!yumCache.marketDim) {
    yumCache.marketDim = await fetchCsv('data/yum/processed/market_dim.csv');
  }
  return yumCache.marketDim;
}

export async function loadYumMenuItemDim() {
  if (!yumCache.menuItemDim) {
    yumCache.menuItemDim = await fetchCsv('data/yum/processed/menu_item_dim.csv');
  }
  return yumCache.menuItemDim;
}

export async function loadYumChannelDim() {
  if (!yumCache.channelDim) {
    yumCache.channelDim = await fetchCsv('data/yum/processed/channel_dim.csv');
  }
  return yumCache.channelDim;
}

export async function loadYumCalendarDim() {
  if (!yumCache.calendarDim) {
    yumCache.calendarDim = await fetchCsv('data/yum/processed/calendar_dim.csv');
  }
  return yumCache.calendarDim;
}

export async function loadYumCalendarWeekDim() {
  if (!yumCache.calendarWeekDim) {
    yumCache.calendarWeekDim = await fetchCsv('data/yum/processed/calendar_week_dim.csv');
  }
  return yumCache.calendarWeekDim;
}

export async function loadYumExternalMacroMonthly() {
  if (!yumCache.externalMacroMonthly) {
    yumCache.externalMacroMonthly = await fetchCsv('data/yum/processed/external_macro_monthly.csv');
  }
  return yumCache.externalMacroMonthly;
}

export async function loadYumStoreItemWeekPanel() {
  if (!yumCache.storeItemWeekPanel) {
    yumCache.storeItemWeekPanel = await fetchCsv('data/yum/processed/store_item_week_panel.csv');
  }
  return yumCache.storeItemWeekPanel;
}

export async function loadYumStoreChannelWeekPanel() {
  if (!yumCache.storeChannelWeekPanel) {
    yumCache.storeChannelWeekPanel = await fetchCsv('data/yum/processed/store_channel_week_panel.csv');
  }
  return yumCache.storeChannelWeekPanel;
}

export async function loadYumPromoCalendar() {
  if (!yumCache.promoCalendar) {
    yumCache.promoCalendar = await fetchCsv('data/yum/processed/promo_calendar.csv');
  }
  return yumCache.promoCalendar;
}

export async function loadYumFoundation() {
  const [
    manifest,
    metadata,
    brandDim,
    brandMarketNetwork,
    brandWeekSummary,
    brandMarketProductChannelWeekPanel,
    brandMarketChannelWeekPanel,
    dataQualityChecks,
    marketDim,
    menuItemDim,
    channelDim,
    calendarDim,
    calendarWeekDim,
    externalMacroMonthly,
    storeItemWeekPanel,
    storeChannelWeekPanel,
    promoCalendar
  ] = await Promise.all([
    loadYumManifest(),
    loadYumMetadata(),
    loadYumBrandDim(),
    loadYumBrandMarketNetwork(),
    loadYumBrandWeekSummary(),
    loadYumBrandMarketProductChannelWeekPanel(),
    loadYumBrandMarketChannelWeekPanel(),
    loadYumDataQualityChecks(),
    loadYumMarketDim(),
    loadYumMenuItemDim(),
    loadYumChannelDim(),
    loadYumCalendarDim(),
    loadYumCalendarWeekDim(),
    loadYumExternalMacroMonthly(),
    loadYumStoreItemWeekPanel(),
    loadYumStoreChannelWeekPanel(),
    loadYumPromoCalendar()
  ]);

  return {
    manifest,
    metadata,
    brandDim,
    brandMarketNetwork,
    brandWeekSummary,
    brandMarketProductChannelWeekPanel,
    brandMarketChannelWeekPanel,
    dataQualityChecks,
    marketDim,
    menuItemDim,
    channelDim,
    calendarDim,
    calendarWeekDim,
    externalMacroMonthly,
    storeItemWeekPanel,
    storeChannelWeekPanel,
    promoCalendar
  };
}

export async function getYumFoundationSummary(brandId = 'qsr') {
  const foundation = await loadYumFoundation();
  const networkRows = foundation.brandMarketNetwork.filter(row => row.brand_id === brandId);
  const marketIds = new Set(networkRows.map(row => row.market_id));
  const products = foundation.brandMarketProductChannelWeekPanel.filter(row => row.brand_id === brandId);
  const items = new Set(products.map(row => row.product_id));
  const channels = [...new Set(products.map(row => row.channel_id))].sort();
  const latestWeek = products.reduce((max, row) => {
    if (!max || row.week_start > max) return row.week_start;
    return max;
  }, null);
  const latestSummary = foundation.brandWeekSummary.find(
    row => row.brand_id === brandId && row.week_start === latestWeek
  );
  const latestRevenue = Number(latestSummary?.system_sales) || 0;
  const latestUnits = Number(latestSummary?.system_orders) || 0;
  const stores = networkRows.reduce((sum, row) => sum + (Number(row.store_count_proxy) || 0), 0);

  return {
    brandId,
    stores,
    markets: marketIds.size,
    items: items.size,
    channels,
    panelRows: products.length,
    latestWeek,
    latestRevenue,
    latestUnits
  };
}
