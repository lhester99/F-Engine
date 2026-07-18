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
  savingsRate: 0.20,
  retirementSpend: 65000,
  expectedReturn: 0.07,
  returnStdDev: 0.12,
  inflation: 0.025,
  confidence: 90,
  numSims: 600,
};

let lastResult = null;
let lastBands = null;
let hazardShownForThisRun = false;

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
  recompute(true);
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
  bindSlider('slider-confidence', 'val-confidence', (v) => {
    state.confidence = +v;
    return `${v}%`;
  });

  // set defaults into the inputs
  document.getElementById('slider-retireAge').value = state.retireAge;
  document.getElementById('slider-savingsRate').value = state.savingsRate * 100;
  document.getElementById('slider-retirementSpend').value = state.retirementSpend;
  document.getElementById('slider-expectedReturn').value = (state.expectedReturn * 100).toFixed(1);
  document.getElementById('slider-returnStdDev').value = (state.returnStdDev * 100).toFixed(1);
  document.getElementById('slider-confidence').value = state.confidence;

  // trigger initial label paint
  ['retireAge','savingsRate','retirementSpend','expectedReturn','returnStdDev','confidence']
    .forEach((id) => {
      const el = document.getElementById('slider-' + id);
      el.dispatchEvent(new Event('input'));
    });

  document.getElementById('hazard-ack').addEventListener('click', () => {
    document.getElementById('hazard-modal').classList.add('hidden');
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

// -------------------- SIMULATION + RENDER --------------------
function recompute() {
  const startYear = new Date().getFullYear();
  lastResult = runMonteCarlo({
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
    numSims: state.numSims,
    startYear,
  });

  const { lower, upper } = confidenceToPercentiles(state.confidence);
  const percentilesNeeded = Array.from(new Set([5, 25, 50, 75, 95, lower, upper])).sort((a,b)=>a-b);
  lastBands = computePercentileBands(lastResult.paths, percentilesNeeded);

  drawChart(lastResult.years, lastBands, lower, upper);
  updateStatusReadouts(lastResult, lower, upper);
  updateTaxPanel(lastResult);
  checkHazard(lastResult);
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
  const maxVal = Math.max(...allVals, 1);
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

  // Build a deterministic income path (no randomness) purely for bracket-creep display:
  // pre-retirement income grows with damped inflation; post-retirement "income" ~ withdrawal.
  const incomePath = [];
  let income = state.annualIncome;
  for (let i = 0; i < result.years.length; i++) {
    const age = state.currentAge + i;
    const isRetired = age >= state.retireAge;
    const yearIncome = isRetired
      ? state.retirementSpend * Math.pow(1 + state.inflation, i) // proxy for taxable withdrawal
      : income;
    incomePath.push({ year: result.years[i], income: yearIncome });
    if (!isRetired) income *= (1 + state.inflation * 0.6);
  }

  const creepEvents = detectBracketCreep(incomePath);
  document.getElementById('tax-creep-count').textContent = creepEvents.length;

  const log = document.getElementById('creep-log');
  log.innerHTML = '';
  creepEvents.slice(0, 12).forEach((ev) => {
    const div = document.createElement('div');
    div.className = ev.direction;
    div.textContent = `${ev.year} — bracket ${ev.direction === 'up' ? '↑' : '↓'} ${(ev.fromRate*100).toFixed(0)}% → ${(ev.toRate*100).toFixed(0)}%`;
    log.appendChild(div);
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
