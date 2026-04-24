'use strict';

const COLORS = {
  user:     '#4fc3f7',
  sys:      '#ef5350',
  idle:     '#66bb6a',
  load1:    '#ffa726',
  load5:    '#ffee58',
  load15:   '#ab47bc',
  mem:      '#26c6da',
  swap:     '#ef5350',
  disk:     '#42a5f5',
  tps:      '#66bb6a',
  cpuUs:    '#4fc3f7',
  cpuSy:    '#f06292',  // distinct from sys
  eCluster: '#29b6f6',
  pCluster: '#ff7043',
  cpuPwr:   '#ffa726',
  gpuPwr:   '#ab47bc',
  anePwr:   '#26c6da',
  gpuRes:   '#ec407a',
  eFreq:    '#80deea',
  pFreq:    '#ffab91',
  DANGER:   '#ef5350',
  WARNING:  '#ffa726',
  SAFE:     '#66bb6a',
};

const CHART_DEFAULTS = {
  responsive: true,
  animation: false,
  plugins: {
    legend: { labels: { color: '#cdd6f4', font: { size: 12 } } },
    tooltip: {
      backgroundColor: '#1e1e2e',
      titleColor: '#cdd6f4',
      bodyColor: '#bac2de',
    },
  },
  scales: {
    x: { ticks: { color: '#7f849c', maxRotation: 30, maxTicksLimit: 12 }, grid: { color: '#313244' } },
    y: { ticks: { color: '#7f849c' }, grid: { color: '#313244' } },
  },
};

// ── Chart registry (canvasId → original config) for modal re-render ──────────
// Stores the full-resolution data so modal can show more points than card view.
const chartRegistry = new Map();

/**
 * Downsample labels + datasets to at most `target` evenly-spaced indices.
 * Always keeps the first and last point.
 * Per-point arrays (data, pointColors) are sliced the same way.
 */
function downsample(labels, datasets, target) {
  const n = labels.length;
  if (n <= target) return { labels, datasets };

  const stride = n / target;
  const indices = [];
  for (let i = 0; i < target; i++) {
    indices.push(Math.min(Math.round(i * stride), n - 1));
  }
  // Guarantee last point
  if (indices[indices.length - 1] !== n - 1) indices[indices.length - 1] = n - 1;

  const sampledLabels = indices.map(i => labels[i]);
  const sampledDatasets = datasets.map(ds => {
    const sampled = { ...ds, data: indices.map(i => ds.data[i]) };
    if (ds.pointColors) sampled.pointColors = indices.map(i => ds.pointColors[i]);
    return sampled;
  });
  return { labels: sampledLabels, datasets: sampledDatasets };
}

function mergeDeep(target, source) {
  const out = Object.assign({}, target);
  for (const key of Object.keys(source)) {
    if (source[key] !== null && typeof source[key] === 'object' && !Array.isArray(source[key])) {
      out[key] = mergeDeep(target[key] || {}, source[key]);
    } else {
      out[key] = source[key];
    }
  }
  return out;
}

/** Returns point radius scaled to dataset size — avoids visual clutter on large logs */
function adaptivePointRadius(count) {
  if (count > 1000) return 0;
  if (count > 300)  return 1;
  if (count > 100)  return 2;
  return 4;
}

/**
 * createLineChart
 * @param {string} canvasId
 * @param {string[]} labels
 * @param {Array<{label, data, color, pointColors?}>} datasets
 * @param {object} overrides
 */
const CARD_SAMPLES  = 300;  // max points rendered in card view
const MODAL_SAMPLES = 800;  // max points rendered in modal view

function createLineChart(canvasId, labels, datasets, overrides = {}) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) { console.warn(`Canvas #${canvasId} not found`); return null; }

  const config = mergeDeep(CHART_DEFAULTS, overrides);

  // Store original full-resolution data for modal
  chartRegistry.set(canvasId, { type: 'line', labels, datasets, options: config });

  // Downsample for card view
  const { labels: cardLabels, datasets: cardDatasets } = downsample(labels, datasets, CARD_SAMPLES);
  const radius = adaptivePointRadius(cardLabels.length);

  const cardData = {
    labels: cardLabels,
    datasets: cardDatasets.map(ds => ({
      label: ds.label,
      data: ds.data,
      borderColor: ds.color,
      backgroundColor: ds.color + '18',
      borderWidth: 1.5,
      pointRadius: radius,
      pointHoverRadius: Math.max(radius, 4),
      pointBackgroundColor: ds.pointColors || ds.color,
      tension: 0.1,
      fill: false,
      spanGaps: true,
    })),
  };

  return new Chart(canvas.getContext('2d'), { type: 'line', data: cardData, options: config });
}

/**
 * createBarChart
 * @param {string} canvasId
 * @param {string[]} labels
 * @param {Array<{label, data, color}>} datasets
 */
function createBarChart(canvasId, labels, datasets, overrides = {}) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) { console.warn(`Canvas #${canvasId} not found`); return null; }

  const config = mergeDeep(CHART_DEFAULTS, overrides);

  // Store original full-resolution data for modal
  chartRegistry.set(canvasId, { type: 'bar', labels, datasets, options: config });

  // Downsample for card view
  const { labels: cardLabels, datasets: cardDatasets } = downsample(labels, datasets, CARD_SAMPLES);

  const chartData = {
    labels: cardLabels,
    datasets: cardDatasets.map(ds => ({
      label: ds.label,
      data: ds.data,
      backgroundColor: ds.color + 'cc',
      borderColor: ds.color,
      borderWidth: 1,
    })),
  };

  return new Chart(canvas.getContext('2d'), { type: 'bar', data: chartData, options: config });
}

/**
 * pointColorsFromThreshold
 * @param {Array<number|null>} values
 * @param {function} isDanger
 * @param {string} baseColor
 * @param {string} dangerColor
 */
function pointColorsFromThreshold(values, isDanger, baseColor = COLORS.user, dangerColor = COLORS.DANGER) {
  return values.map(v => (v !== null && isDanger(v)) ? dangerColor : baseColor);
}

/**
 * renderToCanvas
 * Re-renders a registered chart config onto an arbitrary canvas element.
 * Used by the modal to display a full-size version of any chart.
 */
function renderToCanvas(sourceId, targetCanvas) {
  const entry = chartRegistry.get(sourceId);
  if (!entry) return null;

  const modalOptions = mergeDeep(entry.options, {
    plugins: { title: { font: { size: 16 } } },
    scales: { x: { ticks: { maxTicksLimit: 20 } } },
  });

  if (entry.type === 'line') {
    // Use higher-resolution downsample for modal
    const { labels: modalLabels, datasets: modalDatasets } = downsample(entry.labels, entry.datasets, MODAL_SAMPLES);
    const radius = adaptivePointRadius(modalLabels.length);

    return new Chart(targetCanvas.getContext('2d'), {
      type: 'line',
      data: {
        labels: modalLabels,
        datasets: modalDatasets.map(ds => ({
          label: ds.label,
          data: ds.data,
          borderColor: ds.color,
          backgroundColor: ds.color + '18',
          borderWidth: 1.5,
          pointRadius: radius,
          pointHoverRadius: Math.max(radius, 5),
          pointBackgroundColor: ds.pointColors || ds.color,
          tension: 0.1,
          fill: false,
          spanGaps: true,
        })),
      },
      options: modalOptions,
    });
  }

  // Bar chart: deep-clone and adjust options only
  const cloned = JSON.parse(JSON.stringify({ type: entry.type, data: entry.data, options: entry.options }));
  cloned.options = modalOptions;
  return new Chart(targetCanvas.getContext('2d'), cloned);
}
