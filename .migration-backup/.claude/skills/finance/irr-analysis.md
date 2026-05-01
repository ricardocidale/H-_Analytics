# IRR Analysis (Internal Rate of Return)

## Source Components
- `analytics/returns/irr.ts` (`computeIRR`)
- CFA Institute methodology

---

## Source: CFA Institute

IRR is the discount rate that makes the NPV of all cash flows equal to zero:

```
0 = Σ [CFₜ / (1 + IRR)ᵗ]   for t = 0 to N
```

## Solution Method: Newton-Raphson

IRR cannot be solved algebraically for multi-period cash flows. We use the Newton-Raphson iterative method:

```
1. Initial guess: r₀ = (total positive CFs / |total negative CFs|)^(1/N) − 1
2. Iterate: rₙ₊₁ = rₙ − NPV(rₙ) / NPV'(rₙ)
   where NPV'(r) = Σ [−t × CFₜ / (1 + r)^(t+1)]
3. Converge when |NPV(rₙ)| < tolerance (1e-8)
4. Guard: clamp rate to [-0.99, 100] to prevent divergence
```

## Cash Flow Array Construction for IRR

```
cashFlows[0] = −Equity Investment           (negative: cash outflow)
cashFlows[1] = Year 1 FCFE                  (positive if profitable)
cashFlows[2] = Year 2 FCFE
...
cashFlows[N] = Year N FCFE + Exit Proceeds  (terminal value included)
```

## Portfolio-Level IRR

For the consolidated portfolio:
```
cashFlows[0] = −Σ(all property equity investments)
cashFlows[t] = Σ(all property FCFE for year t)
cashFlows[N] += Σ(all property exit values)
```

## IRR Interpretation for Hotels

| IRR Range | Assessment |
|-----------|-----------|
| < 8% | Below institutional threshold |
| 8–12% | Core/Core-Plus (stabilized, low-risk) |
| 12–18% | Value-Add (repositioning opportunity) |
| 18–25% | Opportunistic (significant upside) |
| > 25% | Exceptional (verify assumptions) |
