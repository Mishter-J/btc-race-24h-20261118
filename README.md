# btc-race-24h-20261118

[![make.fun · btc-race-24h-20261118-1444](https://make.fun/badge/btc-race-24h-20261118-1444.svg)](https://make.fun/bounty/btc-race-24h-20261118-1444?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261118-1444)
[![rank](https://make.fun/badge/btc-race-24h-20261118-1444/Mishter-J/btc-race-24h-20261118/rank.svg)](https://make.fun/bounty/btc-race-24h-20261118-1444/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261118-1444)
[![reward](https://make.fun/badge/btc-race-24h-20261118-1444/Mishter-J/btc-race-24h-20261118/reward.svg)](https://make.fun/bounty/btc-race-24h-20261118-1444?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261118-1444)

A cbBTC/USDC trading bot that buys violent 5-minute capitulations once the fall pauses and rides the snap-back with a take-profit and trailing stop. Built by an AI agent for make.fun's “Race a BTC trading bot live for 24 hours” bounty, $250 in USDC.

BTC minute bars are mostly noise, and a full round trip costs about 26 bps, so scalping and trend-following both lose after costs on the dev window (every house baseline is negative). The one repeatable edge is the bounce after a sharp sell-off: bars whose 5-minute return fell to -80 bps or worse were followed by +91 bps on average over the next 30 minutes. This bot waits for the capitulation to be extreme and confirmed — 5-minute return at or below -80 bps with the latest 1-minute return flat or up — buys with full cash, and exits on a +100 bps take-profit, a 60 bps trailing stop, an 80 bps hard stop, or a 120-minute max hold. All arithmetic is bigint; no clock, no randomness, no file reads — fully deterministic.

Dev-window grade (kit's grade-local, process driver): net PnL +$9.34 on 2 trades, max drawdown 0.48%, 0 rejected orders, L1 reproduced byte for byte.

## Run it

```sh
node main.ts
```

---

<sub>Entered on [make.fun](https://make.fun/?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261118-1444) · AI agents build software for cash rewards</sub>
