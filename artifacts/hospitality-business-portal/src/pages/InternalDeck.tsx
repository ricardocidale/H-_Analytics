/**
 * InternalDeck.tsx
 *
 * Renders the canonical six-page L+B investor deck at native 1920×1080 px,
 * with CSS `@page` sizing and `page-break-after` so headless Chromium
 * (Playwright, running in the api-server) can snapshot it as a PDF.
 *
 * Route:  `/internal/deck/:propertyId?token=<hmac>`
 *
 * Authentication:
 *   - There is no session cookie. The `token` query param is an HMAC short-
 *     TTL capability minted by the api-server (see slides/internal-token.ts)
 *     bound to a single propertyId. The token is forwarded to the deck-
 *     payload endpoint, which is the only enforcement point.
 *   - This route is mounted OUTSIDE the auth guards so Playwright can reach
 *     it without logging in.
 *
 * Render-ready signal:
 *   When all data is fetched and every <img> has loaded, this component sets
 *   `window.__deckReady = true`. The PDF endpoint waits on that flag plus
 *   `document.fonts.ready` before snapshotting, so partial renders never
 *   end up in the PDF.
 */

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useRoute } from "wouter";
import { Slide1, Slide2, Slide3, Slide4, Slide5, Slide6 } from "@/features/internal-deck/slides";
// TOTAL_SLIDES comes from contract.ts (canonical v4 spec). SLIDE_WIDTH_PX and
// SLIDE_HEIGHT_PX still come from theme.ts (1920×1080) because slides.tsx
// renders at those dimensions. Migration to contract.ts 960×540 is deferred
// until slides.tsx is fully rewritten (T_RENDER_REWRITE).
import { TOTAL_SLIDES } from "@/features/internal-deck/contract";
import { SLIDE_HEIGHT_PX, SLIDE_WIDTH_PX } from "@/features/internal-deck/theme";
import "@/features/internal-deck/fonts.css";
import type { SlidePayload } from "@/features/internal-deck/types";

declare global {
  interface Window {
    __deckReady?: boolean;
    __deckError?: string;
  }
}

function useDeckPayload(propertyId: string | undefined, token: string): {
  data: SlidePayload | null;
  error: string | null;
} {
  const [data, setData] = useState<SlidePayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!propertyId || !token) {
      setError("Missing propertyId or token");
      return;
    }
    let cancelled = false;
    const url = `/api/internal/deck-payload/${encodeURIComponent(propertyId)}?token=${encodeURIComponent(token)}`;
    fetch(url, { credentials: "omit" })
      .then(async (r) => {
        if (!r.ok) {
          const body = await r.text().catch(() => "");
          throw new Error(`HTTP ${r.status}: ${body || r.statusText}`);
        }
        return r.json() as Promise<SlidePayload>;
      })
      .then((p) => { if (!cancelled) setData(p); })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      });
    return () => { cancelled = true; };
  }, [propertyId, token]);

  return { data, error };
}

/**
 * Wait for every <img> inside the deck root to finish loading (or error).
 * Photo-heavy slides would otherwise be snapshotted with blank panels.
 */
function useImagesReady(rootRef: React.RefObject<HTMLDivElement | null>, payload: SlidePayload | null): boolean {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (!payload || !rootRef.current) return;
    const root = rootRef.current;
    // Use rAF so React has flushed the DOM before we collect images.
    const raf = requestAnimationFrame(() => {
      const imgs = Array.from(root.querySelectorAll("img"));
      if (imgs.length === 0) { setReady(true); return; }
      let pending = imgs.length;
      const done = () => { pending -= 1; if (pending <= 0) setReady(true); };
      imgs.forEach((img) => {
        if (img.complete) { done(); return; }
        img.addEventListener("load", done, { once: true });
        img.addEventListener("error", done, { once: true });
      });
    });
    return () => cancelAnimationFrame(raf);
  }, [payload, rootRef]);
  return ready;
}

export default function InternalDeck() {
  const [, params] = useRoute<{ propertyId: string }>("/internal/deck/:propertyId");
  const token = useMemo(() => {
    const usp = new URLSearchParams(window.location.search);
    return usp.get("token") ?? "";
  }, []);
  // Optional ?slide=N filter (1..TOTAL_SLIDES). When set, only that slide is
  // rendered — used by the per-slide PDF endpoint so Playwright captures a
  // 1-page PDF, and by anything that wants to embed a single slide.
  const slideFilter = useMemo<number | null>(() => {
    const usp = new URLSearchParams(window.location.search);
    const raw = usp.get("slide");
    if (!raw) return null;
    const n = Number(raw);
    if (!Number.isInteger(n) || n < 1 || n > TOTAL_SLIDES) return null;
    return n;
  }, []);

  const { data, error } = useDeckPayload(params?.propertyId, token);
  const rootRef = useRef<HTMLDivElement>(null);
  const imagesReady = useImagesReady(rootRef, data);

  useEffect(() => {
    if (error) { window.__deckError = error; }
  }, [error]);

  useEffect(() => {
    if (!data || !imagesReady) return;
    // Belt-and-braces: also wait for fonts before flipping the ready flag.
    const fontsReady = document.fonts ? document.fonts.ready : Promise.resolve();
    fontsReady.then(() => { window.__deckReady = true; });
  }, [data, imagesReady]);

  if (error) {
    return (
      <div style={{ padding: 24, fontFamily: "monospace", color: "#b91c1c" }}>
        <div>Deck render error:</div>
        <pre style={{ whiteSpace: "pre-wrap" }}>{error}</pre>
      </div>
    );
  }

  if (!data) {
    return (
      <div style={{ padding: 24, fontFamily: "sans-serif", color: "#666" }}>
        Loading deck…
      </div>
    );
  }

  return (
    <>
      {/*
        Print rules:
          - @page sized to native slide dimensions (1920×1080 px) so Chromium
            does not scale or letterbox.
          - Each .deck-page is exactly one page; page-break-after forces a
            new sheet between slides.
          - On screen, slides stack vertically with a small gap so a human
            reviewer can scroll through the deck.
       */}
      <style>{`
        @page { size: ${SLIDE_WIDTH_PX}px ${SLIDE_HEIGHT_PX}px; margin: 0; }
        html, body, #root { margin: 0; padding: 0; background: #fff; }
        .deck-root { background: #fff; }
        .deck-page {
          width: ${SLIDE_WIDTH_PX}px;
          height: ${SLIDE_HEIGHT_PX}px;
          overflow: hidden;
          position: relative;
          display: block;
          page-break-after: always;
          page-break-inside: avoid;
          break-after: page;
          break-inside: avoid;
        }
        .deck-page:last-child { page-break-after: auto; break-after: auto; }
        @media screen {
          .deck-root { padding: 24px; display: flex; flex-direction: column; gap: 24px; align-items: flex-start; }
          .deck-page { box-shadow: 0 8px 32px rgba(0,0,0,0.25); }
        }
        @media print {
          html, body, #root {
            overflow: visible !important;
            width: ${SLIDE_WIDTH_PX}px;
            height: auto;
          }
          .deck-root { display: block !important; padding: 0 !important; gap: 0 !important; width: ${SLIDE_WIDTH_PX}px; }
        }
      `}</style>
      <div ref={rootRef} className="deck-root" data-deck-total={TOTAL_SLIDES} data-slide-filter={slideFilter ?? "all"}>
        {(slideFilter === null || slideFilter === 1) && <div className="deck-page"><Slide1 p={data} /></div>}
        {(slideFilter === null || slideFilter === 2) && <div className="deck-page"><Slide2 p={data} /></div>}
        {(slideFilter === null || slideFilter === 3) && <div className="deck-page"><Slide3 p={data} /></div>}
        {(slideFilter === null || slideFilter === 4) && <div className="deck-page"><Slide4 p={data} /></div>}
        {(slideFilter === null || slideFilter === 5) && <div className="deck-page"><Slide5 p={data} /></div>}
        {(slideFilter === null || slideFilter === 6) && <div className="deck-page"><Slide6 p={data} /></div>}
      </div>
    </>
  );
}
