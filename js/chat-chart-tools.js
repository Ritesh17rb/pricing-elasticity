import { getWeeklyData, loadElasticityParams } from './data-loader.js';

const SERIES_COLORS = ['#2563eb', '#f97316', '#0f766e', '#dc2626', '#7c3aed', '#0891b2'];
const TIER_META = {
  ad_supported: { label: 'Entry & Value Meals', color: '#2563eb' },
  ad_free: { label: 'Core & Premium Meals', color: '#f97316' }
};

const WEEKLY_METRIC_META = {
  revenue: { key: 'revenue', label: 'Revenue', valueFormat: 'currency', axisLabel: 'Revenue ($)' },
  customers: { key: 'active_customers', label: 'Active Customers', valueFormat: 'integer', axisLabel: 'Customers' },
  active_customers: { key: 'active_customers', label: 'Active Customers', valueFormat: 'integer', axisLabel: 'Customers' },
  aov: { key: 'aov', label: 'Average Order Value', valueFormat: 'currency', axisLabel: 'AOV ($)' },
  repeat_loss_rate: { key: 'repeat_loss_rate', label: 'Repeat Loss Rate', valueFormat: 'percent', axisLabel: 'Repeat Loss Rate' },
  new_customers: { key: 'new_customers', label: 'New Customers', valueFormat: 'integer', axisLabel: 'New Customers' },
  net_adds: { key: 'net_adds', label: 'Net Adds', valueFormat: 'integer', axisLabel: 'Net Adds' },
  units_sold: { key: 'units_sold', label: 'Units Sold', valueFormat: 'integer', axisLabel: 'Units Sold' },
  gross_margin_pct: { key: 'gross_margin_pct', label: 'Gross Margin Rate', valueFormat: 'percent', axisLabel: 'Gross Margin Rate' }
};

const SCENARIO_METRIC_META = {
  revenue_pct: { key: 'revenue_pct', label: 'Revenue Change', valueFormat: 'percentSigned', axisLabel: 'Change vs Baseline' },
  customers_pct: { key: 'customers_pct', label: 'Customer Change', valueFormat: 'percentSigned', axisLabel: 'Change vs Baseline' },
  aov_pct: { key: 'aov_pct', label: 'AOV Change', valueFormat: 'percentSigned', axisLabel: 'Change vs Baseline' },
  repeat_loss_rate_pct: { key: 'repeat_loss_rate_pct', label: 'Repeat Loss Change', valueFormat: 'percentSigned', axisLabel: 'Change vs Baseline' },
  cltv_pct: { key: 'cltv_pct', label: 'CLTV Change', valueFormat: 'percentSigned', axisLabel: 'Change vs Baseline' },
  net_adds: { key: 'net_adds', label: 'Net Adds Change', valueFormat: 'integerSigned', axisLabel: 'Net Adds' }
};

const SEGMENT_METRIC_META = {
  customer_count: { key: 'customer_count', label: 'Customers', valueFormat: 'integer', axisLabel: 'Customers' },
  avg_order_value: { key: 'avg_order_value', label: 'Average Order Value', valueFormat: 'currency', axisLabel: 'AOV ($)' },
  repeat_loss_rate: { key: 'repeat_loss_rate', label: 'Repeat Loss Rate', valueFormat: 'percent', axisLabel: 'Repeat Loss Rate' },
  margin_rate: { key: 'margin_rate', label: 'Margin Rate', valueFormat: 'percent', axisLabel: 'Margin Rate' },
  promo_redemption_rate: { key: 'promo_redemption_rate', label: 'Promo Redemption Rate', valueFormat: 'percent', axisLabel: 'Promo Redemption Rate' },
  elasticity: { key: 'elasticity', label: 'Elasticity', valueFormat: 'decimal', axisLabel: 'Elasticity' }
};

export async function createChatChartSpec(params = {}, dataContext = null) {
  const chartKind = normalizeChartKind(params.chart_kind);

  switch (chartKind) {
    case 'weekly_trend':
      return buildWeeklyTrendChart(params);
    case 'scenario_comparison':
      return buildScenarioComparisonChart(params, dataContext);
    case 'segment_comparison':
      return buildSegmentComparisonChart(params);
    case 'forecast':
      return buildForecastChart(params, dataContext);
    case 'demand_curve':
      return buildDemandCurveChart(params);
    default:
      throw new Error(`Unsupported chart kind: ${params.chart_kind}`);
  }
}

function normalizeChartKind(value) {
  const normalized = String(value || '').trim().toLowerCase();
  const aliases = {
    trend: 'weekly_trend',
    weekly: 'weekly_trend',
    weekly_trend: 'weekly_trend',
    comparison: 'scenario_comparison',
    scenario: 'scenario_comparison',
    scenario_comparison: 'scenario_comparison',
    segments: 'segment_comparison',
    segment_comparison: 'segment_comparison',
    forecast: 'forecast',
    demand: 'demand_curve',
    demand_curve: 'demand_curve'
  };
  return aliases[normalized] || normalized;
}

async function buildWeeklyTrendChart(params) {
  const metric = WEEKLY_METRIC_META[normalizeMetric(params.metric)] || WEEKLY_METRIC_META.revenue;
  const tier = normalizeTier(params.tier || 'all');
  const maxPoints = clamp(Number(params.time_window_weeks || params.limit || 16), 6, 52);
  const rows = await getWeeklyData(tier === 'all' ? 'all' : tier);

  if (!rows.length) {
    throw new Error('No weekly data is available for charting.');
  }

  const dates = Array.from(new Set(rows.map((row) => row.date))).sort().slice(-maxPoints);
  const filteredRows = rows.filter((row) => dates.includes(row.date));
  const tiers = tier === 'all' ? ['ad_supported', 'ad_free'] : [tier];
  const datasets = tiers.map((tierKey, index) => {
    const tierRows = filteredRows.filter((row) => row.tier === tierKey);
    return {
      label: TIER_META[tierKey]?.label || humanize(tierKey),
      data: dates.map((date) => {
        const match = tierRows.find((row) => row.date === date);
        return match ? Number(match[metric.key] || 0) : null;
      }),
      borderColor: TIER_META[tierKey]?.color || SERIES_COLORS[index % SERIES_COLORS.length],
      backgroundColor: withAlpha(TIER_META[tierKey]?.color || SERIES_COLORS[index % SERIES_COLORS.length], 0.18),
      fill: false,
      tension: 0.28
    };
  });

  const title = params.title || `${metric.label} Trend${tier === 'all' ? ' by Menu Ladder' : ` for ${TIER_META[tier]?.label || humanize(tier)}`}`;
  const totalStart = datasets.reduce((sum, dataset) => sum + Number(dataset.data[0] || 0), 0);
  const totalEnd = datasets.reduce((sum, dataset) => sum + Number(dataset.data[dataset.data.length - 1] || 0), 0);
  const direction = totalEnd >= totalStart ? 'up' : 'down';
  const summary = `${metric.label} ended ${direction} ${formatDelta(totalEnd - totalStart, metric.valueFormat)} over the selected ${dates.length}-week window.`;

  return createChartResponse({
    type: 'line',
    title,
    subtitle: 'Source: weekly aggregated pricing foundation',
    sourceLabel: 'data/channel_weekly.csv',
    valueFormat: metric.valueFormat,
    yAxisLabel: metric.axisLabel,
    labels: dates.map(formatWeekLabel),
    datasets,
    summary
  }, 'weekly_trend');
}

async function buildScenarioComparisonChart(params, dataContext) {
  const metric = SCENARIO_METRIC_META[normalizeScenarioMetric(params.metric)] || SCENARIO_METRIC_META.revenue_pct;
  const results = await getScenarioResultsForChart(params, dataContext);

  if (!results.length) {
    throw new Error('No scenario results are available to compare.');
  }

  const values = results.map((result) => Number(result.delta?.[metric.key] || 0));
  const labels = results.map((result) => result.scenario_name || result.scenario_id);
  const title = params.title || `${metric.label} Across Scenarios`;
  const isLowerBetter = metric.key === 'repeat_loss_rate_pct';
  const bestIndex = values.reduce((best, value, index) => {
    if (best === -1) return index;
    return isLowerBetter
      ? (value < values[best] ? index : best)
      : (value > values[best] ? index : best);
  }, -1);
  const summary = `${labels[bestIndex]} has the strongest ${metric.label.toLowerCase()} at ${formatValue(values[bestIndex], metric.valueFormat)}.`;

  return createChartResponse({
    type: 'bar',
    title,
    subtitle: 'Source: saved and active scenario simulations',
    sourceLabel: 'Scenario simulation results',
    valueFormat: metric.valueFormat,
    yAxisLabel: metric.axisLabel,
    labels,
    datasets: [
      {
        label: metric.label,
        data: values,
        backgroundColor: values.map((value) => value >= 0 ? withAlpha('#2563eb', 0.75) : withAlpha('#dc2626', 0.75)),
        borderColor: values.map((value) => value >= 0 ? '#2563eb' : '#dc2626'),
        borderWidth: 1.2
      }
    ],
    summary
  }, 'scenario_comparison', {
    preview: labels.map((label, index) => `${label}: ${formatValue(values[index], metric.valueFormat)}`).slice(0, 6)
  });
}

async function buildSegmentComparisonChart(params) {
  const metric = SEGMENT_METRIC_META[normalizeSegmentMetric(params.metric)] || SEGMENT_METRIC_META.customer_count;
  const tier = normalizeTier(params.tier || 'ad_supported');
  const axis = normalizeAxis(params.group_by || params.axis || 'acquisition');
  const limit = clamp(Number(params.limit || 5), 3, 8);
  const engine = window.segmentEngine;

  if (!engine || !engine.isDataLoaded?.()) {
    throw new Error('Segment data is not loaded yet.');
  }

  const segments = engine.getSegmentsForTier(tier);
  if (!segments.length) {
    throw new Error(`No segment data is available for ${tier}.`);
  }

  const grouped = new Map();
  segments.forEach((segment) => {
    const key = segment[axis];
    if (!key) return;
    const current = grouped.get(key) || {
      key,
      label: engine.formatSegmentLabel(key),
      customers: 0,
      weightedValue: 0,
      weightedElasticity: 0,
      rows: 0
    };

    const customers = Number(segment.customer_count || 0);
    const value = Number(segment[metric.key] || 0);
    const elasticity = Number(engine.getElasticity(tier, segment.compositeKey, axis) || 0);
    current.customers += customers;
    current.weightedValue += value * customers;
    current.weightedElasticity += elasticity * customers;
    current.rows += 1;
    grouped.set(key, current);
  });

  const points = Array.from(grouped.values()).map((group) => {
    let value = 0;
    if (metric.key === 'customer_count') {
      value = group.customers;
    } else if (metric.key === 'elasticity') {
      value = group.customers ? (group.weightedElasticity / group.customers) : 0;
    } else {
      value = group.customers ? (group.weightedValue / group.customers) : 0;
    }

    return {
      label: group.label,
      value
    };
  });

  points.sort((a, b) => b.value - a.value);
  const selected = points.slice(0, limit);
  const title = params.title || `${metric.label} by ${humanize(axis)} (${TIER_META[tier]?.label || humanize(tier)})`;
  const summary = `${selected[0]?.label || 'Top segment'} leads on ${metric.label.toLowerCase()} at ${formatValue(selected[0]?.value || 0, metric.valueFormat)}.`;

  return createChartResponse({
    type: 'bar',
    title,
    subtitle: 'Source: cohort and segment KPI aggregates',
    sourceLabel: 'Segment KPIs and elasticity',
    valueFormat: metric.valueFormat,
    yAxisLabel: metric.axisLabel,
    labels: selected.map((point) => point.label),
    datasets: [
      {
        label: metric.label,
        data: selected.map((point) => point.value),
        backgroundColor: selected.map((_, index) => withAlpha(SERIES_COLORS[index % SERIES_COLORS.length], 0.75)),
        borderColor: selected.map((_, index) => SERIES_COLORS[index % SERIES_COLORS.length]),
        borderWidth: 1.2
      }
    ],
    summary
  }, 'segment_comparison', {
    preview: selected.map((point) => `${point.label}: ${formatValue(point.value, metric.valueFormat)}`)
  });
}

async function buildForecastChart(params, dataContext) {
  const result = await resolveScenarioResult(dataContext, params.scenario_id);
  const metricKey = normalizeForecastMetric(params.metric);
  const metricMeta = metricKey === 'revenue'
    ? { key: 'revenue', label: 'Revenue', valueFormat: 'currency', axisLabel: 'Revenue ($)' }
    : metricKey === 'repeat_loss_rate'
      ? { key: 'repeat_loss_rate', label: 'Repeat Loss Rate', valueFormat: 'percent', axisLabel: 'Repeat Loss Rate' }
      : { key: 'customers', label: 'Customers', valueFormat: 'integer', axisLabel: 'Customers' };

  if (!result?.time_series?.length) {
    throw new Error('No forecast time series is available for the selected scenario.');
  }

  const labels = result.time_series.map((point) => `M${point.month}`);
  const values = result.time_series.map((point) => Number(point[metricMeta.key] || 0));
  const baselineValue = values[0] || 0;
  const summary = `${result.scenario_name || result.scenario_id} reaches ${formatValue(values[values.length - 1], metricMeta.valueFormat)} by month ${result.time_series[result.time_series.length - 1].month}.`;

  return createChartResponse({
    type: 'line',
    title: params.title || `${metricMeta.label} Forecast: ${result.scenario_name || result.scenario_id}`,
    subtitle: 'Source: scenario forecast time series',
    sourceLabel: result.scenario_name || result.scenario_id,
    valueFormat: metricMeta.valueFormat,
    yAxisLabel: metricMeta.axisLabel,
    labels,
    datasets: [
      {
        label: metricMeta.label,
        data: values,
        borderColor: '#2563eb',
        backgroundColor: withAlpha('#2563eb', 0.14),
        fill: true,
        tension: 0.25
      },
      {
        label: 'Baseline',
        data: labels.map(() => baselineValue),
        borderColor: '#94a3b8',
        backgroundColor: 'transparent',
        borderDash: [6, 4],
        fill: false,
        tension: 0
      }
    ],
    summary
  }, 'forecast', {
    preview: [
      `Month 0: ${formatValue(baselineValue, metricMeta.valueFormat)}`,
      `Month ${result.time_series[result.time_series.length - 1].month}: ${formatValue(values[values.length - 1], metricMeta.valueFormat)}`
    ]
  });
}

async function buildDemandCurveChart(params) {
  const elasticityParams = await loadElasticityParams();
  const tier = normalizeTier(params.tier || 'all');
  const rows = await getWeeklyData(tier === 'all' ? 'all' : tier);
  const latestByTier = new Map();

  [...rows].sort((a, b) => String(a.date).localeCompare(String(b.date))).forEach((row) => {
    latestByTier.set(row.tier, row);
  });

  const tiers = tier === 'all' ? ['ad_supported', 'ad_free'] : [tier];
  const datasets = [];
  const labels = [];

  tiers.forEach((tierKey, index) => {
    const baseline = latestByTier.get(tierKey);
    if (!baseline) return;

    const basePrice = Number(baseline.aov || baseline.price || 0);
    const baseCustomers = Number(baseline.active_customers || 0);
    const elasticity = Number(elasticityParams?.tiers?.[tierKey]?.base_elasticity || -1);
    const pricePoints = Array.from({ length: 11 }, (_, step) => roundNumber(basePrice * (0.8 + (step * 0.04)), 2));
    const quantities = pricePoints.map((price) => Math.round(baseCustomers * Math.pow(price / basePrice, elasticity)));

    if (!labels.length) {
      pricePoints.forEach((price) => labels.push(`$${price.toFixed(2)}`));
    }

    datasets.push({
      label: `${TIER_META[tierKey]?.label || humanize(tierKey)} (e=${elasticity.toFixed(2)})`,
      data: quantities,
      borderColor: TIER_META[tierKey]?.color || SERIES_COLORS[index % SERIES_COLORS.length],
      backgroundColor: withAlpha(TIER_META[tierKey]?.color || SERIES_COLORS[index % SERIES_COLORS.length], 0.14),
      fill: false,
      tension: 0.18
    });
  });

  if (!datasets.length) {
    throw new Error('Demand curve data is not available.');
  }

  const title = params.title || `Demand Curve${tier === 'all' ? ' by Menu Ladder' : ` for ${TIER_META[tier]?.label || humanize(tier)}`}`;
  const summary = tier === 'all'
    ? 'The entry and value ladder is steeper, which signals higher price sensitivity than the premium ladder.'
    : `${TIER_META[tier]?.label || humanize(tier)} demand falls as price rises, based on the current elasticity assumption.`;

  return createChartResponse({
    type: 'line',
    title,
    subtitle: 'Source: latest weekly baseline and elasticity assumptions',
    sourceLabel: 'Weekly data plus elasticity parameters',
    valueFormat: 'integer',
    yAxisLabel: 'Demand (customers)',
    labels,
    datasets,
    summary
  }, 'demand_curve');
}

async function getScenarioResultsForChart(params, dataContext) {
  const requestedIds = Array.isArray(params.scenario_ids) ? params.scenario_ids.filter(Boolean) : [];
  if (requestedIds.length) {
    const results = await Promise.all(requestedIds.map((scenarioId) => resolveScenarioResult(dataContext, scenarioId)));
    return results.filter(Boolean);
  }

  const results = [];
  const seen = new Set();
  const pushResult = (result) => {
    if (!result?.scenario_id || seen.has(result.scenario_id)) return;
    seen.add(result.scenario_id);
    results.push(result);
  };

  const savedScenarios = typeof dataContext?.getSavedScenarios === 'function'
    ? dataContext.getSavedScenarios()
    : [];
  savedScenarios.forEach(pushResult);
  pushResult(dataContext?.getCurrentSimulation?.());
  const simulationResults = typeof dataContext?.getAllSimulationResults === 'function'
    ? dataContext.getAllSimulationResults()
    : [];
  simulationResults.forEach(pushResult);

  return results.slice(0, clamp(Number(params.limit || 6), 2, 8));
}

async function resolveScenarioResult(dataContext, scenarioId) {
  if (!scenarioId) {
    return dataContext?.getCurrentSimulation?.() || null;
  }

  if (typeof dataContext?.getScenarioResult === 'function') {
    return dataContext.getScenarioResult(scenarioId);
  }

  const allResults = [
    ...(dataContext?.getSavedScenarios?.() || []),
    ...(dataContext?.getAllSimulationResults?.() || [])
  ];
  return allResults.find((result) => result?.scenario_id === scenarioId) || dataContext?.getCurrentSimulation?.() || null;
}

function createChartResponse(chartSpec, chartKind, extras = {}) {
  return {
    chartSpec,
    summary: chartSpec.summary,
    llmPayload: {
      chart_kind: chartKind,
      chart_title: chartSpec.title,
      source: chartSpec.sourceLabel,
      summary: chartSpec.summary,
      preview: extras.preview || buildPreview(chartSpec)
    }
  };
}

function buildPreview(chartSpec) {
  if (!chartSpec?.labels?.length || !chartSpec?.datasets?.length) return [];
  const dataset = chartSpec.datasets[0];
  return chartSpec.labels.slice(0, 5).map((label, index) => `${label}: ${formatValue(dataset.data[index], chartSpec.valueFormat)}`);
}

function normalizeMetric(value) {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, '_');
}

function normalizeScenarioMetric(value) {
  const normalized = normalizeMetric(value);
  const aliases = {
    revenue: 'revenue_pct',
    customers: 'customers_pct',
    customer_change: 'customers_pct',
    aov: 'aov_pct',
    repeat_loss: 'repeat_loss_rate_pct',
    churn: 'repeat_loss_rate_pct',
    cltv: 'cltv_pct'
  };
  return aliases[normalized] || normalized;
}

function normalizeSegmentMetric(value) {
  const normalized = normalizeMetric(value);
  const aliases = {
    customers: 'customer_count',
    aov: 'avg_order_value',
    churn: 'repeat_loss_rate',
    promo_rate: 'promo_redemption_rate',
    margin: 'margin_rate'
  };
  return aliases[normalized] || normalized;
}

function normalizeForecastMetric(value) {
  const normalized = normalizeMetric(value);
  if (normalized === 'churn') return 'repeat_loss_rate';
  return ['customers', 'revenue', 'repeat_loss_rate'].includes(normalized) ? normalized : 'customers';
}

function normalizeTier(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (['all', 'both'].includes(normalized)) return 'all';
  if (['ad_supported', 'entry', 'value', 'mass'].includes(normalized)) return 'ad_supported';
  if (['ad_free', 'premium', 'core', 'prestige'].includes(normalized)) return 'ad_free';
  return normalized || 'all';
}

function normalizeAxis(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (['acquisition', 'engagement', 'monetization'].includes(normalized)) return normalized;
  return 'acquisition';
}

function formatWeekLabel(dateString) {
  if (!dateString) return '';
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return dateString;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function formatValue(value, valueFormat) {
  const numeric = Number(value || 0);
  switch (valueFormat) {
    case 'currency':
      return `$${Math.round(numeric).toLocaleString()}`;
    case 'percent':
      return `${(numeric * 100).toFixed(1)}%`;
    case 'percentSigned':
      return `${numeric >= 0 ? '+' : ''}${numeric.toFixed(1)}%`;
    case 'integer':
      return Math.round(numeric).toLocaleString();
    case 'integerSigned':
      return `${numeric >= 0 ? '+' : ''}${Math.round(numeric).toLocaleString()}`;
    case 'decimal':
      return numeric.toFixed(2);
    default:
      return numeric.toLocaleString();
  }
}

function formatDelta(delta, valueFormat) {
  const numeric = Number(delta || 0);
  if (valueFormat === 'currency') {
    return `${numeric >= 0 ? '+' : '-'}$${Math.abs(Math.round(numeric)).toLocaleString()}`;
  }
  if (valueFormat === 'percent') {
    return `${numeric >= 0 ? '+' : '-'}${Math.abs(numeric * 100).toFixed(1)} pts`;
  }
  return `${numeric >= 0 ? '+' : '-'}${Math.abs(Math.round(numeric)).toLocaleString()}`;
}

function roundNumber(value, decimals = 2) {
  return Number(Number(value || 0).toFixed(decimals));
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function humanize(value) {
  return String(value || '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (token) => token.toUpperCase());
}

function withAlpha(hexColor, alpha) {
  const hex = String(hexColor || '#2563eb').replace('#', '');
  if (hex.length !== 6) return hexColor;
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
