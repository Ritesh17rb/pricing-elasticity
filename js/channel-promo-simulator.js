/**
 * Channel Promotions Simulator
 * Step 1: Start from current Mass vs Prestige channels and adjust promo depth.
 *
 * Uses:
 *  - channel_weekly.csv via getWeeklyData('all') for volume, revenue, margin
 *  - elasticity-params.json for base elasticity by tier
 */

import { getWeeklyData, loadElasticityParams } from './data-loader.js';
import { formatCurrency, formatPercent } from './utils.js';

let channelPromoRevenueChart = null;
let channelPromoProfitChart = null;

let baseline = null;

async function initializeChannelPromoSimulator() {
  const root = document.getElementById('channel-promo-simulator');
  if (!root) {
    console.warn('Channel Promotions Simulator root not found');
    return;
  }

  try {
    const [weeklyData, params] = await Promise.all([
      getWeeklyData('all'),
      loadElasticityParams()
    ]);

    if (!weeklyData || weeklyData.length === 0) {
      console.warn('No weekly data available for Channel Promotions Simulator');
      return;
    }

    // Get latest week per tier
    const latestWeek = {};
    ['ad_supported', 'ad_free'].forEach(tier => {
      const tierData = weeklyData.filter(d => d.tier === tier);
      latestWeek[tier] = tierData[tierData.length - 1];
    });

    const massRow = latestWeek.ad_supported;
    const prestigeRow = latestWeek.ad_free;

    if (!massRow || !prestigeRow) {
      console.warn('Missing latest week rows for tiers in Channel Promotions Simulator');
      return;
    }

    // Baseline monthly metrics by channel group
    baseline = {
      mass: {
        price: massRow.price,
        unitsWeekly: massRow.units_sold,
        revenueWeekly: massRow.revenue,
        marginPct: massRow.gross_margin_pct,
        elasticity: params.tiers.ad_supported.base_elasticity
      },
      prestige: {
        price: prestigeRow.price,
        unitsWeekly: prestigeRow.units_sold,
        revenueWeekly: prestigeRow.revenue,
        marginPct: prestigeRow.gross_margin_pct,
        elasticity: params.tiers.ad_free.base_elasticity
      }
    };

    // Set up event listeners
    const massSlider = document.getElementById('mass-promo-slider');
    const prestigeSlider = document.getElementById('prestige-promo-slider');
    const objectiveSelect = document.getElementById('channel-promo-objective');

    if (!massSlider || !prestigeSlider || !objectiveSelect) {
      console.warn('Channel Promotions Simulator controls not found');
      return;
    }

    const updateValues = () => {
      document.getElementById('mass-promo-value').textContent =
        massSlider.value + '%';
      document.getElementById('prestige-promo-value').textContent =
        prestigeSlider.value + '%';
      updateChannelPromoSimulator();
    };

    massSlider.addEventListener('input', updateValues);
    prestigeSlider.addEventListener('input', updateValues);
    objectiveSelect.addEventListener('change', updateChannelPromoSimulator);

    // Initial render
    updateValues();
    console.log('✅ Channel Promotions Simulator initialized');
  } catch (error) {
    console.error('Error initializing Channel Promotions Simulator:', error);
  }
}

function computeScenarioForTier(b, promoDepthPct) {
  const promoFrac = promoDepthPct / 100;
  const newPrice = b.price * (1 - promoFrac);
  const priceRatio = newPrice / b.price || 1;

  // Constant elasticity demand: Q1 = Q0 * (P1/P0)^ε
  const unitsWeeklyScenario =
    b.unitsWeekly * Math.pow(priceRatio, b.elasticity || -2.0);

  const revenueWeeklyScenario = newPrice * unitsWeeklyScenario;
  const profitWeeklyScenario = revenueWeeklyScenario * b.marginPct;

  return {
    revenueMonthlyBaseline: b.revenueWeekly * 4,
    profitMonthlyBaseline: b.revenueWeekly * b.marginPct * 4,
    revenueMonthlyScenario: revenueWeeklyScenario * 4,
    profitMonthlyScenario: profitWeeklyScenario * 4
  };
}

function updateChannelPromoSimulator() {
  if (!baseline) return;

  const massSlider = document.getElementById('mass-promo-slider');
  const prestigeSlider = document.getElementById('prestige-promo-slider');
  const objectiveSelect = document.getElementById('channel-promo-objective');

  if (!massSlider || !prestigeSlider || !objectiveSelect) return;

  const massPromo = Number(massSlider.value) || 0;
  const prestigePromo = Number(prestigeSlider.value) || 0;

  const mass = computeScenarioForTier(baseline.mass, massPromo);
  const prestige = computeScenarioForTier(baseline.prestige, prestigePromo);

  const totalBaselineRevenue =
    mass.revenueMonthlyBaseline + prestige.revenueMonthlyBaseline;
  const totalScenarioRevenue =
    mass.revenueMonthlyScenario + prestige.revenueMonthlyScenario;

  const totalBaselineProfit =
    mass.profitMonthlyBaseline + prestige.profitMonthlyBaseline;
  const totalScenarioProfit =
    mass.profitMonthlyScenario + prestige.profitMonthlyScenario;

  const revenueDeltaPct =
    totalBaselineRevenue > 0
      ? (totalScenarioRevenue - totalBaselineRevenue) / totalBaselineRevenue
      : 0;
  const profitDeltaPct =
    totalBaselineProfit > 0
      ? (totalScenarioProfit - totalBaselineProfit) / totalBaselineProfit
      : 0;

  // Update summary cards
  const revenueDeltaEl = document.getElementById(
    'channel-promo-revenue-delta'
  );
  const revenueNoteEl = document.getElementById(
    'channel-promo-revenue-note'
  );
  const profitDeltaEl = document.getElementById('channel-promo-profit-delta');
  const profitNoteEl = document.getElementById('channel-promo-profit-note');

  if (revenueDeltaEl && revenueNoteEl) {
    revenueDeltaEl.textContent = formatPercent(revenueDeltaPct);
    revenueDeltaEl.className =
      'fs-4 fw-bold ' +
      (revenueDeltaPct >= 0 ? 'text-success' : 'text-danger');
    revenueNoteEl.textContent =
      'Baseline = ' + formatCurrency(totalBaselineRevenue);
  }

  if (profitDeltaEl && profitNoteEl) {
    profitDeltaEl.textContent = formatPercent(profitDeltaPct);
    profitDeltaEl.className =
      'fs-4 fw-bold ' +
      (profitDeltaPct >= 0 ? 'text-success' : 'text-danger');
    profitNoteEl.textContent =
      'Baseline = ' + formatCurrency(totalBaselineProfit);
  }

  // Promo posture insight
  const posturePill = document.getElementById('channel-promo-posture-pill');
  const postureLine1 = document.getElementById('channel-promo-posture-line1');
  const postureLine2 = document.getElementById('channel-promo-posture-line2');

  if (posturePill && postureLine1 && postureLine2) {
    const massShareBaseline = totalBaselineRevenue > 0 ? mass.revenueMonthlyBaseline / totalBaselineRevenue : 0;
    const massShareScenario = totalScenarioRevenue > 0 ? mass.revenueMonthlyScenario / totalScenarioRevenue : 0;
    const deltaSharePts = (massShareScenario - massShareBaseline) * 100;

    let posture = 'Balanced';
    let pillClass = 'badge rounded-pill bg-secondary-subtle text-body-secondary';
    let line1 = '';

    if (Math.abs(revenueDeltaPct) < 0.01 && Math.abs(profitDeltaPct) < 0.01) {
      posture = 'Neutral';
      pillClass = 'badge rounded-pill bg-secondary-subtle text-body-secondary';
      line1 = 'Promo depth is close to baseline; impact is minimal.';
    } else if (revenueDeltaPct >= 0 && profitDeltaPct >= 0) {
      posture = 'Win–Win';
      pillClass = 'badge rounded-pill bg-success-subtle text-success';
      line1 = 'Boosts both sales and profit vs baseline.';
    } else if (revenueDeltaPct > 0 && profitDeltaPct < 0) {
      posture = 'Revenue-heavy';
      pillClass = 'badge rounded-pill bg-primary-subtle text-primary';
      line1 = 'Leans into sales at the expense of profit.';
    } else if (revenueDeltaPct <= 0 && profitDeltaPct > 0) {
      posture = 'Profit-protective';
      pillClass = 'badge rounded-pill bg-warning-subtle text-warning';
      line1 = 'Protects profit while sacrificing some sales.';
    } else {
      posture = 'Unfavorable';
      pillClass = 'badge rounded-pill bg-danger-subtle text-danger';
      line1 = 'Reduces both sales and profit vs baseline.';
    }

    posturePill.className = pillClass;
    posturePill.textContent = posture;

    const massDirection =
      deltaSharePts > 0
        ? `shifts revenue toward Mass (+${deltaSharePts.toFixed(1)} pts)`
        : deltaSharePts < 0
          ? `shifts revenue toward Prestige (${deltaSharePts.toFixed(1)} pts)`
          : 'keeps the Mass vs Prestige mix stable';

    postureLine1.textContent = line1;
    postureLine2.textContent = `Current mix ${massDirection}.`;
  }

  // Prepare chart data
  const labels = ['Mass Channel', 'Prestige Channel'];

  const revenueBaselineData = [
    mass.revenueMonthlyBaseline,
    prestige.revenueMonthlyBaseline
  ];
  const revenueScenarioData = [
    mass.revenueMonthlyScenario,
    prestige.revenueMonthlyScenario
  ];

  const profitBaselineData = [
    mass.profitMonthlyBaseline,
    prestige.profitMonthlyBaseline
  ];
  const profitScenarioData = [
    mass.profitMonthlyScenario,
    prestige.profitMonthlyScenario
  ];

  // Revenue chart
  const revenueCtx = document.getElementById('channel-promo-revenue-chart');
  if (revenueCtx) {
    if (channelPromoRevenueChart) {
      channelPromoRevenueChart.data.datasets[0].data = revenueBaselineData;
      channelPromoRevenueChart.data.datasets[1].data = revenueScenarioData;
      channelPromoRevenueChart.update();
    } else if (window.Chart) {
      channelPromoRevenueChart = new Chart(revenueCtx, {
        type: 'bar',
        data: {
          labels,
          datasets: [
            {
              label: 'Baseline',
              data: revenueBaselineData,
              backgroundColor: 'rgba(148, 163, 184, 0.8)'
            },
            {
              label: 'With promos',
              data: revenueScenarioData,
              backgroundColor: 'rgba(37, 99, 235, 0.9)'
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          scales: {
            y: {
              ticks: {
                callback: value => {
                  return formatCurrency(value)
                    .replace('.00', '')
                    .replace('$', '$');
                }
              }
            }
          },
          plugins: {
            legend: {
              position: 'bottom'
            }
          }
        }
      });
    }
  }

  // Profit chart
  const profitCtx = document.getElementById('channel-promo-profit-chart');
  if (profitCtx) {
    if (channelPromoProfitChart) {
      channelPromoProfitChart.data.datasets[0].data = profitBaselineData;
      channelPromoProfitChart.data.datasets[1].data = profitScenarioData;
      channelPromoProfitChart.update();
    } else if (window.Chart) {
      channelPromoProfitChart = new Chart(profitCtx, {
        type: 'bar',
        data: {
          labels,
          datasets: [
            {
              label: 'Baseline',
              data: profitBaselineData,
              backgroundColor: 'rgba(148, 163, 184, 0.8)'
            },
            {
              label: 'With promos',
              data: profitScenarioData,
              backgroundColor: 'rgba(16, 185, 129, 0.9)'
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          scales: {
            y: {
              ticks: {
                callback: value => {
                  return formatCurrency(value)
                    .replace('.00', '')
                    .replace('$', '$');
                }
              }
            }
          },
          plugins: {
            legend: {
              position: 'bottom'
            }
          }
        }
      });
    }
  }
}

// Expose initializer on window for step-navigation to call after data load
window.initializeChannelPromoSimulator = initializeChannelPromoSimulator;

