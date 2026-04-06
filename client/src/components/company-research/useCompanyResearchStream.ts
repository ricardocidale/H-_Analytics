/**
 * useCompanyResearchStream.ts — React hook for streaming company-level AI research.
 *
 * Works identically to property-research/useResearchStream but targets
 * the /api/company-research endpoint instead. The hook:
 *   1. Opens an SSE connection and streams JSON tokens from the LLM
 *   2. Progressively parses the accumulated string into a typed research object
 *   3. Invalidates the TanStack Query cache on completion for persistence
 *
 * Returns:
 *   • research     – parsed company research object (or null while streaming)
 *   • rawText      – raw accumulated JSON for debugging
 *   • isStreaming   – whether the SSE connection is active
 *   • startStream  – initiates a new company research request
 *   • cancelStream – aborts the current SSE connection
 */
import { useState, useRef, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { fireResearchConfetti } from "@/lib/confetti";
import type { OrchestratorMeta } from "../property-research/useResearchStream";

export function useCompanyResearchStream() {
  const [isGenerating, setIsGenerating] = useState(false);
  const [streamedContent, setStreamedContent] = useState("");
  const [phases, setPhases] = useState<string[]>([]);
  const [orchestratorMeta, setOrchestratorMeta] = useState<OrchestratorMeta | null>(null);
  const queryClient = useQueryClient();
  const abortRef = useRef<AbortController | null>(null);

  const generateResearch = useCallback(async () => {
    setIsGenerating(true);
    setStreamedContent("");
    setPhases([]);
    setOrchestratorMeta(null);
    
    abortRef.current = new AbortController();
    
    try {
      const response = await fetch("/api/research/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "company" }),
        signal: abortRef.current.signal,
      });
      
      // Read the SSE stream; same pattern as property research but targeting
      // the company research endpoint
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let accumulated = "";
      
      while (reader) {
        const { done, value } = await reader.read();
        if (done) break;
        
        const chunk = decoder.decode(value);
        const lines = chunk.split("\n");
        
        for (const line of lines) {
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
                queryClient.invalidateQueries({ queryKey: ["research", "company"] });
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
  }, [queryClient]);

  return { isGenerating, streamedContent, phases, orchestratorMeta, generateResearch };
}
