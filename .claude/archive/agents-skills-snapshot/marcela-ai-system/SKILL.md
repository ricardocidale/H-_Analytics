---
name: legacy-voice-agent
description: "DEPRECATED — Legacy voice agent system (formerly called 'Marcela'). This system has been fully removed. The active AI assistant is REBECCA. See .claude/skills/rebecca-chatbot/SKILL.md for the current AI system. Do NOT use this skill for any new work."
---

# DEPRECATED — Legacy Voice Agent

> **This system has been fully removed from the active codebase.** The AI assistant is now **Rebecca** — a text-based conversational intelligence chatbot. See `.claude/skills/rebecca-chatbot/SKILL.md` for the current architecture.

## What This Was

The voice agent (internally called "Marcela" in legacy code) was an ElevenLabs Conversational AI + Twilio Voice/SMS system. It has been completely removed. All `marcela_*` DB columns have been dropped via migration.

## Important

- **Never introduce "Marcela" references** into the codebase
- If the user says "Marcela," they mean **Rebecca**
- All AI assistant work should use the `rebecca-chatbot` skill
- Legacy files exist only in `LB_Hospitality/` (reference archive, not active code)
