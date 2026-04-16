# Replit: Redesign The Analyst Working State

> This is the most important animation in the app. When investors see this, they should think "I've never seen software do this."

## What's Wrong Now

The "Consulting sources" modal is a generic checklist:
```
○ Analyzing company context
○ Processing ICP profile
○ Benchmarking fee structures
```

This looks like a file download. The user is trapped in a dimmed modal watching checkboxes fill in. No personality, no intelligence, no sense of what's being discovered.

## What It Should Be

The Analyst is a brilliant colleague working at a whiteboard. You can see them thinking. You're not bored — you're impressed.

---

## Component: `AnalystWorkingView`

Replace the modal with an inline section that takes over the property page content area. The user stays on the page — research results appear as they arrive.

### Layout (3 zones)

```
┌─────────────────────────────────────────────────────────┐
│  ZONE 1: Analyst Header                                  │
│  ┌────┐  "The Analyst is studying Jano Grande Ranch"     │
│  │ ◉  │  ████████░░░░░ 4 of 6 sources                   │
│  └────┘  47 data points gathered · ~45s remaining        │
├─────────────────────────────────────────────────────────┤
│  ZONE 2: Discovery Feed (scrolling, BlurFade each line)  │
│                                                          │
│  "Studying the Colombia hospitality market...            │
│   boutique properties in El Poblado average              │
│   $180–$240 ADR with 62% occupancy during high season"   │
│                                                          │
│  "Comparing your cost structure against                  │
│   ISHC 2024 benchmarks for 20-room properties..."        │
│                                                          │
│  "3 comparable properties identified within              │
│   the Medellín metro area"                               │
│                                                          │
│  "Exit cap rates in Colombia commercial real estate      │
│   have compressed 80bps since 2023..."                   │
│                                                          │
├─────────────────────────────────────────────────────────┤
│  ZONE 3: Source Connections (animated)                    │
│                                                          │
│  [FRED] ──beam──┐                                        │
│  [Benchmarks] ──beam──→ [The Analyst] ──→ [Ranges]      │
│  [Pinecone] ──beam──┘                                    │
│  [Web Research] ··· (waiting)                            │
└─────────────────────────────────────────────────────────┘
```

### Zone 1: Analyst Header

```tsx
<div className="flex items-center gap-4 p-6 border-b border-border/50">
  {/* Analyst avatar with pulse animation */}
  <div className="relative">
    <div className="w-12 h-12 rounded-full bg-amber-500/20 flex items-center justify-center">
      <Brain className="w-6 h-6 text-amber-500" />
    </div>
    <Ripple className="absolute inset-0" /> {/* from magic-ui */}
  </div>
  
  <div className="flex-1">
    <h3 className="text-lg font-semibold">
      The Analyst is studying {propertyName}
    </h3>
    <div className="flex items-center gap-3 text-sm text-muted-foreground mt-1">
      <Progress value={progress} className="w-32 h-1.5" />
      <span>{completedSources} of {totalSources} sources</span>
      <span>·</span>
      <NumberTicker value={dataPointCount} /> {/* from magic-ui */}
      <span>data points gathered</span>
      <span>·</span>
      <span>~{remainingSeconds}s remaining</span>
    </div>
  </div>
</div>
```

### Zone 2: Discovery Feed

The SSE stream from the research endpoint sends progress events. Instead of showing them as checkboxes, render them as The Analyst's observations:

```tsx
<div className="p-6 space-y-4 max-h-[400px] overflow-y-auto">
  {discoveries.map((discovery, i) => (
    <BlurFade key={i} delay={i * 0.15}> {/* from magic-ui */}
      <div className="flex gap-3">
        <div className="w-1.5 h-1.5 rounded-full bg-amber-500 mt-2 shrink-0" />
        <p className="text-sm text-foreground/80 leading-relaxed italic">
          "{discovery.text}"
        </p>
      </div>
    </BlurFade>
  ))}
  
  {/* Typing indicator while waiting for next discovery */}
  {isWaiting && (
    <div className="flex gap-1.5 ml-5">
      <span className="w-1.5 h-1.5 rounded-full bg-amber-500/60 animate-bounce" 
            style={{ animationDelay: '0ms' }} />
      <span className="w-1.5 h-1.5 rounded-full bg-amber-500/60 animate-bounce" 
            style={{ animationDelay: '150ms' }} />
      <span className="w-1.5 h-1.5 rounded-full bg-amber-500/60 animate-bounce" 
            style={{ animationDelay: '300ms' }} />
    </div>
  )}
</div>
```

### Zone 3: Source Connection Animation

Use `AnimatedBeam` from magic-ui to show data flowing from sources to The Analyst:

```tsx
<div className="p-6 border-t border-border/50 relative" ref={containerRef}>
  <div className="flex justify-between items-center">
    {/* Source nodes (left side) */}
    <div className="space-y-3">
      {sources.map(source => (
        <div key={source.key} ref={source.ref}
             className={cn(
               "flex items-center gap-2 text-xs px-3 py-1.5 rounded-full border",
               source.status === "complete" ? "border-green-500/30 text-green-400" :
               source.status === "active" ? "border-amber-500/30 text-amber-400" :
               "border-border/30 text-muted-foreground"
             )}>
          {source.icon}
          <span>{source.label}</span>
          {source.status === "complete" && <Check className="w-3 h-3" />}
        </div>
      ))}
    </div>
    
    {/* Analyst node (center) */}
    <div ref={analystRef} className="relative">
      <div className="w-16 h-16 rounded-full bg-amber-500/10 border border-amber-500/30 
                      flex items-center justify-center">
        <Brain className="w-8 h-8 text-amber-500" />
      </div>
      <Particles className="absolute inset-0" quantity={8} size={0.8} />
    </div>
    
    {/* Output node (right) */}
    <div ref={outputRef} className="text-xs text-muted-foreground">
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-full border border-border/30">
        <BarChart3 className="w-3 h-3" />
        <span>Ranges</span>
      </div>
    </div>
  </div>
  
  {/* Animated beams from each active/complete source to Analyst */}
  {sources.filter(s => s.status !== "waiting").map(source => (
    <AnimatedBeam
      key={source.key}
      containerRef={containerRef}
      fromRef={source.ref}
      toRef={analystRef}
      gradientStartColor={source.status === "complete" ? "#22c55e" : "#f59e0b"}
      gradientStopColor="#f59e0b"
    />
  ))}
  
  {/* Beam from Analyst to output */}
  <AnimatedBeam
    containerRef={containerRef}
    fromRef={analystRef}
    toRef={outputRef}
    gradientStartColor="#f59e0b"
    gradientStopColor="#22c55e"
  />
</div>
```

## Discovery Text — Where It Comes From

The research SSE stream already sends progress events. Map them to human language:

| SSE Event | Current Display | New Discovery Text |
|-----------|----------------|-------------------|
| `source_started: fred` | "○ Fetching FRED data" | "Pulling current interest rates and economic indicators..." |
| `source_started: benchmarks` | "○ Loading benchmarks" | "Comparing against ISHC 2024 hospitality benchmarks for {roomCount}-room {qualityTier} properties..." |
| `source_started: pinecone` | "○ Searching vectors" | "Searching for comparable properties in the {market} market..." |
| `source_complete: fred` | "✓ FRED data" | "Federal funds rate at {rate}% — factored into financing assumptions" |
| `source_complete: benchmarks` | "✓ Benchmarks loaded" | "Found {count} matching benchmarks — {segment} properties averaging {metric}" |
| `source_complete: pinecone` | "✓ Vector search" | "{count} comparable properties identified within {radius}" |
| `llm_thinking` | "○ Analyzing..." | "Synthesizing {sourceCount} data points across {sourceNames}..." |
| `range_computed: startAdr` | (not shown) | "ADR range: ${low}–${high} ({conviction} conviction)" |
| `range_computed: exitCapRate` | (not shown) | "Exit cap rate: {low}%–{high}% based on {source}" |

**Key rule:** Show what The Analyst FOUND, not what it's DOING. Discoveries, not process steps.

## After Research Completes

Don't show a "Done!" modal. Instead:

1. The discovery feed shows a final line: "Review complete — {fieldCount} assumptions validated, {flagCount} flagged for review"
2. Zone 3 beams all turn green
3. After 2 seconds, the working view smoothly collapses (height animation)
4. Range badges appear on each field in the edit form with `BlurFade` — one by one, top to bottom, 100ms stagger
5. Any flagged fields get a subtle red pulse once

## Existing Components to Use

All of these are already in the codebase (`client/src/components/ui/`):
- `BlurFade` — blur-in reveal for each discovery line
- `AnimatedBeam` — SVG beams connecting source refs to Analyst node  
- `Particles` — subtle particle background on the Analyst node
- `NumberTicker` — spring-physics counter for "47 data points gathered"
- `Ripple` — expanding ring on the Analyst avatar
- `ShimmerButton` — for the "Ask the Analyst" trigger button
- `FadeIn`, `FadeInUp` — for the result reveal after completion

## NOT a Modal

This is NOT a modal dialog. It's an inline section that replaces the property edit content while research runs. The user can:
- Scroll through discoveries as they appear
- See the property header and navigation above
- Leave the page (research continues in background)
- Come back later and see results

## Voice

All text in this component uses The Analyst voice:
- Human verbs: "studying", "comparing", "reviewing", "investigating"
- NOT: "processing", "loading", "fetching", "computing"
- Specific numbers when available: "47 data points" not "data loaded"
- Market-specific context: "Colombia hospitality market" not "market data"
- Conviction language: "High conviction" not "confidence: 0.85"

## Dark Theme (Noir)

The working view should feel premium — dark card background, amber accent for The Analyst, green for completed sources, subtle glow effects. Match the noir theme from `.claude/brand-voice-guidelines.md`.
