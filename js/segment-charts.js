/**
 * Segment Charts Module
 * Visualization functions for customer segmentation and elasticity analysis
 *
 * Dependencies: D3.js v7, segmentation-engine.js
 */

/**
 * Update the "Selected Cohort Insight" panel in Step 4.
 */
function updateSegmentDetailPanel(title, bodyHtml) {
    const titleEl = document.getElementById('segment-detail-title');
    const bodyEl = document.getElementById('segment-detail-body');
    if (!titleEl || !bodyEl) return;

    titleEl.textContent = title;
    bodyEl.innerHTML = bodyHtml || '';
}

const SEGMENT_AXIS_META = {
    acquisition: {
        label: 'Acquisition',
        helper: 'New or occasional customers driven by promotions and price sensitivity',
        positive: 'Low sensitivity',
        neutral: 'Moderate sensitivity',
        negative: 'Highly sensitive'
    },
    engagement: {
        label: 'Engagement',
        helper: 'Repeat behavior, loyalty strength, and retention risk',
        positive: 'Stable loyalty',
        neutral: 'Watch closely',
        negative: 'High repeat-loss risk'
    },
    monetization: {
        label: 'Monetization',
        helper: 'Basket size, upsell behavior, and premium add-ons',
        positive: 'Basket headroom',
        neutral: 'Mixed',
        negative: 'High switching risk'
    }
};

function getSegmentAxisMeta(axis) {
    return SEGMENT_AXIS_META[axis] || SEGMENT_AXIS_META.engagement;
}

function getSegmentAxisSentiment(axis, elasticity) {
    if (!Number.isFinite(elasticity)) return 'neutral';

    if (axis === 'acquisition') {
        const magnitude = Math.abs(elasticity);
        if (magnitude >= 2.0) return 'negative';
        if (magnitude >= 1.0) return 'neutral';
        return 'positive';
    }

    if (axis === 'engagement') {
        if (elasticity >= 1.5) return 'negative';
        if (elasticity >= 0.7) return 'neutral';
        return 'positive';
    }

    if (elasticity >= 1.3) return 'negative';
    if (elasticity >= 0.8) return 'neutral';
    return 'positive';
}

function getSegmentAxisColor(axis, elasticity) {
    const sentiment = getSegmentAxisSentiment(axis, elasticity);
    if (sentiment === 'negative') return '#dc2626';
    if (sentiment === 'neutral') return '#d97706';
    return '#16a34a';
}

function getSegmentAxisRiskLabel(axis, elasticity) {
    const meta = getSegmentAxisMeta(axis);
    const sentiment = getSegmentAxisSentiment(axis, elasticity);
    return meta[sentiment] || meta.neutral;
}

function getSegmentAxisPair(axis) {
    if (axis === 'acquisition') {
        return {
            xKey: 'acquisition',
            yKey: 'engagement',
            xLabel: 'Acquisition',
            yLabel: 'Engagement',
            xCategories: window.segmentEngine.axisDefinitions.acquisition,
            yCategories: window.segmentEngine.axisDefinitions.engagement
        };
    }

    if (axis === 'engagement') {
        return {
            xKey: 'engagement',
            yKey: 'monetization',
            xLabel: 'Engagement',
            yLabel: 'Monetization',
            xCategories: window.segmentEngine.axisDefinitions.engagement,
            yCategories: window.segmentEngine.axisDefinitions.monetization
        };
    }

    return {
        xKey: 'monetization',
        yKey: 'acquisition',
        xLabel: 'Monetization',
        yLabel: 'Acquisition',
        xCategories: window.segmentEngine.axisDefinitions.monetization,
        yCategories: window.segmentEngine.axisDefinitions.acquisition
    };
}

function formatSegmentCurrency(value) {
    return `$${(Number(value) || 0).toFixed(2)}`;
}

function formatSegmentPercent(value, digits = 1) {
    return `${((Number(value) || 0) * 100).toFixed(digits)}%`;
}

function buildSegmentDetailHtml(summary, metrics = []) {
    return `
      <div class="segment-detail-panel-summary">${summary}</div>
      <div class="segment-detail-metrics">
        ${metrics.map(metric => `
          <div class="segment-detail-metric">
            <span class="segment-detail-metric-label">${metric.label}</span>
            <span class="segment-detail-metric-value${metric.tone ? ` is-${metric.tone}` : ''}">${metric.value}</span>
          </div>
        `).join('')}
      </div>
    `;
}

function getTierDisplayLabel(tier) {
    return tier === 'ad_supported'
        ? 'Entry & Value Meals'
        : tier === 'ad_free'
            ? 'Core & Premium Meals'
            : String(tier || '').replace(/_/g, ' ');
}

function isDarkThemeActive() {
    return document.documentElement.getAttribute('data-bs-theme') === 'dark';
}

function getSegmentChartPalette() {
    if (isDarkThemeActive()) {
        return {
            surface: '#08111f',
            title: '#f8fafc',
            text: '#e2e8f0',
            muted: '#94a3b8',
            subtle: '#cbd5e1',
            axisStroke: 'rgba(148, 163, 184, 0.48)',
            gridStroke: 'rgba(148, 163, 184, 0.32)',
            gridSoft: 'rgba(148, 163, 184, 0.2)',
            polygonFill: 'rgba(30, 41, 59, 0.36)',
            legendNeutral: '#cbd5e1',
            legendCircle: 'rgba(148, 163, 184, 0.38)',
            pointStroke: 'rgba(226, 232, 240, 0.92)',
            pointStrokeHighlight: '#f8fafc'
        };
    }

    return {
        surface: '#fafafa',
        title: '#333333',
        text: '#111827',
        muted: '#64748b',
        subtle: '#475569',
        axisStroke: '#94a3b8',
        gridStroke: '#cbd5e1',
        gridSoft: '#e2e8f0',
        polygonFill: 'rgba(148, 163, 184, 0.05)',
        legendNeutral: '#666666',
        legendCircle: '#cccccc',
        pointStroke: '#ffffff',
        pointStrokeHighlight: '#0f172a'
    };
}

function styleAxis(axisGroup, palette) {
    axisGroup.selectAll('path, line')
        .attr('stroke', palette.axisStroke);
    axisGroup.selectAll('text')
        .attr('fill', palette.text);
}

/**
 * Render segment KPI dashboard cards
 * @param {string} containerId - DOM element ID
 * @param {Object} aggregatedKPIs - From segmentEngine.aggregateKPIs()
 */
export function renderSegmentKPICards(containerId, aggregatedKPIs, overrideKPIs = null) {
    const container = d3.select(`#${containerId}`);
    container.selectAll('*').remove();

    const resolvedKPIs = overrideKPIs || aggregatedKPIs;

    if (!resolvedKPIs || resolvedKPIs.total_customers === 0) {
        container.append('p')
            .attr('class', 'text-muted text-center')
            .text('No segments match the selected filters.');

        updateSegmentDetailPanel(
            'No cohorts match the selected filters.',
            'Try widening the filters to bring cohorts back into view.'
        );
        return;
    }

    // Helper to safely format numbers, replacing NaN/null/undefined with 0
    const safeNumber = (val, defaultVal = 0) => {
        if (val === null || val === undefined || isNaN(val)) return defaultVal;
        return val;
    };

    const kpiData = [
        {
            label: 'Total Customers',
            value: safeNumber(resolvedKPIs.total_customers, 0).toLocaleString(),
            icon: 'bi-people-fill',
            color: '#667eea'
        },
        {
            label: 'Repeat Loss Rate',
            value: `${(safeNumber(resolvedKPIs.weighted_repeat_loss, 0) * 100).toFixed(1)}%`,
            icon: 'bi-graph-down-arrow',
            color: '#f093fb'
        },
        {
            label: 'Avg Order Value',
            value: `$${safeNumber(resolvedKPIs.weighted_aov, 0).toFixed(1)}`,
            icon: 'bi-currency-dollar',
            color: '#4facfe'
        },
        {
            label: 'Units / Order',
            value: safeNumber(resolvedKPIs.weighted_units, 0).toFixed(1),
            icon: 'bi-basket2',
            color: '#43e97b'
        },
        {
            label: 'Cohorts',
            value: safeNumber(resolvedKPIs.segment_count, 0),
            icon: 'bi-diagram-3-fill',
            color: '#fa709a'
        }
    ];

    const cardContainer = container.append('div')
        .attr('class', 'row g-3');

    const cards = cardContainer.selectAll('.col')
        .data(kpiData)
        .join('div')
        .attr('class', 'col-md-6 col-lg')
        .append('div')
        .attr('class', 'card kpi-card h-100')
        .style('border-left', d => `4px solid ${d.color}`);

    const cardBody = cards.append('div')
        .attr('class', 'card-body');

    cardBody.append('div')
        .attr('class', 'd-flex justify-content-between align-items-start mb-2');

    cardBody.append('i')
        .attr('class', d => `${d.icon} fs-2 mb-2`)
        .style('color', d => d.color);

    cardBody.append('div')
        .attr('class', 'text-muted small text-uppercase mb-1')
        .text(d => d.label);

    cardBody.append('div')
        .attr('class', 'fs-4 fw-bold')
        .text(d => d.value);
}

/**
 * Render enhanced elasticity heatmap with segment filtering
 * @param {string} containerId - DOM element ID
 * @param {string} tier - Subscription tier
 * @param {Object} filters - Segment filters
 * @param {string} axis - Analysis axis ('engagement', 'monetization', 'acquisition')
 */
export function renderSegmentElasticityHeatmap(containerId, tier, filters = {}, axis = 'engagement') {
    const container = d3.select(`#${containerId}`);
    container.selectAll('*').remove();
    container
        .style('position', 'relative')
        .style('display', 'flex')
        .style('justify-content', 'center');

    const segments = window.segmentEngine.filterSegments(filters);
    if (!segments || segments.length === 0) {
        container.append('p')
            .attr('class', 'alert alert-warning')
            .text('No segments match the selected filters.');
        return;
    }

    const tierSegments = segments.filter(segment => segment.tier === tier);
    if (!tierSegments.length) {
        container.append('p')
            .attr('class', 'alert alert-info')
            .text(`No ${tier} segments match the selected filters.`);
        return;
    }

    const axisMeta = getSegmentAxisMeta(axis);
    const theme = getSegmentChartPalette();
    const pairMeta = getSegmentAxisPair(axis);
    const totalCustomers = d3.sum(tierSegments, d => parseInt(d.customer_count || 0, 10));
    const cellMap = new Map();

    tierSegments.forEach(segment => {
        const xValue = segment[pairMeta.xKey];
        const yValue = segment[pairMeta.yKey];
        const customers = parseInt(segment.customer_count || 0, 10);
        const elasticity = window.segmentEngine.getElasticity(tier, segment.compositeKey, axis) || 0;
        const key = `${xValue}|${yValue}`;
        const current = cellMap.get(key) || {
            xValue,
            yValue,
            customers: 0,
            weightedElasticity: 0,
            weightedRepeatLoss: 0,
            weightedAov: 0,
            cohortCount: 0,
            topCompositeKey: segment.compositeKey,
            topCustomers: 0
        };

        current.customers += customers;
        current.weightedElasticity += elasticity * customers;
        current.weightedRepeatLoss += (parseFloat(segment.repeat_loss_rate) || 0) * customers;
        current.weightedAov += (parseFloat(segment.avg_order_value) || 0) * customers;
        current.cohortCount += 1;

        if (customers > current.topCustomers) {
            current.topCustomers = customers;
            current.topCompositeKey = segment.compositeKey;
        }

        cellMap.set(key, current);
    });

    const heatmapData = [];
    pairMeta.yCategories.forEach(yValue => {
        pairMeta.xCategories.forEach(xValue => {
            const aggregated = cellMap.get(`${xValue}|${yValue}`);
            if (!aggregated) {
                heatmapData.push({
                    xValue,
                    yValue,
                    customers: 0,
                    customerShare: 0,
                    elasticity: null,
                    repeatLoss: 0,
                    avgOrderValue: 0,
                    cohortCount: 0,
                    compositeKey: null
                });
                return;
            }

            heatmapData.push({
                xValue,
                yValue,
                customers: aggregated.customers,
                customerShare: totalCustomers > 0 ? aggregated.customers / totalCustomers : 0,
                elasticity: aggregated.customers > 0 ? aggregated.weightedElasticity / aggregated.customers : 0,
                repeatLoss: aggregated.customers > 0 ? aggregated.weightedRepeatLoss / aggregated.customers : 0,
                avgOrderValue: aggregated.customers > 0 ? aggregated.weightedAov / aggregated.customers : 0,
                cohortCount: aggregated.cohortCount,
                compositeKey: aggregated.topCompositeKey
            });
        });
    });

    const margin = { top: 90, right: 180, bottom: 110, left: 180 };
    const cellSize = 72;
    const width = pairMeta.xCategories.length * cellSize;
    const height = pairMeta.yCategories.length * cellSize;
    const maxShare = d3.max(heatmapData, d => d.customerShare) || 0;

    const svg = container.append('svg')
        .attr('width', width + margin.left + margin.right)
        .attr('height', height + margin.top + margin.bottom)
        .append('g')
        .attr('transform', `translate(${margin.left},${margin.top})`);

    const xScale = d3.scaleBand()
        .domain(pairMeta.xCategories)
        .range([0, width])
        .padding(0.08);

    const yScale = d3.scaleBand()
        .domain(pairMeta.yCategories)
        .range([0, height])
        .padding(0.08);

    const tooltip = container.append('div')
        .attr('class', 'position-absolute bg-dark text-white p-2 rounded shadow-sm')
        .style('display', 'none')
        .style('pointer-events', 'none')
        .style('font-size', '12px')
        .style('z-index', '1000');

    const cells = svg.selectAll('.heatmap-cell')
        .data(heatmapData)
        .join('g')
        .attr('class', 'heatmap-cell')
        .attr('transform', d => `translate(${xScale(d.xValue)},${yScale(d.yValue)})`);

    cells.append('rect')
        .attr('width', xScale.bandwidth())
        .attr('height', yScale.bandwidth())
        .attr('fill', d => d.elasticity === null ? '#e2e8f0' : getSegmentAxisColor(axis, d.elasticity))
        .attr('fill-opacity', d => d.elasticity === null ? 0.35 : 0.18)
        .attr('stroke', d => d.elasticity === null ? '#cbd5e1' : getSegmentAxisColor(axis, d.elasticity))
        .attr('stroke-width', d => d.elasticity === null ? 1.2 : 2)
        .attr('rx', 14)
        .style('cursor', d => d.elasticity === null ? 'default' : 'pointer')
        .on('mouseenter', function(event, d) {
            if (d.elasticity === null) return;

            d3.select(this)
                .attr('stroke-width', 3)
                .attr('fill-opacity', 0.28);

            const containerNode = container.node();
            const containerRect = containerNode.getBoundingClientRect();
            const x = event.clientX - containerRect.left;
            const y = event.clientY - containerRect.top;

            tooltip
                .style('display', 'block')
                .style('left', (x + 15) + 'px')
                .style('top', (y - 30) + 'px')
                .html(`
                    <strong>${window.segmentEngine.formatSegmentLabel(d.xValue)} x ${window.segmentEngine.formatSegmentLabel(d.yValue)}</strong><br>
                    <em class="text-white-50" style="font-size: 11px;">${d.cohortCount} cohort combination${d.cohortCount === 1 ? '' : 's'} in this cell</em><br>
                    <div style="margin-top: 8px; padding-top: 8px; border-top: 1px solid rgba(255,255,255,0.2);">
                        <strong>${axisMeta.label} elasticity:</strong> ${d.elasticity.toFixed(2)}<br>
                        <strong>Customers:</strong> ${d.customers.toLocaleString()} (${(d.customerShare * 100).toFixed(0)}%)<br>
                        <strong>Repeat loss:</strong> ${formatSegmentPercent(d.repeatLoss)}<br>
                        <strong>Average order value:</strong> ${formatSegmentCurrency(d.avgOrderValue)}
                    </div>
                `);
        })
        .on('mousemove', function(event) {
            const containerNode = container.node();
            const containerRect = containerNode.getBoundingClientRect();
            const x = event.clientX - containerRect.left;
            const y = event.clientY - containerRect.top;

            tooltip
                .style('left', (x + 15) + 'px')
                .style('top', (y - 30) + 'px');
        })
        .on('mouseleave', function(event, d) {
            d3.select(this)
                .attr('stroke-width', d.elasticity === null ? 1.2 : 2)
                .attr('fill-opacity', d.elasticity === null ? 0.35 : 0.18);

            tooltip.style('display', 'none');
        })
        .on('click', function(event, d) {
            if (d.elasticity === null) return;

            updateSegmentDetailPanel(
                `${window.segmentEngine.formatSegmentLabel(d.xValue)} x ${window.segmentEngine.formatSegmentLabel(d.yValue)}`,
                buildSegmentDetailHtml(
                    `${getSegmentAxisRiskLabel(axis, d.elasticity)} with ${d.customers.toLocaleString()} customers in this cohort intersection.`,
                    [
                        { label: `${axisMeta.label} elasticity`, value: d.elasticity.toFixed(2), tone: getSegmentAxisSentiment(axis, d.elasticity) },
                        { label: 'Customer share', value: `${(d.customerShare * 100).toFixed(0)}%` },
                        { label: 'Repeat loss', value: formatSegmentPercent(d.repeatLoss), tone: d.repeatLoss >= 0.14 ? 'negative' : 'positive' },
                        { label: 'Average order value', value: formatSegmentCurrency(d.avgOrderValue), tone: 'positive' }
                    ]
                )
            );
        });

    cells.append('rect')
        .attr('x', 8)
        .attr('y', yScale.bandwidth() - 10)
        .attr('width', d => maxShare > 0 ? Math.max(0, (d.customerShare / maxShare) * (xScale.bandwidth() - 16)) : 0)
        .attr('height', 4)
        .attr('rx', 999)
        .attr('fill', d => d.elasticity === null ? '#cbd5e1' : getSegmentAxisColor(axis, d.elasticity))
        .attr('opacity', d => d.elasticity === null ? 0.3 : 0.9);

    cells.append('text')
        .attr('x', xScale.bandwidth() / 2)
        .attr('y', yScale.bandwidth() / 2 - 6)
        .attr('text-anchor', 'middle')
        .attr('dominant-baseline', 'middle')
        .attr('font-size', '12px')
        .attr('font-weight', 'bold')
        .attr('fill', d => d.elasticity === null ? theme.muted : theme.text)
        .attr('pointer-events', 'none')
        .text(d => d.elasticity === null ? 'No data' : d.elasticity.toFixed(2));

    cells.append('text')
        .attr('x', xScale.bandwidth() / 2)
        .attr('y', yScale.bandwidth() / 2 + 12)
        .attr('text-anchor', 'middle')
        .attr('font-size', '10px')
        .attr('fill', d => d.elasticity === null ? theme.muted : theme.subtle)
        .attr('pointer-events', 'none')
        .text(d => d.elasticity === null ? '' : `${(d.customerShare * 100).toFixed(0)}% share`);

    const xAxis = svg.append('g')
        .attr('transform', `translate(0,${height})`)
        .call(d3.axisBottom(xScale).tickFormat(d => window.segmentEngine.formatSegmentLabel(d)));
    styleAxis(xAxis, theme);
    xAxis.selectAll('text')
        .attr('transform', 'rotate(-45)')
        .style('text-anchor', 'end')
        .attr('dx', '-0.8em')
        .attr('dy', '0.15em');

    const yAxis = svg.append('g')
        .call(d3.axisLeft(yScale).tickFormat(d => window.segmentEngine.formatSegmentLabel(d)));
    styleAxis(yAxis, theme);

    svg.append('text')
        .attr('x', width / 2)
        .attr('y', height + margin.bottom - 2)
        .attr('text-anchor', 'middle')
        .attr('font-weight', 'bold')
        .attr('fill', theme.text)
        .text(`${pairMeta.xLabel} axis`);

    svg.append('text')
        .attr('transform', 'rotate(-90)')
        .attr('x', -height / 2)
        .attr('y', -margin.left + 80)
        .attr('text-anchor', 'middle')
        .attr('font-weight', 'bold')
        .attr('fill', theme.text)
        .text(`${pairMeta.yLabel} axis`);

    const tierLabel = getTierDisplayLabel(tier);
    svg.append('text')
        .attr('x', width / 2)
        .attr('y', -margin.top / 2)
        .attr('text-anchor', 'middle')
        .attr('font-size', '16px')
        .attr('font-weight', 'bold')
        .attr('fill', theme.title)
        .text(`${axisMeta.label} heatmap - ${tierLabel}`);

    svg.append('text')
        .attr('x', width / 2)
        .attr('y', -margin.top / 2 + 18)
        .attr('text-anchor', 'middle')
        .attr('font-size', '11px')
        .attr('fill', theme.muted)
        .text('Elasticity Score (>1 = high sensitivity, <1 = stable demand)');

    const legend = svg.append('g')
        .attr('transform', `translate(${width + 35}, 30)`);

    legend.append('text')
        .attr('x', 0)
        .attr('y', 0)
        .attr('font-size', '12px')
        .attr('font-weight', 'bold')
        .attr('fill', theme.text)
        .text('Risk scale');

    [
        { label: axisMeta.positive, color: '#16a34a' },
        { label: axisMeta.neutral, color: '#d97706' },
        { label: axisMeta.negative, color: '#dc2626' }
    ].forEach((item, index) => {
        legend.append('rect')
            .attr('x', 0)
            .attr('y', 18 + index * 24)
            .attr('width', 14)
            .attr('height', 14)
            .attr('rx', 4)
            .attr('fill', item.color)
            .attr('fill-opacity', 0.18)
            .attr('stroke', item.color);

        legend.append('text')
            .attr('x', 22)
            .attr('y', 29 + index * 24)
            .attr('font-size', '10px')
            .attr('fill', theme.subtle)
            .text(item.label);
    });

    legend.append('text')
        .attr('x', 0)
        .attr('y', 108)
        .attr('font-size', '10px')
        .attr('fill', theme.muted)
        .text('Bottom bar = customer share');
}

/**
 * Render 3-axis radial visualization
 * @param {string} containerId - DOM element ID
 * @param {string} tier - Subscription tier
 * @param {string} highlightSegment - Optional segment composite key to highlight
 */
export function render3AxisRadialChart(containerId, tier, axis = 'engagement', filteredSegments = null, highlightSegment = null) {
    const container = d3.select(`#${containerId}`);
    container.selectAll('*').remove();

    const axisMeta = getSegmentAxisMeta(axis);
    const theme = getSegmentChartPalette();
    const segments = Array.isArray(filteredSegments) && filteredSegments.length
        ? filteredSegments
        : window.segmentEngine.getSegmentsForTier(tier);

    if (!segments || segments.length === 0) {
        container.append('div')
            .attr('class', 'alert alert-warning')
            .html(`<p class="mb-0">No segment data available for tier: ${tier}</p>`);
        return;
    }

    // Set container to relative positioning for tooltip
    container.style('position', 'relative');

    // Dimensions
    const width = 920;
    const height = 720;
    const centerX = width / 2;
    const centerY = height / 2;
    const axisLength = 250;

    // Create SVG
    const svg = container.append('svg')
        .attr('width', width)
        .attr('height', height)
        .style('background', theme.surface);

    // Define three axes at 120 degrees apart (retail framing)
    const axes = [
        {
            name: 'Monetization',
            helper: 'Basket size, upsell behavior, and premium add-ons',
            key: 'monetization',
            color: '#2563eb', // Blue
            angle: 90, // Vertical (up)
            segments: window.segmentEngine.axisDefinitions.monetization
        },
        {
            name: 'Engagement',
            helper: 'Repeat behavior, loyalty strength, and retention risk',
            key: 'engagement',
            color: '#22c55e', // Green
            angle: 210, // Left diagonal (210 degrees)
            segments: window.segmentEngine.axisDefinitions.engagement
        },
        {
            name: 'Acquisition',
            helper: 'New or occasional customers driven by promotions and price sensitivity',
            key: 'acquisition',
            color: '#ef4444', // Red
            angle: 330, // Right diagonal (330 degrees)
            segments: window.segmentEngine.axisDefinitions.acquisition
        }
    ];

    // Create tooltip
    const tooltip = container.append('div')
        .attr('class', 'position-absolute bg-dark text-white p-3 rounded shadow')
        .style('display', 'none')
        .style('pointer-events', 'none')
        .style('font-size', '12px')
        .style('z-index', '1000')
        .style('max-width', '300px');

    // Draw axes
    const axisEndpoints = [];
    axes.forEach(axis => {
        const radians = (axis.angle * Math.PI) / 180;
        const endX = centerX + Math.cos(radians) * axisLength;
        const endY = centerY - Math.sin(radians) * axisLength;
        axisEndpoints.push({ x: endX, y: endY, color: axis.color });

        // Axis line
        svg.append('line')
            .attr('x1', centerX)
            .attr('y1', centerY)
            .attr('x2', endX)
            .attr('y2', endY)
            .attr('stroke', axis.color)
            .attr('stroke-width', 3)
            .attr('opacity', 0.6);

        // Axis label (at the end)
        const labelDistance = 30;
        const labelX = centerX + Math.cos(radians) * (axisLength + labelDistance);
        const labelY = centerY - Math.sin(radians) * (axisLength + labelDistance);

        svg.append('text')
            .attr('x', labelX)
            .attr('y', labelY)
            .attr('text-anchor', 'middle')
            .attr('fill', axis.color)
            .attr('font-weight', 'bold')
            .attr('font-size', '14px')
            .text(axis.name);

        svg.append('text')
            .attr('x', labelX)
            .attr('y', labelY + 16)
            .attr('text-anchor', 'middle')
            .attr('fill', theme.subtle)
            .attr('font-size', '10px')
            .text(axis.helper);

        // Plot segment markers along the axis
        axis.segments.forEach((segmentId, index) => {
            const ratio = (index + 1) / (axis.segments.length + 1);
            const pointX = centerX + Math.cos(radians) * axisLength * ratio;
            const pointY = centerY - Math.sin(radians) * axisLength * ratio;

            // Segment label
            const labelInfo = window.segmentEngine.getSegmentInfo(segmentId);
            const label = labelInfo ? labelInfo.label : segmentId;

            // Position label perpendicular to axis
            const labelOffsetAngle = radians + Math.PI / 2;
            const labelOffset = 20;
            const textX = pointX + Math.cos(labelOffsetAngle) * labelOffset;
            const textY = pointY - Math.sin(labelOffsetAngle) * labelOffset;

            svg.append('text')
                .attr('x', textX)
                .attr('y', textY)
                .attr('text-anchor', 'middle')
                .attr('font-size', '9px')
                .attr('fill', theme.text)
                .text(label.length > 15 ? label.substring(0, 13) + '...' : label);

            // Marker circle
            svg.append('circle')
                .attr('cx', pointX)
                .attr('cy', pointY)
                .attr('r', 4)
                .attr('fill', axis.color)
                .attr('opacity', 0.4);
        });
    });

    svg.append('polygon')
        .attr('points', axisEndpoints.map(point => `${point.x},${point.y}`).join(' '))
        .attr('fill', theme.polygonFill)
        .attr('stroke', theme.gridStroke)
        .attr('stroke-width', 1.5)
        .attr('stroke-dasharray', '6,6');

    [0.25, 0.5, 0.75].forEach(level => {
        const points = axisEndpoints.map(point => {
            const x = centerX + (point.x - centerX) * level;
            const y = centerY + (point.y - centerY) * level;
            return `${x},${y}`;
        }).join(' ');

        svg.append('polygon')
            .attr('points', points)
            .attr('fill', 'none')
            .attr('stroke', theme.gridSoft)
            .attr('stroke-width', 1)
            .attr('stroke-dasharray', '4,6');
    });

    const segmentPositions = segments.map(seg => {
        const monetizationIdx = axes[0].segments.indexOf(seg.monetization);
        const engagementIdx = axes[1].segments.indexOf(seg.engagement);
        const acquisitionIdx = axes[2].segments.indexOf(seg.acquisition);

        const monetizationRatio = (monetizationIdx + 1) / (axes[0].segments.length + 1);
        const engagementRatio = (engagementIdx + 1) / (axes[1].segments.length + 1);
        const acquisitionRatio = (acquisitionIdx + 1) / (axes[2].segments.length + 1);
        const totalRatio = monetizationRatio + engagementRatio + acquisitionRatio;
        const weights = [
            monetizationRatio / totalRatio,
            engagementRatio / totalRatio,
            acquisitionRatio / totalRatio
        ];

        const x = axisEndpoints.reduce((sum, point, index) => sum + (point.x * weights[index]), 0);
        const y = axisEndpoints.reduce((sum, point, index) => sum + (point.y * weights[index]), 0);
        const axisElasticity = window.segmentEngine.getElasticity(tier, seg.compositeKey, axis) || 0;

        return {
            ...seg,
            x,
            y,
            monetizationIdx,
            engagementIdx,
            acquisitionIdx,
            axisElasticity,
            axisRisk: getSegmentAxisRiskLabel(axis, axisElasticity)
        };
    });

    const highlightedLabels = new Set([
        'Family Ritual Loyalist',
        'Deal-Seeking Customer',
        'Group Occasion Buyer'
    ]);

    segmentPositions.forEach((segment) => {
        segment.isHighlighted = highlightedLabels.has(window.segmentEngine.formatSegmentLabel(segment.acquisition))
            || highlightedLabels.has(window.segmentEngine.formatSegmentLabel(segment.engagement))
            || highlightedLabels.has(window.segmentEngine.formatSegmentLabel(segment.monetization));
    });

    // Determine radius scale based on customer count
    const radiusScale = d3.scaleSqrt()
        .domain([0, d3.max(segmentPositions, d => d.customer_count)])
        .range([3, 20]);

    // Draw segment data points
    svg.selectAll('.segment-point')
        .data(segmentPositions)
        .join('circle')
        .attr('class', 'segment-point')
        .attr('cx', d => d.x)
        .attr('cy', d => d.y)
        .attr('r', d => radiusScale(d.customer_count))
        .attr('fill', d => getSegmentAxisColor(axis, d.axisElasticity))
        .attr('stroke', d => d.isHighlighted ? theme.pointStrokeHighlight : theme.pointStroke)
        .attr('stroke-width', d => d.isHighlighted ? 3 : 2)
        .attr('opacity', d => d.isHighlighted ? 0.95 : 0.78)
        .style('cursor', 'pointer')
        .on('mouseenter', function(event, d) {
            d3.select(this)
                .attr('opacity', 1)
                .attr('stroke-width', d.isHighlighted ? 4 : 3);

            const segmentInfo = window.segmentEngine.formatCompositeKey(d.compositeKey);
            const segmentSummary = window.segmentEngine.generateSegmentSummary(d.compositeKey, {
                customer_count: d.customer_count,
                repeat_loss_rate: d.repeat_loss_rate,
                avg_order_value: d.avg_order_value
            });

            // Calculate position relative to container
            const containerNode = container.node();
            const containerRect = containerNode.getBoundingClientRect();
            const x = event.clientX - containerRect.left;
            const y = event.clientY - containerRect.top;

            tooltip
                .style('display', 'block')
                .style('left', (x + 15) + 'px')
                .style('top', (y - 30) + 'px')
                .html(`
                    <strong>${segmentInfo}</strong><br>
                    <em class="text-white-50" style="font-size: 11px;">${segmentSummary}</em><br>
                    <div style="margin-top: 8px; padding-top: 8px; border-top: 1px solid rgba(255,255,255,0.2);">
                        <strong>${axisMeta.label} elasticity:</strong> ${d.axisElasticity.toFixed(2)}<br>
                        <strong>${axisMeta.label} posture:</strong> ${d.axisRisk}<br>
                        <strong>Customers:</strong> ${d.customer_count.toLocaleString()}<br>
                        <strong>Repeat Loss:</strong> ${(d.repeat_loss_rate * 100).toFixed(2)}%<br>
                        <strong>Avg Order Value:</strong> $${d.avg_order_value.toFixed(2)}
                    </div>
                `);
        })
        .on('mousemove', function(event) {
            // Calculate position relative to container
            const containerNode = container.node();
            const containerRect = containerNode.getBoundingClientRect();
            const x = event.clientX - containerRect.left;
            const y = event.clientY - containerRect.top;

            tooltip
                .style('left', (x + 15) + 'px')
                .style('top', (y - 30) + 'px');
        })
        .on('mouseleave', function(event, d) {
            d3.select(this)
                .attr('opacity', d.isHighlighted ? 0.95 : 0.78)
                .attr('stroke-width', d.isHighlighted ? 3 : 2);

            tooltip.style('display', 'none');
        })
        .on('click', function(event, d) {
            const prettyKey = window.segmentEngine.formatCompositeKey(d.compositeKey);
            const segmentSummary = window.segmentEngine.generateSegmentSummary(d.compositeKey, {
                customer_count: d.customer_count,
                repeat_loss_rate: d.repeat_loss_rate,
                avg_order_value: d.avg_order_value
            });

            updateSegmentDetailPanel(
                prettyKey,
                buildSegmentDetailHtml(
                    `${axisMeta.label} view: ${d.axisRisk}. ${segmentSummary}`,
                    [
                        { label: `${axisMeta.label} elasticity`, value: d.axisElasticity.toFixed(2), tone: getSegmentAxisSentiment(axis, d.axisElasticity) },
                        { label: 'Customers', value: d.customer_count.toLocaleString() },
                        { label: 'Repeat loss', value: formatSegmentPercent(d.repeat_loss_rate), tone: d.repeat_loss_rate >= 0.14 ? 'negative' : 'positive' },
                        { label: 'Average order value', value: formatSegmentCurrency(d.avg_order_value), tone: 'positive' }
                    ]
                )
            );
        });

    // Add legend
    const legendX = width - 180;
    const legendY = 50;

    const legend = svg.append('g')
        .attr('transform', `translate(${legendX}, ${legendY})`);

    legend.append('text')
        .attr('x', 0)
        .attr('y', 0)
        .attr('font-weight', 'bold')
        .attr('font-size', '12px')
        .attr('fill', theme.text)
        .text('Legend');

    // Size legend
    legend.append('text')
        .attr('x', 0)
        .attr('y', 25)
        .attr('font-size', '10px')
        .attr('fill', theme.legendNeutral)
        .text('Circle Size: Customers');

    [1000, 5000, 10000].forEach((count, i) => {
        const r = radiusScale(count);
        legend.append('circle')
            .attr('cx', 10)
            .attr('cy', 40 + i * 25)
            .attr('r', r)
            .attr('fill', theme.legendCircle)
            .attr('opacity', 0.5);

        legend.append('text')
            .attr('x', 25)
            .attr('y', 43 + i * 25)
            .attr('font-size', '9px')
            .attr('fill', theme.legendNeutral)
            .text(count.toLocaleString());
    });

    // Color legend
    legend.append('text')
        .attr('x', 0)
        .attr('y', 130)
        .attr('font-size', '10px')
        .attr('fill', theme.legendNeutral)
        .text(`Bubble color: ${axisMeta.label.toLowerCase()} risk`);

    // Low (green)
    legend.append('circle')
        .attr('cx', 10)
        .attr('cy', 145)
        .attr('r', 5)
        .attr('fill', '#22c55e');
    legend.append('text')
        .attr('x', 22)
        .attr('y', 148)
        .attr('font-size', '9px')
        .attr('fill', '#22c55e')
        .text(axisMeta.positive);

    // Medium (yellow)
    legend.append('circle')
        .attr('cx', 10)
        .attr('cy', 165)
        .attr('r', 5)
        .attr('fill', '#eab308');
    legend.append('text')
        .attr('x', 22)
        .attr('y', 168)
        .attr('font-size', '9px')
        .attr('fill', '#eab308')
        .text(axisMeta.neutral);

    // High (red)
    legend.append('circle')
        .attr('cx', 10)
        .attr('cy', 185)
        .attr('r', 5)
        .attr('fill', '#ef4444');
    legend.append('text')
        .attr('x', 22)
        .attr('y', 188)
        .attr('font-size', '9px')
        .attr('fill', '#ef4444')
        .text(axisMeta.negative);

    // Center title
    const tierLabel = getTierDisplayLabel(tier);

    svg.append('text')
        .attr('x', centerX)
        .attr('y', 30)
        .attr('text-anchor', 'middle')
        .attr('font-weight', 'bold')
        .attr('font-size', '16px')
        .attr('fill', theme.title)
        .text(`3-Axis Customer Cohorts - ${tierLabel} - ${axisMeta.label}`);

    svg.append('text')
        .attr('x', centerX)
        .attr('y', 50)
        .attr('text-anchor', 'middle')
        .attr('font-size', '11px')
        .attr('fill', theme.muted)
        .text('Highlights: Family Ritual Loyalist | Deal-Seeking Customer | Group Occasion Buyer');
}

/**
 * Render scatter plot of segments (Elasticity vs Customer Count)
 * @param {string} containerId - DOM element ID
 * @param {string} tier - Subscription tier
 * @param {string} axis - Axis name ('engagement', 'acquisition', 'monetization')
 */
export function renderSegmentScatterPlot(containerId, tier, axis = 'engagement', filteredSegments = null) {
    const container = d3.select(`#${containerId}`);
    container.selectAll('*').remove();
    container.style('position', 'relative');

    const axisMeta = getSegmentAxisMeta(axis);
    const theme = getSegmentChartPalette();
    const segments = Array.isArray(filteredSegments) && filteredSegments.length
        ? filteredSegments
        : window.segmentEngine.getSegmentsForTier(tier);

    if (!segments || segments.length === 0) {
        container.append('div')
            .attr('class', 'alert alert-warning')
            .html('<p>No segment data available</p>');
        return;
    }

    const data = segments.map(segment => {
        const elasticity = window.segmentEngine.getElasticity(tier, segment.compositeKey, axis) || 0;
        return {
            compositeKey: segment.compositeKey,
            customers: parseInt(segment.customer_count || 0, 10),
            repeat_loss_rate: parseFloat(segment.repeat_loss_rate || 0),
            avg_order_value: parseFloat(segment.avg_order_value || 0),
            elasticity,
            riskLabel: getSegmentAxisRiskLabel(axis, elasticity)
        };
    });

    const margin = { top: 40, right: 180, bottom: 60, left: 80 };
    const width = 900 - margin.left - margin.right;
    const height = 600 - margin.top - margin.bottom;

    const svg = container.append('svg')
        .attr('width', width + margin.left + margin.right)
        .attr('height', height + margin.top + margin.bottom)
        .append('g')
        .attr('transform', `translate(${margin.left},${margin.top})`);

    const xScale = d3.scaleLinear()
        .domain([0, d3.max(data, d => d.customers)])
        .range([0, width])
        .nice();

    const yMin = d3.min(data, d => d.elasticity);
    const yMax = d3.max(data, d => d.elasticity);
    const yScale = d3.scaleLinear()
        .domain([yMin, yMax])
        .range([height, 0])
        .nice();

    const xMid = (d3.max(data, d => d.customers) || 0) / 2;
    const yThreshold = axis === 'acquisition' ? -1.5 : axis === 'engagement' ? 1.1 : 1.0;

    const radiusScale = d3.scaleSqrt()
        .domain([0, d3.max(data, d => d.avg_order_value)])
        .range([4, 15]);

    const xAxis = svg.append('g')
        .attr('transform', `translate(0,${height})`)
        .call(d3.axisBottom(xScale).tickFormat(d => (d / 1000).toFixed(0) + 'K'));
    styleAxis(xAxis, theme);

    const yAxis = svg.append('g')
        .call(d3.axisLeft(yScale));
    styleAxis(yAxis, theme);

    svg.append('text')
        .attr('x', width / 2)
        .attr('y', height + 50)
        .attr('text-anchor', 'middle')
        .attr('font-weight', 'bold')
        .attr('fill', theme.text)
        .text('Customers (K)');

    svg.append('text')
        .attr('transform', 'rotate(-90)')
        .attr('x', -height / 2)
        .attr('y', -60)
        .attr('text-anchor', 'middle')
        .attr('font-weight', 'bold')
        .attr('fill', theme.text)
        .text(`${axisMeta.label} elasticity`);

    const referenceLines = axis === 'acquisition'
        ? [
            { value: -2.0, label: 'High sensitivity', color: '#dc2626' },
            { value: -1.0, label: 'Moderate', color: '#d97706' }
        ]
        : axis === 'engagement'
            ? [
                { value: 1.5, label: 'High repeat-loss risk', color: '#dc2626' },
                { value: 0.7, label: 'Moderate', color: '#d97706' }
            ]
            : [
                { value: 1.3, label: 'High switching risk', color: '#dc2626' },
                { value: 0.8, label: 'Moderate', color: '#d97706' }
            ];

    referenceLines.forEach(line => {
        if (line.value < yMin || line.value > yMax) return;

        svg.append('line')
            .attr('x1', 0)
            .attr('x2', width)
            .attr('y1', yScale(line.value))
            .attr('y2', yScale(line.value))
            .attr('stroke', line.color)
            .attr('stroke-dasharray', '6,6')
            .attr('opacity', 0.5);

        svg.append('text')
            .attr('x', width - 4)
            .attr('y', yScale(line.value) - 6)
            .attr('text-anchor', 'end')
            .attr('font-size', '10px')
            .attr('fill', line.color)
            .text(line.label);
    });

    if (xMid > 0) {
        svg.append('line')
            .attr('x1', xScale(xMid))
            .attr('x2', xScale(xMid))
            .attr('y1', 0)
            .attr('y2', height)
            .attr('stroke', theme.axisStroke)
            .attr('stroke-dasharray', '4,6')
            .attr('opacity', 0.55);
    }

    if (yThreshold >= yMin && yThreshold <= yMax) {
        svg.append('line')
            .attr('x1', 0)
            .attr('x2', width)
            .attr('y1', yScale(yThreshold))
            .attr('y2', yScale(yThreshold))
            .attr('stroke', theme.axisStroke)
            .attr('stroke-dasharray', '4,6')
            .attr('opacity', 0.55);
    }

    const quadrantLabels = [
        { label: 'High Risk, High Impact', x: width * 0.74, y: height * 0.2 },
        { label: 'Low Risk, High Value', x: width * 0.74, y: height * 0.84 },
        { label: 'Low Impact Segments', x: width * 0.18, y: height * 0.2 },
        { label: 'Stable Base', x: width * 0.18, y: height * 0.84 }
    ];

    svg.selectAll('.quadrant-label')
        .data(quadrantLabels)
        .join('text')
        .attr('class', 'quadrant-label')
        .attr('x', d => d.x)
        .attr('y', d => d.y)
        .attr('text-anchor', 'middle')
        .attr('font-size', '10px')
        .attr('font-weight', 'bold')
        .attr('fill', theme.muted)
        .text(d => d.label);

    const tooltip = container.append('div')
        .attr('class', 'position-absolute bg-dark text-white p-2 rounded shadow-sm')
        .style('display', 'none')
        .style('pointer-events', 'none')
        .style('font-size', '11px')
        .style('z-index', '1000');

    svg.selectAll('.segment-point')
        .data(data)
        .join('circle')
        .attr('class', 'segment-point')
        .attr('cx', d => xScale(d.customers))
        .attr('cy', d => yScale(d.elasticity))
        .attr('r', d => radiusScale(d.avg_order_value))
        .attr('fill', d => getSegmentAxisColor(axis, d.elasticity))
        .attr('opacity', 0.78)
        .attr('stroke', theme.pointStroke)
        .attr('stroke-width', 1)
        .style('cursor', 'pointer')
        .on('mouseenter', function(event, d) {
            d3.select(this).attr('opacity', 1).attr('stroke-width', 2);

            const containerNode = container.node();
            const containerRect = containerNode.getBoundingClientRect();
            const x = event.clientX - containerRect.left;
            const y = event.clientY - containerRect.top;

            tooltip.style('display', 'block')
                .style('left', x + 10 + 'px')
                .style('top', y - 20 + 'px')
                .html(`
                    <strong>${window.segmentEngine.formatCompositeKey(d.compositeKey)}</strong><br>
                    Customers: ${d.customers.toLocaleString()}<br>
                    ${axisMeta.label} elasticity: ${d.elasticity.toFixed(2)}<br>
                    ${axisMeta.label} posture: ${d.riskLabel}<br>
                    Repeat loss rate: ${(d.repeat_loss_rate * 100).toFixed(2)}%<br>
                    Avg Order Value: $${d.avg_order_value.toFixed(2)}
                `);
        })
        .on('mousemove', function(event) {
            const containerNode = container.node();
            const containerRect = containerNode.getBoundingClientRect();
            const x = event.clientX - containerRect.left;
            const y = event.clientY - containerRect.top;

            tooltip.style('left', x + 10 + 'px')
                .style('top', y - 20 + 'px');
        })
        .on('mouseleave', function() {
            d3.select(this).attr('opacity', 0.78).attr('stroke-width', 1);
            tooltip.style('display', 'none');
        })
        .on('click', function(event, d) {
            updateSegmentDetailPanel(
                window.segmentEngine.formatCompositeKey(d.compositeKey),
                buildSegmentDetailHtml(
                    `${axisMeta.label} view: ${d.riskLabel}. This cohort combines size and elasticity in one point.`,
                    [
                        { label: 'Customers', value: d.customers.toLocaleString() },
                        { label: `${axisMeta.label} elasticity`, value: d.elasticity.toFixed(2), tone: getSegmentAxisSentiment(axis, d.elasticity) },
                        { label: 'Repeat loss rate', value: formatSegmentPercent(d.repeat_loss_rate), tone: d.repeat_loss_rate >= 0.14 ? 'negative' : 'positive' },
                        { label: 'Average order value', value: formatSegmentCurrency(d.avg_order_value), tone: 'positive' }
                    ]
                )
            );
        });

    const legend = svg.append('g')
        .attr('transform', `translate(${width + 20}, 0)`);

    legend.append('text')
        .attr('x', 0)
        .attr('y', 0)
        .attr('font-weight', 'bold')
        .attr('font-size', '12px')
        .attr('fill', theme.text)
        .text('Legend');

    legend.append('text')
        .attr('x', 0)
        .attr('y', 25)
        .attr('font-size', '10px')
        .attr('fill', theme.legendNeutral)
        .text('Size: AOV');

    legend.append('text')
        .attr('x', 0)
        .attr('y', 80)
        .attr('font-size', '10px')
        .attr('fill', theme.legendNeutral)
        .text(`Color: ${axisMeta.label.toLowerCase()} risk`);

    [
        { y: 95, color: '#22c55e', label: axisMeta.positive },
        { y: 112, color: '#eab308', label: axisMeta.neutral },
        { y: 129, color: '#ef4444', label: axisMeta.negative }
    ].forEach(item => {
        legend.append('circle')
            .attr('cx', 10)
            .attr('cy', item.y)
            .attr('r', 5)
            .attr('fill', item.color);

        legend.append('text')
            .attr('x', 22)
            .attr('y', item.y + 3)
            .attr('font-size', '9px')
            .attr('fill', theme.subtle)
            .text(item.label);
    });

    const tierLabel = getTierDisplayLabel(tier);

    svg.append('text')
        .attr('x', width / 2)
        .attr('y', -20)
        .attr('text-anchor', 'middle')
        .attr('font-weight', 'bold')
        .attr('font-size', '14px')
        .attr('fill', theme.title)
        .text(`Segment Analysis - ${tierLabel} cohorts - ${axisMeta.label}`);
}

/**
 * Export SVG to file
 * @param {string} containerId - DOM element ID
 * @param {string} filename - Output filename
 */
export function exportSVG(containerId, filename) {
    const svg = document.querySelector(`#${containerId} svg`);
    if (!svg) {
        console.warn('No SVG found in container:', containerId);
        return;
    }

    const serializer = new XMLSerializer();
    const svgString = serializer.serializeToString(svg);
    const blob = new Blob([svgString], { type: 'image/svg+xml' });

    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();

    URL.revokeObjectURL(link.href);
}
