/**
 * Yum Data Explorer
 * Loads the actual Yum foundation datasets plus compatibility tables used by the demo.
 */

import { parseCSV } from './csv-utils.js';

const DATASET_DEFINITIONS = [
  { key: 'brand_dim', title: 'Brand Dimension', category: 'Foundation', icon: 'bi-diagram-3', manifestKey: 'brand_dim' },
  { key: 'market_dim', title: 'Market Dimension', category: 'Foundation', icon: 'bi-geo-alt', manifestKey: 'market_dim' },
  { key: 'brand_market_network', title: 'Brand-Market Network', category: 'Foundation', icon: 'bi-diagram-2', manifestKey: 'brand_market_network' },
  { key: 'brand_channel_dim', title: 'Brand Channel Dimension', category: 'Foundation', icon: 'bi-signpost-split', manifestKey: 'brand_channel_dim' },
  { key: 'product_dim', title: 'Product Dimension', category: 'Foundation', icon: 'bi-grid', manifestKey: 'product_dim' },
  { key: 'calendar_week_dim', title: 'Calendar Week Dimension', category: 'Signals & Promo', icon: 'bi-calendar2-week', manifestKey: 'calendar_week_dim', dateColumn: 'week_start' },
  { key: 'external_macro_monthly', title: 'External Macro Monthly', category: 'Signals & Promo', icon: 'bi-globe', manifestKey: 'external_macro_monthly', dateColumn: 'month_start' },
  { key: 'promo_calendar', title: 'Promo Calendar', category: 'Signals & Promo', icon: 'bi-megaphone', manifestKey: 'promo_calendar', dateColumn: 'week_start' },
  { key: 'cross_brand_transfer_matrix', title: 'Cross-Brand Transfer Matrix', category: 'Signals & Promo', icon: 'bi-arrow-left-right', manifestKey: 'cross_brand_transfer_matrix' },
  { key: 'brand_market_product_channel_week_panel', title: 'Brand-Market-Product-Channel Panel', category: 'Weekly Performance', icon: 'bi-table', manifestKey: 'brand_market_product_channel_week_panel', dateColumn: 'week_start' },
  { key: 'brand_market_channel_week_panel', title: 'Brand-Market-Channel Panel', category: 'Weekly Performance', icon: 'bi-bar-chart-steps', manifestKey: 'brand_market_channel_week_panel', dateColumn: 'week_start' },
  { key: 'portfolio_week_summary', title: 'Portfolio Weekly Summary', category: 'Weekly Performance', icon: 'bi-graph-up', manifestKey: 'portfolio_week_summary', dateColumn: 'week_start' },
  { key: 'brand_week_summary', title: 'Brand Weekly Summary', category: 'Weekly Performance', icon: 'bi-collection', manifestKey: 'brand_week_summary', dateColumn: 'week_start' },
  { key: 'market_brand_week_summary', title: 'Market-Brand Weekly Summary', category: 'Weekly Performance', icon: 'bi-map', manifestKey: 'market_brand_week_summary', dateColumn: 'week_start' },
  { key: 'product_week_summary', title: 'Product Weekly Summary', category: 'Weekly Performance', icon: 'bi-box-seam', manifestKey: 'product_week_summary', dateColumn: 'week_start' },
  { key: 'data_quality_checks', title: 'Data Quality Checks', category: 'Quality', icon: 'bi-shield-check', manifestKey: 'data_quality_checks' },
  { key: 'channel_dim', title: 'Legacy Channel Compatibility', category: 'Compatibility', icon: 'bi-signpost', recordCount: 20 },
  { key: 'menu_item_dim', title: 'Legacy Menu Item Dimension', category: 'Compatibility', icon: 'bi-list-ul' },
  { key: 'calendar_dim', title: 'Legacy Calendar Compatibility', category: 'Compatibility', icon: 'bi-calendar-event', dateColumn: 'week_start' },
  { key: 'store_dim', title: 'Legacy Store Dimension', category: 'Compatibility', icon: 'bi-shop', manifestKey: 'legacy_store_dim' },
  { key: 'store_channel_week_panel', title: 'Legacy Store-Channel Panel', category: 'Compatibility', icon: 'bi-building', dateColumn: 'week_start' },
  { key: 'store_item_week_panel', title: 'Legacy Store-Item Panel', category: 'Compatibility', icon: 'bi-grid-3x3-gap', manifestKey: 'legacy_store_item_week_panel', dateColumn: 'week_start' },
];

const CATEGORY_ORDER = ['Foundation', 'Signals & Promo', 'Weekly Performance', 'Quality', 'Compatibility'];
const DEFAULT_DATASET_KEY = 'brand_week_summary';

let datasetsByKey = {};
let categoryMap = {};
let catalogPromise = null;
let viewerInitialized = false;

let currentDataset = null;
let currentData = [];
let filteredData = [];
let currentPage = 1;
let rowsPerPage = 25;
let sortColumn = null;
let sortDirection = 'asc';
let datasetChart = null;

async function fetchJson(path) {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`Failed to load ${path}: ${response.status}`);
  return response.json();
}

async function ensureCatalog() {
  if (!catalogPromise) {
    catalogPromise = Promise.all([
      fetchJson('./data/yum/metadata.json').catch(() => ({ datasets: {} })),
      fetchJson('./data/yum/manifest.json').catch(() => ({ counts: {} })),
    ]).then(([metadata, manifest]) => {
      datasetsByKey = {};
      categoryMap = {};

      DATASET_DEFINITIONS.forEach((definition) => {
        const metadataKey = `processed/${definition.key}.csv`;
        const dataset = {
          ...definition,
          file: `./data/yum/processed/${definition.key}.csv`,
          description:
            metadata.datasets?.[metadataKey]?.description ||
            definition.description ||
            `${definition.title} used by the Yum elasticity application.`,
          grain: metadata.datasets?.[metadataKey]?.grain || definition.grain || 'N/A',
          recordCount:
            definition.recordCount ??
            manifest.counts?.[definition.manifestKey || definition.key] ??
            null,
        };

        datasetsByKey[dataset.key] = dataset;
        if (!categoryMap[dataset.category]) categoryMap[dataset.category] = [];
        categoryMap[dataset.category].push(dataset.key);
      });
    });
  }

  return catalogPromise;
}

export function initializeDataViewer() {
  if (viewerInitialized) return;
  viewerInitialized = true;

  document.getElementById('data-search').addEventListener('input', handleSearch);
  document.getElementById('rows-per-page').addEventListener('change', handleRowsPerPageChange);
  document.getElementById('refresh-data-btn').addEventListener('click', refreshCurrentDataset);
  document.getElementById('export-csv-btn').addEventListener('click', () => exportData());

  void ensureCatalog()
    .then(() => {
      buildAccordion();
      if (!currentDataset) {
        return handleDatasetSelection(DEFAULT_DATASET_KEY);
      }
      return null;
    })
    .catch((error) => {
      console.error('Failed to initialize Yum data explorer:', error);
      showError(`Failed to initialize data explorer: ${error.message}`);
    });
}

function buildAccordion() {
  const accordion = document.getElementById('datasets-accordion');
  if (!accordion) return;
  accordion.innerHTML = '';

  CATEGORY_ORDER.forEach((category, index) => {
    const datasetKeys = categoryMap[category] || [];
    if (!datasetKeys.length) return;

    const headerId = `heading-${index}`;
    const collapseId = `collapse-${index}`;
    const items = datasetKeys
      .map((key) => {
        const dataset = datasetsByKey[key];
        const countLabel = dataset.recordCount ? `${Number(dataset.recordCount).toLocaleString()} rows` : 'Open dataset';
        return `
          <div class="dataset-item" data-dataset="${key}">
            <i class="bi ${dataset.icon} me-2"></i>
            <span>${dataset.title}</span>
            <small class="text-muted d-block ms-4" style="font-size: 0.75rem;">${countLabel}</small>
          </div>
        `;
      })
      .join('');

    accordion.insertAdjacentHTML(
      'beforeend',
      `
        <div class="accordion-item">
          <h2 class="accordion-header" id="${headerId}">
            <button class="accordion-button ${index === 0 ? '' : 'collapsed'}" type="button" data-bs-toggle="collapse" data-bs-target="#${collapseId}" aria-expanded="${index === 0 ? 'true' : 'false'}" aria-controls="${collapseId}">
              ${category}
            </button>
          </h2>
          <div id="${collapseId}" class="accordion-collapse collapse ${index === 0 ? 'show' : ''}" aria-labelledby="${headerId}" data-bs-parent="#datasets-accordion">
            <div class="accordion-body">${items}</div>
          </div>
        </div>
      `
    );
  });

  document.querySelectorAll('.dataset-item').forEach((item) => {
    item.addEventListener('click', () => handleDatasetSelection(item.dataset.dataset));
  });
}

async function handleDatasetSelection(datasetKey) {
  document.querySelectorAll('.dataset-item').forEach((item) => item.classList.remove('active'));
  const selectedItem = document.querySelector(`[data-dataset="${datasetKey}"]`);
  if (selectedItem) selectedItem.classList.add('active');
  await loadDataset(datasetKey);
}

async function loadDataset(datasetKey) {
  const dataset = datasetsByKey[datasetKey];
  if (!dataset) {
    showError(`Unknown dataset: ${datasetKey}`);
    return;
  }

  currentDataset = dataset;
  showLoading();

  try {
    const response = await fetch(dataset.file);
    if (!response.ok) {
      throw new Error(`${response.status} while loading ${dataset.file}`);
    }

    const text = await response.text();
    currentData = parseCSV(text, { coerce: false });
    filteredData = [...currentData];
    currentPage = 1;
    sortColumn = null;
    sortDirection = 'asc';

    document.getElementById('data-empty').style.display = 'none';
    document.getElementById('data-loading').style.display = 'none';
    document.getElementById('data-controls').style.display = 'flex';
    document.getElementById('data-table-container').style.display = 'block';
    document.getElementById('pagination-container').style.display = 'flex';
    document.getElementById('export-csv-btn').disabled = false;

    updateDatasetInfo();
    renderTable();
    renderDatasetChart();
  } catch (error) {
    console.error('Error loading dataset:', error);
    showError(`Failed to load dataset: ${error.message}`);
  }
}

function getDateRangeFromData(data) {
  if (!data.length) return null;
  const dateColumn =
    currentDataset.dateColumn ||
    ['week_start', 'month_start', 'date'].find((column) => Object.prototype.hasOwnProperty.call(data[0], column));
  if (!dateColumn) return null;

  const values = data
    .map((row) => String(row[dateColumn] || '').trim())
    .filter((value) => /^\d{4}-\d{2}-\d{2}$/.test(value))
    .sort();

  if (!values.length) return null;
  return values[0] === values[values.length - 1] ? values[0] : `${values[0]} to ${values[values.length - 1]}`;
}

function updateDatasetInfo() {
  const info = document.getElementById('dataset-info');
  const recordCount = currentData.length.toLocaleString();
  const columnCount = Object.keys(currentData[0] || {}).length;
  const dateRange = getDateRangeFromData(currentData) || 'Snapshot';

  document.getElementById('dataset-title').textContent = currentDataset.title;
  document.getElementById('dataset-description').textContent = `${currentDataset.description} Grain: ${currentDataset.grain}.`;
  document.getElementById('dataset-records').textContent = `${recordCount} records`;
  document.getElementById('dataset-columns').textContent = `${columnCount} columns`;
  document.getElementById('dataset-date-range').textContent = dateRange;
  info.style.display = 'block';
}

function renderTable() {
  const table = document.getElementById('data-table');
  const thead = table.querySelector('thead');
  const tbody = table.querySelector('tbody');
  thead.innerHTML = '';
  tbody.innerHTML = '';

  if (!filteredData.length) {
    tbody.innerHTML = '<tr><td colspan="100" class="text-center text-muted py-4">No matching rows</td></tr>';
    updatePagination(0, 0, 0);
    return;
  }

  const headers = Object.keys(filteredData[0]);
  const headerRow = document.createElement('tr');
  headers.forEach((header) => {
    const th = document.createElement('th');
    th.style.cursor = 'pointer';
    th.style.whiteSpace = 'nowrap';
    th.textContent = header;
    if (sortColumn === header) {
      th.textContent += sortDirection === 'asc' ? ' [asc]' : ' [desc]';
    }
    th.addEventListener('click', () => handleSort(header));
    headerRow.appendChild(th);
  });
  thead.appendChild(headerRow);

  const totalRows = filteredData.length;
  const startIndex = (currentPage - 1) * rowsPerPage;
  const endIndex = rowsPerPage === 'all' ? totalRows : Math.min(startIndex + rowsPerPage, totalRows);
  const pageData = filteredData.slice(startIndex, endIndex);

  pageData.forEach((row) => {
    const tr = document.createElement('tr');
    headers.forEach((header) => {
      const td = document.createElement('td');
      td.textContent = row[header] ?? '';
      td.style.whiteSpace = 'nowrap';
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });

  updatePagination(totalRows, startIndex, endIndex);
}

function handleSort(column) {
  if (sortColumn === column) {
    sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
  } else {
    sortColumn = column;
    sortDirection = 'asc';
  }

  filteredData.sort((left, right) => {
    const leftNumber = parseFloat(left[column]);
    const rightNumber = parseFloat(right[column]);

    if (!Number.isNaN(leftNumber) && !Number.isNaN(rightNumber)) {
      return sortDirection === 'asc' ? leftNumber - rightNumber : rightNumber - leftNumber;
    }

    const leftValue = String(left[column] ?? '');
    const rightValue = String(right[column] ?? '');
    return sortDirection === 'asc' ? leftValue.localeCompare(rightValue) : rightValue.localeCompare(leftValue);
  });

  renderTable();
}

function updatePagination(totalRows, startIndex, endIndex) {
  const info = document.getElementById('pagination-info');
  const pagination = document.getElementById('pagination');
  info.textContent = totalRows ? `Showing ${startIndex + 1}-${endIndex} of ${totalRows.toLocaleString()} rows` : 'Showing 0 rows';
  pagination.innerHTML = '';

  const totalPages = rowsPerPage === 'all' ? 1 : Math.ceil(totalRows / rowsPerPage);
  if (totalPages <= 1) return;

  const addPageLink = (label, page, disabled = false, active = false) => {
    const li = document.createElement('li');
    li.className = `page-item ${disabled ? 'disabled' : ''} ${active ? 'active' : ''}`.trim();
    li.innerHTML = `<a class="page-link" href="#">${label}</a>`;
    li.addEventListener('click', (event) => {
      event.preventDefault();
      if (disabled || page === currentPage) return;
      currentPage = page;
      renderTable();
    });
    pagination.appendChild(li);
  };

  addPageLink('Previous', Math.max(1, currentPage - 1), currentPage === 1);

  const maxPages = 5;
  let startPage = Math.max(1, currentPage - Math.floor(maxPages / 2));
  let endPage = Math.min(totalPages, startPage + maxPages - 1);
  if (endPage - startPage < maxPages - 1) {
    startPage = Math.max(1, endPage - maxPages + 1);
  }

  for (let page = startPage; page <= endPage; page += 1) {
    addPageLink(String(page), page, false, page === currentPage);
  }

  addPageLink('Next', Math.min(totalPages, currentPage + 1), currentPage === totalPages);
}

function buildLineChart(labels, datasets, caption) {
  return {
    caption,
    config: {
      type: 'line',
      data: { labels, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: true, position: 'bottom' } },
      },
    },
  };
}

function buildBarChart(labels, dataset, caption, horizontal = false) {
  return {
    caption,
    config: {
      type: 'bar',
      data: { labels, datasets: [dataset] },
      options: {
        indexAxis: horizontal ? 'y' : 'x',
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
      },
    },
  };
}

function latestRowsBy(data, field) {
  const latest = data.reduce((max, row) => (!max || row[field] > max ? row[field] : max), null);
  return latest ? data.filter((row) => row[field] === latest) : [];
}

function renderDatasetChart() {
  const container = document.getElementById('dataset-chart-container');
  const captionNode = document.getElementById('dataset-chart-caption');
  const canvas = document.getElementById('dataset-chart');

  if (!container || !canvas || typeof Chart === 'undefined' || !currentData.length) {
    if (container) container.style.display = 'none';
    if (datasetChart) {
      datasetChart.destroy();
      datasetChart = null;
    }
    return;
  }

  const numeric = (value) => {
    const parsed = parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
  };

  let chart = null;

  if (currentDataset.key === 'brand_dim') {
    chart = buildBarChart(
      currentData.map((row) => row.brand_name),
      {
        label: 'Digital maturity index',
        data: currentData.map((row) => numeric(row.digital_maturity_index) * 100),
        backgroundColor: ['#d62828', '#682bd7', '#0f6cbd', '#ff8c42'],
      },
      'Digital maturity by Yum brand'
    );
  } else if (currentDataset.key === 'market_dim') {
    chart = buildBarChart(
      currentData.map((row) => `${row.city}, ${row.state}`),
      {
        label: 'Store count',
        data: currentData.map((row) => numeric(row.store_count)),
        backgroundColor: '#0f6cbd',
      },
      'Store count by market'
    );
  } else if (currentDataset.key === 'brand_market_network') {
    const byBrand = {};
    currentData.forEach((row) => {
      byBrand[row.brand_name] = (byBrand[row.brand_name] || 0) + numeric(row.store_count_proxy);
    });
    chart = buildBarChart(
      Object.keys(byBrand),
      { label: 'Store count proxy', data: Object.values(byBrand), backgroundColor: ['#d62828', '#682bd7', '#0f6cbd', '#ff8c42'] },
      'Brand footprint proxy by market network'
    );
  } else if (currentDataset.key === 'brand_channel_dim') {
    const channels = [...new Set(currentData.map((row) => row.channel_name))];
    chart = {
      caption: 'Base channel mix by brand',
      config: {
        type: 'bar',
        data: {
          labels: [...new Set(currentData.map((row) => row.brand_name))],
          datasets: channels.map((channel, index) => ({
            label: channel,
            data: [...new Set(currentData.map((row) => row.brand_name))].map((brand) => {
              const match = currentData.find((row) => row.brand_name === brand && row.channel_name === channel);
              return numeric(match?.base_mix_pct);
            }),
            backgroundColor: ['#d62828', '#682bd7', '#0f6cbd', '#ff8c42', '#2a9d8f'][index % 5],
          })),
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: true, position: 'bottom' } },
          scales: { x: { stacked: true }, y: { stacked: true } },
        },
      },
    };
  } else if (currentDataset.key === 'product_dim') {
    const topProducts = [...currentData].sort((left, right) => numeric(right.baseline_units_index) - numeric(left.baseline_units_index)).slice(0, 10);
    chart = buildBarChart(
      topProducts.map((row) => row.product_name),
      { label: 'Baseline units index', data: topProducts.map((row) => numeric(row.baseline_units_index)), backgroundColor: '#682bd7' },
      'Top products by baseline unit index',
      true
    );
  } else if (currentDataset.key === 'calendar_week_dim' || currentDataset.key === 'calendar_dim') {
    const signalScore = currentData.map((row) =>
      (row.holiday_proxy_flag === 'true' || row.is_holiday_proxy === 'true' ? 1 : 0) +
      (row.sports_peak_flag === 'true' || row.qsr_peak_flag === 'true' ? 1 : 0) +
      (row.paycheck_week_flag === 'true' ? 1 : 0)
    );
    chart = buildLineChart(
      currentData.map((row) => row.week_start),
      [{ label: 'Signal count', data: signalScore, borderColor: '#ff8c42', backgroundColor: 'rgba(255, 140, 66, 0.12)', borderWidth: 2, tension: 0.25 }],
      'Calendar event pressure by week'
    );
  } else if (currentDataset.key === 'external_macro_monthly') {
    chart = buildLineChart(
      currentData.map((row) => row.month_start),
      [
        { label: 'Consumer sentiment', data: currentData.map((row) => numeric(row.consumer_sentiment)), borderColor: '#0f6cbd', borderWidth: 2, tension: 0.25 },
        { label: 'Unemployment rate', data: currentData.map((row) => numeric(row.unemployment_rate)), borderColor: '#d62828', borderWidth: 2, tension: 0.25 },
      ],
      'Macro context over time'
    );
  } else if (currentDataset.key === 'promo_calendar') {
    const byOffer = {};
    currentData.forEach((row) => {
      byOffer[row.offer_type] = (byOffer[row.offer_type] || 0) + numeric(row.promo_sales);
    });
    chart = buildBarChart(
      Object.keys(byOffer),
      { label: 'Promo sales', data: Object.values(byOffer), backgroundColor: '#ff8c42' },
      'Modeled promo sales by offer type'
    );
  } else if (currentDataset.key === 'cross_brand_transfer_matrix') {
    const topFlows = [...currentData].sort((left, right) => numeric(right.base_transfer_share) - numeric(left.base_transfer_share)).slice(0, 10);
    chart = buildBarChart(
      topFlows.map((row) => `${row.from_brand_name} -> ${row.to_brand_name}`),
      { label: 'Base transfer share', data: topFlows.map((row) => numeric(row.base_transfer_share) * 100), backgroundColor: '#2a9d8f' },
      'Largest modeled cross-brand transfer flows',
      true
    );
  } else if (currentDataset.key === 'brand_market_product_channel_week_panel' || currentDataset.key === 'store_item_week_panel') {
    const byBrand = {};
    currentData.forEach((row) => {
      if (!byBrand[row.brand_name || row.brand_id]) byBrand[row.brand_name || row.brand_id] = {};
      const brand = row.brand_name || row.brand_id;
      byBrand[brand][row.week_start] = (byBrand[brand][row.week_start] || 0) + numeric(row.net_sales);
    });
    const labels = [...new Set(Object.values(byBrand).flatMap((series) => Object.keys(series)))].sort();
    chart = buildLineChart(
      labels,
      Object.entries(byBrand).map(([brand, series], index) => ({
        label: brand,
        data: labels.map((label) => series[label] || 0),
        borderColor: ['#d62828', '#682bd7', '#0f6cbd', '#ff8c42'][index % 4],
        borderWidth: 2,
        tension: 0.25,
      })),
      'Weekly net sales by brand'
    );
  } else if (currentDataset.key === 'brand_market_channel_week_panel' || currentDataset.key === 'store_channel_week_panel') {
    const byChannel = {};
    currentData.forEach((row) => {
      const label = row.channel_name || row.channel || row.channel_id;
      if (!byChannel[label]) byChannel[label] = {};
      byChannel[label][row.week_start] = (byChannel[label][row.week_start] || 0) + numeric(row.net_sales);
    });
    const labels = [...new Set(Object.values(byChannel).flatMap((series) => Object.keys(series)))].sort();
    chart = buildLineChart(
      labels,
      Object.entries(byChannel).slice(0, 5).map(([channel, series], index) => ({
        label: channel,
        data: labels.map((label) => series[label] || 0),
        borderColor: ['#0f6cbd', '#ff8c42', '#2a9d8f', '#682bd7', '#d62828'][index % 5],
        borderWidth: 2,
        tension: 0.25,
      })),
      'Weekly net sales by channel'
    );
  } else if (currentDataset.key === 'portfolio_week_summary') {
    chart = buildLineChart(
      currentData.map((row) => row.week_start),
      [{ label: 'System sales', data: currentData.map((row) => numeric(row.system_sales)), borderColor: '#0f6cbd', borderWidth: 2, tension: 0.25 }],
      'Portfolio sales trend'
    );
  } else if (currentDataset.key === 'brand_week_summary') {
    const byBrand = {};
    currentData.forEach((row) => {
      if (!byBrand[row.brand_name]) byBrand[row.brand_name] = {};
      byBrand[row.brand_name][row.week_start] = numeric(row.system_sales);
    });
    const labels = [...new Set(currentData.map((row) => row.week_start))].sort();
    chart = buildLineChart(
      labels,
      Object.entries(byBrand).map(([brand, series], index) => ({
        label: brand,
        data: labels.map((label) => series[label] || 0),
        borderColor: ['#d62828', '#682bd7', '#0f6cbd', '#ff8c42'][index % 4],
        borderWidth: 2,
        tension: 0.25,
      })),
      'Weekly sales by Yum brand'
    );
  } else if (currentDataset.key === 'market_brand_week_summary') {
    const latestRows = latestRowsBy(currentData, 'week_start').sort((left, right) => numeric(right.system_sales) - numeric(left.system_sales)).slice(0, 10);
    chart = buildBarChart(
      latestRows.map((row) => `${row.market_name} | ${row.brand_name}`),
      { label: 'System sales', data: latestRows.map((row) => numeric(row.system_sales)), backgroundColor: '#0f6cbd' },
      'Top market-brand combinations in the latest week',
      true
    );
  } else if (currentDataset.key === 'product_week_summary' || currentDataset.key === 'menu_item_dim') {
    const rows =
      currentDataset.key === 'product_week_summary'
        ? latestRowsBy(currentData, 'week_start').sort((left, right) => numeric(right.net_sales) - numeric(left.net_sales)).slice(0, 10)
        : [...currentData].sort((left, right) => numeric(right.base_weekly_units) - numeric(left.base_weekly_units)).slice(0, 10);
    chart = buildBarChart(
      rows.map((row) => row.product_name || row.item_name),
      {
        label: currentDataset.key === 'product_week_summary' ? 'Net sales' : 'Base weekly units',
        data: rows.map((row) => numeric(row.net_sales || row.base_weekly_units)),
        backgroundColor: '#682bd7',
      },
      currentDataset.key === 'product_week_summary' ? 'Top products in the latest week' : 'Legacy menu item demand priors',
      true
    );
  } else if (currentDataset.key === 'data_quality_checks') {
    chart = buildBarChart(
      currentData.map((row) => row.dataset_name),
      { label: 'Row count', data: currentData.map((row) => numeric(row.row_count)), backgroundColor: '#2a9d8f' },
      'Row counts across generated datasets',
      true
    );
  } else if (currentDataset.key === 'channel_dim') {
    chart = buildBarChart(
      currentData.map((row) => `${row.brand_id} | ${row.channel_name}`),
      { label: 'Base weight', data: currentData.map((row) => numeric(row.base_weight)), backgroundColor: '#ff8c42' },
      'Legacy channel base weights',
      true
    );
  } else if (currentDataset.key === 'store_dim') {
    const byBrand = {};
    currentData.forEach((row) => {
      byBrand[row.brand_name] = (byBrand[row.brand_name] || 0) + 1;
    });
    chart = buildBarChart(
      Object.keys(byBrand),
      { label: 'Stores', data: Object.values(byBrand), backgroundColor: ['#d62828', '#682bd7', '#0f6cbd', '#ff8c42'] },
      'Legacy store count by brand'
    );
  }

  if (!chart) {
    container.style.display = 'none';
    if (datasetChart) {
      datasetChart.destroy();
      datasetChart = null;
    }
    return;
  }

  if (datasetChart) datasetChart.destroy();
  datasetChart = new Chart(canvas.getContext('2d'), chart.config);
  captionNode.textContent = chart.caption;
  container.style.display = 'block';
}

function handleSearch(event) {
  const query = event.target.value.toLowerCase();
  filteredData = !query
    ? [...currentData]
    : currentData.filter((row) => Object.values(row).some((value) => String(value ?? '').toLowerCase().includes(query)));
  currentPage = 1;
  renderTable();
}

function handleRowsPerPageChange(event) {
  rowsPerPage = event.target.value === 'all' ? 'all' : parseInt(event.target.value, 10);
  currentPage = 1;
  renderTable();
}

async function refreshCurrentDataset() {
  if (currentDataset) {
    await loadDataset(currentDataset.key);
  }
}

function exportData() {
  if (!currentData.length || !currentDataset) return;

  const headers = Object.keys(currentData[0]);
  const lines = [
    headers.join(','),
    ...currentData.map((row) =>
      headers
        .map((header) => {
          const value = String(row[header] ?? '');
          return value.includes(',') || value.includes('"') ? `"${value.replace(/"/g, '""')}"` : value;
        })
        .join(',')
    ),
  ];

  const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${currentDataset.key}.csv`;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

function showLoading() {
  document.getElementById('dataset-info').style.display = 'none';
  document.getElementById('dataset-chart-container').style.display = 'none';
  document.getElementById('data-controls').style.display = 'none';
  document.getElementById('data-table-container').style.display = 'none';
  document.getElementById('pagination-container').style.display = 'none';
  document.getElementById('data-empty').style.display = 'none';
  document.getElementById('data-loading').style.display = 'block';
}

function showError(message) {
  document.getElementById('data-loading').style.display = 'none';
  document.getElementById('data-controls').style.display = 'none';
  document.getElementById('data-table-container').style.display = 'none';
  document.getElementById('pagination-container').style.display = 'none';
  document.getElementById('data-empty').style.display = 'block';
  document.getElementById('data-empty').innerHTML = `
    <i class="bi bi-exclamation-triangle-fill text-danger display-4 mb-3"></i>
    <p class="text-danger mb-0">${message}</p>
  `;
}
