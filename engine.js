// ============================================================
// ENGINE F — CORE SIMULATION ENGINE
// Tax logic + Monte Carlo. No UI concerns in this file.
// ============================================================

// --- Tax bracket data (single filer, versioned by year) -----
// NOTE: single-filer figures, versioned by year. Update yearly; keep prior
// years in place so past scenarios can be re-derived.
// getYearData picks the newest entry at or below the requested year.
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
  2026: {
    standardDeduction: 16100,
    brackets: [
      { rate: 0.10, upTo: 12400 },
      { rate: 0.12, upTo: 50400 },
      { rate: 0.22, upTo: 105700 },
      { rate: 0.24, upTo: 201775 },
      { rate: 0.32, upTo: 256225 },
      { rate: 0.35, upTo: 640600 },
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
  2026: {
    standardDeduction: 12750,
    flatRate: 0.0409,
  },
};

function getYearData(table, year) {
  const years = Object.keys(table).map(Number).sort((a, b) => a - b);
  const match = years.filter((y) => y <= year).pop();
  return table[match ?? years[0]];
}

// Progressive federal tax on taxable income (after standard deduction)
function computeFederalTax(grossIncome, year = 2026) {
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
function marginalFederalRate(grossIncome, year = 2026) {
  const data = getYearData(FEDERAL_BRACKETS, year);
  const taxable = Math.max(0, grossIncome - data.standardDeduction);
  for (const b of data.brackets) {
    if (taxable <= b.upTo) return b.rate;
  }
  return data.brackets[data.brackets.length - 1].rate;
}

function computeNCTax(grossIncome, year = 2026) {
  const data = getYearData(NC_TAX, year);
  const taxable = Math.max(0, grossIncome - data.standardDeduction);
  return taxable * data.flatRate;
}

function marginalNCRate(_grossIncome, year = 2026) {
  return getYearData(NC_TAX, year).flatRate; // flat, so constant
}

function combinedMarginalRate(grossIncome, year = 2026) {
  return marginalFederalRate(grossIncome, year) + marginalNCRate(grossIncome, year);
}

function totalTax(grossIncome, year = 2026) {
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
// ACCOUNT-TYPE WITHDRAWAL MODEL
// ============================================================
// Retirement withdrawals are sequenced across three account types and
// taxed by type, so the portfolio feels the real drag of taxes and the
// bracket monitor sees actual ordinary taxable income (not a proxy):
//
//   - taxable brokerage : drawn FIRST. Gains are not tracked to a cost
//     basis in this model, so these withdrawals add NO ordinary income
//     (a long-term cap-gains schedule is out of scope for now — README).
//   - traditional (tax-deferred) : drawn NEXT. 100% ordinary taxable
//     income; withdrawals are grossed up so the AFTER-TAX proceeds meet
//     the spend target.
//   - roth (tax-free) : drawn LAST, preserving tax-free growth longest.
//
// retirementSpend is treated as an after-tax spending target.

// Normalize raw allocation weights into fractions that sum to 1.
// Extreme/degenerate inputs are allowed (no clamping philosophy); an
// all-zero mix falls back to 100% traditional so nothing divides by zero.
function normalizeAllocation(a) {
  const t = Math.max(0, (a && a.traditional) || 0);
  const r = Math.max(0, (a && a.roth) || 0);
  const x = Math.max(0, (a && a.taxable) || 0);
  const sum = t + r + x;
  if (sum <= 0) return { traditional: 1, roth: 0, taxable: 0 };
  return { traditional: t / sum, roth: r / sum, taxable: x / sum };
}

// Gross up a traditional (fully taxable) withdrawal so the after-tax
// proceeds equal netNeed: solve f(G) = G - tax(G) - netNeed = 0.
// Newton-Raphson with f'(G) = 1 - marginalRate(G) converges in a few
// steps; a fixed-point fallback (G = netNeed + tax(G), a contraction
// since rates < 1) guards the piecewise kinks at bracket boundaries.
// Assumes traditional is the only ordinary income for the year.
function grossUpTraditional(netNeed, year) {
  if (netNeed <= 0) return 0;
  let g = netNeed;
  for (let k = 0; k < 40; k++) {
    const f = g - totalTax(g, year) - netNeed;
    if (Math.abs(f) < 1e-7) break;
    const slope = 1 - combinedMarginalRate(g, year); // df/dG
    const next = slope > 1e-9 ? g - f / slope : netNeed + totalTax(g, year);
    g = next > 0 ? next : netNeed + totalTax(g, year);
  }
  return g;
}

// Draw `netSpend` after-tax dollars from the buckets in tax-aware order.
// Pure: returns new bucket balances plus the ordinary income / tax it
// generated and any shortfall (unfunded spend => the plan has broken).
function withdrawForSpend(buckets, netSpend, year) {
  let taxable = buckets.taxable;
  let traditional = buckets.traditional;
  let roth = buckets.roth;
  let remaining = netSpend;
  let ordinaryIncome = 0;

  // 1) taxable brokerage — no ordinary income in this model
  const fromTaxable = Math.min(taxable, remaining);
  taxable -= fromTaxable;
  remaining -= fromTaxable;

  // 2) traditional — grossed up so after-tax proceeds cover the need
  if (remaining > 0 && traditional > 0) {
    const grossNeeded = grossUpTraditional(remaining, year);
    if (grossNeeded <= traditional) {
      traditional -= grossNeeded;
      ordinaryIncome += grossNeeded;
      remaining = 0;
    } else {
      // bucket can't cover the full gross-up: drain it entirely
      ordinaryIncome += traditional;
      const netFromTrad = traditional - totalTax(traditional, year);
      remaining -= Math.max(0, netFromTrad);
      traditional = 0;
    }
  }

  // 3) roth — tax-free
  if (remaining > 0 && roth > 0) {
    const fromRoth = Math.min(roth, remaining);
    roth -= fromRoth;
    remaining -= fromRoth;
  }

  return {
    buckets: { taxable, traditional, roth },
    ordinaryIncome,
    tax: totalTax(ordinaryIncome, year),
    shortfall: remaining, // > 0 => spend could not be funded this year
  };
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
 *   allocation: { traditional, roth, taxable },  // raw weights, normalized
 *   numSims, startYear
 * }
 * Returns: { years: number[], paths: number[][] }  paths[sim][yearIndex]
 *
 * Balances are held in three account buckets; contributions split by the
 * allocation, retirement withdrawals sequenced + taxed by bucket type.
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
    allocation = { traditional: 1, roth: 0, taxable: 0 },
    numSims = 2000,
    startYear = new Date().getFullYear(),
  } = params;

  const alloc = normalizeAllocation(allocation);
  const totalYears = Math.max(1, endAge - currentAge);
  const years = Array.from({ length: totalYears + 1 }, (_, i) => startYear + i);
  const paths = [];

  for (let s = 0; s < numSims; s++) {
    let traditional = startingBalance * alloc.traditional;
    let roth = startingBalance * alloc.roth;
    let taxable = startingBalance * alloc.taxable;
    const path = [startingBalance];
    let income = annualIncome;

    for (let i = 1; i <= totalYears; i++) {
      const age = currentAge + i;
      const isRetired = age >= retireAge;
      const yearReturn = randomNormal(expectedReturn, returnStdDev);

      // every bucket earns the same market return this year
      traditional *= (1 + yearReturn);
      roth *= (1 + yearReturn);
      taxable *= (1 + yearReturn);

      if (!isRetired) {
        const contribution = income * savingsRate;
        traditional += contribution * alloc.traditional;
        roth += contribution * alloc.roth;
        taxable += contribution * alloc.taxable;
        income = income * (1 + inflation * 0.6); // wage growth assumption, damped
      } else {
        const spend = retirementSpend * Math.pow(1 + inflation, i);
        const res = withdrawForSpend({ taxable, traditional, roth }, spend, years[i]);
        traditional = res.buckets.traditional;
        roth = res.buckets.roth;
        taxable = res.buckets.taxable;
      }

      traditional = Math.max(0, traditional);
      roth = Math.max(0, roth);
      taxable = Math.max(0, taxable);
      path.push(traditional + roth + taxable); // total net worth
    }
    paths.push(path);
  }

  return { years, paths };
}

/**
 * Deterministic (expected-return, no volatility) projection of ordinary
 * taxable income per year. Pre-retirement it's the growing wage; in
 * retirement it's the ACTUAL ordinary income the account-type withdrawal
 * model produces (traditional withdrawals), so the bracket monitor and
 * IRMAA logic see real taxable income rather than the spend proxy.
 * Returns: [{ year, income, retired }]
 */
function projectTaxableIncome(params) {
  const {
    startingBalance,
    currentAge,
    retireAge,
    endAge,
    annualIncome,
    savingsRate,
    retirementSpend,
    expectedReturn,
    inflation,
    allocation = { traditional: 1, roth: 0, taxable: 0 },
    startYear = new Date().getFullYear(),
  } = params;

  const alloc = normalizeAllocation(allocation);
  const totalYears = Math.max(1, endAge - currentAge);
  let traditional = startingBalance * alloc.traditional;
  let roth = startingBalance * alloc.roth;
  let taxable = startingBalance * alloc.taxable;
  let wage = annualIncome;

  const path = [];
  const retiredNow = currentAge >= retireAge;
  path.push({ year: startYear, income: retiredNow ? 0 : wage, retired: retiredNow });

  for (let i = 1; i <= totalYears; i++) {
    const age = currentAge + i;
    const isRetired = age >= retireAge;

    traditional *= (1 + expectedReturn);
    roth *= (1 + expectedReturn);
    taxable *= (1 + expectedReturn);

    let ordinaryIncome;
    if (!isRetired) {
      const contribution = wage * savingsRate;
      traditional += contribution * alloc.traditional;
      roth += contribution * alloc.roth;
      taxable += contribution * alloc.taxable;
      ordinaryIncome = wage;
      wage = wage * (1 + inflation * 0.6);
    } else {
      const spend = retirementSpend * Math.pow(1 + inflation, i);
      const res = withdrawForSpend({ taxable, traditional, roth }, spend, startYear + i);
      traditional = Math.max(0, res.buckets.traditional);
      roth = Math.max(0, res.buckets.roth);
      taxable = Math.max(0, res.buckets.taxable);
      ordinaryIncome = res.ordinaryIncome;
    }
    path.push({ year: startYear + i, income: ordinaryIncome, retired: isRetired });
  }
  return path;
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

// Probability of "success" (never hitting zero before endAge).
// The sim clamps balance at zero, so a path that touches zero at any point
// after the start has depleted ("ruin"). Checking for a single zero — rather
// than two consecutive zeros — also catches depletion in the final year.
function successProbability(paths) {
  const ruinCount = paths.filter((p) =>
    p.some((v, i) => i > 0 && v <= 0)
  ).length;
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
    normalizeAllocation,
    grossUpTraditional,
    withdrawForSpend,
    runMonteCarlo,
    projectTaxableIncome,
    computePercentileBands,
    confidenceToPercentiles,
    successProbability,
  };
}
