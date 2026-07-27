// ============================================================
// ENGINE F — APP LAYER
// Wires engine.js to the UI: boot sequence, sliders, chart, panels
// ============================================================

// -------------------- STATE --------------------
const state = {
  currentAge: 32,
  retireAge: 65,
  endAge: 92,
  startingBalance: 250000,
  annualIncome: 120000,
  savingsRate: 0.24,
  retirementSpend: 58000,
  expectedReturn: 0.07,
  returnStdDev: 0.12,
  inflation: 0.025,
  // account-type mix (raw weights, normalized by the engine)
  allocTrad: 55,
  allocRoth: 15,
  allocTaxable: 30,
  confidence: 90,
  numSims: 600,
};

let lastResult = null;
let lastBands = null;
let lastSummary = null;
let hazardShownForThisRun = false;

// -------------------- SCENARIO ARCHIVE --------------------
// v2: account-type model changed what a saved result means (tax-aware), so
// a new key avoids mixing pre-tax snapshots into comparisons.
const SCENARIO_STORE_KEY = 'enginef.scenarios.v2';
// Distinct phosphor hues for overlaid comparison lines (live median is green).
const OVERLAY_COLORS = ['#ffb000', '#4de1ff', '#ff6ad5', '#c8ff4d'];
let comparisonOverlays = []; // [{ id, name, years, medianPath, color }]

function getScenarios() {
  try {
    return JSON.parse(localStorage.getItem(SCENARIO_STORE_KEY)) || [];
  } catch (e) {
    return [];
  }
}
function setScenarios(arr) {
  try {
    localStorage.setItem(SCENARIO_STORE_KEY, JSON.stringify(arr));
  } catch (e) {
    // storage unavailable/full — archive just won't persist this session
  }
}
function newScenarioId() {
  if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
  return 's' + Date.now() + Math.random().toString(36).slice(2);
}

// -------------------- BOOT SEQUENCE --------------------
const bootLogLines = [
  'ENGINE F — TRAJECTORY SYSTEM',
  'INITIALIZING CORE...........OK',
  'LOADING TAX SUBSYSTEM (FED/NC)...OK',
  'LOADING SIM.CORE (MONTE CARLO)...OK',
  'CALIBRATING PERCENTILE BANDS...OK',
  'ESTABLISHING CONSOLE LINK...OK',
  '',
  'STANDING BY.',
];

function playBootStinger() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const now = ctx.currentTime;
    // simple ascending synth arpeggio + pad, retro console power-on
    const notes = [220, 277.18, 329.63, 440, 554.37, 659.25];
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'square';
      osc.frequency.value = freq;
      const start = now + i * 0.09;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.08, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.35);
      osc.connect(gain).connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.4);
    });
    // low pad underneath
    const pad = ctx.createOscillator();
    const padGain = ctx.createGain();
    pad.type = 'sawtooth';
    pad.frequency.value = 110;
    padGain.gain.setValueAtTime(0, now);
    padGain.gain.linearRampToValueAtTime(0.05, now + 0.3);
    padGain.gain.exponentialRampToValueAtTime(0.001, now + 2.2);
    pad.connect(padGain).connect(ctx.destination);
    pad.start(now);
    pad.stop(now + 2.3);
  } catch (e) {
    // audio not available/blocked — fail silently, boot still proceeds visually
  }
}

function startAmbientDrone() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = 55;
    gain.gain.value = 0.015;
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    // very subtle, near-subliminal — most users will feel rather than hear it
  } catch (e) {}
}

function runBootLogTyping() {
  const el = document.getElementById('boot-log-text');
  let text = '';
  let lineIdx = 0;
  function nextLine() {
    if (lineIdx >= bootLogLines.length) return;
    text += bootLogLines[lineIdx] + '\n';
    el.textContent = text;
    lineIdx++;
    setTimeout(nextLine, 220);
  }
  nextLine();
}

function finishBoot() {
  document.getElementById('boot-screen').classList.add('hidden');
  document.getElementById('dashboard').classList.remove('hidden');
  startAmbientDrone();
  initControls();
  // Size the canvas now that the dashboard is visible — at window-load time
  // the dashboard was display:none, so its parent measured 0 wide.
  resizeCanvas();
  recompute(true);
  renderScenarioList();
}

function initBoot() {
  playBootStinger();
  runBootLogTyping();
  const bootScreen = document.getElementById('boot-screen');
  const timer = setTimeout(finishBoot, 4000);
  document.getElementById('skip-boot').addEventListener('click', () => {
    clearTimeout(timer);
    finishBoot();
  });
}

// -------------------- CONTROLS --------------------
function initControls() {
  bindSlider('slider-retireAge', 'val-retireAge', (v) => {
    state.retireAge = +v;
    return `${v}`;
  });
  bindSlider('slider-savingsRate', 'val-savingsRate', (v) => {
    state.savingsRate = v / 100;
    return `${v}%`;
  });
  bindSlider('slider-retirementSpend', 'val-retirementSpend', (v) => {
    state.retirementSpend = +v;
    return `$${(+v).toLocaleString()}`;
  });
  bindSlider('slider-expectedReturn', 'val-expectedReturn', (v) => {
    state.expectedReturn = v / 100;
    return `${(+v).toFixed(1)}%`;
  });
  bindSlider('slider-returnStdDev', 'val-returnStdDev', (v) => {
    state.returnStdDev = v / 100;
    return `${(+v).toFixed(1)}%`;
  });
  bindSlider('slider-startBalance', 'val-startBalance', (v) => {
    state.startingBalance = +v;
    updateAllocationLabels(); // per-bucket dollar amounts depend on the total
    return `$${(+v).toLocaleString()}`;
  });
  bindSlider('slider-confidence', 'val-confidence', (v) => {
    state.confidence = +v;
    return `${v}%`;
  });

  // allocation sliders share one label updater (labels show normalized % + $)
  bindAllocSlider('slider-allocTrad', 'allocTrad');
  bindAllocSlider('slider-allocRoth', 'allocRoth');
  bindAllocSlider('slider-allocTaxable', 'allocTaxable');

  // set defaults into the inputs
  document.getElementById('slider-retireAge').value = state.retireAge;
  document.getElementById('slider-savingsRate').value = state.savingsRate * 100;
  document.getElementById('slider-retirementSpend').value = state.retirementSpend;
  document.getElementById('slider-expectedReturn').value = (state.expectedReturn * 100).toFixed(1);
  document.getElementById('slider-returnStdDev').value = (state.returnStdDev * 100).toFixed(1);
  document.getElementById('slider-startBalance').value = state.startingBalance;
  document.getElementById('slider-allocTrad').value = state.allocTrad;
  document.getElementById('slider-allocRoth').value = state.allocRoth;
  document.getElementById('slider-allocTaxable').value = state.allocTaxable;
  document.getElementById('slider-confidence').value = state.confidence;

  // trigger initial label paint
  ['retireAge','savingsRate','retirementSpend','expectedReturn','returnStdDev','startBalance','confidence']
    .forEach((id) => {
      const el = document.getElementById('slider-' + id);
      el.dispatchEvent(new Event('input'));
    });
  updateAllocationLabels();

  document.getElementById('hazard-ack').addEventListener('click', () => {
    document.getElementById('hazard-modal').classList.add('hidden');
  });

  // scenario archive controls
  document.getElementById('save-scenario').addEventListener('click', saveScenario);
  document.getElementById('scenario-name').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') saveScenario();
  });
}

let recomputeTimer = null;
function bindSlider(sliderId, labelId, updateFn) {
  const slider = document.getElementById(sliderId);
  const label = document.getElementById(labelId);
  slider.addEventListener('input', () => {
    label.textContent = updateFn(slider.value);
    // throttle recompute so dragging feels live but doesn't choke the thread
    clearTimeout(recomputeTimer);
    recomputeTimer = setTimeout(() => recompute(false), 40);
  });
}

// Allocation sliders are interdependent (labels show each bucket as a share
// of the normalized total), so they update all three labels together.
function bindAllocSlider(sliderId, field) {
  const slider = document.getElementById(sliderId);
  slider.addEventListener('input', () => {
    state[field] = +slider.value;
    updateAllocationLabels();
    clearTimeout(recomputeTimer);
    recomputeTimer = setTimeout(() => recompute(false), 40);
  });
}

function updateAllocationLabels() {
  const alloc = normalizeAllocation({
    traditional: state.allocTrad,
    roth: state.allocRoth,
    taxable: state.allocTaxable,
  });
  const bal = state.startingBalance;
  const fmt = (frac) => `${Math.round(frac * 100)}% · $${formatCompact(bal * frac)}`;
  document.getElementById('val-allocTrad').textContent = fmt(alloc.traditional);
  document.getElementById('val-allocRoth').textContent = fmt(alloc.roth);
  document.getElementById('val-allocTaxable').textContent = fmt(alloc.taxable);
}

// -------------------- SIMULATION + RENDER --------------------
function scenarioParams(startYear) {
  return {
    startingBalance: state.startingBalance,
    currentAge: state.currentAge,
    retireAge: state.retireAge,
    endAge: state.endAge,
    annualIncome: state.annualIncome,
    savingsRate: state.savingsRate,
    retirementSpend: state.retirementSpend,
    expectedReturn: state.expectedReturn,
    returnStdDev: state.returnStdDev,
    inflation: state.inflation,
    allocation: {
      traditional: state.allocTrad,
      roth: state.allocRoth,
      taxable: state.allocTaxable,
    },
    numSims: state.numSims,
    startYear,
  };
}

function recompute() {
  const startYear = new Date().getFullYear();
  lastResult = runMonteCarlo(scenarioParams(startYear));

  const { lower, upper } = confidenceToPercentiles(state.confidence);
  const percentilesNeeded = Array.from(new Set([5, 25, 50, 75, 95, lower, upper])).sort((a,b)=>a-b);
  lastBands = computePercentileBands(lastResult.paths, percentilesNeeded);

  // Snapshot of this run's headline results, for the scenario archive.
  const median = lastBands[50];
  lastSummary = {
    successProbability: successProbability(lastResult.paths),
    finalMedian: median[median.length - 1],
    peakMedian: Math.max(...median),
    medianPath: median.slice(),
    years: lastResult.years.slice(),
    combinedMarginalRate: combinedMarginalRate(state.annualIncome, lastResult.years[0]),
    creepCount: 0, // filled in by updateTaxPanel below
  };

  drawChart(lastResult.years, lastBands, lower, upper);
  updateStatusReadouts(lastResult, lower, upper);
  updateTaxPanel(lastResult);
  checkHazard(lastResult);
}

function redrawChart() {
  if (!lastResult) return;
  const { lower, upper } = confidenceToPercentiles(state.confidence);
  drawChart(lastResult.years, lastBands, lower, upper);
}

// -------------------- CHART --------------------
const canvas = document.getElementById('hero-chart');
const ctx2d = canvas.getContext('2d');

function resizeCanvas() {
  const rect = canvas.parentElement.getBoundingClientRect();
  canvas.width = rect.width * devicePixelRatio;
  canvas.height = (rect.height - 40) * devicePixelRatio;
  canvas.style.width = rect.width + 'px';
  canvas.style.height = (rect.height - 40) + 'px';
  if (lastResult) drawChart(lastResult.years, lastBands, ...Object.values(confidenceToPercentiles(state.confidence)));
}
window.addEventListener('resize', resizeCanvas);

function drawChart(years, bands, lowerP, upperP) {
  const w = canvas.width, h = canvas.height;
  ctx2d.clearRect(0, 0, w, h);

  const allVals = [].concat(bands[5] || [], bands[95] || []);
  const overlayVals = comparisonOverlays.reduce((acc, o) => acc.concat(o.medianPath), []);
  const maxVal = Math.max(...allVals, ...overlayVals, 1);
  const padding = { top: 20 * devicePixelRatio, bottom: 30 * devicePixelRatio, left: 70 * devicePixelRatio, right: 20 * devicePixelRatio };
  const chartW = w - padding.left - padding.right;
  const chartH = h - padding.top - padding.bottom;

  const x = (i) => padding.left + (i / (years.length - 1)) * chartW;
  const y = (v) => padding.top + chartH - (v / maxVal) * chartH;

  // gridlines
  ctx2d.strokeStyle = 'rgba(77,255,158,0.08)';
  ctx2d.lineWidth = 1;
  for (let g = 0; g <= 4; g++) {
    const gy = padding.top + (chartH / 4) * g;
    ctx2d.beginPath();
    ctx2d.moveTo(padding.left, gy);
    ctx2d.lineTo(w - padding.right, gy);
    ctx2d.stroke();
    const val = maxVal * (1 - g / 4);
    ctx2d.fillStyle = 'rgba(111,143,128,0.8)';
    ctx2d.font = `${11 * devicePixelRatio}px Consolas, monospace`;
    ctx2d.fillText('$' + formatCompact(val), 4, gy + 4 * devicePixelRatio);
  }

  function pathFor(percentileArr) {
    ctx2d.beginPath();
    percentileArr.forEach((v, i) => {
      const px = x(i), py = y(v);
      if (i === 0) ctx2d.moveTo(px, py); else ctx2d.lineTo(px, py);
    });
  }
  function fillBetween(lowerArr, upperArr, color) {
    ctx2d.beginPath();
    lowerArr.forEach((v, i) => {
      const px = x(i), py = y(v);
      if (i === 0) ctx2d.moveTo(px, py); else ctx2d.lineTo(px, py);
    });
    for (let i = upperArr.length - 1; i >= 0; i--) {
      ctx2d.lineTo(x(i), y(upperArr[i]));
    }
    ctx2d.closePath();
    ctx2d.fillStyle = color;
    ctx2d.fill();
  }

  // outer tail band (confidence-driven)
  if (bands[lowerP] && bands[upperP]) {
    fillBetween(bands[lowerP], bands[upperP], 'rgba(77,255,158,0.08)');
  }
  // core 25-75 band, always shown as the "likely" range
  if (bands[25] && bands[75]) {
    fillBetween(bands[25], bands[75], 'rgba(77,255,158,0.28)');
  }

  // median line
  ctx2d.strokeStyle = '#26e07f';
  ctx2d.lineWidth = 2.5 * devicePixelRatio;
  ctx2d.shadowColor = '#26e07f';
  ctx2d.shadowBlur = 8;
  pathFor(bands[50]);
  ctx2d.stroke();
  ctx2d.shadowBlur = 0;

  // comparison overlays — saved scenarios' median lines, dashed + labeled
  comparisonOverlays.forEach((o) => {
    const n = o.medianPath.length;
    if (n < 2) return;
    ctx2d.strokeStyle = o.color;
    ctx2d.lineWidth = 1.6 * devicePixelRatio;
    ctx2d.setLineDash([5 * devicePixelRatio, 3 * devicePixelRatio]);
    ctx2d.beginPath();
    o.medianPath.forEach((v, i) => {
      const px = padding.left + (i / (n - 1)) * chartW;
      const py = y(v);
      if (i === 0) ctx2d.moveTo(px, py); else ctx2d.lineTo(px, py);
    });
    ctx2d.stroke();
    ctx2d.setLineDash([]);
    // label near the line's end
    ctx2d.fillStyle = o.color;
    ctx2d.font = `${10 * devicePixelRatio}px Consolas, monospace`;
    const endY = y(o.medianPath[n - 1]);
    const label = o.name.length > 12 ? o.name.slice(0, 12) : o.name;
    const textW = label.length * 6.2 * devicePixelRatio;
    ctx2d.fillText(label, padding.left + chartW - textW, endY - 5 * devicePixelRatio);
  });

  // retirement age marker
  const retireIdx = state.retireAge - state.currentAge;
  if (retireIdx >= 0 && retireIdx < years.length) {
    ctx2d.strokeStyle = 'rgba(255,176,0,0.5)';
    ctx2d.setLineDash([4 * devicePixelRatio, 4 * devicePixelRatio]);
    ctx2d.beginPath();
    ctx2d.moveTo(x(retireIdx), padding.top);
    ctx2d.lineTo(x(retireIdx), h - padding.bottom);
    ctx2d.stroke();
    ctx2d.setLineDash([]);
    ctx2d.fillStyle = 'rgba(255,176,0,0.8)';
    ctx2d.font = `${10 * devicePixelRatio}px Consolas, monospace`;
    ctx2d.fillText('RETIRE', x(retireIdx) + 4, padding.top + 12 * devicePixelRatio);
  }
}

function formatCompact(v) {
  if (v >= 1e6) return (v / 1e6).toFixed(1) + 'M';
  if (v >= 1e3) return (v / 1e3).toFixed(0) + 'K';
  return v.toFixed(0);
}

// -------------------- STATUS READOUTS --------------------
function updateStatusReadouts(result, lowerP, upperP) {
  const successProb = successProbability(result.paths);
  const solvencyEl = document.querySelector('#readout-solvency .readout-value');
  const trajectoryEl = document.querySelector('#readout-trajectory .readout-value');
  const confEl = document.querySelector('#readout-confidence .readout-value');

  if (successProb >= 0.85) {
    solvencyEl.textContent = 'STABLE';
    solvencyEl.classList.remove('warn');
  } else if (successProb >= 0.6) {
    solvencyEl.textContent = 'MARGINAL';
    solvencyEl.classList.remove('warn');
  } else {
    solvencyEl.textContent = 'CRITICAL';
    solvencyEl.classList.add('warn');
  }

  const finalMedian = lastBands[50][lastBands[50].length - 1];
  const peakMedian = Math.max(...lastBands[50]);
  if (finalMedian >= peakMedian * 0.9) {
    trajectoryEl.textContent = 'NOMINAL';
    trajectoryEl.classList.remove('warn');
  } else if (finalMedian > 0) {
    trajectoryEl.textContent = 'DECAYING';
    trajectoryEl.classList.remove('warn');
  } else {
    trajectoryEl.textContent = 'RUIN';
    trajectoryEl.classList.add('warn');
  }

  confEl.textContent = `${state.confidence}% (P${lowerP}-P${upperP})`;
}

// -------------------- TAX PANEL --------------------
function updateTaxPanel(result) {
  const currentRate = combinedMarginalRate(state.annualIncome, result.years[0]);
  document.getElementById('tax-current-rate').textContent = (currentRate * 100).toFixed(1) + '%';

  // Deterministic (mean-return) projection of ACTUAL ordinary taxable income:
  // pre-retirement wages, post-retirement the real traditional-withdrawal
  // income the account-type model produces (no longer a spend proxy).
  const incomePath = projectTaxableIncome(scenarioParams(result.years[0]));

  const creepEvents = detectBracketCreep(incomePath);
  document.getElementById('tax-creep-count').textContent = creepEvents.length;
  if (lastSummary) lastSummary.creepCount = creepEvents.length;

  // IRMAA cliffs (Medicare Part B surcharge), driven by the same projected
  // MAGI, inflation-indexed with the model's inflation assumption.
  const irmaaEvents = detectIrmaaCliffs(incomePath, {
    currentAge: state.currentAge,
    startYear: result.years[0],
    inflation: state.inflation,
  });
  document.getElementById('tax-irmaa-count').textContent = irmaaEvents.length;
  const peakSurcharge = irmaaEvents.reduce((m, e) => Math.max(m, e.surchargeAnnual || 0), 0);
  document.getElementById('tax-irmaa-peak').textContent =
    peakSurcharge > 0 ? `$${Math.round(peakSurcharge).toLocaleString()}/YR` : '—';
  if (lastSummary) lastSummary.irmaaCliffs = irmaaEvents.length;

  // Merge bracket + IRMAA events into one chronological log.
  const merged = [
    ...creepEvents.map((e) => ({ kind: 'bracket', ...e })),
    ...irmaaEvents.map((e) => ({ kind: 'irmaa', ...e })),
  ].sort((a, b) => a.year - b.year);

  const log = document.getElementById('creep-log');
  log.innerHTML = '';
  merged.slice(0, 16).forEach((ev) => {
    const div = document.createElement('div');
    if (ev.kind === 'bracket') {
      div.className = ev.direction;
      div.textContent = `${ev.year} — bracket ${ev.direction === 'up' ? '↑' : '↓'} ${(ev.fromRate*100).toFixed(0)}% → ${(ev.toRate*100).toFixed(0)}%`;
    } else {
      div.className = 'irmaa ' + ev.direction;
      div.textContent = `${ev.year} — IRMAA ${ev.direction === 'up' ? '▲' : '▼'} tier ${ev.toTier} (+$${Math.round(ev.surchargeAnnual).toLocaleString()}/yr)`;
    }
    log.appendChild(div);
  });
}

// -------------------- SCENARIO ARCHIVE UI --------------------
function saveScenario() {
  if (!lastSummary) return;
  const nameInput = document.getElementById('scenario-name');
  let name = (nameInput.value || '').trim();
  if (!name) name = 'SCENARIO ' + (getScenarios().length + 1);
  name = name.toUpperCase().slice(0, 24);

  const scenario = {
    id: newScenarioId(),
    name,
    createdAt: Date.now(),
    inputs: {
      currentAge: state.currentAge,
      retireAge: state.retireAge,
      endAge: state.endAge,
      startingBalance: state.startingBalance,
      annualIncome: state.annualIncome,
      savingsRate: state.savingsRate,
      retirementSpend: state.retirementSpend,
      expectedReturn: state.expectedReturn,
      returnStdDev: state.returnStdDev,
      inflation: state.inflation,
      allocTrad: state.allocTrad,
      allocRoth: state.allocRoth,
      allocTaxable: state.allocTaxable,
      confidence: state.confidence,
      numSims: state.numSims,
    },
    summary: { ...lastSummary },
  };

  const arr = getScenarios();
  arr.push(scenario);
  setScenarios(arr);
  nameInput.value = '';
  renderScenarioList();
}

function deleteScenario(id) {
  setScenarios(getScenarios().filter((s) => s.id !== id));
  comparisonOverlays = comparisonOverlays.filter((o) => o.id !== id);
  renderScenarioList();
  redrawChart();
}

function toggleOverlay(id) {
  const existing = comparisonOverlays.findIndex((o) => o.id === id);
  if (existing >= 0) {
    comparisonOverlays.splice(existing, 1);
  } else {
    if (comparisonOverlays.length >= OVERLAY_COLORS.length) return; // cap reached
    const s = getScenarios().find((x) => x.id === id);
    if (!s) return;
    const used = comparisonOverlays.map((o) => o.color);
    const color = OVERLAY_COLORS.find((c) => !used.includes(c)) || OVERLAY_COLORS[0];
    comparisonOverlays.push({
      id: s.id,
      name: s.name,
      years: s.summary.years,
      medianPath: s.summary.medianPath,
      color,
    });
  }
  renderScenarioList();
  redrawChart();
}

function loadScenario(id) {
  const s = getScenarios().find((x) => x.id === id);
  if (!s) return;
  const inp = s.inputs;
  // restore fields with no dedicated slider directly
  state.currentAge = inp.currentAge;
  state.endAge = inp.endAge;
  state.annualIncome = inp.annualIncome;
  state.inflation = inp.inflation;
  state.numSims = inp.numSims;
  // restore slider-backed fields (dispatch 'input' to refresh state + labels).
  // Older scenarios predate the account model — fall back to current defaults.
  setSliderValue('slider-retireAge', inp.retireAge);
  setSliderValue('slider-savingsRate', inp.savingsRate * 100);
  setSliderValue('slider-retirementSpend', inp.retirementSpend);
  setSliderValue('slider-expectedReturn', (inp.expectedReturn * 100).toFixed(1));
  setSliderValue('slider-returnStdDev', (inp.returnStdDev * 100).toFixed(1));
  setSliderValue('slider-startBalance', inp.startingBalance ?? state.startingBalance);
  setSliderValue('slider-allocTrad', inp.allocTrad ?? state.allocTrad);
  setSliderValue('slider-allocRoth', inp.allocRoth ?? state.allocRoth);
  setSliderValue('slider-allocTaxable', inp.allocTaxable ?? state.allocTaxable);
  setSliderValue('slider-confidence', inp.confidence);
  recompute(false);
}

function setSliderValue(id, value) {
  const el = document.getElementById(id);
  if (!el) return;
  el.value = value;
  el.dispatchEvent(new Event('input'));
}

function renderScenarioList() {
  const scenarios = getScenarios();
  const list = document.getElementById('scenario-list');
  const countEl = document.getElementById('scenario-count');
  const hintEl = document.getElementById('scenario-hint');
  if (countEl) countEl.textContent = scenarios.length ? `${scenarios.length} STORED` : '';
  if (hintEl) hintEl.style.display = scenarios.length ? 'none' : '';

  list.innerHTML = '';
  scenarios.forEach((s) => {
    const overlay = comparisonOverlays.find((o) => o.id === s.id);
    const row = document.createElement('div');
    row.className = 'scenario-row' + (overlay ? ' overlaid' : '');
    if (overlay) row.style.setProperty('--ovl-color', overlay.color);

    const prob = Math.round((s.summary.successProbability || 0) * 100);
    const solvClass = prob < 60 ? ' stat-crit' : '';

    const head = document.createElement('div');
    head.className = 'scenario-row-head';
    const nameLbl = document.createElement('span');
    nameLbl.className = 'scenario-name-lbl';
    nameLbl.textContent = s.name;
    nameLbl.title = s.name;

    const actions = document.createElement('span');
    actions.className = 'scenario-actions';

    const ovlBtn = document.createElement('button');
    ovlBtn.className = 'ovl-toggle' + (overlay ? ' active' : '');
    ovlBtn.textContent = '▤';
    ovlBtn.title = overlay ? 'Hide overlay' : 'Overlay on chart';
    if (overlay) ovlBtn.style.setProperty('--ovl-color', overlay.color);
    ovlBtn.addEventListener('click', () => toggleOverlay(s.id));

    const loadBtn = document.createElement('button');
    loadBtn.className = 'load-btn';
    loadBtn.textContent = 'LOAD';
    loadBtn.title = 'Load into sliders';
    loadBtn.addEventListener('click', () => loadScenario(s.id));

    const delBtn = document.createElement('button');
    delBtn.className = 'del-btn';
    delBtn.textContent = '×';
    delBtn.title = 'Delete scenario';
    delBtn.addEventListener('click', () => deleteScenario(s.id));

    actions.append(ovlBtn, loadBtn, delBtn);
    head.append(nameLbl, actions);

    const stats = document.createElement('div');
    stats.className = 'scenario-stats';
    stats.innerHTML =
      `<span class="stat-solv${solvClass}">SOLV <b>${prob}%</b></span>` +
      `<span>END <b>$${formatCompact(s.summary.finalMedian || 0)}</b></span>` +
      `<span>CREEP <b>${s.summary.creepCount ?? '—'}</b></span>`;

    row.append(head, stats);
    list.appendChild(row);
  });
}

// -------------------- HAZARD MODAL --------------------
function checkHazard(result) {
  const successProb = successProbability(result.paths);
  if (successProb < 0.5 && !hazardShownForThisRun) {
    document.getElementById('hazard-modal').classList.remove('hidden');
    hazardShownForThisRun = true;
  } else if (successProb >= 0.5) {
    hazardShownForThisRun = false;
  }
}

// -------------------- INIT --------------------
window.addEventListener('load', () => {
  resizeCanvas();
  initBoot();
});
