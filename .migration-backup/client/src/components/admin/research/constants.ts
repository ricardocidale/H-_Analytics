import type React from "react";
import type { AiModelEntry } from "@shared/schema";
import { IconProperties, IconResearch, IconGlobe } from "@/components/icons";

export const TIME_HORIZONS = [
  { value: "5-year",  label: "5-year" },
  { value: "7-year",  label: "7-year" },
  { value: "10-year", label: "10-year" },
  { value: "15-year", label: "15-year" },
];

export const DETERMINISTIC_TOOLS = [
  { name: "compute_property_metrics",    description: "RevPAR, room revenue, GOP, NOI margin" },
  { name: "compute_depreciation_basis",  description: "IRS depreciation basis allocation" },
  { name: "compute_debt_capacity",       description: "Debt yield and loan sizing" },
  { name: "compute_occupancy_ramp",      description: "Occupancy ramp modeling" },
  { name: "compute_adr_projection",      description: "ADR growth projections" },
  { name: "compute_cap_rate_valuation",  description: "Exit cap rate valuation" },
  { name: "compute_cost_benchmarks",     description: "USALI cost rate benchmarks" },
  { name: "compute_service_fee",         description: "Service fee calculations" },
  { name: "compute_markup_waterfall",    description: "Markup waterfall" },
];

export type ResearchType = "property" | "company" | "global";

export const EVENT_META: Record<ResearchType, { label: string; icon: React.ComponentType<{ className?: string }>; description: string }> = {
  property: { label: "Property Research",   icon: IconProperties,    description: "Per-property market analysis triggered from property pages" },
  company:  { label: "Company Research",    icon: IconResearch, description: "Management company fee structures and industry benchmarks" },
  global:   { label: "Global Research",     icon: IconGlobe,        description: "Industry-wide trends, market conditions, and investment outlook" },
};

export const FALLBACK_MODELS: AiModelEntry[] = [
  { id: "claude-opus-4-6", label: "Anthropic Claude Opus 4.6", provider: "anthropic" },
  { id: "claude-opus-4-5", label: "Anthropic Claude Opus 4.5", provider: "anthropic" },
  { id: "claude-sonnet-4-5", label: "Anthropic Claude Sonnet 4.5", provider: "anthropic" },
  { id: "claude-haiku-4-5", label: "Anthropic Claude Haiku 4.5", provider: "anthropic" },
  { id: "claude-opus-4-1", label: "Anthropic Claude Opus 4.1", provider: "anthropic" },
  { id: "claude-opus-4", label: "Anthropic Claude Opus 4", provider: "anthropic" },
  { id: "claude-sonnet-4", label: "Anthropic Claude Sonnet 4", provider: "anthropic" },
  { id: "gpt-5.4", label: "OpenAI GPT 5.4", provider: "openai" },
  { id: "gpt-5.4-pro", label: "OpenAI GPT 5.4 Pro", provider: "openai" },
  { id: "o3", label: "OpenAI o3", provider: "openai" },
  { id: "o3-pro", label: "OpenAI o3 Pro", provider: "openai" },
  { id: "o4-mini", label: "OpenAI o4 Mini", provider: "openai" },
  { id: "gemini-3.1-pro-preview", label: "Google Gemini 3.1 Pro Preview", provider: "google" },
  { id: "gemini-3-flash-preview", label: "Google Gemini 3 Flash Preview", provider: "google" },
  { id: "gemini-2.5-flash", label: "Google Gemini 2.5 Flash", provider: "google" },
  { id: "gemini-2.0-flash", label: "Google Gemini 2.0 Flash", provider: "google" },
  { id: "grok-4", label: "xAI Grok 4", provider: "xai" },
  { id: "grok-4-fast", label: "xAI Grok 4 Fast", provider: "xai" },
  { id: "grok-3", label: "xAI Grok 3", provider: "xai" },
  { id: "grok-3-mini", label: "xAI Grok 3 Mini", provider: "xai" },
];
