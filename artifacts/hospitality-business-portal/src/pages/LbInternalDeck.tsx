/**
 * LbInternalDeck.tsx
 *
 * Renders the LB Slide Deck — ONE portfolio investor presentation with 6 slides.
 * Each slide receives its OWN per-slide SlidePayload (composite payload pattern).
 *
 * Route: `/internal/lb-deck?token=<hmac>`
 *
 * Authentication:
 *   - No session cookie. Token is an HMAC short-TTL "lb.*" capability minted
 *     by the api-server (see slides/lb-token.ts). Cross-type tokens are rejected.
 *   - Mounted OUTSIDE auth guards so Playwright can reach it without logging in.
 *
 * Render-ready signal:
 *   Sets `window.__deckReady = true` when all 6 payloads are loaded and every
 *   <img> has finished. The PDF endpoint polls this flag before snapshotting.
 *
 * Per-slide payload assignment:
 *   Slide 1 — admin-assigned property (Pipeline Spotlight)
 *   Slide 2 — admin-assigned property (Photo Gallery)
 *   Slide 3 — admin-assigned property (Investment Model)
 *   Slide 4 — auto portfolio grid (all properties as siblings)
 *   Slide 5 — admin-assigned property (Financial Snapshot)
 *   Slide 6 — auto 10-year aggregated portfolio pro forma (usaliMode: true)
 */

import React, { useEffect, useMemo, useRef, useState } from "react";
import { Slide1, Slide2, Slide3, Slide4, Slide5, Slide6 } from "@/features/internal-deck/slides";
import { TOTAL_SLIDES, SLIDE_HEIGHT_PX, SLIDE_WIDTH_PX } from "@/features/internal-deck/contract";
import "@/features/internal-deck/fonts.css";
import type { SlidePayload } from "@/features/internal-deck/types";

declare global {
  interface Window {
    __deckReady?: boolean;
    __deckError?: string;
  }
}

interface LbSlidePayload {
  slides: [SlidePayload, SlidePayload, SlidePayload, SlidePayload, SlidePayload, SlidePayload];
  config: {
    slide1PropertyId: number | null;
    slide2PropertyId: number | null;
    slide3PropertyId: number | null;
    slide5PropertyId: number | null;
  };
}

function useLbDeckPayload(token: string): {
  data: LbSlidePayload | null;
  error: string | null;
} {
  const [data, setData] = useState<LbSlidePayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setError("Missing token");
      return;
    }
    let cancelled = false;
    const url = `/api/internal/lb-deck-payload?token=${encodeURIComponent(token)}`;
    fetch(url, { credentials: "omit" })
      .then(async (r) => {
        if (!r.ok) {
          const body = await r.text().catch(() => "");
          throw new Error(`HTTP ${r.status}: ${body || r.statusText}`);
        }
        return r.json() as Promise<LbSlidePayload>;
      })
      .then((p) => { if (!cancelled) setData(p); })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      });
    return () => { cancelled = true; };
  }, [token]);

  return { data, error };
}

function useImagesReady(rootRef: React.RefObject<HTMLDivElement | null>, ready: boolean): boolean {
  const [imgsReady, setImgsReady] = useState(false);
  useEffect(() => {
    if (!ready || !rootRef.current) return;
    const root = rootRef.current;
    const raf = requestAnimationFrame(() => {
      const imgs = Array.from(root.querySelectorAll("img"));
      if (imgs.length === 0) { setImgsReady(true); return; }
      let pending = imgs.length;
      const done = () => { pending -= 1; if (pending <= 0) setImgsReady(true); };
      imgs.forEach((img) => {
        if (img.complete) { done(); return; }
        img.addEventListener("load", done, { once: true });
        img.addEventListener("error", done, { once: true });
      });
    });
    return () => cancelAnimationFrame(raf);
  }, [ready, rootRef]);
  return imgsReady;
}

export default function LbInternalDeck() {
  const token = useMemo(() => {
    const usp = new URLSearchParams(window.location.search);
    return usp.get("token") ?? "";
  }, []);

  const { data, error } = useLbDeckPayload(token);
  const rootRef = useRef<HTMLDivElement>(null);
  const imagesReady = useImagesReady(rootRef, data !== null);

  useEffect(() => {
    if (error) { window.__deckError = error; }
  }, [error]);

  useEffect(() => {
    if (!data || !imagesReady) return;
    const fontsReady = document.fonts ? document.fonts.ready : Promise.resolve();
    fontsReady.then(() => { window.__deckReady = true; });
  }, [data, imagesReady]);

  if (error) {
    return (
      <div style={{ padding: 24, fontFamily: "monospace", color: "#b91c1c" }}>
        <div>LB Deck render error:</div>
        <pre style={{ whiteSpace: "pre-wrap" }}>{error}</pre>
      </div>
    );
  }

  if (!data) {
    return (
      <div style={{ padding: 24, fontFamily: "sans-serif", color: "#666" }}>
        Loading LB Slide Deck…
      </div>
    );
  }

  const [s1, s2, s3, s4, s5, s6] = data.slides;

  return (
    <>
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
      <div ref={rootRef} className="deck-root" data-deck-total={TOTAL_SLIDES} data-deck-kind="lb">
        <div className="deck-page"><Slide1 p={s1} /></div>
        <div className="deck-page"><Slide2 p={s2} /></div>
        <div className="deck-page"><Slide3 p={s3} /></div>
        <div className="deck-page"><Slide4 p={s4} /></div>
        <div className="deck-page"><Slide5 p={s5} /></div>
        <div className="deck-page"><Slide6 p={s6} /></div>
      </div>
    </>
  );
}
