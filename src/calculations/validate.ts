import { ACCOUNT_RULES } from '../data/accountRules';
import { UNIFORM_LIFETIME_TABLE_EFFECTIVE_YEAR } from '../data/uniformLifetimeTable';
import type { AnalysisSettings, EngineMessage, Scenario } from '../types';
import { ageAttainedInYear, parseIsoDate } from './dates';
import { effectiveAnnualReturn } from './returns';
import { getRmdStart } from './rmdRules';

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isWholeAge = (v: unknown): v is number => isNum(v) && Number.isInteger(v) && v >= 0 && v <= 120;

/**
 * Checks a scenario before projecting. Errors block the projection; warnings
 * are informational (the projection still runs and states what was ignored).
 */
export function validateScenario(s: Scenario): EngineMessage[] {
  const out: EngineMessage[] = [];
  const err = (code: string, text: string, field?: string, personId?: string) =>
    out.push({ severity: 'error', code, text, field, personId });
  const warn = (code: string, text: string, field?: string, personId?: string) =>
    out.push({ severity: 'warning', code, text, field, personId });

  if (!Number.isInteger(s.startYear) || s.startYear < UNIFORM_LIFETIME_TABLE_EFFECTIVE_YEAR) {
    err('start-year', `Projection start year must be ${UNIFORM_LIFETIME_TABLE_EFFECTIVE_YEAR} or later.`);
  }
  if (s.people.length === 0) err('no-people', 'At least one person is required.');

  const personIds = new Set(s.people.map((p) => p.id));
  for (const p of s.people) {
    const birth = parseIsoDate(p.dateOfBirth);
    if (!birth) {
      err('dob-invalid', 'Enter a valid date of birth.', 'dateOfBirth', p.id);
      continue;
    }
    const ageAtStart = ageAttainedInYear(birth, s.startYear);
    if (birth.year >= s.startYear) {
      err('dob-future', 'Date of birth must be before the projection start year.', 'dateOfBirth', p.id);
    } else if (ageAtStart > 120) {
      err('dob-too-old', 'Date of birth implies an age over 120.', 'dateOfBirth', p.id);
    }
    if (!isNum(p.socialSecurityBenefit) || p.socialSecurityBenefit < 0) {
      err('ss-benefit', 'Social Security must be zero or positive.', 'socialSecurityBenefit', p.id);
    }
    if (!isWholeAge(p.socialSecurityStartAge)) {
      err('ss-age', 'Social Security start age must be a whole number.', 'socialSecurityStartAge', p.id);
    }
    if (p.delayFirstRmd) {
      const start = getRmdStart(birth);
      if (start.firstRmdYear < s.startYear) {
        warn(
          'deferral-not-applicable',
          `The first RMD year (${start.firstRmdYear}) is before ${s.startYear}, so the April 1 deferral option does not apply and is ignored. A ${start.firstRmdYear} RMD deferred into ${s.startYear} is not modeled.`,
          'delayFirstRmd',
          p.id,
        );
      }
    }
  }

  if (s.people.length > 2) err('people', 'At most two people (spouses) are supported.');
  if (s.people.length === 2) {
    const [a, b] = s.people.map((p) => parseIsoDate(p.dateOfBirth));
    if (a && b && Math.abs(a.year - b.year) > 10) {
      warn(
        'joint-life-table',
        'One spouse is more than 10 years younger. If that spouse is the sole beneficiary, the IRS Joint and Last Survivor Table applies and gives smaller RMDs than shown. That table is not yet supported; the Uniform Lifetime Table is used.',
        'dateOfBirth',
      );
    }
    const sv = s.survivorship;
    if (sv.enabled) {
      const dying = s.people.find((p) => p.id === sv.firstDeathPersonId);
      const db = dying ? parseIsoDate(dying.dateOfBirth) : null;
      if (!dying) err('death-person', 'Choose which spouse dies first.', 'survivorship');
      else if (!isWholeAge(sv.deathAge)) err('death-age', 'Age at death must be a whole number.', 'deathAge');
      else if (db && db.year + sv.deathAge < s.startYear) {
        err('death-age', `Age at death must be at least ${s.startYear - db.year} (the projection starts in ${s.startYear}).`, 'deathAge');
      } else if (db) {
        const dy = db.year + sv.deathAge;
        const late = [
          ...s.strategy.conversions.filter((c) => c.personId === dying.id && c.year > dy),
          ...s.strategy.oneTimeQcds.filter((q) => q.personId === dying.id && q.year > dy),
        ];
        const lateRules = [...s.strategy.recurringQcds, ...s.strategy.bracketFills].filter((r) => r.personId === dying.id && db.year + r.endAge > dy);
        if (late.length || lateRules.length) {
          warn(
            'after-death-ignored',
            `${dying.label}'s conversions and QCDs after ${dy} are ignored; after the rollover, add them for the survivor instead.`,
            'survivorship',
          );
        }
      }
      for (const [v, field, label] of [
        [sv.otherIncomeAfter, 'otherIncomeAfter', 'Income that continues'],
        [sv.spendingAfter, 'spendingAfter', 'Spending that continues'],
      ] as const) {
        if (!isNum(v) || v < 0 || v > 2) err(field, `${label} must be between 0% and 200%.`, field);
      }
    }
  }

  const primary = s.people[0];
  const primaryBirth = primary ? parseIsoDate(primary.dateOfBirth) : null;
  if (!isWholeAge(s.endAge)) {
    err('end-age', 'Projection ending age must be a whole number from 0 to 120.', 'endAge');
  } else if (primaryBirth && s.endAge < ageAttainedInYear(primaryBirth, s.startYear)) {
    err('end-age', `Projection ending age must be at least the client's age in ${s.startYear}.`, 'endAge');
  }

  for (const a of s.accounts) {
    if (!personIds.has(a.ownerId)) err('account-owner', `${a.label}: owner not found.`, `account:${a.id}`);
    if (!ACCOUNT_RULES[a.type]?.supportedInCurrentPhase) {
      err('account-type', `${a.label}: ${ACCOUNT_RULES[a.type]?.label ?? a.type} accounts are not supported yet.`, `account:${a.id}`);
    }
    if (!isNum(a.priorYearEndBalance) || a.priorYearEndBalance < 0) {
      err('balance', `${a.label}: balance must be zero or a positive dollar amount.`, `account:${a.id}`);
    }
    if (a.contribution) {
      if (!isNum(a.contribution.annualAmount) || a.contribution.annualAmount < 0) {
        err('contribution', `${a.label}: annual contribution must be zero or positive.`, `contribution:${a.id}`);
      }
      if (!isWholeAge(a.contribution.throughAge)) {
        err('contribution-age', `${a.label}: contribution end age must be a whole number.`, `contribution:${a.id}`);
      }
    }
  }

  const r = s.returns;
  if (r.mode === 'single') {
    if (!isNum(r.annualReturn) || r.annualReturn <= -1) err('return', 'Annual return must be greater than -100%.', 'returns');
  } else {
    if (!isNum(r.stockWeight) || r.stockWeight < 0 || r.stockWeight > 1) {
      err('allocation', 'Stock allocation must be between 0% and 100%.', 'returns');
    }
    if (!isNum(r.stockReturn) || r.stockReturn <= -1) err('return', 'Stock return must be greater than -100%.', 'returns');
    if (!isNum(r.bondReturn) || r.bondReturn <= -1) err('return', 'Bond return must be greater than -100%.', 'returns');
  }
  if (out.every((m) => m.field !== 'returns') && !isNum(effectiveAnnualReturn(r))) {
    err('return', 'Return assumption is not a number.', 'returns');
  }

  for (const w of s.extraWithdrawals) {
    if (!isNum(w.annualAmount) || w.annualAmount < 0) err('extra', 'Extra withdrawal must be zero or positive.', 'extraWithdrawals', w.personId);
    if (!isWholeAge(w.startAge) || !isWholeAge(w.endAge) || w.startAge > w.endAge) {
      err('extra-ages', 'Extra withdrawal start age must be on or before the end age.', 'extraWithdrawals', w.personId);
    }
  }

  const st = s.strategy;
  if (!['withhold', 'taxable', 'cash'].includes(st.conversionTaxSource)) {
    err('tax-source', 'Choose how conversion taxes are paid.', 'conversionTaxSource');
  }
  const cf = s.cashFlow;
  for (const [key, label] of [
    ['taxableBalance', 'Taxable account balance'],
    ['taxableBasis', 'Taxable account cost basis'],
    ['cashBalance', 'Cash balance'],
    ['spendingFromIra', 'Spending from IRA withdrawals'],
  ] as const) {
    if (!isNum(cf[key]) || cf[key] < 0) err(key, `${label} must be zero or positive.`, key);
  }
  if (!isNum(cf.taxableYield) || cf.taxableYield < 0 || cf.taxableYield > 1) err('yield', 'Dividend yield must be between 0% and 100%.', 'taxableYield');
  if (!isNum(cf.cashRate) || cf.cashRate <= -1) err('cash-rate', 'Cash interest rate must be greater than -100%.', 'cashRate');
  for (const c of st.conversions) {
    if (!isNum(c.amount) || c.amount < 0) err('conversion-amount', `Conversion for ${c.year} must be zero or positive.`, `conversion:${c.year}`, c.personId);
  }
  for (const q of st.recurringQcds) {
    if (!isNum(q.annualAmount) || q.annualAmount < 0) err('qcd-amount', 'QCD amount must be zero or positive.', `qcd:${q.id}`, q.personId);
    if (!isWholeAge(q.startAge) || !isWholeAge(q.endAge) || q.startAge > q.endAge) {
      err('qcd-ages', 'QCD start age must be on or before the end age.', `qcd:${q.id}`, q.personId);
    }
  }
  for (const q of st.oneTimeQcds) {
    if (!isNum(q.amount) || q.amount < 0) err('qcd-amount', 'QCD amount must be zero or positive.', `qcd:${q.id}`, q.personId);
    if (!Number.isInteger(q.year)) err('qcd-year', 'One-time QCD needs a valid year.', `qcd:${q.id}`, q.personId);
  }
  if (!isNum(s.qcdLimits.assumedFutureLimit) || s.qcdLimits.assumedFutureLimit < 0) {
    err('qcd-limit', 'Assumed future QCD limit must be zero or positive.', 'qcdLimit');
  }
  for (const f of st.bracketFills ?? []) {
    if (!isWholeAge(f.startAge) || !isWholeAge(f.endAge) || f.startAge > f.endAge) {
      err('fill-ages', 'Fill-to-bracket start age must be on or before the end age.', `fill:${f.id}`, f.personId);
    }
    if (!BRACKET_RATES.includes(f.bracketRate)) err('fill-rate', 'Choose a federal bracket to fill.', `fill:${f.id}`, f.personId);
  }
  const hs = s.heirs;
  if (hs.mode === 'income') {
    if (!Number.isInteger(hs.count) || hs.count < 1 || hs.count > 20) err('heirs-count', 'Number of heirs must be a whole number from 1 to 20.', 'heirsCount');
    if (!isNum(hs.otherIncome) || hs.otherIncome < 0) err('heirs-income', "Heirs' income must be zero or positive.", 'heirsIncome');
    if (!isNum(hs.stateTaxRate) || hs.stateTaxRate < 0 || hs.stateTaxRate > 1) err('heirs-state', "Heirs' state tax rate must be between 0% and 100%.", 'heirsStateRate');
  }
  out.push(...validateAnalysis(s.analysis));
  return out;
}

/** Rates that can be chosen for fill-to-bracket conversions (the top 37% bracket has no top). */
export const BRACKET_RATES = [0.1, 0.12, 0.22, 0.24, 0.32, 0.35];

/** Checks the household income and tax assumptions. */
export function validateAnalysis(a: AnalysisSettings): EngineMessage[] {
  const out: EngineMessage[] = [];
  const bad = (code: string, text: string, field: string) => out.push({ severity: 'error', code, text, field });
  const nonNeg = (v: number) => isNum(v) && v >= 0;
  const isRate = (v: number) => isNum(v) && v >= 0 && v <= 1;
  for (const [key, label] of [
    ['otherOrdinaryIncome', 'Other ordinary income'],
    ['qualifiedInvestmentIncome', 'Qualified dividends and gains'],
    ['taxExemptInterest', 'Tax-exempt interest'],
    ['itemizedDeductions', 'Itemized deductions'],
  ] as const) {
    if (!nonNeg(a[key])) bad(key, `${label} must be zero or positive.`, key);
  }
  if (!isRate(a.stateTaxRate)) bad('state-rate', 'State tax rate must be between 0% and 100%.', 'stateTaxRate');
  if (!isRate(a.heirsTaxRate)) bad('heirs-rate', "Heirs' tax rate must be between 0% and 100%.", 'heirsTaxRate');
  if (!isNum(a.inflationRate) || a.inflationRate <= -1) bad('inflation', 'Inflation must be greater than -100%.', 'inflationRate');
  if (!a.discountMatchesReturn && (!isNum(a.discountRate) || a.discountRate <= -1)) {
    bad('discount', 'Discount rate must be greater than -100%.', 'discountRate');
  }
  return out;
}
