/**
 * Taco Bell traffic acquisition elasticity model.
 * Uses the Yum foundation operating panel instead of legacy subscription tiers.
 */

import {
  loadYumChannelDim,
  loadYumStoreChannelWeekPanel,
  loadYumStoreItemWeekPanel
} from './yum-data-loader.js';
import { getSelectedYumBrandId, getYumBrandLabel, getYumChannelLabel } from './yum-brand-utils.js';
import { formatCurrency, formatNumber } from './utils.js';

const COHORT_BASE_ELASTICITY = 1.9;
const PRODUCT_GROUPS = [
  { key: 'value', label: 'Value Menu' },
  { key: 'core', label: 'Core Cravings' },
  { key: 'premium', label: 'Premium & Boxes' }
];
const COHORT_LABELS = {
  baseline: 'All Visit Missions',
  brand_loyal: 'Brand Loyal Regulars',
  value_conscious: 'Value Menu Shoppers',
  deal_seeker: 'Deal Hunters',
  trend_driven: 'LTO / Cantina Explorers',
  channel_switcher: 'Digital Channel Switchers',
  premium_loyal: 'Box & Premium Fans',
  at_risk: 'Frequency At Risk'
};

let acquisitionChartSimple = null;
let acquisitionState = null;
let cohortData = {};

function getActiveBrandId() {
  return getSelectedYumBrandId();
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

  if (row.price_tier === 'premium' || row.category === 'combos' || row.subcategory === 'cantina') {
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
  if (metricLabels[2]) metricLabels[2].textContent = 'Traffic Impact';
  if (metricLabels[3]) metricLabels[3].textContent = 'Projected Weekly Orders';
  if (metricLabels[4]) metricLabels[4].textContent = 'Weekly Net Sales Impact';

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
    chartNote.innerHTML = `<i class="bi bi-info-circle me-1"></i>Confidence intervals are calibrated from week-to-week transaction volatility in the ${brandLabel} operating panel.`;
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
    advancedAlertDetail.innerHTML = '<strong>Key Insight:</strong> Drive-thru traffic is more stable, while digital and value-oriented missions react faster to price moves and app offers.';
  }
}

function setBulletList(elementId, items = []) {
  const element = document.getElementById(elementId);
  if (!element) return;

  if (!items.length) {
    element.innerHTML = '<li>No guidance available.</li>';
    return;
  }

  element.innerHTML = items.map(item => `<li>${item}</li>`).join('');
}

function buildAcquisitionState(channelRows, storeChannelRows, itemRows, brandId) {
  const brandChannels = channelRows
    .filter(row => row.brand_id === brandId)
    .sort((a, b) => toNumber(a.display_order) - toNumber(b.display_order));

  const brandChannelPanel = storeChannelRows.filter(row => row.brand_id === brandId);
  const recentWeeks = getRecentWeeks(brandChannelPanel, 8);
  const recentChannelRows = brandChannelPanel.filter(row => recentWeeks.includes(row.week_start));
  const recentItemRows = itemRows.filter(
    row => row.brand_id === brandId && recentWeeks.includes(row.week_start)
  );

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
            text: 'Weekly Net Sales Impact',
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
    if (cells[1]) cells[1].textContent = group.elasticity.toFixed(2);
    if (cells[2]) {
      const magnitude = Math.abs(group.elasticity);
      if (magnitude >= 2.2) {
        cells[2].innerHTML = '<span class="badge bg-danger">High</span>';
      } else if (magnitude >= 1.6) {
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

function findOptimalPriceSuggestion(channelData, cohortMultiplier) {
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

function renderAcquisitionReadout({
  channelData,
  cohortLabel,
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
  const valueGroup = projectedGroups.find(group => group.key === 'value');
  const premiumGroup = projectedGroups.find(group => group.key === 'premium');
  const channelLabel = channelData.channelName || getYumChannelLabel(channelData.channel);
  const summaryBullets = [
    `${channelLabel} for ${cohortLabel} is the active scope in this view.`,
    `A ${priceChangePct >= 0 ? '+' : ''}${priceChangePct.toFixed(1)}% effective check move implies ${trafficImpactPct >= 0 ? '+' : ''}${trafficImpactPct.toFixed(1)}% weekly order impact using elasticity ${baseElasticity.toFixed(2)}.`,
    `${mostSensitive.label} is the most price-sensitive ladder (${mostSensitive.adjustedElasticity.toFixed(2)}), while ${mostResilient.label} is the most resilient (${mostResilient.adjustedElasticity.toFixed(2)}).`,
    `Projected weekly orders move to ${formatNumber(projectedOrders)} and net sales ${netSalesImpact >= 0 ? 'increase' : 'decrease'} by ${formatCurrency(Math.abs(netSalesImpact), 0)}.`
  ];

  const actionBullets = [
    valueGroup
      ? `Maintain or reduce price for ${valueGroup.label}. It is the first ladder to lose traffic in this ${cohortLabel.toLowerCase()} view (${valueGroup.orderImpactPct >= 0 ? '+' : ''}${valueGroup.orderImpactPct.toFixed(1)}% projected orders at the current move).`
      : `Maintain the entry-value ladder. It remains the most exposed point of traffic loss in this view.`,
    premiumGroup
      ? `Shift pricing to ${premiumGroup.label}. It is carrying the strongest pricing headroom versus ${mostSensitive.label.toLowerCase()} in the selected channel.`
      : `Shift pricing to the most resilient ladder, ${mostResilient.label}, before touching the value-led traffic base.`,
    `Use targeted promotions instead of blanket increases. ${channelLabel} traffic for ${cohortLabel.toLowerCase()} is too uneven to support a one-size-fits-all price move.`
  ];

  const scopeEl = document.getElementById('acq-summary-scope');
  if (scopeEl) {
    scopeEl.textContent = `Scope: ${cohortLabel} | ${channelLabel}`;
  }
  setBulletList('acq-summary-bullets', summaryBullets);
  setBulletList('acq-action-bullets', actionBullets);

  const optimalContextEl = document.getElementById('acq-optimal-context');
  const optimalRangeEl = document.getElementById('acq-optimal-range');
  const optimalSupportingEl = document.getElementById('acq-optimal-supporting');
  const optimalNoteEl = document.getElementById('acq-optimal-note');

  if (optimalContextEl) {
    optimalContextEl.textContent = `${cohortLabel} | ${channelLabel}`;
  }
  if (optimalRangeEl) {
    if (optimalPriceSuggestion) {
      optimalRangeEl.textContent = `${formatCurrency(optimalPriceSuggestion.low)} - ${formatCurrency(optimalPriceSuggestion.high)}`;
    } else {
      optimalRangeEl.textContent = 'No range available';
    }
  }
  if (optimalSupportingEl) {
    if (optimalPriceSuggestion) {
      const orderDirection = optimalPriceSuggestion.bestOrderChangePct >= 0 ? 'orders stable to up' : `${Math.abs(optimalPriceSuggestion.bestOrderChangePct).toFixed(1)}% order loss`;
      const revenueDirection = optimalPriceSuggestion.bestRevenueChangePct >= 0
        ? `${optimalPriceSuggestion.bestRevenueChangePct.toFixed(1)}% revenue lift`
        : `${Math.abs(optimalPriceSuggestion.bestRevenueChangePct).toFixed(1)}% revenue downside`;
      optimalSupportingEl.textContent = `${formatCurrency(optimalPriceSuggestion.bestPrice)} is the best single-point check in the current range, with ${orderDirection} and ${revenueDirection}.`;
    } else {
      optimalSupportingEl.textContent = 'No pricing band available.';
    }
  }
  if (optimalNoteEl) {
    optimalNoteEl.textContent = optimalPriceSuggestion?.note || 'Suggested range minimizes order loss while protecting revenue.';
  }
}

function setSliderForChannel(channelData) {
  const slider = document.getElementById('acq-price-slider');
  const display = document.getElementById('acq-price-display');
  if (!slider || !channelData) return;

  const min = Math.max(4, channelData.avgCheck * 0.82);
  const max = channelData.avgCheck * 1.18;
  slider.min = min.toFixed(2);
  slider.max = max.toFixed(2);
  slider.step = '0.10';
  slider.value = channelData.avgCheck.toFixed(2);
  if (display) {
    display.textContent = formatCurrency(channelData.avgCheck);
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
  const cohortLabel = COHORT_LABELS[cohortSelect?.value] || COHORT_LABELS.baseline;
  const cohortMultiplier = Math.abs(toNumber(cohort.acquisition_elasticity, -COHORT_BASE_ELASTICITY)) / COHORT_BASE_ELASTICITY;
  const newPrice = toNumber(priceSlider.value);
  const optimalPriceSuggestion = findOptimalPriceSuggestion(channelData, cohortMultiplier);
  const {
    currentPrice,
    priceChangePct,
    baseElasticity,
    trafficImpactPct,
    projectedGroups,
    projectedOrders,
    netSalesImpact
  } = projectAcquisitionOutcome(channelData, cohortMultiplier, newPrice);

  document.getElementById('acq-price-display').textContent = formatCurrency(newPrice);
  document.getElementById('acq-price-change').textContent = `${priceChangePct >= 0 ? '+' : ''}${priceChangePct.toFixed(1)}%`;
  document.getElementById('acq-elasticity').textContent = baseElasticity.toFixed(2);

  const impactEl = document.getElementById('acq-impact');
  impactEl.textContent = `${trafficImpactPct >= 0 ? '+' : ''}${trafficImpactPct.toFixed(1)}%`;
  impactEl.className = `metric-value ${trafficImpactPct >= 0 ? 'text-success' : 'text-danger'}`;
  document.getElementById('acq-total-subs').textContent = `${formatNumber(projectedOrders)} / wk`;

  const revenueEl = document.getElementById('acq-total-revenue');
  revenueEl.textContent = `${netSalesImpact >= 0 ? '+' : ''}${formatCurrency(netSalesImpact, 0)}`;
  revenueEl.className = `metric-value ${netSalesImpact >= 0 ? 'text-success' : 'text-danger'}`;

  renderAcquisitionReadout({
    channelData,
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

    const defaultChannel = acquisitionState.orderedChannels[0]?.channel;
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
    console.error('Failed to initialize Yum acquisition model:', error);
    const container = document.getElementById('step-3-acquisition-container');
    if (container) {
      container.innerHTML = `
        <div class="alert alert-danger">
          <i class="bi bi-exclamation-triangle me-2"></i>
          Failed to load Yum traffic elasticity inputs for the selected brand. Please refresh the page.
        </div>
      `;
    }
  }
}

window.initAcquisitionSimple = initAcquisitionSimple;
