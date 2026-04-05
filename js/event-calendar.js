/**
 * Yum Promotion Performance & Calendar
 * Blends official brand campaign references with the modeled Yum promo calendar.
 */

import {
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

const OFFICIAL_CAMPAIGNS = {
  tacobell: [
    {
      id: 'tb-decades-menu',
      dateLabel: 'Oct 24, 2024',
      title: 'Decades Menu',
      typeLabel: 'Nostalgia / Value LTO',
      objective: 'Use low-entry price points and nostalgia to drive trial, traffic, and app engagement.',
      channelFocus: 'Nationwide menu + Taco Bell app',
      proofPoints: [
        'Brought back five fan-favorite items from the 1960s through the 2000s.',
        'Priced each item under $3 and paired the launch with weekly Tuesday Drops merch in the app.',
      ],
      takeaway: 'Taco Bell uses nostalgia and low-ticket entry points as a traffic lever, then layers digital exclusives on top.',
      sourceLabel: 'Taco Bell Newsroom',
      sourceUrl: 'https://www.tacobell.com/newsroom/taco-bell-brings-back-nostalgic-fan-favorites-in-nationwide-decades-menu',
    },
    {
      id: 'tb-big-game-fans',
      dateLabel: 'Feb 9, 2025',
      title: 'The Fans: 2025 Big Game Activation',
      typeLabel: 'Fan Activation / Live Event',
      objective: 'Turn live drive-thru participation into a tentpole brand campaign instead of a straight discount push.',
      channelFocus: 'Drive-Thru + social',
      proofPoints: [
        'Featured nearly 400 real Taco Bell fans in the 2025 Big Game ad.',
        'The Live Mas Drive-Thru Cams campaign drew nearly 3,000 fans who submitted clips for a chance to appear.',
      ],
      takeaway: 'Taco Bell makes routine channels feel participatory and culture-led, which matters when price is not the only growth lever.',
      sourceLabel: 'Taco Bell Newsroom',
      sourceUrl: 'https://www.tacobell.com/newsroom/the-fans-taco-bells-2025-big-game-ad',
    },
    {
      id: 'tb-fan-style-menu',
      dateLabel: 'Nov 18, 2025',
      title: 'Fan Style Menu',
      typeLabel: 'Customization / Digital Merchandising',
      objective: 'Convert fan-created custom orders into a scalable digital-discovery surface across ordering channels.',
      channelFocus: 'App, web, and kiosk ordering',
      proofPoints: [
        'Rolled out fan-created items such as The Bell Burger and The Doritos Dippy nationwide.',
        'The menu was selected from more than 40,000 fan submissions.',
      ],
      takeaway: 'The brand is using fan-built configurations and digital merchandising to stimulate demand without defaulting to broad discounting.',
      sourceLabel: 'Taco Bell Newsroom',
      sourceUrl: 'https://www.tacobell.com/newsroom/taco-bell-launches-the-fan-style-menu',
    },
  ],
  pizzahut: [
    {
      id: 'ph-familee',
      dateLabel: 'Apr 16, 2024',
      title: 'FamiLEE Community Pizza',
      typeLabel: 'Creator Partnership / Community',
      objective: 'Pair a value platform with creator credibility and community giving to widen reach.',
      channelFocus: '$12ANY value platform + social',
      proofPoints: [
        "Built with Keith Lee as part of Pizza Hut's $12ANY campaign.",
        'Included a $50,000 donation to two underserved public schools tied to the launch.',
      ],
      takeaway: 'Pizza Hut uses creator-led campaigns to make value messaging feel social and community-rooted instead of purely transactional.',
      sourceLabel: 'Pizza Hut Blog',
      sourceUrl: 'https://blog.pizzahut.com/pizza-hut-joins-forces-with-viral-food-critic-keith-lee-to-introduce-the-familee-community-pizza/',
    },
    {
      id: 'ph-peter-zahut',
      dateLabel: 'Mar 26, 2025',
      title: "Peter Zahut + Cheesy Bites + Ranch Lover's Flight",
      typeLabel: 'Sports / Occasion Marketing',
      objective: 'Tie product news to March Madness occasions and delivery-led enjoyment moments.',
      channelFocus: 'Delivery, carryout, and dine-in',
      proofPoints: [
        'The campaign launched nationwide on March 26 and debuted during the NCAA Sweet 16 on March 27.',
        "Combined entertainment creative with Cheesy Bites Pizza and the new Ranch Lover's Flight.",
      ],
      takeaway: 'Pizza Hut connects food innovation to watch-party occasions, making event demand a core part of the campaign plan.',
      sourceLabel: 'Pizza Hut Blog',
      sourceUrl: 'https://blog.pizzahut.com/pizza-hut-launches-new-tv-spot-and-brand-campaign-featuring-peter-zahut-the-ultimate-delivery-guy-who-brings-the-good-times-alongside-cheesy-bites-pizza-new-ranch-lovers-flight/',
    },
    {
      id: 'ph-book-it-app',
      dateLabel: 'May 27, 2025',
      title: 'BOOK IT! App / Summer of Stories',
      typeLabel: 'Digital Loyalty / Family Retention',
      objective: 'Move an established family program into a digital experience that drives repeat reward behavior.',
      channelFocus: 'Mobile app + family rewards',
      proofPoints: [
        "Marked the first BOOK IT! app launch in the program's 40-year history.",
        'Let families track reading goals and earn a free Personal Pan Pizza each month in June, July, and August.',
      ],
      takeaway: 'Pizza Hut treats loyalty and community programming as demand engines, not just awareness campaigns.',
      sourceLabel: 'Pizza Hut Blog',
      sourceUrl: 'https://blog.pizzahut.com/pizza-hut-debuts-first-ever-book-it-app/',
    },
  ],
  kfc: [
    {
      id: 'kfc-rewards-launch',
      dateLabel: 'Feb 7, 2024',
      title: 'KFC Rewards Launch',
      typeLabel: 'Digital Loyalty',
      objective: 'Drive account creation and digital ordering by putting free food and challenges behind a rewards wall.',
      channelFocus: 'KFC app + KFC.com',
      proofPoints: [
        'Launched KFC Rewards with 10 points per eligible dollar spent on digital orders.',
        "The opening hook was a BOGO Smash'd Potato Bowl offer for Rewards members.",
      ],
      takeaway: 'KFC is using digital loyalty to create repeat visits and targeted offers before leaning on broad discounting.',
      sourceLabel: 'KFC Press Release',
      sourceUrl: 'https://global.kfc.com/press-releases/unlock-free-fried-chicken-with-new-kfc-rewards-program-order-on-kfccom-and-the-kfc-app-to-start-earning-points',
    },
    {
      id: 'kfc-original-recipe-tenders',
      dateLabel: 'Oct 14, 2024',
      title: 'Original Recipe Tenders + Comeback Sauce',
      typeLabel: 'Innovation / Value Box',
      objective: 'Use product renovation and an accessible entry price to win back share in a crowded tenders market.',
      channelFocus: 'Nationwide menu + trial offer',
      proofPoints: [
        'Introduced new Original Recipe Tenders and a zesty Comeback Sauce nationwide.',
        'Anchored the launch with a $5 Original Recipe Tenders Box.',
      ],
      takeaway: 'KFC still uses price as an invitation, but the campaign lead is product news and trial creation.',
      sourceLabel: 'KFC Press Release',
      sourceUrl: 'https://global.kfc.com/press-releases/kfc-issues-battle-cry-to-tenders-rivals-introducing-new-original-recipe-r-tenders-and-zesty-comeback-sauce-from-the-original-fried-chicken-brand',
    },
    {
      id: 'kfc-fill-ups-f1',
      dateLabel: 'Jun 5, 2025',
      title: 'Fill Ups x F1 The Movie',
      typeLabel: 'Entertainment Partnership / Value',
      objective: 'Push a summer value box while using entertainment media to increase campaign energy.',
      channelFocus: 'Drive-Thru + app + nationwide value boxes',
      proofPoints: [
        'Brought back Fill Ups nationwide with four $7 combo configurations.',
        'Positioned KFC as the exclusive quick service restaurant partner for F1 The Movie.',
      ],
      takeaway: 'KFC mixes accessible value architecture with entertainment partnerships to make a deal feel bigger than a deal.',
      sourceLabel: 'KFC Press Release',
      sourceUrl: 'https://global.kfc.com/press-releases/race-into-flavor-kfc-s-iconic-fill-ups-return-alongside-finger-lickin-good-collab-with-f1-r-the-movie',
    },
  ],
  habitburger: [
    {
      id: 'habit-meal-deals',
      dateLabel: 'Jun 11, 2025',
      dateIso: '2025-06-11',
      title: '$6 / $8 / $10 Meal Deals',
      typeLabel: 'Value Platform',
      objective: 'Use clear entry price ladders to widen trial and make premium burger occasions more accessible.',
      channelFocus: 'Menu value ladder',
      proofPoints: [
        'Habit promoted three stepped meal-deal price points from its official news page.',
        'The campaign framed value through bundled meals rather than simple item markdowns.',
      ],
      takeaway: 'Habit uses straightforward laddered value architecture to protect premium brand cues while opening the top of funnel.',
      sourceLabel: 'Habit Burger News',
      sourceUrl: 'https://www.habitburger.com/news/',
    },
    {
      id: 'habit-space-burger',
      dateLabel: 'Sep 18, 2025',
      dateIso: '2025-09-18',
      title: 'Double Char Promotion',
      typeLabel: 'Brand Promotion / Sweepstakes',
      objective: 'Turn a signature burger win into a participation mechanic that drives engagement beyond straight discounting.',
      channelFocus: 'Digital sweepstakes + owned channels',
      proofPoints: [
        "Habit's official page promoted a Double Char sweepstakes tied to the brand's menu hero.",
        'The activation used an owned-channel promotion instead of broad price-led messaging.',
      ],
      takeaway: 'Habit can use owned-channel promotions around its signature burger without collapsing into blanket deal language.',
      sourceLabel: 'Habit Burger Promotions',
      sourceUrl: 'https://www.habitburger.com/the-habit-burger-grill-double-char-promotion/',
    },
    {
      id: 'habit-desert-drip-char',
      dateLabel: 'Apr 29, 2025',
      dateIso: '2025-04-29',
      title: 'Desert Drip Char',
      typeLabel: 'Menu Innovation / Festival Tie-In',
      objective: 'Connect menu novelty to a limited-time cultural moment with a distinctive product story.',
      channelFocus: 'LTO + event adjacency',
      proofPoints: [
        "Habit's official news page features the Desert Drip Char as a seasonal launch.",
        'The campaign positions menu innovation as the hook, not a broad promotional discount.',
      ],
      takeaway: 'Habit can support pricing by rotating in event-adjacent food innovation rather than leaning purely on offers.',
      sourceLabel: 'Habit Burger News',
      sourceUrl: 'https://www.habitburger.com/news/',
    },
  ],
};

const EVENT_STYLES = {
  official: {
    className: 'event-official',
    badgeClass: 'bg-danger',
    badgeText: 'Official Campaign',
  },
  value_box: {
    className: 'event-content',
    badgeClass: 'bg-warning text-dark',
    badgeText: 'Value / Box',
  },
  digital: {
    className: 'event-promo',
    badgeClass: 'bg-primary',
    badgeText: 'Digital',
  },
  delivery: {
    className: 'event-promo',
    badgeClass: 'bg-info text-dark',
    badgeText: 'Delivery',
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
let calendarRows = [];
let calendarWeekRows = [];
let currentPromoRows = [];
let currentStoreChannelRows = [];
let currentBrandLabel = 'Yum';
let brandListenerBound = false;
let filtersBound = false;

let activeFilters = {
  official: true,
  modeled: true,
  calendar: true,
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

function getOfficialCampaigns(brandId = getActiveBrandId()) {
  return [...(OFFICIAL_CAMPAIGNS[brandId] || [])].sort((left, right) => {
    const leftDate = normalizeTimelineDate(left.dateIso || left.dateLabel) || '9999-12-31';
    const rightDate = normalizeTimelineDate(right.dateIso || right.dateLabel) || '9999-12-31';
    return leftDate.localeCompare(rightDate);
  });
}

function normalizeTimelineDate(value, fallbackYear = 2025) {
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;

  const candidate = /\b\d{4}\b/.test(String(value)) ? String(value) : `${String(value)}, ${fallbackYear}`;
  const parsed = new Date(candidate);
  if (Number.isNaN(parsed.getTime())) return null;
  return [
    parsed.getFullYear(),
    String(parsed.getMonth() + 1).padStart(2, '0'),
    String(parsed.getDate()).padStart(2, '0'),
  ].join('-');
}

function getEventCategory(event) {
  if (event.event_category) return event.event_category;
  if (event.offer_type === 'combo_box_offer' || event.offer_type === 'value_menu_offer' || event.offer_type === 'bundle_support') {
    return 'value_box';
  }
  if (event.offer_type === 'digital_offer' || event.offer_type === 'loyalty_offer') return 'digital';
  if (event.offer_type === 'delivery_support') return 'delivery';
  return 'seasonal';
}

function getEventSourceGroup(event) {
  if (event.source_group) return event.source_group;
  if (getEventCategory(event) === 'official') return 'official';
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

function areContiguousWeeks(leftDate, rightDate) {
  const left = new Date(`${leftDate}T00:00:00`);
  const right = new Date(`${rightDate}T00:00:00`);
  if (Number.isNaN(left.getTime()) || Number.isNaN(right.getTime())) return false;
  const diffDays = Math.round((right - left) / (1000 * 60 * 60 * 24));
  return diffDays <= 7;
}

function buildOfficialCampaignTimelineEvents(brandId) {
  return getOfficialCampaigns(brandId)
    .map((campaign, index) => {
      const date = normalizeTimelineDate(campaign.dateIso || campaign.dateLabel);
      if (!date) return null;
      return {
        event_id: `official_${campaign.id || index + 1}`,
        week_start: date,
        start_date: date,
        end_date: date,
        date,
        brand_id: brandId,
        offer_type: 'official_campaign',
        offer_name: campaign.title,
        title: campaign.title,
        channel_scope: 'all',
        channel_focus_text: campaign.channelFocus,
        avg_discount_pct: 0,
        participating_store_count: 0,
        market_count: 0,
        promo_units: 0,
        promo_sales: 0,
        headline_items: campaign.typeLabel,
        notes: campaign.takeaway,
        objective: campaign.objective,
        proof_points: campaign.proofPoints || [],
        type_label: campaign.typeLabel,
        takeaway: campaign.takeaway,
        source_label: campaign.sourceLabel,
        source_url: campaign.sourceUrl,
        display_date_label: campaign.dateLabel,
        source_group: 'official',
        event_category: 'official',
      };
    })
    .filter(Boolean);
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
      note: `Modeled ${brandLabel} demand window from the Yum calendar foundation.`,
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
      notes: `${window.definition.note} Active for ${window.rows.length} week${window.rows.length === 1 ? '' : 's'} in the modeled Yum calendar.`,
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
        participating_store_count: 0,
        promo_units: 0,
        promo_sales: 0,
        headlineItems: new Set(),
        notesList: [],
        marketIds: new Set(),
        discountWeightedSum: 0,
        discountWeight: 0,
      });
    }

    const target = grouped.get(key);
    const weight = Math.max(toNumber(row.participating_store_count), 1);
    target.participating_store_count += toNumber(row.participating_store_count);
    target.promo_units += toNumber(row.promo_units);
    target.promo_sales += toNumber(row.promo_sales);
    target.discountWeightedSum += toNumber(row.avg_discount_pct) * weight;
    target.discountWeight += weight;
    if (row.market_id) target.marketIds.add(row.market_id);
    splitHeadlineItems(row.headline_items).forEach((item) => target.headlineItems.add(item));
    if (row.notes && !target.notesList.includes(row.notes)) {
      target.notesList.push(row.notes);
    }
  });

  return [...grouped.values()]
    .map((row) => ({
      event_id: row.event_id,
      week_start: row.week_start,
      date: row.date,
      brand_id: row.brand_id,
      offer_type: row.offer_type,
      offer_name: row.offer_name,
      title: row.title,
      channel_scope: row.channel_scope,
      avg_discount_pct: row.discountWeight > 0 ? row.discountWeightedSum / row.discountWeight : 0,
      participating_store_count: row.participating_store_count,
      market_count: row.marketIds.size,
      promo_units: row.promo_units,
      promo_sales: row.promo_sales,
      headline_items: [...row.headlineItems].slice(0, 4).join(' | '),
      notes: row.notesList[0] || '',
      event_category: getEventCategory(row),
    }))
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
    if (sourceGroup === 'official' && !activeFilters.official) return false;
    if (sourceGroup === 'modeled' && !activeFilters.modeled) return false;
    if (sourceGroup === 'calendar' && !activeFilters.calendar) return false;
    return true;
  });
}

function updateEventCountBadge() {
  const badge = document.getElementById('event-count-badge');
  if (!badge) return;

  const filtered = filterEvents();
  const counts = {
    official: filtered.filter((event) => getEventSourceGroup(event) === 'official').length,
    modeled: filtered.filter((event) => getEventSourceGroup(event) === 'modeled').length,
    calendar: filtered.filter((event) => getEventSourceGroup(event) === 'calendar').length,
  };

  badge.textContent = `${filtered.length} events (${counts.official} official, ${counts.modeled} modeled, ${counts.calendar} seasonal/tentpole)`;
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
    ? 'Broad pricing moves are not safe in the current promo environment.'
    : state.level === 'medium'
      ? 'Pricing needs a selective test-and-learn approach.'
      : 'Pricing is less promo-constrained than usual, but still requires selective tests.';
  copy.textContent = state.level === 'high'
    ? `~${dependencyPct}% of demand is currently driven by promotions. Avoid broad price increases. Test pricing only in low-promo windows.`
    : state.level === 'medium'
      ? `~${dependencyPct}% of demand is currently supported by promotions. Keep price changes selective and prioritize lower-promo pockets first.`
      : `~${dependencyPct}% of demand is currently tied to promotions. Selective pricing tests are possible, but keep the promo calendar in view.`;
  note.textContent = state.latestWeekKey
    ? `${weekLabel}: ${formatCurrency(state.latestPromoSales)} promo sales against ${formatCurrency(state.latestSales)} total modeled sales.`
    : 'No current promo dependency readout is available.';
}

function renderPromoDecisionBox(state) {
  const title = document.getElementById('promo-decision-title');
  const actions = document.getElementById('promo-decision-actions');
  const risk = document.getElementById('promo-decision-risk');
  if (!title || !actions || !risk) return;

  const actionList = state.level === 'high'
    ? [
        'Do NOT implement broad price increases this week.',
        'Maintain or optimize the current promo structure.',
        'Test pricing only in low-promo channels or segments.',
        'Focus on premium items for pricing adjustments.'
      ]
    : state.level === 'medium'
      ? [
          'Avoid a blanket price move across the menu this week.',
          'Keep the promo structure working in the highest-pressure windows.',
          'Test pricing first in lower-promo channels or more resilient segments.',
          'Use premium items and boxes as the primary pricing test bed.'
        ]
      : [
          'Selective pricing tests are possible this week.',
          'Keep effective promo support in the value-led windows.',
          'Start pricing tests in lower-promo channels or segments first.',
          'Use premium items for any near-term price adjustments.'
        ];

  title.textContent = state.level === 'high'
    ? 'Do not push broad pricing while promo dependency remains high.'
    : state.level === 'medium'
      ? 'Keep pricing selective until promo dependency cools further.'
      : 'Use measured pricing tests, but keep promo support where it still matters.';

  actions.innerHTML = actionList
    .map((item) => `
      <div class="promo-decision-action">
        <i class="bi bi-bullseye promo-decision-action__icon"></i>
        <div>${item}</div>
      </div>
    `)
    .join('');

  risk.textContent = state.level === 'high'
    ? 'Risk: Removing promo support may lead to sharp traffic decline.'
    : state.level === 'medium'
      ? 'Risk: Pulling promo support too quickly may create a visible traffic drop in the most deal-led demand pockets.'
      : 'Risk: Even with lower dependency, removing promo support too broadly can still soften traffic in value-led segments.';
}

function renderCalendarSummary() {
  const campaigns = getOfficialCampaigns();
  const latestPromoWeek = latestWeek(modeledPromoWindows);
  const latestPromoRows = modeledPromoWindows.filter((row) => row.week_start === latestPromoWeek);
  const weightedDiscountBase = modeledPromoWindows.reduce((sum, row) => sum + Math.max(row.market_count, 1), 0);
  const weightedDiscount =
    weightedDiscountBase > 0
      ? modeledPromoWindows.reduce((sum, row) => sum + toNumber(row.avg_discount_pct) * Math.max(row.market_count, 1), 0) / weightedDiscountBase
      : 0;
  const leadingChannel = [...modeledPromoWindows]
    .sort((left, right) => toNumber(right.promo_sales) - toNumber(left.promo_sales))[0];
  const promoDependencyState = calculatePromoDependencyState();
  const dependencyPct = Math.round(promoDependencyState.dependencyShare * 100);
  const dependencyDelta = promoDependencyState.deltaPctPoints;
  const dependencyDirection = dependencyDelta >= 0 ? 'High vs baseline' : 'Below baseline';

  const updates = {
    'promo-summary-official-count': String(campaigns.length),
    'promo-summary-official-note': campaigns.length
      ? `${campaigns[0].dateLabel} to ${campaigns[campaigns.length - 1].dateLabel} from official ${currentBrandLabel} sources.`
      : `No official ${currentBrandLabel} campaigns loaded.`,
    'promo-summary-modeled-count': String(modeledPromoWindows.length),
    'promo-summary-modeled-note': latestPromoWeek
      ? `${latestPromoRows.length} active windows in the latest modeled week (${formatWeek(latestPromoWeek)}).`
      : 'No modeled windows available.',
    'promo-summary-discount': modeledPromoWindows.length ? `${weightedDiscount.toFixed(1)}%` : '--',
    'promo-summary-discount-note': modeledPromoWindows.length
      ? 'Weighted by market coverage across modeled promo windows.'
      : 'No modeled discount coverage available.',
    'promo-summary-channel': leadingChannel ? summarizeChannelScope(leadingChannel.channel_scope) : '--',
    'promo-summary-channel-note': leadingChannel
      ? `${leadingChannel.offer_name} is the top modeled pressure window by promo sales.`
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
  const campaigns = getOfficialCampaigns();
  const readout = document.getElementById('promo-strategy-readout');
  const chips = document.getElementById('campaign-pattern-chips');
  const note = document.getElementById('campaign-patterns-readout');
  const sourceBadge = document.getElementById('official-source-badge');
  if (!readout || !chips || !note) return;

  const patternCounts = campaigns.reduce((accumulator, campaign) => {
    accumulator[campaign.typeLabel] = (accumulator[campaign.typeLabel] || 0) + 1;
    return accumulator;
  }, {});

  const topPattern = Object.entries(patternCounts).sort((left, right) => right[1] - left[1])[0];
  const latestModeledWeek = latestWeek(modeledPromoWindows);
  const latestModeledWindows = modeledPromoWindows
    .filter((row) => row.week_start === latestModeledWeek)
    .sort((left, right) => toNumber(right.promo_sales) - toNumber(left.promo_sales));
  const topModeledWindow = latestModeledWindows[0];

  const bullets = [];
  if (topPattern) {
    bullets.push(`${currentBrandLabel} relies most visibly on ${topPattern[0].toLowerCase()} campaigns in the official brand examples curated here.`);
  }
  if (topModeledWindow) {
    bullets.push(
      `In the modeled calendar, ${topModeledWindow.offer_name} is the strongest latest-week pressure window, spanning ${topModeledWindow.market_count} markets with ${topModeledWindow.avg_discount_pct.toFixed(1)}% average discount.`
    );
  }
  if (campaigns.length >= 2) {
    bullets.push(`The official campaign tracker shows that ${currentBrandLabel} does not rely on one campaign type alone; it rotates across value, digital, and occasion-led plays.`);
  }
  if (!bullets.length) {
    bullets.push(`No official or modeled campaign readout is available yet for ${currentBrandLabel}.`);
  }

  readout.innerHTML = bullets.map((item) => `<li>${item}</li>`).join('');

  const chipMarkup = Object.entries(patternCounts)
    .map(
      ([label, count]) =>
        `<span class="badge rounded-pill bg-primary-subtle text-primary border-0">${label} <span class="ms-1 text-body-secondary">${count}</span></span>`
    )
    .join('');
  chips.innerHTML = chipMarkup || '<span class="badge rounded-pill bg-secondary-subtle text-body-secondary">No official patterns loaded</span>';

  note.innerHTML = topModeledWindow
    ? `${currentBrandLabel} is using official campaign archetypes such as <strong>${Object.keys(patternCounts).slice(0, 3).join('</strong>, <strong>')}</strong>, while the modeled 2025 calendar currently shows the heaviest price support in <strong>${summarizeChannelScope(topModeledWindow.channel_scope)}</strong>.`
    : `Official campaign examples for ${currentBrandLabel} are loaded, but the modeled calendar does not currently show a dominant promo window.`;

  if (sourceBadge) {
    sourceBadge.textContent = `${campaigns.length} official source examples`;
  }
}

function renderOfficialCampaigns() {
  const container = document.getElementById('official-campaigns-container');
  if (!container) return;

  const campaigns = getOfficialCampaigns();
  if (!campaigns.length) {
    container.innerHTML = `<div class="col-12"><div class="alert alert-light border mb-0">No official ${currentBrandLabel} campaign examples are loaded.</div></div>`;
    return;
  }

  container.innerHTML = campaigns
    .map(
      (campaign) => `
        <div class="col-lg-4 col-md-6">
          <div class="official-campaign-card h-100">
            <div class="official-campaign-card__top">
              <div class="official-campaign-card__meta">
                <span class="badge bg-dark-subtle text-dark border">${campaign.dateLabel}</span>
                <span class="badge bg-primary text-white">${campaign.typeLabel}</span>
              </div>
              <div class="official-campaign-card__title">${campaign.title}</div>
              <div class="small text-muted">${campaign.objective}</div>
            </div>
            <div class="official-campaign-card__body">
              <div class="small mb-2"><strong>Channel focus:</strong> ${campaign.channelFocus}</div>
              <ul class="small ps-3 official-campaign-card__list">
                ${campaign.proofPoints.map((point) => `<li>${point}</li>`).join('')}
              </ul>
              <div class="small"><strong>Why it matters:</strong> ${campaign.takeaway}</div>
              <div class="official-campaign-card__footer small">
                <span class="text-muted">${campaign.sourceLabel}</span>
                <a class="btn btn-sm btn-outline-primary" href="${campaign.sourceUrl}" target="_blank" rel="noopener noreferrer">Open source</a>
              </div>
            </div>
          </div>
        </div>
      `
    )
    .join('');
}

function renderMarketSignalsDashboard() {
  const left = document.getElementById('market-signals-competitive');
  const right = document.getElementById('market-signals-social');
  if (!left || !right) return;

  const latestChannelWeek = latestWeek(currentStoreChannelRows);
  const latestChannelRows = currentStoreChannelRows.filter((row) => row.week_start === latestChannelWeek);
  const latestPromoWeek = latestWeek(modeledPromoWindows);
  const latestPromoRows = modeledPromoWindows
    .filter((row) => row.week_start === latestPromoWeek)
    .sort((leftRow, rightRow) => toNumber(rightRow.promo_sales) - toNumber(leftRow.promo_sales));

  const totalSales = sumBy(latestChannelRows, 'net_sales');
  const byChannel = latestChannelRows
    .map((row) => ({
      channel: row.channel,
      channelName: row.channel_name || getYumChannelLabel(row.channel),
      sales: toNumber(row.net_sales),
      orders: toNumber(row.transaction_count_proxy),
      avgCheck: toNumber(row.avg_check_proxy || row.avg_check),
    }))
    .filter((row) => row.sales > 0)
    .sort((leftRow, rightRow) => rightRow.sales - leftRow.sales);

  const topPromo = latestPromoRows[0];
  const mixLine = byChannel
    .slice(0, 3)
    .map((row) => `${row.channelName} ${((row.sales / Math.max(totalSales, 1)) * 100).toFixed(1)}%`)
    .join(', ');

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
        <strong>Data anchor:</strong> Latest ${currentBrandLabel} channel mix in the modeled panel is ${mixLine || 'not available'}.
      </p>
    `
    : `<p class="mb-0 text-muted">No modeled channel rows are available for ${currentBrandLabel}.</p>`;

  right.innerHTML = topPromo
    ? `
      <ul class="mb-1">
        <li><strong>Top modeled offer:</strong> ${topPromo.offer_name}.</li>
        <li><strong>Coverage:</strong> ${topPromo.market_count} markets, ${formatChannelScope(topPromo.channel_scope)}.</li>
        <li><strong>Promo sales:</strong> ${formatCurrency(toNumber(topPromo.promo_sales))} with ${toNumber(topPromo.avg_discount_pct).toFixed(1)}% average discount.</li>
      </ul>
      <p class="mb-0 text-muted">
        <strong>Planner cue:</strong> Price changes should be read against ${topPromo.offer_name}, not in isolation.
      </p>
    `
    : `<p class="mb-0 text-muted">No modeled offer windows are available for ${currentBrandLabel}.</p>`;
}

function getEventScopeLabel(event) {
  const sourceGroup = getEventSourceGroup(event);
  if (sourceGroup === 'official') return event.channel_focus_text || 'Owned channels';
  if (sourceGroup === 'calendar') return event.type_label || 'Portfolio calendar';
  return formatChannelScope(event.channel_scope);
}

function getEventPricingSignal(event) {
  const sourceGroup = getEventSourceGroup(event);
  if (sourceGroup === 'official') return event.type_label || 'Campaign signal';
  if (sourceGroup === 'calendar') {
    return event.signal_labels && event.signal_labels.length ? event.signal_labels.slice(0, 2).join(' + ') : 'Calendar demand signal';
  }
  if (toNumber(event.avg_discount_pct) > 0) return `${toNumber(event.avg_discount_pct).toFixed(1)}% avg discount`;
  return 'Promo support without explicit discount';
}

function getEventNoteSummary(event) {
  const sourceGroup = getEventSourceGroup(event);
  if (sourceGroup === 'official') return event.takeaway || event.notes || 'Official campaign reference.';
  return event.notes || event.headline_items || 'No additional notes available.';
}

function renderEventTimeline() {
  const container = document.getElementById('event-timeline');
  if (!container) return;

  const filteredEvents = filterEvents().sort((left, right) => new Date(left.date) - new Date(right.date));
  if (!filteredEvents.length) {
    container.innerHTML = `<div class="text-center text-muted">No ${currentBrandLabel} events match the current filters.</div>`;
    return;
  }

  const eventDates = filteredEvents.map((event) => new Date(event.date));
  const startDate = new Date(Math.min(...eventDates));
  const endDate = new Date(Math.max(...eventDates));
  const totalDays = Math.max(1, Math.floor((endDate - startDate) / (1000 * 60 * 60 * 24)));

  let html = `
    <div class="d-flex justify-content-center gap-4 mb-3 flex-wrap">
      <div class="d-flex align-items-center"><div style="width: 16px; height: 16px; border-radius: 50%; background: #ef4444; box-shadow: 0 0 0 4px rgba(239, 68, 68, 0.16);"></div><span class="ms-2 small">Official Campaigns</span></div>
      <div class="d-flex align-items-center"><div style="width: 16px; height: 16px; border-radius: 50%; background: var(--dplus-orange); box-shadow: 0 0 0 4px rgba(245, 158, 11, 0.2);"></div><span class="ms-2 small">Modeled Value / Bundle</span></div>
      <div class="d-flex align-items-center"><div style="width: 16px; height: 16px; border-radius: 50%; background: var(--dplus-blue); box-shadow: 0 0 0 4px rgba(0, 102, 255, 0.2);"></div><span class="ms-2 small">Modeled Digital / Delivery</span></div>
      <div class="d-flex align-items-center"><div style="width: 16px; height: 16px; border-radius: 50%; background: #f59e0b; box-shadow: 0 0 0 4px rgba(245, 158, 11, 0.16);"></div><span class="ms-2 small">Tentpoles</span></div>
      <div class="d-flex align-items-center"><div style="width: 16px; height: 16px; border-radius: 50%; background: #16a34a; box-shadow: 0 0 0 4px rgba(34, 197, 94, 0.16);"></div><span class="ms-2 small">Seasonal Windows</span></div>
    </div>
    <p class="text-center text-muted small mb-3"><i class="bi bi-info-circle me-1"></i>Click a marker to inspect official campaigns, modeled offer windows, and Yum calendar tentpoles in one timeline.</p>
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
  if (sourceGroup === 'official') {
    bodyMarkup = `
      <div class="row g-3 small mb-3">
        <div class="col-md-4"><strong>Campaign type:</strong> ${event.type_label || 'Official campaign'}</div>
        <div class="col-md-4"><strong>Channel focus:</strong> ${event.channel_focus_text || 'Owned channels'}</div>
        <div class="col-md-4"><strong>Source:</strong> ${event.source_label || 'Official brand source'}</div>
      </div>
      <div class="small mb-3"><strong>Objective:</strong> ${event.objective || 'Campaign objective not loaded.'}</div>
      <div class="small mb-3"><strong>Pricing read-through:</strong> ${event.takeaway || event.notes || 'No takeaway loaded.'}</div>
      <div class="small"><strong>Proof points:</strong></div>
      <ul class="small ps-3 mb-3">
        ${(event.proof_points || []).map((point) => `<li>${point}</li>`).join('') || '<li>No proof points loaded.</li>'}
      </ul>
      <div class="small">
        <a class="btn btn-sm btn-outline-primary" href="${event.source_url}" target="_blank" rel="noopener noreferrer">Open official source</a>
      </div>
    `;
  } else if (sourceGroup === 'calendar') {
    bodyMarkup = `
      <div class="row g-3 small mb-3">
        <div class="col-md-4"><strong>Window type:</strong> ${event.type_label || 'Calendar window'}</div>
        <div class="col-md-4"><strong>Coverage:</strong> Portfolio demand window</div>
        <div class="col-md-4"><strong>Signals:</strong> ${headlineItems.length ? headlineItems.slice(0, 3).join(', ') : 'Seasonality'}</div>
      </div>
      <div class="small mb-3">${event.notes || 'Calendar window details are not available.'}</div>
      <div class="small"><strong>Why it matters:</strong> Use this window as context for pricing tests, not as a standalone promo event.</div>
    `;
  } else {
    const discountText = toNumber(event.avg_discount_pct) > 0 ? `${toNumber(event.avg_discount_pct).toFixed(1)}% avg discount` : 'No explicit discount';
    bodyMarkup = `
      <div class="row g-3 small mb-3">
        <div class="col-md-4"><strong>Channel scope:</strong> ${formatChannelScope(event.channel_scope)}</div>
        <div class="col-md-4"><strong>Market coverage:</strong> ${event.market_count ? `${event.market_count} markets` : 'System event'}</div>
        <div class="col-md-4"><strong>Discount:</strong> ${discountText}</div>
        <div class="col-md-4"><strong>Promo sales:</strong> ${formatCurrency(toNumber(event.promo_sales))}</div>
        <div class="col-md-4"><strong>Promo units:</strong> ${formatNumber(toNumber(event.promo_units))}</div>
        <div class="col-md-4"><strong>Stores:</strong> ${formatNumber(toNumber(event.participating_store_count))}</div>
      </div>
      <div class="small mb-2">${event.notes || 'Modeled offer pressure surfaced from the Yum promo calendar.'}</div>
      <div class="small"><strong>Headline items:</strong> ${headlineItems.length ? headlineItems.join(', ') : 'N/A'}</div>
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
    tbody.innerHTML = `<tr><td colspan="6" class="text-center text-muted">No ${currentBrandLabel} events match the current filters.</td></tr>`;
    return;
  }

  tbody.innerHTML = filteredEvents
    .map((event) => {
      const style = getEventStyle(event);
      return `
        <tr>
          <td class="text-nowrap">${event.display_date_label || getEventDateLabel(event)}</td>
          <td><span class="badge ${style.badgeClass}">${style.badgeText}</span></td>
          <td>${event.title}</td>
          <td>${getEventScopeLabel(event)}</td>
          <td>${getEventPricingSignal(event)}</td>
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
    container.innerHTML = `<div class="col-12 text-center text-muted">No ${currentBrandLabel} modeled promo windows are available.</div>`;
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
                <span class="badge bg-primary text-white">${summarizeChannelScope(promo.channel_scope)}</span>
              </div>
            </div>
            <div class="modeled-promo-card__body">
              <div class="row g-2 small mb-2">
                <div class="col-6"><strong>Markets:</strong> ${promo.market_count}</div>
                <div class="col-6"><strong>Stores:</strong> ${formatNumber(toNumber(promo.participating_store_count))}</div>
                <div class="col-6"><strong>Promo sales:</strong> ${formatCurrency(toNumber(promo.promo_sales))}</div>
                <div class="col-6"><strong>Promo units:</strong> ${formatNumber(toNumber(promo.promo_units))}</div>
                <div class="col-12"><strong>Avg discount:</strong> ${toNumber(promo.avg_discount_pct).toFixed(1)}%</div>
              </div>
              <div class="small mb-2"><strong>Headline items:</strong> ${promo.headline_items || 'N/A'}</div>
              <div class="small text-muted">${promo.notes || 'Modeled offer pressure surfaced from the generated promo calendar.'}</div>
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
  const filterOfficial = document.getElementById('filter-price-change');
  const filterModeled = document.getElementById('filter-promo');
  const filterCalendar = document.getElementById('filter-tentpole');

  const rerender = () => {
    if (filterAll) {
      filterAll.checked = activeFilters.official && activeFilters.modeled && activeFilters.calendar;
    }
    updateEventCountBadge();
    renderEventTimeline();
    renderEventTable();
  };

  if (filterAll) {
    filterAll.addEventListener('change', (event) => {
      const checked = event.target.checked;
      activeFilters.official = checked;
      activeFilters.modeled = checked;
      activeFilters.calendar = checked;
      if (filterOfficial) filterOfficial.checked = checked;
      if (filterModeled) filterModeled.checked = checked;
      if (filterCalendar) filterCalendar.checked = checked;
      rerender();
    });
  }

  if (filterOfficial) {
    filterOfficial.addEventListener('change', (event) => {
      activeFilters.official = event.target.checked;
      rerender();
    });
  }

  if (filterModeled) {
    filterModeled.addEventListener('change', (event) => {
      activeFilters.modeled = event.target.checked;
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
    sectionTitle.innerHTML = `<i class="bi bi-calendar-event me-2"></i>${currentBrandLabel} Promotion Performance & Calendar`;
  }

  const labels = {
    'label[for="filter-all"]': '<i class="bi bi-check-all me-1"></i>All Events',
    'label[for="filter-price-change"]': '<i class="bi bi-megaphone me-1"></i>Official Campaigns',
    'label[for="filter-promo"]': '<i class="bi bi-tag me-1"></i>Modeled Promos',
    'label[for="filter-tentpole"]': '<i class="bi bi-calendar-week me-1"></i>Seasonal / Tentpoles',
  };

  Object.entries(labels).forEach(([selector, html]) => {
    const node = document.querySelector(selector);
    if (node) node.innerHTML = html;
  });

  const tableHead = document.querySelectorAll('#event-table thead th');
  if (tableHead.length >= 6) {
    tableHead[0].textContent = 'Date';
    tableHead[1].textContent = 'Calendar Layer';
    tableHead[2].textContent = 'Event';
    tableHead[3].textContent = 'Scope';
    tableHead[4].textContent = 'Pricing Signal';
    tableHead[5].textContent = 'Notes';
  }
}

function refreshEventCalendar() {
  const brandId = getActiveBrandId();
  currentBrandLabel = getActiveBrandLabel();
  currentPromoRows = promoRows.filter((row) => row.brand_id === brandId);
  currentStoreChannelRows = storeChannelRows.filter((row) => row.brand_id === brandId);
  modeledPromoWindows = aggregatePromoWindows(currentPromoRows);
  allEvents = [
    ...buildOfficialCampaignTimelineEvents(brandId),
    ...modeledPromoWindows,
    ...buildCalendarMomentEvents(calendarWeekRows, calendarRows, brandId, currentBrandLabel),
  ];

  relabelStaticUI();
  renderCalendarSummary();
  renderStrategyReadout();
  renderOfficialCampaigns();
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
    const [promoCalendar, storeChannelPanel, loadedCalendarRows, loadedCalendarWeekRows] = await Promise.all([
      loadYumPromoCalendar(),
      loadYumStoreChannelWeekPanel(),
      loadYumCalendarDim(),
      loadYumCalendarWeekDim(),
    ]);

    promoRows = promoCalendar;
    storeChannelRows = storeChannelPanel;
    calendarRows = loadedCalendarRows;
    calendarWeekRows = loadedCalendarWeekRows;

    setupEventFilters();
    setupBrandListener();
    refreshEventCalendar();
  } catch (error) {
    console.error('Error initializing Yum event calendar:', error);
    const container = document.getElementById('event-timeline');
    if (container) {
      container.innerHTML = `
        <div class="alert alert-danger">
          <i class="bi bi-exclamation-triangle me-2"></i>
          Error loading Yum promo calendar data: ${error.message}
        </div>
      `;
    }
  }
}
