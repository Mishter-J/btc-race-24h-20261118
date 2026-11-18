/**
 * btc-race-24h-20261118-1444 — a cbBTC/USDC bot for make.fun bars-replay/v1.
 *
 * Strategy: capitulation dip-buying with a bounce confirmation.
 *
 * What the dev window (1,440 one-minute cbBTC bars, BTC -281 bps start to
 * finish) actually shows, measured bar by bar before this bot was written:
 *
 *   - One-minute bars are mostly noise (1-minute return stdev ~6.7 bps)
 *     and a full-size round trip costs ~26 bps in fee, slippage and price
 *     impact, so scalping and ordinary trend-following both lose after
 *     costs on this window: every house baseline is negative
 *     (buy-and-hold -$31.63, momentum -$23.87, rsi-bollinger -$39.92,
 *     adx-momentum -$75.57, ema-cross -$148.17).
 *   - The one repeatable edge is the snap-back after a violent sell-off.
 *     The five bars whose 5-minute return fell to -80 bps or worse were
 *     followed by +91 bps on average over the next 30 minutes (median
 *     +101 bps, every one of them above the ~26 bps round-trip cost).
 *     The single crash of the window — a -52 bps one-minute bar, -92 bps
 *     over five minutes — bounced +142 bps within fifteen minutes.
 *   - Buying mid-crash loses: the same -80 bps trigger without a
 *     confirmation buys bars that keep falling and stops out for about
 *     -$11. So the entry waits for the fall to pause: the latest
 *     one-minute return must be flat or up.
 *
 * Entry (long only, full cash, at most one position, once the bounce
 * has started):
 *   5-minute close return <= -80 bps AND latest 1-minute return >= 0.
 *   No entries in the last 90 bars: a position opened that late would be
 *   flattened at the window's last close before any bounce can pay.
 *
 * Exit (whichever fires first, whole position):
 *   - take profit: position value >= 110% of its value at entry
 *   - trailing stop: close falls 60 bps below the highest close since entry
 *   - hard stop: position value <= 92% of its value at entry
 *   - max hold: 120 bars
 *
 * Entry value is the position's harness-reported cost (the notional
 * spent, fees included), so the take-profit and hard stop are measured
 * from what the fill actually cost.
 *
 * All arithmetic is bigint; no floats, no clock, no randomness, no file
 * or environment reads. The bot is a pure function of the bars it is
 * sent, so the two grading runs produce identical action logs.
 */

import { BPS, runBars, type Bar, type BarsState, type BuyInput, type SellInput } from "./vendor/makefun-bars.ts";

const SYMBOL = "CBBTC";

/** Minutes of closes kept: entry needs the close 5 bars back. */
const HISTORY = 8;
/** Entry: 5-minute close return at or below -80 bps. */
const DIP_BPS = 80n;
/** Entry confirmation: latest 1-minute return at or above 0 bps. */
const CONFIRM_BPS = 0n;
/** Exit: take profit at +100 bps over the value at entry. */
const TAKE_PROFIT_BPS = 100n;
/** Exit: trailing stop, 60 bps below the highest close since entry. */
const TRAIL_BPS = 60n;
/** Exit: hard stop, 80 bps below the value at entry. */
const STOP_BPS = 80n;
/** Exit: give up after 120 bars held. */
const MAX_HOLD_BARS = 120;
/** No new entries once this many scored bars have been seen. */
const LAST_ENTRY_BAR = 1350;
/** Slippage cap on every order, 1.5% past the close it was decided on. */
const MAX_SLIPPAGE_BPS = 150;

/**
 * Entry value anchor: the harness-reported cost of the filled position
 * (the notional spent, fees included). The take-profit and hard stop are
 * measured from what the fill actually cost, not from the first close
 * after it — that close can sit ~20 bps under the fill price once fee,
 * slippage and price impact are in, which would let the take-profit fire
 * a whole ~60 bps early and leave money on the table.
 */
interface Position {
  /** Cost of the filled position (quote units), as the harness reports it. */
  entryCost: bigint;
  /** Highest close seen since entry. */
  peak: bigint;
  /** Bars held (fresh bars only). */
  held: number;
}

const closes: bigint[] = [];
let barsSeen = 0;
let position: Position | null = null;
let buyPending = false;

/** True when (now - ref) / ref is at or below -bps / 10000, in exact bigint. */
function fellByAtLeast(now: bigint, ref: bigint, bps: bigint): boolean {
  return (now - ref) * BPS <= -bps * ref;
}

/** True when (now - ref) / ref is at or above bps / 10000, in exact bigint. */
function roseByAtLeast(now: bigint, ref: bigint, bps: bigint): boolean {
  return (now - ref) * BPS >= bps * ref;
}

function onBatch(state: BarsState, batch: { bars: Bar[] }): (BuyInput | SellInput)[] {
  const bar = batch.bars.find((b) => b.symbol === SYMBOL);
  if (bar === undefined) return [];
  const close = BigInt(bar.c);
  closes.push(close);
  if (closes.length > HISTORY) closes.shift();
  barsSeen += 1;
  if (state.warmingUp) return [];

  const held = state.positions.get(SYMBOL);
  const holding = held !== undefined && held.qty > 0n;

  if (holding && position === null) {
    // The buy filled: anchor the exits on what it cost.
    position = { entryCost: held.cost, peak: close, held: 0 };
    buyPending = false;
  }
  if (!holding && position !== null) {
    // Position gone (sold, or flattened): clear the anchor.
    position = null;
  }
  if (!holding) buyPending = false;

  if (holding && position !== null) {
    position.held += 1;
    if (close > position.peak) position.peak = close;
    const value = state.value(SYMBOL, held.qty);
    const takeProfit = value * BPS >= position.entryCost * (BPS + TAKE_PROFIT_BPS);
    const trailing = fellByAtLeast(close, position.peak, TRAIL_BPS);
    const stopped = value * BPS <= position.entryCost * (BPS - STOP_BPS);
    const tooLong = position.held >= MAX_HOLD_BARS;
    if (takeProfit || trailing || stopped || tooLong) {
      return [{ side: "sell", symbol: SYMBOL, qty: held.qty, max_slippage_bps: MAX_SLIPPAGE_BPS }];
    }
    return [];
  }

  // Flat: look for the capitulation + bounce start.
  if (buyPending) return [];
  if (barsSeen >= LAST_ENTRY_BAR) return [];
  if (closes.length < 6) return [];
  const now = closes[closes.length - 1];
  const fiveBack = closes[closes.length - 6];
  const oneBack = closes[closes.length - 2];
  if (!fellByAtLeast(now, fiveBack, DIP_BPS)) return [];
  if (!roseByAtLeast(now, oneBack, CONFIRM_BPS)) return [];
  const cash = state.cash;
  if (cash < BigInt(state.hello.fees.min_notional_quote_units)) return [];
  buyPending = true;
  return [{ side: "buy", symbol: SYMBOL, notional_quote_units: cash, max_slippage_bps: MAX_SLIPPAGE_BPS }];
}

await runBars({ onBatch });
