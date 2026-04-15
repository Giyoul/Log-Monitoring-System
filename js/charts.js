'use strict';

const COLORS = {
  user:   '#4fc3f7',
  sys:    '#ef5350',
  idle:   '#66bb6a',
  load1:  '#ffa726',
  load5:  '#ffee58',
  load15: '#ab47bc',
  mem:    '#26c6da',
  swap:   '#ef5350',
  disk:   '#42a5f5',
  tps:    '#66bb6a',
  cpuUs:  '#4fc3f7',
  cpuSy:  '#ef5350',
  eCluster: '#29b6f6',
  pCluster: '#ff7043',
  cpuPwr: '#ffa726',
  gpuPwr: '#ab47bc',
  anePwr: '#26c6da',
  gpuRes: '#ec407a',
  DANGER:  '#ef5350',
  WARNING: '#ffa726',
  SAFE:    '#66bb6a',
};

const CHART_DEFAULTS = {
  responsive: true,
  animation: false,
  plugins: {
    legend: {
      labels: { color: '#cdd6f4', font: { size: 12 } },
    },
    tooltip: {
      backgroundColor: '#1e1e2e',
      titleColor: '#cdd6f4',
      bodyColor: '#bac2de',
    },
  },
  scales: {
    x: {
      ticks: { color: '#7f849c', maxRotation: 30 },
      grid: { color: '#313244' },
    },
    y: {
      ticks: { color: '#7f849c' },
      grid: { color: '#313244' },
    },
  },
};

function mergeDeep(target, source) {
  const out = Object.assign({}, target);
  for (const key of Object.keys(source)) {
    if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
      out[key] = mergeDeep(target[key] || {}, source[key]);
    } else {
      out[key] = source[key];
    }
  }
  return out;
}

/**
 * createLineChart
 * @param {string} canvasId
 * @param {string[]} labels
 * @param {Array<{label, data, color, pointColors?}>} datasets
 * @param {object} overrides  - merged into CHART_DEFAULTS
 */
function createLineChart(canvasId, labels, datasets, overrides = {}) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) { console.warn(`Canvas #${canvasId} not found`); return null; }

  const ctx = canvas.getContext('2d');
  const config = mergeDeep(CHART_DEFAULTS, overrides);

  return new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: datasets.map(ds => ({
        label: ds.label,
        data: ds.data,
        borderColor: ds.color,
        backgroundColor: ds.color + '22',
        borderWidth: 2,
        pointRadius: 4,
        pointBackgroundColor: ds.pointColors || ds.color,
        tension: 0.3,
        fill: false,
      })),
    },
    options: config,
  });
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

  const ctx = canvas.getContext('2d');
  const config = mergeDeep(CHART_DEFAULTS, overrides);

  return new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: datasets.map(ds => ({
        label: ds.label,
        data: ds.data,
        backgroundColor: ds.color + 'cc',
        borderColor: ds.color,
        borderWidth: 1,
      })),
    },
    options: config,
  });
}

/**
 * pointColorsFromThreshold
 * Returns per-point color array: DANGER color if value exceeds threshold, else base color.
 * @param {number[]} values
 * @param {function} isDanger  - (value) => boolean
 * @param {string} baseColor
 * @param {string} dangerColor
 */
function pointColorsFromThreshold(values, isDanger, baseColor = COLORS.user, dangerColor = COLORS.DANGER) {
  return values.map(v => (v !== null && isDanger(v)) ? dangerColor : baseColor);
}
