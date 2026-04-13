# Marcela & ElevenLabs Restoration Guide

**Date**: 2026-03-16
**Planned by**: Claude Code Opus 4.6 (Anthropic)
**Status**: Use when Marcela is ready to come back online
**Companion document**: `.claude/plans/MARCELA-ISOLATION.md` — describes the isolation that this guide reverses

---

## For Replit Agent

This guide reverses the 8 changes made during Marcela isolation. Every change below corresponds to a numbered change in `MARCELA-ISOLATION.md`. The goal is to bring the ElevenLabs voice agent back to full operation while keeping the app stable.

**Do not rush this.** Verify after each step. External dependencies (ElevenLabs API, Twilio, NPM packages) may have changed during the isolation period — check them before restoring code paths that call them.

---

## Before You Start

### Pre-Restoration Checklist

Complete these checks BEFORE making any code changes:

#### 1. Verify ElevenLabs Account & Agent

```
Go to: https://elevenlabs.io/app/conversational-ai
Check:
  □ Account is active and in good standing
  □ API key is valid (test with curl or Postman)
  □ Agent still exists (match ID in Replit Secrets with dashboard)
  □ Agent hasn't been archived or deleted
  □ Billing/credits are sufficient
```

If the agent was deleted, you'll need to create a new one and update the `ELEVENLABS_AGENT_ID` secret in Replit.

#### 2. Verify Replit Secrets

```
Go to: Replit Secrets panel (padlock icon)
Check each secret exists and is non-empty:
  □ ELEVENLABS_API_KEY        — ElevenLabs API credentials
  □ ELEVENLABS_AGENT_ID       — Conversational AI agent ID (if stored as secret)
  □ MARCELA_TOOLS_SECRET      — Bearer token for tool endpoints
```

If Twilio telephony will also be restored:
```
  □ TWILIO_ACCOUNT_SID        — Twilio account
  □ TWILIO_AUTH_TOKEN          — Twilio auth
  □ TWILIO_PHONE_NUMBER        — Active phone number (verify in Twilio console)
```

#### 3. Verify NPM Package Compatibility

```bash
# Check current installed version
npm ls @elevenlabs/convai-widget-core

# Check if newer version is available
npm outdated @elevenlabs/convai-widget-core

# If major version changed, read changelog before updating:
# https://www.npmjs.com/package/@elevenlabs/convai-widget-core
```

If the package has breaking changes, you may need to update `ElevenLabsWidget.tsx` props before restoration. Do this as part of Step 2 below.

#### 4. Verify App Is Healthy

```bash
# All tests must pass BEFORE starting restoration
npm run test:summary

# Verification must be UNQUALIFIED
npm run verify:summary
```

If either fails, fix the issues first. Don't restore Marcela on top of a broken app.

---

## Restoration Steps

### Step 1: Restore ElevenLabs Widget Registration

**File:** `client/src/main.tsx`

**What to do:** Uncomment the widget registration block that was commented out during isolation.

**Find this (isolation state):**
```typescript
// MARCELA ISOLATED: ElevenLabs widget registration disabled.
// To restore: uncomment the block below.
// See .claude/plans/MARCELA-ISOLATION.md for full restoration guide.
/*
if (!customElements.get("elevenlabs-convai")) {
  import("@elevenlabs/convai-widget-core")
    .then(({ registerWidget }) => {
      if (!customElements.get("elevenlabs-convai")) {
        registerWidget("elevenlabs-convai");
        console.info("[ElevenLabs] Widget element registered");
      }
    })
    .catch(() => { /* ignore: widget registration optional */ });
}
*/
```

**Replace with:**
```typescript
if (!customElements.get("elevenlabs-convai")) {
  import("@elevenlabs/convai-widget-core")
    .then(({ registerWidget }) => {
      if (!customElements.get("elevenlabs-convai")) {
        registerWidget("elevenlabs-convai");
        console.info("[ElevenLabs] Widget element registered");
      }
    })
    .catch(() => { /* ignore: widget registration optional */ });
}
```

**What this does:** Loads the ElevenLabs SDK into the browser and registers the `<elevenlabs-convai>` custom element. This is the main entry point — without it, nothing ElevenLabs-related runs client-side.

**Verify:** Open the app in a browser, open DevTools Console. You should see `[ElevenLabs] Widget element registered`. If you see an error, the NPM package may need updating (see Pre-Restoration step 3).

---

### Step 2: Restore Marcela Widget in Layout

**File:** `client/src/components/Layout.tsx`

**What to do:** Remove the `return null;` early return and uncomment the original gating logic.

**Find this (isolation state):**
```typescript
function MarcelaWidgetGated() {
  // MARCELA ISOLATED: Widget always disabled.
  // To restore: remove the early return below.
  return null;

  // Original logic preserved for restoration:
  // const { data: global } = useGlobalAssumptions();
  // const { tourActive, promptVisible } = useWelcomeTour();
  // const [location] = useLocation();
  // const onAdminPage = location.startsWith("/admin");
  // const rebeccaActive = !!(global as any)?.rebeccaEnabled;
  // const enabled = !!(global as any)?.showAiAssistant && !!(global as any)?.marcelaEnabled && !rebeccaActive && !tourActive && !promptVisible && !onAdminPage;
  // return <ElevenLabsWidget enabled={enabled} />;
}
```

**Replace with:**
```typescript
function MarcelaWidgetGated() {
  const { data: global } = useGlobalAssumptions();
  const { tourActive, promptVisible } = useWelcomeTour();
  const [location] = useLocation();
  const onAdminPage = location.startsWith("/admin");
  const rebeccaActive = !!(global as any)?.rebeccaEnabled;
  const enabled = !!(global as any)?.showAiAssistant && !!(global as any)?.marcelaEnabled && !rebeccaActive && !tourActive && !promptVisible && !onAdminPage;
  return <ElevenLabsWidget enabled={enabled} />;
}
```

**What this does:** Restores the conditional rendering of the Marcela widget. It checks `showAiAssistant`, `marcelaEnabled`, and mutual exclusion with Rebecca before mounting the widget.

**Note on mutual exclusion:** The original logic has `!rebeccaActive` — meaning Marcela and Rebecca cannot both be active. If you want them to coexist, remove that check. Ask the project owner.

---

### Step 3: Restore Mutual Exclusion Logic (if desired)

**File:** `server/routes/admin/marcela.ts`

During isolation, the mutual exclusion was removed so Rebecca could operate independently. If you want Marcela and Rebecca to be mutually exclusive again (enabling one disables the other):

**Restore the save handler logic** in `POST /api/admin/voice-settings` that sets `rebeccaEnabled = false` when `marcelaEnabled = true`.

**If you want both to coexist:** Leave the isolation change in place. Both can be enabled independently. Ask the project owner which behavior they prefer.

**File:** `client/src/components/admin/AIAgentsTab.tsx`

If restoring mutual exclusion, restore the toggle bar that shows Marcela and Rebecca as an either/or choice. If allowing coexistence, both get independent toggles.

---

### Step 4: Remove "Disabled" Banner from Admin

**File:** `client/src/components/admin/AIAgentsTab.tsx`

**What to do:** Find and remove the amber isolation banner:

```tsx
// Remove this entire block:
<div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6">
  <div className="flex items-center gap-3">
    <Shield className="h-5 w-5 text-amber-600" />
    <div>
      <p className="font-display font-semibold text-amber-800">Marcela is temporarily disabled</p>
      <p className="text-sm text-amber-700 mt-1">
        The ElevenLabs voice agent is isolated while under maintenance.
        All configuration is preserved and will be restored when ready.
        Rebecca is the active AI agent.
      </p>
    </div>
  </div>
</div>
```

**What this does:** Removes the visual indicator that Marcela is offline. Admin sees the full Marcela configuration panel again.

---

### Step 5: Remove 503 Guards from Server Routes

**File:** `server/routes/admin/marcela.ts`

**What to do:** Find and remove all early-return blocks that were added during isolation:

```typescript
// Remove these blocks from each guarded endpoint:
if (true) { // MARCELA ISOLATED
  return res.status(503).json({ error: MARCELA_DISABLED_MSG, isolated: true });
}
```

Also remove the `MARCELA_DISABLED_MSG` constant if it was added.

**Endpoints to unguard:**
- `POST /api/marcela/scribe-token`
- `GET /api/marcela/signed-url`
- `GET /api/admin/convai/health`
- `POST /api/admin/convai/configure-tools`
- `PATCH /api/admin/convai/agent/prompt`
- `PATCH /api/admin/convai/agent/llm`
- `PATCH /api/admin/convai/agent/voice`
- `PATCH /api/admin/convai/agent/widget-settings`

**Verify:** After removing guards, test the health check:
```bash
curl -s http://localhost:5000/api/admin/convai/health \
  -H "Cookie: <admin-session-cookie>" | jq .
```
Expected: `{ "healthy": true, ... }` or a meaningful error about configuration.

---

### Step 6: Restore Twilio Voice Webhook

**File:** `server/routes/twilio.ts`

**What to do:** Find and remove the "temporarily unavailable" TwiML response from the incoming call handler:

```typescript
// Remove this block:
const twiml = new VoiceResponse();
twiml.say("The voice assistant is temporarily unavailable. Please try again later.");
twiml.hangup();
return res.type("text/xml").send(twiml.toString());
```

**Restore the original handler** that bridges Twilio audio to ElevenLabs conversational AI via WebSocket.

**Note:** Only do this if Twilio telephony is being restored. If telephony isn't needed yet, leave this change in place — it's harmless and gives callers a polite message.

---

### Step 7: Set Database Flags

**Via Admin UI (preferred):**
1. Navigate to `/admin` > AI Agents
2. Enable Marcela toggle
3. Save

**Via SQL (alternative):**
```sql
UPDATE global_assumptions
SET marcela_enabled = true,
    show_ai_assistant = true
WHERE user_id IS NULL;
```

**Note:** If you're restoring mutual exclusion, enabling Marcela will automatically disable Rebecca. If you're allowing coexistence, both can be true.

**Verify:** After setting flags, the Marcela widget should appear in the app header (if logged in as a non-admin, not on admin page, tour not active).

---

### Step 8: Rebuild Knowledge Base

The knowledge base documents may be stale after a long isolation period.

1. Navigate to `/admin` > AI Agents > Marcela > Knowledge Base tab
2. Click "Rebuild Knowledge Base"
3. Wait for the build to complete
4. Verify the document count and content look correct

If the knowledge base upload fails, check:
- `ELEVENLABS_API_KEY` is valid
- The agent ID in the database matches the ElevenLabs dashboard
- The ElevenLabs API is responding (check integration health: `/admin` > Integrations)

---

## Post-Restoration Verification

Run through this complete checklist after all changes are made:

### Automated Checks

```bash
# 1. All tests pass (no regressions from restoration)
npm run test:summary
# Expected: 3,035+ tests, 0 failures

# 2. Financial verification unaffected
npm run verify:summary
# Expected: UNQUALIFIED

# 3. Build succeeds
npm run build
# Expected: Clean build
```

### Manual Checks

```
Browser — DevTools Console:
  □ "[ElevenLabs] Widget element registered" message appears on load
  □ No red errors related to ElevenLabs or convai

Browser — DevTools Network:
  □ Filter "elevenlabs" — should see signed-url request (200 OK)
  □ Filter "convai" — should see WebSocket connection attempt

App — Header:
  □ Marcela widget/orb appears (if marcelaEnabled=true, showAiAssistant=true)
  □ Clicking orb opens voice interface
  □ Speaking triggers transcription

Admin — AI Agents:
  □ Marcela section is fully editable (no disabled banner)
  □ Can change voice, LLM, widget settings
  □ "Test Connection" or health check shows healthy

Admin — AI Agents — Knowledge Base:
  □ Knowledge base shows current documents
  □ Can rebuild without errors

Voice Lab — /voice:
  □ Voice Orb tab loads without error
  □ Full Chat tab loads without error
  □ Can have a conversation with Marcela

API — Health Check:
  □ GET /api/admin/convai/health returns { healthy: true }

If Twilio restored:
  □ Incoming call to Twilio number connects to Marcela
  □ Marcela responds with voice
  □ Call disconnects cleanly
```

---

## Troubleshooting

### Widget doesn't appear

| Symptom | Cause | Fix |
|---------|-------|-----|
| No "[ElevenLabs] Widget element registered" in console | Step 1 not done or `main.tsx` still commented | Uncomment widget registration |
| Widget registered but doesn't render | `marcelaEnabled` or `showAiAssistant` is false | Set flags in admin UI or SQL |
| Widget registered but `rebeccaActive` blocks it | Mutual exclusion — Rebecca is enabled | Disable Rebecca first, or remove mutual exclusion check |
| `return null` still in Layout | Step 2 not done | Remove early return from `MarcelaWidgetGated` |

### Widget appears but can't connect

| Symptom | Cause | Fix |
|---------|-------|-----|
| Signed URL request fails (403/401) | `ELEVENLABS_API_KEY` invalid or expired | Update in Replit Secrets |
| Signed URL request fails (404) | Agent ID doesn't exist on ElevenLabs | Create new agent, update DB |
| Widget shows "connecting..." forever | WebSocket blocked or agent unresponsive | Check CSP headers, check ElevenLabs status page |
| "503 isolated" response | Step 5 not done — guards still in place | Remove 503 early returns |

### Agent responds but sounds wrong

| Symptom | Cause | Fix |
|---------|-------|-----|
| Wrong voice | Voice ID changed on ElevenLabs | Update `marcelaVoiceId` in admin |
| No knowledge of the app | Knowledge base stale or missing | Rebuild KB (Step 8) |
| Generic responses, no financial context | System prompt was reset | Check/update prompt in admin > Marcela > Prompt Editor |
| Very slow responses | LLM model changed or rate limited | Check `marcelaLlmModel` setting, check ElevenLabs usage |

### Twilio calls don't work

| Symptom | Cause | Fix |
|---------|-------|-----|
| Callers hear "unavailable" message | Step 6 not done — TwiML guard still in place | Remove guard from `twilio.ts` |
| Callers hear nothing, then disconnect | WebSocket bridge broken | Check ElevenLabs audio codec compatibility |
| Twilio webhook returns error | Phone number released or credentials expired | Check Twilio console |
| Audio is garbled | Codec mismatch (mulaw vs PCM) | Check `elevenlabs-audio.ts` conversion functions |

### NPM package issues

```bash
# If @elevenlabs/convai-widget-core fails to load:
npm ls @elevenlabs/convai-widget-core

# If version is very old, update:
npm update @elevenlabs/convai-widget-core

# If major version changed, check for breaking changes:
npm info @elevenlabs/convai-widget-core versions

# Nuclear option (if nothing works):
rm -rf node_modules/.cache
npm install
```

---

## Complete File Inventory

Every file that contains Marcela/ElevenLabs code. All of these were preserved during isolation and should work after restoration:

### Client Components (44 files)

```
client/src/features/ai-agent/
├── ElevenLabsWidget.tsx          Main widget wrapper
├── VoiceChatOrb.tsx              Voice orb interface
├── VoiceChatFull.tsx             Full chat + voice
├── VoiceChatBar.tsx              Floating bar
├── RealtimeTranscriber.tsx       Speech-to-text viewer
├── Speaker.tsx                   Audio player + waveform
├── types.ts                      TypeScript interfaces
├── query-keys.ts                 React Query keys
├── index.ts                      Barrel export
├── hooks/
│   ├── use-convai-api.ts         Agent config CRUD hooks
│   ├── use-signed-url.ts         Signed URL fetcher
│   ├── use-agent-settings.ts     Voice settings hooks
│   ├── use-knowledge-base.ts     KB management hooks
│   └── use-conversations.ts      Conversation history hooks
└── components/
    ├── conversation.tsx           Message thread
    ├── conversation-block.tsx     Message blocks
    ├── conversation-bar.tsx       Inline chat bar
    ├── orb.tsx                    Animated orb button
    ├── voice-button.tsx           Voice input trigger
    ├── voice-picker.tsx           Voice selection
    ├── mic-selector.tsx           Microphone selector
    ├── speech-input.tsx           Audio input
    ├── message.tsx                Single message
    ├── response.tsx               Agent response
    ├── transcript-viewer.tsx      Transcript display
    ├── audio-player.tsx           Audio playback
    ├── live-waveform.tsx          Animated waveform
    ├── waveform-*.tsx             6 waveform variants
    ├── animated-video-background.tsx
    ├── bar-visualizer.tsx         Audio level bars
    ├── matrix.tsx                 Matrix effect
    ├── shimmering-text.tsx        Text animation
    └── index.ts                   Barrel export
```

### Admin Components (13 files)

```
client/src/components/admin/marcela/
├── MarcelaTab.tsx                Main config tab
├── PromptEditor.tsx              System prompt editor
├── LLMSettings.tsx               Model, tokens, language
├── VoiceSettings.tsx             TTS voice, stability
├── WidgetAppearance.tsx          Avatar, colors, layout
├── WidgetInteraction.tsx         Text input, mic, transcript
├── TelephonySettings.tsx         Twilio phone, SMS, greeting
├── ConversationHistory.tsx       Past conversations
├── KnowledgeBase.tsx             KB upload, rebuild, preview
├── ToolsStatus.tsx               Tools config status
├── types.ts                      Interfaces
├── hooks.ts                      Local hooks
└── index.ts                      Barrel export

client/src/components/admin/ai-agents/
├── MarcelaGeneralTab.tsx         Enable/disable, name
└── MarcelaConfig.tsx             Config panel wrapper
```

### Server Files

```
server/integrations/elevenlabs.ts           API client + health check
server/integrations/elevenlabs-audio.ts     Audio codec conversions
server/ai/marcela-agent-config.ts           Agent config + tool push
server/ai/marcela-knowledge-base.ts         KB build + upload
server/routes/admin/marcela.ts              Admin config endpoints (350+ lines)
server/routes/marcela-tools.ts              Agent tool endpoints
server/routes/twilio.ts                     Voice webhook + WebSocket bridge
server/ai/kb/                               18 knowledge base markdown files
```

### Pages

```
client/src/pages/VoiceLab.tsx               Voice Lab page (5 tabs)
```

### Types & Config

```
client/src/types/elevenlabs-convai.d.ts     TypeScript declarations for widget
shared/schema/config.ts                      40+ marcelaXxx columns in globalAssumptions
shared/constants.ts                          DEFAULT_MARCELA_* constants
```

### Documentation

```
.claude/skills/marcela-ai/SKILL.md          Agent architecture reference
.claude/skills/elevenlabs/SKILL.md          ElevenLabs integration reference
.claude/skills/twilio-telephony/SKILL.md    Twilio telephony reference
.claude/tools/marcela/                       15 JSON tool schemas
```

---

## Timeline Expectations

| Task | Time |
|------|------|
| Pre-restoration checks (secrets, agent, package) | 15 minutes |
| Code changes (Steps 1-6) | 15 minutes |
| Database flags (Step 7) | 2 minutes |
| Knowledge base rebuild (Step 8) | 5 minutes |
| Verification (automated + manual) | 15 minutes |
| **Total** | **~50 minutes** |

If the ElevenLabs agent was deleted or the NPM package has breaking changes, add 30-60 minutes for agent recreation or widget code updates.

---

*This document is the complete guide for restoring Marcela and ElevenLabs after isolation. Execute `MARCELA-ISOLATION.md` first (to disable), then this document when ready to re-enable. All code was preserved during isolation — nothing was deleted.*
