/**
 * Taco Bell order-channel migration model.
 * Focuses on Drive-Thru vs Pickup / App, with leakage into other channels.
 */

import { loadYumStoreChannelWeekPanel } from './yum-data-loader.js';
import { formatCurrency, formatNumber } from './utils.js';

const BRAND_ID = 'tacobell';
const PRIMARY_CHANNELS = ['drive_thru', 'pickup'];
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

let migrationChartSimple = null;
let migrationState = null;
let cohortData = {};

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
  return [...new Set(rows.map(row => row.week_start))].sort().slice(-count);
}

async function loadCohortData() {
  try {
    const response = await fetch('data/cohort_coefficients.json');
    cohortData = await response.json();
    return cohortData;
  } catch (error) {
    console.error('Failed to load cohort coefficients for migration model:', error);
    cohortData = {};
    return cohortData;
  }
}

function relabelMigrationPane() {
  const pane = document.getElementById('migration-pane');
  if (!pane) return;

  const cohortSelect = document.getElementById('mig-cohort-select');
  if (cohortSelect) {
    [...cohortSelect.options].forEach(option => {
      option.textContent = COHORT_LABELS[option.value] || option.textContent;
    });
  }

  const labels = pane.querySelectorAll('.form-label.fw-semibold');
  if (labels[0]) labels[0].textContent = 'Select Visit Mission';
  if (labels[1]) labels[1].innerHTML = 'Drive-Thru Effective Check: <strong class="text-primary" id="mig-adlite-display">$0.00</strong>';
  if (labels[2]) labels[2].innerHTML = 'Pickup / App Effective Check: <strong class="text-primary" id="mig-adfree-display">$0.00</strong>';

  const metricLabels = pane.querySelectorAll('.metric-label');
  if (metricLabels[0]) metricLabels[0].textContent = 'Check Gap';
  if (metricLabels[1]) metricLabels[1].textContent = 'Gap Change';

  const insightTitle = pane.querySelector('.insight-box h5');
  const insightBody = pane.querySelector('.insight-box p');
  if (insightTitle) insightTitle.textContent = 'Order Channel Migration';
  if (insightBody) {
    insightBody.textContent = 'When Drive-Thru gets relatively more expensive, more Taco Bell traffic shifts into Pickup / App. If Pickup loses its value edge, customers slide back to Drive-Thru or leak into delivery and other channels.';
  }

  const chartTitles = pane.querySelectorAll('.glass-card h5');
  if (chartTitles[0]) chartTitles[0].innerHTML = '<i class="bi bi-sliders me-2"></i>Adjust Channel Checks';
  if (chartTitles[1]) chartTitles[1].innerHTML = '<i class="bi bi-diagram-3 me-2"></i>Channel Flow Diagram';
  if (chartTitles[2]) chartTitles[2].innerHTML = '<i class="bi bi-pie-chart me-2"></i>Projected Owned-Channel Share';
  if (chartTitles[3]) chartTitles[3].textContent = 'Owned-Channel Mix Over Time';

  const flowLabels = pane.querySelectorAll('.migration-flow .flow-box div:nth-child(2)');
  if (flowLabels[0]) flowLabels[0].textContent = 'Drive-Thru';
  if (flowLabels[1]) flowLabels[1].textContent = 'Pickup / App';

  const rows = pane.querySelectorAll('tbody tr');
  const rowLabels = [
    'Drive-Thru → Pickup / App',
    'Pickup / App → Drive-Thru',
    'Drive-Thru → Delivery / Other',
    'Pickup / App → Delivery / Other'
  ];
  rows.forEach((row, index) => {
    const firstCell = row.querySelector('td');
    if (firstCell && rowLabels[index]) {
      firstCell.textContent = rowLabels[index];
    }
  });

  const note = pane.querySelector('.glass-card .small.text-muted.mt-2');
  if (note) {
    note.innerHTML = '<i class="bi bi-info-circle me-1"></i>Flow width represents weekly orders. Blue = stay, Green = owned-channel switch, Red = fallback to Drive-Thru, Gray = leakage to other channels or lost traffic.';
  }

  const advancedParagraphs = pane.querySelectorAll('#migration-advanced .alert p');
  if (advancedParagraphs[0]) {
    advancedParagraphs[0].innerHTML = '<strong>What it captures:</strong> How Taco Bell guests shift between Drive-Thru and Pickup / App when relative price gaps move.';
  }
  if (advancedParagraphs[1]) {
    advancedParagraphs[1].innerHTML = '<strong>Decision Takeaway:</strong> Keep Pickup / App compelling enough to win digital migration without forcing excess leakage into delivery or suppressing total traffic.';
  }
}

function buildMigrationState(rows) {
  const tacoBellRows = rows.filter(row => row.brand_id === BRAND_ID);
  const recentWeeks = getRecentWeeks(tacoBellRows, 8);
  const recentRows = tacoBellRows.filter(row => recentWeeks.includes(row.week_start));
  const byChannel = {};

  recentRows.forEach(row => {
    const channel = row.channel;
    if (!byChannel[channel]) {
      byChannel[channel] = [];
    }
    byChannel[channel].push(row);
  });

  const channelSummary = {};
  Object.entries(byChannel).forEach(([channel, channelRows]) => {
    const totalTransactions = channelRows.reduce((sum, row) => sum + toNumber(row.transaction_count_proxy), 0);
    channelSummary[channel] = {
      channel,
      channelName: channelRows[0].channel_name,
      transactions: average(
        getRecentWeeks(channelRows, 8).map(week =>
          channelRows
            .filter(row => row.week_start === week)
            .reduce((sum, row) => sum + toNumber(row.transaction_count_proxy), 0)
        )
      ),
      avgCheck:
        channelRows.reduce(
          (sum, row) => sum + toNumber(row.avg_check_proxy) * toNumber(row.transaction_count_proxy),
          0
        ) / Math.max(1, totalTransactions),
      netSales: average(
        getRecentWeeks(channelRows, 8).map(week =>
          channelRows
            .filter(row => row.week_start === week)
            .reduce((sum, row) => sum + toNumber(row.net_sales), 0)
        )
      )
    };
  });

  const driveThru = channelSummary.drive_thru;
  const pickup = channelSummary.pickup;
  const otherTransactions = (channelSummary.in_store?.transactions || 0) + (channelSummary.delivery?.transactions || 0);
  const otherNetSales = (channelSummary.in_store?.netSales || 0) + (channelSummary.delivery?.netSales || 0);
  const totalTransactions =
    (driveThru?.transactions || 0) + (pickup?.transactions || 0) + otherTransactions;

  return {
    driveThru,
    pickup,
    otherTransactions,
    otherAvgCheck: otherTransactions > 0 ? otherNetSales / otherTransactions : 0,
    baselineGap: (pickup?.avgCheck || 0) - (driveThru?.avgCheck || 0),
    baselineDriveThruShare: totalTransactions > 0 ? (driveThru?.transactions || 0) / totalTransactions * 100 : 0,
    baselinePickupShare: totalTransactions > 0 ? (pickup?.transactions || 0) / totalTransactions * 100 : 0,
    totalTransactions
  };
}

function createMigrationChartSimple() {
  const ctx = document.getElementById('migration-chart-simple');
  if (!ctx || !migrationState?.driveThru || !migrationState?.pickup) return;

  if (migrationChartSimple) {
    migrationChartSimple.destroy();
  }

  migrationChartSimple = new Chart(ctx, {
    type: 'line',
    data: {
      labels: ['Month 0', 'Month 3', 'Month 6', 'Month 9', 'Month 12'],
      datasets: [
        {
          label: 'Drive-Thru Share',
          data: new Array(5).fill(migrationState.baselineDriveThruShare),
          borderColor: 'rgba(245, 158, 11, 1)',
          backgroundColor: 'rgba(245, 158, 11, 0.1)',
          fill: true,
          tension: 0.3,
          borderWidth: 2
        },
        {
          label: 'Pickup / App Share',
          data: new Array(5).fill(migrationState.baselinePickupShare),
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
          max: 70,
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
            text: 'Channel Share of Weekly Orders (%)',
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

function updateSankeyDiagram(flowData) {
  const container = document.getElementById('sankey-diagram');
  if (!container || !flowData) return;

  container.innerHTML = '';
  d3.selectAll('.sankey-tooltip').remove();

  const width = container.clientWidth || 700;
  const height = 400;
  const margin = { top: 20, right: 110, bottom: 20, left: 110 };

  const nodes = [
    { name: 'Drive-Thru\n(Current)', id: 0 },
    { name: 'Pickup / App\n(Current)', id: 1 },
    { name: 'Drive-Thru\n(Projected)', id: 2 },
    { name: 'Pickup / App\n(Projected)', id: 3 },
    { name: 'Other Channels\n/ Lost', id: 4 }
  ];

  const links = [
    { source: 0, target: 2, value: flowData.driveThruStay, type: 'stay' },
    { source: 0, target: 3, value: flowData.driveThruToPickup, type: 'upgrade' },
    { source: 0, target: 4, value: flowData.driveThruLeakage, type: 'leakage' },
    { source: 1, target: 3, value: flowData.pickupStay, type: 'stay' },
    { source: 1, target: 2, value: flowData.pickupToDriveThru, type: 'downgrade' },
    { source: 1, target: 4, value: flowData.pickupLeakage, type: 'leakage' }
  ];

  const svg = d3.select(container)
    .append('svg')
    .attr('width', width)
    .attr('height', height);

  const sankey = d3.sankey()
    .nodeId(node => node.id)
    .nodeWidth(20)
    .nodePadding(28)
    .extent([[margin.left, margin.top], [width - margin.right, height - margin.bottom]]);

  const layout = sankey({
    nodes: nodes.map(node => ({ ...node })),
    links: links.map(link => ({ ...link }))
  });

  const colors = {
    stay: '#6366f1',
    upgrade: '#10b981',
    downgrade: '#ef4444',
    leakage: '#6b7280'
  };

  const tooltip = d3.select('body')
    .append('div')
    .attr('class', 'sankey-tooltip')
    .style('position', 'absolute')
    .style('visibility', 'hidden')
    .style('background-color', 'rgba(0, 0, 0, 0.92)')
    .style('color', '#fff')
    .style('padding', '12px 16px')
    .style('border-radius', '8px')
    .style('font-size', '13px')
    .style('line-height', '1.6')
    .style('pointer-events', 'none')
    .style('z-index', '9999');

  svg.append('g')
    .selectAll('path')
    .data(layout.links)
    .join('path')
    .attr('d', d3.sankeyLinkHorizontal())
    .attr('stroke', link => colors[link.type])
    .attr('stroke-width', link => Math.max(1, link.width))
    .attr('fill', 'none')
    .attr('opacity', 0.4)
    .on('mouseover', function onMouseOver(_event, link) {
      d3.select(this).attr('opacity', 0.7);
      const sourceVolume = link.source.id === 0 ? flowData.driveThruBase : flowData.pickupBase;
      const pct = sourceVolume > 0 ? (link.value / sourceVolume) * 100 : 0;
      tooltip
        .html(`
          <div style="font-weight: 600; margin-bottom: 6px;">${link.source.name.replace('\n', ' ')} → ${link.target.name.replace('\n', ' ')}</div>
          <div>Weekly orders: <strong>${formatNumber(link.value)}</strong></div>
          <div>Share of source: <strong>${pct.toFixed(1)}%</strong></div>
        `)
        .style('visibility', 'visible');
    })
    .on('mousemove', function onMouseMove(event) {
      tooltip
        .style('top', `${event.pageY - 10}px`)
        .style('left', `${event.pageX + 15}px`);
    })
    .on('mouseout', function onMouseOut() {
      d3.select(this).attr('opacity', 0.4);
      tooltip.style('visibility', 'hidden');
    });

  svg.append('g')
    .selectAll('rect')
    .data(layout.nodes)
    .join('rect')
    .attr('x', node => node.x0)
    .attr('y', node => node.y0)
    .attr('height', node => Math.max(1, node.y1 - node.y0))
    .attr('width', node => node.x1 - node.x0)
    .attr('fill', node => {
      if (node.id === 4) return colors.leakage;
      if (node.id < 2) return '#94a3b8';
      return '#1e293b';
    })
    .attr('opacity', 0.85);

  svg.append('g')
    .selectAll('text')
    .data(layout.nodes)
    .join('text')
    .attr('x', node => (node.x0 < width / 2 ? node.x0 - 8 : node.x1 + 8))
    .attr('y', node => (node.y0 + node.y1) / 2)
    .attr('dy', '0.35em')
    .attr('text-anchor', node => (node.x0 < width / 2 ? 'end' : 'start'))
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
  const driveThruSlider = document.getElementById('mig-adlite-slider');
  const pickupSlider = document.getElementById('mig-adfree-slider');
  if (!driveThruSlider || !pickupSlider || !migrationState) return;

  driveThruSlider.min = Math.max(6, migrationState.driveThru.avgCheck * 0.82).toFixed(2);
  driveThruSlider.max = (migrationState.driveThru.avgCheck * 1.18).toFixed(2);
  driveThruSlider.step = '0.10';
  driveThruSlider.value = migrationState.driveThru.avgCheck.toFixed(2);

  pickupSlider.min = Math.max(6, migrationState.pickup.avgCheck * 0.82).toFixed(2);
  pickupSlider.max = (migrationState.pickup.avgCheck * 1.18).toFixed(2);
  pickupSlider.step = '0.10';
  pickupSlider.value = migrationState.pickup.avgCheck.toFixed(2);
}

function updateMigrationModel() {
  const driveThruSlider = document.getElementById('mig-adlite-slider');
  const pickupSlider = document.getElementById('mig-adfree-slider');
  const cohort = cohortData[document.getElementById('mig-cohort-select')?.value] || cohortData.baseline || {};
  if (!driveThruSlider || !pickupSlider || !migrationState?.driveThru || !migrationState?.pickup) return;

  const driveThruPrice = toNumber(driveThruSlider.value);
  const pickupPrice = toNumber(pickupSlider.value);
  const gap = pickupPrice - driveThruPrice;
  const gapChangePct = migrationState.baselineGap === 0
    ? 0
    : ((gap - migrationState.baselineGap) / Math.abs(migrationState.baselineGap)) * 100;

  const driveThruChangePct = ((driveThruPrice - migrationState.driveThru.avgCheck) / migrationState.driveThru.avgCheck) * 100;
  const pickupChangePct = ((pickupPrice - migrationState.pickup.avgCheck) / migrationState.pickup.avgCheck) * 100;

  const asymmetry = toNumber(cohort.migration_asymmetry_factor, 2.2) / 2.2;
  const upgradeWillingness = toNumber(cohort.migration_upgrade, 1);
  const downgradeWillingness = toNumber(cohort.migration_downgrade, 1.2);

  const gapSignal = ((migrationState.baselineGap - gap) / Math.max(1, Math.abs(migrationState.baselineGap || 1))) * 100;
  let driveThruToPickupPct = 2.6 + Math.max(0, driveThruChangePct) * 0.24 * asymmetry + Math.max(0, gapSignal) * 0.08 * upgradeWillingness;
  let pickupToDriveThruPct = 1.5 + Math.max(0, pickupChangePct) * 0.28 * asymmetry + Math.max(0, -gapSignal) * 0.05 * downgradeWillingness;
  let driveThruLeakagePct = 1.1 + Math.max(0, driveThruChangePct) * 0.10;
  let pickupLeakagePct = 0.9 + Math.max(0, pickupChangePct) * 0.14;

  driveThruToPickupPct = clamp(driveThruToPickupPct, 0.8, 16.0);
  pickupToDriveThruPct = clamp(pickupToDriveThruPct, 0.5, 13.0);
  driveThruLeakagePct = clamp(driveThruLeakagePct, 0.4, 6.0);
  pickupLeakagePct = clamp(pickupLeakagePct, 0.4, 7.0);

  if (driveThruToPickupPct + driveThruLeakagePct > 18) {
    driveThruToPickupPct = 18 - driveThruLeakagePct;
  }
  if (pickupToDriveThruPct + pickupLeakagePct > 16) {
    pickupToDriveThruPct = 16 - pickupLeakagePct;
  }

  const driveThruBase = migrationState.driveThru.transactions;
  const pickupBase = migrationState.pickup.transactions;
  const otherBase = migrationState.otherTransactions;

  const driveThruToPickup = Math.round(driveThruBase * (driveThruToPickupPct / 100));
  const pickupToDriveThru = Math.round(pickupBase * (pickupToDriveThruPct / 100));
  const driveThruLeakage = Math.round(driveThruBase * (driveThruLeakagePct / 100));
  const pickupLeakage = Math.round(pickupBase * (pickupLeakagePct / 100));
  const driveThruStay = Math.max(0, Math.round(driveThruBase - driveThruToPickup - driveThruLeakage));
  const pickupStay = Math.max(0, Math.round(pickupBase - pickupToDriveThru - pickupLeakage));

  const projectedDriveThru = driveThruStay + pickupToDriveThru;
  const projectedPickup = pickupStay + driveThruToPickup;
  const projectedOther = otherBase + driveThruLeakage + pickupLeakage;
  const projectedTotal = projectedDriveThru + projectedPickup + projectedOther;

  const projectedDriveThruShare = projectedTotal > 0 ? projectedDriveThru / projectedTotal * 100 : 0;
  const projectedPickupShare = projectedTotal > 0 ? projectedPickup / projectedTotal * 100 : 0;

  document.getElementById('mig-adlite-display').textContent = formatCurrency(driveThruPrice);
  document.getElementById('mig-adfree-display').textContent = formatCurrency(pickupPrice);
  document.getElementById('mig-price-gap').textContent = formatCurrency(gap);
  document.getElementById('mig-gap-change').textContent = `${gapChangePct >= 0 ? '+' : ''}${gapChangePct.toFixed(1)}%`;

  document.getElementById('mig-adlite-pct').textContent = `${projectedDriveThruShare.toFixed(1)}%`;
  document.getElementById('mig-adfree-pct').textContent = `${projectedPickupShare.toFixed(1)}%`;

  const driveThruToPickupRev = driveThruToPickup * (pickupPrice - driveThruPrice);
  const pickupToDriveThruRev = pickupToDriveThru * (driveThruPrice - pickupPrice);
  const driveThruLeakageRev = driveThruLeakage * ((migrationState.otherAvgCheck * 0.6) - driveThruPrice);
  const pickupLeakageRev = pickupLeakage * ((migrationState.otherAvgCheck * 0.6) - pickupPrice);

  document.getElementById('mig-upgrade-pct').textContent = `${driveThruToPickupPct.toFixed(1)}%`;
  document.getElementById('mig-upgrade-subs').textContent = `${formatNumber(driveThruToPickup)} / wk`;
  document.getElementById('mig-upgrade-rev').textContent = `${driveThruToPickupRev >= 0 ? '+' : ''}${formatCurrency(driveThruToPickupRev, 0)}`;
  document.getElementById('mig-upgrade-rev').className = driveThruToPickupRev >= 0 ? 'text-success' : 'text-danger';

  document.getElementById('mig-downgrade-pct').textContent = `${pickupToDriveThruPct.toFixed(1)}%`;
  document.getElementById('mig-downgrade-subs').textContent = `${formatNumber(pickupToDriveThru)} / wk`;
  document.getElementById('mig-downgrade-rev').textContent = `${pickupToDriveThruRev >= 0 ? '+' : ''}${formatCurrency(pickupToDriveThruRev, 0)}`;
  document.getElementById('mig-downgrade-rev').className = pickupToDriveThruRev >= 0 ? 'text-success' : 'text-danger';

  document.getElementById('mig-cancel-lite-pct').textContent = `${driveThruLeakagePct.toFixed(1)}%`;
  document.getElementById('mig-cancel-lite-subs').textContent = `${formatNumber(driveThruLeakage)} / wk`;
  document.getElementById('mig-cancel-lite-rev').textContent = `${driveThruLeakageRev >= 0 ? '+' : ''}${formatCurrency(driveThruLeakageRev, 0)}`;
  document.getElementById('mig-cancel-lite-rev').className = driveThruLeakageRev >= 0 ? 'text-success' : 'text-danger';

  document.getElementById('mig-cancel-free-pct').textContent = `${pickupLeakagePct.toFixed(1)}%`;
  document.getElementById('mig-cancel-free-subs').textContent = `${formatNumber(pickupLeakage)} / wk`;
  document.getElementById('mig-cancel-free-rev').textContent = `${pickupLeakageRev >= 0 ? '+' : ''}${formatCurrency(pickupLeakageRev, 0)}`;
  document.getElementById('mig-cancel-free-rev').className = pickupLeakageRev >= 0 ? 'text-success' : 'text-danger';

  updateSankeyDiagram({
    driveThruBase,
    pickupBase,
    driveThruStay,
    pickupStay,
    driveThruToPickup,
    pickupToDriveThru,
    driveThruLeakage,
    pickupLeakage
  });

  if (migrationChartSimple) {
    migrationChartSimple.data.datasets[0].data = [
      migrationState.baselineDriveThruShare,
      migrationState.baselineDriveThruShare * 0.75 + projectedDriveThruShare * 0.25,
      migrationState.baselineDriveThruShare * 0.5 + projectedDriveThruShare * 0.5,
      migrationState.baselineDriveThruShare * 0.25 + projectedDriveThruShare * 0.75,
      projectedDriveThruShare
    ];
    migrationChartSimple.data.datasets[1].data = [
      migrationState.baselinePickupShare,
      migrationState.baselinePickupShare * 0.75 + projectedPickupShare * 0.25,
      migrationState.baselinePickupShare * 0.5 + projectedPickupShare * 0.5,
      migrationState.baselinePickupShare * 0.25 + projectedPickupShare * 0.75,
      projectedPickupShare
    ];
    migrationChartSimple.update('none');
  }
}

function setupMigrationInteractivity() {
  const driveThruSlider = document.getElementById('mig-adlite-slider');
  const pickupSlider = document.getElementById('mig-adfree-slider');
  const cohortSelect = document.getElementById('mig-cohort-select');
  if (!driveThruSlider || !pickupSlider) return;

  driveThruSlider.addEventListener('input', updateMigrationModel);
  pickupSlider.addEventListener('input', updateMigrationModel);
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

    if (!migrationState.driveThru || !migrationState.pickup) {
      throw new Error('Drive-Thru and Pickup / App data are required for Taco Bell migration modeling.');
    }

    setSliderDefaults();
    createMigrationChartSimple();
    setupMigrationInteractivity();
    updateMigrationModel();
  } catch (error) {
    console.error('Failed to initialize Taco Bell migration model:', error);
    const container = document.getElementById('step-5-migration-container');
    if (container) {
      container.innerHTML = `
        <div class="alert alert-danger">
          <i class="bi bi-exclamation-triangle me-2"></i>
          Failed to load Taco Bell channel migration inputs. Please refresh the page.
        </div>
      `;
    }
  }
}

window.initMigrationSimple = initMigrationSimple;
