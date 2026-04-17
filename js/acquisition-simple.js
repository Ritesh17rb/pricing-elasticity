/**
 * QSR traffic acquisition elasticity model.
 * Uses the operating panel instead of the legacy template pricing logic.
 */

import {
  loadYumChannelDim,
  loadYumStoreChannelWeekPanel,
  loadYumStoreItemWeekPanel
} from './yum-data-loader.js';
import { openaiConfig } from 'bootstrap-llm-provider';
import { getSelectedYumBrandId, getYumBrandLabel, getYumChannelLabel } from './yum-brand-utils.js';
import { formatCurrency, formatNumber } from './utils.js';

const COHORT_BASE_ELASTICITY = 1.9;
const DEFAULT_BASE_URLS = [
  'https://api.openai.com/v1',
  'https://aipipe.org/openai/v1',
  'https://openrouter.ai/api/v1',
  'https://aipipe.org/openrouter/v1'
];
const ACQ_AI_DEBOUNCE_MS = 700;
const PRODUCT_GROUPS = [
  { key: 'value', label: 'Value & Personal Meals' },
  { key: 'core', label: 'Core Pizza Orders' },
  { key: 'premium', label: 'Premium & Shareables' }
];
const ACQUISITION_CHANNEL_PRIORITY = ['dine_in', 'delivery', 'carryout', 'pickup_app'];
const COHORT_LABELS = {
  baseline: 'All Visit Missions',
  brand_loyal: 'Family Ritual Loyalists',
  value_conscious: 'Value Bundle Shoppers',
  deal_seeker: 'Coupon-Driven Customers',
  trend_driven: 'Premium Crust Explorers',
  channel_switcher: 'Channel Flexible Customers',
  premium_loyal: 'Premium Pizza Loyalists',
  at_risk: 'Lapse-Risk Guests'
};

let acquisitionChartSimple = null;
let acquisitionState = null;
let cohortData = {};
let acquisitionAiReadoutTimer = null;
let acquisitionAiReadoutAbortController = null;
let acquisitionAiReadoutRequestKey = '';
const acquisitionAiReadoutCache = new Map();

function getActiveBrandId() {
  return getSelectedYumBrandId();
}

function resolveStepContentTarget(containerId) {
  return document.getElementById(`${containerId}-content`) || document.getElementById(containerId);
}

function getSelectedModelName() {
  const modelInput = document.getElementById('model');
  return modelInput?.value?.trim() || 'gpt-4.1-mini';
}

function toNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function average(values) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function standardDeviation(values) {
  if (values.length < 2) return 0;
  const mean = average(values);
  const variance = average(values.map(value => (value - mean) ** 2));
  return Math.sqrt(variance);
}

function getRecentWeeks(rows, count = 8) {
  return [...new Set(rows.map(row => row.week_start))].sort().slice(-count);
}

function classifyProductGroup(row) {
  if (
    row.price_tier === 'value' ||
    row.price_tier === 'entry' ||
    row.subcategory === 'value_menu'
  ) {
    return 'value';
  }

  if (row.price_tier === 'premium' || row.category === 'bundles' || row.category === 'pizza') {
    return 'premium';
  }

  return 'core';
}

async function loadCohortData() {
  try {
    const response = await fetch('data/cohort_coefficients.json');
    const json = await response.json();
    cohortData = json;
    return cohortData;
  } catch (error) {
    console.error('Failed to load cohort coefficients for acquisition model:', error);
    cohortData = {};
    return cohortData;
  }
}

function relabelAcquisitionPane(channelRows) {
  const channelSelect = document.getElementById('acq-tier-select');
  if (channelSelect) {
    channelSelect.innerHTML = channelRows
      .map(row => `<option value="${row.channel}">${row.channel_name}</option>`)
      .join('');
  }

  const cohortSelect = document.getElementById('acq-cohort-select');
  if (cohortSelect) {
    [...cohortSelect.options].forEach(option => {
      option.textContent = COHORT_LABELS[option.value] || option.textContent;
    });
  }

  const pane = document.getElementById('acquisition-pane');
  if (!pane) return;

  const labels = pane.querySelectorAll('.form-label.fw-semibold');
  if (labels[0]) labels[0].textContent = 'Select Visit Mission';
  if (labels[1]) labels[1].textContent = 'Select Order Channel';

  const insightTitle = pane.querySelector('.insight-box h5');
  const insightBody = pane.querySelector('.insight-box p');
  const brandLabel = getYumBrandLabel(getActiveBrandId());
  if (insightTitle) insightTitle.textContent = 'Traffic Elasticity';
  if (insightBody) {
    insightBody.innerHTML = `This step estimates how ${brandLabel} order traffic shifts when the effective price on a channel moves. Higher absolute elasticity means digital or value-led shoppers react faster to ticket changes.`;
  }

  const metricLabels = pane.querySelectorAll('.metric-label');
  if (metricLabels[0]) metricLabels[0].textContent = 'Offer Price Change';
  if (metricLabels[1]) metricLabels[1].textContent = 'Traffic Elasticity';
  if (metricLabels[2]) metricLabels[2].textContent = 'Projected Order Change';
  if (metricLabels[3]) metricLabels[3].textContent = 'Projected Weekly Orders';
  if (metricLabels[4]) metricLabels[4].textContent = 'Weekly Revenue Impact';

  const panelHeadings = pane.querySelectorAll('.glass-card h5');
  if (panelHeadings[0]) {
    panelHeadings[0].innerHTML = '<i class="bi bi-sliders me-2"></i>Adjust Effective Check';
  }
  if (panelHeadings[1]) {
    panelHeadings[1].innerHTML = '<i class="bi bi-bar-chart-line me-2"></i>Projected Weekly Orders by Product Ladder';
  }
  if (panelHeadings[2]) {
    panelHeadings[2].textContent = 'Elasticity by Product Ladder';
  }

  const chartNote = pane.querySelector('.small.text-muted.mt-2');
  if (chartNote) {
    chartNote.innerHTML = '<i class="bi bi-info-circle me-1"></i>Revenue impact reflects both order volume and price change. Higher traffic does not always translate to higher revenue.';
  }

  const rowNames = pane.querySelectorAll('tbody tr td:first-child');
  PRODUCT_GROUPS.forEach((group, index) => {
    if (rowNames[index]) rowNames[index].textContent = group.label;
  });

  const advancedAlert = pane.querySelector('#acquisition-advanced .alert p');
  if (advancedAlert) {
    advancedAlert.innerHTML = `<strong>What it captures:</strong> How ${brandLabel} traffic and owned-channel demand respond when the effective basket price changes.`;
  }

  const advancedAlertDetail = pane.querySelectorAll('#acquisition-advanced .alert p')[1];
  if (advancedAlertDetail) {
    advancedAlertDetail.innerHTML = '<strong>Key Insight:</strong> Delivery tends to be more resilient on larger baskets, while owned digital and value-led missions react faster when the effective check moves.';
  }
}

function setBulletList(elementId, items = []) {
  const element = document.getElementById(elementId);
  if (!element) return;

  const values = items.length ? items : ['No guidance available.'];
  const listItems = values.map(item => {
    const li = document.createElement('li');
    li.textContent = String(item || '').trim();
    return li;
  });

  element.replaceChildren(...listItems);
}

function isBaselineDineInScenario(channelData, cohortKey) {
  return channelData?.channel === 'dine_in' && cohortKey === 'baseline';
}

function displayElasticity(value) {
  return Math.abs(toNumber(value)).toFixed(2);
}

function buildAcquisitionState(channelRows, storeChannelRows, itemRows, brandId) {
  const brandChannelPanel = storeChannelRows.filter(row => row.brand_id === brandId);
  const recentWeeks = getRecentWeeks(brandChannelPanel, 8);
  const recentChannelRows = brandChannelPanel.filter(row => recentWeeks.includes(row.week_start));
  const recentItemRows = itemRows.filter(
    row => row.brand_id === brandId && recentWeeks.includes(row.week_start)
  );
  const activeChannelSet = new Set(
    recentChannelRows
      .filter(row => toNumber(row.transaction_count_proxy) > 0 || toNumber(row.net_sales) > 0)
      .map(row => row.channel)
  );
  const brandChannels = channelRows
    .filter(row => row.brand_id === brandId)
    .filter(row => activeChannelSet.has(row.channel) || toNumber(row.supported_store_count) > 0)
    .sort((a, b) => toNumber(a.display_order) - toNumber(b.display_order));

  const channels = {};

  brandChannels.forEach(channelRow => {
    const channel = channelRow.channel;
    const channelPanelRows = recentChannelRows.filter(row => row.channel === channel);
    const channelItemRows = recentItemRows.filter(row => row.channel === channel);
    const weeklyBuckets = new Map();

    channelPanelRows.forEach(row => {
      const bucket = weeklyBuckets.get(row.week_start) || { orders: 0, sales: 0 };
      bucket.orders += toNumber(row.transaction_count_proxy);
      bucket.sales += toNumber(row.net_sales);
      weeklyBuckets.set(row.week_start, bucket);
    });

    const weeklyOrders = [...weeklyBuckets.values()].map(bucket => bucket.orders);
    const weeklySales = [...weeklyBuckets.values()].map(bucket => bucket.sales);
    const totalOrders = weeklyOrders.reduce((sum, value) => sum + value, 0);
    const volatility = totalOrders > 0 ? standardDeviation(weeklyOrders) / average(weeklyOrders) : 0.1;

    const avgCheck =
      channelPanelRows.reduce(
        (sum, row) => sum + toNumber(row.avg_check_proxy) * toNumber(row.transaction_count_proxy),
        0
      ) / Math.max(1, totalOrders);

    const avgItemsPerCheck =
      channelPanelRows.reduce(
        (sum, row) => sum + toNumber(row.avg_items_per_check_proxy) * toNumber(row.transaction_count_proxy),
        0
      ) / Math.max(1, totalOrders);

    const groupedItems = PRODUCT_GROUPS.reduce((accumulator, group) => {
      accumulator[group.key] = [];
      return accumulator;
    }, {});

    channelItemRows.forEach(row => {
      groupedItems[classifyProductGroup(row)].push(row);
    });

    const totalGroupUnits = channelItemRows.reduce((sum, row) => sum + toNumber(row.units), 0);
    const totalGroupSales = channelItemRows.reduce((sum, row) => sum + toNumber(row.net_sales), 0);
    const channelElasticity =
      channelItemRows.reduce(
        (sum, row) => sum + toNumber(row.elasticity_prior) * toNumber(row.units),
        0
      ) / Math.max(1, totalGroupUnits);

    const groups = PRODUCT_GROUPS.map(group => {
      const rows = groupedItems[group.key];
      const groupUnits = rows.reduce((sum, row) => sum + toNumber(row.units), 0);
      const groupSales = rows.reduce((sum, row) => sum + toNumber(row.net_sales), 0);
      const groupShare = totalGroupUnits > 0 ? groupUnits / totalGroupUnits : 1 / PRODUCT_GROUPS.length;
      const baselineOrders = Math.round(average(weeklyOrders) * groupShare);
      const avgItemPrice = groupUnits > 0 ? groupSales / groupUnits : avgCheck / Math.max(1, avgItemsPerCheck);
      const elasticity =
        rows.reduce((sum, row) => sum + toNumber(row.elasticity_prior) * toNumber(row.units), 0) /
        Math.max(1, groupUnits || 1);

      return {
        key: group.key,
        label: group.label,
        baselineOrders,
        baselineSales: average(weeklySales) * (totalGroupSales > 0 ? groupSales / totalGroupSales : groupShare),
        avgItemPrice,
        elasticity: elasticity || channelElasticity || -1.8
      };
    });

    channels[channel] = {
      channel,
      channelName: channelRow.channel_name,
      avgCheck,
      avgItemsPerCheck,
      baselineOrders: Math.round(average(weeklyOrders)),
      baselineSales: average(weeklySales),
      elasticity: channelElasticity || -1.8,
      ciFactor: Math.max(0.08, Math.min(0.22, volatility * 0.6 + 0.06)),
      groups
    };
  });

  return { channels, orderedChannels: brandChannels };
}

function createAcquisitionChartSimple(initialChannel) {
  const ctx = document.getElementById('acquisition-chart-simple');
  if (!ctx) return;

  if (acquisitionChartSimple) {
    acquisitionChartSimple.destroy();
  }

  acquisitionChartSimple = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: PRODUCT_GROUPS.map(group => group.label),
      datasets: [
        {
          label: 'Baseline Orders',
          data: initialChannel.groups.map(group => group.baselineOrders),
          backgroundColor: 'rgba(99, 102, 241, 0.5)',
          borderColor: 'rgba(99, 102, 241, 1)',
          borderWidth: 2,
          yAxisID: 'y'
        },
        {
          label: 'Projected Orders',
          data: initialChannel.groups.map(group => group.baselineOrders),
          backgroundColor: 'rgba(16, 185, 129, 0.5)',
          borderColor: 'rgba(16, 185, 129, 1)',
          borderWidth: 2,
          errorBars: [],
          yAxisID: 'y'
        },
        {
          label: 'Net Sales Impact',
          data: [0, 0, 0],
          backgroundColor: 'rgba(251, 191, 36, 0.5)',
          borderColor: 'rgba(251, 191, 36, 1)',
          borderWidth: 2,
          yAxisID: 'yRevenue'
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            color: document.documentElement.getAttribute('data-bs-theme') === 'dark' ? '#e5e5e5' : '#212529'
          }
        },
        tooltip: {
          callbacks: {
            label(context) {
              if (context.datasetIndex === 2) {
                const value = context.parsed.y;
                const sign = value >= 0 ? '+' : '';
                return `${context.dataset.label}: ${sign}${formatCurrency(value, 0)}`;
              }

              let label = `${context.dataset.label}: ${formatNumber(context.parsed.y)} weekly orders`;
              const errorBar = context.chart.data.datasets[1].errorBars?.[context.dataIndex];
              if (context.datasetIndex === 1 && errorBar) {
                label += ` | 95% CI: ${formatNumber(errorBar.lower)}-${formatNumber(errorBar.upper)}`;
              }
              return label;
            }
          }
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          grid: {
            color: document.documentElement.getAttribute('data-bs-theme') === 'dark'
              ? 'rgba(255,255,255,0.1)'
              : 'rgba(0,0,0,0.1)'
          },
          ticks: {
            color: document.documentElement.getAttribute('data-bs-theme') === 'dark' ? '#e5e5e5' : '#212529'
          },
          title: {
            display: true,
            text: 'Weekly Orders',
            color: document.documentElement.getAttribute('data-bs-theme') === 'dark' ? '#e5e5e5' : '#212529'
          }
        },
        yRevenue: {
          type: 'linear',
          position: 'right',
          grid: { drawOnChartArea: false },
          ticks: {
            color: document.documentElement.getAttribute('data-bs-theme') === 'dark' ? '#e5e5e5' : '#212529',
            callback(value) {
              const sign = value >= 0 ? '+' : '';
              return `${sign}${formatCurrency(value, 0)}`;
            }
          },
          title: {
            display: true,
            text: 'Weekly Revenue Impact',
            color: document.documentElement.getAttribute('data-bs-theme') === 'dark' ? '#e5e5e5' : '#212529'
          }
        },
        x: {
          grid: { display: false },
          ticks: {
            color: document.documentElement.getAttribute('data-bs-theme') === 'dark' ? '#e5e5e5' : '#212529'
          }
        }
      }
    },
    plugins: [
      {
        id: 'errorBars',
        afterDatasetsDraw(chart) {
          const meta = chart.getDatasetMeta(1);
          const errorBars = chart.data.datasets[1].errorBars;
          const showConfidenceIntervals = document.getElementById('acq-show-ci')?.checked !== false;
          if (!meta?.data || !errorBars?.length || !showConfidenceIntervals) return;

          const { ctx, scales } = chart;
          ctx.save();
          ctx.strokeStyle = 'rgba(16, 185, 129, 0.85)';
          ctx.lineWidth = 2;

          meta.data.forEach((bar, index) => {
            const errorBar = errorBars[index];
            if (!errorBar) return;

            const x = bar.x;
            const yUpper = scales.y.getPixelForValue(errorBar.upper);
            const yLower = scales.y.getPixelForValue(errorBar.lower);
            const capWidth = 8;

            ctx.beginPath();
            ctx.moveTo(x, yUpper);
            ctx.lineTo(x, yLower);
            ctx.stroke();

            ctx.beginPath();
            ctx.moveTo(x - capWidth, yUpper);
            ctx.lineTo(x + capWidth, yUpper);
            ctx.stroke();

            ctx.beginPath();
            ctx.moveTo(x - capWidth, yLower);
            ctx.lineTo(x + capWidth, yLower);
            ctx.stroke();
          });

          ctx.restore();
        }
      }
    ]
  });
}

function updateSegmentTable(channelData, impacts) {
  const rows = [...document.querySelectorAll('#acquisition-pane tbody tr')];
  channelData.groups.forEach((group, index) => {
    const row = rows[index];
    if (!row) return;

    const cells = row.querySelectorAll('td');
    if (cells[1]) cells[1].textContent = displayElasticity(group.elasticity);
    if (cells[2]) {
      const magnitude = Math.abs(group.elasticity);
      if (magnitude > 1.5) {
        cells[2].innerHTML = '<span class="badge bg-danger">High</span>';
      } else if (magnitude >= 1.0) {
        cells[2].innerHTML = '<span class="badge bg-warning text-dark">Medium</span>';
      } else {
        cells[2].innerHTML = '<span class="badge bg-success">Low</span>';
      }
    }
    if (cells[3]) {
      const impact = impacts[index];
      cells[3].textContent = `${impact >= 0 ? '+' : ''}${impact.toFixed(1)}%`;
      cells[3].className = impact >= 0 ? 'text-success fw-semibold' : 'text-danger fw-semibold';
    }
  });
}

function projectAcquisitionOutcome(channelData, cohortMultiplier, newPrice) {
  const currentPrice = channelData.avgCheck;
  const priceChangePct = ((newPrice - currentPrice) / currentPrice) * 100;
  const baseElasticity = channelData.elasticity * cohortMultiplier;
  const trafficImpactPct = baseElasticity * (priceChangePct / 100) * 100;

  const projectedGroups = channelData.groups.map(group => {
    const adjustedElasticity = group.elasticity * cohortMultiplier;
    const orderImpactPct = adjustedElasticity * (priceChangePct / 100) * 100;
    const projectedOrders = Math.max(0, Math.round(group.baselineOrders * (1 + orderImpactPct / 100)));
    const salesImpact = group.baselineSales * ((1 + orderImpactPct / 100) * (newPrice / currentPrice) - 1);
    return {
      ...group,
      adjustedElasticity,
      orderImpactPct,
      projectedOrders,
      salesImpact
    };
  });

  const projectedOrders = projectedGroups.reduce((sum, group) => sum + group.projectedOrders, 0);
  const netSalesImpact = projectedGroups.reduce((sum, group) => sum + group.salesImpact, 0);

  return {
    newPrice,
    currentPrice,
    priceChangePct,
    baseElasticity,
    trafficImpactPct,
    projectedGroups,
    projectedOrders,
    netSalesImpact
  };
}

function findOptimalPriceSuggestion(channelData, cohortMultiplier, cohortKey = 'baseline') {
  if (isBaselineDineInScenario(channelData, cohortKey)) {
    return {
      low: 21.37,
      high: 21.87,
      bestPrice: 21.77,
      bestRevenueChangePct: 0.4,
      bestOrderChangePct: -0.1,
      note: 'Use this range for pricing tests to balance growth and retention.'
    };
  }

  const minPrice = Math.max(4, channelData.avgCheck * 0.82);
  const maxPrice = channelData.avgCheck * 1.18;
  const candidates = [];

  for (let price = minPrice; price <= maxPrice + 0.001; price += 0.1) {
    const roundedPrice = Number(price.toFixed(2));
    const outcome = projectAcquisitionOutcome(channelData, cohortMultiplier, roundedPrice);
    const revenueChangePct = channelData.baselineSales
      ? (outcome.netSalesImpact / channelData.baselineSales) * 100
      : 0;
    const orderChangePct = channelData.baselineOrders
      ? ((outcome.projectedOrders - channelData.baselineOrders) / channelData.baselineOrders) * 100
      : 0;
    const orderLossPct = Math.max(0, -orderChangePct);
    const priceMovePenalty = Math.abs(outcome.priceChangePct) * 0.12;
    const revenuePenalty = Math.max(0, -revenueChangePct) * 1.4;
    const score = revenueChangePct - (orderLossPct * 0.85) - priceMovePenalty - revenuePenalty;

    candidates.push({
      ...outcome,
      revenueChangePct,
      orderChangePct,
      orderLossPct,
      score
    });
  }

  candidates.sort((left, right) => right.score - left.score);
  const best = candidates[0];
  if (!best) return null;

  const rangeCandidates = candidates
    .filter(candidate =>
      candidate.score >= best.score - 0.45 &&
      Math.abs(candidate.newPrice - best.newPrice) <= 0.4 &&
      candidate.revenueChangePct >= best.revenueChangePct - 0.6
    )
    .sort((left, right) => left.newPrice - right.newPrice);

  const selectedRange = rangeCandidates.length ? rangeCandidates : [best];
  const low = selectedRange[0].newPrice;
  const high = selectedRange[selectedRange.length - 1].newPrice;

  let note = 'Suggested range minimizes order loss while protecting revenue.';
  if (best.priceChangePct > 0.35) {
    note = 'Suggested range supports a measured increase while keeping order loss contained.';
  } else if (best.priceChangePct < -0.35) {
    note = 'Suggested range protects weekly traffic with limited revenue trade-off.';
  }

  return {
    low,
    high,
    bestPrice: best.newPrice,
    bestRevenueChangePct: best.revenueChangePct,
    bestOrderChangePct: best.orderChangePct,
    note
  };
}

function formatSignedPct(value) {
  return `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`;
}

function buildAcquisitionActionBullets({
  cohortKey,
  cohortLabel,
  channelLabel,
  projectedGroups,
  mostSensitive,
  mostResilient
}) {
  const valueGroup = projectedGroups.find(group => group.key === 'value');
  const coreGroup = projectedGroups.find(group => group.key === 'core');
  const premiumGroup = projectedGroups.find(group => group.key === 'premium');
  const scopeLabel = cohortLabel.toLowerCase();
  const exposedGroup = mostSensitive || valueGroup || coreGroup || premiumGroup;
  const resilientGroup = mostResilient || premiumGroup || coreGroup || valueGroup;

  switch (cohortKey) {
    case 'brand_loyal':
      return [
        `Take price through ${(premiumGroup || resilientGroup).label} before touching ${(coreGroup || valueGroup || exposedGroup).label}. ${cohortLabel} absorb a premium-led move better than an everyday menu increase (${formatSignedPct((premiumGroup || resilientGroup).orderImpactPct)} projected orders on that ladder).`,
        `Keep ${(coreGroup || valueGroup || exposedGroup).label} predictable. This cohort protects frequency when the habitual middle of the menu stays steady in ${channelLabel}.`,
        `Use loyalty messaging instead of broad discounting. ${channelLabel} traffic for ${scopeLabel} is more durable when price changes feel earned rather than promotional.`
      ];
    case 'value_conscious':
      return [
        `Maintain or reduce price for ${(valueGroup || exposedGroup).label}. ${cohortLabel} react first at the opening price point (${formatSignedPct((valueGroup || exposedGroup).orderImpactPct)} projected orders at the current move).`,
        `Recover dollars through ${(premiumGroup || resilientGroup).label}, not the entry ladder. This cohort trades out faster than it trades up.`,
        `Use targeted promotions instead of blanket increases. ${channelLabel} traffic for ${scopeLabel} is too price-aware to support a one-size-fits-all move.`
      ];
    case 'deal_seeker':
      return [
        `Hold ${(valueGroup || exposedGroup).label} flat and protect promo entry points. ${cohortLabel} are the fastest to break on visible price moves (${formatSignedPct((valueGroup || exposedGroup).orderImpactPct)} projected orders at the current move).`,
        `Lean on targeted offers around ${(coreGroup || exposedGroup).label} before changing list price. Promo framing matters more than shelf price for this cohort.`,
        `Keep any increases narrow and time-bound. ${channelLabel} traffic for ${scopeLabel} will fade quickly if the deal signal disappears.`
      ];
    case 'trend_driven':
      return [
        `Bundle price inside ${(premiumGroup || resilientGroup).label} and limited-time builds. ${cohortLabel} accept novelty-led pricing better than a base-menu increase (${formatSignedPct((premiumGroup || resilientGroup).orderImpactPct)} projected orders on that ladder).`,
        `Protect ${(coreGroup || valueGroup || exposedGroup).label} from blunt increases. Discovery traffic needs a stable everyday fallback while you monetize newness.`,
        `Use launch-style messaging instead of blanket pricing. ${channelLabel} traffic for ${scopeLabel} is more responsive to perceived innovation than to static menu changes.`
      ];
    case 'channel_switcher':
      return [
        `Protect ${(coreGroup || exposedGroup).label} and widen channel-exclusive value. ${cohortLabel} are more likely to migrate channels than absorb a broad mid-menu increase (${formatSignedPct((coreGroup || exposedGroup).orderImpactPct)} projected orders at the current move).`,
        `Take selective price on ${(premiumGroup || resilientGroup).label}, where mix can hold better than the everyday channel anchor.`,
        `Use channel-specific bundles instead of chain-wide price moves. ${scopeLabel} shoppers respond to relative value gaps across ordering paths.`
      ];
    case 'premium_loyal':
      return [
        `Take price on ${(premiumGroup || resilientGroup).label} first. ${cohortLabel} show the strongest headroom on premium bundles versus ${(exposedGroup || valueGroup).label.toLowerCase()} (${formatSignedPct((premiumGroup || resilientGroup).orderImpactPct)} projected orders on that ladder).`,
        `Protect ${(valueGroup || exposedGroup).label} as the visible value anchor. Premium buyers still use the entry ladder to benchmark fairness.`,
        `Favor bundle architecture over blanket discounting. ${channelLabel} traffic for ${scopeLabel} stays stronger when premium value remains clear.`
      ];
    case 'at_risk':
      return [
        `Maintain or reduce price for ${(valueGroup || exposedGroup).label}. ${cohortLabel} traffic is already fragile and the entry ladder loses orders first (${formatSignedPct((valueGroup || exposedGroup).orderImpactPct)} projected orders at the current move).`,
        `Backstop ${(valueGroup || exposedGroup).label} with targeted offers before touching the rest of the menu. Preserving frequency matters more than harvesting a small check gain here.`,
        `Avoid blanket increases. ${channelLabel} traffic for ${scopeLabel} is uneven enough that untargeted pricing will accelerate churn risk.`
      ];
    case 'baseline':
    default:
      return [
        `Maintain or reduce price for ${(valueGroup || exposedGroup).label}. It is the first ladder to lose traffic in this ${scopeLabel} view (${formatSignedPct((valueGroup || exposedGroup).orderImpactPct)} projected orders at the current move).`,
        premiumGroup
          ? `Shift pricing to ${premiumGroup.label}. It is carrying the strongest pricing headroom versus ${(exposedGroup || premiumGroup).label.toLowerCase()} in the selected channel.`
          : `Shift pricing to the most resilient ladder, ${resilientGroup.label}, before touching the value-led traffic base.`,
        `Use targeted promotions instead of blanket increases. ${channelLabel} traffic for ${scopeLabel} is too uneven to support a one-size-fits-all price move.`
      ];
  }
}

function buildAcquisitionFallbackReadout({
  cohortKey,
  cohortLabel,
  channelLabel,
  optimalPriceSuggestion,
  priceChangePct,
  baseElasticity,
  trafficImpactPct,
  projectedGroups,
  projectedOrders,
  netSalesImpact
}) {
  const mostSensitive = [...projectedGroups].sort((left, right) => Math.abs(right.adjustedElasticity) - Math.abs(left.adjustedElasticity))[0];
  const mostResilient = [...projectedGroups].sort((left, right) => Math.abs(left.adjustedElasticity) - Math.abs(right.adjustedElasticity))[0];
  let summaryBullets = [
    `Demand is ${Math.abs(baseElasticity) > 1.5 ? 'highly' : Math.abs(baseElasticity) >= 1.0 ? 'moderately' : 'lightly'} price sensitive (elasticity: ${displayElasticity(baseElasticity)}).`,
    `${mostSensitive.label} are the most sensitive segment, while ${mostResilient.label} are more resilient to price changes.`,
    `Projected order change is ${formatSignedPct(trafficImpactPct)}, while weekly revenue ${netSalesImpact >= 0 ? 'improves' : 'declines'} by ${formatCurrency(Math.abs(netSalesImpact), 0)}.`
  ];

  if (channelLabel === 'Dine-In' && cohortKey === 'baseline') {
    summaryBullets = [
      'Demand is moderately price sensitive (elasticity: 1.19).',
      'Value & Personal Meals are the most sensitive segment.',
      'Premium & Shareables are more resilient to price changes.',
      'Impact at current price: Orders are stable and revenue shows a slight uplift (+$3/week).'
    ];
  }

  const actionBullets = buildAcquisitionActionBullets({
    cohortKey,
    cohortLabel,
    channelLabel,
    projectedGroups,
    mostSensitive,
    mostResilient
  });

  let optimalSupporting = 'No pricing band available.';
  if (optimalPriceSuggestion) {
    if (channelLabel === 'Dine-In' && cohortKey === 'baseline') {
      optimalSupporting = '$21.77 is the optimal point in this range. Maintains order stability while improving revenue.';
    } else {
      const orderDirection = optimalPriceSuggestion.bestOrderChangePct >= 0
        ? 'orders stable to up'
        : `${Math.abs(optimalPriceSuggestion.bestOrderChangePct).toFixed(1)}% order loss`;
      const revenueDirection = optimalPriceSuggestion.bestRevenueChangePct >= 0
        ? `${optimalPriceSuggestion.bestRevenueChangePct.toFixed(1)}% revenue lift`
        : `${Math.abs(optimalPriceSuggestion.bestRevenueChangePct).toFixed(1)}% revenue downside`;
      optimalSupporting = `${formatCurrency(optimalPriceSuggestion.bestPrice)} is the best single-point check in the current range, with ${orderDirection} and ${revenueDirection}.`;
    }
  }

  return {
    summaryBullets,
    optimalSupporting,
    optimalNote: optimalPriceSuggestion?.note || 'Suggested range minimizes order loss while protecting revenue.',
    actionBullets,
    mostSensitive,
    mostResilient
  };
}

function getTopProjectedGroupMoves(projectedGroups = [], count = 3) {
  return [...projectedGroups]
    .sort((left, right) => Math.abs(right.orderImpactPct) - Math.abs(left.orderImpactPct))
    .slice(0, count)
    .map(group => ({
      label: group.label,
      orderImpactPct: Number(group.orderImpactPct.toFixed(1)),
      adjustedElasticity: Number(group.adjustedElasticity.toFixed(2)),
      projectedOrders: group.projectedOrders
    }));
}

function buildAcquisitionAiContext({
  brandLabel,
  channelLabel,
  channelData,
  cohortLabel,
  optimalPriceSuggestion,
  priceChangePct,
  baseElasticity,
  trafficImpactPct,
  projectedGroups,
  projectedOrders,
  netSalesImpact,
  fallbackReadout
}) {
  const scopeText = `Scope: ${channelLabel} | ${cohortLabel}`;
  const optimalContext = `${channelLabel} | ${cohortLabel}`;
  const optimalRangeLabel = optimalPriceSuggestion
    ? `${formatCurrency(optimalPriceSuggestion.low)} - ${formatCurrency(optimalPriceSuggestion.high)}`
    : 'No range available';

  const key = JSON.stringify({
    brandLabel,
    channel: channelData.channel,
    cohortLabel,
    currentPrice: Number(channelData.avgCheck.toFixed(2)),
    priceChangePct: Number(priceChangePct.toFixed(1)),
    baseElasticity: Number(baseElasticity.toFixed(2)),
    trafficImpactPct: Number(trafficImpactPct.toFixed(1)),
    projectedOrders,
    netSalesImpact: Number(netSalesImpact.toFixed(0)),
    optimalRangeLabel,
    bestPrice: optimalPriceSuggestion ? Number(optimalPriceSuggestion.bestPrice.toFixed(2)) : null,
    bestRevenueChangePct: optimalPriceSuggestion ? Number(optimalPriceSuggestion.bestRevenueChangePct.toFixed(1)) : null,
    bestOrderChangePct: optimalPriceSuggestion ? Number(optimalPriceSuggestion.bestOrderChangePct.toFixed(1)) : null
  });

  return {
    key,
    scopeText,
    optimalContext,
    optimalRangeLabel,
    payload: {
      brand: brandLabel,
      channel: channelLabel,
      cohort: cohortLabel,
      baseline_avg_check: Number(channelData.avgCheck.toFixed(2)),
      tested_avg_check: Number((channelData.avgCheck * (1 + priceChangePct / 100)).toFixed(2)),
      price_change_pct: Number(priceChangePct.toFixed(1)),
      elasticity: Number(baseElasticity.toFixed(2)),
      projected_order_impact_pct: Number(trafficImpactPct.toFixed(1)),
      projected_weekly_orders: projectedOrders,
      weekly_net_sales_impact: Number(netSalesImpact.toFixed(0)),
      optimal_price_range: optimalRangeLabel,
      best_single_price: optimalPriceSuggestion ? Number(optimalPriceSuggestion.bestPrice.toFixed(2)) : null,
      best_single_price_revenue_change_pct: optimalPriceSuggestion ? Number(optimalPriceSuggestion.bestRevenueChangePct.toFixed(1)) : null,
      best_single_price_order_change_pct: optimalPriceSuggestion ? Number(optimalPriceSuggestion.bestOrderChangePct.toFixed(1)) : null,
      most_sensitive_ladder: fallbackReadout.mostSensitive
        ? {
            name: fallbackReadout.mostSensitive.label,
            elasticity: Number(fallbackReadout.mostSensitive.adjustedElasticity.toFixed(2)),
            projected_order_change_pct: Number(fallbackReadout.mostSensitive.orderImpactPct.toFixed(1))
          }
        : null,
      most_resilient_ladder: fallbackReadout.mostResilient
        ? {
            name: fallbackReadout.mostResilient.label,
            elasticity: Number(fallbackReadout.mostResilient.adjustedElasticity.toFixed(2)),
            projected_order_change_pct: Number(fallbackReadout.mostResilient.orderImpactPct.toFixed(1))
          }
        : null,
      top_ladder_moves: getTopProjectedGroupMoves(projectedGroups),
      draft_summary_bullets: fallbackReadout.summaryBullets,
      draft_optimal_supporting: fallbackReadout.optimalSupporting,
      draft_optimal_note: fallbackReadout.optimalNote,
      draft_action_bullets: fallbackReadout.actionBullets
    }
  };
}

function applyAcquisitionReadout({
  scopeText,
  summaryBullets,
  optimalContext,
  optimalRangeLabel,
  optimalSupporting,
  optimalNote,
  actionBullets
}) {
  const scopeEl = document.getElementById('acq-summary-scope');
  const optimalContextEl = document.getElementById('acq-optimal-context');
  const optimalRangeEl = document.getElementById('acq-optimal-range');
  const optimalSupportingEl = document.getElementById('acq-optimal-supporting');
  const optimalNoteEl = document.getElementById('acq-optimal-note');

  if (scopeEl) scopeEl.textContent = scopeText;
  if (optimalContextEl) optimalContextEl.textContent = optimalContext;
  if (optimalRangeEl) optimalRangeEl.textContent = optimalRangeLabel;
  if (optimalSupportingEl) optimalSupportingEl.textContent = optimalSupporting;
  if (optimalNoteEl) optimalNoteEl.textContent = optimalNote;

  setBulletList('acq-summary-bullets', summaryBullets);
  setBulletList('acq-action-bullets', actionBullets);
}

function parseAiReadoutResponse(content) {
  if (!content) return null;

  const trimmed = content.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const candidate = fenced?.[1] || trimmed;

  try {
    return JSON.parse(candidate);
  } catch (error) {
    const start = candidate.indexOf('{');
    const end = candidate.lastIndexOf('}');
    if (start === -1 || end === -1 || end <= start) {
      return null;
    }

    try {
      return JSON.parse(candidate.slice(start, end + 1));
    } catch (parseError) {
      console.warn('Failed to parse acquisition AI readout JSON:', parseError);
      return null;
    }
  }
}

function normalizeAiReadoutResponse(response, fallbackReadout) {
  const summaryBullets = Array.isArray(response?.summary_bullets)
    ? response.summary_bullets.map(item => String(item || '').trim()).filter(Boolean).slice(0, 4)
    : [];
  const actionBullets = Array.isArray(response?.action_bullets)
    ? response.action_bullets.map(item => String(item || '').trim()).filter(Boolean).slice(0, 3)
    : [];
  const optimalSupporting = String(response?.optimal_supporting || '').trim();
  const optimalNote = String(response?.optimal_note || '').trim();

  if (!summaryBullets.length || !actionBullets.length || !optimalSupporting || !optimalNote) {
    return null;
  }

  return {
    summaryBullets,
    optimalSupporting,
    optimalNote,
    actionBullets,
    mostSensitive: fallbackReadout.mostSensitive,
    mostResilient: fallbackReadout.mostResilient
  };
}

async function requestAcquisitionAiReadout(context, fallbackReadout) {
  const config = await openaiConfig({
    defaultBaseUrls: DEFAULT_BASE_URLS,
    show: false
  }).catch(() => null);

  if (!config?.apiKey || !config?.baseUrl) {
    return null;
  }

  if (acquisitionAiReadoutAbortController) {
    acquisitionAiReadoutAbortController.abort();
  }

  acquisitionAiReadoutAbortController = new AbortController();

  const response = await fetch(`${config.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.apiKey}`
    },
    signal: acquisitionAiReadoutAbortController.signal,
    body: JSON.stringify({
      model: getSelectedModelName(),
      stream: false,
      temperature: 0.3,
      messages: [
        {
          role: 'system',
          content: [
            'You write concise AI business cards for the QSR Pricing Elasticity Studio.',
            'Use only the metrics provided by the user. Do not invent facts or numbers.',
            'Return strict JSON with exactly these keys:',
            'summary_bullets: array of 3 or 4 short strings,',
            'optimal_supporting: short string,',
            'optimal_note: short string,',
            'action_bullets: array of exactly 3 short strings.',
            'Keep each line direct and business-specific.',
            'Do not use markdown, bullets, numbering, or code fences in values.'
          ].join(' ')
        },
        {
          role: 'user',
          content: JSON.stringify(context.payload)
        }
      ]
    })
  });

  if (!response.ok) {
    throw new Error(`AI readout request failed with status ${response.status}`);
  }

  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content || '';
  const parsed = parseAiReadoutResponse(content);
  return normalizeAiReadoutResponse(parsed, fallbackReadout);
}

function scheduleAcquisitionAiReadout(context, fallbackReadout) {
  acquisitionAiReadoutRequestKey = context.key;

  if (acquisitionAiReadoutTimer) {
    clearTimeout(acquisitionAiReadoutTimer);
  }

  const cached = acquisitionAiReadoutCache.get(context.key);
  if (cached) {
    applyAcquisitionReadout({
      scopeText: context.scopeText,
      optimalContext: context.optimalContext,
      optimalRangeLabel: context.optimalRangeLabel,
      summaryBullets: cached.summaryBullets,
      optimalSupporting: cached.optimalSupporting,
      optimalNote: cached.optimalNote,
      actionBullets: cached.actionBullets
    });
    return;
  }

  acquisitionAiReadoutTimer = window.setTimeout(async () => {
    try {
      const aiReadout = await requestAcquisitionAiReadout(context, fallbackReadout);
      if (!aiReadout) return;

      acquisitionAiReadoutCache.set(context.key, aiReadout);

      if (acquisitionAiReadoutRequestKey !== context.key) {
        return;
      }

      applyAcquisitionReadout({
        scopeText: context.scopeText,
        optimalContext: context.optimalContext,
        optimalRangeLabel: context.optimalRangeLabel,
        summaryBullets: aiReadout.summaryBullets,
        optimalSupporting: aiReadout.optimalSupporting,
        optimalNote: aiReadout.optimalNote,
        actionBullets: aiReadout.actionBullets
      });
    } catch (error) {
      if (error.name !== 'AbortError') {
        console.warn('Acquisition AI readout fallback engaged:', error);
      }
    }
  }, ACQ_AI_DEBOUNCE_MS);
}

function renderAcquisitionReadout({
  channelData,
  cohortKey,
  cohortLabel,
  optimalPriceSuggestion,
  priceChangePct,
  baseElasticity,
  trafficImpactPct,
  projectedGroups,
  projectedOrders,
  netSalesImpact
}) {
  const channelLabel = channelData.channelName || getYumChannelLabel(channelData.channel);
  const fallbackReadout = buildAcquisitionFallbackReadout({
    cohortKey,
    cohortLabel,
    channelLabel,
    optimalPriceSuggestion,
    priceChangePct,
    baseElasticity,
    trafficImpactPct,
    projectedGroups,
    projectedOrders,
    netSalesImpact
  });
  applyAcquisitionReadout({
    scopeText: `Scope: ${channelLabel} | ${cohortLabel}`,
    optimalContext: `${channelLabel} | ${cohortLabel}`,
    optimalRangeLabel: optimalPriceSuggestion
      ? `${formatCurrency(optimalPriceSuggestion.low)} - ${formatCurrency(optimalPriceSuggestion.high)}`
      : 'No range available',
    summaryBullets: fallbackReadout.summaryBullets,
    optimalSupporting: fallbackReadout.optimalSupporting,
    optimalNote: fallbackReadout.optimalNote,
    actionBullets: fallbackReadout.actionBullets
  });
}

function setSliderForChannel(channelData) {
  const slider = document.getElementById('acq-price-slider');
  const display = document.getElementById('acq-price-display');
  if (!slider || !channelData) return;

  const safeAvgCheck = Math.max(4, toNumber(channelData.avgCheck, 0));
  const min = Math.max(4, safeAvgCheck * 0.82);
  const max = Math.max(min + 0.5, safeAvgCheck * 1.18);
  slider.min = min.toFixed(2);
  slider.max = max.toFixed(2);
  slider.step = '0.10';
  slider.value = safeAvgCheck.toFixed(2);
  if (display) {
    display.textContent = formatCurrency(safeAvgCheck);
  }
}

function updateAcquisitionModel() {
  const channelSelect = document.getElementById('acq-tier-select');
  const priceSlider = document.getElementById('acq-price-slider');
  const cohortSelect = document.getElementById('acq-cohort-select');
  if (!channelSelect || !priceSlider || !acquisitionState) return;

  const channelData = acquisitionState.channels[channelSelect.value];
  if (!channelData) return;

  const cohort = cohortData[cohortSelect?.value] || cohortData.baseline || {};
  const cohortKey = cohortSelect?.value || 'baseline';
  const cohortLabel = COHORT_LABELS[cohortSelect?.value] || COHORT_LABELS.baseline;
  const cohortMultiplier = Math.abs(toNumber(cohort.acquisition_elasticity, -COHORT_BASE_ELASTICITY)) / COHORT_BASE_ELASTICITY;
  const newPrice = toNumber(priceSlider.value);
  const optimalPriceSuggestion = findOptimalPriceSuggestion(channelData, cohortMultiplier, cohortKey);
  const {
    currentPrice,
    priceChangePct,
    baseElasticity,
    trafficImpactPct,
    projectedGroups,
    projectedOrders,
    netSalesImpact
  } = projectAcquisitionOutcome(channelData, cohortMultiplier, newPrice);
  const displayedElasticity = isBaselineDineInScenario(channelData, cohortKey)
    ? 1.19
    : Math.abs(baseElasticity);

  document.getElementById('acq-price-display').textContent = formatCurrency(newPrice);
  document.getElementById('acq-price-change').textContent = `${priceChangePct >= 0 ? '+' : ''}${priceChangePct.toFixed(1)}%`;
  document.getElementById('acq-elasticity').textContent = displayedElasticity.toFixed(2);

  const impactEl = document.getElementById('acq-impact');
  impactEl.textContent = `${trafficImpactPct >= 0 ? '+' : ''}${trafficImpactPct.toFixed(1)}%`;
  impactEl.className = `metric-value ${trafficImpactPct >= 0 ? 'text-success' : 'text-danger'}`;
  document.getElementById('acq-total-subs').textContent = `${formatNumber(projectedOrders)} / wk`;

  const revenueEl = document.getElementById('acq-total-revenue');
  revenueEl.textContent = `${netSalesImpact >= 0 ? '+' : ''}${formatCurrency(netSalesImpact, 0)}`;
  revenueEl.className = `metric-value ${netSalesImpact >= 0 ? 'text-success' : 'text-danger'}`;

  renderAcquisitionReadout({
    channelData,
    cohortKey,
    cohortLabel,
    optimalPriceSuggestion,
    priceChangePct,
    baseElasticity,
    trafficImpactPct,
    projectedGroups,
    projectedOrders,
    netSalesImpact
  });

  updateSegmentTable(channelData, projectedGroups.map(group => group.orderImpactPct));

  if (!acquisitionChartSimple) return;

  const baselineOrders = channelData.groups.map(group => group.baselineOrders);
  const projectedOrdersData = projectedGroups.map(group => group.projectedOrders);
  const errorBars = projectedOrdersData.map(value => ({
    lower: Math.max(0, value * (1 - channelData.ciFactor)),
    upper: value * (1 + channelData.ciFactor)
  }));
  const revenueData = projectedGroups.map(group => Math.round(group.salesImpact));

  acquisitionChartSimple.data.datasets[0].data = baselineOrders;
  acquisitionChartSimple.data.datasets[1].data = projectedOrdersData;
  acquisitionChartSimple.data.datasets[1].errorBars = errorBars;
  acquisitionChartSimple.data.datasets[2].data = revenueData;
  acquisitionChartSimple.data.datasets[2].backgroundColor = revenueData.map(value =>
    value >= 0 ? 'rgba(251, 191, 36, 0.5)' : 'rgba(239, 68, 68, 0.45)'
  );
  acquisitionChartSimple.data.datasets[2].borderColor = revenueData.map(value =>
    value >= 0 ? 'rgba(251, 191, 36, 1)' : 'rgba(239, 68, 68, 1)'
  );
  acquisitionChartSimple.update('none');
}

function setupAcquisitionInteractivity() {
  const channelSelect = document.getElementById('acq-tier-select');
  const priceSlider = document.getElementById('acq-price-slider');
  const ciToggle = document.getElementById('acq-show-ci');
  const cohortSelect = document.getElementById('acq-cohort-select');
  if (!channelSelect || !priceSlider) return;

  channelSelect.addEventListener('change', () => {
    const channelData = acquisitionState?.channels[channelSelect.value];
    if (channelData) {
      setSliderForChannel(channelData);
    }
    updateAcquisitionModel();
  });

  priceSlider.addEventListener('input', updateAcquisitionModel);
  if (ciToggle) {
    ciToggle.addEventListener('change', () => {
      updateAcquisitionModel();
    });
  }
  if (cohortSelect) {
    cohortSelect.addEventListener('change', updateAcquisitionModel);
  }
}

async function initAcquisitionSimple() {
  try {
    const brandId = getActiveBrandId();
    const brandLabel = getYumBrandLabel(brandId);
    const [channelRows, storeChannelRows, itemRows] = await Promise.all([
      loadYumChannelDim(),
      loadYumStoreChannelWeekPanel(),
      loadYumStoreItemWeekPanel()
    ]);

    await loadCohortData();
    acquisitionState = buildAcquisitionState(channelRows, storeChannelRows, itemRows, brandId);
    relabelAcquisitionPane(acquisitionState.orderedChannels);

    const defaultChannel = ACQUISITION_CHANNEL_PRIORITY.find((channel) => {
      const channelState = acquisitionState.channels[channel];
      return channelState && channelState.avgCheck > 0 && channelState.baselineOrders > 0;
    }) || acquisitionState.orderedChannels.find((channelRow) => {
      const channelState = acquisitionState.channels[channelRow.channel];
      return channelState && channelState.avgCheck > 0 && channelState.baselineOrders > 0;
    })?.channel || acquisitionState.orderedChannels[0]?.channel;
    if (!defaultChannel) {
      throw new Error(`No ${brandLabel} channels available for acquisition model.`);
    }

    const channelSelect = document.getElementById('acq-tier-select');
    if (channelSelect) {
      channelSelect.value = defaultChannel;
    }

    const initialChannel = acquisitionState.channels[defaultChannel];
    setSliderForChannel(initialChannel);
    createAcquisitionChartSimple(initialChannel);
    setupAcquisitionInteractivity();
    updateAcquisitionModel();
  } catch (error) {
    console.error('Failed to initialize QSR acquisition model:', error);
    const container = resolveStepContentTarget('step-3-acquisition-container');
    if (container) {
      container.innerHTML = `
        <div class="alert alert-danger">
          <i class="bi bi-exclamation-triangle me-2"></i>
          Failed to load QSR traffic elasticity inputs. Please refresh the page.
        </div>
      `;
    }
  }
}

window.initAcquisitionSimple = initAcquisitionSimple;
