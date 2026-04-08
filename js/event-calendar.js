/**
 * Pizza Hut Promotion Performance & Calendar
 * Uses modeled Pizza Hut promotion windows plus operating panels.
 */

import {
  loadYumBrandMarketProductChannelWeekPanel,
  loadYumCalendarDim,
  loadYumCalendarWeekDim,
  loadYumPromoCalendar,
  loadYumStoreChannelWeekPanel,
} from './yum-data-loader.js';
import {
  getSelectedYumBrandId,
  getYumBrandLabel,
  getYumChannelLabel,
} from './yum-brand-utils.js';
import { formatCurrency, formatNumber } from './utils.js';

const OFFER_THEME_META = {
  family_bundle: {
    label: 'Value & Bundle',
    category: 'value',
    summary: 'Bundle-led family demand windows anchored by shareable pizzas and sides.',
  },
  digital_value: {
    label: 'Digital Value',
    category: 'digital',
    summary: 'Carryout and app-first value windows aimed at traffic and order frequency.',
  },
  loyalty_offer: {
    label: 'Digital & Loyalty',
    category: 'digital',
    summary: 'Rewards-led offer windows used to reinforce repeat and app-led demand.',
  },
  premium_ladder: {
    label: 'Premium & Innovation',
    category: 'premium',
    summary: 'Higher-ticket product windows designed to support premium pizza and innovation news.',
  },
};

const EVENT_STYLES = {
  value: {
    className: 'event-content',
    badgeClass: 'bg-warning text-dark',
    badgeText: 'Value & Bundle',
  },
  digital: {
    className: 'event-promo',
    badgeClass: 'bg-primary',
    badgeText: 'Digital & Loyalty',
  },
  premium: {
    className: 'event-official',
    badgeClass: 'bg-danger',
    badgeText: 'Premium & Innovation',
  },
  tentpole: {
    className: 'event-tentpole',
    badgeClass: 'bg-warning text-dark',
    badgeText: 'Tentpole Window',
  },
  seasonal: {
    className: 'event-seasonal',
    badgeClass: 'bg-success',
    badgeText: 'Seasonal Window',
  },
};

const CALENDAR_WINDOW_DEFINITIONS = {
  value_reset: {
    title: 'Value Reset Window',
    typeLabel: 'Seasonal Value Window',
    category: 'seasonal',
    note: 'Early-year value focus when pay cycles and value-seeking behavior matter most.',
  },
  spring_innovation: {
    title: 'Spring Innovation Window',
    typeLabel: 'Seasonal Innovation Window',
    category: 'seasonal',
    note: 'Menu news and product rotation period where brands can lean on innovation-led traffic.',
  },
  summer_traffic: {
    title: 'Summer Traffic Window',
    typeLabel: 'Seasonal Traffic Window',
    category: 'seasonal',
    note: 'Travel, out-of-home occasions, and warm-weather traffic can change promo pressure by channel.',
  },
  football_bundle_push: {
    title: 'Football / Game-Day Tentpole',
    typeLabel: 'Tentpole Demand Window',
    category: 'tentpole',
    note: 'Sports-viewing period with heavier bundle and shareable-meal demand.',
  },
  holiday_family_meals: {
    title: 'Holiday Family Meals Tentpole',
    typeLabel: 'Holiday Demand Window',
    category: 'tentpole',
    note: 'Holiday and family-sharing window where large-order demand and promo intensity typically rise.',
  },
};

let allEvents = [];
let modeledPromoWindows = [];
let promoRows = [];
let storeChannelRows = [];
let productPanelRows = [];
let calendarRows = [];
let calendarWeekRows = [];
let currentPromoRows = [];
let currentStoreChannelRows = [];
let currentProductRows = [];
let currentProductIndex = new Map();
let currentBrandLabel = 'Pizza Hut';
let promoCampaignSummaries = [];
let validationWindowRows = [];
let brandListenerBound = false;
let filtersBound = false;

let activeFilters = {
  priceChange: true,
  promo: true,
  tentpole: true,
};

function toNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function isTrueLike(value) {
  return value === true || value === 'true' || value === 1 || value === '1';
}

function getActiveBrandId() {
  return getSelectedYumBrandId();
}

function getActiveBrandLabel() {
  return getYumBrandLabel(getActiveBrandId());
}

function getEventCategory(event) {
  if (event.event_category) return event.event_category;
  if (event.offer_type === 'calendar_window') return 'seasonal';
  return (OFFER_THEME_META[event.offer_type] || OFFER_THEME_META.family_bundle).category;
}

function getEventSourceGroup(event) {
  if (event.source_group) return event.source_group;
  if (['seasonal', 'tentpole'].includes(getEventCategory(event))) return 'calendar';
  return 'modeled';
}

function getEventStyle(event) {
  return EVENT_STYLES[getEventCategory(event)] || EVENT_STYLES.seasonal;
}

function getEventDateLabel(event) {
  if (event.start_date && event.end_date && event.start_date !== event.end_date) {
    return `${formatWeek(event.start_date)} to ${formatWeek(event.end_date)}`;
  }
  return formatWeek(event.date || event.start_date);
}

function formatWeek(weekStart) {
  const date = new Date(`${weekStart}T00:00:00`);
  if (Number.isNaN(date.getTime())) return weekStart || 'N/A';
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatDate(dateStr) {
  if (!dateStr) return '-';
  const date = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(date.getTime())) return dateStr;
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function addDays(dateStr, days) {
  const date = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(date.getTime())) return dateStr;
  date.setDate(date.getDate() + days);
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

function sumBy(rows, field) {
  return rows.reduce((sum, row) => sum + toNumber(row[field]), 0);
}

function latestWeek(rows) {
  return rows.reduce((max, row) => (!max || row.week_start > max ? row.week_start : max), null);
}

function formatChannelScope(scope) {
  if (!scope || scope === 'all') return 'All channels';
  const tokens = String(scope)
    .split(',')
    .map((token) => token.trim())
    .filter(Boolean);
  if (tokens.length === 0) return 'All channels';
  return tokens.map((token) => getYumChannelLabel(token)).join(', ');
}

function summarizeChannelScope(scope) {
  if (!scope || scope === 'all') return 'All channels';
  const tokens = String(scope)
    .split(',')
    .map((token) => token.trim())
    .filter(Boolean);
  if (tokens.length >= 3) return 'Multi-channel';
  return formatChannelScope(scope);
}

function splitHeadlineItems(value) {
  return String(value || '')
    .split('|')
    .map((token) => token.trim())
    .filter(Boolean);
}

function normalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function getOfferMeta(offerType) {
  return OFFER_THEME_META[offerType] || {
    label: 'Modeled Promotion',
    category: 'value',
    summary: 'Modeled Pizza Hut promotion window.',
  };
}

function getEventThemeLabel(event) {
  if (getEventSourceGroup(event) === 'calendar') return event.type_label || 'Calendar Window';
  return event.type_label || getOfferMeta(event.offer_type).label;
}

function getChannelIdsFromScope(scope) {
  if (!scope || scope === 'all') return [];
  return String(scope)
    .split(',')
    .map((token) => token.trim())
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

function getScopedProductRows(weekStart, marketId, channelScope) {
  const channels = getChannelIdsFromScope(channelScope);
  if (!channels.length) {
    return currentProductRows.filter((row) => row.week_start === weekStart && row.market_id === marketId);
  }

  return channels.flatMap((channelId) => currentProductIndex.get(`${weekStart}|${marketId}|${channelId}`) || []);
}

function matchesHeadlineItem(productName, headlineItems) {
  if (!headlineItems.length) return false;
  const productToken = normalizeText(productName);
  return headlineItems.some((item) => normalizeText(item) === productToken);
}

function matchesOfferFallback(row, promoRow) {
  if (promoRow.offer_type === 'family_bundle') {
    return row.product_role === 'family_meal'
      || isTrueLike(row.shareable_flag)
      || ['bundles', 'pizza', 'sides'].includes(row.product_family);
  }

  if (promoRow.offer_type === 'digital_value') {
    return row.product_role === 'traffic_builder'
      || isTrueLike(row.value_flag)
      || ['handhelds', 'pizza'].includes(row.product_family);
  }

  if (promoRow.offer_type === 'loyalty_offer') {
    return row.product_role === 'traffic_builder'
      || isTrueLike(row.value_flag)
      || /melts|personal pan|my hut box/i.test(String(row.product_name || ''));
  }

  if (promoRow.offer_type === 'premium_ladder') {
    return row.product_role === 'innovation'
      || isTrueLike(row.shareable_flag)
      || row.price_tier === 'premium'
      || /stuffed crust/i.test(String(row.product_name || ''));
  }

  return false;
}

function summarizeAnchorItems(rows, count = 3) {
  const byItem = new Map();

  rows.forEach((row) => {
    const key = row.product_name || 'Unknown item';
    const existing = byItem.get(key) || { name: key, sales: 0, units: 0 };
    existing.sales += toNumber(row.net_sales);
    existing.units += toNumber(row.unit_volume);
    byItem.set(key, existing);
  });

  return [...byItem.values()]
    .sort((left, right) => right.sales - left.sales)
    .slice(0, count)
    .map((entry) => entry.name);
}

function selectPromoSupportRows(promoRow) {
  const scopeRows = getScopedProductRows(promoRow.week_start, promoRow.market_id, promoRow.channel_scope);
  if (!scopeRows.length) return [];

  const headlineItems = splitHeadlineItems(promoRow.headline_items);
  const itemMatches = scopeRows.filter((row) => matchesHeadlineItem(row.product_name, headlineItems));
  if (itemMatches.length) return itemMatches;

  const fallbackMatches = scopeRows.filter((row) => matchesOfferFallback(row, promoRow));
  return fallbackMatches.length ? fallbackMatches : scopeRows;
}

function areContiguousWeeks(leftDate, rightDate) {
  const left = new Date(`${leftDate}T00:00:00`);
  const right = new Date(`${rightDate}T00:00:00`);
  if (Number.isNaN(left.getTime()) || Number.isNaN(right.getTime())) return false;
  const diffDays = Math.round((right - left) / (1000 * 60 * 60 * 24));
  return diffDays <= 7;
}

function enrichPromoRows(rows) {
  return rows.map((row) => {
    const matchedRows = selectPromoSupportRows(row);
    const channelSales = new Map();
    let supportedSales = 0;
    let supportedUnits = 0;
    let priceWeightedSum = 0;
    let priceWeight = 0;
    let marginWeightedSum = 0;
    let marginWeight = 0;

    matchedRows.forEach((match) => {
      const netSales = toNumber(match.net_sales);
      const units = toNumber(match.unit_volume);
      supportedSales += netSales;
      supportedUnits += units;
      priceWeightedSum += toNumber(match.realized_price) * Math.max(units, 1);
      priceWeight += Math.max(units, 1);
      marginWeightedSum += toNumber(match.contribution_margin_pct) * Math.max(netSales, 1);
      marginWeight += Math.max(netSales, 1);
      channelSales.set(match.channel_id, (channelSales.get(match.channel_id) || 0) + netSales);
    });

    const topChannelEntry = [...channelSales.entries()].sort((left, right) => right[1] - left[1])[0] || null;
    const anchorItems = summarizeAnchorItems(matchedRows, 3);
    const offerMeta = getOfferMeta(row.offer_type);

    return {
      ...row,
      promo_units: supportedUnits,
      promo_sales: supportedSales,
      avg_realized_price: priceWeight > 0 ? priceWeightedSum / priceWeight : 0,
      avg_margin_pct: marginWeight > 0 ? (marginWeightedSum / marginWeight) * 100 : 0,
      top_channel: topChannelEntry ? topChannelEntry[0] : '',
      anchor_items: anchorItems.join(' | '),
      type_label: offerMeta.label,
      source_group: 'modeled',
      event_category: offerMeta.category,
    };
  });
}

function buildCalendarMomentEvents(calendarWeekDimRows, fallbackRows, brandId, brandLabel) {
  const sourceRows = (calendarWeekDimRows || []).length
    ? [...calendarWeekDimRows].sort((left, right) => left.week_start.localeCompare(right.week_start))
    : [];

  if (!sourceRows.length) {
    return (fallbackRows || []).reduce((events, row) => {
      const seasonalFlag = isTrueLike(row.is_holiday_proxy) || isTrueLike(row.qsr_peak_flag);
      if (!seasonalFlag) return events;
      const isHoliday = isTrueLike(row.is_holiday_proxy);
      events.push({
        event_id: `calendar_${row.week_start}`,
        week_start: row.week_start,
        start_date: row.week_start,
        end_date: row.week_start,
        date: row.week_start,
        brand_id: brandId,
        offer_type: 'calendar_window',
        offer_name: isHoliday ? 'Holiday Demand Window' : 'Peak Traffic Window',
        title: isHoliday ? 'Holiday Demand Window' : 'Peak Traffic Window',
        channel_scope: 'all',
        channel_focus_text: 'Portfolio calendar',
        avg_discount_pct: 0,
        participating_store_count: 0,
        market_count: 0,
        promo_units: 0,
        promo_sales: 0,
        headline_items: row.season_label || brandLabel,
        notes: isHoliday
          ? `Holiday demand window identified in the modeled ${brandLabel} calendar.`
          : `Peak traffic window identified in the modeled ${brandLabel} calendar (${row.season_label || 'seasonal demand'}).`,
        signal_labels: [row.season_label || 'Seasonality'],
        type_label: isHoliday ? 'Holiday Window' : 'Peak Traffic Window',
        source_group: 'calendar',
        event_category: isHoliday ? 'tentpole' : 'seasonal',
      });
      return events;
    }, []);
  }

  const windows = [];

  sourceRows.forEach((row) => {
    const key = row.portfolio_event_window || `${row.season_label || 'seasonal'}_${isTrueLike(row.holiday_proxy_flag) ? 'holiday' : 'baseline'}`;
    const definition = CALENDAR_WINDOW_DEFINITIONS[key] || {
      title: `${String(row.season_label || 'Seasonal').replace(/\b\w/g, (letter) => letter.toUpperCase())} Demand Window`,
      typeLabel: 'Calendar Window',
      category: isTrueLike(row.holiday_proxy_flag) || isTrueLike(row.sports_peak_flag) ? 'tentpole' : 'seasonal',
      note: `Modeled ${brandLabel} demand window from the Pizza Hut calendar foundation.`,
    };

    const previous = windows[windows.length - 1];
    if (previous && previous.window_key === key && areContiguousWeeks(previous.end_date, row.week_start)) {
      previous.end_date = row.week_start;
      previous.rows.push(row);
      return;
    }

    windows.push({
      window_key: key,
      definition,
      start_date: row.week_start,
      end_date: row.week_start,
      rows: [row],
    });
  });

  return windows.map((window, index) => {
    const rowSignals = new Set();
    window.rows.forEach((row) => {
      if (row.season_label) rowSignals.add(String(row.season_label).replace(/\b\w/g, (letter) => letter.toUpperCase()));
      if (isTrueLike(row.holiday_proxy_flag)) rowSignals.add('Holiday proxy');
      if (isTrueLike(row.sports_peak_flag)) rowSignals.add('Sports peak');
      if (isTrueLike(row.paycheck_week_flag)) rowSignals.add('Paycheck week');
      if (isTrueLike(row.summer_travel_flag)) rowSignals.add('Summer travel');
    });

    return {
      event_id: `calendar_window_${index + 1}`,
      week_start: window.start_date,
      start_date: window.start_date,
      end_date: window.end_date,
      date: window.start_date,
      brand_id: brandId,
      offer_type: 'calendar_window',
      offer_name: window.definition.title,
      title: window.definition.title,
      channel_scope: 'all',
      channel_focus_text: 'Portfolio calendar',
      avg_discount_pct: 0,
      participating_store_count: 0,
      market_count: 0,
      promo_units: 0,
      promo_sales: 0,
      headline_items: [...rowSignals].join(' | '),
      notes: `${window.definition.note} Active for ${window.rows.length} week${window.rows.length === 1 ? '' : 's'} in the modeled Pizza Hut calendar.`,
      signal_labels: [...rowSignals],
      type_label: window.definition.typeLabel,
      source_group: 'calendar',
      event_category: window.definition.category,
    };
  });
}

function aggregatePromoWindows(rows) {
  const grouped = new Map();

  rows.forEach((row) => {
    const key = [row.week_start, row.offer_name, row.offer_type, row.channel_scope].join('|');
    if (!grouped.has(key)) {
      grouped.set(key, {
        event_id: `promo_${grouped.size + 1}`,
        week_start: row.week_start,
        date: row.week_start,
        brand_id: row.brand_id,
        offer_type: row.offer_type,
        offer_name: row.offer_name,
        title: row.offer_name,
        channel_scope: row.channel_scope || 'all',
        type_label: row.type_label || getOfferMeta(row.offer_type).label,
        event_category: getEventCategory(row),
        source_group: 'modeled',
        participating_store_count: 0,
        promo_units: 0,
        promo_sales: 0,
        headlineItems: new Set(),
        notesList: [],
        marketIds: new Set(),
        anchorItems: new Set(),
        channelSales: new Map(),
        discountWeightedSum: 0,
        discountWeight: 0,
        priceWeightedSum: 0,
        priceWeight: 0,
        marginWeightedSum: 0,
        marginWeight: 0,
      });
    }

    const target = grouped.get(key);
    const unitWeight = Math.max(toNumber(row.promo_units), 1);
    const salesWeight = Math.max(toNumber(row.promo_sales), 1);
    target.participating_store_count += toNumber(row.participating_store_count);
    target.promo_units += toNumber(row.promo_units);
    target.promo_sales += toNumber(row.promo_sales);
    target.discountWeightedSum += toNumber(row.avg_discount_pct) * unitWeight;
    target.discountWeight += unitWeight;
    target.priceWeightedSum += toNumber(row.avg_realized_price) * unitWeight;
    target.priceWeight += unitWeight;
    target.marginWeightedSum += toNumber(row.avg_margin_pct) * salesWeight;
    target.marginWeight += salesWeight;
    if (row.market_id) target.marketIds.add(row.market_id);
    splitHeadlineItems(row.headline_items).forEach((item) => target.headlineItems.add(item));
    splitHeadlineItems(row.anchor_items).forEach((item) => target.anchorItems.add(item));
    if (row.notes && !target.notesList.includes(row.notes)) {
      target.notesList.push(row.notes);
    }
    if (row.top_channel) {
      target.channelSales.set(
        row.top_channel,
        (target.channelSales.get(row.top_channel) || 0) + toNumber(row.promo_sales)
      );
    }
  });

  return [...grouped.values()]
    .map((row) => {
      const topChannelEntry = [...row.channelSales.entries()].sort((left, right) => right[1] - left[1])[0] || null;
      return {
        event_id: row.event_id,
        week_start: row.week_start,
        date: row.date,
        brand_id: row.brand_id,
        offer_type: row.offer_type,
        offer_name: row.offer_name,
        title: row.title,
        channel_scope: row.channel_scope,
        type_label: row.type_label,
        source_group: row.source_group,
        event_category: row.event_category,
        avg_discount_pct: row.discountWeight > 0 ? row.discountWeightedSum / row.discountWeight : 0,
        avg_realized_price: row.priceWeight > 0 ? row.priceWeightedSum / row.priceWeight : 0,
        avg_margin_pct: row.marginWeight > 0 ? row.marginWeightedSum / row.marginWeight : 0,
        participating_store_count: row.participating_store_count,
        market_count: row.marketIds.size,
        promo_units: row.promo_units,
        promo_sales: row.promo_sales,
        headline_items: [...row.headlineItems].slice(0, 4).join(' | '),
        anchor_items: [...row.anchorItems].slice(0, 4).join(' | '),
        top_channel: topChannelEntry ? topChannelEntry[0] : '',
        notes: row.notesList[0] || '',
      };
    })
    .sort((left, right) => {
      if (left.week_start === right.week_start) {
        return toNumber(right.promo_sales) - toNumber(left.promo_sales);
      }
      return left.week_start.localeCompare(right.week_start);
    });
}

function filterEvents() {
  return allEvents.filter((event) => {
    const sourceGroup = getEventSourceGroup(event);
    if (sourceGroup === 'calendar') return activeFilters.calendar;

    const category = getEventCategory(event);
    if (category === 'value') return activeFilters.value;
    if (category === 'digital') return activeFilters.digital;
    if (category === 'premium') return activeFilters.premium;
    return true;
  });
}

function updateEventCountBadge() {
  const badge = document.getElementById('event-count-badge');
  if (!badge) return;

  const filtered = filterEvents();
  const counts = {
    value: filtered.filter((event) => getEventCategory(event) === 'value').length,
    digital: filtered.filter((event) => getEventCategory(event) === 'digital').length,
    premium: filtered.filter((event) => getEventCategory(event) === 'premium').length,
    calendar: filtered.filter((event) => getEventSourceGroup(event) === 'calendar').length,
  };

  badge.textContent = `${filtered.length} windows (${counts.value} value, ${counts.digital} digital, ${counts.premium} premium, ${counts.calendar} calendar)`;
}

function calculatePromoDependencyState() {
  const salesByWeek = currentStoreChannelRows.reduce((map, row) => {
    const week = row.week_start;
    map.set(week, (map.get(week) || 0) + toNumber(row.net_sales));
    return map;
  }, new Map());

  const promoSalesByWeek = modeledPromoWindows.reduce((map, row) => {
    const week = row.week_start;
    map.set(week, (map.get(week) || 0) + toNumber(row.promo_sales));
    return map;
  }, new Map());

  const weeks = [...salesByWeek.keys()].sort();
  const latestSalesWeek = weeks[weeks.length - 1] || null;
  const latestPromoWeek = latestWeek(modeledPromoWindows);
  const latestWeekKey = latestPromoWeek || latestSalesWeek;
  const latestSales = latestWeekKey ? (salesByWeek.get(latestWeekKey) || 0) : 0;
  const rawLatestPromoSales = latestWeekKey ? (promoSalesByWeek.get(latestWeekKey) || 0) : 0;
  const latestPromoSales = latestSales > 0 ? Math.min(rawLatestPromoSales, latestSales) : rawLatestPromoSales;
  const dependencyShare = latestSales > 0 ? latestPromoSales / latestSales : 0;

  const weeklyShares = weeks
    .map((week) => {
      const sales = salesByWeek.get(week) || 0;
      if (sales <= 0) return null;
      const promoSales = Math.min(promoSalesByWeek.get(week) || 0, sales);
      return promoSales / sales;
    })
    .filter((value) => Number.isFinite(value));

  const baselineShare = weeklyShares.length
    ? weeklyShares.reduce((sum, value) => sum + value, 0) / weeklyShares.length
    : 0;
  const deltaPctPoints = (dependencyShare - baselineShare) * 100;

  let level = 'low';
  if (dependencyShare >= 0.6) level = 'high';
  else if (dependencyShare >= 0.35) level = 'medium';

  const readiness = level === 'high'
    ? 'NOT SAFE'
    : level === 'medium'
      ? 'CAUTION'
      : 'MORE FLEXIBLE';

  return {
    latestWeekKey,
    dependencyShare,
    baselineShare,
    deltaPctPoints,
    latestSales,
    latestPromoSales,
    level,
    readiness,
  };
}

function renderPromoDependencyBanner(state) {
  const banner = document.getElementById('promo-dependency-banner');
  const kicker = document.getElementById('promo-dependency-kicker');
  const title = document.getElementById('promo-dependency-title');
  const copy = document.getElementById('promo-dependency-copy');
  const note = document.getElementById('promo-dependency-note');
  if (!banner || !kicker || !title || !copy || !note) return;

  banner.classList.remove('is-low', 'is-medium');
  if (state.level === 'medium') banner.classList.add('is-medium');
  if (state.level === 'low') banner.classList.add('is-low');

  const dependencyPct = Math.round(state.dependencyShare * 100);
  const weekLabel = state.latestWeekKey ? formatWeek(state.latestWeekKey) : 'the latest week';

  kicker.textContent = `${state.level === 'high' ? 'HIGH' : state.level === 'medium' ? 'ELEVATED' : 'LOWER'} PROMO DEPENDENCY | Pricing Readiness: ${state.readiness}`;
  title.textContent = state.level === 'high'
    ? 'Broad pricing moves are not safe in the current promotion environment.'
    : state.level === 'medium'
      ? 'Pricing needs a selective test-and-learn approach.'
      : 'Pricing is less promotion-constrained than usual, but still requires selective tests.';
  copy.textContent = state.level === 'high'
    ? `~${dependencyPct}% of weekly sales are aligned to active promotion windows. Avoid broad price increases and test only in low-promo pockets.`
    : state.level === 'medium'
      ? `~${dependencyPct}% of weekly sales are still sitting inside promotion windows. Keep price changes selective and sequence them around lower-pressure weeks.`
      : `~${dependencyPct}% of weekly sales are tied to active promotion windows. Measured pricing tests are possible, but keep the calendar in view.`;
  note.textContent = state.latestWeekKey
    ? `${weekLabel}: ${formatCurrency(state.latestPromoSales)} supported promotion sales against ${formatCurrency(state.latestSales)} total modeled sales.`
    : 'No current promo dependency readout is available.';
}

function renderPromoDecisionBox(state) {
  const title = document.getElementById('promo-decision-title');
  const actions = document.getElementById('promo-decision-actions');
  const risk = document.getElementById('promo-decision-risk');
  if (!title || !actions || !risk) return;

  const actionList = state.level === 'high'
    ? [
        'Hold broad menu pricing until the largest promotion windows clear.',
        'Keep the value ladder intact in delivery, carryout, and pickup-app channels.',
        'Confine any near-term pricing tests to premium items and low-promo pockets.',
        'Review family bundle and traffic-builder windows before changing entry pricing.'
      ]
    : state.level === 'medium'
      ? [
          'Avoid a blanket price move across the menu this week.',
          'Preserve the strongest value and loyalty windows while testing premium ladders selectively.',
          'Start pricing tests in lower-pressure channels first.',
          'Sequence any expansion after promo-supported demand cools further.'
        ]
      : [
          'Use measured pricing tests, not a system-wide reset.',
          'Keep effective support in the most traffic-sensitive value lanes.',
          'Start with premium and innovation ladders before touching entry value.',
          'Watch bundle and digital-value channels for any demand softening.'
        ];

  title.textContent = state.level === 'high'
    ? 'Do not push broad pricing while promotion dependency remains high.'
    : state.level === 'medium'
      ? 'Keep pricing selective until promotion dependency cools further.'
      : 'Use measured pricing tests, while keeping support where value demand still needs it.';

  actions.innerHTML = actionList
    .map((item) => `
      <div class="promo-decision-action">
        <i class="bi bi-bullseye promo-decision-action__icon"></i>
        <div>${item}</div>
      </div>
    `)
    .join('');

  risk.textContent = state.level === 'high'
    ? 'Risk: pulling back value support too early may create an immediate traffic drop.'
    : state.level === 'medium'
      ? 'Risk: moving too quickly can weaken the most promotion-led demand pockets before the calendar resets.'
      : 'Risk: even in lower-pressure weeks, overextending pricing can soften value-led traffic.';
}

function renderCalendarSummary() {
  const themeCounts = modeledPromoWindows.reduce((accumulator, row) => {
    const label = getEventThemeLabel(row);
    accumulator[label] = (accumulator[label] || 0) + 1;
    return accumulator;
  }, {});
  const themeEntries = Object.entries(themeCounts).sort((left, right) => right[1] - left[1]);
  const latestPromoWeek = latestWeek(modeledPromoWindows);
  const latestPromoRows = modeledPromoWindows.filter((row) => row.week_start === latestPromoWeek);
  const weightedDiscountBase = modeledPromoWindows.reduce((sum, row) => sum + Math.max(toNumber(row.promo_units), 1), 0);
  const weightedDiscount =
    weightedDiscountBase > 0
      ? modeledPromoWindows.reduce((sum, row) => sum + toNumber(row.avg_discount_pct) * Math.max(toNumber(row.promo_units), 1), 0) / weightedDiscountBase
      : 0;
  const channelSales = new Map();
  modeledPromoWindows.forEach((row) => {
    const channelIds = getChannelIdsFromScope(row.channel_scope);
    const allocatedSales = toNumber(row.promo_sales) / Math.max(channelIds.length, 1);
    channelIds.forEach((channelId) => {
      channelSales.set(channelId, (channelSales.get(channelId) || 0) + allocatedSales);
    });
  });
  const leadingChannel = [...channelSales.entries()].sort((left, right) => right[1] - left[1])[0] || null;
  const promoDependencyState = calculatePromoDependencyState();
  const dependencyPct = Math.round(promoDependencyState.dependencyShare * 100);
  const dependencyDelta = promoDependencyState.deltaPctPoints;
  const dependencyDirection = dependencyDelta >= 0 ? 'Above baseline' : 'Below baseline';

  const themeSummary = themeEntries.length
    ? `${themeEntries[0][0]} leads with ${themeEntries[0][1]} windows.`
    : 'No modeled themes available.';

  const updates = {
    'promo-summary-official-count': String(themeEntries.length),
    'promo-summary-official-note': themeSummary,
    'promo-summary-modeled-count': String(modeledPromoWindows.length),
    'promo-summary-modeled-note': latestPromoWeek
      ? `${latestPromoRows.length} active windows in the latest promo week (${formatWeek(latestPromoWeek)}).`
      : 'No modeled promotion windows available.',
    'promo-summary-discount': modeledPromoWindows.length ? `${weightedDiscount.toFixed(1)}%` : '--',
    'promo-summary-discount-note': modeledPromoWindows.length
      ? 'Weighted by supported units across modeled promotion windows.'
      : 'No modeled discount coverage available.',
    'promo-summary-channel': leadingChannel ? getYumChannelLabel(leadingChannel[0]) : '--',
    'promo-summary-channel-note': leadingChannel
      ? 'Highest supported promotion sales across the modeled calendar.'
      : 'No modeled channel pressure found.',
    'promo-summary-dependency': promoDependencyState.latestSales > 0 ? `${dependencyPct}%` : '--',
    'promo-summary-dependency-note': promoDependencyState.latestSales > 0
      ? `${dependencyDirection}${dependencyDelta >= 0 ? '' : ` by ${Math.abs(dependencyDelta).toFixed(0)} pts`}.`
      : 'No promo dependency benchmark available.',
  };

  Object.entries(updates).forEach(([id, text]) => {
    const node = document.getElementById(id);
    if (node) node.textContent = text;
  });

  renderPromoDependencyBanner(promoDependencyState);
  renderPromoDecisionBox(promoDependencyState);
}

function renderStrategyReadout() {
  const readout = document.getElementById('promo-strategy-readout');
  const chips = document.getElementById('campaign-pattern-chips');
  const note = document.getElementById('campaign-patterns-readout');
  const sourceBadge = document.getElementById('official-source-badge');
  if (!readout || !chips || !note) return;

  const patternCounts = modeledPromoWindows.reduce((accumulator, row) => {
    const label = getEventThemeLabel(row);
    accumulator[label] = (accumulator[label] || 0) + 1;
    return accumulator;
  }, {});
  const patternEntries = Object.entries(patternCounts).sort((left, right) => right[1] - left[1]);
  const latestModeledWeek = latestWeek(modeledPromoWindows);
  const latestModeledWindows = modeledPromoWindows
    .filter((row) => row.week_start === latestModeledWeek)
    .sort((left, right) => toNumber(right.promo_sales) - toNumber(left.promo_sales));
  const topModeledWindow = latestModeledWindows[0];

  const bullets = [];
  if (patternEntries[0]) {
    bullets.push(`${patternEntries[0][0]} is the most frequent Pizza Hut promotion theme in the modeled calendar, appearing in ${patternEntries[0][1]} windows.`);
  }
  if (topModeledWindow) {
    bullets.push(
      `${topModeledWindow.offer_name} is the strongest latest-week window, supporting ${formatCurrency(toNumber(topModeledWindow.promo_sales))} of sales across ${topModeledWindow.market_count} markets at ${toNumber(topModeledWindow.avg_discount_pct).toFixed(1)}% average discount.`
    );
  }
  if (topModeledWindow?.anchor_items) {
    bullets.push(`Anchor items in the strongest current window are ${topModeledWindow.anchor_items.replace(/\|/g, ', ')}.`);
  }
  if (!bullets.length) {
    bullets.push(`No modeled strategy readout is available yet for ${currentBrandLabel}.`);
  }

  readout.innerHTML = bullets.map((item) => `<li>${item}</li>`).join('');

  const chipMarkup = patternEntries
    .map(
      ([label, count]) =>
        `<span class="badge rounded-pill bg-primary-subtle text-primary border-0">${label} <span class="ms-1 text-body-secondary">${count}</span></span>`
    )
    .join('');
  chips.innerHTML = chipMarkup || '<span class="badge rounded-pill bg-secondary-subtle text-body-secondary">No campaign themes loaded</span>';

  const topTwoLabels = patternEntries.slice(0, 2).map(([label]) => label);
  note.innerHTML = topModeledWindow
    ? `${currentBrandLabel} relies most on <strong>${topTwoLabels.join('</strong> and <strong>') || 'modeled promotion windows'}</strong>, with the latest pressure concentrated in <strong>${summarizeChannelScope(topModeledWindow.channel_scope)}</strong> around <strong>${topModeledWindow.offer_name}</strong>.`
    : `The modeled ${currentBrandLabel} calendar is loaded, but a dominant current window is not available.`;

  if (sourceBadge) {
    sourceBadge.textContent = `${modeledPromoWindows.length} modeled windows`;
  }
}

function renderMarketSignalsDashboard() {
  const left = document.getElementById('market-signals-competitive');
  const right = document.getElementById('market-signals-social');
  if (!left || !right) return;

  const anchorWeek = latestWeek(modeledPromoWindows) || latestWeek(currentStoreChannelRows);
  const latestChannelRows = currentStoreChannelRows.filter((row) => row.week_start === anchorWeek);
  const latestPromoWeek = latestWeek(modeledPromoWindows);
  const topPromo = modeledPromoWindows
    .filter((row) => row.week_start === latestPromoWeek)
    .sort((leftRow, rightRow) => toNumber(rightRow.promo_sales) - toNumber(leftRow.promo_sales))[0];
  const byChannel = [...latestChannelRows.reduce((map, row) => {
    const key = row.channel;
    const existing = map.get(key) || {
      channel: key,
      channelName: row.channel_name || getYumChannelLabel(key),
      sales: 0,
      orders: 0,
      avgCheckWeighted: 0,
      avgCheckWeight: 0,
    };
    existing.sales += toNumber(row.net_sales);
    existing.orders += toNumber(row.transaction_count_proxy);
    existing.avgCheckWeighted += toNumber(row.avg_check_proxy || row.avg_check) * Math.max(toNumber(row.transaction_count_proxy), 1);
    existing.avgCheckWeight += Math.max(toNumber(row.transaction_count_proxy), 1);
    map.set(key, existing);
    return map;
  }, new Map()).values()]
    .map((row) => ({
      ...row,
      avgCheck: row.avgCheckWeight > 0 ? row.avgCheckWeighted / row.avgCheckWeight : 0,
    }))
    .filter((row) => row.sales > 0)
    .sort((leftRow, rightRow) => rightRow.sales - leftRow.sales);
  const totalSales = byChannel.reduce((sum, row) => sum + row.sales, 0);

  left.innerHTML = byChannel.length
    ? `
      <ul class="mb-1">
        ${byChannel
          .slice(0, 3)
          .map(
            (row) =>
              `<li><strong>${row.channelName}</strong>: ${((row.sales / Math.max(totalSales, 1)) * 100).toFixed(1)}% sales mix, ${formatCurrency(row.avgCheck)} avg check, ${formatNumber(row.orders)} orders.</li>`
          )
          .join('')}
      </ul>
      <p class="mb-0 text-muted">
        <strong>Data anchor:</strong> Latest ${currentBrandLabel} channel mix in the operating panel for ${anchorWeek ? formatWeek(anchorWeek) : 'the current period'}.
      </p>
    `
    : `<p class="mb-0 text-muted">No modeled channel rows are available for ${currentBrandLabel}.</p>`;

  right.innerHTML = topPromo
    ? `
      <ul class="mb-1">
        <li><strong>Top current window:</strong> ${topPromo.offer_name}.</li>
        <li><strong>Supported sales:</strong> ${formatCurrency(toNumber(topPromo.promo_sales))} across ${formatNumber(toNumber(topPromo.promo_units))} units.</li>
        <li><strong>Average discount:</strong> ${toNumber(topPromo.avg_discount_pct).toFixed(1)}% with ${formatCurrency(toNumber(topPromo.avg_realized_price))} realized price.</li>
        <li><strong>Anchor items:</strong> ${topPromo.anchor_items || topPromo.headline_items || 'N/A'}.</li>
      </ul>
      <p class="mb-0 text-muted">
        <strong>Planner cue:</strong> Price changes should be read against ${topPromo.offer_name} and its supported menu mix, not in isolation.
      </p>
    `
    : `<p class="mb-0 text-muted">No modeled offer windows are available for ${currentBrandLabel}.</p>`;
}

function getEventScopeLabel(event) {
  if (getEventSourceGroup(event) === 'calendar') return event.type_label || 'Portfolio calendar';
  return formatChannelScope(event.channel_scope);
}

function getEventOutputLabel(event) {
  if (getEventSourceGroup(event) === 'calendar') {
    return event.signal_labels && event.signal_labels.length ? event.signal_labels.slice(0, 2).join(' + ') : 'Calendar demand signal';
  }
  return `${formatCurrency(toNumber(event.promo_sales))} sales | ${formatNumber(toNumber(event.promo_units))} units`;
}

function getEventNoteSummary(event) {
  if (getEventSourceGroup(event) === 'calendar') return event.notes || 'Calendar demand signal.';
  const anchorNote = event.anchor_items ? `${event.anchor_items.replace(/\|/g, ', ')} anchor the window.` : '';
  return [anchorNote, event.notes || 'Modeled promotion window.'].filter(Boolean).join(' ');
}

function renderEventTimeline() {
  const container = document.getElementById('event-timeline');
  if (!container) return;

  const filteredEvents = filterEvents().sort((left, right) => new Date(left.date) - new Date(right.date));
  if (!filteredEvents.length) {
    container.innerHTML = `<div class="text-center text-muted">No ${currentBrandLabel} promotion windows match the current filters.</div>`;
    return;
  }

  const eventDates = filteredEvents.map((event) => new Date(event.date));
  const startDate = new Date(Math.min(...eventDates));
  const endDate = new Date(Math.max(...eventDates));
  const totalDays = Math.max(1, Math.floor((endDate - startDate) / (1000 * 60 * 60 * 24)));

  let html = `
    <div class="d-flex justify-content-center gap-4 mb-3 flex-wrap">
      <div class="d-flex align-items-center"><div style="width: 16px; height: 16px; border-radius: 50%; background: var(--dplus-orange); box-shadow: 0 0 0 4px rgba(245, 158, 11, 0.2);"></div><span class="ms-2 small">Value & Bundle</span></div>
      <div class="d-flex align-items-center"><div style="width: 16px; height: 16px; border-radius: 50%; background: var(--dplus-blue); box-shadow: 0 0 0 4px rgba(0, 102, 255, 0.2);"></div><span class="ms-2 small">Digital & Loyalty</span></div>
      <div class="d-flex align-items-center"><div style="width: 16px; height: 16px; border-radius: 50%; background: #ef4444; box-shadow: 0 0 0 4px rgba(239, 68, 68, 0.16);"></div><span class="ms-2 small">Premium & Innovation</span></div>
      <div class="d-flex align-items-center"><div style="width: 16px; height: 16px; border-radius: 50%; background: #f59e0b; box-shadow: 0 0 0 4px rgba(245, 158, 11, 0.16);"></div><span class="ms-2 small">Tentpoles</span></div>
      <div class="d-flex align-items-center"><div style="width: 16px; height: 16px; border-radius: 50%; background: #16a34a; box-shadow: 0 0 0 4px rgba(34, 197, 94, 0.16);"></div><span class="ms-2 small">Seasonal Windows</span></div>
    </div>
    <p class="text-center text-muted small mb-3"><i class="bi bi-info-circle me-1"></i>Click a marker to inspect modeled Pizza Hut promotion windows and calendar context.</p>
    <div class="timeline-slider-container">
      <div class="timeline-track">
  `;

  filteredEvents.forEach((event) => {
    const eventDate = new Date(event.date);
    const daysSinceStart = Math.floor((eventDate - startDate) / (1000 * 60 * 60 * 24));
    const leftPct = (daysSinceStart / totalDays) * 100;
    const style = getEventStyle(event);

    html += `
      <div class="timeline-event ${style.className}" style="left: ${leftPct}%;" data-event-id="${event.event_id}" title="${event.title} | ${getEventDateLabel(event)}"></div>
    `;
  });

  html += `
      </div>
      <div class="timeline-details mt-4" id="timeline-details" style="display: none;"></div>
    </div>
  `;

  container.innerHTML = html;
  container.querySelectorAll('.timeline-event').forEach((marker) => {
    marker.addEventListener('click', () => {
      const event = filteredEvents.find((row) => row.event_id === marker.dataset.eventId);
      if (event) showEventDetails(event);
    });
  });
}

function showEventDetails(event) {
  const panel = document.getElementById('timeline-details');
  if (!panel) return;

  const style = getEventStyle(event);
  const sourceGroup = getEventSourceGroup(event);
  const headlineItems = splitHeadlineItems(event.headline_items);

  let bodyMarkup = '';
  if (sourceGroup === 'calendar') {
    bodyMarkup = `
      <div class="row g-3 small mb-3">
        <div class="col-md-4"><strong>Window type:</strong> ${event.type_label || 'Calendar window'}</div>
        <div class="col-md-4"><strong>Coverage:</strong> Portfolio demand window</div>
        <div class="col-md-4"><strong>Signals:</strong> ${headlineItems.length ? headlineItems.slice(0, 3).join(', ') : 'Seasonality'}</div>
      </div>
      <div class="small mb-3">${event.notes || 'Calendar window details are not available.'}</div>
      <div class="small"><strong>Why it matters:</strong> Use this window as timing context for pricing tests, not as a standalone promotion event.</div>
    `;
  } else {
    bodyMarkup = `
      <div class="row g-3 small mb-3">
        <div class="col-md-4"><strong>Theme:</strong> ${getEventThemeLabel(event)}</div>
        <div class="col-md-4"><strong>Channel scope:</strong> ${formatChannelScope(event.channel_scope)}</div>
        <div class="col-md-4"><strong>Markets:</strong> ${event.market_count ? `${event.market_count} markets` : 'System event'}</div>
        <div class="col-md-4"><strong>Supported sales:</strong> ${formatCurrency(toNumber(event.promo_sales))}</div>
        <div class="col-md-4"><strong>Supported units:</strong> ${formatNumber(toNumber(event.promo_units))}</div>
        <div class="col-md-4"><strong>Avg discount:</strong> ${toNumber(event.avg_discount_pct).toFixed(1)}%</div>
        <div class="col-md-4"><strong>Realized price:</strong> ${formatCurrency(toNumber(event.avg_realized_price))}</div>
        <div class="col-md-4"><strong>Margin rate:</strong> ${toNumber(event.avg_margin_pct).toFixed(1)}%</div>
        <div class="col-md-4"><strong>Lead channel:</strong> ${event.top_channel ? getYumChannelLabel(event.top_channel) : 'Mixed'}</div>
      </div>
      <div class="small mb-2">${event.notes || 'Modeled offer pressure surfaced from the Pizza Hut promotion calendar.'}</div>
      <div class="small mb-2"><strong>Headline items:</strong> ${headlineItems.length ? headlineItems.join(', ') : 'N/A'}</div>
      <div class="small"><strong>Anchor items in the output panel:</strong> ${event.anchor_items ? event.anchor_items.replace(/\|/g, ', ') : 'N/A'}</div>
    `;
  }

  panel.innerHTML = `
    <div class="glass-card p-4">
      <div class="d-flex justify-content-between align-items-start mb-3 gap-3">
        <div>
          <h6 class="mb-2"><span class="badge ${style.badgeClass} me-2">${style.badgeText}</span>${event.title}</h6>
          <div class="text-muted small"><i class="bi bi-calendar-event me-2"></i>${event.display_date_label || getEventDateLabel(event)}</div>
        </div>
        <button type="button" class="btn-close" onclick="document.getElementById('timeline-details').style.display='none'"></button>
      </div>
      ${bodyMarkup}
    </div>
  `;
  panel.style.display = 'block';
}

function renderEventTable() {
  const tbody = document.getElementById('event-table-body');
  if (!tbody) return;

  const filteredEvents = filterEvents().sort((left, right) => new Date(right.date) - new Date(left.date));
  if (!filteredEvents.length) {
    tbody.innerHTML = `<tr><td colspan="6" class="text-center text-muted">No ${currentBrandLabel} promotion windows match the current filters.</td></tr>`;
    return;
  }

  tbody.innerHTML = filteredEvents
    .map((event) => {
      const style = getEventStyle(event);
      return `
        <tr>
          <td class="text-nowrap">${event.display_date_label || getEventDateLabel(event)}</td>
          <td><span class="badge ${style.badgeClass}">${getEventThemeLabel(event)}</span></td>
          <td>${event.title}</td>
          <td>${getEventScopeLabel(event)}</td>
          <td>${getEventOutputLabel(event)}</td>
          <td class="small">${getEventNoteSummary(event)}</td>
        </tr>
      `;
    })
    .join('');
}

function renderPromoCards() {
  const container = document.getElementById('promo-cards-container');
  if (!container) return;

  const latestPromoWeek = latestWeek(modeledPromoWindows);
  const latestPromos = modeledPromoWindows
    .filter((row) => row.week_start === latestPromoWeek)
    .sort((left, right) => toNumber(right.promo_sales) - toNumber(left.promo_sales))
    .slice(0, 6);

  if (!latestPromos.length) {
    container.innerHTML = `<div class="col-12 text-center text-muted">No ${currentBrandLabel} modeled promotion windows are available.</div>`;
    return;
  }

  container.innerHTML = latestPromos
    .map(
      (promo) => `
        <div class="col-lg-4 col-md-6">
          <div class="modeled-promo-card h-100">
            <div class="modeled-promo-card__header">
              <div class="d-flex justify-content-between align-items-start gap-2">
                <div>
                  <div class="fw-semibold">${promo.offer_name}</div>
                  <div class="small text-muted">${formatWeek(promo.week_start)}</div>
                </div>
                <span class="badge bg-primary text-white">${getEventThemeLabel(promo)}</span>
              </div>
            </div>
            <div class="modeled-promo-card__body">
              <div class="row g-2 small mb-2">
                <div class="col-6"><strong>Channels:</strong> ${summarizeChannelScope(promo.channel_scope)}</div>
                <div class="col-6"><strong>Markets:</strong> ${promo.market_count}</div>
                <div class="col-6"><strong>Window sales:</strong> ${formatCurrency(toNumber(promo.promo_sales))}</div>
                <div class="col-6"><strong>Window units:</strong> ${formatNumber(toNumber(promo.promo_units))}</div>
                <div class="col-6"><strong>Avg discount:</strong> ${toNumber(promo.avg_discount_pct).toFixed(1)}%</div>
                <div class="col-6"><strong>Realized price:</strong> ${formatCurrency(toNumber(promo.avg_realized_price))}</div>
              </div>
              <div class="small mb-2"><strong>Anchor items:</strong> ${promo.anchor_items || promo.headline_items || 'N/A'}</div>
              <div class="small text-muted">${promo.notes || 'Modeled promotion window surfaced from the Pizza Hut promo calendar.'}</div>
            </div>
          </div>
        </div>
      `
    )
    .join('');
}

function setupEventFilters() {
  if (filtersBound) return;

  const filterAll = document.getElementById('filter-all');
  const filterValue = document.getElementById('filter-value');
  const filterDigital = document.getElementById('filter-digital');
  const filterPremium = document.getElementById('filter-premium');
  const filterCalendar = document.getElementById('filter-calendar');

  const rerender = () => {
    if (filterAll) {
      filterAll.checked = activeFilters.value && activeFilters.digital && activeFilters.premium && activeFilters.calendar;
    }
    updateEventCountBadge();
    renderEventTimeline();
    renderEventTable();
  };

  if (filterAll) {
    filterAll.addEventListener('change', (event) => {
      const checked = event.target.checked;
      activeFilters.value = checked;
      activeFilters.digital = checked;
      activeFilters.premium = checked;
      activeFilters.calendar = checked;
      if (filterValue) filterValue.checked = checked;
      if (filterDigital) filterDigital.checked = checked;
      if (filterPremium) filterPremium.checked = checked;
      if (filterCalendar) filterCalendar.checked = checked;
      rerender();
    });
  }

  if (filterValue) {
    filterValue.addEventListener('change', (event) => {
      activeFilters.value = event.target.checked;
      rerender();
    });
  }

  if (filterDigital) {
    filterDigital.addEventListener('change', (event) => {
      activeFilters.digital = event.target.checked;
      rerender();
    });
  }

  if (filterPremium) {
    filterPremium.addEventListener('change', (event) => {
      activeFilters.premium = event.target.checked;
      rerender();
    });
  }

  if (filterCalendar) {
    filterCalendar.addEventListener('change', (event) => {
      activeFilters.calendar = event.target.checked;
      rerender();
    });
  }

  filtersBound = true;
}

function relabelStaticUI() {
  const sectionTitle = document.querySelector('#event-calendar-section .card-header h2');
  if (sectionTitle) {
    sectionTitle.innerHTML = `<i class="bi bi-calendar-event me-2"></i>${currentBrandLabel} Promotion Calendar`;
  }

  const labels = {
    'label[for="filter-all"]': '<i class="bi bi-check-all me-1"></i>All Windows',
    'label[for="filter-value"]': '<i class="bi bi-box-seam me-1"></i>Value & Bundle',
    'label[for="filter-digital"]': '<i class="bi bi-phone me-1"></i>Digital & Loyalty',
    'label[for="filter-premium"]': '<i class="bi bi-stars me-1"></i>Premium & Innovation',
    'label[for="filter-calendar"]': '<i class="bi bi-calendar-week me-1"></i>Seasonal & Tentpole',
  };

  Object.entries(labels).forEach(([selector, html]) => {
    const node = document.querySelector(selector);
    if (node) node.innerHTML = html;
  });

  const tableHead = document.querySelectorAll('#event-table thead th');
  if (tableHead.length >= 6) {
    tableHead[0].textContent = 'Date';
    tableHead[1].textContent = 'Window Type';
    tableHead[2].textContent = 'Campaign / Window';
    tableHead[3].textContent = 'Scope';
    tableHead[4].textContent = 'Output';
    tableHead[5].textContent = 'Notes';
  }
}

function refreshEventCalendar() {
  const brandId = getActiveBrandId();
  currentBrandLabel = getActiveBrandLabel();
  currentPromoRows = promoRows.filter((row) => row.brand_id === brandId);
  currentStoreChannelRows = storeChannelRows.filter((row) => row.brand_id === brandId);
  currentProductRows = productPanelRows.filter((row) => row.brand_id === brandId);
  currentProductIndex = buildProductIndex(currentProductRows);
  modeledPromoWindows = aggregatePromoWindows(enrichPromoRows(currentPromoRows));
  allEvents = [
    ...modeledPromoWindows,
    ...buildCalendarMomentEvents(calendarWeekRows, calendarRows, brandId, currentBrandLabel),
  ];

  relabelStaticUI();
  renderCalendarSummary();
  renderStrategyReadout();
  renderMarketSignalsDashboard();
  updateEventCountBadge();
  renderEventTimeline();
  renderEventTable();
  renderPromoCards();
}

function setupBrandListener() {
  if (brandListenerBound) return;
  window.addEventListener('yum-brand-change', () => {
    refreshEventCalendar();
  });
  brandListenerBound = true;
}

export async function initializeEventCalendar() {
  try {
    const [promoCalendar, storeChannelPanel, productPanel, loadedCalendarRows, loadedCalendarWeekRows] = await Promise.all([
      loadYumPromoCalendar(),
      loadYumStoreChannelWeekPanel(),
      loadYumBrandMarketProductChannelWeekPanel(),
      loadYumCalendarDim(),
      loadYumCalendarWeekDim(),
    ]);

    promoRows = promoCalendar;
    storeChannelRows = storeChannelPanel;
    productPanelRows = productPanel;
    calendarRows = loadedCalendarRows;
    calendarWeekRows = loadedCalendarWeekRows;

    setupEventFilters();
    setupBrandListener();
    refreshEventCalendar();
  } catch (error) {
    console.error('Error initializing Pizza Hut event calendar:', error);
    const container = document.getElementById('event-timeline');
    if (container) {
      container.innerHTML = `
        <div class="alert alert-danger">
          <i class="bi bi-exclamation-triangle me-2"></i>
          Error loading Pizza Hut promo calendar data: ${error.message}
        </div>
      `;
    }
  }
}
