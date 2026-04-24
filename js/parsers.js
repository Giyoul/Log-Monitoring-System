'use strict';

/**
 * parseCpuSummary
 * Parses macOS `top -l` output.
 * Returns arrays indexed by sample (each block separated by blank lines).
 */
function parseCpuSummary(text) {
  const result = {
    timestamps: [],
    userPct: [],
    sysPct: [],
    idlePct: [],
    loadAvg1m: [],
    loadAvg5m: [],
    loadAvg15m: [],
    physMemUnusedMB: [],
    swapoutsDelta: [],
    totalRamMB: null,   // extracted from first valid block
  };

  // Split into blocks by double newline
  const blocks = text.replace(/\r\n/g, '\n').split(/\n\s*\n/).filter(b => b.trim().length > 0);
  let prevSwapouts = null;

  for (const block of blocks) {
    const lines = block.split('\n');

    let ts = null;
    let user = null, sys = null, idle = null;
    let la1 = null, la5 = null, la15 = null;
    let unusedMB = null;
    let swapoutsRaw = null;

    for (const line of lines) {
      // Timestamp: "2026/04/14 16:53:16"
      const tsMatch = line.match(/^(\d{4}\/\d{2}\/\d{2} \d{2}:\d{2}:\d{2})$/);
      if (tsMatch) { ts = tsMatch[1]; continue; }

      // Load Avg: "Load Avg: 2.39, 3.23, 3.39"
      const laMatch = line.match(/Load Avg:\s*([\d.]+),\s*([\d.]+),\s*([\d.]+)/);
      if (laMatch) { la1 = parseFloat(laMatch[1]); la5 = parseFloat(laMatch[2]); la15 = parseFloat(laMatch[3]); continue; }

      // CPU usage: "CPU usage: 5.18% user, 10.66% sys, 84.14% idle"
      const cpuMatch = line.match(/CPU usage:\s*([\d.]+)%\s*user,\s*([\d.]+)%\s*sys,\s*([\d.]+)%\s*idle/);
      if (cpuMatch) { user = parseFloat(cpuMatch[1]); sys = parseFloat(cpuMatch[2]); idle = parseFloat(cpuMatch[3]); continue; }

      // PhysMem: "PhysMem: 17G used (3001M wired, 6662M compressor), 99M unused."
      const memUsedMatch = line.match(/PhysMem:\s*([\d.]+)([MG])\s*used/);
      const memMatch = line.match(/PhysMem:.*?,\s*([\d.]+)([MG])\s*unused/);
      if (memMatch) {
        const val = parseFloat(memMatch[1]);
        unusedMB = memMatch[2] === 'G' ? val * 1024 : val;
        if (memUsedMatch && result.totalRamMB === null) {
          const usedVal = parseFloat(memUsedMatch[1]);
          const usedMB = memUsedMatch[2] === 'G' ? usedVal * 1024 : usedVal;
          result.totalRamMB = usedMB + unusedMB;
        }
        continue;
      }

      // VM / swapouts: "VM: ... 915065(0) swapins, 1306445(0) swapouts."
      const swapMatch = line.match(/(\d+)\(\d+\)\s*swapouts/);
      if (swapMatch) { swapoutsRaw = parseInt(swapMatch[1], 10); continue; }
    }

    if (ts === null) continue; // skip blocks without timestamp

    // First sample has no baseline — push null so Chart.js renders a gap
    // rather than a misleading zero. Badge check must exclude nulls.
    const swapDelta = (prevSwapouts !== null && swapoutsRaw !== null)
      ? Math.max(0, swapoutsRaw - prevSwapouts)
      : null;
    if (swapoutsRaw !== null) prevSwapouts = swapoutsRaw;

    result.timestamps.push(ts.split(' ')[1]); // time part only
    result.userPct.push(user);
    result.sysPct.push(sys);
    result.idlePct.push(idle);
    result.loadAvg1m.push(la1);
    result.loadAvg5m.push(la5);
    result.loadAvg15m.push(la15);
    result.physMemUnusedMB.push(unusedMB);
    result.swapoutsDelta.push(swapDelta);
  }

  return result;
}

/**
 * parseDiskLog
 * Parses macOS `iostat` output.
 * Header lines start with non-numeric; data rows start with numeric (KB/t value).
 */
function parseDiskLog(text) {
  const result = {
    labels: [],
    diskKBt: [],
    diskTps: [],
    diskMBs: [],
    cpuUs: [],
    cpuSy: [],
    cpuId: [],
    loadAvg1m: [],
    loadAvg5m: [],
    loadAvg15m: [],
  };

  const lines = text.split('\n');
  let sampleIndex = 0;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    // Data rows: first token is a number (KB/t)
    const cols = trimmed.split(/\s+/);
    if (cols.length < 9) continue;
    if (!/^\d/.test(cols[0])) continue; // header / label row

    const [kbt, tps, mbs, us, sy, id, la1, la5, la15] = cols.map(parseFloat);
    if (isNaN(kbt)) { console.warn('parseDiskLog: skipping malformed line:', line.trim()); continue; }

    sampleIndex++;
    result.labels.push(`S${sampleIndex}`);
    result.diskKBt.push(kbt);
    result.diskTps.push(tps);
    result.diskMBs.push(mbs);
    result.cpuUs.push(us);
    result.cpuSy.push(sy);
    result.cpuId.push(id);
    result.loadAvg1m.push(la1);
    result.loadAvg5m.push(la5);
    result.loadAvg15m.push(la15);
  }

  return result;
}

/**
 * parseHwLog
 * Parses macOS `powermetrics` output.
 * Splits by "*** Sampled system activity" blocks.
 */
function parseHwLog(text) {
  const result = {
    timestamps: [],
    eClusterResidency: [],
    pClusterResidency: [],
    eClusterFreqMHz: [],
    pClusterFreqMHz: [],
    eClusterPowerMW: [],   // M1+: E-Cluster Power
    pClusterPowerMW: [],   // M1+: P-Cluster Power
    cpuPowerMW: [],
    gpuPowerMW: [],
    anePowerMW: [],
    dramPowerMW: [],       // M1+: DRAM Power
    packagePowerMW: [],    // M1+: total Package Power
    gpuResidency: [],
    gpuFreqMHz: [],
    thermalLevels: [],
    machineModel: null,
  };

  // Normalize line endings before parsing (CRLF → LF)
  const normalized = text.replace(/\r\n/g, '\n');

  // Extract machine model from preamble
  const modelMatch = normalized.match(/Machine model:\s*(.+)/);
  if (modelMatch) result.machineModel = modelMatch[1].trim();

  // First element after split is preamble — skip it
  const snapshots = normalized.split(/\*\*\* Sampled system activity/).slice(1).filter(s => s.trim().length > 0);

  for (const snap of snapshots) {
    // Timestamp: "(Tue Apr 14 16:54:03 2026 +0900)"
    const tsMatch = snap.match(/\(([^)]+\d{4}[^)]*)\)/);
    const ts = tsMatch ? tsMatch[1].trim() : `S${result.timestamps.length + 1}`;
    // Extract time portion HH:MM:SS
    const timeMatch = ts.match(/(\d{2}:\d{2}:\d{2})/);
    result.timestamps.push(timeMatch ? timeMatch[1] : ts);

    // E-Cluster HW active residency & frequency
    const eMatch = snap.match(/E-Cluster HW active residency:\s*([\d.]+)%/);
    result.eClusterResidency.push(eMatch ? parseFloat(eMatch[1]) : null);
    const eFreqMatch = snap.match(/E-Cluster HW active frequency:\s*([\d.]+)\s*MHz/);
    result.eClusterFreqMHz.push(eFreqMatch ? parseFloat(eFreqMatch[1]) : null);

    // P-Cluster HW active residency & frequency
    const pMatch = snap.match(/P-Cluster HW active residency:\s*([\d.]+)%/);
    result.pClusterResidency.push(pMatch ? parseFloat(pMatch[1]) : null);
    const pFreqMatch = snap.match(/P-Cluster HW active frequency:\s*([\d.]+)\s*MHz/);
    result.pClusterFreqMHz.push(pFreqMatch ? parseFloat(pFreqMatch[1]) : null);

    // Cluster-level power (M1+)
    const ePwrMatch  = snap.match(/E-Cluster Power:\s*([\d.]+)\s*mW/);
    result.eClusterPowerMW.push(ePwrMatch ? parseFloat(ePwrMatch[1]) : null);
    const pPwrMatch  = snap.match(/P-Cluster Power:\s*([\d.]+)\s*mW/);
    result.pClusterPowerMW.push(pPwrMatch ? parseFloat(pPwrMatch[1]) : null);

    // CPU Power (total, matches first occurrence)
    const cpuPwrMatch = snap.match(/^CPU Power:\s*([\d.]+)\s*mW/m);
    result.cpuPowerMW.push(cpuPwrMatch ? parseFloat(cpuPwrMatch[1]) : null);

    // GPU Power (first ^GPU Power line)
    const gpuPwrMatch = snap.match(/^GPU Power:\s*([\d.]+)\s*mW/m);
    result.gpuPowerMW.push(gpuPwrMatch ? parseFloat(gpuPwrMatch[1]) : null);

    // ANE / DRAM / Package Power
    const anePwrMatch  = snap.match(/^ANE Power:\s*([\d.]+)\s*mW/m);
    result.anePowerMW.push(anePwrMatch ? parseFloat(anePwrMatch[1]) : null);
    const dramPwrMatch = snap.match(/^DRAM Power:\s*([\d.]+)\s*mW/m);
    result.dramPowerMW.push(dramPwrMatch ? parseFloat(dramPwrMatch[1]) : null);
    const pkgPwrMatch  = snap.match(/^Package Power:\s*([\d.]+)\s*mW/m);
    result.packagePowerMW.push(pkgPwrMatch ? parseFloat(pkgPwrMatch[1]) : null);

    // GPU active residency & frequency
    // M1: "GPU active residency" / M3+: "GPU HW active residency"
    const gpuResMatch  = snap.match(/GPU (?:HW )?active residency:\s*([\d.]+)%/);
    result.gpuResidency.push(gpuResMatch ? parseFloat(gpuResMatch[1]) : null);
    const gpuFreqMatch = snap.match(/GPU (?:HW )?active frequency:\s*([\d.]+)\s*MHz/);
    result.gpuFreqMHz.push(gpuFreqMatch ? parseFloat(gpuFreqMatch[1]) : null);

    // Thermal pressure level: "Current pressure level: Nominal"
    const thermalMatch = snap.match(/Current pressure level:\s*(\w+)/);
    result.thermalLevels.push(thermalMatch ? thermalMatch[1] : 'Unknown');
  }

  return result;
}
