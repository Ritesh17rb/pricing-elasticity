import {
  loadYumMenuItemDim,
  loadYumStoreItemWeekPanel
} from './yum-data-loader.js';
import { DEFAULT_YUM_BRAND_ID } from './yum-brand-utils.js';

function round(value, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function aggregateRows(rows) {
  const units = rows.reduce((sum, row) => sum + (Number(row.units) || 0), 0);
  const sales = rows.reduce((sum, row) => sum + (Number(row.net_sales) || 0), 0);
  const margin = rows.reduce((sum, row) => sum + (Number(row.contribution_margin) || 0), 0);
  const avgPrice = units > 0 ? sales / units : 0;
  return {
    units,
    sales,
    margin,
    avgPrice: round(avgPrice, 2)
  };
}

export async function getBrandItemSummaries(brandId = DEFAULT_YUM_BRAND_ID) {
  const [menuItems, panel] = await Promise.all([
    loadYumMenuItemDim(),
    loadYumStoreItemWeekPanel()
  ]);

  const brandItems = menuItems.filter(row => row.brand_id === brandId);
  const brandPanel = panel.filter(row => row.brand_id === brandId);
  const latestWeek = brandPanel.reduce((max, row) => (!max || row.week_start > max ? row.week_start : max), null);

  return brandItems.map(item => {
    const itemRows = brandPanel.filter(row => row.item_id === item.item_id);
    const latestRows = latestWeek ? itemRows.filter(row => row.week_start === latestWeek) : itemRows;
    const aggregate = aggregateRows(latestRows);
    return {
      brandId: item.brand_id,
      itemId: item.item_id,
      itemName: item.item_name,
      category: item.category,
      priceTier: item.price_tier,
      elasticity: Number(item.elasticity_prior),
      latestWeek,
      avgNetPrice: aggregate.avgPrice,
      weeklyUnits: aggregate.units,
      weeklySales: round(aggregate.sales, 2),
      weeklyMargin: round(aggregate.margin, 2)
    };
  }).sort((a, b) => b.weeklySales - a.weeklySales);
}

export async function simulateBrandPriceChange({
  brandId = DEFAULT_YUM_BRAND_ID,
  itemId,
  newPrice,
  marketId = null,
  channel = null
}) {
  const [menuItems, panel] = await Promise.all([
    loadYumMenuItemDim(),
    loadYumStoreItemWeekPanel()
  ]);

  const item = menuItems.find(row => row.brand_id === brandId && row.item_id === itemId);
  if (!item) {
    throw new Error(`Unknown brand item: ${itemId}`);
  }

  const scopedRows = panel.filter(row =>
    row.brand_id === brandId &&
    row.item_id === itemId &&
    (!marketId || row.market_id === marketId) &&
    (!channel || row.channel === channel)
  );

  if (scopedRows.length === 0) {
    throw new Error(`No panel rows found for brand item: ${itemId}`);
  }

  const latestWeek = scopedRows.reduce((max, row) => (!max || row.week_start > max ? row.week_start : max), null);
  const baselineRows = scopedRows.filter(row => row.week_start === latestWeek);
  const baseline = aggregateRows(baselineRows);

  const currentPrice = baseline.avgPrice || Number(item.base_list_price);
  const elasticity = Number(item.elasticity_prior);
  const priceRatio = currentPrice > 0 ? newPrice / currentPrice : 1;
  const forecastUnits = Math.max(1, Math.round(baseline.units * Math.pow(priceRatio, elasticity)));
  const contributionMarginPct = Number(item.contribution_margin_pct);
  const forecastSales = round(forecastUnits * newPrice, 2);
  const forecastMargin = round(forecastSales * contributionMarginPct, 2);

  return {
    brandId,
    marketId: marketId || 'all',
    channel: channel || 'all',
    itemId: item.item_id,
    itemName: item.item_name,
    latestWeek,
    elasticity,
    baseline: {
      avgNetPrice: currentPrice,
      units: baseline.units,
      sales: round(baseline.sales, 2),
      margin: round(baseline.margin, 2)
    },
    scenario: {
      newPrice: round(newPrice, 2),
      units: forecastUnits,
      sales: forecastSales,
      margin: forecastMargin
    },
    delta: {
      pricePct: round(((newPrice / currentPrice) - 1) * 100, 2),
      unitsPct: round(((forecastUnits / baseline.units) - 1) * 100, 2),
      salesPct: round(((forecastSales / baseline.sales) - 1) * 100, 2),
      marginPct: round(((forecastMargin / baseline.margin) - 1) * 100, 2)
    }
  };
}

export async function getQsrItemSummaries() {
  return getBrandItemSummaries('qsr');
}

export async function simulateQsrPriceChange(config) {
  return simulateBrandPriceChange({
    brandId: 'qsr',
    ...config
  });
}
