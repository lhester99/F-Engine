// ============================================================
// ENGINE F — APP LAYER
// Wires engine.js to the UI: boot sequence, sliders, chart, panels
// ============================================================

// -------------------- STATE --------------------
const state = {
  // PROFILE
  currentAge: 32,
  retireAge: 65,
  endAge: 92,
  filingStatus: 'single',      // 'single' | 'mfj'
  spouseAge: 32,
  // INCOME & EXPENSES
  householdIncome: 120000,
  spouseIncome: 60000,         // used only when filingStatus === 'mfj'
  monthlyExpenses: 5500,       // annualExpenses = *12
  retirementReplacement: 85,   // % of working expenses spent in retirement
  // CONTRIBUTIONS ($/yr)
  contribTrad401k: 12000,
  contribRoth401k: 6000,
  contribTradIRA: 0,
  contribRothIRA: 0,
  contribTaxable: 3000,
  matchRate: 50,               // % of employee 401k contributions matched
  matchCapPct: 6,              // up to this % of pay
  // MARKETS
  startingBalance: 250000,
  allocTrad: 55,               // raw weights, normalized by the engine
  allocRoth: 15,
  allocTaxable: 30,
  expectedReturn: 0.07,
  returnStdDev: 0.12,
  inflation: 0.025,
  // SOCIAL SECURITY (benefits in today's dollars)
  ssBenefit: 30000,
  ssClaimAge: 67,
  spouseSsBenefit: 20000,
  spouseSsClaimAge: 67,
  // GOALS & DEBT — timeline events: { id, type, amount, age, endAge }
  events: [],
  // DISPLAY
  confidence: 90,
  todaysDollars: false,
  numSims: 600,
};

let lastResult = null;
let lastBands = null;
let lastSummary = null;
let lastProjection = null;   // deterministic per-year rows (projectPlan)
let chartGeom = null;        // { padL, padT, chartW, chartH, n } for hit-testing
let hoverIndex = null;       // year index under the chart cursor
let hazardShownForThisRun = false;

// -------------------- SCENARIO ARCHIVE --------------------
// v3: income-driven cash-flow model changed the input schema and what a saved
// result means, so a new key avoids loading incompatible older snapshots.
const SCENARIO_STORE_KEY = 'enginef.scenarios.v3';
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
const dollarFmt = (v) => `$${(+v).toLocaleString()}`;

// Slider definitions: id -> { state field, label formatter, value<->slider map }
const SLIDERS = [
  ['currentAge', 'val-currentAge', (v) => { state.currentAge = +v; return `${v}`; }],
  ['retireAge', 'val-retireAge', (v) => { state.retireAge = +v; return `${v}`; }],
  ['endAge', 'val-endAge', (v) => { state.endAge = +v; return `${v}`; }],
  ['spouseAge', 'val-spouseAge', (v) => { state.spouseAge = +v; return `${v}`; }],
  ['householdIncome', 'val-householdIncome', (v) => { state.householdIncome = +v; return dollarFmt(v); }],
  ['spouseIncome', 'val-spouseIncome', (v) => { state.spouseIncome = +v; return dollarFmt(v); }],
  ['monthlyExpenses', 'val-monthlyExpenses', (v) => { state.monthlyExpenses = +v; return `${dollarFmt(v)} ($${(v*12/1000).toFixed(0)}K/yr)`; }],
  ['retirementReplacement', 'val-retirementReplacement', (v) => {
    state.retirementReplacement = +v;
    const annual = state.monthlyExpenses * 12 * (v / 100);
    return `${v}% · ${dollarFmt(Math.round(annual))}/yr`;
  }],
  ['contribTrad401k', 'val-contribTrad401k', (v) => { state.contribTrad401k = +v; onContribChange(); return dollarFmt(v); }],
  ['contribRoth401k', 'val-contribRoth401k', (v) => { state.contribRoth401k = +v; onContribChange(); return dollarFmt(v); }],
  ['contribTradIRA', 'val-contribTradIRA', (v) => { state.contribTradIRA = +v; onContribChange(); return dollarFmt(v); }],
  ['contribRothIRA', 'val-contribRothIRA', (v) => { state.contribRothIRA = +v; onContribChange(); return dollarFmt(v); }],
  ['contribTaxable', 'val-contribTaxable', (v) => { state.contribTaxable = +v; return dollarFmt(v); }],
  ['matchRate', 'val-matchRate', (v) => { state.matchRate = +v; return `${v}% MATCH`; }],
  ['matchCapPct', 'val-matchCapPct', (v) => { state.matchCapPct = +v; return `${(+v).toFixed(1)}%`; }],
  ['startBalance', 'val-startBalance', (v) => { state.startingBalance = +v; updateAllocationLabels(); return dollarFmt(v); }],
  ['expectedReturn', 'val-expectedReturn', (v) => { state.expectedReturn = v / 100; return `${(+v).toFixed(1)}%`; }],
  ['returnStdDev', 'val-returnStdDev', (v) => { state.returnStdDev = v / 100; return `${(+v).toFixed(1)}%`; }],
  ['inflation', 'val-inflation', (v) => { state.inflation = v / 100; return `${(+v).toFixed(1)}%`; }],
  ['ssBenefit', 'val-ssBenefit', (v) => { state.ssBenefit = +v; return dollarFmt(v); }],
  ['ssClaimAge', 'val-ssClaimAge', (v) => { state.ssClaimAge = +v; return `${v}`; }],
  ['spouseSsBenefit', 'val-spouseSsBenefit', (v) => { state.spouseSsBenefit = +v; return dollarFmt(v); }],
  ['spouseSsClaimAge', 'val-spouseSsClaimAge', (v) => { state.spouseSsClaimAge = +v; return `${v}`; }],
  ['confidence', 'val-confidence', (v) => { state.confidence = +v; return `${v}%`; }],
];

// Initial slider positions read back from state.
const SLIDER_INIT = {
  currentAge: () => state.currentAge,
  retireAge: () => state.retireAge,
  endAge: () => state.endAge,
  spouseAge: () => state.spouseAge,
  householdIncome: () => state.householdIncome,
  spouseIncome: () => state.spouseIncome,
  monthlyExpenses: () => state.monthlyExpenses,
  retirementReplacement: () => state.retirementReplacement,
  contribTrad401k: () => state.contribTrad401k,
  contribRoth401k: () => state.contribRoth401k,
  contribTradIRA: () => state.contribTradIRA,
  contribRothIRA: () => state.contribRothIRA,
  contribTaxable: () => state.contribTaxable,
  matchRate: () => state.matchRate,
  matchCapPct: () => state.matchCapPct,
  startBalance: () => state.startingBalance,
  expectedReturn: () => (state.expectedReturn * 100).toFixed(1),
  returnStdDev: () => (state.returnStdDev * 100).toFixed(1),
  inflation: () => (state.inflation * 100).toFixed(1),
  ssBenefit: () => state.ssBenefit,
  ssClaimAge: () => state.ssClaimAge,
  spouseSsBenefit: () => state.spouseSsBenefit,
  spouseSsClaimAge: () => state.spouseSsClaimAge,
  confidence: () => state.confidence,
};

// State fields persisted in a saved scenario.
const PERSISTED_KEYS = [
  'currentAge', 'retireAge', 'endAge', 'filingStatus', 'spouseAge',
  'householdIncome', 'spouseIncome', 'monthlyExpenses', 'retirementReplacement',
  'contribTrad401k', 'contribRoth401k', 'contribTradIRA', 'contribRothIRA', 'contribTaxable',
  'matchRate', 'matchCapPct',
  'startingBalance', 'allocTrad', 'allocRoth', 'allocTaxable',
  'expectedReturn', 'returnStdDev', 'inflation',
  'ssBenefit', 'ssClaimAge', 'spouseSsBenefit', 'spouseSsClaimAge',
  'events',
  'confidence', 'todaysDollars',
];

// Push current state into every control (values + labels). Used at boot and
// when loading a saved scenario.
function syncControlsFromState() {
  Object.keys(SLIDER_INIT).forEach((id) => {
    const el = document.getElementById('slider-' + id);
    if (el) { el.value = SLIDER_INIT[id](); el.dispatchEvent(new Event('input')); }
  });
  ['allocTrad', 'allocRoth', 'allocTaxable'].forEach((f) => {
    const el = document.getElementById('slider-' + f);
    el.value = state[f];
    el.dispatchEvent(new Event('input'));
  });
  updateAllocationLabels();
  updateContribGuidance();
  syncFilingUI();
  // ensure loaded events have ids, then render
  state.events.forEach((e) => { if (!e.id) e.id = 'ev' + (eventIdSeq++); });
  renderEvents();
  const btn = document.getElementById('toggle-dollars');
  btn.setAttribute('aria-pressed', state.todaysDollars ? 'true' : 'false');
  btn.textContent = state.todaysDollars ? "TODAY'S $" : 'NOMINAL $';
}

function initControls() {
  SLIDERS.forEach(([id, labelId, fn]) => bindSlider('slider-' + id, labelId, fn));

  // allocation sliders share one label updater (labels show normalized % + $)
  bindAllocSlider('slider-allocTrad', 'allocTrad');
  bindAllocSlider('slider-allocRoth', 'allocRoth');
  bindAllocSlider('slider-allocTaxable', 'allocTaxable');

  syncControlsFromState();

  document.getElementById('hazard-ack').addEventListener('click', () => {
    document.getElementById('hazard-modal').classList.add('hidden');
  });

  // today's-dollars toggle
  document.getElementById('toggle-dollars').addEventListener('click', toggleDollars);

  // filing-status segmented toggle
  document.querySelectorAll('#filing-toggle button').forEach((btn) => {
    btn.addEventListener('click', () => setFilingStatus(btn.dataset.fs));
  });

  // goals & debt
  document.getElementById('add-event').addEventListener('click', addEvent);

  // scenario archive controls
  document.getElementById('save-scenario').addEventListener('click', saveScenario);
  document.getElementById('scenario-name').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') saveScenario();
  });

  initChartInspect();
}

// Contributions changed: refresh the IRS-limit guidance (no recompute needed
// beyond the throttled one bindSlider already scheduled).
function onContribChange() {
  updateContribGuidance();
}

// -------------------- GOALS & DEBT EVENTS --------------------
let eventIdSeq = 1;
const EVENT_TYPES = [
  { value: 'expense', label: 'ONE-TIME SPEND' },
  { value: 'income', label: 'WINDFALL' },
  { value: 'debt', label: 'RECURRING DEBT / YR' },
];

function addEvent() {
  state.events.push({
    id: 'ev' + (eventIdSeq++),
    type: 'expense',
    amount: 50000,
    age: Math.min(state.retireAge, state.currentAge + 5),
    endAge: state.retireAge,
  });
  renderEvents();
  scheduleRecompute();
}

function deleteEvent(id) {
  state.events = state.events.filter((e) => e.id !== id);
  renderEvents();
  scheduleRecompute();
}

function updateEventField(id, field, value) {
  const ev = state.events.find((e) => e.id === id);
  if (!ev) return;
  ev[field] = field === 'type' ? value : +value;
  if (field === 'type') renderEvents(); // show/hide the "to age" field
  scheduleRecompute();
}

function scheduleRecompute() {
  clearTimeout(recomputeTimer);
  recomputeTimer = setTimeout(() => recompute(false), 40);
}

function renderEvents() {
  const list = document.getElementById('events-list');
  if (!list) return;
  list.innerHTML = '';
  state.events.forEach((ev) => {
    const row = document.createElement('div');
    row.className = 'event-row';

    const top = document.createElement('div');
    top.className = 'event-top';
    const sel = document.createElement('select');
    sel.className = 'ev-type';
    EVENT_TYPES.forEach((t) => {
      const opt = document.createElement('option');
      opt.value = t.value; opt.textContent = t.label;
      if (t.value === ev.type) opt.selected = true;
      sel.appendChild(opt);
    });
    sel.addEventListener('change', () => updateEventField(ev.id, 'type', sel.value));
    const del = document.createElement('button');
    del.className = 'ev-del'; del.textContent = '×'; del.title = 'Remove';
    del.addEventListener('click', () => deleteEvent(ev.id));
    top.append(sel, del);

    const fields = document.createElement('div');
    fields.className = 'event-fields';
    fields.appendChild(numField('$', ev.amount, 0, 5000000, 1000, (v) => updateEventField(ev.id, 'amount', v)));
    fields.appendChild(numField(ev.type === 'debt' ? 'FROM AGE' : 'AGE', ev.age, 0, 110, 1, (v) => updateEventField(ev.id, 'age', v), 'ev-age'));
    const toWrap = numField('TO AGE', ev.endAge, 0, 110, 1, (v) => updateEventField(ev.id, 'endAge', v), 'ev-age');
    toWrap.classList.add('ev-end-wrap');
    if (ev.type !== 'debt') toWrap.classList.add('hidden-field');
    fields.appendChild(toWrap);

    row.append(top, fields);
    list.appendChild(row);
  });
}

function numField(labelText, value, min, max, step, onChange, inputClass) {
  const label = document.createElement('label');
  label.textContent = labelText + ' ';
  const input = document.createElement('input');
  input.type = 'number';
  input.min = min; input.max = max; input.step = step;
  input.value = value;
  if (inputClass) input.className = inputClass;
  input.addEventListener('input', () => onChange(input.value));
  label.appendChild(input);
  return label;
}

// Filing status: single vs married-filing-jointly. Shows/hides spouse + spouse
// Social Security controls and re-runs the sim (MFJ changes brackets, IRMAA,
// and adds spouse income/SS).
function setFilingStatus(fs) {
  state.filingStatus = fs === 'mfj' ? 'mfj' : 'single';
  syncFilingUI();
  recompute(false);
}

function syncFilingUI() {
  const panel = document.getElementById('controls-panel');
  panel.classList.toggle('show-mfj', state.filingStatus === 'mfj');
  document.querySelectorAll('#filing-toggle button').forEach((b) => {
    b.classList.toggle('active', b.dataset.fs === state.filingStatus);
  });
}

function toggleDollars() {
  state.todaysDollars = !state.todaysDollars;
  const btn = document.getElementById('toggle-dollars');
  btn.setAttribute('aria-pressed', state.todaysDollars ? 'true' : 'false');
  btn.textContent = state.todaysDollars ? "TODAY'S $" : 'NOMINAL $';
  redrawChart();
  if (lastResult) updateStatusReadouts(lastResult, ...Object.values(confidenceToPercentiles(state.confidence)));
}

// Flag contributions that exceed the (age-aware) IRS limits — guidance only,
// never clamped.
function updateContribGuidance() {
  const el = document.getElementById('contrib-guidance');
  if (!el) return;
  const limits = contributionLimits(new Date().getFullYear(), state.currentAge);
  const k401 = state.contribTrad401k + state.contribRoth401k;
  const ira = state.contribTradIRA + state.contribRothIRA;
  const parts = [
    `401(K) ${dollarFmt(k401)} / ${dollarFmt(limits.elective401k)}` +
      (k401 > limits.elective401k ? ' <span class="over">OVER</span>' : ''),
    `IRA ${dollarFmt(ira)} / ${dollarFmt(limits.ira)}` +
      (ira > limits.ira ? ' <span class="over">OVER</span>' : ''),
  ];
  el.innerHTML = parts.join(' &nbsp;·&nbsp; ');
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
function annualExpenses() {
  return state.monthlyExpenses * 12;
}
function retirementSpend() {
  return annualExpenses() * (state.retirementReplacement / 100);
}

function scenarioParams(startYear) {
  return {
    startingBalance: state.startingBalance,
    currentAge: state.currentAge,
    retireAge: state.retireAge,
    endAge: state.endAge,
    filingStatus: state.filingStatus,
    spouseAge: state.spouseAge,
    householdIncome: state.householdIncome,
    spouseIncome: state.spouseIncome,
    annualExpenses: annualExpenses(),
    retirementSpend: retirementSpend(),
    contributions: {
      trad401k: state.contribTrad401k,
      roth401k: state.contribRoth401k,
      tradIRA: state.contribTradIRA,
      rothIRA: state.contribRothIRA,
      taxable: state.contribTaxable,
    },
    employerMatch: { rate: state.matchRate, capPct: state.matchCapPct },
    socialSecurity: {
      benefit: state.ssBenefit,
      claimAge: state.ssClaimAge,
      spouseBenefit: state.spouseSsBenefit,
      spouseClaimAge: state.spouseSsClaimAge,
    },
    events: state.events.map((e) => ({
      type: e.type, amount: e.amount, startAge: e.age, endAge: e.endAge,
    })),
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
  const params = scenarioParams(startYear);
  lastResult = runMonteCarlo(params);
  lastProjection = projectPlan(params); // deterministic "expected path" for inspect + tax

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
    combinedMarginalRate: combinedMarginalRate(lastProjection[0].income, lastResult.years[0], state.filingStatus),
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
  // Size the canvas to the panel's actual content box — minus padding, the
  // header, and the legend — so it never bleeds past the panel (which broke
  // the layout on narrow/mobile screens where every pixel counts).
  const panel = canvas.parentElement;
  const cs = getComputedStyle(panel);
  const rect = panel.getBoundingClientRect();
  const header = panel.querySelector('.panel-header');
  const legend = document.getElementById('chart-legend');
  const padX = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
  const padY = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
  const chromeH = (header ? header.offsetHeight : 0) + (legend ? legend.offsetHeight : 0);
  const cw = Math.max(80, rect.width - padX);
  const ch = Math.max(100, rect.height - padY - chromeH - 6);
  canvas.width = cw * devicePixelRatio;
  canvas.height = ch * devicePixelRatio;
  canvas.style.width = cw + 'px';
  canvas.style.height = ch + 'px';
  if (lastResult) drawChart(lastResult.years, lastBands, ...Object.values(confidenceToPercentiles(state.confidence)));
}
window.addEventListener('resize', resizeCanvas);
window.addEventListener('orientationchange', resizeCanvas);

// Convert a nominal dollar value at year-index i to the displayed value,
// deflating to today's purchasing power when the today's-dollars view is on.
function deflate(v, i) {
  return state.todaysDollars ? v / Math.pow(1 + state.inflation, i) : v;
}

function drawChart(years, bandsIn, lowerP, upperP) {
  const w = canvas.width, h = canvas.height;
  ctx2d.clearRect(0, 0, w, h);

  // deflated copies for display (nominal data is preserved in lastBands)
  const bands = {};
  Object.keys(bandsIn).forEach((k) => {
    bands[k] = (bandsIn[k] || []).map((v, i) => deflate(v, i));
  });
  const overlays = comparisonOverlays.map((o) => ({
    ...o,
    medianPath: o.medianPath.map((v, i) => deflate(v, i)),
  }));

  const allVals = [].concat(bands[5] || [], bands[95] || []);
  const overlayVals = overlays.reduce((acc, o) => acc.concat(o.medianPath), []);
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
  overlays.forEach((o) => {
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

  // remember geometry for pointer hit-testing (values in canvas px)
  chartGeom = { padL: padding.left, padT: padding.top, chartW, chartH, bottom: h - padding.bottom, n: years.length };

  // hover cursor + marker on the median
  if (hoverIndex != null && hoverIndex >= 0 && hoverIndex < years.length && bands[50]) {
    const hx = x(hoverIndex);
    ctx2d.strokeStyle = 'rgba(230,255,240,0.35)';
    ctx2d.lineWidth = 1 * devicePixelRatio;
    ctx2d.beginPath();
    ctx2d.moveTo(hx, padding.top);
    ctx2d.lineTo(hx, h - padding.bottom);
    ctx2d.stroke();
    const my = y(bands[50][hoverIndex]);
    ctx2d.fillStyle = '#e6fff0';
    ctx2d.beginPath();
    ctx2d.arc(hx, my, 3.5 * devicePixelRatio, 0, Math.PI * 2);
    ctx2d.fill();
  }
}

function formatCompact(v) {
  const neg = v < 0 ? '-' : '';
  const a = Math.abs(v);
  if (a >= 1e6) return neg + (a / 1e6).toFixed(1) + 'M';
  if (a >= 1e3) return neg + (a / 1e3).toFixed(0) + 'K';
  return neg + a.toFixed(0);
}

// -------------------- CHART INSPECT --------------------
function initChartInspect() {
  const tip = document.getElementById('chart-tooltip');
  function handle(clientX) {
    if (!chartGeom || !lastProjection) return;
    const rect = canvas.getBoundingClientRect();
    const xCanvas = (clientX - rect.left) * devicePixelRatio;
    const frac = (xCanvas - chartGeom.padL) / chartGeom.chartW;
    let idx = Math.round(frac * (chartGeom.n - 1));
    idx = Math.max(0, Math.min(chartGeom.n - 1, idx));
    hoverIndex = idx;
    redrawChart();
    showTooltip(idx, clientX);
  }
  const clear = () => { hoverIndex = null; tip.classList.add('hidden'); redrawChart(); };
  canvas.addEventListener('mousemove', (e) => handle(e.clientX));
  canvas.addEventListener('mouseleave', clear);
  canvas.addEventListener('touchstart', (e) => { if (e.touches[0]) handle(e.touches[0].clientX); }, { passive: true });
  canvas.addEventListener('touchmove', (e) => { if (e.touches[0]) handle(e.touches[0].clientX); }, { passive: true });
  canvas.addEventListener('touchend', clear);
}

function showTooltip(idx, clientX) {
  const tip = document.getElementById('chart-tooltip');
  const row = lastProjection[idx];
  if (!row || !lastBands[50]) return;
  // Net worth = the MC median the user sees (deflated). Split it by the
  // deterministic bucket ratios so the parts sum to the visible median line.
  const nw = deflate(lastBands[50][idx], idx);
  const detNW = row.netWorth || 1;
  const trad = nw * (row.traditional / detNW);
  const roth = nw * (row.roth / detNW);
  const tax = nw * (row.taxable / detNW);
  const pct = (part) => (nw > 0 ? Math.round((part / nw) * 100) : 0);
  const income = deflate(row.income, idx);
  const taxPaid = deflate(row.tax, idx);
  const unit = state.todaysDollars ? " (today's $)" : '';

  tip.innerHTML =
    `<div class="tt-age">AGE ${row.age} · ${row.year}${row.retired ? ' · RETIRED' : ''}</div>` +
    `<div class="tt-nw">$${formatCompact(nw)}${unit}</div>` +
    `<div class="tt-row"><span>TRADITIONAL</span><b>$${formatCompact(trad)} · ${pct(trad)}%</b></div>` +
    `<div class="tt-row"><span>ROTH</span><b>$${formatCompact(roth)} · ${pct(roth)}%</b></div>` +
    `<div class="tt-row"><span>TAXABLE</span><b>$${formatCompact(tax)} · ${pct(tax)}%</b></div>` +
    `<div class="tt-sep"></div>` +
    `<div class="tt-row"><span>${row.retired ? 'ORDINARY INCOME' : 'TAXABLE INCOME'}</span><b>$${formatCompact(income)}</b></div>` +
    `<div class="tt-row"><span>EST. TAX</span><b>$${formatCompact(taxPaid)}</b></div>`;
  tip.classList.remove('hidden');

  const panel = document.getElementById('chart-panel');
  const panelRect = panel.getBoundingClientRect();
  const tipW = tip.offsetWidth || 160;
  let left = clientX - panelRect.left + 14;
  if (left + tipW > panelRect.width - 6) left = clientX - panelRect.left - tipW - 14;
  tip.style.left = Math.max(6, left) + 'px';
  tip.style.top = '46px';
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
  // Current marginal rate on THIS year's taxable income (income minus pre-tax
  // contributions), from the deterministic projection's first row.
  const taxableNow = lastProjection ? lastProjection[0].income : state.householdIncome;
  const currentRate = combinedMarginalRate(taxableNow, result.years[0], state.filingStatus);
  document.getElementById('tax-current-rate').textContent = (currentRate * 100).toFixed(1) + '%';

  // Ordinary taxable income per year from the deterministic projection —
  // real wages minus pre-tax contributions, then real withdrawal income.
  const incomePath = lastProjection.map((r) => ({ year: r.year, income: r.income, retired: r.retired }));

  const creepEvents = detectBracketCreep(incomePath, state.filingStatus);
  document.getElementById('tax-creep-count').textContent = creepEvents.length;
  if (lastSummary) lastSummary.creepCount = creepEvents.length;

  // IRMAA cliffs (Medicare Part B surcharge), driven by the same projected
  // MAGI, inflation-indexed with the model's inflation assumption.
  const irmaaEvents = detectIrmaaCliffs(incomePath, {
    currentAge: state.currentAge,
    startYear: result.years[0],
    inflation: state.inflation,
    filingStatus: state.filingStatus,
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
    inputs: PERSISTED_KEYS.reduce((o, k) => { o[k] = state[k]; return o; }, {}),
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
  const inp = s.inputs || {};
  PERSISTED_KEYS.forEach((k) => { if (inp[k] != null) state[k] = inp[k]; });
  syncControlsFromState();
  recompute(false);
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
