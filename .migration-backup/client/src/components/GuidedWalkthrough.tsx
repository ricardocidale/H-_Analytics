import { useState, useEffect, useCallback, useRef } from "react";
import { X, ChevronRight, ChevronLeft } from "@/components/icons/themed-icons";
import { Button } from "@/components/ui/button";
import { IconHelpCircle, IconCompass } from "@/components/icons";
import { useAuth } from "@/lib/auth";
import { useQueryClient } from "@tanstack/react-query";
import { create } from "zustand";

interface WalkthroughState {
  shownThisSession: boolean;
  tourActive: boolean;
  promptVisible: boolean;
  triggerCount: number;
  setShownThisSession: (v: boolean) => void;
  setTourActive: (v: boolean) => void;
  setPromptVisible: (v: boolean) => void;
  triggerPrompt: () => void;
}

export const useWalkthroughStore = create<WalkthroughState>()((set) => ({
  shownThisSession: false,
  tourActive: false,
  promptVisible: false,
  triggerCount: 0,
  setShownThisSession: (v: boolean) => set({ shownThisSession: v }),
  setTourActive: (v: boolean) => set({ tourActive: v }),
  setPromptVisible: (v: boolean) => set({ promptVisible: v }),
  triggerPrompt: () => set((s) => ({ triggerCount: s.triggerCount + 1 })),
}));

async function updateTourPromptPreference(hide: boolean): Promise<void> {
  await fetch("/api/profile/tour-prompt", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ hide }),
    credentials: "include",
  });
}

function getTourSteps(firstName?: string | null) {
  const greeting = firstName ? `Welcome, ${firstName}!` : "Welcome to Your Dashboard";
  return [
    { target: '[href="/"]', title: greeting, description: "This is your home base. It shows a high-level overview of your entire portfolio — key metrics, charts, and recent activity at a glance." },
    { target: '[href="/portfolio"]', title: "Step 1: Define Your Properties", description: "Start here. Add each property you want to model, then fill in the assumptions for each one — purchase price, room count, ADR, occupancy, expenses, and financing terms. This is the foundation of your entire simulation." },
    { target: '[href="/company"]', title: "Step 2: Management Company", description: "Next, define the management company assumptions — staffing tiers, partner compensation, base and incentive fee structures, and funding instruments. The management company earns fees from the properties you just set up." },
    { target: '[href="/company"]', title: "Step 3: General Configuration", description: "Review and adjust the company assumptions that apply across all properties — tax rates, inflation, depreciation schedules, and other defaults." },
    { target: '[href="/scenarios"]', title: "Save & Compare Scenarios", description: "Save your current assumptions as a named scenario so you can come back to it later. Create multiple scenarios to compare different strategies — like varying occupancy ramps or financing structures." },
    { target: '[href="/analysis"]', title: "Analysis Tools", description: "Explore what's available in the Analysis section — sensitivity tables, financing comparisons, executive summaries, side-by-side property comparisons, and portfolio timelines. This is where you stress-test your assumptions and see the big picture." },
    { target: '[data-testid="badge-research"]', title: "Research Badges", description: "These yellow pill badges show AI-recommended market ranges for your assumptions — like ADR, occupancy, and expense rates. Hover to see the data source, or click to auto-fill the recommended value. Each badge is backed by industry benchmarks from STR/CoStar, USALI, and other sources." },
    { target: '[data-testid="intelligence-status-bar"]', title: "Intelligence Status Bar", description: "This color-coded bar shows the freshness of your research data at a glance. Green means all research is current, amber means some results are stale and need refreshing, and red means research is missing entirely. Blue appears while research is actively running." },
    { target: '[href="/help"]', title: "User Manual & Help", description: "Consult the User Manual for a complete guide to every feature — from how revenue is calculated to how the balance sheet works. There's also a Checker Manual for verifying the financial models." },
    { target: '[data-testid="button-search"]', title: "Quick Navigation", description: "Press Ctrl+K anytime to search and jump to any page, property, or feature instantly. You can also find your favorite properties and recent activity in the sidebar." },
    { target: '[data-testid="button-notifications"]', title: "Stay Informed", description: "Check here for important alerts — like negative cash balance warnings or verification results. That's the tour! You can always restart it from the Help menu." },
  ];
}

function TourPromptDialog({ onAccept, onDecline }: { onAccept: () => void; onDecline: (neverAgain: boolean) => void }) {
  const [dontOffer, setDontOffer] = useState(false);
  const { user } = useAuth();
  const firstName = user?.firstName;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center" data-testid="tour-prompt-dialog">
      <div className="fixed inset-0 bg-foreground/60" onClick={() => onDecline(dontOffer)} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onDecline(dontOffer); } }} />
      <div className="relative bg-card rounded-lg shadow-sm border border-border p-8 max-w-md w-full mx-4 animate-in fade-in zoom-in-95 duration-300">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => onDecline(dontOffer)}
          className="absolute top-4 right-4 text-muted-foreground/40 hover:text-foreground/70"
          data-testid="button-tour-prompt-close"
        >
          <X className="w-4 h-4" />
        </Button>

        <div className="flex flex-col items-center text-center space-y-6">
          <div className="w-14 h-14 rounded-lg bg-primary/15 flex items-center justify-center">
            <IconCompass className="w-7 h-7 text-primary" />
          </div>

          <div className="space-y-2.5">
            <h2 className="text-xl font-display font-semibold text-foreground tracking-tight">
              {firstName ? `Welcome, ${firstName}` : "Welcome"}
            </h2>
            <p className="text-sm text-muted-foreground leading-relaxed max-w-sm">
              Take a quick guided tour to see how the portal works — navigation, key features, and where to find everything. It only takes a minute.
            </p>
          </div>

          <div className="flex items-center gap-3 w-full pt-1">
            <Button
              variant="secondary"
              onClick={() => onDecline(dontOffer)}
              className="flex-1"
              data-testid="button-tour-decline"
            >
              Skip
            </Button>
            <Button
              onClick={onAccept}
              className="flex-1"
              data-testid="button-tour-accept"
            >
              Start Tour
            </Button>
          </div>

          <label className="flex items-center gap-2 cursor-pointer group" data-testid="label-dont-offer-again">
            <input
              type="checkbox"
              checked={dontOffer}
              onChange={(e) => setDontOffer(e.target.checked)}
              className="w-3.5 h-3.5 rounded border-border text-primary focus:ring-primary/30 cursor-pointer"
              data-testid="checkbox-dont-offer-again"
            />
            <span className="text-xs text-muted-foreground/60 group-hover:text-muted-foreground transition-colors select-none">
              Don't show this again
            </span>
          </label>
        </div>
      </div>
    </div>
  );
}

function GuidedWalkthrough() {
  const { shownThisSession, tourActive, triggerCount, setShownThisSession, setTourActive, setPromptVisible } = useWalkthroughStore();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const tourSteps = getTourSteps(user?.firstName);
  const [showPrompt, setShowPromptLocal] = useState(false);
  const [step, setStep] = useState(0);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
  const hasAutoStarted = useRef(false);
  const lastTrigger = useRef(0);

  const setShowPrompt = useCallback((v: boolean) => {
    setShowPromptLocal(v);
    setPromptVisible(v);
  }, [setPromptVisible]);

  useEffect(() => {
    if (triggerCount > lastTrigger.current) {
      lastTrigger.current = triggerCount;
      setTourActive(false);
      setStep(0);
      setShowPrompt(true);
    }
  }, [triggerCount, setTourActive, setShowPrompt]);

  useEffect(() => {
    if (user && !user.hideTourPrompt && !shownThisSession && !hasAutoStarted.current) {
      hasAutoStarted.current = true;
      const timer = setTimeout(() => {
        setShowPrompt(true);
        setShownThisSession(true);
      }, 800);
      return () => clearTimeout(timer);
    }
  }, [user, shownThisSession, setShownThisSession, setShowPrompt]);

  const handleAcceptTour = useCallback(() => {
    setShowPrompt(false);
    setTourActive(true);
    setStep(0);
  }, [setTourActive, setShowPrompt]);

  const handleDeclineTour = useCallback(async (neverAgain: boolean) => {
    setShowPrompt(false);
    if (neverAgain) {
      await updateTourPromptPreference(true);
      queryClient.invalidateQueries({ queryKey: ["auth", "me"] });
    }
  }, [queryClient, setShowPrompt]);

  const updateRect = useCallback(() => {
    if (!tourActive) return;
    const current = tourSteps[step];
    const el = document.querySelector(current.target);
    if (el) {
      const rect = el.getBoundingClientRect();
      setTargetRect(rect);
      el.scrollIntoView({ behavior: "smooth", block: "nearest" });
    } else {
      if (step < tourSteps.length - 1) {
        setStep(step + 1);
      } else {
        setTourActive(false);
      }
    }
  }, [tourActive, step, setTourActive]);

  useEffect(() => {
    updateRect();
    window.addEventListener("resize", updateRect);
    window.addEventListener("scroll", updateRect, true);
    return () => {
      window.removeEventListener("resize", updateRect);
      window.removeEventListener("scroll", updateRect, true);
    };
  }, [updateRect]);

  const handleNext = useCallback(() => {
    if (step < tourSteps.length - 1) {
      setStep(step + 1);
    } else {
      setTourActive(false);
    }
  }, [step, setTourActive]);

  const handleBack = useCallback(() => {
    if (step > 0) {
      setStep(step - 1);
    }
  }, [step]);

  const handleSkip = useCallback(() => {
    setTourActive(false);
  }, [setTourActive]);

  if (showPrompt) {
    return <TourPromptDialog onAccept={handleAcceptTour} onDecline={handleDeclineTour} />;
  }

  if (!tourActive || !targetRect) return null;

  const padding = 6;
  const spotlightStyle: React.CSSProperties = {
    position: "fixed",
    top: targetRect.top - padding,
    left: targetRect.left - padding,
    width: targetRect.width + padding * 2,
    height: targetRect.height + padding * 2,
    borderRadius: 8,
    boxShadow: "0 0 0 9999px rgba(0,0,0,0.55)",
    pointerEvents: "none",
    zIndex: 9998,
    transition: "all 0.3s ease",
  };

  const tooltipTop = targetRect.bottom + padding + 12;
  const tooltipLeft = Math.max(12, Math.min(targetRect.left, window.innerWidth - 320));
  const fitsBelow = tooltipTop + 200 < window.innerHeight;

  const tooltipStyle: React.CSSProperties = {
    position: "fixed",
    top: fitsBelow ? tooltipTop : targetRect.top - padding - 12,
    left: tooltipLeft,
    transform: fitsBelow ? "none" : "translateY(-100%)",
    zIndex: 9999,
    maxWidth: 310,
  };

  const currentStep = tourSteps[step];
  const isLast = step === tourSteps.length - 1;

  return (
    <div data-testid="guided-walkthrough">
      <div
        className="fixed inset-0 z-[9997]"
        style={{ pointerEvents: "auto" }}
        onClick={handleSkip}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); handleSkip(); } }}
      />

      <div style={spotlightStyle} />

      <div
        style={tooltipStyle}
        className="bg-card rounded-lg border border-border shadow-sm p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-2.5">
          <h3 className="text-sm font-semibold text-foreground tracking-tight pr-4">{currentStep.title}</h3>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleSkip}
            className="text-muted-foreground/40 hover:text-foreground/70 -mt-0.5 -mr-0.5 shrink-0 h-auto w-auto p-0.5"
            data-testid="button-close-tour"
          >
            <X className="w-4 h-4" />
          </Button>
        </div>

        <p className="text-xs text-muted-foreground leading-relaxed mb-5">{currentStep.description}</p>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1">
            {tourSteps.map((_, i) => (
              <div
                key={i}
                className={`h-1 rounded-full transition-all duration-300 ${
                  i === step ? "w-4 bg-primary" : i < step ? "w-1.5 bg-primary/40" : "w-1.5 bg-border"
                }`}
              />
            ))}
          </div>

          <div className="flex items-center gap-1.5">
            {step > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleBack}
                className="text-xs"
                data-testid="button-tour-back"
              >
                <ChevronLeft className="w-3 h-3" />
                Back
              </Button>
            )}

            <Button
              size="sm"
              onClick={handleNext}
              className="text-xs"
              data-testid="button-tour-next"
            >
              {isLast ? "Done" : "Next"}
              {!isLast && <ChevronRight className="w-3 h-3" />}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function WalkthroughTrigger() {
  const { setTourActive, setShownThisSession } = useWalkthroughStore();

  const handleClick = useCallback(async () => {
    await updateTourPromptPreference(false);
    setShownThisSession(false);
    setTourActive(true);
  }, [setTourActive, setShownThisSession]);

  return (
    <Button
      variant="ghost"
      onClick={handleClick}
      className="group relative flex items-center gap-3 px-4 py-3 text-sm font-medium text-background/60 hover:text-white rounded-lg overflow-hidden w-full justify-start h-auto"
      data-testid="button-start-tour"
    >
      <div className="absolute inset-0 bg-card/0 group-hover:bg-card/5 transition-all duration-300 rounded-lg" />
      <div className="relative w-8 h-8 rounded-lg bg-card/5 group-hover:bg-card/10 flex items-center justify-center transition-all duration-300">
        <IconHelpCircle className="w-4 h-4 transition-all duration-300" />
      </div>
      <span className="relative">Guided Tour</span>
    </Button>
  );
}

export default GuidedWalkthrough;
