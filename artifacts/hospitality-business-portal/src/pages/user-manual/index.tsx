import { useState, useRef, useMemo, useEffect, useCallback } from "react";
import Layout from "@/components/Layout";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { IconHelp } from "@/components/icons";import { useAuth } from "@/lib/auth";
import { USER_MANUAL_SECTIONS } from "./constants";
import { UserManualTOC } from "./UserManualTOC";
import { UserManualContent } from "./UserManualContent";

interface UserManualProps {
  embedded?: boolean;
}

export default function UserManual({ embedded }: UserManualProps) {
  const { isAdmin } = useAuth();
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());
  const sectionRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const pendingHashRef = useRef<string | null>(null);

  const visibleSections = useMemo(() =>
    USER_MANUAL_SECTIONS.filter((s) => {
      if (s.access === "all") return true;
      if (s.access === "management") return true;
      if (s.access === "admin") return isAdmin;
      return false;
    }),
    [isAdmin]
  );

  const toggleSection = (id: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const scrollToSection = useCallback((id: string) => {
    const el = sectionRefs.current[id];
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
      setExpandedSections((prev) => new Set(prev).add(id));
      pendingHashRef.current = null;
    }
  }, []);

  const registerSectionRef = useCallback((id: string, el: HTMLDivElement | null) => {
    sectionRefs.current[id] = el;
    if (el && pendingHashRef.current === id) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
      setExpandedSections((prev) => new Set(prev).add(id));
      pendingHashRef.current = null;
    }
  }, []);

  useEffect(() => {
    const hash = window.location.hash.slice(1);
    if (!hash) return;
    pendingHashRef.current = hash;
    scrollToSection(hash);
  }, [scrollToSection]);

  const Wrapper = embedded ? ({ children }: { children: React.ReactNode }) => <>{children}</> : Layout;

  return (
    <Wrapper>
      <div className="space-y-8">
        {!embedded && (
          <PageHeader
            title="User Manual"
            subtitle="H+ Analytics — Portal Guide"
            variant="dark"
          />
        )}

        <Card className="bg-primary/5 border-primary/20">
          <div className="p-6">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
                <IconHelp className="w-6 h-6 text-primary" />
              </div>
              <div>
                <h3 className="font-semibold text-lg mb-2">Welcome to H+ Analytics</h3>
                <p className="text-sm text-muted-foreground">
                  This manual covers everything you need to know about using the portal — from navigating the interface
                  and managing properties to running financial analyses and exporting reports. Use the table of contents
                  on the left to jump to any section.
                </p>
              </div>
            </div>
          </div>
        </Card>

        <div className="flex gap-6">
          <UserManualTOC sections={visibleSections} scrollToSection={scrollToSection} />
          <UserManualContent
            sections={visibleSections}
            expandedSections={expandedSections}
            toggleSection={toggleSection}
            registerSectionRef={registerSectionRef}
          />
        </div>
      </div>
    </Wrapper>
  );
}
