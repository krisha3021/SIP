/**
 * Plan/option eligibility for NAV backtests.
 *
 * A backtest on a NAV series is only meaningful when the NAV already includes every return the investor
 * received. That holds for Growth options: gains stay in the NAV. For IDCW (dividend) options, the NAV
 * drops by each distribution on the record date. Without the distribution history (amount, record date,
 * reinvestment NAV) a NAV-only backtest would show those payouts as losses. Lakshya does not model
 * distributions, so IDCW and unknown options are refused rather than estimated.
 */
import { backtestSipOnNav, type NavBacktestInput, type NavBacktestResult } from '../finance/navBacktest';
import { rollingReturns, type RollingResult } from '../finance/rolling';
import { fail, ok, type CalcResult } from '../finance/types';
import type { SchemeNavHistory } from './mfapi';
import type { Provenance } from './provenance';

export interface Eligibility {
  plan: Provenance['plan'];
  option: Provenance['option'];
}

export const IDCW_UNSUPPORTED_MESSAGE =
  'This is an IDCW (dividend) option. Its NAV falls whenever a distribution is paid, and Lakshya does not have the ' +
  'distribution history needed to add those payouts back, so a backtest would understate returns. Choose the Growth ' +
  'option of the same scheme instead.';

export const UNKNOWN_OPTION_MESSAGE =
  'The option (Growth or IDCW) could not be identified from the scheme name, so Lakshya cannot confirm that the NAV ' +
  'includes all returns. The backtest is not run. Choose a scheme whose name states the Growth option.';

export function checkBacktestEligibility(meta: Eligibility): CalcResult<Eligibility> {
  if (meta.option === 'IDCW') return fail('UNSUPPORTED', IDCW_UNSUPPORTED_MESSAGE, 'schemeCode');
  if (meta.option !== 'Growth') return fail('UNSUPPORTED', UNKNOWN_OPTION_MESSAGE, 'schemeCode');
  const warnings =
    meta.plan === 'Unknown'
      ? ['The plan (Direct or Regular) could not be identified. Regular plans carry higher expenses, which lowers returns.']
      : [];
  return ok(meta, warnings);
}

/** Runs a SIP backtest on a provider history only when the plan/option is supported. */
export function backtestScheme(history: SchemeNavHistory, input: NavBacktestInput): CalcResult<NavBacktestResult> {
  const elig = checkBacktestEligibility(history.meta);
  if (!elig.ok) return elig;
  const res = backtestSipOnNav(history.navs, input);
  return res.ok ? ok(res.value, [...elig.warnings, ...res.warnings]) : res;
}

/** Rolling returns on a provider history only when the plan/option is supported. */
export function rollingReturnsForScheme(history: SchemeNavHistory, windowYears: number): CalcResult<RollingResult> {
  const elig = checkBacktestEligibility(history.meta);
  if (!elig.ok) return elig;
  const res = rollingReturns(history.navs, windowYears);
  return res.ok ? ok(res.value, [...elig.warnings, ...res.warnings]) : res;
}
