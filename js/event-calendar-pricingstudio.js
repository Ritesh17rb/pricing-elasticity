import {
  loadYumBrandMarketProductChannelWeekPanel,
  loadYumCalendarWeekDim,
  loadYumPromoCalendar,
  loadYumStoreChannelWeekPanel,
} from './yum-data-loader.js';
import { getSelectedYumBrandId, getYumChannelLabel } from './yum-brand-utils.js';
import { formatCurrency, formatNumber } from './utils.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const ROLLING_WINDOW_DAYS = 364;
const CATEGORY_ORDER = [
  'menu_pricing',
  'value_bundle',
  'digital_loyalty',
  'premium_innovation',
  'occasion_seasonal',
];

const CATEGORY_CONFIG = {
  menu_pricing: {
    label: 'Menu Pricing',
    badgeClass: 'bg-success',
    markerClass: 'event-price',
    filterId: 'filter-menu-pricing',
  },
  value_bundle: {
    label: 'Value & Bundle',
    badgeClass: 'bg-info',
    markerClass: 'event-promo',
    filterId: 'filter-value-bundle',
  },
  digital_loyalty: {
    label: 'Digital & Loyalty',
    badgeClass: 'bg-primary',
    markerClass: 'event-promo',
    filterId: 'filter-digital-loyalty',
  },
  premium_innovation: {
    label: 'Premium & Innovation',
    badgeClass: 'bg-secondary',
    markerClass: 'event-content',
    filterId: 'filter-premium-innovation',
  },
  occasion_seasonal: {
    label: 'Occasion & Seasonal',
    badgeClass: 'bg-warning text-dark',
    markerClass: 'event-seasonal',
    filterId: 'filter-occasion-seasonal',
  },
};

const activeFilters = CATEGORY_ORDER.reduce((filters, categoryId) => {
  filters[categoryId] = true;
  return filters;
}, {});

let promoRows = [];
let productRows = [];
let storeRows = [];
let calendarWeekRows = [];
let allEvents = [];
let promoCampaigns = [];
let filtersBound = false;
let brandListenerBound = false;

function toNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseDate(dateStr) {
  if (!dateStr) return null;
  const date = new Date(`${dateStr}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function toDateKey(date) {
  return date.toISOString().slice(0, 10);
}

function shiftDateString(dateStr, days) {
  const date = parseDate(dateStr);
  if (!date) return dateStr;
  date.setDate(date.getDate() + days);
  return toDateKey(date);
}

function diffDays(leftDateStr, rightDateStr) {
  const left = parseDate(leftDateStr);
  const right = parseDate(rightDateStr);
  if (!left || !right) return Number.POSITIVE_INFINITY;
  return Math.round((right - left) / DAY_MS);
}

function formatDate(dateStr) {
  const date = parseDate(dateStr);
  if (!date) return '-';
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function formatPercent(value) {
  return `${toNumber(value).toFixed(1)}%`;
}

function formatSignedPercent(value) {
  const pct = toNumber(value) * 100;
  return `${pct > 0 ? '+' : ''}${pct.toFixed(1)}%`;
}

function formatSignedCurrency(value) {
  const amount = toNumber(value);
  return `${amount > 0 ? '+' : ''}${formatCurrency(amount)}`;
}

function titleCase(value) {
  return String(value || '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase())
    .trim();
}

function normalize(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function splitHeadlineItems(value) {
  return String(value || '')
    .split('|')
    .map((item) => item.trim())
    .filter(Boolean);
}

function getChannels(scope) {
  return String(scope || '')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
}

function buildProductIndex(rows) {
  const index = new Map();
  rows.forEach((row) => {
    const key = `${row.week_start}|${row.market_id}|${row.channel_id}`;
    const bucket = index.get(key) || [];
    bucket.push(row);
    index.set(key, bucket);
  });
  return index;
}

function getRollingWindowBounds() {
  const end = new Date();
  end.setHours(0, 0, 0, 0);
  const start = new Date(end);
  start.setDate(start.getDate() - ROLLING_WINDOW_DAYS);
  return { start, end };
}

function getCategoryConfig(categoryId) {
  return CATEGORY_CONFIG[categoryId] || {
    label: titleCase(categoryId),
    badgeClass: 'bg-secondary',
    markerClass: 'event-content',
    filterId: null,
  };
}

function mapOfferTypeToCategory(offerType) {
  if (offerType === 'family_bundle') return 'value_bundle';
  if (offerType === 'digital_value' || offerType === 'loyalty_offer') return 'digital_loyalty';
  if (offerType === 'premium_ladder') return 'premium_innovation';
  return 'value_bundle';
}

function getTheme(offerType) {
  if (offerType === 'family_bundle') return 'Bundle-led family traffic';
  if (offerType === 'digital_value' || offerType === 'loyalty_offer') return 'Digital and loyalty demand';
  if (offerType === 'premium_ladder') return 'Premium and innovation trade-up';
  return 'Promotion';
}

function getPromoSupportRows(promo, productIndex, scopedProductRows) {
  const channels = getChannels(promo.channel_scope);
  const sourceRows = channels.length
    ? channels.flatMap((channel) => productIndex.get(`${promo.week_start}|${promo.market_id}|${channel}`) || [])
    : scopedProductRows.filter((row) => row.week_start === promo.week_start && row.market_id === promo.market_id);
  const headlineItems = splitHeadlineItems(promo.headline_items);
  const exactRows = sourceRows.filter((row) => headlineItems.some((item) => normalize(item) === normalize(row.product_name)));
  if (exactRows.length) return exactRows;

  return sourceRows.filter((row) => {
    if (promo.offer_type === 'family_bundle') return row.product_role === 'family_meal' || row.product_family === 'bundles' || row.shareable_flag === 'true';
    if (promo.offer_type === 'digital_value' || promo.offer_type === 'loyalty_offer') return row.product_role === 'traffic_builder' || row.value_flag === 'true';
    if (promo.offer_type === 'premium_ladder') return row.product_role === 'innovation' || row.price_tier === 'premium';
    return false;
  });
}

function getTopKeys(metricMap, limit = 3) {
  return [...metricMap.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, limit)
    .map(([key]) => key);
}

function shiftEventIntoRollingWindow(event, bounds) {
  const originalDate = parseDate(event.date);
  if (!originalDate) return null;

  const shiftedDate = new Date(originalDate);
  let offsetDays = 0;
  while (shiftedDate < bounds.start) {
    shiftedDate.setDate(shiftedDate.getDate() + 364);
    offsetDays += 364;
  }

  if (shiftedDate > bounds.end) return null;

  return {
    ...event,
    date: toDateKey(shiftedDate),
    start_date: event.start_date ? shiftDateString(event.start_date, offsetDays) : toDateKey(shiftedDate),
    end_date: event.end_date ? shiftDateString(event.end_date, offsetDays) : toDateKey(shiftedDate),
    source_date: event.date,
    source_status: offsetDays > 0 ? 'Modeled from prior-year Pizza Hut pattern' : 'Observed in Pizza Hut data',
  };
}

function getTopProducts(rows, limit = 3) {
  const itemSales = new Map();
  rows.forEach((row) => {
    itemSales.set(row.product_name, (itemSales.get(row.product_name) || 0) + toNumber(row.net_sales));
  });
  return getTopKeys(itemSales, limit);
}

function getTopStoreChannels(rows, limit = 2) {
  const channelSales = new Map();
  rows.forEach((row) => {
    const label = row.channel_name || getYumChannelLabel(row.channel);
    channelSales.set(label, (channelSales.get(label) || 0) + toNumber(row.net_sales));
  });
  return getTopKeys(channelSales, limit);
}

function buildPromoEventsForBrand(brandId) {
  const scopedPromoRows = promoRows.filter((row) => row.brand_id === brandId);
  const scopedProductRows = productRows.filter((row) => row.brand_id === brandId);
  const productIndex = buildProductIndex(scopedProductRows);
  const weeklyGroups = new Map();

  scopedPromoRows.forEach((promo) => {
    const supportRows = getPromoSupportRows(promo, productIndex, scopedProductRows);
    const key = [promo.offer_name, promo.channel_scope, promo.offer_type, promo.week_start].join('|');
    const bucket = weeklyGroups.get(key) || {
      offer_name: promo.offer_name,
      offer_type: promo.offer_type,
      week_start: promo.week_start,
      notes: new Set(),
      markets: new Set(),
      channels: new Set(),
      anchorSales: new Map(),
      supported_sales: 0,
      supported_units: 0,
      discount_weighted_sum: 0,
      price_weighted_sum: 0,
      weight: 0,
    };

    const sales = supportRows.reduce((sum, row) => sum + toNumber(row.net_sales), 0);
    const units = supportRows.reduce((sum, row) => sum + toNumber(row.unit_volume), 0);
    const weight = Math.max(units, 1);
    const weightedPrice = supportRows.reduce((sum, row) => sum + (toNumber(row.realized_price) * Math.max(toNumber(row.unit_volume), 1)), 0);

    bucket.notes.add(promo.notes || 'Promotion window from Pizza Hut modeled calendar.');
    bucket.markets.add(promo.market_id);
    getChannels(promo.channel_scope).forEach((channelId) => bucket.channels.add(getYumChannelLabel(channelId)));
    bucket.supported_sales += sales;
    bucket.supported_units += units;
    bucket.discount_weighted_sum += toNumber(promo.avg_discount_pct) * weight;
    bucket.price_weighted_sum += weightedPrice;
    bucket.weight += weight;

    supportRows.forEach((row) => {
      bucket.anchorSales.set(row.product_name, (bucket.anchorSales.get(row.product_name) || 0) + toNumber(row.net_sales));
    });

    weeklyGroups.set(key, bucket);
  });

  const weeklyEvents = [...weeklyGroups.values()]
    .map((bucket) => ({
      offer_name: bucket.offer_name,
      offer_type: bucket.offer_type,
      date: bucket.week_start,
      supported_sales: bucket.supported_sales,
      supported_units: bucket.supported_units,
      avg_realized_price: bucket.weight > 0 ? bucket.price_weighted_sum / bucket.weight : 0,
      discount_pct: bucket.weight > 0 ? bucket.discount_weighted_sum / bucket.weight : 0,
      channels: [...bucket.channels].join(', ') || 'All Channels',
      anchor_items: getTopKeys(bucket.anchorSales, 3).join(' | '),
      market_count: bucket.markets.size,
      notes: [...bucket.notes].join(' '),
    }))
    .sort((left, right) => left.date.localeCompare(right.date));

  const windows = [];
  const groupedByOffer = new Map();

  weeklyEvents.forEach((event) => {
    const key = `${event.offer_name}|${event.offer_type}|${event.channels}`;
    const bucket = groupedByOffer.get(key) || [];
    bucket.push(event);
    groupedByOffer.set(key, bucket);
  });

  groupedByOffer.forEach((events, key) => {
    const [offerName, offerType, channels] = key.split('|');
    const sortedEvents = [...events].sort((left, right) => left.date.localeCompare(right.date));
    let currentWindow = null;

    sortedEvents.forEach((event) => {
      const canExtend = currentWindow && diffDays(currentWindow.end_date, event.date) <= 21;
      if (!canExtend) {
        if (currentWindow) windows.push(currentWindow);
        currentWindow = {
          event_id: `promo_${offerName}_${event.date}`.replace(/[^a-z0-9_]+/gi, '_').toLowerCase(),
          category_id: mapOfferTypeToCategory(offerType),
          title: offerName,
          event_type: getCategoryConfig(mapOfferTypeToCategory(offerType)).label,
          tier: getTheme(offerType),
          date: event.date,
          start_date: event.date,
          end_date: event.date,
          channels,
          notes: new Set([event.notes]),
          anchor_items: new Map(),
          supported_sales: 0,
          supported_units: 0,
          discount_weighted_sum: 0,
          price_weighted_sum: 0,
          weight: 0,
          market_count: 0,
        };
      }

      currentWindow.end_date = event.date;
      currentWindow.supported_sales += event.supported_sales;
      currentWindow.supported_units += event.supported_units;
      currentWindow.discount_weighted_sum += event.discount_pct * Math.max(event.supported_units, 1);
      currentWindow.price_weighted_sum += event.avg_realized_price * Math.max(event.supported_units, 1);
      currentWindow.weight += Math.max(event.supported_units, 1);
      currentWindow.market_count = Math.max(currentWindow.market_count, event.market_count);
      currentWindow.notes.add(event.notes);
      splitHeadlineItems(event.anchor_items).forEach((item) => {
        currentWindow.anchor_items.set(item, (currentWindow.anchor_items.get(item) || 0) + 1);
      });
    });

    if (currentWindow) windows.push(currentWindow);
  });

  return windows.map((window) => ({
    event_id: window.event_id,
    category_id: window.category_id,
    event_type: getCategoryConfig(window.category_id).label,
    title: window.title,
    tier: window.tier,
    date: window.date,
    start_date: window.start_date,
    end_date: window.end_date,
    channels: window.channels,
    notes: [...window.notes].join(' '),
    anchor_items: getTopKeys(window.anchor_items, 3).join(' | '),
    supported_sales: window.supported_sales,
    supported_units: window.supported_units,
    avg_realized_price: window.weight > 0 ? window.price_weighted_sum / window.weight : 0,
    discount_pct: window.weight > 0 ? window.discount_weighted_sum / window.weight : 0,
    market_count: window.market_count,
    window_weeks: Math.max(1, Math.round(diffDays(window.start_date, window.end_date) / 7) + 1),
  }));
}

function buildMenuPricingEventsForBrand(brandId) {
  const scopedRows = productRows.filter((row) => row.brand_id === brandId);
  const weeklyProductMap = new Map();

  scopedRows.forEach((row) => {
    const channelLabel = getYumChannelLabel(row.channel_id);
    const key = `${row.product_name}|${row.week_start}`;
    const bucket = weeklyProductMap.get(key) || {
      product_name: row.product_name,
      week_start: row.week_start,
      product_role: row.product_role,
      price_tier: row.price_tier,
      units: 0,
      sales: 0,
      price_weighted_sum: 0,
      channels: new Map(),
    };
    const units = toNumber(row.unit_volume);
    const weight = Math.max(units, 1);
    bucket.units += units;
    bucket.sales += toNumber(row.net_sales);
    bucket.price_weighted_sum += toNumber(row.realized_price) * weight;
    bucket.channels.set(channelLabel, (bucket.channels.get(channelLabel) || 0) + toNumber(row.net_sales));
    weeklyProductMap.set(key, bucket);
  });

  const perProductSeries = new Map();
  [...weeklyProductMap.values()].forEach((bucket) => {
    const series = perProductSeries.get(bucket.product_name) || [];
    series.push({
      week_start: bucket.week_start,
      product_name: bucket.product_name,
      product_role: bucket.product_role,
      price_tier: bucket.price_tier,
      units: bucket.units,
      sales: bucket.sales,
      avg_realized_price: bucket.units > 0 ? bucket.price_weighted_sum / bucket.units : 0,
      channels: getTopKeys(bucket.channels, 2).join(', '),
    });
    perProductSeries.set(bucket.product_name, series);
  });

  const candidates = [];
  perProductSeries.forEach((series, productName) => {
    const sortedSeries = [...series].sort((left, right) => left.week_start.localeCompare(right.week_start));
    for (let index = 1; index < sortedSeries.length; index += 1) {
      const previous = sortedSeries[index - 1];
      const current = sortedSeries[index];
      if (!previous.avg_realized_price) continue;
      const delta = current.avg_realized_price - previous.avg_realized_price;
      const deltaPct = delta / previous.avg_realized_price;
      const impactScore = Math.abs(delta) * Math.max(current.units, 1);
      if (Math.abs(delta) < 0.1 || Math.abs(deltaPct) < 0.015) continue;

      candidates.push({
        event_id: `menu_price_${productName}_${current.week_start}`.replace(/[^a-z0-9_]+/gi, '_').toLowerCase(),
        category_id: 'menu_pricing',
        event_type: getCategoryConfig('menu_pricing').label,
        title: `${productName} ${delta > 0 ? 'price step-up' : 'price reset'}`,
        tier: `${titleCase(current.product_role || 'core')} | ${titleCase(current.price_tier || 'priced')}`,
        date: current.week_start,
        start_date: current.week_start,
        end_date: current.week_start,
        channels: current.channels || 'All Channels',
        notes: `Weighted realized price moved from ${formatCurrency(previous.avg_realized_price)} to ${formatCurrency(current.avg_realized_price)} on ${productName}.`,
        anchor_items: productName,
        supported_sales: current.sales,
        supported_units: current.units,
        avg_realized_price: current.avg_realized_price,
        price_from: previous.avg_realized_price,
        price_to: current.avg_realized_price,
        price_change_amount: delta,
        price_change_pct: deltaPct,
        impact_score: impactScore,
      });
    }
  });

  const strongestByWeek = new Map();
  candidates.forEach((candidate) => {
    const existing = strongestByWeek.get(candidate.date);
    if (!existing || candidate.impact_score > existing.impact_score) {
      strongestByWeek.set(candidate.date, candidate);
    }
  });

  return [...strongestByWeek.values()]
    .sort((left, right) => right.impact_score - left.impact_score)
    .slice(0, 10)
    .sort((left, right) => left.date.localeCompare(right.date));
}

function getWindowCategory(windowName, row) {
  const normalizedWindow = normalize(windowName);
  if (normalizedWindow.includes('innovation')) return 'premium_innovation';
  if (normalizedWindow.includes('value')) return 'value_bundle';
  if (normalizedWindow.includes('holiday') || normalizedWindow.includes('football') || row.holiday_proxy_flag === 'true' || row.sports_peak_flag === 'true') {
    return 'occasion_seasonal';
  }
  return 'occasion_seasonal';
}

function buildCalendarWindowEventsForBrand(brandId) {
  const flaggedRows = calendarWeekRows
    .filter((row) => row.portfolio_event_window || row.holiday_proxy_flag === 'true' || row.sports_peak_flag === 'true')
    .sort((left, right) => left.week_start.localeCompare(right.week_start));

  const windows = [];
  let currentWindow = null;

  flaggedRows.forEach((row) => {
    const windowName = row.portfolio_event_window || `${row.season_label || 'seasonal'} demand window`;
    const categoryId = getWindowCategory(windowName, row);
    const signalKey = [
      windowName,
      row.holiday_proxy_flag === 'true' ? 'holiday' : '',
      row.sports_peak_flag === 'true' ? 'sports' : '',
    ].join('|');

    const canExtend = currentWindow
      && currentWindow.signal_key === signalKey
      && diffDays(currentWindow.end_date, row.week_start) <= 7;

    if (!canExtend) {
      if (currentWindow) windows.push(currentWindow);
      currentWindow = {
        event_id: `calendar_${windowName}_${row.week_start}`.replace(/[^a-z0-9_]+/gi, '_').toLowerCase(),
        signal_key: signalKey,
        category_id: categoryId,
        title: titleCase(windowName),
        date: row.week_start,
        start_date: row.week_start,
        end_date: row.week_start,
        signals: new Set(),
      };
    }

    currentWindow.end_date = row.week_start;
    currentWindow.signals.add(titleCase(row.season_label));
    if (row.holiday_proxy_flag === 'true') currentWindow.signals.add('Holiday demand');
    if (row.sports_peak_flag === 'true') currentWindow.signals.add('Sports viewing');
  });

  if (currentWindow) windows.push(currentWindow);

  const scopedStoreRows = storeRows.filter((row) => row.brand_id === brandId);
  const scopedProductRows = productRows.filter((row) => row.brand_id === brandId);

  return windows.map((window) => {
    const windowStoreRows = scopedStoreRows.filter((row) => row.week_start >= window.start_date && row.week_start <= window.end_date);
    const windowProductRows = scopedProductRows.filter((row) => row.week_start >= window.start_date && row.week_start <= window.end_date);
    const supportedSales = windowStoreRows.reduce((sum, row) => sum + toNumber(row.net_sales), 0);
    const supportedTransactions = windowStoreRows.reduce((sum, row) => sum + toNumber(row.transaction_count_proxy), 0);
    const avgCheckWeightedSum = windowStoreRows.reduce((sum, row) => sum + (toNumber(row.avg_check_proxy) * Math.max(toNumber(row.transaction_count_proxy), 1)), 0);
    const avgCheckWeight = windowStoreRows.reduce((sum, row) => sum + Math.max(toNumber(row.transaction_count_proxy), 1), 0);

    return {
      event_id: window.event_id,
      category_id: window.category_id,
      event_type: getCategoryConfig(window.category_id).label,
      title: window.title,
      tier: [...window.signals].join(' | '),
      date: window.date,
      start_date: window.start_date,
      end_date: window.end_date,
      channels: getTopStoreChannels(windowStoreRows).join(', ') || 'All Channels',
      notes: 'Calendar-driven Pizza Hut demand window built from the operating calendar and seasonal store signals.',
      anchor_items: getTopProducts(windowProductRows).join(' | '),
      supported_sales: supportedSales,
      supported_units: supportedTransactions,
      avg_realized_price: avgCheckWeight > 0 ? avgCheckWeightedSum / avgCheckWeight : 0,
      window_weeks: Math.max(1, Math.round(diffDays(window.start_date, window.end_date) / 7) + 1),
      signal_labels: [...window.signals],
    };
  });
}

function dedupeEvents(events) {
  const deduped = new Map();
  events.forEach((event) => {
    const key = [event.category_id, event.title, event.date].join('|');
    const existing = deduped.get(key);
    if (!existing || toNumber(event.supported_sales) > toNumber(existing.supported_sales)) {
      deduped.set(key, event);
    }
  });
  return [...deduped.values()].sort((left, right) => left.date.localeCompare(right.date));
}

function buildPromoCampaigns(promoEvents) {
  const grouped = new Map();

  promoEvents.forEach((event) => {
    const bucket = grouped.get(event.title) || {
      campaign_name: event.title,
      start_date: event.start_date,
      end_date: event.end_date,
      channels: new Set(),
      categories: new Set(),
      windows: 0,
      supported_sales: 0,
      supported_units: 0,
      discount_weighted_sum: 0,
      price_weighted_sum: 0,
      weight: 0,
      modeled_count: 0,
      observed_count: 0,
    };

    bucket.start_date = event.start_date < bucket.start_date ? event.start_date : bucket.start_date;
    bucket.end_date = event.end_date > bucket.end_date ? event.end_date : bucket.end_date;
    event.channels.split(',').map((channel) => channel.trim()).filter(Boolean).forEach((channel) => bucket.channels.add(channel));
    bucket.categories.add(getCategoryConfig(event.category_id).label);
    bucket.windows += 1;
    bucket.supported_sales += toNumber(event.supported_sales);
    bucket.supported_units += toNumber(event.supported_units);
    bucket.discount_weighted_sum += toNumber(event.discount_pct) * Math.max(toNumber(event.supported_units), 1);
    bucket.price_weighted_sum += toNumber(event.avg_realized_price) * Math.max(toNumber(event.supported_units), 1);
    bucket.weight += Math.max(toNumber(event.supported_units), 1);
    if (String(event.source_status).startsWith('Modeled')) bucket.modeled_count += 1;
    else bucket.observed_count += 1;
    grouped.set(event.title, bucket);
  });

  return [...grouped.values()]
    .map((campaign, index) => ({
      campaign_id: `campaign_${String(index + 1).padStart(2, '0')}`,
      campaign_name: campaign.campaign_name,
      start_date: campaign.start_date,
      end_date: campaign.end_date,
      channels: [...campaign.channels],
      categories: [...campaign.categories],
      windows: campaign.windows,
      supported_sales: campaign.supported_sales,
      supported_units: campaign.supported_units,
      discount_pct: campaign.weight > 0 ? campaign.discount_weighted_sum / campaign.weight : 0,
      avg_realized_price: campaign.weight > 0 ? campaign.price_weighted_sum / campaign.weight : 0,
      status: campaign.modeled_count > 0 && campaign.observed_count === 0 ? 'Modeled' : (campaign.modeled_count > 0 ? 'Mixed' : 'Observed'),
    }))
    .sort((left, right) => right.start_date.localeCompare(left.start_date));
}

function filterEvents() {
  return allEvents.filter((event) => activeFilters[event.category_id]);
}

function updateEventCountBadge() {
  const badge = document.getElementById('event-count-badge');
  if (!badge) return;
  const filteredEvents = filterEvents();
  const modeledCount = filteredEvents.filter((event) => String(event.source_status).startsWith('Modeled')).length;
  const observedCount = filteredEvents.length - modeledCount;
  badge.textContent = `${filteredEvents.length} events (${observedCount} observed, ${modeledCount} modeled)`;
}

function buildTimelineMarkers(startDate, endDate) {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const totalDays = Math.max(1, Math.round((end - start) / DAY_MS));
  return [0, 0.33, 0.66, 1].map((ratio) => {
    const markerDate = new Date(start);
    markerDate.setDate(markerDate.getDate() + Math.round(totalDays * ratio));
    return {
      label: markerDate.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
      left: `${(ratio * 100).toFixed(2)}%`,
    };
  });
}

function attachTimelineGeometry(events, bounds) {
  const lanePositions = [4, -20, 28];
  const laneLastPercent = lanePositions.map(() => -999);
  const totalDays = Math.max(1, Math.round((bounds.end - bounds.start) / DAY_MS));

  return [...events]
    .sort((left, right) => left.date.localeCompare(right.date))
    .map((event) => {
      const eventDate = parseDate(event.date);
      const positionPercent = Math.max(0, Math.min(100, (((eventDate - bounds.start) / DAY_MS) / totalDays) * 100));
      let laneIndex = 0;
      while (laneIndex < laneLastPercent.length && Math.abs(positionPercent - laneLastPercent[laneIndex]) < 4) {
        laneIndex += 1;
      }
      if (laneIndex >= lanePositions.length) laneIndex = lanePositions.length - 1;
      laneLastPercent[laneIndex] = positionPercent;
      return {
        ...event,
        positionPercent,
        markerTop: lanePositions[laneIndex],
      };
    });
}

function renderEventTimeline() {
  const container = document.getElementById('event-timeline');
  if (!container) return;

  const filteredEvents = filterEvents();
  if (!filteredEvents.length) {
    container.innerHTML = '<div class="text-center text-muted">No events match the current filters</div>';
    return;
  }

  const bounds = getRollingWindowBounds();
  const displayEvents = attachTimelineGeometry(filteredEvents, bounds);
  const visibleCategories = CATEGORY_ORDER.filter((categoryId) => filteredEvents.some((event) => event.category_id === categoryId));
  const markers = buildTimelineMarkers(bounds.start, bounds.end);

  let html = '<div class="timeline-slider-container">';
  html += '<div class="d-flex flex-wrap justify-content-center gap-3 mb-3">';
  visibleCategories.forEach((categoryId) => {
    const config = getCategoryConfig(categoryId);
    html += `
      <div class="d-flex align-items-center">
        <div class="timeline-event ${config.markerClass}" style="position: static; transform: none;"></div>
        <span class="ms-2 small">${config.label}</span>
      </div>
    `;
  });
  html += '</div>';
  html += '<div class="timeline-years">';
  markers.forEach((marker) => {
    html += `<div class="timeline-year-marker" style="left: ${marker.left};">${marker.label}</div>`;
  });
  html += '</div>';
  html += '<div class="timeline-track">';
  displayEvents.forEach((event) => {
    const config = getCategoryConfig(event.category_id);
    html += `
      <div class="timeline-event ${config.markerClass}"
           style="left: ${event.positionPercent}%; top: calc(50% + ${event.markerTop}px);"
           data-event-id="${event.event_id}"
           title="${event.title} | ${formatDate(event.date)}">
      </div>
    `;
  });
  html += '</div>';
  html += '<div class="timeline-details mt-4" id="timeline-details" style="display: none;"></div>';
  html += '</div>';

  container.innerHTML = html;
  container.querySelectorAll('.timeline-event[data-event-id]').forEach((marker) => {
    marker.addEventListener('click', () => {
      const event = filteredEvents.find((row) => row.event_id === marker.dataset.eventId);
      if (event) showEventDetails(event);
    });
  });
}

function buildOutputSummary(event) {
  if (event.category_id === 'menu_pricing') {
    return `${formatSignedPercent(event.price_change_pct)} to ${formatCurrency(event.price_to)} | ${formatCurrency(event.supported_sales)} sales`;
  }
  if (toNumber(event.discount_pct) > 0) {
    return `${formatPercent(event.discount_pct)} off | ${formatCurrency(event.supported_sales)} sales`;
  }
  if (toNumber(event.supported_units) > 0) {
    return `${formatCurrency(event.supported_sales)} sales | ${formatNumber(Math.round(event.supported_units))} volume`;
  }
  return formatCurrency(event.supported_sales);
}

function showEventDetails(event) {
  const detailsPanel = document.getElementById('timeline-details');
  if (!detailsPanel) return;

  const category = getCategoryConfig(event.category_id);
  const metrics = [
    { label: 'Timing', value: event.start_date && event.end_date && event.start_date !== event.end_date ? `${formatDate(event.start_date)} to ${formatDate(event.end_date)}` : formatDate(event.date) },
    { label: 'Channels', value: event.channels || 'All Channels' },
    { label: 'Supported sales', value: formatCurrency(event.supported_sales) },
    { label: 'Supported volume', value: formatNumber(Math.round(event.supported_units || 0)) },
  ];

  if (event.category_id === 'menu_pricing') {
    metrics.push({ label: 'Price move', value: `${formatSignedCurrency(event.price_change_amount)} (${formatSignedPercent(event.price_change_pct)})` });
    metrics.push({ label: 'Current price', value: formatCurrency(event.price_to) });
  } else if (toNumber(event.discount_pct) > 0) {
    metrics.push({ label: 'Discount', value: formatPercent(event.discount_pct) });
    metrics.push({ label: 'Realized price', value: formatCurrency(event.avg_realized_price) });
  } else {
    metrics.push({ label: 'Window length', value: `${event.window_weeks || 1} week${(event.window_weeks || 1) === 1 ? '' : 's'}` });
    metrics.push({ label: 'Avg ticket', value: formatCurrency(event.avg_realized_price) });
  }

  const anchorItems = splitHeadlineItems(event.anchor_items);

  detailsPanel.innerHTML = `
    <div class="glass-card p-4">
      <div class="d-flex justify-content-between align-items-start mb-3">
        <div>
          <div class="mb-2">
            <span class="badge ${category.badgeClass} me-2">${category.label}</span>
            <span class="badge bg-light text-dark">${event.source_status}</span>
          </div>
          <h5 class="mb-1">${event.title}</h5>
          <div class="text-muted small">${event.tier || 'Pizza Hut campaign window'}</div>
        </div>
        <button type="button" class="btn-close" aria-label="Close" onclick="document.getElementById('timeline-details').style.display='none'"></button>
      </div>
      <p class="mb-3">${event.notes || 'No campaign description available.'}</p>
      <div class="row g-3 mb-3">
        ${metrics.map((metric) => `
          <div class="col-md-4">
            <div class="border rounded p-3 h-100">
              <div class="small text-uppercase text-muted fw-semibold mb-1">${metric.label}</div>
              <div class="small fw-semibold">${metric.value}</div>
            </div>
          </div>
        `).join('')}
      </div>
      ${anchorItems.length ? `
        <div class="small">
          <span class="text-uppercase text-muted fw-semibold me-2">Anchor items</span>
          ${anchorItems.map((item) => `<span class="badge bg-light text-dark me-1">${item}</span>`).join('')}
        </div>
      ` : ''}
    </div>
  `;
  detailsPanel.style.display = 'block';
}

function renderEventTable() {
  const tbody = document.getElementById('event-table-body');
  if (!tbody) return;

  const filteredEvents = filterEvents().sort((left, right) => right.date.localeCompare(left.date));
  if (!filteredEvents.length) {
    tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted">No events match the current filters</td></tr>';
    return;
  }

  tbody.innerHTML = filteredEvents.map((event) => {
    const category = getCategoryConfig(event.category_id);
    return `
      <tr data-event-id="${event.event_id}" style="cursor: pointer;">
        <td class="text-nowrap">${event.start_date && event.end_date && event.start_date !== event.end_date ? formatDate(event.start_date) : formatDate(event.date)}</td>
        <td><span class="badge ${category.badgeClass}">${category.label}</span></td>
        <td>
          <div class="fw-semibold">${event.title}</div>
          <div class="small text-muted">${event.source_status}</div>
        </td>
        <td class="small">${event.channels || 'All Channels'}</td>
        <td class="small">${buildOutputSummary(event)}</td>
        <td class="small">${event.notes || '-'}</td>
      </tr>
    `;
  }).join('');

  tbody.querySelectorAll('tr[data-event-id]').forEach((row) => {
    row.addEventListener('click', () => {
      const event = filteredEvents.find((candidate) => candidate.event_id === row.dataset.eventId);
      if (event) showEventDetails(event);
    });
  });
}

function renderPromoCards() {
  const container = document.getElementById('promo-cards-container');
  if (!container) return;

  if (!promoCampaigns.length) {
    container.innerHTML = '<div class="col-12 text-center text-muted">No campaign output summaries available</div>';
    return;
  }

  const statusClass = {
    Observed: 'success',
    Mixed: 'warning',
    Modeled: 'secondary',
  };

  container.innerHTML = promoCampaigns.map((campaign) => `
    <div class="col-md-6 col-lg-4 mb-3">
      <div class="card h-100">
        <div class="card-header bg-${statusClass[campaign.status] || 'primary'} text-white">
          <div class="d-flex justify-content-between align-items-center">
            <h6 class="mb-0">${campaign.campaign_name}</h6>
            <span class="badge bg-light text-dark">${campaign.status}</span>
          </div>
        </div>
        <div class="card-body">
          <div class="mb-2"><strong>Window:</strong> ${formatDate(campaign.start_date)} to ${formatDate(campaign.end_date)}</div>
          <div class="mb-2"><strong>Flights:</strong> ${campaign.windows}</div>
          <div class="mb-2"><strong>Supported sales:</strong> ${formatCurrency(campaign.supported_sales)}</div>
          <div class="mb-2"><strong>Supported volume:</strong> ${formatNumber(Math.round(campaign.supported_units))}</div>
          <div class="mb-2"><strong>Avg discount:</strong> ${formatPercent(campaign.discount_pct)}</div>
          <div class="mb-2"><strong>Realized price:</strong> ${formatCurrency(campaign.avg_realized_price)}</div>
          <div class="mt-3 small text-muted">
            <strong>Focus:</strong> ${campaign.categories.map((category) => `<span class="badge bg-light text-dark me-1">${category}</span>`).join('')}
          </div>
          <div class="mt-2 small text-muted">
            <strong>Channels:</strong> ${campaign.channels.map((channel) => `<span class="badge bg-light text-dark me-1">${channel}</span>`).join('')}
          </div>
        </div>
      </div>
    </div>
  `).join('');
}

function setupEventFilters() {
  if (filtersBound) return;

  const filterAll = document.getElementById('filter-all');
  const filterElements = CATEGORY_ORDER.reduce((elements, categoryId) => {
    const config = getCategoryConfig(categoryId);
    elements[categoryId] = document.getElementById(config.filterId);
    return elements;
  }, {});

  const rerender = () => {
    if (filterAll) filterAll.checked = CATEGORY_ORDER.every((categoryId) => activeFilters[categoryId]);
    updateEventCountBadge();
    renderEventTimeline();
    renderEventTable();
  };

  filterAll?.addEventListener('change', (event) => {
    CATEGORY_ORDER.forEach((categoryId) => {
      activeFilters[categoryId] = event.target.checked;
      if (filterElements[categoryId]) filterElements[categoryId].checked = event.target.checked;
    });
    rerender();
  });

  CATEGORY_ORDER.forEach((categoryId) => {
    filterElements[categoryId]?.addEventListener('change', (event) => {
      activeFilters[categoryId] = event.target.checked;
      rerender();
    });
  });

  filtersBound = true;
}

function refreshEventCalendar() {
  const brandId = getSelectedYumBrandId();
  const bounds = getRollingWindowBounds();
  const sourceEvents = [
    ...buildMenuPricingEventsForBrand(brandId),
    ...buildPromoEventsForBrand(brandId),
    ...buildCalendarWindowEventsForBrand(brandId),
  ];

  allEvents = dedupeEvents(
    sourceEvents
      .map((event) => shiftEventIntoRollingWindow(event, bounds))
      .filter(Boolean),
  );

  promoCampaigns = buildPromoCampaigns(
    allEvents.filter((event) => ['value_bundle', 'digital_loyalty', 'premium_innovation'].includes(event.category_id)),
  );

  updateEventCountBadge();
  renderEventTimeline();
  renderEventTable();
  renderPromoCards();
}

export async function initializeEventCalendar() {
  [promoRows, productRows, storeRows, calendarWeekRows] = await Promise.all([
    loadYumPromoCalendar(),
    loadYumBrandMarketProductChannelWeekPanel(),
    loadYumStoreChannelWeekPanel(),
    loadYumCalendarWeekDim(),
  ]);

  setupEventFilters();
  if (!brandListenerBound) {
    window.addEventListener('yum-brand-change', refreshEventCalendar);
    brandListenerBound = true;
  }
  refreshEventCalendar();
}
