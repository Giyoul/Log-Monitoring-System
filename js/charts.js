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

// ── Chart registry (canvasId → config) for modal re-render ───────────────────
const chartRegistry = new Map();

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
function createLineChart(canvasId, labels, datasets, overrides = {}) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) { console.warn(`Canvas #${canvasId} not found`); return null; }

  const radius = adaptivePointRadius(labels.length);
  const config = mergeDeep(CHART_DEFAULTS, overrides);
  const chartData = {
    labels,
    datasets: datasets.map(ds => ({
      label: ds.label,
      data: ds.data,
      borderColor: ds.color,
      backgroundColor: ds.color + '22',
      borderWidth: 2,
      pointRadius: radius,
      pointHoverRadius: Math.max(radius, 4),
      pointBackgroundColor: ds.pointColors || ds.color,
      tension: 0.3,
      fill: false,
      spanGaps: true,
    })),
  };

  chartRegistry.set(canvasId, { type: 'line', data: chartData, options: config });
  return new Chart(canvas.getContext('2d'), { type: 'line', data: chartData, options: config });
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
  const chartData = {
    labels,
    datasets: datasets.map(ds => ({
      label: ds.label,
      data: ds.data,
      backgroundColor: ds.color + 'cc',
      borderColor: ds.color,
      borderWidth: 1,
    })),
  };

  chartRegistry.set(canvasId, { type: 'bar', data: chartData, options: config });
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
  const config = chartRegistry.get(sourceId);
  if (!config) return null;
  // Deep-clone to avoid Chart.js mutating the registry entry
  const cloned = JSON.parse(JSON.stringify(config));
  // In modal, restore full point radius
  if (cloned.type === 'line') {
    cloned.data.datasets.forEach(ds => {
      ds.pointRadius = 3;
      ds.pointHoverRadius = 6;
    });
  }
  cloned.options = mergeDeep(cloned.options, {
    plugins: { title: { font: { size: 16 } } },
    scales: {
      x: { ticks: { maxTicksLimit: 20 } },
    },
  });
  return new Chart(targetCanvas.getContext('2d'), cloned);
}
