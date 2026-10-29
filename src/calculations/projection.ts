import { ACCOUNT_RULES, hasLifetimeRmd } from '../data/accountRules';
import type {
  Account,
  AccountYear,
  EngineMessage,
  HouseholdCashFlow,
  Person,
  PersonYear,
  ProjectionResult,
  Scenario,
  YearResult,
  YearTotals,
} from '../types';
import { emptyStrategy, requestedConversion, requestedQcd } from '../strategies/schedule';
import { allocateProRata } from './allocate';
import { settleHouseholdYear } from './cashFlow';
import { computeTax, householdIncomeForYear, NO_SIDE_INCOME, taxParametersForYear, type SideIncome } from './federalTax';
import { alivePeople, deathYear, filingStatusForYear, ownerIdForYear, peopleAge65, spendingFactor } from './household';
import { irmaaScheduleForYear, IRMAA_LOOKBACK_YEARS } from './irmaa';
import { ageAttainedInYear, dateAttaining70AndAHalf, formatCalendarDate, parseIsoDate } from './dates';
import { qcdLimitForYear } from './qcd';
import { effectiveAnnualReturn } from './returns';
import { computeRmd, getRmdStart, lifetimeDistributionPeriod } from './rmdRules';
import { validateScenario } from './validate';

const usd = (n: number) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

/**
 * Projects every account year by year. Annual order (same for every year and
 * every scenario; see the Methodology panel):
 *   1) start from the prior December 31 balance
 *   2) compute the required RMD
 *   3) apply QCDs (counting toward the RMD first)
 *   4) take the remaining RMD as a taxable distribution
 *   5) apply extra withdrawals
 *   6) apply Roth conversions
 *   7) add contributions
 *   8) apply the year's investment return to the remaining balance
 *   9) record the December 31 balance
 * Nothing is rounded here; rounding is for display only.
 */
export function runProjection(scenario: Scenario): ProjectionResult {
  const validation = validateScenario(scenario);
  const errors = validation.filter((m) => m.severity === 'error');
  if (errors.length > 0) return { ok: false, errors, years: [], messages: validation };

  const messages: EngineMessage[] = [...validation];
  const primary = scenario.people[0]!;
  const primaryBirth = parseIsoDate(primary.dateOfBirth)!;
  const lastYear = primaryBirth.year + scenario.endAge;
  const rate = effectiveAnnualReturn(scenario.returns);
  const strategy = scenario.strategy;

  // Working balances, keyed by account id, carried from year to year.
  const balance = new Map<string, number>(scenario.accounts.map((a) => [a.id, a.priorYearEndBalance]));
  // First-year RMD amounts deferred to April 1 of the next year, keyed by RMD bucket.
  let deferred = new Map<string, number>();
  // Deductible IRA contributions for years on or after age 70½ not yet used to
  // reduce a QCD exclusion (IRC §408(d)(8)(A)), keyed by person.
  const qcdOffsetPool = new Map<string, number>();
  // Taxable account and cash, and IRMAA costs scheduled for future premium years.
  const cf = scenario.cashFlow;
  let side = { taxable: cf.taxableBalance, basis: cf.taxableBasis, cash: cf.cashBalance };
  const irmaaDue = new Map<number, number>();
  const dYear = deathYear(scenario);

  const years: YearResult[] = [];
  for (let year = scenario.startYear; year <= lastYear; year++) {
    const yearMessages: EngineMessage[] = [];
    const accountYears = new Map<string, AccountYear>();
    for (const a of scenario.accounts) {
      const prior = balance.get(a.id)!;
      accountYears.set(a.id, {
        accountId: a.id,
        type: a.type,
        priorYearEndBalance: prior,
        rmdComputed: 0,
        qcd: 0,
        rmdTaxableWithdrawal: 0,
        extraWithdrawal: 0,
        withdrawal: 0,
        conversionOut: 0,
        conversionIn: 0,
        contribution: 0,
        growth: 0,
        endBalance: prior,
      });
    }
    // `avail` tracks each account's balance as flows are applied during the year.
    const avail = new Map(balance);
    const take = (accounts: Account[], amount: number, field: 'qcd' | 'rmdTaxableWithdrawal' | 'extraWithdrawal' | 'conversionOut') => {
      const parts = allocateProRata(amount, accounts.map((a) => avail.get(a.id)!));
      let taken = 0;
      accounts.forEach((a, i) => {
        const part = parts[i]!;
        avail.set(a.id, avail.get(a.id)! - part);
        accountYears.get(a.id)![field] += part;
        taken += part;
      });
      return taken;
    };
    const sumAvail = (accounts: Account[]) => accounts.reduce((s, a) => s + avail.get(a.id)!, 0);

    const nextDeferred = new Map<string, number>();
    const personYears: PersonYear[] = [];
    // Side-account income known at the start of the year (used when filling a bracket).
    const sideStart: SideIncome = { qualified: side.taxable * cf.taxableYield, ordinary: side.cash * cf.cashRate };

    // Phase A (steps 1–5) for every living person, so the household's RMD income is
    // known before any conversion is sized in phase B.
    const ctxs: PersonContext[] = [];
    for (const person of alivePeople(scenario, year)) {
      const birth = parseIsoDate(person.dateOfBirth)!;
      const age = ageAttainedInYear(birth, year);
      const start = getRmdStart(birth);
      const isRmdYear = year >= start.firstRmdYear;
      const isFirstRmdYear = year === start.firstRmdYear;
      // A first RMD cannot be deferred past the owner's death; the deceased's full RMD is taken in the death year.
      const diesThisYear = dYear === year && person.id === scenario.survivorship.firstDeathPersonId;
      const deferralThisYear = person.delayFirstRmd && isFirstRmdYear && !diesThisYear;
      // The spouse counts as sole beneficiary for the whole year if they were married on
      // January 1, even if either dies during the year (Treas. Reg. §1.401(a)(9)-5(c)(2)(iii)).
      const spouse = alivePeople(scenario, year).find((p) => p.id !== person.id);
      const spouseAge =
        spouse && person.spouseIsSoleBeneficiary !== false ? ageAttainedInYear(parseIsoDate(spouse.dateOfBirth)!, year) : null;
      const lifetime = isRmdYear ? lifetimeDistributionPeriod(age, spouseAge) : null;
      const distributionPeriod = lifetime?.period ?? null;
      const distributionTable = lifetime?.table ?? null;
      const msg = (severity: EngineMessage['severity'], code: string, text: string, field?: string) =>
        yearMessages.push({ severity, code, text, year, personId: person.id, field });

      // Includes a deceased spouse's IRAs after the spousal rollover.
      const owned = scenario.accounts.filter((a) => ownerIdForYear(scenario, a, year) === person.id);
      const pretaxIras = owned.filter(
        (a) => ACCOUNT_RULES[a.type].taxTreatment === 'pretax' && ACCOUNT_RULES[a.type].rmdAggregation === 'ira',
      );
      const qcdSources = pretaxIras.filter((a) => ACCOUNT_RULES[a.type].qcdEligible);
      const rothIra = owned.find((a) => a.type === 'roth_ira');
      const halfDate = dateAttaining70AndAHalf(birth);

      // Deductible pre-tax IRA contributions this year. Those for years ending on or
      // after the 70½ date add to the QCD offset, including against this year's QCDs,
      // as on the tax return.
      let deductibleContributions = 0;
      for (const a of pretaxIras) {
        const c = a.contribution;
        if (a.ownerId === person.id && c && c.annualAmount > 0 && age <= c.throughAge && c.deductible !== false) {
          deductibleContributions += c.annualAmount;
        }
      }
      if (year >= halfDate.year) {
        qcdOffsetPool.set(person.id, (qcdOffsetPool.get(person.id) ?? 0) + deductibleContributions);
      }

      // RMD buckets: all of the person's IRAs together, and each employer plan on its own.
      const buckets: { key: string; accounts: Account[] }[] = [];
      const iraRmdAccounts = owned.filter((a) => ACCOUNT_RULES[a.type].rmdAggregation === 'ira' && hasLifetimeRmd(a.type, year));
      if (iraRmdAccounts.length) buckets.push({ key: `${person.id}:ira`, accounts: iraRmdAccounts });
      for (const a of owned) {
        if (ACCOUNT_RULES[a.type].rmdAggregation === 'plan' && hasLifetimeRmd(a.type, year)) {
          buckets.push({ key: `${person.id}:plan:${a.id}`, accounts: [a] });
        }
      }

      // Step 2: required RMD per account (prior Dec 31 balance ÷ distribution period).
      let rmdForYear = 0;
      let deferredIn = 0;
      const bucketState = buckets.map((b) => {
        let bucketRmd = 0;
        if (distributionPeriod !== null) {
          for (const a of b.accounts) {
            const r = computeRmd(accountYears.get(a.id)!.priorYearEndBalance, distributionPeriod);
            accountYears.get(a.id)!.rmdComputed = r;
            bucketRmd += r;
          }
        }
        const carriedIn = deferred.get(b.key) ?? 0;
        rmdForYear += bucketRmd;
        deferredIn += carriedIn;
        return {
          ...b,
          // Must be distributed by December 31 this year.
          dueThisYear: carriedIn + (deferralThisYear ? 0 : bucketRmd),
          // First-year RMD that may instead be taken by April 1 next year.
          deferrable: deferralThisYear ? bucketRmd : 0,
        };
      });
      const iraBucket = bucketState.find((b) => b.key === `${person.id}:ira`);
      // Amount the IRS requires to be distributed in this calendar year.
      const requiredRmd = bucketState.reduce((s, b) => s + b.dueThisYear, 0);

      // Step 3: QCDs, counting toward the IRA RMD first.
      let qcd = 0;
      let qcdTowardRmd = 0;
      let qcdNotExcluded = 0;
      const qcdRequested = requestedQcd(strategy, person.id, year, age);
      if (qcdRequested > 0) {
        if (halfDate.year > year) {
          msg('error', 'qcd-age', `Age ${age} (${year}): QCD of ${usd(qcdRequested)} blocked. QCDs require age 70½ (reached ${formatCalendarDate(halfDate)}).`, 'qcd');
        } else {
          let amount = qcdRequested;
          if (halfDate.year === year) {
            msg('info', 'qcd-half-year', `Age ${age} (${year}): QCDs must be made on or after ${formatCalendarDate(halfDate)}, the date age 70½ is reached.`, 'qcd');
          }
          const limit = qcdLimitForYear(scenario.qcdLimits, year);
          if (amount > limit) {
            msg('warning', 'qcd-limit', `Age ${age} (${year}): QCD of ${usd(amount)} exceeds the ${usd(limit)} annual limit; limited to ${usd(limit)}.`, 'qcd');
            amount = limit;
          }
          const available = sumAvail(qcdSources);
          if (amount > available) {
            msg('warning', 'qcd-balance', `Age ${age} (${year}): QCD limited to the ${usd(available)} remaining in eligible IRAs.`, 'qcd');
          }
          qcd = take(qcdSources, amount, 'qcd');
          if (iraBucket) {
            let left = qcd;
            const toDue = Math.min(left, iraBucket.dueThisYear);
            iraBucket.dueThisYear -= toDue;
            left -= toDue;
            const toDeferrable = Math.min(left, iraBucket.deferrable);
            iraBucket.deferrable -= toDeferrable;
            qcdTowardRmd = toDue + toDeferrable;
          }
          // The QCD still counts toward the RMD, but the part matched by post-70½
          // deductible contributions is not excluded from income.
          const pool = qcdOffsetPool.get(person.id) ?? 0;
          qcdNotExcluded = Math.min(qcd, pool);
          if (qcdNotExcluded > 0) {
            qcdOffsetPool.set(person.id, pool - qcdNotExcluded);
            msg(
              'info',
              'qcd-contribution-offset',
              `Age ${age} (${year}): ${usd(qcdNotExcluded)} of the QCD is taxable because of deductible IRA contributions made after age 70½.`,
              'qcd',
            );
          }
        }
      }

      // Step 4: remaining RMD as a taxable distribution, from each bucket's own accounts.
      let rmdTaxable = 0;
      let rmdShortfall = 0;
      for (const b of bucketState) {
        const taken = take(b.accounts, b.dueThisYear, 'rmdTaxableWithdrawal');
        rmdTaxable += taken;
        rmdShortfall += b.dueThisYear - taken;
        b.dueThisYear -= taken;
      }
      if (rmdShortfall > 0.005) {
        msg('warning', 'rmd-shortfall', `Age ${age} (${year}): accounts are depleted; ${usd(rmdShortfall)} of the required RMD could not be distributed.`);
      }

      // Step 5: extra pre-tax withdrawals. In a deferral year they count toward the first-year RMD.
      let extraRequested = 0;
      for (const w of scenario.extraWithdrawals) {
        if (w.personId === person.id && age >= w.startAge && age <= w.endAge) extraRequested += w.annualAmount;
      }
      let extra = 0;
      if (extraRequested > 0) {
        const available = sumAvail(pretaxIras);
        if (extraRequested > available) {
          msg('warning', 'extra-balance', `Age ${age} (${year}): extra withdrawal limited to the ${usd(available)} remaining.`, 'extraWithdrawals');
        }
        extra = take(pretaxIras, extraRequested, 'extraWithdrawal');
        if (iraBucket && iraBucket.deferrable > 0) iraBucket.deferrable -= Math.min(extra, iraBucket.deferrable);
      }

      const rmdDeferredToNextYear = bucketState.reduce((s, b) => s + b.deferrable, 0);
      for (const b of bucketState) if (b.deferrable > 0) nextDeferred.set(b.key, b.deferrable);
      if (rmdDeferredToNextYear > 0 && year === lastYear) {
        msg('info', 'deferral-beyond-horizon', `Age ${age} (${year}): ${usd(rmdDeferredToNextYear)} deferred to April 1, ${year + 1}, after the projection ends.`);
      }
      ctxs.push({
        person,
        age,
        msg,
        owned,
        pretaxIras,
        rothIra,
        isRmdYear,
        isFirstRmdYear,
        distributionPeriod,
        distributionTable,
        rmdForYear,
        deferredIn,
        rmdDeferredToNextYear,
        requiredRmd,
        qcd,
        qcdTowardRmd,
        qcdNotExcluded,
        deductibleContributions,
        rmdTaxable,
        rmdShortfall,
        extra,
      });
    }

    // Phase B (steps 6–7): conversions and contributions, person by person, with
    // the household's income (including earlier conversions this year) in view.
    const householdIra = ctxs.reduce((x, c) => x + c.rmdTaxable + c.extra + c.qcdNotExcluded, 0);
    const householdDeductible = ctxs.reduce((x, c) => x + c.deductibleContributions, 0);
    let convertedSoFar = 0;
    for (const ctx of ctxs) {
      const {
        person,
        age,
        msg,
        owned,
        pretaxIras,
        rothIra,
        isRmdYear,
        isFirstRmdYear,
        distributionPeriod,
        distributionTable,
        rmdForYear,
        deferredIn,
        rmdDeferredToNextYear,
        requiredRmd,
        qcd,
        qcdTowardRmd,
        qcdNotExcluded,
        deductibleContributions,
        rmdTaxable,
        rmdShortfall,
        extra,
      } = ctx;

      // Step 6: Roth conversions, only after the RMD has been satisfied.
      // A fixed amount for the year takes precedence over a fill-to-bracket rule.
      const hasFixed = strategy.conversions.some((c) => c.personId === person.id && c.year === year);
      const fillRule = strategy.bracketFills.find((r) => r.personId === person.id && age >= r.startAge && age <= r.endAge);
      let conversionRequested = requestedConversion(strategy.conversions, person.id, year);
      let conversionMethod: PersonYear['conversionMethod'] = hasFixed ? 'fixed' : 'none';
      if (hasFixed && fillRule) {
        msg('info', 'conversion-fixed-over-fill', `Age ${age} (${year}): the fixed conversion amount is used instead of the fill-to-bracket rule.`, 'conversion');
      }
      if (!hasFixed && fillRule && rothIra && rmdDeferredToNextYear <= 0 && rmdShortfall <= 0.005) {
        conversionMethod = 'fill';
        conversionRequested = bracketFillAmount(
          scenario,
          year,
          fillRule,
          sumAvail(pretaxIras),
          { taxableIra: householdIra + convertedSoFar, deductibleContributions: householdDeductible },
          sideStart,
        );
        if (conversionRequested <= 0) {
          msg('info', 'fill-no-room', `Age ${age} (${year}): income is already at or above the ${Math.round(fillRule.bracketRate * 100)}% bracket${fillRule.irmaaMaxTier !== null ? ' or IRMAA limit' : ''}, so nothing is converted.`, 'conversion');
        }
      }
      let conversionGross = 0;
      let conversionWithheld = 0;
      let conversionToRoth = 0;
      if (conversionRequested > 0) {
        if (!rothIra) {
          msg('error', 'conversion-no-roth', `Age ${age} (${year}): conversion blocked; add a Roth IRA to receive it.`, 'conversion');
        } else if (rmdDeferredToNextYear > 0) {
          msg(
            'error',
            'conversion-deferred-rmd',
            `Age ${age} (${year}): conversion of ${usd(conversionRequested)} blocked. In the first RMD year, distributions count toward that year's RMD first, so a conversion is only allowed after the ${usd(rmdDeferredToNextYear)} first-year RMD is taken in ${year}. Turn off the April 1 deferral or move the conversion.`,
            'conversion',
          );
        } else if (rmdShortfall > 0.005) {
          msg('error', 'conversion-rmd-unmet', `Age ${age} (${year}): conversion blocked because the required RMD could not be fully distributed.`, 'conversion');
        } else {
          const available = sumAvail(pretaxIras);
          let amount = conversionRequested;
          if (amount > available) {
            msg(
              'error',
              'conversion-exceeds',
              `Age ${age} (${year}): conversion of ${usd(conversionRequested)} exceeds the ${usd(available)} left after the RMD and withdrawals. Only ${usd(available)} is converted; the excess is blocked.`,
              'conversion',
            );
            amount = available;
          }
          conversionGross = take(pretaxIras, amount, 'conversionOut');
          convertedSoFar += conversionGross;
          // Any tax withheld is settled with the household's taxes below.
          conversionToRoth = conversionGross;
          avail.set(rothIra.id, avail.get(rothIra.id)! + conversionToRoth);
          accountYears.get(rothIra.id)!.conversionIn += conversionToRoth;
        }
      }

      // Step 7: contributions (only to the person's own accounts, never to a deceased spouse's).
      for (const a of owned) {
        if (a.ownerId === person.id && a.contribution && a.contribution.annualAmount > 0 && age <= a.contribution.throughAge) {
          avail.set(a.id, avail.get(a.id)! + a.contribution.annualAmount);
          accountYears.get(a.id)!.contribution += a.contribution.annualAmount;
        }
      }

      const taxableDistribution = rmdTaxable + extra + qcdNotExcluded;
      personYears.push({
        personId: person.id,
        age,
        isRmdYear,
        isFirstRmdYear,
        distributionPeriod,
        distributionTable,
        rmdForYear,
        deferredRmdFromPriorYear: deferredIn,
        rmdDeferredToNextYear,
        requiredRmd,
        qcd,
        qcdTowardRmd,
        qcdNotExcluded,
        deductibleContributions,
        taxableDistribution,
        rmdTaxableWithdrawal: rmdTaxable,
        extraWithdrawal: extra,
        // QCD dollars are counted once, even when part of a QCD is taxable.
        totalDistributions: qcd + rmdTaxable + extra,
        conversionRequested,
        conversionMethod,
        conversionGross,
        conversionWithheld,
        conversionToRoth,
        rmdShortfall,
      });
    }

    // Household taxes and cash flows outside the IRAs (see cashFlow.ts for the order).
    const sumP = (f: (p: PersonYear) => number) => personYears.reduce((x, p) => x + f(p), 0);
    // Roth IRAs held by living people this year (after any rollover).
    const rothsNow = scenario.accounts.filter((a) => a.type === 'roth_ira');
    const settled = settleHouseholdYear({
      scenario,
      year,
      ira: {
        taxableIra: sumP((p) => p.taxableDistribution),
        conversion: sumP((p) => p.conversionGross),
        deductibleContributions: sumP((p) => p.deductibleContributions),
      },
      iraCash: sumP((p) => p.rmdTaxableWithdrawal + p.extraWithdrawal),
      start: side,
      rothAvailable: rothsNow.reduce((x, a) => x + avail.get(a.id)!, 0),
      irmaaDue: irmaaDue.get(year) ?? 0,
      spendingTarget:
        cf.spendingFromIra * Math.pow(1 + scenario.analysis.inflationRate, year - scenario.startYear) * spendingFactor(scenario, year),
      source: strategy.conversionTaxSource,
    });
    const hmsg = (severity: EngineMessage['severity'], code: string, text: string, field?: string) =>
      yearMessages.push({ severity, code, text, year, personId: primary.id, field });
    if (dYear === year) {
      const deceased = scenario.people.find((p) => p.id === scenario.survivorship.firstDeathPersonId)!;
      hmsg(
        'info',
        'first-death',
        `${year}: ${deceased.label} dies at age ${scenario.survivorship.deathAge}. This year is filed jointly and the full RMD is taken; from ${year + 1} the survivor owns the IRAs and files single.`,
      );
    }
    const primaryAge = ageAttainedInYear(primaryBirth, year);
    if (settled.conversionTaxWithheld > 0) {
      // Withheld tax never reaches the Roth IRA. With two converters, it is split in
      // proportion to each person's conversion.
      const totalConv = sumP((p) => p.conversionGross);
      let withheld = 0;
      for (const p of personYears) {
        if (p.conversionGross <= 0) continue;
        const roth = scenario.accounts.find((a) => a.type === 'roth_ira' && ownerIdForYear(scenario, a, year) === p.personId);
        if (!roth) continue;
        const share = Math.min((settled.conversionTaxWithheld * p.conversionGross) / totalConv, avail.get(roth.id)!);
        avail.set(roth.id, avail.get(roth.id)! - share);
        accountYears.get(roth.id)!.conversionIn -= share;
        p.conversionWithheld = share;
        p.conversionToRoth = p.conversionGross - share;
        withheld += share;
      }
      if (settled.conversionTaxFellBack) {
        hmsg(
          'warning',
          'conversion-tax-fallback',
          `Age ${primaryAge} (${year}): the ${strategy.conversionTaxSource === 'cash' ? 'cash' : 'taxable'} account and the other account could not cover the ${usd(settled.conversionTax)} conversion tax; ${usd(withheld)} is withheld from the conversion instead.`,
          'conversion',
        );
      }
    }
    if (settled.withdrawnRoth > 0) {
      const parts = allocateProRata(settled.withdrawnRoth, rothsNow.map((a) => avail.get(a.id)!));
      rothsNow.forEach((a, i) => {
        avail.set(a.id, avail.get(a.id)! - parts[i]!);
        accountYears.get(a.id)!.withdrawal += parts[i]!;
      });
    }
    if (settled.spendingShortfall > 0.5) {
      hmsg('warning', 'spending-shortfall', `Age ${primaryAge} (${year}): ${usd(settled.spendingShortfall)} of the spending could not be covered by the accounts modeled.`, 'spending');
    }
    if (settled.irmaaScheduled > 0) irmaaDue.set(year + 2, settled.irmaaScheduled);

    // Steps 8–9: growth on the remaining balance, then record December 31.
    for (const a of scenario.accounts) {
      const ay = accountYears.get(a.id)!;
      const remaining = avail.get(a.id)!;
      ay.growth = remaining * rate;
      ay.endBalance = remaining + ay.growth;
      balance.set(a.id, ay.endBalance);
    }
    deferred = nextDeferred;

    // Taxable account and cash grow after the year's flows, like the IRAs.
    // Reinvested dividends add to cost basis.
    const taxableGrowth = settled.after.taxable * rate;
    const cashGrowth = settled.after.cash * cf.cashRate;
    const household = {
      taxableStart: side.taxable,
      taxableBasisStart: side.basis,
      cashStart: side.cash,
      dividends: settled.dividends,
      cashInterest: settled.cashInterest,
      realizedGain: settled.realizedGain,
      taxOnModeledIncome: settled.taxOnModeledIncome,
      conversionTax: settled.conversionTax,
      conversionTaxWithheld: settled.conversionTaxWithheld,
      conversionTaxFromTaxable: settled.conversionTaxFromTaxable,
      conversionTaxFromCash: settled.conversionTaxFromCash,
      irmaaPaid: settled.irmaaPaid,
      iraCashReceived: sumP((p) => p.rmdTaxableWithdrawal + p.extraWithdrawal),
      spending: settled.spending,
      spendingShortfall: settled.spendingShortfall,
      invested: settled.invested,
      withdrawnTaxable: settled.withdrawnTaxable,
      withdrawnCash: settled.withdrawnCash,
      withdrawnRoth: settled.withdrawnRoth,
      taxableGrowth,
      cashGrowth,
      taxableEnd: settled.after.taxable + taxableGrowth,
      taxableBasisEnd: settled.after.basis + settled.dividends,
      cashEnd: settled.after.cash + cashGrowth,
    };
    side = { taxable: household.taxableEnd, basis: household.taxableBasisEnd, cash: household.cashEnd };

    const accounts = scenario.accounts.map((a) => accountYears.get(a.id)!);
    years.push({
      year,
      age: ageAttainedInYear(primaryBirth, year),
      returnRate: rate,
      people: personYears,
      accounts,
      totals: sumTotals(accounts, personYears, household, scenario.analysis.heirsTaxRate),
      household,
      messages: yearMessages,
    });
    messages.push(...yearMessages);
  }

  return { ok: true, errors: [], years, messages };
}

function sumTotals(accounts: AccountYear[], people: PersonYear[], h: HouseholdCashFlow, heirsTaxRate: number): YearTotals {
  const isRoth = (a: AccountYear) => ACCOUNT_RULES[a.type].taxTreatment === 'roth';
  const sum = <T,>(xs: T[], f: (x: T) => number) => xs.reduce((s, x) => s + f(x), 0);
  const pretax = accounts.filter((a) => !isRoth(a));
  const roth = accounts.filter(isRoth);
  const endPretax = sum(pretax, (a) => a.endBalance);
  const endRoth = sum(roth, (a) => a.endBalance);
  return {
    priorBalancePretax: sum(pretax, (a) => a.priorYearEndBalance),
    priorBalanceRoth: sum(roth, (a) => a.priorYearEndBalance),
    requiredRmd: sum(people, (p) => p.requiredRmd),
    rmdForYear: sum(people, (p) => p.rmdForYear),
    deferredRmdFromPriorYear: sum(people, (p) => p.deferredRmdFromPriorYear),
    rmdDeferredToNextYear: sum(people, (p) => p.rmdDeferredToNextYear),
    qcd: sum(people, (p) => p.qcd),
    qcdNotExcluded: sum(people, (p) => p.qcdNotExcluded),
    deductibleContributions: sum(people, (p) => p.deductibleContributions),
    taxableDistribution: sum(people, (p) => p.taxableDistribution),
    extraWithdrawal: sum(people, (p) => p.extraWithdrawal),
    totalDistributions: sum(people, (p) => p.totalDistributions),
    conversionGross: sum(people, (p) => p.conversionGross),
    conversionWithheld: sum(people, (p) => p.conversionWithheld),
    contributions: sum(accounts, (a) => a.contribution),
    growth: sum(accounts, (a) => a.growth),
    sideQualifiedIncome: h.dividends + h.realizedGain,
    sideOrdinaryIncome: h.cashInterest,
    endBalanceTaxable: h.taxableEnd,
    endBalanceCash: h.cashEnd,
    afterTaxValue: endRoth + h.taxableEnd + h.cashEnd + endPretax * (1 - heirsTaxRate),
    endBalancePretax: endPretax,
    endBalanceRoth: endRoth,
    // All modeled accounts: IRAs, taxable account, and cash.
    endBalanceTotal: endPretax + endRoth + h.taxableEnd + h.cashEnd,
  };
}

/** Per-person values carried from phase A (steps 1–5) to phase B (steps 6–7). */
interface PersonContext {
  person: Person;
  age: number;
  msg: (severity: EngineMessage['severity'], code: string, text: string, field?: string) => void;
  owned: Account[];
  pretaxIras: Account[];
  rothIra: Account | undefined;
  isRmdYear: boolean;
  isFirstRmdYear: boolean;
  distributionPeriod: number | null;
  distributionTable: 'uniform' | 'joint' | null;
  rmdForYear: number;
  deferredIn: number;
  rmdDeferredToNextYear: number;
  requiredRmd: number;
  qcd: number;
  qcdTowardRmd: number;
  qcdNotExcluded: number;
  deductibleContributions: number;
  rmdTaxable: number;
  rmdShortfall: number;
  extra: number;
}

/**
 * Largest conversion that keeps ordinary taxable income within the rule's
 * bracket (and MAGI within its IRMAA limit, when the client will be on Medicare
 * in the premium year), given the year's other income. Taxable income only
 * rises with the conversion, so a bisection search to the dollar is exact.
 */
export function bracketFillAmount(
  scenario: Scenario,
  year: number,
  rule: { bracketRate: number; irmaaMaxTier: number | null },
  available: number,
  ira: { taxableIra: number; deductibleContributions: number },
  side: SideIncome = NO_SIDE_INCOME,
): number {
  if (available <= 0) return 0;
  const a = scenario.analysis;
  const status = filingStatusForYear(scenario, year);
  const brackets = taxParametersForYear(year, a.inflationRate).params.brackets[status];
  const top = brackets.find((b) => Math.abs(b.rate - rule.bracketRate) < 1e-9)?.upTo;
  if (top === undefined) return 0;

  let magiCap = Infinity;
  if (rule.irmaaMaxTier !== null && peopleAge65(scenario, year + IRMAA_LOOKBACK_YEARS) > 0) {
    const schedule = irmaaScheduleForYear(year + IRMAA_LOOKBACK_YEARS, a.inflationRate)?.schedule;
    const next = schedule?.tiers[rule.irmaaMaxTier];
    if (next) {
      // The IRMAA tier is set by this year's return (filing status), for premiums two years later.
      const bound = status === 'joint' ? next.joint : next.single;
      // Tiers apply above their bound; the top tier applies at its bound.
      magiCap = rule.irmaaMaxTier + 1 === schedule!.tiers.length ? bound - 1 : bound;
    }
  }

  const fits = (c: number) => {
    const t = computeTax(householdIncomeForYear(scenario, year, { ...ira, conversion: c }, side));
    return t.ordinaryTaxableIncome <= top + 1e-6 && t.irmaaMagi <= magiCap + 1e-6;
  };
  if (fits(available)) return available;
  if (!fits(0)) return 0;
  let lo = 0;
  let hi = available;
  while (hi - lo > 0.5) {
    const mid = (lo + hi) / 2;
    if (fits(mid)) lo = mid;
    else hi = mid;
  }
  // Whole dollars, never past the limit; the limit itself counts as within it.
  const whole = Math.floor(hi);
  return fits(whole) ? whole : Math.floor(lo);
}

/** Same inputs with no conversions and no QCDs: the "No strategy" baseline. */
export function toBaseline(scenario: Scenario): Scenario {
  return { ...scenario, strategy: emptyStrategy(scenario.strategy.conversionTaxSource) };
}

export interface Comparison {
  baseline: ProjectionResult;
  strategy: ProjectionResult;
}

export function runComparison(scenario: Scenario): Comparison {
  return { baseline: runProjection(toBaseline(scenario)), strategy: runProjection(scenario) };
}
