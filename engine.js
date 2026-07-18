// ============================================================
// ENGINE F — CORE SIMULATION ENGINE
// Tax logic + Monte Carlo. No UI concerns in this file.
// ============================================================

// --- Tax bracket data (single filer, versioned by year) -----
// NOTE: these are placeholder 2025-ish figures. Update yearly.
// Structure lets the tax engine stay agnostic to the actual numbers.
const FEDERAL_BRACKETS = {
  2025: {
    standardDeduction: 15000,
    brackets: [
      { rate: 0.10, upTo: 11925 },
      { rate: 0.12, upTo: 48475 },
      { rate: 0.22, upTo: 103350 },
      { rate: 0.24, upTo: 197300 },
      { rate: 0.32, upTo: 250525 },
      { rate: 0.35, upTo: 626350 },
      { rate: 0.37, upTo: Infinity },
    ],
  },
};

// NC has moved toward a flat rate structure in recent years.
const NC_TAX = {
  2025: {
    standardDeduction: 12750,
    flatRate: 0.0425,
  },
};

function getYearData(table, year) {
  const years = Object.keys(table).map(Number).sort((a, b) => a - b);
  const match = years.filter((y) => y <= year).pop();
  return table[match ?? years[0]];
}

// Progressive federal tax on taxable income (after standard deduction)
function computeFederalTax(grossIncome, year = 2025) {
  const data = getYearData(FEDERAL_BRACKETS, year);
  const taxable = Math.max(0, grossIncome - data.standardDeduction);
  let tax = 0;
  let lastCap = 0;
  for (const b of data.brackets) {
    if (taxable > lastCap) {
      const chunk = Math.min(taxable, b.upTo) - lastCap;
      tax += chunk * b.rate;
      lastCap = b.upTo;
    } else break;
  }
  return tax;
}

// Marginal federal rate at a given income level
function marginalFederalRate(grossIncome, year = 2025) {
  const data = getYearData(FEDERAL_BRACKETS, year);
  const taxable = Math.max(0, grossIncome - data.standardDeduction);
  for (const b of data.brackets) {
    if (taxable <= b.upTo) return b.rate;
  }
  return data.brackets[data.brackets.length - 1].rate;
}

function computeNCTax(grossIncome, year = 2025) {
  const data = getYearData(NC_TAX, year);
  const taxable = Math.max(0, grossIncome - data.standardDeduction);
  return taxable * data.flatRate;
}

function marginalNCRate(_grossIncome, year = 2025) {
  return getYearData(NC_TAX, year).flatRate; // flat, so constant
}

function combinedMarginalRate(grossIncome, year = 2025) {
  return marginalFederalRate(grossIncome, year) + marginalNCRate(grossIncome, year);
}

function totalTax(grossIncome, year = 2025) {
  return computeFederalTax(grossIncome, year) + computeNCTax(grossIncome, year);
}

// --- Bracket-creep detection across a projected income path ---
// Given an array of {year, income}, find the years where the marginal
// federal bracket changes from the previous year (a "creep" event).
function detectBracketCreep(incomePath) {
  const events = [];
  let prevRate = null;
  for (const point of incomePath) {
    const rate = marginalFederalRate(point.income, point.year);
    if (prevRate !== null && rate !== prevRate) {
      events.push({
        year: point.year,
        fromRate: prevRate,
        toRate: rate,
        income: point.income,
        direction: rate > prevRate ? 'up' : 'down',
      });
    }
    prevRate = rate;
  }
  return events;
}

// ============================================================
// MONTE CARLO ENGINE
// ============================================================

// Box-Muller transform for a normal random draw
function randomNormal(mean, stdDev) {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  const z = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
  return mean + z * stdDev;
}

/**
 * Simulate net worth paths given scenario params.
 * params: {
 *   startingBalance, currentAge, retireAge, endAge,
 *   annualIncome, savingsRate, retirementSpend,
 *   expectedReturn, returnStdDev, inflation,
 *   numSims, startYear
 * }
 * Returns: { years: number[], paths: number[][] }  paths[sim][yearIndex]
 */
function runMonteCarlo(params) {
  const {
    startingBalance,
    currentAge,
    retireAge,
    endAge,
    annualIncome,
    savingsRate,
    retirementSpend,
    expectedReturn,
    returnStdDev,
    inflation,
    numSims = 2000,
    startYear = new Date().getFullYear(),
  } = params;

  const totalYears = Math.max(1, endAge - currentAge);
  const years = Array.from({ length: totalYears + 1 }, (_, i) => startYear + i);
  const paths = [];
  const incomePaths = []; // for tax bracket creep, use the median-ish deterministic path separately

  for (let s = 0; s < numSims; s++) {
    let balance = startingBalance;
    const path = [balance];
    let income = annualIncome;

    for (let i = 1; i <= totalYears; i++) {
      const age = currentAge + i;
      const isRetired = age >= retireAge;
      const yearReturn = randomNormal(expectedReturn, returnStdDev);

      if (!isRetired) {
        const contribution = income * savingsRate;
        balance = balance * (1 + yearReturn) + contribution;
        income = income * (1 + inflation * 0.6); // wage growth assumption, damped
      } else {
        const spend = retirementSpend * Math.pow(1 + inflation, i);
        balance = balance * (1 + yearReturn) - spend;
      }
      balance = Math.max(0, balance); // can't go negative — plan "breaks"
      path.push(balance);
    }
    paths.push(path);
  }

  return { years, paths };
}

// Compute percentile bands from simulated paths at each year index.
// percentiles: array like [5, 25, 50, 75, 95]
function computePercentileBands(paths, percentiles) {
  const numYears = paths[0].length;
  const bands = {};
  percentiles.forEach((p) => (bands[p] = []));

  for (let yearIdx = 0; yearIdx < numYears; yearIdx++) {
    const valuesAtYear = paths.map((p) => p[yearIdx]).sort((a, b) => a - b);
    percentiles.forEach((p) => {
      const idx = Math.min(
        valuesAtYear.length - 1,
        Math.max(0, Math.round((p / 100) * (valuesAtYear.length - 1)))
      );
      bands[p].push(valuesAtYear[idx]);
    });
  }
  return bands;
}

// Given a target confidence level (e.g. 90 => show 5th/95th as tails),
// return the actual percentile pair to render as the outer band.
function confidenceToPercentiles(confidence) {
  const tail = (100 - confidence) / 2;
  return { lower: tail, upper: 100 - tail };
}

// Probability of "success" (never hitting zero before endAge)
function successProbability(paths) {
  const successes = paths.filter((p) => p[p.length - 1] > 0 && !p.some((v, i) => i > 0 && v === 0 && p[i-1] > 0 === false)).length;
  // Simpler + correct definition: success = balance never permanently pinned at 0 mid-path in a way that indicates ruin
  const ruinCount = paths.filter((p) => {
    for (let i = 1; i < p.length; i++) {
      if (p[i] === 0 && p[i - 1] === 0) return true; // stayed at zero = ran out
    }
    return false;
  }).length;
  return 1 - ruinCount / paths.length;
}

if (typeof module !== 'undefined') {
  module.exports = {
    computeFederalTax,
    marginalFederalRate,
    computeNCTax,
    marginalNCRate,
    combinedMarginalRate,
    totalTax,
    detectBracketCreep,
    runMonteCarlo,
    computePercentileBands,
    confidenceToPercentiles,
    successProbability,
  };
}
