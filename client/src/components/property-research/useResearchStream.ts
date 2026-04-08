/**
 * useResearchStream.ts — React hook for streaming property market research.
 *
 * Manages the full lifecycle of an AI research request:
 *   1. Enqueues the request in the global research queue for throttling
 *   2. Opens an SSE (Server-Sent Events) connection to POST /api/research/generate
 *   3. Receives partial JSON tokens as they stream from the LLM
 *   4. Accumulates tokens into a raw string and attempts JSON.parse on
 *      each update (partial JSON is tolerated via try/catch)
 *   5. On stream completion, invalidates the TanStack Query cache so
 *      the research data persists for subsequent page loads
 *   6. On 429, retries with exponential backoff via the queue
 */
import { useState, useRef, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { fireResearchConfetti } from "@/lib/confetti";
import { useResearchQueue, getBackoffDelay } from "@/lib/research-queue";

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

  const getQueue = () => useResearchQueue.getState();

  const executeStream = useCallback(async (queueId: string) => {
    abortRef.current = new AbortController();

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

    if (response.status === 429) {
      useResearchQueue.getState().markRateLimited(queueId);
      const freshItem = useResearchQueue.getState().items.find(i => i.id === queueId);
      if (freshItem && freshItem.status === "queued") {
        const delay = getBackoffDelay(freshItem.retryCount);
        setPhases(prev => [...prev, `Rate limited — retrying in ${Math.ceil(delay / 1000)}s...`]);
        await new Promise(r => setTimeout(r, delay));
        useResearchQueue.getState().markActive(queueId);
        return executeStream(queueId);
      }
      throw new Error("Rate limit exceeded after retries");
    }

    if (!response.ok) {
      throw new Error(`Research request failed: ${response.status}`);
    }

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
              queryClient.invalidateQueries({ queryKey: ["research", "property", propertyId] });
              fireResearchConfetti();
            }
          } catch { /* incomplete SSE chunk */ }
        }
      }
    }
  }, [property, global, propertyId, queryClient]);

  const generateResearch = useCallback(async () => {
    if (!property) return;
    setIsGenerating(true);
    setStreamedContent("");
    setPhases([]);
    setOrchestratorMeta(null);

    const queueId = `property-${propertyId}-${Date.now()}`;
    getQueue().enqueue({
      id: queueId,
      label: property.name || `Property ${propertyId}`,
      propertyId,
      type: "property",
    });

    const waitForSlot = (): Promise<void> => {
      return new Promise((resolve) => {
        const check = () => {
          const next = getQueue().getNext();
          if (next?.id === queueId) {
            resolve();
          } else {
            setTimeout(check, 500);
          }
        };
        check();
      });
    };

    try {
      await waitForSlot();
      getQueue().markActive(queueId);
      await executeStream(queueId);
      getQueue().markComplete(queueId);
    } catch (error: any) {
      if (error.name !== "AbortError") {
        getQueue().markError(queueId, error.message || "Research failed");
      }
    } finally {
      setIsGenerating(false);
      setTimeout(() => getQueue().clearCompleted(), 15000);
    }
  }, [property, global, propertyId, queryClient, executeStream]);

  return { isGenerating, streamedContent, phases, orchestratorMeta, generateResearch };
}
