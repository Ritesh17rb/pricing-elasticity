/**
 * QSR order-channel migration model.
 * Models Delivery versus Carryout / Pickup movement, with leakage into dine-in or lost demand.
 */

import { loadYumStoreChannelWeekPanel } from './yum-data-loader.js';
import { formatCurrency, formatNumber } from './utils.js';

const BRAND_ID = 'qsr';
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

let migrationChartSimple = null;
let migrationState = null;
let cohortData = {};

function resolveStepContentTarget(containerId) {
  return document.getElementById(`${containerId}-content`) || document.getElementById(containerId);
}

function toNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function average(values) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function getRecentWeeks(rows, count = 8) {
  return [...new Set(rows.map((row) => row.week_start))].sort().slice(-count);
}

async function loadCohortData() {
  try {
    const response = await fetch('data/cohort_coefficients.json');
    cohortData = await response.json();
  } catch (error) {
    console.error('Failed to load cohort coefficients for migration model:', error);
    cohortData = {};
  }
}

function relabelMigrationPane() {
  const pane = document.getElementById('migration-pane');
  if (!pane) return;

  const cohortSelect = document.getElementById('mig-cohort-select');
  if (cohortSelect) {
    [...cohortSelect.options].forEach((option) => {
      option.textContent = COHORT_LABELS[option.value] || option.textContent;
    });
  }

  const labels = pane.querySelectorAll('.form-label.fw-semibold');
  if (labels[0]) labels[0].textContent = 'Select Visit Mission';
  if (labels[1]) labels[1].innerHTML = 'Delivery Price (incl. fees): <strong class="text-primary" id="mig-adlite-display">$0.00</strong>';
  if (labels[2]) labels[2].innerHTML = 'Pickup Price (net of discounts): <strong class="text-primary" id="mig-adfree-display">$0.00</strong>';

  const metricLabels = pane.querySelectorAll('.metric-label');
  if (metricLabels[0]) metricLabels[0].textContent = 'Channel Check Gap';
  if (metricLabels[1]) metricLabels[1].textContent = 'Gap Change';

  const insightTitle = pane.querySelector('.insight-box h5');
  const insightBody = pane.querySelector('.insight-box p');
  if (insightTitle) insightTitle.textContent = 'Order Channel Migration';
  if (insightBody) {
    insightBody.textContent = 'When delivery gets relatively more expensive, more QSR demand shifts into carryout and pickup. If the owned-channel value edge narrows, orders drift back to delivery or leak into dine-in and lower-frequency behavior.';
  }

  const chartTitles = pane.querySelectorAll('.glass-card h5');
  if (chartTitles[0]) chartTitles[0].innerHTML = '<i class="bi bi-sliders me-2"></i>Adjust Channel Checks';
  if (chartTitles[1]) chartTitles[1].innerHTML = '<i class="bi bi-diagram-3 me-2"></i>Channel Flow Diagram';
  if (chartTitles[2]) chartTitles[2].innerHTML = '<i class="bi bi-pie-chart me-2"></i>Channel Mix Shift (Delivery → Pickup)';
  if (chartTitles[3]) chartTitles[3].textContent = 'Channel Mix Over Time';

  const flowLabels = pane.querySelectorAll('.migration-flow .flow-box div:nth-child(2)');
  if (flowLabels[0]) flowLabels[0].textContent = 'Delivery';
  if (flowLabels[1]) flowLabels[1].textContent = 'Carryout / Pickup';

  const rows = pane.querySelectorAll('tbody tr');
  const rowLabels = [
    'Delivery -> Carryout / Pickup',
    'Carryout / Pickup -> Delivery',
    'Delivery -> Dine-In / Other',
    'Carryout / Pickup -> Dine-In / Other'
  ];
  rows.forEach((row, index) => {
    const firstCell = row.querySelector('td');
    if (firstCell && rowLabels[index]) {
      firstCell.textContent = rowLabels[index];
    }
  });

  const note = pane.querySelector('.glass-card .small.text-muted.mt-2');
  if (note) {
    note.innerHTML = '<i class="bi bi-info-circle me-1"></i>Flow width represents weekly orders. Blue = stay, Green = owned-channel gain, Red = delivery fallback, Gray = leakage to dine-in or lost demand.';
  }

  const advancedParagraphs = pane.querySelectorAll('#migration-advanced .alert p');
  if (advancedParagraphs[0]) {
    advancedParagraphs[0].innerHTML = '<strong>What it captures:</strong> How QSR orders shift between delivery and carryout / pickup when relative price gaps move.';
  }
  if (advancedParagraphs[1]) {
    advancedParagraphs[1].innerHTML = '<strong>Decision Takeaway:</strong> Preserve enough owned-channel value to win carryout and pickup migration without giving away too much delivery mix or total volume.';
  }
}

function buildChannelSummary(channelRows) {
  const weeklyTransactions = getRecentWeeks(channelRows, 8).map((week) =>
    channelRows
      .filter((row) => row.week_start === week)
      .reduce((sum, row) => sum + toNumber(row.transaction_count_proxy), 0)
  );
  const weeklySales = getRecentWeeks(channelRows, 8).map((week) =>
    channelRows
      .filter((row) => row.week_start === week)
      .reduce((sum, row) => sum + toNumber(row.net_sales), 0)
  );
  const totalTransactions = channelRows.reduce((sum, row) => sum + toNumber(row.transaction_count_proxy), 0);
  return {
    transactions: average(weeklyTransactions),
    avgCheck:
      channelRows.reduce(
        (sum, row) => sum + toNumber(row.avg_check_proxy) * toNumber(row.transaction_count_proxy),
        0
      ) / Math.max(1, totalTransactions),
    netSales: average(weeklySales)
  };
}

function buildMigrationState(rows) {
  const brandRows = rows.filter((row) => row.brand_id === BRAND_ID);
  const recentWeeks = getRecentWeeks(brandRows, 8);
  const recentRows = brandRows.filter((row) => recentWeeks.includes(row.week_start));
  const byChannel = new Map();

  recentRows.forEach((row) => {
    if (!byChannel.has(row.channel)) {
      byChannel.set(row.channel, []);
    }
    byChannel.get(row.channel).push(row);
  });

  const deliveryRows = byChannel.get('delivery') || [];
  const carryoutRows = byChannel.get('carryout') || [];
  const pickupRows = byChannel.get('pickup_app') || [];
  const dineInRows = byChannel.get('dine_in') || [];

  const delivery = buildChannelSummary(deliveryRows);
  const carryout = buildChannelSummary(carryoutRows);
  const pickup = buildChannelSummary(pickupRows);
  const dineIn = buildChannelSummary(dineInRows);

  const carryoutPickupTransactions = carryout.transactions + pickup.transactions;
  const carryoutPickupNetSales = carryout.netSales + pickup.netSales;
  const carryoutPickupAvgCheck = carryoutPickupTransactions > 0
    ? ((carryout.avgCheck * carryout.transactions) + (pickup.avgCheck * pickup.transactions)) / carryoutPickupTransactions
    : 0;

  const totalTransactions = delivery.transactions + carryoutPickupTransactions + dineIn.transactions;

  return {
    delivery,
    carryoutPickup: {
      transactions: carryoutPickupTransactions,
      avgCheck: carryoutPickupAvgCheck,
      netSales: carryoutPickupNetSales
    },
    otherTransactions: dineIn.transactions,
    otherAvgCheck: dineIn.avgCheck,
    baselineGap: carryoutPickupAvgCheck - delivery.avgCheck,
    baselineDeliveryShare: totalTransactions > 0 ? (delivery.transactions / totalTransactions) * 100 : 0,
    baselineCarryoutPickupShare: totalTransactions > 0 ? (carryoutPickupTransactions / totalTransactions) * 100 : 0
  };
}

function createMigrationChartSimple() {
  const ctx = document.getElementById('migration-chart-simple');
  if (!ctx || !migrationState?.delivery || !migrationState?.carryoutPickup) return;

  if (migrationChartSimple) {
    migrationChartSimple.destroy();
  }

  migrationChartSimple = new Chart(ctx, {
    type: 'line',
    data: {
      labels: ['Month 0', 'Month 3', 'Month 6', 'Month 9', 'Month 12'],
      datasets: [
        {
          label: 'Delivery Share',
          data: new Array(5).fill(migrationState.baselineDeliveryShare),
          borderColor: 'rgba(245, 158, 11, 1)',
          backgroundColor: 'rgba(245, 158, 11, 0.1)',
          fill: true,
          tension: 0.3,
          borderWidth: 2
        },
        {
          label: 'Carryout / Pickup Share',
          data: new Array(5).fill(migrationState.baselineCarryoutPickupShare),
          borderColor: 'rgba(16, 185, 129, 1)',
          backgroundColor: 'rgba(16, 185, 129, 0.08)',
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
          min: 0,
          max: 80,
          ticks: {
            color: document.documentElement.getAttribute('data-bs-theme') === 'dark' ? '#e5e5e5' : '#212529',
            callback: (value) => `${value}%`
          },
          grid: {
            color: document.documentElement.getAttribute('data-bs-theme') === 'dark'
              ? 'rgba(255,255,255,0.1)'
              : 'rgba(0,0,0,0.1)'
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

function updateSankeyDiagram(flowData) {
  const container = document.getElementById('sankey-diagram');
  if (!container || !flowData) return;

  container.innerHTML = '';
  d3.selectAll('.sankey-tooltip').remove();

  const width = container.clientWidth || 700;
  const height = 400;
  const margin = { top: 20, right: 120, bottom: 20, left: 120 };
  const nodes = [
    { name: 'Delivery\n(Current)', id: 0 },
    { name: 'Carryout / Pickup\n(Current)', id: 1 },
    { name: 'Delivery\n(Projected)', id: 2 },
    { name: 'Carryout / Pickup\n(Projected)', id: 3 },
    { name: 'Dine-In / Other\nor Lost', id: 4 }
  ];
  const links = [
    { source: 0, target: 2, value: flowData.deliveryStay, type: 'stay' },
    { source: 0, target: 3, value: flowData.deliveryToCarryoutPickup, type: 'upgrade' },
    { source: 0, target: 4, value: flowData.deliveryLeakage, type: 'leakage' },
    { source: 1, target: 3, value: flowData.carryoutPickupStay, type: 'stay' },
    { source: 1, target: 2, value: flowData.carryoutPickupToDelivery, type: 'downgrade' },
    { source: 1, target: 4, value: flowData.carryoutPickupLeakage, type: 'leakage' }
  ];

  const svg = d3.select(container).append('svg').attr('width', width).attr('height', height);
  const sankey = d3.sankey().nodeId((node) => node.id).nodeWidth(20).nodePadding(28).extent([[margin.left, margin.top], [width - margin.right, height - margin.bottom]]);
  const layout = sankey({
    nodes: nodes.map((node) => ({ ...node })),
    links: links.map((link) => ({ ...link }))
  });
  const colors = { stay: '#6366f1', upgrade: '#10b981', downgrade: '#ef4444', leakage: '#6b7280' };

  svg.append('g')
    .selectAll('path')
    .data(layout.links)
    .join('path')
    .attr('d', d3.sankeyLinkHorizontal())
    .attr('stroke', (link) => colors[link.type])
    .attr('stroke-width', (link) => Math.max(1, link.width))
    .attr('fill', 'none')
    .attr('opacity', 0.4);

  svg.append('g')
    .selectAll('rect')
    .data(layout.nodes)
    .join('rect')
    .attr('x', (node) => node.x0)
    .attr('y', (node) => node.y0)
    .attr('height', (node) => Math.max(1, node.y1 - node.y0))
    .attr('width', (node) => node.x1 - node.x0)
    .attr('fill', (node) => (node.id === 4 ? colors.leakage : node.id < 2 ? '#94a3b8' : '#1e293b'))
    .attr('opacity', 0.85);

  svg.append('g')
    .selectAll('text')
    .data(layout.nodes)
    .join('text')
    .attr('x', (node) => (node.x0 < width / 2 ? node.x0 - 8 : node.x1 + 8))
    .attr('y', (node) => (node.y0 + node.y1) / 2)
    .attr('dy', '0.35em')
    .attr('text-anchor', (node) => (node.x0 < width / 2 ? 'end' : 'start'))
    .attr('font-size', '12px')
    .attr('font-weight', '600')
    .attr('fill', document.documentElement.getAttribute('data-bs-theme') === 'dark' ? '#e5e5e5' : '#1e293b')
    .each(function eachLine(node) {
      const text = d3.select(this);
      node.name.split('\n').forEach((line, index) => {
        text.append('tspan')
          .attr('x', node.x0 < width / 2 ? node.x0 - 8 : node.x1 + 8)
          .attr('dy', index === 0 ? 0 : '1.2em')
          .text(line);
      });
    });
}

function setSliderDefaults() {
  const deliverySlider = document.getElementById('mig-adlite-slider');
  const carryoutPickupSlider = document.getElementById('mig-adfree-slider');
  if (!deliverySlider || !carryoutPickupSlider || !migrationState?.delivery || !migrationState?.carryoutPickup) return;

  deliverySlider.min = Math.max(8, migrationState.delivery.avgCheck * 0.82).toFixed(2);
  deliverySlider.max = (migrationState.delivery.avgCheck * 1.18).toFixed(2);
  deliverySlider.step = '0.10';
  deliverySlider.value = migrationState.delivery.avgCheck.toFixed(2);

  carryoutPickupSlider.min = Math.max(8, migrationState.carryoutPickup.avgCheck * 0.82).toFixed(2);
  carryoutPickupSlider.max = (migrationState.carryoutPickup.avgCheck * 1.18).toFixed(2);
  carryoutPickupSlider.step = '0.10';
  carryoutPickupSlider.value = migrationState.carryoutPickup.avgCheck.toFixed(2);
}

function updateMigrationModel() {
  const deliverySlider = document.getElementById('mig-adlite-slider');
  const carryoutPickupSlider = document.getElementById('mig-adfree-slider');
  const cohort = cohortData[document.getElementById('mig-cohort-select')?.value] || cohortData.baseline || {};
  if (!deliverySlider || !carryoutPickupSlider || !migrationState?.delivery || !migrationState?.carryoutPickup) return;

  const deliveryPrice = toNumber(deliverySlider.value);
  const carryoutPickupPrice = toNumber(carryoutPickupSlider.value);
  const gap = carryoutPickupPrice - deliveryPrice;
  const gapChangePct = migrationState.baselineGap === 0
    ? 0
    : ((gap - migrationState.baselineGap) / Math.abs(migrationState.baselineGap)) * 100;

  const deliveryChangePct = ((deliveryPrice - migrationState.delivery.avgCheck) / migrationState.delivery.avgCheck) * 100;
  const carryoutPickupChangePct = ((carryoutPickupPrice - migrationState.carryoutPickup.avgCheck) / migrationState.carryoutPickup.avgCheck) * 100;

  const asymmetry = toNumber(cohort.migration_asymmetry_factor, 2.2) / 2.2;
  const upgradeWillingness = toNumber(cohort.migration_upgrade, 1);
  const downgradeWillingness = toNumber(cohort.migration_downgrade, 1.2);
  const gapSignal = ((migrationState.baselineGap - gap) / Math.max(1, Math.abs(migrationState.baselineGap || 1))) * 100;

  let deliveryToCarryoutPickupPct = 3.0 + Math.max(0, deliveryChangePct) * 0.24 * asymmetry + Math.max(0, gapSignal) * 0.08 * upgradeWillingness;
  let carryoutPickupToDeliveryPct = 1.4 + Math.max(0, carryoutPickupChangePct) * 0.22 * asymmetry + Math.max(0, -gapSignal) * 0.05 * downgradeWillingness;
  let deliveryLeakagePct = 1.0 + Math.max(0, deliveryChangePct) * 0.09;
  let carryoutPickupLeakagePct = 0.8 + Math.max(0, carryoutPickupChangePct) * 0.12;

  deliveryToCarryoutPickupPct = clamp(deliveryToCarryoutPickupPct, 0.8, 18.0);
  carryoutPickupToDeliveryPct = clamp(carryoutPickupToDeliveryPct, 0.5, 11.0);
  deliveryLeakagePct = clamp(deliveryLeakagePct, 0.4, 7.0);
  carryoutPickupLeakagePct = clamp(carryoutPickupLeakagePct, 0.4, 6.0);

  const deliveryBase = migrationState.delivery.transactions;
  const carryoutPickupBase = migrationState.carryoutPickup.transactions;
  const otherBase = migrationState.otherTransactions;
  const deliveryToCarryoutPickup = Math.round(deliveryBase * (deliveryToCarryoutPickupPct / 100));
  const carryoutPickupToDelivery = Math.round(carryoutPickupBase * (carryoutPickupToDeliveryPct / 100));
  const deliveryLeakage = Math.round(deliveryBase * (deliveryLeakagePct / 100));
  const carryoutPickupLeakage = Math.round(carryoutPickupBase * (carryoutPickupLeakagePct / 100));
  const deliveryStay = Math.max(0, Math.round(deliveryBase - deliveryToCarryoutPickup - deliveryLeakage));
  const carryoutPickupStay = Math.max(0, Math.round(carryoutPickupBase - carryoutPickupToDelivery - carryoutPickupLeakage));
  const projectedDelivery = deliveryStay + carryoutPickupToDelivery;
  const projectedCarryoutPickup = carryoutPickupStay + deliveryToCarryoutPickup;
  const projectedOther = otherBase + deliveryLeakage + carryoutPickupLeakage;
  const projectedTotal = projectedDelivery + projectedCarryoutPickup + projectedOther;
  const projectedDeliveryShare = projectedTotal > 0 ? (projectedDelivery / projectedTotal) * 100 : 0;
  const projectedCarryoutPickupShare = projectedTotal > 0 ? (projectedCarryoutPickup / projectedTotal) * 100 : 0;

  document.getElementById('mig-adlite-display').textContent = formatCurrency(deliveryPrice);
  document.getElementById('mig-adfree-display').textContent = formatCurrency(carryoutPickupPrice);
  document.getElementById('mig-price-gap').textContent = formatCurrency(gap);
  document.getElementById('mig-gap-change').textContent = `${gapChangePct >= 0 ? '+' : ''}${gapChangePct.toFixed(1)}%`;
  document.getElementById('mig-adlite-pct').textContent = `${projectedDeliveryShare.toFixed(1)}%`;
  document.getElementById('mig-adfree-pct').textContent = `${projectedCarryoutPickupShare.toFixed(1)}%`;
  const keyShiftEl = document.getElementById('mig-key-shift-text');
  if (keyShiftEl) {
    keyShiftEl.textContent = `+${deliveryToCarryoutPickupPct.toFixed(1)}% of delivery orders move to pickup, but ${deliveryLeakagePct.toFixed(1)}% leak to dine-in / lost demand.`;
  }

  const deliveryToCarryoutPickupRev = deliveryToCarryoutPickup * (carryoutPickupPrice - deliveryPrice);
  const carryoutPickupToDeliveryRev = carryoutPickupToDelivery * (deliveryPrice - carryoutPickupPrice);
  const deliveryLeakageRev = deliveryLeakage * ((migrationState.otherAvgCheck * 0.6) - deliveryPrice);
  const carryoutPickupLeakageRev = carryoutPickupLeakage * ((migrationState.otherAvgCheck * 0.6) - carryoutPickupPrice);

  document.getElementById('mig-upgrade-pct').textContent = `${deliveryToCarryoutPickupPct.toFixed(1)}%`;
  document.getElementById('mig-upgrade-subs').textContent = `${formatNumber(deliveryToCarryoutPickup)} / wk`;
  document.getElementById('mig-upgrade-rev').textContent = `${deliveryToCarryoutPickupRev >= 0 ? '+' : ''}${formatCurrency(deliveryToCarryoutPickupRev)}`;
  document.getElementById('mig-upgrade-rev').className = deliveryToCarryoutPickupRev >= 0 ? 'text-success' : 'text-danger';

  document.getElementById('mig-downgrade-pct').textContent = `${carryoutPickupToDeliveryPct.toFixed(1)}%`;
  document.getElementById('mig-downgrade-subs').textContent = `${formatNumber(carryoutPickupToDelivery)} / wk`;
  document.getElementById('mig-downgrade-rev').textContent = `${carryoutPickupToDeliveryRev >= 0 ? '+' : ''}${formatCurrency(carryoutPickupToDeliveryRev)}`;
  document.getElementById('mig-downgrade-rev').className = carryoutPickupToDeliveryRev >= 0 ? 'text-success' : 'text-danger';

  document.getElementById('mig-cancel-lite-pct').textContent = `${deliveryLeakagePct.toFixed(1)}%`;
  document.getElementById('mig-cancel-lite-subs').textContent = `${formatNumber(deliveryLeakage)} / wk`;
  document.getElementById('mig-cancel-lite-rev').textContent = `${deliveryLeakageRev >= 0 ? '+' : ''}${formatCurrency(deliveryLeakageRev)}`;
  document.getElementById('mig-cancel-lite-rev').className = deliveryLeakageRev >= 0 ? 'text-success' : 'text-danger';

  document.getElementById('mig-cancel-free-pct').textContent = `${carryoutPickupLeakagePct.toFixed(1)}%`;
  document.getElementById('mig-cancel-free-subs').textContent = `${formatNumber(carryoutPickupLeakage)} / wk`;
  document.getElementById('mig-cancel-free-rev').textContent = `${carryoutPickupLeakageRev >= 0 ? '+' : ''}${formatCurrency(carryoutPickupLeakageRev)}`;
  document.getElementById('mig-cancel-free-rev').className = carryoutPickupLeakageRev >= 0 ? 'text-success' : 'text-danger';

  updateSankeyDiagram({
    deliveryBase,
    carryoutPickupBase,
    deliveryStay,
    carryoutPickupStay,
    deliveryToCarryoutPickup,
    carryoutPickupToDelivery,
    deliveryLeakage,
    carryoutPickupLeakage
  });

  if (migrationChartSimple) {
    migrationChartSimple.data.datasets[0].data = [
      migrationState.baselineDeliveryShare,
      migrationState.baselineDeliveryShare * 0.75 + projectedDeliveryShare * 0.25,
      migrationState.baselineDeliveryShare * 0.5 + projectedDeliveryShare * 0.5,
      migrationState.baselineDeliveryShare * 0.25 + projectedDeliveryShare * 0.75,
      projectedDeliveryShare
    ];
    migrationChartSimple.data.datasets[1].data = [
      migrationState.baselineCarryoutPickupShare,
      migrationState.baselineCarryoutPickupShare * 0.75 + projectedCarryoutPickupShare * 0.25,
      migrationState.baselineCarryoutPickupShare * 0.5 + projectedCarryoutPickupShare * 0.5,
      migrationState.baselineCarryoutPickupShare * 0.25 + projectedCarryoutPickupShare * 0.75,
      projectedCarryoutPickupShare
    ];
    migrationChartSimple.update('none');
  }
}

function setupMigrationInteractivity() {
  const deliverySlider = document.getElementById('mig-adlite-slider');
  const carryoutPickupSlider = document.getElementById('mig-adfree-slider');
  const cohortSelect = document.getElementById('mig-cohort-select');
  if (!deliverySlider || !carryoutPickupSlider) return;

  deliverySlider.addEventListener('input', updateMigrationModel);
  carryoutPickupSlider.addEventListener('input', updateMigrationModel);
  if (cohortSelect) {
    cohortSelect.addEventListener('change', updateMigrationModel);
  }
}

async function initMigrationSimple() {
  try {
    const rows = await loadYumStoreChannelWeekPanel();
    await loadCohortData();
    migrationState = buildMigrationState(rows);
    relabelMigrationPane();

    if (!migrationState?.delivery?.transactions || !migrationState?.carryoutPickup?.transactions) {
      throw new Error('Delivery and Carryout / Pickup data are required for QSR migration modeling.');
    }

    setSliderDefaults();
    createMigrationChartSimple();
    setupMigrationInteractivity();
    updateMigrationModel();
  } catch (error) {
    console.error('Failed to initialize QSR migration model:', error);
    const container = resolveStepContentTarget('step-5-migration-container');
    if (container) {
      container.innerHTML = `
        <div class="alert alert-danger">
          <i class="bi bi-exclamation-triangle me-2"></i>
          Failed to load QSR channel migration inputs. Please refresh the page.
        </div>
      `;
    }
  }
}

window.initMigrationSimple = initMigrationSimple;
