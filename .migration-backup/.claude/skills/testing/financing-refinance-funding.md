# Testing: Financing, Refinancing, and Funding Instruments

## Scope
Tests for acquisition debt sizing, closing costs, amortization schedules, refinancing mechanics, and funding instrument (SAFE/Seed) deployment.

## Entity Level
**Individual Property** (financing/refinance) + **Management Company** (funding instruments).

---

## Financing Tests — `tests/financing/` (20 tests)

### Acquisition Loan Sizing — `tests/financing/sizing.test.ts` (7 tests)
| Test | What It Proves |
|------|---------------|
| Sizes loan by LTV | LTV × purchase price |
| Handles low LTV | Conservative leverage |
| Handles 100% LTV | Full leverage |
| Uses override amount directly | Manual loan sizing |
| Override can exceed LTV-equivalent | Override flexibility |

### Closing Costs — `tests/financing/closing-costs.test.ts` (5 tests)
| Test | What It Proves |
|------|---------------|
| Computes pct-based costs | Percentage of loan amount |
| Computes fixed fees | Flat dollar fees |
| Combines pct and fixed fees | Mixed cost structure |
| Handles zero costs | Edge case |
| Rounds fractional costs | Rounding precision |

### Financing Calculator — `tests/financing/financing-calculator.test.ts` (4 tests + journal hooks)
Tests `computeFinancing()` — full acquisition financing with amortization schedule.

| Test | What It Proves |
|------|---------------|
| Fully amortizing schedule produced | Schedule completeness |
| Loan net = gross - closing costs | Net proceeds identity |
| IO-then-amort schedule generated | Interest-only period handling |
| Balance unchanged during IO period | IO mechanics |
| Includes reserves in equity required | Operating reserve sizing |
| Uses override instead of LTV | Override path |
| Journal hooks contain PROPERTY and DEBT | Ledger integration |
| PROPERTY debit = purchase price | Asset recording |
| EQUITY credit = equity required | Equity recording |

### Financing Golden — `tests/financing/golden.test.ts` (4 tests)
| Test | What It Proves |
|------|---------------|
| Matches hand-calculated values | End-to-end accuracy |
| Schedule roll-forward consistent | Month-over-month integrity |
| Journal hooks expected accounts | Ledger completeness |
| DEBT_ACQUISITION credit = gross loan | Debt recording |

---

## Refinancing Tests — `tests/refinance/` (35 tests)

### Refi Sizing — `tests/refinance/sizing.test.ts` (7 tests)
| Test | What It Proves |
|------|---------------|
| Sizes refi loan from NOI cap valuation × LTV | Refi loan formula |
| Calculates net proceeds after closing costs | Net proceeds |
| Handles cash-neutral refi (no excess proceeds) | Break-even refi |

### Refi Schedule — `tests/refinance/schedule.test.ts`
| Test | What It Proves |
|------|---------------|
| New amortization schedule starts from refi month | Schedule restart |
| Old loan balance extinguished | ASC 470-50 derecognition |
| New loan balance = refi gross amount | New debt recording |

### Refi Calculator — `tests/refinance/refinance-calculator.test.ts`
| Test | What It Proves |
|------|---------------|
| Full refi mechanics from sizing through schedule | End-to-end |
| Closing costs deducted from gross proceeds | Cost handling |

### Refi Flags — `tests/refinance/flags.test.ts` (10 tests)
| Test | What It Proves |
|------|---------------|
| Refi flag triggers at correct month | Timing accuracy |
| No refi when disabled | Feature toggle |
| Refi respects minimum hold period | Gate enforcement |

### Payoff — `tests/refinance/payoff.test.ts` (5 tests)
| Test | What It Proves |
|------|---------------|
| Payoff amount = remaining balance | Exit debt clearing |
| Prepayment penalty calculated correctly | Penalty mechanics |

### Refi Golden — `tests/refinance/golden.test.ts` (4 tests)
| Test | What It Proves |
|------|---------------|
| Full lifecycle: acquire → operate → refi → operate | End-to-end |
| Cash-out proceeds flow to cash balance | Cash impact |
| New debt replaces old debt exactly | Debt swap |
| Deferred financing costs = closing costs | ASC 835-30 |

---

## Funding Tests — `tests/funding/` (25 tests)

### Funding Engine — `tests/funding/funding-engine.test.ts`
| Test | What It Proves |
|------|---------------|
| SAFE tranche 1 deploys on schedule | Timing accuracy |
| SAFE tranche 2 deploys on schedule | Second tranche timing |
| Total funding = tranche 1 + tranche 2 | Sum identity |

### Gates — `tests/funding/gates.test.ts`
| Test | What It Proves |
|------|---------------|
| Minimum raise gate blocks if under threshold | Gate enforcement |
| Valuation cap gate applies correctly | Cap mechanics |

### Equity Rollforward — `tests/funding/equity-rollforward.test.ts` (6 tests)
| Test | What It Proves |
|------|---------------|
| Beginning + contributions - distributions = ending | Rollforward identity |
| Retained earnings flows correctly | IS → equity linkage |

### Timeline — `tests/funding/timeline.test.ts`
| Test | What It Proves |
|------|---------------|
| On-acquisition trigger resolves date | Date linkage |
| Conditional trigger uses fallback | Fallback logic |

### Funding Golden — `tests/funding/golden.test.ts`
Full lifecycle test of funding instrument deployment and returns.

---

## Run Commands
```bash
npx vitest run tests/financing/                        # Acquisition financing (20 tests)
npx vitest run tests/refinance/                        # Refinancing (35 tests)
npx vitest run tests/funding/                          # Funding instruments (25 tests)
npx vitest run tests/financing/sizing.test.ts          # Loan sizing only
npx vitest run tests/refinance/refinance-calculator.test.ts  # Refi calculator only
npx vitest run tests/funding/funding-engine.test.ts    # Funding engine only
```

## Related Skills
- `.claude/skills/finance/calculation-chain.md` — How financing feeds into pro forma
- `.claude/skills/finance/cash-line-architecture.md` — Cash flow mechanics with debt
- `.claude/skills/finance/balance-sheet.md` — Deferred financing costs asset treatment (ASC 835-30)
