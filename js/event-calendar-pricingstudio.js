const DAY_MS = 24 * 60 * 60 * 1000;
const ROLLING_WINDOW_DAYS = 364;
const CATEGORY_ORDER = ['menu_pricing', 'value_bundle', 'digital_loyalty', 'premium_innovation', 'occasion_seasonal'];
const CATEGORY_CONFIG = {
  menu_pricing: { label: 'Menu Pricing', badgeClass: 'bg-success', markerClass: 'event-price', filterId: 'filter-menu-pricing' },
  value_bundle: { label: 'Value & Bundle', badgeClass: 'bg-info', markerClass: 'event-promo', filterId: 'filter-value-bundle' },
  digital_loyalty: { label: 'Digital & Loyalty', badgeClass: 'bg-primary', markerClass: 'event-promo', filterId: 'filter-digital-loyalty' },
  premium_innovation: { label: 'Premium & Innovation', badgeClass: 'bg-secondary', markerClass: 'event-content', filterId: 'filter-premium-innovation' },
  occasion_seasonal: { label: 'Occasion & Seasonal', badgeClass: 'bg-warning text-dark', markerClass: 'event-seasonal', filterId: 'filter-occasion-seasonal' }
};
const activeFilters = Object.fromEntries(CATEGORY_ORDER.map((id) => [id, true]));
let allEvents = [];
let promoCampaigns = [];
let filtersBound = false;

const EVENT_ROWS = `
2026-03-22|digital_loyalty|Mixed|Melt Combo - Lunch Carryout Campaign|Carryout|14200|1900|$14.2K sales | 1,900 orders|Focused on weekday lunch traffic; strong response from value-seeking cohorts|2026-03-22|2026-03-22|7.47|20|Melt Combo | Personal Pizza | Breadsticks|Lunch carryout traffic|||
2026-03-01|premium_innovation|Modeled|Spring Menu Launch (New Crust & Flavors)|Delivery, Carryout|2300000|113000|$2.3M sales | 113K orders|AI-simulated based on historical innovation launches and seasonal demand uplift|2026-03-01|2026-04-26|20.50|8|Stuffed Crust Pizza | Supreme Pizza | New Crust Flavors|Premium menu innovation|||
2026-02-22|menu_pricing|Modeled|Large Pizza Price Reduction|Delivery, Carryout|46600|2400|$46.6K sales | 2,400 orders|Price reduced from about $21.25 to $19.35 (about 9%) to recover declining order volume|2026-02-22|2026-02-22|||Large 1-Topping Pizza | Specialty Pizzas|Core pizza price reset|21.25|19.35|-0.0894
2026-02-01|menu_pricing|Modeled|Medium Pizza Value Reset|Delivery, Carryout|48800|2500|$48.8K sales | 2,500 orders|Adjusted pricing across core SKUs to improve entry price perception|2026-02-01|2026-02-01|||2-Topping Medium Pizza Deal | Medium Pan Pizza|Entry price perception|18.75|17.95|-0.0427
2026-01-11|menu_pricing|Modeled|Large Pizza Price Reduction|Delivery, Carryout|48000|2450|$48.0K sales | 2,450 orders|Continued pricing correction to stabilize demand after holiday period|2026-01-11|2026-01-11|||Large 1-Topping Pizza | Stuffed Crust Pizza|Post-holiday recovery pricing|20.75|19.60|-0.0554
2026-01-11|value_bundle|Mixed|Family Meal Box - NFL Playoffs Promo|Delivery|160000|10000|$160.0K sales | 10.0K orders|High-volume bundle optimized for game-day occasions|2026-01-11|2026-01-11|16.00|30|Family Meal Box | Wings | Breadsticks|Game-day bundle|||
2026-01-04|value_bundle|Modeled|$10 Tastemaker Repricing|Delivery, Carryout|2300000|117000|$2.3M sales | 117K orders|AI-modeled using elasticity signals from prior value campaigns|2026-01-04|2026-02-22|19.60|25|$10 Tastemaker | Breadsticks | 2-Liter Soda|Value ladder repricing|||
2025-12-21|premium_innovation|Observed|Stuffed Crust Holiday Promotion|Delivery|56800|2400|$56.8K sales | 2,400 orders|Observed uplift from premium product bundling during holidays|2025-12-21|2025-12-31|23.50|10|Stuffed Crust Pizza | Supreme Pizza|Holiday premium bundle|||
2025-11-23|menu_pricing|Observed|Large Pizza Price Reduction|Delivery, Carryout|46300|2350|$46.3K sales | 2,350 orders|Tactical price drop ahead of holiday demand peak|2025-11-23|2025-11-23|||Large 1-Topping Pizza | Specialty Pizzas|Holiday lead-in pricing|20.95|19.70|-0.0597
2025-11-02|occasion_seasonal|Observed|Holiday Family Bundle Promotion|Delivery, Carryout|2400000|121000|$2.4M sales | 121K orders|Seasonal bundles driving family-sized orders and higher ticket sizes|2025-11-02|2025-11-30|19.83||Family Meal Box | Family Pasta Bundle | Large Specialty Pizza|Holiday family occasions|||
2025-11-02|menu_pricing|Observed|Large Pizza Price Reduction|Delivery, Carryout|46600|2360|$46.6K sales | 2,360 orders|Reinforced price positioning before holiday promotional push|2025-11-02|2025-11-02|||Large 1-Topping Pizza | Stuffed Crust Pizza|Holiday value positioning|20.80|19.75|-0.0505
2025-10-12|menu_pricing|Observed|Large Pizza Price Adjustment|Delivery, Carryout|49600|2500|$49.6K sales | 2,500 orders|Minor pricing optimization to balance margin and demand|2025-10-12|2025-10-12|||Large 1-Topping Pizza | Supreme Pizza|Margin-demand balancing|19.45|19.85|0.0206
2025-09-28|menu_pricing|Observed|Large Pizza Price Increase|Delivery, Carryout|48600|2300|$48.6K sales | 2,300 orders|About 10% price increase tested; slight demand softening observed|2025-09-28|2025-09-28|||Large 1-Topping Pizza | Large Specialty Pizza|Elasticity threshold test|19.35|21.29|0.1003
2025-09-21|menu_pricing|Observed|Large Pizza Price Reduction|Delivery, Carryout|48500|2450|$48.5K sales | 2,450 orders|Immediate rollback after elasticity-driven demand drop|2025-09-21|2025-09-21|||Large 1-Topping Pizza | Large Specialty Pizza|Price rollback|21.29|19.80|-0.0700
2025-09-07|menu_pricing|Observed|Large Pizza Price Increase|Delivery, Carryout|49400|2350|$49.4K sales | 2,350 orders|Initial price increase test to evaluate elasticity thresholds|2025-09-07|2025-09-07|||Large 1-Topping Pizza | Stuffed Crust Pizza|Initial elasticity test|19.45|21.10|0.0848
2025-08-31|value_bundle|Observed|Family Meal Box - Game Day Promo|Delivery|267000|16400|$267.0K sales | 16.4K orders|High-performing sports event bundle campaign|2025-08-31|2025-08-31|16.28|30|Family Meal Box | Wings | Breadsticks|Game-day bundle|||
2025-08-31|menu_pricing|Observed|Large Pizza Price Reduction|Delivery, Carryout|49300|2480|$49.3K sales | 2,480 orders|Price correction following earlier demand dip|2025-08-31|2025-08-31|||Large 1-Topping Pizza | Supreme Pizza|Price correction|20.90|19.88|-0.0488
2025-08-17|digital_loyalty|Observed|App Rewards Summer Carryout Boost|Carryout|4100|500|$4.1K sales | 500 orders|Loyalty-driven traffic boost for off-peak periods|2025-08-17|2025-08-17|8.20|15|Carryout Deal | Personal Pizza | Breadsticks|Loyalty carryout support|||
2025-08-03|occasion_seasonal|Observed|Football Season Kickoff Bundle|Delivery|3600000|181000|$3.6M sales | 181K orders|Major seasonal spike driven by sports viewing occasions|2025-08-03|2025-08-31|19.89||Family Meal Box | Wings | Large 1-Topping Pizza|Sports season occasion|||
2025-07-20|digital_loyalty|Observed|App Rewards Summer Carryout Boost|Carryout|4000|490|$4.0K sales | 490 orders|Repeat campaign with stable engagement from loyalty users|2025-07-20|2025-07-20|8.16|15|Carryout Deal | Melt Combo | Breadsticks|Loyalty carryout support|||
2025-06-22|digital_loyalty|Observed|App Rewards Summer Carryout Boost|Carryout|4200|510|$4.2K sales | 510 orders|Strong engagement from app-based ordering segment|2025-06-22|2025-06-22|8.24|15|Carryout Deal | Personal Pizza | Breadsticks|Loyalty carryout support|||
2025-05-18|digital_loyalty|Observed|Melt Combo - Lunch Carryout Campaign|Carryout|14500|2000|$14.5K sales | 2,000 orders|Lunch-focused value offering driving weekday traffic|2025-05-18|2025-05-18|7.25|20|Melt Combo | Personal Pizza | Breadsticks|Lunch carryout traffic|||
2025-05-04|occasion_seasonal|Observed|Summer Traffic Builder Promotion|Delivery|3300000|160000|$3.3M sales | 160K orders|Seasonal demand uplift supported by bundled value deals|2025-05-04|2025-06-01|20.63||Family Meal Box | $10 Tastemaker | Breadsticks|Summer demand uplift|||
2025-04-20|digital_loyalty|Observed|Melt Combo - Lunch Carryout Campaign|Carryout|14300|1950|$14.3K sales | 1,950 orders|Entry-level value offering targeting price-sensitive customers|2025-04-20|2025-04-20|7.33|20|Melt Combo | Personal Pizza | Breadsticks|Lunch carryout traffic|||
`.trim();

const CAMPAIGN_ROWS = `
Spring Menu Launch|Modeled|2026-03-01|2026-04-26|1|2300000|113000|8|20.50|Premium & Innovation|Delivery, Carryout
$10 Tastemaker Repricing|Modeled|2026-01-04|2026-02-22|1|2300000|117000|25|19.60|Value & Bundle|Delivery, Carryout
Stuffed Crust Holiday Promotion|Observed|2025-12-21|2025-12-31|1|56800|2400|10|23.50|Premium & Innovation|Delivery
Family Meal Box - Game Day Promo|Mixed|2025-08-31|2026-02-22|2|427000|26500|30|16.20|Value & Bundle|Delivery
App Rewards Summer Carryout Boost|Observed|2025-06-22|2025-08-17|3|12300|1500|15|8.20|Digital & Loyalty|Carryout
Melt Combo - Lunch Carryout Campaign|Mixed|2025-04-20|2026-03-22|3|43000|5800|20|7.50|Digital & Loyalty|Carryout
`.trim();

function parseDate(value) { const d = new Date(`${value}T00:00:00`); return Number.isNaN(d.getTime()) ? null : d; }
function formatDate(value) { const d = parseDate(value); return d ? d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : '-'; }
function money(value) { return `$${Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 1, minimumFractionDigits: Number(value || 0) % 1 ? 1 : 0 })}`; }
function pct(value) { return `${Number(value || 0).toFixed(0)}%`; }
function signedPct(value) { const n = Number(value || 0) * 100; return `${n > 0 ? '+' : ''}${n.toFixed(1)}%`; }
function rollingBounds() { const end = new Date(); end.setHours(0,0,0,0); const start = new Date(end); start.setDate(start.getDate() - ROLLING_WINDOW_DAYS); return { start, end }; }
function config(id) { return CATEGORY_CONFIG[id]; }

function parseEvents() {
  return EVENT_ROWS.split('\n').map((line, index) => {
    const [date, category_id, source_status, title, channels, sales, orders, output_display, notes, start_date, end_date, avg_realized_price, discount_pct, anchor_items, tier, price_from, price_to, price_change_pct] = line.split('|').map((part) => part.trim());
    const priceFrom = Number(price_from);
    const priceTo = Number(price_to);
    return {
      event_id: `event_${index + 1}`,
      date, category_id, source_status, title, channels, output_display, notes, start_date, end_date, anchor_items, tier,
      supported_sales: Number(sales), supported_units: Number(orders), avg_realized_price: Number(avg_realized_price || 0), discount_pct: Number(discount_pct || 0),
      price_from: Number.isFinite(priceFrom) ? priceFrom : null,
      price_to: Number.isFinite(priceTo) ? priceTo : null,
      price_change_pct: price_change_pct ? Number(price_change_pct) : null,
      price_change_amount: Number.isFinite(priceFrom) && Number.isFinite(priceTo) ? priceTo - priceFrom : null
    };
  });
}

function parseCampaigns() {
  return CAMPAIGN_ROWS.split('\n').map((line, index) => {
    const [campaign_name, status, start_date, end_date, windows, sales, orders, discount_pct, avg_realized_price, category, channels] = line.split('|').map((part) => part.trim());
    return { campaign_id: `campaign_${index + 1}`, campaign_name, status, start_date, end_date, windows: Number(windows), supported_sales: Number(sales), supported_units: Number(orders), discount_pct: Number(discount_pct), avg_realized_price: Number(avg_realized_price), categories: [category], channels: channels.split(',').map((part) => part.trim()) };
  });
}

function filteredEvents() { return allEvents.filter((event) => activeFilters[event.category_id]); }
function eventSummary(event) {
  if (event.output_display) return event.output_display;
  if (event.price_change_amount !== null) return `${signedPct(event.price_change_pct)} to ${money(event.price_to)} | ${money(event.supported_sales)} sales`;
  if (event.discount_pct) return `${pct(event.discount_pct)} off | ${money(event.supported_sales)} sales`;
  return `${money(event.supported_sales)} sales | ${Math.round(event.supported_units).toLocaleString()} orders`;
}

function updateBadge() {
  const badge = document.getElementById('event-count-badge'); if (!badge) return;
  const list = filteredEvents();
  const counts = ['Observed', 'Mixed', 'Modeled'].map((status) => list.filter((event) => event.source_status === status).length);
  badge.textContent = `${list.length} events (${counts[0]} observed, ${counts[1]} mixed, ${counts[2]} modeled)`;
}

function showDetails(event) {
  const panel = document.getElementById('timeline-details'); if (!panel) return;
  const category = config(event.category_id);
  const metrics = [
    ['Timing', event.start_date !== event.end_date ? `${formatDate(event.start_date)} to ${formatDate(event.end_date)}` : formatDate(event.date)],
    ['Channels', event.channels],
    ['Supported sales', money(event.supported_sales)],
    ['Supported volume', `${Math.round(event.supported_units).toLocaleString()} orders`]
  ];
  if (event.price_change_amount !== null) { metrics.push(['Price move', `${event.price_change_amount > 0 ? '+' : ''}${money(event.price_change_amount)} (${signedPct(event.price_change_pct)})`], ['Realized price', money(event.price_to)]); }
  else if (event.discount_pct) { metrics.push(['Avg discount', pct(event.discount_pct)], ['Realized price', money(event.avg_realized_price)]); }
  panel.innerHTML = `<div class="glass-card p-4"><div class="d-flex justify-content-between align-items-start mb-3"><div><div class="mb-2"><span class="badge ${category.badgeClass} me-2">${category.label}</span><span class="badge bg-light text-dark">${event.source_status}</span></div><h5 class="mb-1">${event.title}</h5><div class="text-muted small">${event.tier}</div></div><button type="button" class="btn-close" aria-label="Close" onclick="document.getElementById('timeline-details').style.display='none'"></button></div><p class="mb-3">${event.notes}</p><div class="row g-3 mb-3">${metrics.map(([label, value]) => `<div class="col-md-4"><div class="border rounded p-3 h-100"><div class="small text-uppercase text-muted fw-semibold mb-1">${label}</div><div class="small fw-semibold">${value}</div></div></div>`).join('')}</div><div class="small"><span class="text-uppercase text-muted fw-semibold me-2">Anchor items</span>${event.anchor_items.split(' | ').map((item) => `<span class="badge bg-light text-dark me-1">${item}</span>`).join('')}</div></div>`;
  panel.style.display = 'block';
}

function renderTimeline() {
  const root = document.getElementById('event-timeline'); if (!root) return;
  const list = filteredEvents(); if (!list.length) { root.innerHTML = '<div class="text-center text-muted">No events match the current filters</div>'; return; }
  const bounds = rollingBounds(); const totalDays = Math.max(1, Math.round((bounds.end - bounds.start) / DAY_MS)); const lanes = [4, -20, 28]; const last = lanes.map(() => -999);
  const items = [...list].sort((a,b) => a.date.localeCompare(b.date)).map((event) => { const pos = Math.max(0, Math.min(100, (((parseDate(event.date) - bounds.start) / DAY_MS) / totalDays) * 100)); let lane = 0; while (lane < last.length && Math.abs(pos - last[lane]) < 4) lane += 1; if (lane >= lanes.length) lane = lanes.length - 1; last[lane] = pos; return { ...event, positionPercent: pos, markerTop: lanes[lane] }; });
  const markers = [0, 0.33, 0.66, 1].map((ratio) => { const date = new Date(bounds.start); date.setDate(date.getDate() + Math.round(totalDays * ratio)); return `<div class="timeline-year-marker" style="left:${(ratio * 100).toFixed(2)}%;">${date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}</div>`; }).join('');
  root.innerHTML = `<div class="timeline-slider-container"><div class="d-flex flex-wrap justify-content-center gap-3 mb-3">${CATEGORY_ORDER.filter((id) => list.some((event) => event.category_id === id)).map((id) => `<div class="d-flex align-items-center"><div class="timeline-event ${config(id).markerClass}" style="position: static; transform: none;"></div><span class="ms-2 small">${config(id).label}</span></div>`).join('')}</div><div class="timeline-years">${markers}</div><div class="timeline-track">${items.map((event) => `<div class="timeline-event ${config(event.category_id).markerClass}" style="left:${event.positionPercent}%;top:calc(50% + ${event.markerTop}px);" data-event-id="${event.event_id}" title="${event.title} | ${formatDate(event.date)}"></div>`).join('')}</div><div class="timeline-details mt-4" id="timeline-details" style="display:none;"></div></div>`;
  root.querySelectorAll('.timeline-event[data-event-id]').forEach((node) => node.addEventListener('click', () => { const event = list.find((item) => item.event_id === node.dataset.eventId); if (event) showDetails(event); }));
}

function renderTable() {
  const tbody = document.getElementById('event-table-body'); if (!tbody) return;
  const list = filteredEvents().sort((a,b) => b.date.localeCompare(a.date));
  tbody.innerHTML = list.length ? list.map((event) => `<tr data-event-id="${event.event_id}" style="cursor:pointer;"><td class="text-nowrap">${formatDate(event.date)}</td><td><span class="badge ${config(event.category_id).badgeClass}">${config(event.category_id).label}</span></td><td><div class="fw-semibold">${event.title}</div><div class="small text-muted">${event.source_status}</div></td><td class="small">${event.channels}</td><td class="small">${eventSummary(event)}</td><td class="small">${event.notes}</td></tr>`).join('') : '<tr><td colspan="6" class="text-center text-muted">No events match the current filters</td></tr>';
  tbody.querySelectorAll('tr[data-event-id]').forEach((row) => row.addEventListener('click', () => { const event = list.find((item) => item.event_id === row.dataset.eventId); if (event) showDetails(event); }));
}

function renderCards() {
  const root = document.getElementById('promo-cards-container'); if (!root) return;
  const statusClass = { Observed: 'success', Mixed: 'warning', Modeled: 'secondary' };
  root.innerHTML = promoCampaigns.map((campaign) => `<div class="col-md-6 col-lg-4 mb-3"><div class="card h-100"><div class="card-header bg-${statusClass[campaign.status] || 'primary'} text-white"><div class="d-flex justify-content-between align-items-center"><h6 class="mb-0">${campaign.campaign_name}</h6><span class="badge bg-light text-dark">${campaign.status}</span></div></div><div class="card-body"><div class="mb-2"><strong>Window:</strong> ${formatDate(campaign.start_date)} to ${formatDate(campaign.end_date)}</div><div class="mb-2"><strong>Flights:</strong> ${campaign.windows}</div><div class="mb-2"><strong>Supported sales:</strong> ${money(campaign.supported_sales)}</div><div class="mb-2"><strong>Supported volume:</strong> ${Math.round(campaign.supported_units).toLocaleString()} orders</div><div class="mb-2"><strong>Avg discount:</strong> ${pct(campaign.discount_pct)}</div><div class="mb-2"><strong>Realized price:</strong> ${money(campaign.avg_realized_price)}</div><div class="mt-3 small text-muted"><strong>Focus:</strong> ${campaign.categories.map((item) => `<span class="badge bg-light text-dark me-1">${item}</span>`).join('')}</div><div class="mt-2 small text-muted"><strong>Channels:</strong> ${campaign.channels.map((item) => `<span class="badge bg-light text-dark me-1">${item}</span>`).join('')}</div></div></div></div>`).join('');
}

function rerender() { updateBadge(); renderTimeline(); renderTable(); renderCards(); }
function setupFilters() {
  if (filtersBound) return;
  const all = document.getElementById('filter-all'); const filters = Object.fromEntries(CATEGORY_ORDER.map((id) => [id, document.getElementById(config(id).filterId)]));
  all?.addEventListener('change', (event) => { CATEGORY_ORDER.forEach((id) => { activeFilters[id] = event.target.checked; if (filters[id]) filters[id].checked = event.target.checked; }); rerender(); });
  CATEGORY_ORDER.forEach((id) => filters[id]?.addEventListener('change', (event) => { activeFilters[id] = event.target.checked; if (all) all.checked = CATEGORY_ORDER.every((categoryId) => activeFilters[categoryId]); rerender(); }));
  filtersBound = true;
}

function refreshEventCalendar() {
  const bounds = rollingBounds();
  allEvents = parseEvents().filter((event) => { const date = parseDate(event.date); return date && date >= bounds.start && date <= bounds.end; });
  promoCampaigns = parseCampaigns();
  rerender();
}

export async function initializeEventCalendar() {
  setupFilters();
  refreshEventCalendar();
}
