'use strict';

const DATA_FILES = {
  cpu:  'data/relay_cpu_summary.txt',
  disk: 'data/relay_disk_log.txt',
  hw:   'data/relay_hw_log.txt',
};

const THRESHOLD = {
  physMemUnusedMB: 500,
};

// ── Utilities ─────────────────────────────────────────────────────────────────

async function fetchText(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.text();
}

function showSectionError(sectionId, message) {
  const section = document.getElementById(sectionId);
  if (!section) return;
  const placeholder = section.querySelector('.chart-placeholder');
  if (placeholder) { placeholder.textContent = message; placeholder.style.display = 'block'; }
  section.querySelectorAll('canvas').forEach(c => { c.style.display = 'none'; });
  section.querySelectorAll('.charts-grid').forEach(g => { g.style.display = 'none'; });
}

function setBadge(id, level, text) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = text;
  el.className = `badge badge--${level}`;
  el.style.display = 'inline-block';
}

/** Populates a .spec-ribbon element with key→value pairs */
function setSpecRibbon(id, items) {
  const el = document.getElementById(id);
  if (!el) return;
  el.innerHTML = items
    .map(([k, v]) => `<span class="spec-item"><span class="spec-key">${k}</span><strong>${v}</strong></span>`)
    .join('');
}

function fmtMB(mb) {
  if (mb === null || mb === undefined) return '—';
  if (mb >= 1024) return (mb / 1024).toFixed(1) + ' GB';
  return Math.round(mb) + ' MB';
}

function fmtMHz(mhz) {
  if (mhz === null || mhz === undefined) return '—';
  return Math.round(mhz) + ' MHz';
}

function nonNull(arr) { return arr.filter(v => v !== null); }
function maxOf(arr)   { const a = nonNull(arr); return a.length ? Math.max(...a) : null; }
function minOf(arr)   { const a = nonNull(arr); return a.length ? Math.min(...a) : null; }
function avgOf(arr)   {
  const a = nonNull(arr);
  return a.length ? a.reduce((s, v) => s + v, 0) / a.length : null;
}

// ── Modal ─────────────────────────────────────────────────────────────────────

let activeModalChart = null;

function openModal(canvasId) {
  const config = chartRegistry.get(canvasId);
  if (!config) return;

  const overlay   = document.getElementById('modal-overlay');
  const modalCanvas = document.getElementById('modal-canvas');
  const modalTitle  = document.getElementById('modal-title');

  const titleText = config.options?.plugins?.title?.text || canvasId;
  modalTitle.textContent = titleText;

  if (activeModalChart) { activeModalChart.destroy(); activeModalChart = null; }
  // Reset canvas size
  modalCanvas.width  = modalCanvas.parentElement.clientWidth;
  modalCanvas.height = modalCanvas.parentElement.clientHeight;

  activeModalChart = renderToCanvas(canvasId, modalCanvas);
  overlay.classList.add('is-open');
  document.body.style.overflow = 'hidden';
}

function closeModal() {
  const overlay = document.getElementById('modal-overlay');
  overlay.classList.remove('is-open');
  if (activeModalChart) { activeModalChart.destroy(); activeModalChart = null; }
  document.body.style.overflow = '';
}

function setupModalTriggers() {
  document.querySelectorAll('.card').forEach(card => {
    const canvas = card.querySelector('canvas');
    if (!canvas) return;
    card.style.cursor = 'pointer';
    card.title = '클릭하면 전체화면으로 확대됩니다';
    card.addEventListener('click', () => openModal(canvas.id));
  });

  document.getElementById('modal-close').addEventListener('click', closeModal);
  document.getElementById('modal-overlay').addEventListener('click', e => {
    if (e.target === e.currentTarget) closeModal();
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeModal();
  });
}

// ── CPU Summary Section ───────────────────────────────────────────────────────

function renderCpuSection(data) {
  const { timestamps: ts, userPct, sysPct, idlePct,
          loadAvg1m, loadAvg5m, loadAvg15m,
          physMemUnusedMB, swapoutsDelta, totalRamMB } = data;

  createLineChart('chart-cpu-usage', ts, [
    { label: 'User %', data: userPct, color: COLORS.user },
    { label: 'Sys %',  data: sysPct,  color: COLORS.sys,
      pointColors: pointColorsFromThreshold(sysPct, v => v > 30, COLORS.sys) },
    { label: 'Idle %', data: idlePct, color: COLORS.idle },
  ], { plugins: { title: { display: true, text: 'CPU 사용률 (%)', color: '#cdd6f4' } },
       scales: { y: { min: 0, max: 100 } } });

  createLineChart('chart-load-avg', ts, [
    { label: 'Load 1m',  data: loadAvg1m,  color: COLORS.load1 },
    { label: 'Load 5m',  data: loadAvg5m,  color: COLORS.load5 },
    { label: 'Load 15m', data: loadAvg15m, color: COLORS.load15 },
  ], { plugins: { title: { display: true, text: 'Load Average', color: '#cdd6f4' } } });

  const memPointColors = pointColorsFromThreshold(
    physMemUnusedMB, v => v < THRESHOLD.physMemUnusedMB, COLORS.mem, COLORS.WARNING,
  );
  createLineChart('chart-mem-unused', ts, [
    { label: 'Unused RAM (MB)', data: physMemUnusedMB, color: COLORS.mem, pointColors: memPointColors },
  ], { plugins: { title: { display: true, text: `Unused RAM (MB)  ·  총 ${fmtMB(totalRamMB)}`, color: '#cdd6f4' } },
       scales: { y: { min: 0 } } });

  const swapPointColors = pointColorsFromThreshold(
    swapoutsDelta, v => v !== null && v > 0, COLORS.swap, COLORS.DANGER,
  );
  createLineChart('chart-swapouts', ts, [
    { label: 'Swapouts (delta)', data: swapoutsDelta, color: COLORS.swap, pointColors: swapPointColors },
  ], { plugins: { title: { display: true, text: 'Swapouts 증분', color: '#cdd6f4' } },
       scales: { y: { min: 0 } } });

  // Spec ribbon
  setSpecRibbon('specs-cpu', [
    ['총 RAM',        fmtMB(totalRamMB)],
    ['Unused 최솟값', fmtMB(minOf(physMemUnusedMB))],
    ['Unused 최댓값', fmtMB(maxOf(physMemUnusedMB))],
    ['Sys% 최댓값',   (maxOf(sysPct) ?? '—') + '%'],
    ['샘플 수',       ts.length + '개'],
  ]);

  // Badges
  const hasSwapout   = swapoutsDelta.some(v => v !== null && v > 0);
  const hasMemWarn   = physMemUnusedMB.some(v => v !== null && v < THRESHOLD.physMemUnusedMB);
  setBadge('badge-swapout', hasSwapout ? 'danger' : 'safe',
    hasSwapout ? '⚠ Swapout 발생 — 드롭아웃 위험!' : '✓ Swapout 없음');
  setBadge('badge-mem', hasMemWarn ? 'warning' : 'safe',
    hasMemWarn ? `⚠ Unused < ${THRESHOLD.physMemUnusedMB}MB` : '✓ 메모리 여유');
}

// ── Disk Section ──────────────────────────────────────────────────────────────

function renderDiskSection(data) {
  const { labels, diskMBs, diskTps, cpuUs, cpuSy, cpuId,
          loadAvg1m, loadAvg5m, loadAvg15m } = data;

  createLineChart('chart-disk-mbs', labels, [
    { label: 'Disk MB/s', data: diskMBs, color: COLORS.disk },
  ], { plugins: { title: { display: true, text: '디스크 전송 속도 (MB/s)', color: '#cdd6f4' } },
       scales: { y: { min: 0 } } });

  createLineChart('chart-disk-cpu', labels, [
    { label: 'CPU User %', data: cpuUs, color: COLORS.cpuUs },
    { label: 'CPU Sys %',  data: cpuSy, color: COLORS.cpuSy,
      pointColors: pointColorsFromThreshold(cpuSy, v => v > 25, COLORS.cpuSy) },
    { label: 'CPU Idle %', data: cpuId, color: COLORS.idle },
  ], { plugins: { title: { display: true, text: 'CPU 점유율 (iostat, %)', color: '#cdd6f4' } },
       scales: { y: { min: 0, max: 100 } } });

  createLineChart('chart-disk-load', labels, [
    { label: 'Load 1m',  data: loadAvg1m,  color: COLORS.load1 },
    { label: 'Load 5m',  data: loadAvg5m,  color: COLORS.load5 },
    { label: 'Load 15m', data: loadAvg15m, color: COLORS.load15 },
  ], { plugins: { title: { display: true, text: 'Load Average (iostat)', color: '#cdd6f4' } } });

  const avgMBs = avgOf(diskMBs);
  setSpecRibbon('specs-disk', [
    ['최대 MB/s',   (maxOf(diskMBs) ?? '—') + ' MB/s'],
    ['평균 MB/s',   avgMBs !== null ? avgMBs.toFixed(2) + ' MB/s' : '—'],
    ['최대 TPS',    (maxOf(diskTps) ?? '—') + ' tps'],
    ['Sys% 최댓값', (maxOf(cpuSy) ?? '—') + '%'],
    ['샘플 수',     labels.length + '개'],
  ]);
}

// ── Hardware Section ──────────────────────────────────────────────────────────

function renderHwSection(data) {
  const { timestamps: ts, eClusterResidency, pClusterResidency,
          eClusterFreqMHz, pClusterFreqMHz,
          cpuPowerMW, gpuPowerMW, anePowerMW,
          gpuResidency, gpuFreqMHz, thermalLevels, machineModel } = data;

  createLineChart('chart-cluster', ts, [
    { label: 'E-Cluster (%)', data: eClusterResidency, color: COLORS.eCluster },
    { label: 'P-Cluster (%)', data: pClusterResidency, color: COLORS.pCluster },
  ], { plugins: { title: { display: true, text: 'CPU 클러스터 Active Residency (%)', color: '#cdd6f4' } },
       scales: { y: { min: 0, max: 100 } } });

  createLineChart('chart-cluster-freq', ts, [
    { label: 'E-Cluster (MHz)', data: eClusterFreqMHz, color: COLORS.eFreq },
    { label: 'P-Cluster (MHz)', data: pClusterFreqMHz, color: COLORS.pFreq },
  ], { plugins: { title: { display: true, text: 'CPU 클러스터 동작 주파수 (MHz)', color: '#cdd6f4' } },
       scales: { y: { min: 0 } } });

  createBarChart('chart-power', ts, [
    { label: 'CPU Power (mW)', data: cpuPowerMW, color: COLORS.cpuPwr },
    { label: 'GPU Power (mW)', data: gpuPowerMW, color: COLORS.gpuPwr },
    { label: 'ANE Power (mW)', data: anePowerMW, color: COLORS.anePwr },
  ], { plugins: { title: { display: true, text: '전력 소비 (mW)', color: '#cdd6f4' } } });

  createLineChart('chart-gpu', ts, [
    { label: 'GPU Active (%)',   data: gpuResidency, color: COLORS.gpuRes },
    { label: 'GPU Freq (MHz)', data: gpuFreqMHz,   color: COLORS.gpuPwr },
  ], { plugins: { title: { display: true, text: 'GPU 사용률 (%) · 동작 주파수 (MHz)', color: '#cdd6f4' } },
       scales: { y: { min: 0 } } });

  // Thermal badge
  const lastThermal = thermalLevels[thermalLevels.length - 1] || 'Unknown';
  const anyHot = thermalLevels.some(l => l !== 'Nominal' && l !== 'Unknown');
  if (anyHot) {
    setBadge('badge-thermal', 'danger', `⚠ Thermal: ${lastThermal} — 스로틀링 주의!`);
  } else {
    setBadge('badge-thermal', lastThermal === 'Nominal' ? 'safe' : 'warning',
      lastThermal === 'Nominal' ? '✓ Thermal: Nominal' : `Thermal: ${lastThermal}`);
  }

  // Spec ribbon
  if (machineModel) {
    const modelEl = document.getElementById('machine-model');
    if (modelEl) modelEl.textContent = machineModel;
  }
  setSpecRibbon('specs-hw', [
    ['머신',          machineModel || '—'],
    ['E-Cluster 최대', fmtMHz(maxOf(eClusterFreqMHz))],
    ['P-Cluster 최대', fmtMHz(maxOf(pClusterFreqMHz))],
    ['GPU Freq 최대',  fmtMHz(maxOf(gpuFreqMHz))],
    ['CPU 전력 최대',  (maxOf(cpuPowerMW) ?? '—') + ' mW'],
    ['GPU 전력 최대',  (maxOf(gpuPowerMW) ?? '—') + ' mW'],
    ['샘플 수',        ts.length + '개'],
  ]);
}

// ── Entry point ───────────────────────────────────────────────────────────────

async function init() {
  setupModalTriggers();

  const [cpuResult, diskResult, hwResult] = await Promise.allSettled([
    fetchText(DATA_FILES.cpu),
    fetchText(DATA_FILES.disk),
    fetchText(DATA_FILES.hw),
  ]);

  if (cpuResult.status === 'fulfilled') {
    try { renderCpuSection(parseCpuSummary(cpuResult.value)); }
    catch (e) { console.warn('CPU 섹션 파싱 오류:', e); showSectionError('section-cpu', '파싱 오류: ' + e.message); }
  } else {
    console.warn('CPU 로그 로드 실패:', cpuResult.reason);
    showSectionError('section-cpu', '데이터 없음: ' + cpuResult.reason.message);
  }

  if (diskResult.status === 'fulfilled') {
    try { renderDiskSection(parseDiskLog(diskResult.value)); }
    catch (e) { console.warn('Disk 섹션 파싱 오류:', e); showSectionError('section-disk', '파싱 오류: ' + e.message); }
  } else {
    console.warn('Disk 로그 로드 실패:', diskResult.reason);
    showSectionError('section-disk', '데이터 없음: ' + diskResult.reason.message);
  }

  if (hwResult.status === 'fulfilled') {
    try { renderHwSection(parseHwLog(hwResult.value)); }
    catch (e) { console.warn('HW 섹션 파싱 오류:', e); showSectionError('section-hw', '파싱 오류: ' + e.message); }
  } else {
    console.warn('HW 로그 로드 실패:', hwResult.reason);
    showSectionError('section-hw', '데이터 없음: ' + hwResult.reason.message);
  }
}

document.addEventListener('DOMContentLoaded', init);
