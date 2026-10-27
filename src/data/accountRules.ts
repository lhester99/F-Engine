import type { AccountType } from '../types';

/**
 * Per-account-type rules. The engine reads these rather than branching on
 * account type names, so new types can be added without engine rewrites.
 */
export interface AccountTypeRules {
  label: string;
  /** Pre-tax (Traditional) vs. Roth money. */
  taxTreatment: 'pretax' | 'roth';
  /** First calendar year with no lifetime RMDs, or null if lifetime RMDs always apply. */
  lifetimeRmdsEndBefore: number | null;
  /**
   * 'ira': RMDs computed per account but may be aggregated and satisfied from
   * any of the owner's IRAs. 'plan': each plan's RMD must come from that plan.
   */
  rmdAggregation: 'ira' | 'plan';
  /** May the account be the source of a QCD? (Active SEP/SIMPLE IRAs are excluded separately.) */
  qcdEligible: boolean;
  /** Whether the app currently models this type end to end. */
  supportedInCurrentPhase: boolean;
}

export const ACCOUNT_RULES: Record<AccountType, AccountTypeRules> = {
  traditional_ira: {
    label: 'Traditional IRA',
    taxTreatment: 'pretax',
    lifetimeRmdsEndBefore: null,
    rmdAggregation: 'ira',
    qcdEligible: true,
    supportedInCurrentPhase: true,
  },
  roth_ira: {
    label: 'Roth IRA',
    taxTreatment: 'roth',
    // Roth IRAs never have lifetime RMDs for the original owner.
    lifetimeRmdsEndBefore: -Infinity,
    rmdAggregation: 'ira',
    qcdEligible: false,
    supportedInCurrentPhase: true,
  },
  sep_ira: {
    label: 'SEP IRA',
    taxTreatment: 'pretax',
    lifetimeRmdsEndBefore: null,
    rmdAggregation: 'ira',
    qcdEligible: true, // only when not "ongoing" (no employer contribution that year)
    supportedInCurrentPhase: false,
  },
  simple_ira: {
    label: 'SIMPLE IRA',
    taxTreatment: 'pretax',
    lifetimeRmdsEndBefore: null,
    rmdAggregation: 'ira',
    qcdEligible: true, // only when not "ongoing"
    supportedInCurrentPhase: false,
  },
  '401k': {
    label: '401(k)',
    taxTreatment: 'pretax',
    lifetimeRmdsEndBefore: null,
    rmdAggregation: 'plan',
    qcdEligible: false,
    supportedInCurrentPhase: false,
  },
  '403b': {
    label: '403(b)',
    taxTreatment: 'pretax',
    lifetimeRmdsEndBefore: null,
    rmdAggregation: 'plan',
    qcdEligible: false,
    supportedInCurrentPhase: false,
  },
  roth_401k: {
    label: 'Roth 401(k)',
    taxTreatment: 'roth',
    // SECURE 2.0 §325: no lifetime RMDs from designated Roth accounts starting 2024.
    lifetimeRmdsEndBefore: 2024,
    rmdAggregation: 'plan',
    qcdEligible: false,
    supportedInCurrentPhase: false,
  },
};

/** Does this account type require a lifetime RMD in the given calendar year? */
export function hasLifetimeRmd(type: AccountType, year: number): boolean {
  const end = ACCOUNT_RULES[type].lifetimeRmdsEndBefore;
  return end === null || year < end;
}
