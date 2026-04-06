/**
 * useResearchStream.ts — React hook for streaming property market research.
 *
 * Manages the full lifecycle of an AI research request:
 *   1. Opens an SSE (Server-Sent Events) connection to POST /api/research/:id
 *   2. Receives partial JSON tokens as they stream from the LLM
 *   3. Accumulates tokens into a raw string and attempts JSON.parse on
 *      each update (partial JSON is tolerated via try/catch)
 *   4. When parsing succeeds, the typed research object is set in state,
 *      triggering re-renders that progressively fill ResearchSections
 *   5. On stream completion, invalidates the TanStack Query cache so
 *      the research data persists for subsequent page loads
 *
 * Returns:
 *   • research     – the current parsed research object (or null)
 *   • rawText      – the raw accumulated JSON string
 *   • isStreaming   – whether the SSE connection is still open
 *   • startStream  – callback to initiate a new research request
 *   • cancelStream – callback to abort the current SSE connection
 */
import { useState, useRef, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { fireResearchConfetti } from "@/lib/confetti";

interface UseResearchStreamOptions {
  property: any;
  propertyId: number;
  global: any;
}

export interface OrchestratorMeta {
  analystA?: { model: string; durationMs: number; error?: string };
  analystB?: { model: string; durationMs: number; error?: string };
  synthesisModel?: string;
  consensusRatio?: number;
  priorResearch?: number;
  knowledgeContributions?: Array<{
    vectorId: string;
    score: number;
    source: string;
    location: string;
    completedAt: string;
  }>;
}

export function useResearchStream({ property, propertyId, global }: UseResearchStreamOptions) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [streamedContent, setStreamedContent] = useState("");
  const [phases, setPhases] = useState<string[]>([]);
  const [orchestratorMeta, setOrchestratorMeta] = useState<OrchestratorMeta | null>(null);
  const queryClient = useQueryClient();
  const abortRef = useRef<AbortController | null>(null);

  const generateResearch = useCallback(async () => {
    if (!property) return;
    setIsGenerating(true);
    setStreamedContent("");
    setPhases([]);
    setOrchestratorMeta(null);
    
    abortRef.current = new AbortController();
    
    try {
      const response = await fetch("/api/research/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "property",
          propertyId: property.id,
          propertyContext: {
            name: property.name,
            location: property.location,
            market: property.market,
            roomCount: property.roomCount,
            startAdr: property.startAdr,
            maxOccupancy: property.maxOccupancy,
            type: property.type,
          },
          assetDefinition: global?.assetDefinition,
        }),
        signal: abortRef.current.signal,
      });
      
      // Read the SSE stream using the ReadableStream API; each chunk
      // may contain multiple "data: " lines from the server
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let accumulated = "";
      
      while (reader) {
        const { done, value } = await reader.read();
        if (done) break;
        
        const chunk = decoder.decode(value);
        const lines = chunk.split("\n");
        
        for (const line of lines) {
          // Each SSE event is "data: {json}\n"; parse the JSON payload
          if (line.startsWith("data: ")) {
            try {
              const data = JSON.parse(line.slice(6));
              if (data.type === "content" && data.data) {
                accumulated += data.data;
                setStreamedContent(accumulated);
              } else if (data.content) {
                accumulated += data.content;
                setStreamedContent(accumulated);
              }
              if (data.type === "phase" && data.data) {
                try {
                  const parsed = JSON.parse(data.data);
                  if (parsed._orchestrator) {
                    setOrchestratorMeta(parsed._orchestrator);
                  } else {
                    setPhases(prev => [...prev, data.data]);
                  }
                } catch {
                  setPhases(prev => [...prev, data.data]);
                }
              }
              if (data.type === "done" || data.done) {
                queryClient.invalidateQueries({ queryKey: ["research", "property", propertyId] });
                fireResearchConfetti();
              }
            } catch { /* incomplete SSE chunk */ }
          }
        }
      }
    } catch (error: any) {
      if (error.name !== "AbortError") {
        console.error("Research generation failed:", error);
      }
    } finally {
      setIsGenerating(false);
    }
  }, [property, global, propertyId, queryClient]);

  return { isGenerating, streamedContent, phases, orchestratorMeta, generateResearch };
}
