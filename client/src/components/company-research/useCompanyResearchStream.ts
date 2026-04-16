/**
 * useCompanyResearchStream.ts — React hook for streaming company-level AI research.
 *
 * Works identically to property-research/useResearchStream but targets
 * the company research endpoint. Integrates with the global research queue
 * for throttled concurrency and 429 retry with exponential backoff.
 */
import { useState, useRef, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { fireResearchConfetti } from "@/lib/confetti";
import { useResearchQueue, getBackoffDelay } from "@/lib/research-queue";
import type { OrchestratorMeta } from "../property-research/useResearchStream";

export function useCompanyResearchStream() {
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
      body: JSON.stringify({ type: "company" }),
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
              queryClient.invalidateQueries({ queryKey: ["research", "company"] });
              fireResearchConfetti();
            }
          } catch { /* incomplete SSE chunk */ }
        }
      }
    }
  }, [queryClient]);

  const generateResearch = useCallback(async () => {
    setIsGenerating(true);
    setStreamedContent("");
    setPhases([]);
    setOrchestratorMeta(null);

    const queueId = `company-${Date.now()}`;
    getQueue().enqueue({
      id: queueId,
      label: "Company Research",
      type: "company",
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
    } catch (error: unknown) {
      if (!(error instanceof DOMException && error.name === "AbortError")) {
        getQueue().markError(queueId, error instanceof Error ? error.message : "Research failed");
      }
    } finally {
      setIsGenerating(false);
      setTimeout(() => getQueue().clearCompleted(), 15000);
    }
  }, [queryClient, executeStream]);

  const abortResearch = useCallback(() => {
    abortRef.current?.abort();
    setIsGenerating(false);
  }, []);

  return { isGenerating, streamedContent, phases, orchestratorMeta, generateResearch, abortResearch };
}
