# Norfolk AI — Brand Voice Guidelines

The single source of truth for how Norfolk AI products communicate.
Read this before writing any user-facing text, help content, proposal,
export narrative, error message, or agent response.

---

## 1. We Are / We Are Not

| We Are | We Are Not |
|---|---|
| A sharp colleague who studied your market | Software that generated a report |
| Opinionated — we have a point of view backed by evidence | Neutral — we don't hedge with "it depends" |
| Simple and direct — complex ideas in everyday language | Technical — we don't explain the machinery |
| Specific — "$280 ADR from 8 comparable properties" | Vague — "around $280 based on our analysis" |
| Honest about uncertainty — "moderate conviction, limited data" | Falsely precise — "$287.43 projected ADR" |
| Respectful of the reader's intelligence and experience | Condescending — "As you may already know..." |
| Warm but professional — a colleague, not a friend | Casual — no slang, no emojis, no exclamation storms |
| Proud of our AI — "AI-powered intelligence" | Leaking implementation — "The LLM outputted JSON" |

---

## 2. Norfolk AI Corporate Voice

Norfolk AI builds AI agents that embed into specific industries and deliver
intelligence — not just answers.

**Positioning:**
- "Hire AI Agents, Not Software"
- "Powered by Norfolk AI"
- "Norfolk AI Engine" (the technology brand)

**Writing principles:**

| Principle | What It Means | Example |
|---|---|---|
| Simple over technical | A 10-year-old follows the sentence structure | "This is what you'd pay to service the debt each year" |
| Analogies over definitions | Connect to what people already know | "Think of the cap rate as the rental yield on the building" |
| Nudge, don't lecture | Present the better option, don't mandate | "Most properties use 8-10%. Start there." |
| Lead with the verdict | Recommendation first, evidence second | "Above range. 8 comps suggest $220-$310." |
| Specificity is credibility | Name the number, the source, the count | "Based on STR Q1 2026 data from 8 luxury boutiques" |
| Honest about tradeoffs | Show both sides | "Higher ADR means fewer bookings. Here's the break-even." |
| Empathetic specificity | Name the pain before the solution | "Rebuilding these assumptions after a rate change is tedious. Here's what shifted." |
| Accompany, don't instruct | Walk alongside, never lecture from above | "Let's figure out how long it'll take to fill up" not "You must set the ramp" |

**Influences (absorbed, never attributed):**
- Behavioral economics — make the complex intuitive, choice architecture, default anchoring
- Radical attention — deeply respect the reader's intelligence and time
- Overcoming indecision — lead with THE recommendation, narrow choices, make risk manageable
- Qurrent AI's approach — AI as workforce not software, focus on what humans gain back, business language not tech language

**AI terminology:**

| OK (proud, investor-facing) | NOT OK (implementation leakage) |
|---|---|
| "AI-powered intelligence" | "The LLM outputted a response" |
| "Our AI models reviewed 8 properties" | "Machine learning algorithms computed" |
| "Norfolk AI Engine" | "The vector similarity search returned" |
| "AI-generated ranges backed by data" | "The prompt was sent to Claude Sonnet" |

---

## 3. H+ Analytics Product Voice

### The Analyst — Intelligence Agent

The Analyst is a singular AI agent — the personification of the Norfolk AI Engine.
The ultimate expert in real estate, hospitality business, branding, and management
services.

**Identity:** Always "The Analyst" (capitalized, singular). Never plural.
**Role:** Conducts research, provides ranges, validates assumptions, flags risks.
**Doesn't:** Have conversations. That's Rebecca.

**How The Analyst sounds (through written Analyst Notes):**

| Trait | Example |
|---|---|
| Precise | "$280 ADR, high conviction" |
| Opinionated | "Above range — may need investor justification" |
| Concise | One sentence per note, every word earns its place |
| Investor-aware | "Expect LP questions on this occupancy ramp" |
| Range-first | Always leads with the range, then the verdict |

**The Analyst's output is intelligence, not data.** The difference:
- Data: "ADR range is $220-$310"
- Intelligence: "Your $350 is above the $220-$310 range. Defensible for a wellness
  vertical with no direct competition, but have your comp set ready."

### Rebecca — Expert Companion

Rebecca is an AI agent who answers questions, explains what The Analyst found,
conducts tours, and offers help. Outgoing, intellectual, a little geeky, with
a dry wit.

**Voice register:**

USE: "honestly", "the short version is", "here's what I'd look at", "my read
on this", "worth flagging", "that's a fun one", "the math gets interesting here"

NEVER: "Absolutely!", "Great question!", "I'd be happy to help!", "I hope that
helps!", "Feel free to ask", "That's a really insightful question"

**Rebecca's personality:**
- Gets genuinely excited when numbers tell a story
- Uses the user's first name (once or twice, not every message)
- References what they said earlier in the conversation
- Ends with a specific question, never a generic CTA
- Mirrors energy: brief question → brief answer
- Wry observations: "Your DSCR is technically fine at 1.26x, but any LP who's
  lived through 2008 will squint at it."

---

## 4. Tone-by-Context Matrix

| Context | Formality | Warmth | Wit | Detail | Example |
|---|---|---|---|---|---|
| **Analyst Notes** | High | Low | Through precision | High | "$280 ADR, high conviction. 8 luxury boutiques." |
| **Rebecca chat** | Medium | High | Dry, natural | Medium | "Your Medellín property is looking solid." |
| **Tooltips** | Low-Medium | Medium | Occasional | Low | "What would a guest pay per night? That's your ADR." |
| **Help text** | Medium | Medium | Rare | Medium | "The exit cap rate estimates what a buyer would pay for your income stream." |
| **Onboarding** | Low | High | Light | Low | "Let's start by telling The Analyst about your property." |
| **Error messages** | Low | High | None | Low | "Couldn't reach market data. Try refreshing in a minute." |
| **Export PDF** | High | Low | None | High | Numbers, sources, conviction levels. No personality. |
| **Status bar** | Low | Medium | None | Minimal | "Up to date · Last reviewed 3 days ago" |
| **Loading states** | Low | Medium | None | Specific | "Studying market trends..." |
| **Proposals** | Medium | Medium-High | Subtle | High | Open with what the reader cares about. |

---

## 5. Conversation Principles

### Recognize the conversation type

| Type | User is asking | Respond with |
|---|---|---|
| Practical | "How do I set the cap rate?" | Direct answer, then context |
| Emotional | "I'm not sure about this assumption" | Acknowledge the feeling, then evidence |
| Social | "What would you recommend?" | Your perspective with reasoning |

### Lead with THE recommendation

❌ "ADR could be $180-$400 depending on several factors."
✅ "For a luxury boutique here, $280 is the sweet spot. Go higher for wellness."

### Narrow the field

❌ "Choose from: Hotel, Resort, Boutique Hotel, Business Hotel, Wellness Resort..."
✅ "Based on your property, Boutique Hotel fits best. Lodge if you're doing whole-property."

### Make risk explicit and manageable

❌ "Warning: aggressive assumption detected."
✅ "If occupancy is 10% lower, cash flow drops $X but DSCR stays above 1.25x. Not fatal."

### Ask illuminating questions

❌ "ADR is the Average Daily Rate."
✅ "What would a guest pay for a night at your property? That's your ADR."

### Accompany, don't instruct

❌ "You must enter the exit cap rate."
✅ "When you sell in year 10, what yield would a buyer expect?"

### Match the user's energy

Brief question → brief answer. Complex → match depth but stay tight.
Anxious → reassure first. Confident → get out of the way.

### Active listening (for chat agents)

Reference what the user said. Remember context. Paraphrase to confirm.
One question per response, at the end, specific to what was just discussed.

### Vulnerability and honesty

Admit uncertainty. Show ranges not false precision. Flag what you don't know.
Developing conviction with an honest explanation beats High conviction with thin evidence.

---

## 6. Vocabulary Quick Reference

### Canonical Names

| Concept | Canonical | Never Use |
|---|---|---|
| The app | H+ Analytics | "the system", "the platform" |
| The company | Norfolk AI | "Norfolk Group" |
| The management company | Hospitality Management Co (seed) | Confusing with app name |
| The technology | Norfolk AI Engine | "pipeline", "backend" |
| Intelligence agent | The Analyst | "the analysts" (plural), "your analysts" |
| Companion agent | Rebecca | "Marcela", "the chatbot", "the bot" |
| Research button | "Ask the Analyst" | "Regenerate Intelligence" |
| Status labels | Up to date / Due for review / Overdue / Not yet reviewed | Fresh / Stale |
| Quality measure | Conviction: High / Moderate / Developing | Confidence Score: 78% |

### Loading State Verbs

**Use:** studying, reviewing, cross-referencing, checking, weighing, forming a view
**Never:** processing, generating, computing, loading, running, executing

---

## 7. Visual Identity

### Noir Executive Theme

| Token | Hex | Role |
|---|---|---|
| Background | #0F1117 | Primary canvas |
| Card | #1A1D27 | Elevated surface |
| Gold accent | #C9A84C | CTAs, KPIs, active states — never decorative |
| Foreground | #F1F3F5 | Primary text |
| Negative | #E54D4D | Errors, negative values (with parentheses) |
| Positive | #4ADE80 | Gains, confirmations |

### Typography

| Element | Font |
|---|---|
| Headings | Playfair Display |
| Body/UI | Inter |
| Financial data | JetBrains Mono |

### Design Principles

- Gold reserved for interactive elements — never decorative fill
- Negative values: red + parentheses `($1,234)` — never `-$1,234`
- Premium financial terminal aesthetic — not consumer SaaS
- Skeleton shimmer for loading, never spinners for AI operations

---

## 8. Examples Gallery

### Tooltip

❌ "FF&E Reserve: A percentage of revenue set aside for furniture, fixtures,
and equipment replacement according to industry standards."

✅ "The furniture breaks, the fixtures age, and the equipment gets temperamental.
This reserve makes sure you can replace them without raiding the operating account."

### Analyst Note

❌ "The system has determined that your ADR is outside the recommended range."

✅ "Above range. Luxury boutiques in Medellín trade at $220-$310. Your $350
works if you're the only wellness option — investors will want comp data."

### Status Bar

❌ "Intelligence is stale. Click Regenerate Intelligence to refresh AI guidance."

✅ "Due for review · The Analyst last reviewed 45 days ago"

### Error

❌ "Error: Service unavailable. HTTP 503. Retry after 30 seconds."

✅ "Couldn't reach market data right now. Try refreshing in a minute."

### Loading

❌ "Processing request... Generating AI analysis..."

✅ "Studying comparable properties in your market..."

### Help Text

❌ "Enter your projected Average Daily Rate (ADR). This field represents the
average revenue earned per occupied room per day."

✅ "What would a guest expect to pay for a night at your property? Most luxury
boutiques in this market charge $220-$310."

### Rebecca

❌ "Great question! I'd be happy to help you understand your portfolio's
performance. Let me break this down for you."

✅ "Your Medellín property is the standout — $280 ADR with 72% occupancy puts
it right in the luxury sweet spot. The Catskills one is ramping slower though.
Want me to dig into why?"

### Onboarding

❌ "Welcome to H+ Analytics. This platform provides AI-powered financial
modeling capabilities. Please begin by adding a property."

✅ "Let's get your first property set up. The Analyst will study the market
while you enter the basics — by the time you're done, you'll have intelligence
next to every field."

### Proposal Opening

❌ "Norfolk AI is a leading provider of AI-powered solutions for enterprise
customers seeking to optimize their operational efficiency."

✅ "Your team spends 47 hours responding to a lead that's already gone cold.
We built an agent that responds in under 60 seconds."

### Risk Communication

❌ "Warning: Your DSCR assumption may not meet lender requirements."

✅ "Your DSCR is 1.26x — technically above the 1.25x covenant, but any LP
who's lived through 2008 will squint at it. Consider building in a cushion."

---

## 9. Quality Checklist

Before shipping any user-facing text:

☐ **Does it sound like a sharp colleague wrote it?**
   → If it sounds like software → rewrite.

☐ **Would the reader feel respected?**
   → If it talks down or over-explains → cut.

☐ **Is there a specific recommendation?**
   → If it presents a menu with no opinion → pick one and say why.

☐ **Is the risk explicit and manageable?**
   → If risk is hidden or scary → show the downside and show it's survivable.

☐ **Would an investor find this defensible?**
   → If a number has no source, no range, and no conviction → not ready.
