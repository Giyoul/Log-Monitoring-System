'use strict';

const DATA_FILES = {
  cpu:  'data/relay_cpu_summary.txt',
  disk: 'data/relay_disk_log.txt',
  hw:   'data/relay_hw_log.txt',
};

const THRESHOLD = {
  physMemUnusedMB: 500,   // below this → warning
};

async function fetchText(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.text();
}

function showSectionError(sectionId, message) {
  const section = document.getElementById(sectionId);
  if (!section) return;
  // find first .chart-placeholder inside this section
  const placeholder = section.querySelector('.chart-placeholder');
  if (placeholder) {
    placeholder.textContent = message;
    placeholder.style.display = 'block';
  }
  section.querySelectorAll('canvas').forEach(c => { c.style.display = 'none'; });
  section.querySelectorAll('.charts-grid').forEach(g => { g.style.display = 'none'; });
}

// ── CPU Summary Section ───────────────────────────────────────────────────────

function renderCpuSection(data) {
  const { timestamps: ts, userPct, sysPct, idlePct,
          loadAvg1m, loadAvg5m, loadAvg15m,
          physMemUnusedMB, swapoutsDelta } = data;

  // Chart 1: CPU %
  createLineChart('chart-cpu-usage', ts, [
    { label: 'User %',  data: userPct,  color: COLORS.user },
    { label: 'Sys %',   data: sysPct,   color: COLORS.sys,
      pointColors: pointColorsFromThreshold(sysPct, v => v > 30, COLORS.sys) },
    { label: 'Idle %',  data: idlePct,  color: COLORS.idle },
  ], { plugins: { title: { display: true, text: 'CPU 사용률 (%)', color: '#cdd6f4' } },
       scales: { y: { min: 0, max: 100 } } });

  // Chart 2: Load Average
  createLineChart('chart-load-avg', ts, [
    { label: 'Load 1m',  data: loadAvg1m,  color: COLORS.load1 },
    { label: 'Load 5m',  data: loadAvg5m,  color: COLORS.load5 },
    { label: 'Load 15m', data: loadAvg15m, color: COLORS.load15 },
  ], { plugins: { title: { display: true, text: 'Load Average', color: '#cdd6f4' } } });

  // Chart 3: PhysMem Unused
  const memPointColors = pointColorsFromThreshold(
    physMemUnusedMB,
    v => v < THRESHOLD.physMemUnusedMB,
    COLORS.mem,
    COLORS.WARNING,
  );
  createLineChart('chart-mem-unused', ts, [
    { label: 'Unused RAM (MB)', data: physMemUnusedMB, color: COLORS.mem, pointColors: memPointColors },
  ], { plugins: { title: { display: true, text: 'PhysMem Unused (MB)', color: '#cdd6f4' } },
       scales: { y: { min: 0 } } });

  // Chart 4: Swapouts delta
  const swapPointColors = pointColorsFromThreshold(
    swapoutsDelta, v => v !== null && v > 0, COLORS.swap, COLORS.DANGER,
  );
  createLineChart('chart-swapouts', ts, [
    { label: 'Swapouts (delta)', data: swapoutsDelta, color: COLORS.swap, pointColors: swapPointColors },
  ], { plugins: { title: { display: true, text: 'Swapouts (샘플 간 증분)', color: '#cdd6f4' } },
       scales: { y: { min: 0 } } });

  // Badges
  const hasSwapout = swapoutsDelta.some(v => v !== null && v > 0);
  const hasMemWarning = physMemUnusedMB.some(v => v !== null && v < THRESHOLD.physMemUnusedMB);
  setBadge('badge-swapout', hasSwapout ? 'danger' : 'safe',
    hasSwapout ? '⚠ Swapout 발생 — 오디오 드롭아웃 위험!' : '✓ Swapout 없음');
  setBadge('badge-mem', hasMemWarning ? 'warning' : 'safe',
    hasMemWarning ? `⚠ 메모리 부족 (unused < ${THRESHOLD.physMemUnusedMB}MB)` : '✓ 메모리 여유');
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
  ], { plugins: { title: { display: true, text: 'CPU 점유율 (iostat)', color: '#cdd6f4' } },
       scales: { y: { min: 0, max: 100 } } });

  createLineChart('chart-disk-load', labels, [
    { label: 'Load 1m',  data: loadAvg1m,  color: COLORS.load1 },
    { label: 'Load 5m',  data: loadAvg5m,  color: COLORS.load5 },
    { label: 'Load 15m', data: loadAvg15m, color: COLORS.load15 },
  ], { plugins: { title: { display: true, text: 'Load Average (iostat)', color: '#cdd6f4' } } });
}

// ── Hardware Section ──────────────────────────────────────────────────────────

function renderHwSection(data) {
  const { timestamps: ts, eClusterResidency, pClusterResidency,
          cpuPowerMW, gpuPowerMW, anePowerMW,
          gpuResidency, thermalLevels } = data;

  createLineChart('chart-cluster', ts, [
    { label: 'E-Cluster 잔존율 (%)', data: eClusterResidency, color: COLORS.eCluster },
    { label: 'P-Cluster 잔존율 (%)', data: pClusterResidency, color: COLORS.pCluster },
  ], { plugins: { title: { display: true, text: 'CPU 클러스터 Active Residency (%)', color: '#cdd6f4' } },
       scales: { y: { min: 0, max: 100 } } });

  createBarChart('chart-power', ts, [
    { label: 'CPU Power (mW)', data: cpuPowerMW, color: COLORS.cpuPwr },
    { label: 'GPU Power (mW)', data: gpuPowerMW, color: COLORS.gpuPwr },
    { label: 'ANE Power (mW)', data: anePowerMW, color: COLORS.anePwr },
  ], { plugins: { title: { display: true, text: '전력 소비 (mW)', color: '#cdd6f4' } } });

  createLineChart('chart-gpu', ts, [
    { label: 'GPU Active Residency (%)', data: gpuResidency, color: COLORS.gpuRes },
  ], { plugins: { title: { display: true, text: 'GPU 사용률 (%)', color: '#cdd6f4' } },
       scales: { y: { min: 0, max: 100 } } });

  // Thermal badge — warn if ANY snapshot was non-nominal, show last known level
  const lastThermal = thermalLevels[thermalLevels.length - 1] || 'Unknown';
  const anyHot = thermalLevels.some(l => l !== 'Nominal' && l !== 'Unknown');
  if (anyHot) {
    setBadge('badge-thermal', 'danger', `⚠ Thermal: ${lastThermal} — 스로틀링 주의!`);
  } else {
    setBadge('badge-thermal', lastThermal === 'Nominal' ? 'safe' : 'warning',
      lastThermal === 'Nominal' ? `✓ Thermal: Nominal` : `Thermal: ${lastThermal}`);
  }
}

// ── Badge helper ──────────────────────────────────────────────────────────────

function setBadge(id, level, text) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = text;
  el.className = `badge badge--${level}`;
  el.style.display = 'inline-block';
}

// ── Entry point ───────────────────────────────────────────────────────────────

async function init() {
  const [cpuResult, diskResult, hwResult] = await Promise.allSettled([
    fetchText(DATA_FILES.cpu),
    fetchText(DATA_FILES.disk),
    fetchText(DATA_FILES.hw),
  ]);

  if (cpuResult.status === 'fulfilled') {
    try {
      renderCpuSection(parseCpuSummary(cpuResult.value));
    } catch (e) {
      console.warn('CPU 섹션 파싱 오류:', e);
      showSectionError('section-cpu', '데이터 파싱 오류: ' + e.message);
    }
  } else {
    console.warn('CPU 로그 로드 실패:', cpuResult.reason);
    showSectionError('section-cpu', '데이터 없음: ' + cpuResult.reason.message);
  }

  if (diskResult.status === 'fulfilled') {
    try {
      renderDiskSection(parseDiskLog(diskResult.value));
    } catch (e) {
      console.warn('Disk 섹션 파싱 오류:', e);
      showSectionError('section-disk', '데이터 파싱 오류: ' + e.message);
    }
  } else {
    console.warn('Disk 로그 로드 실패:', diskResult.reason);
    showSectionError('section-disk', '데이터 없음: ' + diskResult.reason.message);
  }

  if (hwResult.status === 'fulfilled') {
    try {
      renderHwSection(parseHwLog(hwResult.value));
    } catch (e) {
      console.warn('HW 섹션 파싱 오류:', e);
      showSectionError('section-hw', '데이터 파싱 오류: ' + e.message);
    }
  } else {
    console.warn('HW 로그 로드 실패:', hwResult.reason);
    showSectionError('section-hw', '데이터 없음: ' + hwResult.reason.message);
  }
}

document.addEventListener('DOMContentLoaded', init);
