import { parseCSV } from './csv-utils.js';

const yumCache = {
  manifest: null,
  metadata: null,
  storeDim: null,
  marketDim: null,
  menuItemDim: null,
  channelDim: null,
  calendarDim: null,
  externalMacroMonthly: null,
  storeItemWeekPanel: null,
  storeChannelWeekPanel: null,
  promoCalendar: null,
  itemSubstitutionMatrix: null,
  qaReport: null
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

export async function loadYumStoreDim() {
  if (!yumCache.storeDim) {
    yumCache.storeDim = await fetchCsv('data/yum/processed/store_dim.csv');
  }
  return yumCache.storeDim;
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

export async function loadYumItemSubstitutionMatrix() {
  if (!yumCache.itemSubstitutionMatrix) {
    yumCache.itemSubstitutionMatrix = await fetchCsv('data/yum/processed/item_substitution_matrix.csv');
  }
  return yumCache.itemSubstitutionMatrix;
}

export async function loadYumQAReport() {
  if (!yumCache.qaReport) {
    yumCache.qaReport = await fetchJson('data/yum/qa_report.json');
  }
  return yumCache.qaReport;
}

export async function loadYumFoundation() {
  const [
    manifest,
    metadata,
    storeDim,
    marketDim,
    menuItemDim,
    channelDim,
    calendarDim,
    externalMacroMonthly,
    storeItemWeekPanel,
    storeChannelWeekPanel,
    promoCalendar,
    itemSubstitutionMatrix,
    qaReport
  ] = await Promise.all([
    loadYumManifest(),
    loadYumMetadata(),
    loadYumStoreDim(),
    loadYumMarketDim(),
    loadYumMenuItemDim(),
    loadYumChannelDim(),
    loadYumCalendarDim(),
    loadYumExternalMacroMonthly(),
    loadYumStoreItemWeekPanel(),
    loadYumStoreChannelWeekPanel(),
    loadYumPromoCalendar(),
    loadYumItemSubstitutionMatrix(),
    loadYumQAReport()
  ]);

  return {
    manifest,
    metadata,
    storeDim,
    marketDim,
    menuItemDim,
    channelDim,
    calendarDim,
    externalMacroMonthly,
    storeItemWeekPanel,
    storeChannelWeekPanel,
    promoCalendar,
    itemSubstitutionMatrix,
    qaReport
  };
}

export async function getYumFoundationSummary(brandId = 'tacobell') {
  const foundation = await loadYumFoundation();
  const storeDim = foundation.storeDim.filter(row => row.brand_id === brandId);
  const marketIds = new Set(storeDim.map(row => row.market_id));
  const items = foundation.menuItemDim.filter(row => row.brand_id === brandId);
  const panelRows = foundation.storeItemWeekPanel.filter(row => row.brand_id === brandId);
  const channels = [...new Set(panelRows.map(row => row.channel))].sort();
  const latestWeek = panelRows.reduce((max, row) => {
    if (!max || row.week_start > max) return row.week_start;
    return max;
  }, null);
  const latestRows = latestWeek ? panelRows.filter(row => row.week_start === latestWeek) : [];
  const latestRevenue = latestRows.reduce((sum, row) => sum + (Number(row.net_sales) || 0), 0);
  const latestUnits = latestRows.reduce((sum, row) => sum + (Number(row.units) || 0), 0);

  return {
    brandId,
    stores: storeDim.length,
    markets: marketIds.size,
    items: items.length,
    channels,
    panelRows: panelRows.length,
    latestWeek,
    latestRevenue,
    latestUnits
  };
}
