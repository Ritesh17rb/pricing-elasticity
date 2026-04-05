/**
 * Taco Bell repeat-visit loss elasticity model.
 * Replaces the old subscription churn view with menu-ladder visit behavior.
 */

import { loadYumStoreItemWeekPanel } from './yum-data-loader.js';
import { getSelectedYumBrandId, getYumBrandLabel } from './yum-brand-utils.js';
import { formatCurrency, formatNumber } from './utils.js';

const GROUP_CONFIG = [
  { key: 'value_entry', label: 'Entry & Value' },
  { key: 'core_premium', label: 'Core & Premium' }
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

let churnChartSimple = null;
let survivalCurveChart = null;
let churnState = null;
let churnTimeLag = {
  '0_4_weeks': 0.15,
  '4_8_weeks': 0.25,
  '8_12_weeks': 0.30,
  '12_plus': 0.30
};
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

function getRecentWeeks(rows, count = 8) {
  return [...new Set(rows.map(row => row.week_start))].sort().slice(-count);
}

function classifyGroup(row) {
  if (
    row.price_tier === 'value' ||
    row.price_tier === 'entry' ||
    row.subcategory === 'value_menu'
  ) {
    return 'value_entry';
  }

  return 'core_premium';
}

async function loadCohortData() {
  try {
    const response = await fetch('data/cohort_coefficients.json');
    cohortData = await response.json();
    return cohortData;
  } catch (error) {
    console.error('Failed to load cohort coefficients for repeat-visit model:', error);
    cohortData = {};
    return cohortData;
  }
}

function relabelChurnPane() {
  const pane = document.getElementById('churn-pane');
  if (!pane) return;
  const brandLabel = getYumBrandLabel(getActiveBrandId());

  const cohortSelect = document.getElementById('churn-cohort-select');
  if (cohortSelect) {
    [...cohortSelect.options].forEach(option => {
      option.textContent = COHORT_LABELS[option.value] || option.textContent;
    });
  }

  const labels = pane.querySelectorAll('.form-label.fw-semibold');
  if (labels[0]) labels[0].textContent = 'Select Visit Mission';
  if (labels[1]) labels[1].textContent = 'Price Increase';
  if (labels[2]) labels[2].textContent = 'Select Menu Ladder';

  const buttons = pane.querySelectorAll('.tier-btn');
  GROUP_CONFIG.forEach((group, index) => {
    const button = buttons[index];
    if (!button) return;
    button.dataset.group = group.key;
    button.textContent = group.label;
  });

  const metricLabels = pane.querySelectorAll('.metric-label');
  if (metricLabels[0]) metricLabels[0].textContent = 'Baseline Visit Loss';
  if (metricLabels[1]) metricLabels[1].textContent = 'Effective Price Move';
  if (metricLabels[2]) metricLabels[2].textContent = 'Peak Visit-Loss Impact';
  if (metricLabels[3]) metricLabels[3].textContent = 'Retained Menu Units (Week 24)';
  if (metricLabels[4]) metricLabels[4].textContent = 'Cumulative Contribution Impact';

  const insightTitle = pane.querySelector('.insight-box h5');
  const insightParagraphs = pane.querySelectorAll('.insight-box p');
  if (insightTitle) insightTitle.textContent = 'Why Delayed Visit Loss?';
  if (insightParagraphs[0]) {
    insightParagraphs[0].innerHTML = `${brandLabel} traffic usually does not disappear immediately after a price move. Guests often react after a few meal cycles or once value offers and app promos stop offsetting the increase.`;
  }
  if (insightParagraphs[1]) {
    insightParagraphs[1].innerHTML = '<strong>Margin Note:</strong> Contribution can still improve early, but aggressive value-tier increases often roll over once frequency erosion compounds.';
  }

  const chartTitles = pane.querySelectorAll('.glass-card h5');
  if (chartTitles[0]) chartTitles[0].innerHTML = '<i class="bi bi-sliders me-2"></i>Simulate Menu Price Increase';
  if (chartTitles[1]) chartTitles[1].textContent = 'Cumulative Repeat-Visit Loss Over Time';
  if (chartTitles[2]) chartTitles[2].innerHTML = '<i class="bi bi-graph-up me-2"></i>Retention Forecast & Contribution Impact';
  if (chartTitles[3]) chartTitles[3].innerHTML = '<i class="bi bi-clock-history me-2"></i>Visit-Loss Impact by Time Horizon';

  const chartNote = pane.querySelector('.small.text-muted.mt-2');
  if (chartNote) {
    chartNote.innerHTML = `<i class="bi bi-info-circle me-1"></i>Shows retained ${brandLabel} menu units and cumulative contribution impact. The shaded gap represents visit-frequency erosion from the tested price move.`;
  }

  const advancedParagraphs = pane.querySelectorAll('#churn-advanced .alert p');
  if (advancedParagraphs[0]) {
    advancedParagraphs[0].innerHTML = `<strong>What it captures:</strong> When ${brandLabel} guests trim visit frequency after menu prices rise or value support rolls off.`;
  }
  if (advancedParagraphs[1]) {
    advancedParagraphs[1].innerHTML = '<strong>Key Insight:</strong> Value-led guests react earlier, while premium or brand-loyal guests absorb changes longer before frequency softens.';
  }
}

function buildChurnState(itemRows, brandId) {
  const brandRows = itemRows.filter(row => row.brand_id === brandId);
  const recentWeeks = getRecentWeeks(brandRows, 8);
  const recentRows = brandRows.filter(row => recentWeeks.includes(row.week_start));
  const weeklySummaries = new Map();

  recentRows.forEach(row => {
    const groupKey = classifyGroup(row);
    const weekKey = `${groupKey}|${row.week_start}`;
    const summary = weeklySummaries.get(weekKey) || {
      groupKey,
      week: row.week_start,
      units: 0,
      sales: 0,
      contribution: 0,
      promoUnits: 0
    };
    summary.units += toNumber(row.units);
    summary.sales += toNumber(row.net_sales);
    summary.contribution += toNumber(row.contribution_margin);
    summary.promoUnits += row.promo_flag === 'true' || row.promo_flag === true ? toNumber(row.units) : 0;
    weeklySummaries.set(weekKey, summary);
  });

  const groups = {};
  GROUP_CONFIG.forEach(group => {
    const groupRows = recentRows.filter(row => classifyGroup(row) === group.key);
    const weekRows = [...weeklySummaries.values()].filter(row => row.groupKey === group.key);
    const baselineUnits = average(weekRows.map(row => row.units));
    const baselineSales = average(weekRows.map(row => row.sales));
    const baselineContribution = average(weekRows.map(row => row.contribution));
    const totalUnits = groupRows.reduce((sum, row) => sum + toNumber(row.units), 0);
    const weightedPrice =
      groupRows.reduce((sum, row) => sum + toNumber(row.net_price) * toNumber(row.units), 0) /
      Math.max(1, totalUnits);
    const weightedElasticity =
      groupRows.reduce((sum, row) => sum + Math.abs(toNumber(row.elasticity_prior)) * toNumber(row.units), 0) /
      Math.max(1, totalUnits);
    const promoMixPct =
      groupRows.reduce(
        (sum, row) => sum + (row.promo_flag === 'true' || row.promo_flag === true ? toNumber(row.units) : 0),
        0
      ) /
      Math.max(1, totalUnits) *
      100;

    const baselineRepeatLoss = Math.max(
      1.2,
      Math.min(4.6, 0.7 + weightedElasticity * 0.95 + promoMixPct * 0.035)
    );

    groups[group.key] = {
      key: group.key,
      label: group.label,
      baselineUnits,
      baselineSales,
      baselineContribution,
      price: weightedPrice,
      repeatLossElasticity: Math.max(0.45, Math.min(1.5, weightedElasticity * 0.52)),
      baselineRepeatLoss
    };
  });

  return { groups };
}

function createChurnChartSimple(initialGroup) {
  const ctx = document.getElementById('churn-chart-simple');
  if (!ctx) return;

  if (churnChartSimple) {
    churnChartSimple.destroy();
  }

  const baseline = initialGroup.baselineRepeatLoss;
  const baselineSeries = [baseline, baseline, baseline, baseline, baseline, baseline];

  churnChartSimple = new Chart(ctx, {
    type: 'line',
    data: {
      labels: ['Week 0', 'Week 4', 'Week 8', 'Week 12', 'Week 16', 'Week 20'],
      datasets: [
        {
          label: 'Baseline Visit Loss',
          data: baselineSeries,
          borderColor: 'rgba(99, 102, 241, 1)',
          backgroundColor: 'rgba(99, 102, 241, 0.08)',
          borderDash: [5, 5],
          fill: false,
          tension: 0.1,
          borderWidth: 2
        },
        {
          label: 'Projected Visit Loss',
          data: baselineSeries,
          borderColor: 'rgba(239, 68, 68, 1)',
          backgroundColor: 'rgba(239, 68, 68, 0.10)',
          fill: true,
          tension: 0.3,
          borderWidth: 2
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          labels: {
            color: document.documentElement.getAttribute('data-bs-theme') === 'dark' ? '#e5e5e5' : '#212529'
          }
        },
        tooltip: {
          callbacks: {
            label(context) {
              return `${context.dataset.label}: ${context.parsed.y.toFixed(1)}%`;
            }
          }
        }
      },
      scales: {
        y: {
          grid: {
            color: document.documentElement.getAttribute('data-bs-theme') === 'dark'
              ? 'rgba(255,255,255,0.1)'
              : 'rgba(0,0,0,0.1)'
          },
          ticks: {
            color: document.documentElement.getAttribute('data-bs-theme') === 'dark' ? '#e5e5e5' : '#212529',
            callback: value => `${value}%`
          },
          title: {
            display: true,
            text: 'Visit Loss Rate (%)',
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
    }
  });
}

function createSurvivalCurveChart(initialGroup) {
  const ctx = document.getElementById('survival-curve-chart');
  if (!ctx) return;

  if (survivalCurveChart) {
    survivalCurveChart.destroy();
  }

  const baseline = initialGroup.baselineRepeatLoss;
  const baselineRetention = [
    100,
    100 - baseline * 0.35,
    100 - baseline * 0.7,
    100 - baseline * 1.0,
    100 - baseline * 1.2,
    100 - baseline * 1.35,
    100 - baseline * 1.5
  ];

  survivalCurveChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: ['Week 0', 'Week 4', 'Week 8', 'Week 12', 'Week 16', 'Week 20', 'Week 24'],
      datasets: [
        {
          label: 'Baseline Retention',
          data: baselineRetention,
          borderColor: 'rgba(99, 102, 241, 1)',
          backgroundColor: 'rgba(99, 102, 241, 0)',
          borderWidth: 3,
          fill: false,
          tension: 0.3,
          yAxisID: 'y'
        },
        {
          label: 'Scenario Retention',
          data: baselineRetention,
          borderColor: 'rgba(239, 68, 68, 1)',
          backgroundColor: 'rgba(239, 68, 68, 0)',
          borderWidth: 3,
          fill: { target: 0, above: 'rgba(239, 68, 68, 0.18)' },
          tension: 0.3,
          yAxisID: 'y'
        },
        {
          label: 'Contribution Impact',
          data: [0, 0, 0, 0, 0, 0, 0],
          borderColor: 'rgba(251, 191, 36, 1)',
          backgroundColor: 'rgba(251, 191, 36, 0.12)',
          borderWidth: 3,
          fill: false,
          tension: 0.3,
          yAxisID: 'yContribution'
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: 'index',
        intersect: false
      },
      plugins: {
        legend: {
          labels: {
            color: document.documentElement.getAttribute('data-bs-theme') === 'dark' ? '#e5e5e5' : '#212529'
          }
        },
        tooltip: {
          callbacks: {
            label(context) {
              if (context.datasetIndex === 2) {
                const sign = context.parsed.y >= 0 ? '+' : '';
                return `${context.dataset.label}: ${sign}${formatCurrency(context.parsed.y, 0)}`;
              }
              return `${context.dataset.label}: ${context.parsed.y.toFixed(1)}%`;
            }
          }
        }
      },
      scales: {
        y: {
          grid: {
            color: document.documentElement.getAttribute('data-bs-theme') === 'dark'
              ? 'rgba(255,255,255,0.1)'
              : 'rgba(0,0,0,0.1)'
          },
          ticks: {
            color: document.documentElement.getAttribute('data-bs-theme') === 'dark' ? '#e5e5e5' : '#212529',
            callback: value => `${value}%`
          },
          title: {
            display: true,
            text: 'Retention Rate (%)',
            color: document.documentElement.getAttribute('data-bs-theme') === 'dark' ? '#e5e5e5' : '#212529'
          }
        },
        yContribution: {
          type: 'linear',
          position: 'right',
          grid: { drawOnChartArea: false },
          ticks: {
            color: document.documentElement.getAttribute('data-bs-theme') === 'dark' ? '#e5e5e5' : '#212529',
            callback(value) {
              const sign = value >= 0 ? '+' : '';
              return `${sign}${formatCurrency(value / 1000, 0)}K`;
            }
          },
          title: {
            display: true,
            text: 'Cumulative Contribution Impact ($)',
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
    }
  });
}

function setSliderForGroup(group) {
  const slider = document.getElementById('churn-price-slider');
  const display = document.getElementById('churn-increase-display');
  if (!slider || !group) return;

  const maxIncrease = Math.max(0.75, Math.min(2.5, group.price * 0.25));
  slider.min = '0';
  slider.max = maxIncrease.toFixed(2);
  slider.step = '0.05';
  slider.value = Math.min(0.5, maxIncrease).toFixed(2);
  if (display) {
    display.textContent = `+${formatCurrency(toNumber(slider.value))}`;
  }
}

function updateChurnModel(selectedGroupKey = 'value_entry') {
  const slider = document.getElementById('churn-price-slider');
  const group = churnState?.groups[selectedGroupKey];
  if (!slider || !group) return;

  const cohort = cohortData[document.getElementById('churn-cohort-select')?.value] || cohortData.baseline || {};
  const priceIncrease = toNumber(slider.value);
  const priceChangePct = (priceIncrease / group.price) * 100;
  const repeatLossElasticity = toNumber(cohort.repeat_loss_elasticity, group.repeatLossElasticity);
  const totalImpact = group.baselineRepeatLoss * repeatLossElasticity * (priceChangePct / 100);

  const impacts = {
    '0_4': totalImpact * churnTimeLag['0_4_weeks'],
    '4_8': totalImpact * churnTimeLag['4_8_weeks'],
    '8_12': totalImpact * churnTimeLag['8_12_weeks'],
    '12plus': totalImpact * churnTimeLag['12_plus']
  };

  document.getElementById('churn-increase-display').textContent = `+${formatCurrency(priceIncrease)}`;
  document.getElementById('churn-pct-change').textContent = `+${priceChangePct.toFixed(1)}%`;
  document.getElementById('churn-peak-impact').textContent = `+${Math.max(...Object.values(impacts)).toFixed(1)}pp`;
  document.getElementById('churn-0-4').textContent = `+${impacts['0_4'].toFixed(1)}pp`;
  document.getElementById('churn-4-8').textContent = `+${impacts['4_8'].toFixed(1)}pp`;
  document.getElementById('churn-8-12').textContent = `+${impacts['8_12'].toFixed(1)}pp`;
  document.getElementById('churn-12plus').textContent = `+${impacts['12plus'].toFixed(1)}pp`;

  const maxImpact = Math.max(1.5, ...Object.values(impacts)) * 1.1;
  document.getElementById('bar-0-4').style.width = `${Math.min(100, impacts['0_4'] / maxImpact * 100)}%`;
  document.getElementById('bar-4-8').style.width = `${Math.min(100, impacts['4_8'] / maxImpact * 100)}%`;
  document.getElementById('bar-8-12').style.width = `${Math.min(100, impacts['8_12'] / maxImpact * 100)}%`;
  document.getElementById('bar-12plus').style.width = `${Math.min(100, impacts['12plus'] / maxImpact * 100)}%`;

  const baselineSeries = [
    group.baselineRepeatLoss,
    group.baselineRepeatLoss,
    group.baselineRepeatLoss,
    group.baselineRepeatLoss,
    group.baselineRepeatLoss,
    group.baselineRepeatLoss
  ];
  const projectedSeries = [
    group.baselineRepeatLoss,
    group.baselineRepeatLoss + impacts['0_4'],
    group.baselineRepeatLoss + impacts['4_8'],
    group.baselineRepeatLoss + impacts['8_12'],
    group.baselineRepeatLoss + (impacts['8_12'] + impacts['12plus']) / 2,
    group.baselineRepeatLoss + impacts['12plus']
  ];

  if (churnChartSimple) {
    churnChartSimple.data.datasets[0].data = baselineSeries;
    churnChartSimple.data.datasets[1].data = projectedSeries;
    churnChartSimple.update('none');
  }

  const baselineRetention = [
    100,
    100 - group.baselineRepeatLoss * 0.35,
    100 - group.baselineRepeatLoss * 0.7,
    100 - group.baselineRepeatLoss * 1.0,
    100 - group.baselineRepeatLoss * 1.2,
    100 - group.baselineRepeatLoss * 1.35,
    100 - group.baselineRepeatLoss * 1.5
  ];

  let cumulativeImpact = 0;
  const scenarioRetention = [100];
  cumulativeImpact += impacts['0_4'];
  scenarioRetention.push(100 - group.baselineRepeatLoss * 0.35 - cumulativeImpact * 0.35);
  cumulativeImpact += impacts['4_8'];
  scenarioRetention.push(100 - group.baselineRepeatLoss * 0.7 - cumulativeImpact * 0.55);
  cumulativeImpact += impacts['8_12'];
  scenarioRetention.push(100 - group.baselineRepeatLoss * 1.0 - cumulativeImpact * 0.75);
  cumulativeImpact += impacts['12plus'] * 0.5;
  scenarioRetention.push(100 - group.baselineRepeatLoss * 1.2 - cumulativeImpact * 0.9);
  cumulativeImpact += impacts['12plus'] * 0.3;
  scenarioRetention.push(100 - group.baselineRepeatLoss * 1.35 - cumulativeImpact * 1.0);
  cumulativeImpact += impacts['12plus'] * 0.2;
  scenarioRetention.push(100 - group.baselineRepeatLoss * 1.5 - cumulativeImpact * 1.05);

  const newEffectivePrice = group.price + priceIncrease;
  const contributionImpact = [0];
  let cumulativeContribution = 0;
  for (let index = 0; index < baselineRetention.length - 1; index += 1) {
    const baselineUnits = group.baselineUnits * ((baselineRetention[index] + baselineRetention[index + 1]) / 2) / 100;
    const scenarioUnits = group.baselineUnits * ((scenarioRetention[index] + scenarioRetention[index + 1]) / 2) / 100;
    const baselineContribution = baselineUnits * (group.baselineContribution / Math.max(1, group.baselineUnits));
    const scenarioContribution = scenarioUnits * (group.baselineContribution / Math.max(1, group.baselineUnits)) * (newEffectivePrice / group.price);
    cumulativeContribution += scenarioContribution - baselineContribution;
    contributionImpact.push(cumulativeContribution);
  }

  const retainedUnits = Math.round(group.baselineUnits * (scenarioRetention[scenarioRetention.length - 1] / 100));
  document.getElementById('churn-retained-subs').textContent = `${formatNumber(retainedUnits)} / wk`;

  const revenueEl = document.getElementById('churn-total-revenue');
  const totalContributionImpact = contributionImpact[contributionImpact.length - 1];
  revenueEl.textContent = `${totalContributionImpact >= 0 ? '+' : ''}${formatCurrency(totalContributionImpact, 0)}`;
  revenueEl.className = `metric-value ${totalContributionImpact >= 0 ? 'text-success' : 'text-danger'}`;

  if (survivalCurveChart) {
    survivalCurveChart.data.datasets[0].data = baselineRetention;
    survivalCurveChart.data.datasets[1].data = scenarioRetention;
    survivalCurveChart.data.datasets[2].data = contributionImpact;
    survivalCurveChart.update('none');
  }
}

function setupChurnInteractivity() {
  const slider = document.getElementById('churn-price-slider');
  const groupButtons = document.querySelectorAll('#churn-pane .tier-btn');
  const cohortSelect = document.getElementById('churn-cohort-select');
  if (!slider) return;

  let currentGroupKey = GROUP_CONFIG[0].key;
  slider.addEventListener('input', () => updateChurnModel(currentGroupKey));

  groupButtons.forEach((button, index) => {
    const groupKey = button.dataset.group || GROUP_CONFIG[index]?.key;
    button.addEventListener('click', () => {
      groupButtons.forEach(item => item.classList.remove('active'));
      button.classList.add('active');
      currentGroupKey = groupKey;
      setSliderForGroup(churnState.groups[currentGroupKey]);
      updateChurnModel(currentGroupKey);
    });
  });

  if (cohortSelect) {
    cohortSelect.addEventListener('change', () => {
      const selected = cohortData[cohortSelect.value] || cohortData.baseline || {};
      const distribution = selected.time_lag_distribution || {};
      churnTimeLag = {
        '0_4_weeks': toNumber(distribution['0_4_weeks'], 0.15),
        '4_8_weeks': toNumber(distribution['4_8_weeks'], 0.25),
        '8_12_weeks': toNumber(distribution['8_12_weeks'], 0.30),
        '12_plus': toNumber(distribution['12_16_weeks'], 0.20) + toNumber(distribution['16_20_weeks'], 0.10)
      };
      updateChurnModel(currentGroupKey);
    });
  }
}

async function initChurnSimple() {
  try {
    const brandId = getActiveBrandId();
    const brandLabel = getYumBrandLabel(brandId);
    const itemRows = await loadYumStoreItemWeekPanel();
    await loadCohortData();
    churnState = buildChurnState(itemRows, brandId);
    relabelChurnPane();

    const defaultGroup = churnState.groups[GROUP_CONFIG[0].key];
    if (!defaultGroup) {
      throw new Error(`No ${brandLabel} menu ladder data available for repeat-visit model.`);
    }

    setSliderForGroup(defaultGroup);
    createChurnChartSimple(defaultGroup);
    createSurvivalCurveChart(defaultGroup);
    setupChurnInteractivity();
    updateChurnModel(GROUP_CONFIG[0].key);
  } catch (error) {
    console.error('Failed to initialize Yum repeat-visit model:', error);
    const container = document.getElementById('step-4-churn-container');
    if (container) {
      container.innerHTML = `
        <div class="alert alert-danger">
          <i class="bi bi-exclamation-triangle me-2"></i>
          Failed to load Yum repeat-visit elasticity inputs for the selected brand. Please refresh the page.
        </div>
      `;
    }
  }
}

window.initChurnSimple = initChurnSimple;
