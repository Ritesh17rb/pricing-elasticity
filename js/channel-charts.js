/**
 * Channel Charts Module
 * Visualizations built only from our data: elasticity-params.json (by_channel).
 * Used in Step 4 (Customer Cohorts & Elasticity) for the "Channel View".
 *
 * Dependencies: D3.js v7, data-loader.js (getChannelElasticityData is called from app.js)
 */

const CHANNEL_LABELS = {
  sephora: 'Sephora',
  ulta: 'Ulta',
  target: 'Target',
  amazon: 'Amazon',
  dtc: 'DTC'
};

/**
 * Render channel elasticity bar chart (from elasticity-params by_channel)
 * @param {string} containerId - DOM element ID
 * @param {Array<{channel: string, channelGroup: string, elasticity: number, price: number}>} data
 */
export function renderChannelElasticityBar(containerId, data) {
  const container = d3.select(`#${containerId}`);
  container.selectAll('*').remove();

  if (!data || data.length === 0) {
    container
      .append('p')
      .attr('class', 'text-muted')
      .text('No channel elasticity data. Load data in Step 1.');
    return;
  }

  container.style('position', 'relative');

  const margin = { top: 24, right: 24, bottom: 48, left: 56 };
  const width = Math.max(
    400,
    container.node().getBoundingClientRect().width - margin.left - margin.right
  );
  const height = 280;

  const svg = container
    .append('svg')
    .attr('width', width + margin.left + margin.right)
    .attr('height', height + margin.top + margin.bottom)
    .append('g')
    .attr('transform', `translate(${margin.left},${margin.top})`);

  const x = d3
    .scaleBand()
    .domain(data.map(d => d.channel))
    .range([0, width])
    .padding(0.25);

  const yExtent = d3.extent(data, d => d.elasticity);
  const y = d3
    .scaleLinear()
    .domain([Math.min(yExtent[0], 0), Math.max(0, yExtent[1] + 0.2)])
    .range([height, 0])
    .nice();

  svg
    .append('g')
    .attr('transform', `translate(0,${height})`)
    .call(d3.axisBottom(x).tickFormat(d => CHANNEL_LABELS[d] || d));

  svg.append('g').call(d3.axisLeft(y));

  svg
    .append('text')
    .attr('x', width / 2)
    .attr('y', height + 40)
    .attr('text-anchor', 'middle')
    .attr('class', 'chart-axis-label')
    .text('Channel');

  svg
    .append('text')
    .attr('transform', 'rotate(-90)')
    .attr('x', -height / 2)
    .attr('y', -44)
    .attr('text-anchor', 'middle')
    .attr('class', 'chart-axis-label')
    .text('Price Elasticity');

  const colorScale = d3
    .scaleOrdinal()
    .domain(['mass', 'prestige'])
    .range(['#3b82f6', '#8b5cf6']);

  svg
    .selectAll('.channel-bar')
    .data(data)
    .join('rect')
    .attr('class', 'channel-bar')
    .attr('x', d => x(d.channel))
    .attr('y', d => y(Math.min(0, d.elasticity)))
    .attr('width', x.bandwidth())
    .attr('height', d => Math.abs(y(d.elasticity) - y(0)))
    .attr('fill', d => colorScale(d.channelGroup))
    .attr('rx', 4)
    .on('mouseenter', function (event, d) {
      d3.select(this).attr('opacity', 0.85);

      const tip = container
        .append('div')
        .attr(
          'class',
          'position-absolute bg-dark text-white p-2 rounded small shadow-sm'
        )
        .style('pointer-events', 'none')
        .style('z-index', 1000);

      tip
        .style('left', `${event.offsetX + 12}px`)
        .style('top', `${event.offsetY - 10}px`)
        .html(
          `${CHANNEL_LABELS[d.channel] || d.channel}<br>` +
            `Elasticity: ${d.elasticity.toFixed(2)}<br>` +
            `Group: ${d.channelGroup}<br>` +
            `Price: $${d.price.toFixed(0)}`
        );
    })
    .on('mouseleave', function () {
      d3.select(this).attr('opacity', 1);
      container.selectAll('.bg-dark').remove();
    });
}

/**
 * Render channel elasticity heatmap (Channel × Elasticity & group) from our data
 * @param {string} containerId - DOM element ID
 * @param {Array<{channel: string, channelGroup: string, elasticity: number, price: number}>} data
 */
export function renderChannelElasticityHeatmap(containerId, data) {
  const container = d3.select(`#${containerId}`);
  container.selectAll('*').remove();

  if (!data || data.length === 0) {
    container
      .append('p')
      .attr('class', 'text-muted')
      .text('No channel data. Load data in Step 1.');
    return;
  }

  container.style('position', 'relative');

  const margin = { top: 32, right: 100, bottom: 48, left: 80 };
  const cellHeight = 44;
  const cellWidth = 100;
  const width = 2 * cellWidth;
  const height = data.length * cellHeight;

  const svg = container
    .append('svg')
    .attr('width', width + margin.left + margin.right)
    .attr('height', height + margin.top + margin.bottom)
    .append('g')
    .attr('transform', `translate(${margin.left},${margin.top})`);

  const channels = data.map(d => d.channel);
  const columns = ['Elasticity', 'Channel group'];

  const yScale = d3
    .scaleBand()
    .domain(channels)
    .range([0, height])
    .padding(0.08);

  const xScale = d3
    .scaleBand()
    .domain(columns)
    .range([0, width])
    .padding(0.08);

  const elasticityExtent = d3.extent(data, d => d.elasticity);
  const colorScale = d3
    .scaleSequential(d3.interpolateRdYlGn)
    .domain([elasticityExtent[1], elasticityExtent[0]]);

  const rows = data
    .map(d => [
      {
        channel: d.channel,
        col: 'Elasticity',
        raw: d.elasticity
      },
      {
        channel: d.channel,
        col: 'Channel group',
        raw: d.channelGroup
      }
    ])
    .flat();

  rows.forEach(cell => {
    const g = svg
      .append('g')
      .attr(
        'transform',
        `translate(${xScale(cell.col)},${yScale(cell.channel)})`
      );

    if (cell.col === 'Elasticity') {
      g.append('rect')
        .attr('width', xScale.bandwidth())
        .attr('height', yScale.bandwidth())
        .attr('fill', colorScale(cell.raw))
        .attr('stroke', '#fff')
        .attr('stroke-width', 1)
        .attr('rx', 4);

      g.append('text')
        .attr('x', xScale.bandwidth() / 2)
        .attr('y', yScale.bandwidth() / 2 + 4)
        .attr('text-anchor', 'middle')
        .attr('fill', '#111827')
        .attr('font-size', '11px')
        .text(cell.raw.toFixed(2));
    } else {
      g.append('rect')
        .attr('width', xScale.bandwidth())
        .attr('height', yScale.bandwidth())
        .attr('fill', cell.raw === 'mass' ? '#dbeafe' : '#ede9fe')
        .attr('stroke', '#fff')
        .attr('stroke-width', 1)
        .attr('rx', 4);

      g.append('text')
        .attr('x', xScale.bandwidth() / 2)
        .attr('y', yScale.bandwidth() / 2 + 4)
        .attr('text-anchor', 'middle')
        .attr('font-size', '11px')
        .attr('fill', '#111827')
        .text(cell.raw);
    }
  });

  svg
    .append('g')
    .attr('transform', `translate(0,${height})`)
    .call(d3.axisBottom(xScale));

  svg
    .append('g')
    .call(d3.axisLeft(yScale).tickFormat(d => CHANNEL_LABELS[d] || d));

  svg
    .append('text')
    .attr('x', width / 2)
    .attr('y', -12)
    .attr('text-anchor', 'middle')
    .attr('font-weight', 'bold')
    .attr('font-size', '12px')
    .attr('fill', '#f9fafb')
    .text('Channel elasticity');
}

/**
 * Render channel scatter: X = elasticity, Y = price
 * @param {string} containerId - DOM element ID
 * @param {Array<{channel: string, channelGroup: string, elasticity: number, price: number}>} data
 */
export function renderChannelSummary(containerId, data) {
  const container = d3.select(`#${containerId}`);
  container.selectAll('*').remove();

  if (!data || data.length === 0) {
    container
      .append('p')
      .attr('class', 'text-muted')
      .text('No channel data. Load data in Step 1.');
    return;
  }

  const sorted = [...data].sort((a, b) => a.elasticity - b.elasticity);
  const mostElastic = sorted[0];
  const leastElastic = sorted[sorted.length - 1];

  const list = container
    .append('div')
    .attr('class', 'small');

  list.html(`
    <p class="mb-1">
      <strong>Most elastic:</strong>
      ${CHANNEL_LABELS[mostElastic.channel] || mostElastic.channel}
      (${mostElastic.channelGroup}, ${mostElastic.elasticity.toFixed(2)})
    </p>
    <p class="mb-1">
      <strong>Least elastic:</strong>
      ${CHANNEL_LABELS[leastElastic.channel] || leastElastic.channel}
      (${leastElastic.channelGroup}, ${leastElastic.elasticity.toFixed(2)})
    </p>
    <p class="mb-0 text-muted">
      Use bar + heatmap to see all channels; this summary highlights the extremes.
    </p>
  `);
}

