// ============================================================
// ENGINE F — CORE SIMULATION ENGINE
// Tax logic + Monte Carlo. No UI concerns in this file.
// ============================================================

// --- Tax bracket data, versioned by year, per filing status -----
// Single-filer figures are authoritative (update yearly; keep prior years so
// past scenarios re-derive). Married-filing-jointly is derived as 2x single:
// exact for the standard deduction and every bracket EXCEPT the top (37%)
// threshold, which is slightly lower than 2x in reality — a documented
// approximation. getYearData picks the newest entry at or below the year.
const FEDERAL_SINGLE = {
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

// Double single thresholds to approximate the married-filing-jointly schedule.
function doubleBrackets(s) {
  return {
    standardDeduction: s.standardDeduction * 2,
    brackets: s.brackets.map((b) => ({
      rate: b.rate,
      upTo: b.upTo === Infinity ? Infinity : b.upTo * 2,
    })),
  };
}

const FEDERAL_BRACKETS = {};
Object.keys(FEDERAL_SINGLE).forEach((y) => {
  FEDERAL_BRACKETS[y] = { single: FEDERAL_SINGLE[y], mfj: doubleBrackets(FEDERAL_SINGLE[y]) };
});

// NC flat tax. MFJ standard deduction is 2x single; the flat rate is the same.
const NC_SINGLE = {
  2025: { standardDeduction: 12750, flatRate: 0.0425 },
  2026: { standardDeduction: 12750, flatRate: 0.0409 },
};
const NC_TAX = {};
Object.keys(NC_SINGLE).forEach((y) => {
  NC_TAX[y] = {
    single: NC_SINGLE[y],
    mfj: { standardDeduction: NC_SINGLE[y].standardDeduction * 2, flatRate: NC_SINGLE[y].flatRate },
  };
});

// --- Contribution limits (single filer), versioned. Guidance only — the
// engine never clamps to these; the UI flags amounts that exceed them.
// 2025 are the real figures; 2026 are best-estimate (indexed), update when
// the IRS publishes. Traditional + Roth 401k share elective401k; Traditional
// + Roth IRA share ira. catchup* apply at/after catchupAge.
const CONTRIB_LIMITS = {
  2025: { elective401k: 23500, catchup401k: 7500, ira: 7000, catchupIra: 1000, catchupAge: 50 },
  2026: { elective401k: 24500, catchup401k: 8000, ira: 7500, catchupIra: 1100, catchupAge: 50 },
};

function contributionLimits(year, age) {
  const d = getYearData(CONTRIB_LIMITS, year);
  const over = age >= d.catchupAge;
  return {
    elective401k: d.elective401k + (over ? d.catchup401k : 0),
    ira: d.ira + (over ? d.catchupIra : 0),
  };
}

function getYearData(table, year) {
  const years = Object.keys(table).map(Number).sort((a, b) => a - b);
  const match = years.filter((y) => y <= year).pop();
  return table[match ?? years[0]];
}

// Progressive federal tax on taxable income (after standard deduction)
function computeFederalTax(grossIncome, year = 2026, filingStatus = 'single') {
  const data = getYearData(FEDERAL_BRACKETS, year)[filingStatus];
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
function marginalFederalRate(grossIncome, year = 2026, filingStatus = 'single', inflation = 0) {
  let y = year;
  if (inflation > 0) {
    const base = matchedTableYear(FEDERAL_BRACKETS, year);
    grossIncome = grossIncome / Math.pow(1 + inflation, year - base);
    y = base;
  }
  const data = getYearData(FEDERAL_BRACKETS, y)[filingStatus];
  const taxable = Math.max(0, grossIncome - data.standardDeduction);
  for (const b of data.brackets) {
    if (taxable <= b.upTo) return b.rate;
  }
  return data.brackets[data.brackets.length - 1].rate;
}

function computeNCTax(grossIncome, year = 2026, filingStatus = 'single') {
  const data = getYearData(NC_TAX, year)[filingStatus];
  const taxable = Math.max(0, grossIncome - data.standardDeduction);
  return taxable * data.flatRate;
}

function marginalNCRate(_grossIncome, year = 2026, filingStatus = 'single') {
  return getYearData(NC_TAX, year)[filingStatus].flatRate; // flat, so constant
}

function combinedMarginalRate(grossIncome, year = 2026, filingStatus = 'single', inflation = 0) {
  return marginalFederalRate(grossIncome, year, filingStatus, inflation) + marginalNCRate(grossIncome, year, filingStatus);
}

// Total federal + NC tax. When `inflation` is given, brackets and the standard
// deduction are CPI-indexed forward from the base table year (2026): tax scales
// linearly with a uniform scaling of income + thresholds, so
//   tax_indexed(income, year) = defl · tax_base(income / defl)
// exactly indexes the schedule without a separate future table. This removes
// phantom bracket creep from purely nominal growth (as IRMAA already does).
function totalTax(grossIncome, year = 2026, filingStatus = 'single', inflation = 0) {
  if (inflation > 0) {
    const base = matchedTableYear(FEDERAL_BRACKETS, year);
    const defl = Math.pow(1 + inflation, year - base);
    return defl * (computeFederalTax(grossIncome / defl, base, filingStatus) + computeNCTax(grossIncome / defl, base, filingStatus));
  }
  return computeFederalTax(grossIncome, year, filingStatus) + computeNCTax(grossIncome, year, filingStatus);
}

// Gross income at the TOP of the bracket with the given marginal rate,
// inflation-indexed to `year` (standard deduction + bracket ceiling). Used by
// "fill-to-bracket" Roth conversions. Returns Infinity for the top bracket.
function bracketCeilingGross(rate, year = 2026, filingStatus = 'single', inflation = 0) {
  const base = matchedTableYear(FEDERAL_BRACKETS, year);
  const data = FEDERAL_BRACKETS[base][filingStatus];
  const b = data.brackets.find((x) => Math.abs(x.rate - rate) < 1e-9);
  if (!b || b.upTo === Infinity) return Infinity;
  const defl = inflation > 0 ? Math.pow(1 + inflation, year - base) : 1;
  return (data.standardDeduction + b.upTo) * defl;
}

// Roth conversion amount for the year (Traditional -> Roth). 'fixed' converts a
// set amount (today's dollars, inflated); 'bracket' converts up to the top of
// the target bracket given the year's other ordinary income (so it naturally
// converts nothing while wages are high and fills low brackets in early
// retirement). Capped at the available Traditional balance.
function rothConversionFor(rc, inWindow, traditional, otherOrdinary, priceInfl, year, fs, inflation) {
  if (!inWindow || traditional <= 0 || rc.mode === 'off') return 0;
  let c;
  if (rc.mode === 'fixed') {
    c = rc.amount * priceInfl;
  } else { // 'bracket'
    const ceiling = bracketCeilingGross(rc.bracket, year, fs, inflation);
    c = ceiling === Infinity ? 0 : Math.max(0, ceiling - otherOrdinary);
  }
  return Math.min(c, traditional);
}

// --- Bracket-creep detection across a projected income path ---
// Given an array of {year, income}, find the years where the marginal
// federal bracket changes from the previous year (a "creep" event).
function detectBracketCreep(incomePath, filingStatus = 'single', inflation = 0) {
  const events = [];
  let prevRate = null;
  for (const point of incomePath) {
    const rate = marginalFederalRate(point.income, point.year, filingStatus, inflation);
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
// IRMAA — Medicare Part B income-related monthly adjustment
// ============================================================
// A "cliff" surcharge: cross a MAGI threshold by $1 and the whole Part B
// premium jumps to the next tier. Applies at age 65+ and is based on MAGI
// from `lookbackYears` prior — so a high FINAL WORKING YEAR can trigger
// IRMAA in the first Medicare years.
//
// Single-filer, versioned like the tax tables. 2025 tiers are the real
// figures. Thresholds (and the surcharge shown) are inflation-indexed
// forward to each premium year with the model's inflation assumption —
// real IRMAA brackets are CPI-indexed, so without this a 30-year
// retirement of nominally-growing withdrawals would trip phantom cliffs.
// Add a dated entry when new official figures publish.
const IRMAA_PARTB = {
  2025: {
    lookbackYears: 2,
    eligibleAge: 65,
    standardMonthly: 185.0,
    // upTo = MAGI ceiling for the tier; surchargeMonthly = amount ABOVE
    // the standard premium.
    tiers: [
      { upTo: 106000, surchargeMonthly: 0 },
      { upTo: 133000, surchargeMonthly: 74.0 },
      { upTo: 167000, surchargeMonthly: 185.0 },
      { upTo: 200000, surchargeMonthly: 295.9 },
      { upTo: 500000, surchargeMonthly: 406.9 },
      { upTo: Infinity, surchargeMonthly: 443.9 },
    ],
  },
};

// Newest table year at or below `year` (companion to getYearData, but
// returns the matched key so callers can index inflation from it).
function matchedTableYear(table, year) {
  const years = Object.keys(table).map(Number).sort((a, b) => a - b);
  return years.filter((y) => y <= year).pop() ?? years[0];
}

// Tier index for a MAGI against a set of (already inflation-adjusted) tiers.
function irmaaTierIndex(magi, tiers) {
  for (let i = 0; i < tiers.length; i++) {
    if (magi <= tiers[i].upTo) return i;
  }
  return tiers.length - 1;
}

// Detect IRMAA tier crossings across a projected income path.
// incomePath: [{ year, income }]  (income ~ MAGI in this model)
// opts: { currentAge, startYear, inflation }
// Returns [{ year, magiYear, magi, fromTier, toTier, direction,
//            surchargeAnnual, standardMonthly }].
function detectIrmaaCliffs(incomePath, opts) {
  const { currentAge, startYear, inflation = 0, filingStatus = 'single' } = opts || {};
  const key = matchedTableYear(IRMAA_PARTB, startYear);
  const data = IRMAA_PARTB[key];
  const statusMult = filingStatus === 'mfj' ? 2 : 1; // MFJ tiers are exactly 2x
  const magiByYear = {};
  incomePath.forEach((p) => { magiByYear[p.year] = p.income; });

  const events = [];
  let prevTier = 0; // implicit standard-premium baseline before Medicare
  let started = false;
  for (const p of incomePath) {
    const age = currentAge + (p.year - startYear);
    if (age < data.eligibleAge) continue;

    const factor = Math.pow(1 + inflation, p.year - key);
    const tiers = data.tiers.map((t) => ({
      upTo: t.upTo === Infinity ? Infinity : t.upTo * factor * statusMult,
    }));
    const magiYear = p.year - data.lookbackYears;
    const magi = magiByYear[magiYear] != null ? magiByYear[magiYear] : p.income;
    const tier = irmaaTierIndex(magi, tiers);
    const surchargeAnnual = data.tiers[tier].surchargeMonthly * 12 * factor;

    if (started && tier !== prevTier) {
      events.push({
        year: p.year, magiYear, magi,
        fromTier: prevTier, toTier: tier,
        direction: tier > prevTier ? 'up' : 'down',
        surchargeAnnual, standardMonthly: data.standardMonthly * factor,
      });
    } else if (!started && tier > 0) {
      // enters Medicare already in an IRMAA tier — that's a cliff too
      events.push({
        year: p.year, magiYear, magi,
        fromTier: 0, toTier: tier, direction: 'up',
        surchargeAnnual, standardMonthly: data.standardMonthly * factor,
      });
    }
    prevTier = tier;
    started = true;
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

// Gross up a traditional (fully taxable) withdrawal so its AFTER-TAX proceeds
// equal netNeed, given the year already has `base` ordinary income (from
// Social Security's taxable portion and RMDs). Solve
//   f(G) = G - (tax(base+G) - tax(base)) - netNeed = 0
// by Newton-Raphson (slope 1 - marginalRate(base+G)); a fixed-point fallback
// guards the piecewise kinks at bracket boundaries.
function grossUpTraditional(netNeed, year, base = 0, fs = 'single', inflation = 0) {
  if (netNeed <= 0) return 0;
  const taxBase = totalTax(base, year, fs, inflation);
  let g = netNeed;
  for (let k = 0; k < 40; k++) {
    const f = g - (totalTax(base + g, year, fs, inflation) - taxBase) - netNeed;
    if (Math.abs(f) < 1e-7) break;
    const slope = 1 - combinedMarginalRate(base + g, year, fs, inflation); // df/dG
    const fp = netNeed + (totalTax(base + g, year, fs, inflation) - taxBase);
    const next = slope > 1e-9 ? g - f / slope : fp;
    g = next > 0 ? next : fp;
  }
  return g;
}

// Draw `netSpend` after-tax dollars from the buckets in tax-aware order
// (taxable -> traditional -> roth), with the traditional gross-up sitting on
// top of `baseOrdinary` (SS taxable portion + RMD already recognized).
// Returns new balances, the ADDITIONAL ordinary income the withdrawals
// created, and any shortfall (unfunded spend => the plan has broken).
function withdrawForSpend(buckets, netSpend, year, baseOrdinary = 0, fs = 'single', inflation = 0) {
  let taxable = buckets.taxable;
  let traditional = buckets.traditional;
  let roth = buckets.roth;
  let remaining = netSpend;
  let ordinaryAdded = 0;

  // 1) taxable brokerage — no ordinary income in this model
  const fromTaxable = Math.min(taxable, remaining);
  taxable -= fromTaxable;
  remaining -= fromTaxable;

  // 2) traditional — grossed up (on top of baseOrdinary) to cover the need
  if (remaining > 0 && traditional > 0) {
    const grossNeeded = grossUpTraditional(remaining, year, baseOrdinary, fs, inflation);
    if (grossNeeded <= traditional) {
      traditional -= grossNeeded;
      ordinaryAdded += grossNeeded;
      remaining = 0;
    } else {
      // bucket can't cover the full gross-up: drain it entirely
      const incrementalTax = totalTax(baseOrdinary + traditional, year, fs, inflation) - totalTax(baseOrdinary, year, fs, inflation);
      remaining -= Math.max(0, traditional - incrementalTax);
      ordinaryAdded += traditional;
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
    ordinaryIncomeAdded: ordinaryAdded,
    shortfall: remaining, // > 0 => spend could not be funded this year
  };
}

// --- RMDs (Required Minimum Distributions) --------------------------------
// SECURE 2.0: first RMD at age 73 (born 1951-1959) or 75 (born 1960+). The
// year's RMD = Traditional balance / the IRS Uniform Lifetime factor.
function rmdStartAge(birthYear) {
  return birthYear >= 1960 ? 75 : 73;
}
// IRS Uniform Lifetime Table (2022+), age -> distribution period.
const RMD_FACTORS = {
  73: 26.5, 74: 25.5, 75: 24.6, 76: 23.7, 77: 22.9, 78: 22.0, 79: 21.1,
  80: 20.2, 81: 19.4, 82: 18.5, 83: 17.7, 84: 16.8, 85: 16.0, 86: 15.2,
  87: 14.4, 88: 13.7, 89: 12.9, 90: 12.2, 91: 11.5, 92: 10.8, 93: 10.1,
  94: 9.5, 95: 8.9, 96: 8.4, 97: 7.8, 98: 7.3, 99: 6.8, 100: 6.4,
  101: 6.0, 102: 5.6, 103: 5.2, 104: 4.9, 105: 4.6, 106: 4.3, 107: 4.1,
  108: 3.9, 109: 3.7, 110: 3.5, 111: 3.4, 112: 3.3, 113: 3.1, 114: 3.0,
  115: 2.9, 116: 2.8, 117: 2.7, 118: 2.5, 119: 2.3, 120: 2.0,
};
function rmdFactor(age) {
  if (age < 73) return Infinity;      // no RMD -> zero forced withdrawal
  if (age > 120) return RMD_FACTORS[120];
  return RMD_FACTORS[age] || RMD_FACTORS[120];
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

// Wage/contribution growth as a multiple of inflation. 1.0 = wages track CPI
// (a neutral default); < 1 models wages lagging inflation.
const WAGE_GROWTH_DAMP = 1.0;

// Canonicalize plan inputs (fill defaults, normalize allocation). Income is
// household gross; contributions are per-account annual dollars.
function normalizePlan(params) {
  const p = params || {};
  const contributions = Object.assign(
    { trad401k: 0, roth401k: 0, tradIRA: 0, rothIRA: 0, taxable: 0 },
    p.contributions || {}
  );
  const employerMatch = Object.assign({ rate: 0, capPct: 0 }, p.employerMatch || {});
  const socialSecurity = Object.assign(
    { benefit: 0, claimAge: 67, spouseBenefit: 0, spouseClaimAge: 67 },
    p.socialSecurity || {}
  );
  const rothConversion = Object.assign(
    { mode: 'off', amount: 0, bracket: 0.12, startAge: 60, endAge: 72 },
    p.rothConversion || {}
  );
  const startYear = p.startYear || new Date().getFullYear();
  const currentAge = p.currentAge != null ? p.currentAge : 30;
  const filingStatus = p.filingStatus === 'mfj' ? 'mfj' : 'single';
  return {
    startingBalance: p.startingBalance || 0,
    currentAge,
    retireAge: p.retireAge != null ? p.retireAge : 65,
    endAge: p.endAge != null ? p.endAge : 92,
    filingStatus,
    spouseAge: p.spouseAge != null ? p.spouseAge : currentAge,
    householdIncome: p.householdIncome != null ? p.householdIncome : (p.annualIncome || 0),
    spouseIncome: filingStatus === 'mfj' ? (p.spouseIncome || 0) : 0,
    annualExpenses: p.annualExpenses || 0,
    retirementSpend: p.retirementSpend || 0,
    contributions,
    employerMatch,
    socialSecurity,
    rothConversion,
    expectedReturn: p.expectedReturn || 0,
    returnStdDev: p.returnStdDev || 0,
    inflation: p.inflation || 0,
    alloc: normalizeAllocation(p.allocation || { traditional: 1, roth: 0, taxable: 0 }),
    events: Array.isArray(p.events) ? p.events : [],
    rmdStartAge: rmdStartAge(startYear - currentAge),
    numSims: p.numSims || 2000,
    startYear,
  };
}

// Cash flow from timeline events at a given age:
//   expense : one-time outflow at startAge (entered in today's $, inflated).
//   income  : one-time inflow at startAge (windfall/inheritance; treated as
//             after-tax cash, NOT ordinary income — a documented simplification).
//   debt    : recurring FIXED-nominal payment from startAge until endAge
//             (e.g. a mortgage), which then drops off.
function eventsFlow(events, age, priceInfl) {
  let outflow = 0;
  let inflow = 0;
  for (const ev of events) {
    if (ev.type === 'debt') {
      if (age >= ev.startAge && age < ev.endAge) outflow += ev.amount; // fixed nominal
    } else if (ev.type === 'income') {
      if (age === ev.startAge) inflow += ev.amount * priceInfl;
    } else { // expense
      if (age === ev.startAge) outflow += ev.amount * priceInfl;
    }
  }
  return { outflow, inflow };
}

// Nominal Social Security cash for year-index i: benefits are entered in
// today's dollars and grow with the inflation (COLA) assumption; each person's
// benefit turns on once they reach their claiming age. Only the primary earner
// counts unless filing MFJ.
function ssIncomeForYear(p, i) {
  const cola = Math.pow(1 + p.inflation, i);
  let ss = 0;
  if (p.currentAge + i >= p.socialSecurity.claimAge) ss += p.socialSecurity.benefit * cola;
  if (p.filingStatus === 'mfj' && p.spouseAge + i >= p.socialSecurity.spouseClaimAge) {
    ss += p.socialSecurity.spouseBenefit * cola;
  }
  return ss;
}

// Employer match (year-0 dollars): matchRate of employee 401k contributions,
// capped at capPct of salary. Employer match is always pre-tax (traditional).
function employerMatchBase(p) {
  const emp401k = (p.contributions.trad401k || 0) + (p.contributions.roth401k || 0);
  const cap = (p.employerMatch.capPct / 100) * p.householdIncome;
  return (p.employerMatch.rate / 100) * Math.min(emp401k, cap);
}

// Fraction of Social Security benefits counted as ordinary taxable income.
// Real rule uses provisional-income thresholds (0/50/85%); we use a flat 85%
// (the common high-income case) for both federal and NC — a documented
// simplification (NC actually exempts SS).
const SS_TAXABLE_FRACTION = 0.85;

/**
 * Advance the household one year. Grows each bucket by the market return,
 * then applies the year's cash flow:
 *   working  -> (household + spouse) income − pre-tax contributions = ordinary
 *               taxable income; tax computed; surplus (income − tax − expenses
 *               − all contributions) flows to the taxable brokerage.
 *   retired  -> Social Security cash (85% taxable) + any RMD (forced from
 *               Traditional, taxable) cover the inflation-grown spend first;
 *               the remainder is withdrawn taxable -> traditional -> roth, with
 *               the traditional gross-up on top of the SS+RMD ordinary base.
 *               An RMD beyond the spend need is reinvested in taxable.
 * Traditional 401k/IRA contributions reduce taxable income now; Roth do not.
 */
function stepYear(buckets, i, yearReturn, p, matchBase) {
  const year = p.startYear + i;
  const age = p.currentAge + i;
  const fs = p.filingStatus;
  const isRetired = age >= p.retireAge;
  const g = Math.pow(1 + p.inflation * WAGE_GROWTH_DAMP, i); // wage/contrib growth
  const priceInfl = Math.pow(1 + p.inflation, i);            // price growth

  let traditional = buckets.traditional * (1 + yearReturn);
  let roth = buckets.roth * (1 + yearReturn);
  let taxable = buckets.taxable * (1 + yearReturn);
  let ordinaryIncome = 0;
  let tax = 0;
  // "Free cash" = discretionary money to enjoy that year. Working years: what's
  // left after taxes, living expenses, ALL contributions, and debt (currently
  // routed to the brokerage — the disposable capacity). Retirement: the
  // after-tax lifestyle spend the plan funds.
  let freeCash = 0;

  const ef = eventsFlow(p.events, age, priceInfl); // goals & debt this year
  const rc = p.rothConversion;
  const inConvWindow = rc.mode !== 'off' && age >= rc.startAge && age <= rc.endAge;

  if (!isRetired) {
    const c = p.contributions;
    const income = (p.householdIncome + p.spouseIncome) * g;
    const expenses = p.annualExpenses * priceInfl;
    const preTax = (c.trad401k + c.tradIRA) * g;   // reduces taxable income
    const rothC = (c.roth401k + c.rothIRA) * g;    // after-tax
    const taxableC = c.taxable * g;                // after-tax
    const match = matchBase * g;

    ordinaryIncome = Math.max(0, income - preTax);
    // Roth conversion: move Traditional -> Roth, adding to ordinary income
    // (its tax comes out of this year's cash flow, i.e. free cash).
    const conversion = rothConversionFor(rc, inConvWindow, traditional, ordinaryIncome, priceInfl, year, fs, p.inflation);
    if (conversion > 0) { traditional -= conversion; roth += conversion; ordinaryIncome += conversion; }

    tax = totalTax(ordinaryIncome, year, fs, p.inflation);
    const surplus = income - tax - expenses - preTax - rothC - taxableC;
    freeCash = surplus - ef.outflow + ef.inflow;

    traditional += preTax + match;
    roth += rothC;
    // surplus + windfalls − goal/debt outflows flow to the brokerage
    taxable += taxableC + freeCash;
  } else {
    const retLifestyle = p.retirementSpend * priceInfl; // funded enjoyment budget
    const spend = retLifestyle + ef.outflow - ef.inflow;
    freeCash = retLifestyle;
    const ss = ssIncomeForYear(p, i);

    // RMD: forced Traditional withdrawal once past the RMD age.
    let rmd = 0;
    if (age >= p.rmdStartAge && traditional > 0) {
      rmd = Math.min(traditional, traditional / rmdFactor(age));
      traditional -= rmd;
    }

    // Roth conversion on top of SS + RMD (its tax is funded by extra
    // tax-efficient withdrawals below; moves Traditional -> Roth).
    const conversion = rothConversionFor(rc, inConvWindow, traditional, SS_TAXABLE_FRACTION * ss + rmd, priceInfl, year, fs, p.inflation);
    if (conversion > 0) { traditional -= conversion; roth += conversion; }

    // Ordinary income already recognized: taxable SS portion + RMD + conversion.
    const baseOrdinary = SS_TAXABLE_FRACTION * ss + rmd + conversion;
    // Net cash SS + RMD provide after paying the tax they incur.
    const netFromBase = (ss + rmd) - totalTax(baseOrdinary, year, fs, p.inflation);
    let remaining = spend - netFromBase;

    if (remaining <= 0) {
      taxable += -remaining;      // RMD/SS exceed the spend -> reinvest surplus
      ordinaryIncome = baseOrdinary;
    } else {
      const res = withdrawForSpend({ taxable, traditional, roth }, remaining, year, baseOrdinary, fs, p.inflation);
      taxable = res.buckets.taxable;
      traditional = res.buckets.traditional;
      roth = res.buckets.roth;
      ordinaryIncome = baseOrdinary + res.ordinaryIncomeAdded;
    }
    tax = totalTax(ordinaryIncome, year, fs, p.inflation);
  }

  traditional = Math.max(0, traditional);
  roth = Math.max(0, roth);
  taxable = Math.max(0, taxable);
  return {
    traditional, roth, taxable,
    ordinaryIncome, tax, freeCash, retired: isRetired, age, year,
    netWorth: traditional + roth + taxable,
  };
}

/**
 * Monte Carlo net-worth paths. Uses the shared stepYear so the stochastic
 * sim and the deterministic projection stay in lockstep.
 * Returns: { years: number[], paths: number[][] }  paths[sim][yearIndex]
 */
function runMonteCarlo(params) {
  const p = normalizePlan(params);
  const matchBase = employerMatchBase(p);
  const totalYears = Math.max(1, p.endAge - p.currentAge);
  const years = Array.from({ length: totalYears + 1 }, (_, i) => p.startYear + i);
  const paths = [];

  for (let s = 0; s < p.numSims; s++) {
    let b = {
      traditional: p.startingBalance * p.alloc.traditional,
      roth: p.startingBalance * p.alloc.roth,
      taxable: p.startingBalance * p.alloc.taxable,
    };
    const path = [p.startingBalance];
    for (let i = 1; i <= totalYears; i++) {
      const r = randomNormal(p.expectedReturn, p.returnStdDev);
      const step = stepYear(b, i, r, p, matchBase);
      b = { traditional: step.traditional, roth: step.roth, taxable: step.taxable };
      path.push(step.netWorth);
    }
    paths.push(path);
  }
  return { years, paths };
}

/**
 * Deterministic (expected-return) projection — the "expected path". Returns a
 * rich per-year row so the chart-inspect snapshot and the tax panel can read
 * net worth, the account split, and ordinary income/tax at any age.
 * Returns: [{ year, age, retired, income, tax, netWorth, traditional, roth, taxable }]
 */
function projectPlan(params) {
  const p = normalizePlan(params);
  const matchBase = employerMatchBase(p);
  const totalYears = Math.max(1, p.endAge - p.currentAge);
  let b = {
    traditional: p.startingBalance * p.alloc.traditional,
    roth: p.startingBalance * p.alloc.roth,
    taxable: p.startingBalance * p.alloc.taxable,
  };
  const rows = [];
  const c = p.contributions;
  const retiredNow = p.currentAge >= p.retireAge;
  const preTax0 = c.trad401k + c.tradIRA;
  const allContribs0 = c.trad401k + c.roth401k + c.tradIRA + c.rothIRA + c.taxable;
  const grossNow = p.householdIncome + p.spouseIncome;
  const taxableNow = Math.max(0, grossNow - preTax0);
  const taxNow = retiredNow ? 0 : totalTax(taxableNow, p.startYear, p.filingStatus, p.inflation);
  rows.push({
    year: p.startYear, age: p.currentAge, retired: retiredNow,
    income: retiredNow ? 0 : taxableNow,
    tax: taxNow, netWorth: p.startingBalance,
    freeCash: retiredNow ? p.retirementSpend : (grossNow - taxNow - p.annualExpenses - allContribs0),
    traditional: b.traditional, roth: b.roth, taxable: b.taxable,
  });
  for (let i = 1; i <= totalYears; i++) {
    const s = stepYear(b, i, p.expectedReturn, p, matchBase);
    b = { traditional: s.traditional, roth: s.roth, taxable: s.taxable };
    rows.push({
      year: s.year, age: s.age, retired: s.retired, income: s.ordinaryIncome,
      tax: s.tax, netWorth: s.netWorth, freeCash: s.freeCash,
      traditional: b.traditional, roth: b.roth, taxable: b.taxable,
    });
  }
  return rows;
}

// Adapter kept for the bracket-creep / IRMAA detectors, which want {year, income}.
function projectTaxableIncome(params) {
  return projectPlan(params).map((r) => ({ year: r.year, income: r.income, retired: r.retired }));
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
    detectIrmaaCliffs,
    irmaaTierIndex,
    normalizeAllocation,
    grossUpTraditional,
    withdrawForSpend,
    contributionLimits,
    CONTRIB_LIMITS,
    rmdStartAge,
    rmdFactor,
    ssIncomeForYear,
    bracketCeilingGross,
    rothConversionFor,
    normalizePlan,
    employerMatchBase,
    stepYear,
    runMonteCarlo,
    projectPlan,
    projectTaxableIncome,
    computePercentileBands,
    confidenceToPercentiles,
    successProbability,
  };
}
