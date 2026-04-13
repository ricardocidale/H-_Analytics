import { useState, useCallback, lazy, Suspense } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Loader2, Scale } from "@/components/icons/themed-icons";
import { IconCheckCircle2, IconXCircle, IconAlertTriangle, IconPlayCircle, IconSparkles, IconFileDown, IconDownload, IconGauge } from "@/components/icons";
import { useToast } from "@/hooks/use-toast";
// jspdf and jspdf-autotable are dynamically imported in export handlers

import { useGlobalAssumptions } from "@/lib/api/admin";
import { useProperties } from "@/lib/api/properties";
import { useVerificationHistory, useRunVerification, useRunSuites } from "./hooks";
import { VerificationResults } from "./VerificationResults";
import { VerificationHistory } from "./VerificationHistory";
import { AIReviewPanel } from "./AIReviewPanel";
import { SuiteSelector, SUITE_DEFINITIONS } from "./SuiteSelector";
import { GoldenScenarioResults } from "./GoldenScenarioResults";
import { IdentityDashboard } from "./IdentityDashboard";
import type { VerificationResult, SuiteId, SuiteRunResult } from "./types";

const HealthCheckDashboard = lazy(() => import("./HealthCheckDashboard"));
const CalcAuditViewer = lazy(() => import("./CalcAuditViewer"));
const TestingDashboard = lazy(() => import("./TestingDashboard"));

export default function VerificationTab() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<"results" | "history" | "identities" | "ai" | "pipeline" | "calc-audit" | "testing">("results");
  const [verificationResults, setVerificationResults] = useState<VerificationResult | null>(null);
  const [aiReview, setAiReview] = useState<string>("");
  const [aiReviewLoading, setAiReviewLoading] = useState(false);

  // Suite selector state
  const [selectedSuites, setSelectedSuites] = useState<Set<SuiteId>>(() => new Set<SuiteId>(["independent-recheck", "formula-identity", "gaap-audit", "cross-validation"]));
  const [suiteResults, setSuiteResults] = useState<Map<SuiteId, SuiteRunResult>>(new Map());
  const [runningSuites, setRunningSuites] = useState<Set<SuiteId>>(new Set());

  const { data: verificationHistory } = useVerificationHistory();
  const { data: properties } = useProperties();
  const { data: globalAssumptions } = useGlobalAssumptions();

  // Legacy full audit (still available as "Run All")
  const runVerification = useRunVerification((data) => {
    setVerificationResults(data);
    setAiReview("");
  });

  // Suite-based execution
  const runSuites = useRunSuites(
    // Per-suite callback
    (suiteId, result) => {
      setSuiteResults(prev => new Map(prev).set(suiteId, result));
      setRunningSuites(prev => { const next = new Set(prev); next.delete(suiteId); return next; });
    },
    // All complete callback
    (results) => {
      setSuiteResults(results);
      setRunningSuites(new Set());
      // If independent recheck ran, also set verificationResults for the detailed view
      const recheckResult = results.get("independent-recheck");
      if (recheckResult?.data) {
        setVerificationResults(recheckResult.data);
      }
    }
  );

  const handleRunSelected = useCallback(() => {
    if (selectedSuites.size === 0) {
      toast({ title: "No suites selected", description: "Select at least one verification suite to run.", variant: "destructive" });
      return;
    }
    setRunningSuites(new Set(selectedSuites));
    setSuiteResults(new Map());
    runSuites.mutate(selectedSuites);
  }, [selectedSuites, runSuites, toast]);

  const handleRunAll = useCallback(() => {
    runVerification.mutate();
  }, [runVerification]);

  const handleToggleSuite = useCallback((id: SuiteId) => {
    setSelectedSuites(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const handleSelectAll = useCallback(() => {
    setSelectedSuites(prev =>
      prev.size === SUITE_DEFINITIONS.length
        ? new Set()
        : new Set(SUITE_DEFINITIONS.map(s => s.id))
    );
  }, []);

  const runAiVerification = async () => {
    setAiReviewLoading(true);
    setAiReview("");
    try {
      const res = await fetch("/api/verification/ai-review", { method: "POST", credentials: "include" });
      if (!res.ok) {
        const ct = res.headers.get("content-type") || "";
        if (!ct.includes("application/json") && !ct.includes("text/event-stream")) {
          throw new Error(`AI verification: server returned ${res.status} (non-JSON)`);
        }
        throw new Error("AI verification failed");
      }
      const reader = res.body?.getReader();
      if (!reader) throw new Error("No response body");
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const parsed = JSON.parse(line.slice(6));
              if (parsed.content) {
                setAiReview(prev => prev + parsed.content);
              }
            } catch { /* incomplete SSE chunk */ }
          }
        }
      }
    } catch (error: unknown) {
      toast({ title: "AI Review Failed", description: error instanceof Error ? error.message : "AI review failed", variant: "destructive" });
    } finally {
      setAiReviewLoading(false);
    }
  };

  const exportVerificationPDF = async () => {
    if (!verificationResults) return;
    const { default: jsPDF } = await import("jspdf");
    const { default: autoTable } = await import("jspdf-autotable");
    const { PAGE_DIMS } = await import("@/lib/exports/exportStyles");
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: [PAGE_DIMS.PORTRAIT_W, PAGE_DIMS.PORTRAIT_H] });
    const pageWidth = doc.internal.pageSize.getWidth();
    let y = 20;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.text("Independent Financial Verification Report", pageWidth / 2, y, { align: "center" });
    y += 8;
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text(`Hospitality Business Company | ${new Date(verificationResults.timestamp).toLocaleDateString()}`, pageWidth / 2, y, { align: "center" });
    y += 12;

    const opinion = verificationResults.summary.auditOpinion;
    const status = verificationResults.summary.overallStatus;
    doc.setFillColor(opinion === "UNQUALIFIED" ? 34 : opinion === "QUALIFIED" ? 200 : 220,
                     opinion === "UNQUALIFIED" ? 125 : opinion === "QUALIFIED" ? 180 : 50,
                     opinion === "UNQUALIFIED" ? 65 : opinion === "QUALIFIED" ? 30 : 50);
    doc.rect(14, y, pageWidth - 28, 12, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text(`Audit Opinion: ${opinion} | Overall Status: ${status}`, pageWidth / 2, y + 8, { align: "center" });
    doc.setTextColor(0, 0, 0);
    y += 18;

    const s = verificationResults.summary;
    autoTable(doc, {
      startY: y,
      head: [["Total Checks", "Passed", "Failed", "Critical Issues", "Material Issues"]],
      body: [[s.totalChecks, s.totalPassed, s.totalFailed, s.criticalIssues, s.materialIssues]],
      theme: "grid",
      headStyles: { fillColor: [45, 74, 94], fontSize: 9 },
      bodyStyles: { halign: "center", fontSize: 10, fontStyle: "bold" },
      margin: { left: 14, right: 14 },
    });
    y = doc.lastAutoTable!.finalY + 8;

    if (verificationResults.clientKnownValueTests) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.text("Known-Value Test Cases", 14, y);
      y += 5;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7);
      const testLines = verificationResults.clientKnownValueTests.results.split("\n");
      for (const line of testLines) {
        if (y > doc.internal.pageSize.getHeight() - 20) { doc.addPage(); y = 20; }
        doc.text(line, 14, y);
        y += 3.5;
      }
      y += 5;
    }

    for (const propResult of verificationResults.propertyResults) {
      if (y > doc.internal.pageSize.getHeight() - 40) { doc.addPage(); y = 20; }
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.text(`${propResult.propertyName} (${propResult.propertyType})`, 14, y);
      y += 2;

      const rows = propResult.checks.map(c => [
        c.passed ? "PASS" : "FAIL",
        c.severity.toUpperCase(),
        c.gaapRef,
        c.metric,
        c.formula.length > 50 ? c.formula.slice(0, 50) + "..." : c.formula,
      ]);

      autoTable(doc, {
        startY: y,
        head: [["Status", "Severity", "GAAP Ref", "Metric", "Formula"]],
        body: rows,
        theme: "striped",
        headStyles: { fillColor: [45, 74, 94], fontSize: 7 },
        bodyStyles: { fontSize: 6.5 },
        columnStyles: {
          0: { cellWidth: 14, halign: "center", fontStyle: "bold" },
          1: { cellWidth: 18 },
          2: { cellWidth: 22 },
          3: { cellWidth: 45 },
        },
        didParseCell: (data: any) => {
          if (data.column.index === 0 && data.cell.raw === "PASS") {
            data.cell.styles.textColor = [34, 125, 65];
          } else if (data.column.index === 0 && data.cell.raw === "FAIL") {
            data.cell.styles.textColor = [220, 50, 50];
          }
        },
        margin: { left: 14, right: 14 },
      });
      y = doc.lastAutoTable!.finalY + 6;
    }

    if (verificationResults.companyChecks.length > 0) {
      if (y > doc.internal.pageSize.getHeight() - 40) { doc.addPage(); y = 20; }
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.text("Management Company Checks", 14, y);
      y += 2;
      const rows = verificationResults.companyChecks.map(c => [
        c.passed ? "PASS" : "FAIL", c.severity.toUpperCase(), c.gaapRef, c.metric, c.formula.length > 50 ? c.formula.slice(0, 50) + "..." : c.formula
      ]);
      autoTable(doc, {
        startY: y, head: [["Status", "Severity", "GAAP Ref", "Metric", "Formula"]], body: rows, theme: "striped",
        headStyles: { fillColor: [45, 74, 94], fontSize: 7 }, bodyStyles: { fontSize: 6.5 },
        columnStyles: { 0: { cellWidth: 14, halign: "center", fontStyle: "bold" }, 1: { cellWidth: 18 }, 2: { cellWidth: 22 }, 3: { cellWidth: 45 } },
        didParseCell: (data: any) => {
          if (data.column.index === 0 && data.cell.raw === "PASS") data.cell.styles.textColor = [34, 125, 65];
          else if (data.column.index === 0 && data.cell.raw === "FAIL") data.cell.styles.textColor = [220, 50, 50];
        },
        margin: { left: 14, right: 14 },
      });
      y = doc.lastAutoTable!.finalY + 6;
    }

    if (verificationResults.consolidatedChecks.length > 0) {
      if (y > doc.internal.pageSize.getHeight() - 40) { doc.addPage(); y = 20; }
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.text("Consolidated Portfolio Checks", 14, y);
      y += 2;
      const rows = verificationResults.consolidatedChecks.map(c => [
        c.passed ? "PASS" : "FAIL", c.severity.toUpperCase(), c.gaapRef, c.metric, c.formula.length > 50 ? c.formula.slice(0, 50) + "..." : c.formula
      ]);
      autoTable(doc, {
        startY: y, head: [["Status", "Severity", "GAAP Ref", "Metric", "Formula"]], body: rows, theme: "striped",
        headStyles: { fillColor: [45, 74, 94], fontSize: 7 }, bodyStyles: { fontSize: 6.5 },
        columnStyles: { 0: { cellWidth: 14, halign: "center", fontStyle: "bold" }, 1: { cellWidth: 18 }, 2: { cellWidth: 22 }, 3: { cellWidth: 45 } },
        didParseCell: (data: any) => {
          if (data.column.index === 0 && data.cell.raw === "PASS") data.cell.styles.textColor = [34, 125, 65];
          else if (data.column.index === 0 && data.cell.raw === "FAIL") data.cell.styles.textColor = [220, 50, 50];
        },
        margin: { left: 14, right: 14 },
      });
      y = doc.lastAutoTable!.finalY + 6;
    }

    if (verificationResults.clientAuditReports && verificationResults.clientAuditReports.length > 0) {
      if (y > doc.internal.pageSize.getHeight() - 40) { doc.addPage(); y = 20; }
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.text("Client-Side GAAP Audit Summary", 14, y);
      y += 5;
      const rows = verificationResults.clientAuditReports.flatMap(report =>
        report.sections.map(sec => [
          report.propertyName,
          sec.name,
          `${sec.passed}/${sec.passed + sec.failed}`,
          sec.failed === 0 ? "PASS" : sec.materialIssues > 0 ? "FAIL" : "WARNING",
        ])
      );
      autoTable(doc, {
        startY: y, head: [["Property", "Audit Section", "Checks", "Status"]], body: rows, theme: "striped",
        headStyles: { fillColor: [45, 74, 94], fontSize: 8 }, bodyStyles: { fontSize: 7 },
        didParseCell: (data: any) => {
          if (data.column.index === 3 && data.cell.raw === "PASS") data.cell.styles.textColor = [34, 125, 65];
          else if (data.column.index === 3 && data.cell.raw === "FAIL") data.cell.styles.textColor = [220, 50, 50];
          else if (data.column.index === 3 && data.cell.raw === "WARNING") data.cell.styles.textColor = [200, 150, 0];
        },
        margin: { left: 14, right: 14 },
      });
      y = doc.lastAutoTable!.finalY + 6;
    }

    const pageCount = doc.getNumberOfPages();
    for (let p = 1; p <= pageCount; p++) {
      doc.setPage(p);
      doc.setFontSize(7);
      doc.setFont("helvetica", "normal");
      doc.text(`Hospitality Business - Verification Report | Page ${p} of ${pageCount}`, pageWidth / 2, doc.internal.pageSize.getHeight() - 8, { align: "center" });
    }

    const { saveFile } = await import("@/lib/exports/saveFile");
    await saveFile(doc.output("blob"), `verification-report-${new Date().toISOString().slice(0, 10)}.pdf`);
  };

  const isRunning = runVerification.isPending || runSuites.isPending;

  // Compute suite results summary
  const suiteResultsArray = Array.from(suiteResults.values());
  const totalSuitePassed = suiteResultsArray.filter(r => r.status === "PASS").length;
  const totalSuiteFailed = suiteResultsArray.filter(r => r.status === "FAIL").length;
  const totalSuiteWarning = suiteResultsArray.filter(r => r.status === "WARNING").length;
  const hasSuiteResults = suiteResultsArray.length > 0;
  const overallSuiteStatus = totalSuiteFailed > 0 ? "FAIL" : totalSuiteWarning > 0 ? "WARNING" : "PASS";

  return (
    <Card className="relative overflow-hidden bg-card border border-border/80 shadow-sm">
      <CardHeader className="relative">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <CardTitle className="text-2xl font-semibold tracking-tight text-foreground">
              GAAP Financial Verification
            </CardTitle>
            <CardDescription className="text-muted-foreground font-medium max-w-2xl">
              Select verification suites to run. Each suite independently validates a different aspect of financial accuracy.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            {verificationResults && (
              <Button
                onClick={exportVerificationPDF}
                data-testid="button-export-pdf"
                variant="outline"
                size="sm"
              >
                <IconFileDown className="w-3.5 h-3.5 mr-1.5" />
                Export PDF
              </Button>
            )}
            <Button
              onClick={handleRunSelected}
              disabled={isRunning || selectedSuites.size === 0}
              data-testid="button-run-selected"
              size="sm"
            >
              {runSuites.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : <IconPlayCircle className="w-3.5 h-3.5 mr-1.5" />}
              Run Selected
            </Button>
            <Button
              onClick={handleRunAll}
              disabled={isRunning}
              data-testid="button-run-verification"
              variant="outline"
              size="sm"
            >
              {runVerification.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : <IconPlayCircle className="w-3.5 h-3.5 mr-1.5" />}
              Run All
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="relative pt-2 space-y-6">
        {/* Suite Selector */}
        <SuiteSelector
          selected={selectedSuites}
          onToggle={handleToggleSuite}
          onSelectAll={handleSelectAll}
          lastResults={suiteResults}
          runningSuites={runningSuites}
        />

        {/* Suite Results Summary Banner */}
        {hasSuiteResults && !isRunning && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 p-5 rounded-2xl bg-muted border border-border shadow-inner">
            <div className="space-y-1">
              <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold">Suites Run</p>
              <p className="text-xl font-mono font-black text-foreground">{suiteResultsArray.length}</p>
            </div>
            <div className="space-y-1">
              <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold">Passed</p>
              <p className="text-xl font-mono font-black text-primary">{totalSuitePassed}</p>
            </div>
            <div className="space-y-1">
              <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold">Failed</p>
              <p className={`text-xl font-mono font-black ${totalSuiteFailed > 0 ? "text-destructive" : "text-primary"}`}>{totalSuiteFailed}</p>
            </div>
            {totalSuiteWarning > 0 && (
              <div className="space-y-1">
                <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold">Warnings</p>
                <p className="text-xl font-mono font-black text-accent-pop">{totalSuiteWarning}</p>
              </div>
            )}
            <div className="space-y-1">
              <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold">Overall</p>
              <div className="flex items-center gap-2">
                <span className={`text-xl font-black ${
                  overallSuiteStatus === "PASS" ? "text-secondary" :
                  overallSuiteStatus === "WARNING" ? "text-accent-pop" :
                  "text-destructive"
                }`}>
                  {overallSuiteStatus}
                </span>
                {overallSuiteStatus === "PASS" ? <IconCheckCircle2 className="w-5 h-5 text-secondary" /> :
                 overallSuiteStatus === "WARNING" ? <IconAlertTriangle className="w-5 h-5 text-accent-pop" /> :
                 <IconXCircle className="w-5 h-5 text-destructive" />}
              </div>
            </div>
          </div>
        )}

        {/* Running indicator */}
        {isRunning && (
          <div className="flex flex-col items-center justify-center py-16 space-y-6">
            <div className="relative">
              <div className="w-16 h-16 rounded-full border-4 border-secondary/20 border-t-secondary animate-spin" />
              <div className="absolute inset-0 flex items-center justify-center">
                <IconPlayCircle className="w-6 h-6 text-secondary animate-pulse" />
              </div>
            </div>
            <div className="text-center space-y-2">
              <p className="text-lg font-bold text-foreground animate-pulse">Running Verification...</p>
              <p className="text-sm text-muted-foreground max-w-xs mx-auto">
                {runningSuites.size > 0 ? `${runningSuites.size} suite(s) running` : "Full audit in progress"}
              </p>
            </div>
          </div>
        )}

        {!isRunning && (
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)}>
            <TabsList>
              <TabsTrigger value="results" data-testid="tab-verification-results">
                <IconCheckCircle2 className="w-3.5 h-3.5 mr-1.5" />
                Detailed Results
              </TabsTrigger>
              <TabsTrigger value="identities" data-testid="tab-verification-identities">
                <Scale className="w-3.5 h-3.5 mr-1.5" />
                Identities
              </TabsTrigger>
              <TabsTrigger value="history" data-testid="tab-verification-history">
                <IconDownload className="w-3.5 h-3.5 mr-1.5" />
                Audit History
              </TabsTrigger>
              <TabsTrigger value="ai" data-testid="tab-verification-ai">
                <IconSparkles className="w-3.5 h-3.5 mr-1.5" />
                AI Narrative
              </TabsTrigger>
              <TabsTrigger value="pipeline" data-testid="tab-verification-pipeline">
                <IconGauge className="w-3.5 h-3.5 mr-1.5" />
                Pipeline Health
              </TabsTrigger>
              <TabsTrigger value="calc-audit" data-testid="tab-verification-calc-audit">
                <IconFileDown className="w-3.5 h-3.5 mr-1.5" />
                Calc Audit
              </TabsTrigger>
              <TabsTrigger value="testing" data-testid="tab-verification-testing">
                <IconCheckCircle2 className="w-3.5 h-3.5 mr-1.5" />
                Testing
              </TabsTrigger>
            </TabsList>

            <TabsContent value="results" className="min-h-[300px]">
              {verificationResults ? (
                <div className="space-y-8">
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4 p-6 rounded-xl bg-muted border border-border">
                    <div className="space-y-1">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold">Audit Opinion</p>
                      <div className="flex items-center gap-2">
                        <span className={`text-xl font-black ${
                          verificationResults.summary.auditOpinion === 'UNQUALIFIED' ? 'text-secondary' :
                          verificationResults.summary.auditOpinion === 'QUALIFIED' ? 'text-accent-pop' :
                          'text-destructive'
                        }`}>
                          {verificationResults.summary.auditOpinion}
                        </span>
                        {verificationResults.summary.auditOpinion === 'UNQUALIFIED' ? <IconCheckCircle2 className="w-5 h-5 text-secondary" /> :
                         verificationResults.summary.auditOpinion === 'QUALIFIED' ? <IconAlertTriangle className="w-5 h-5 text-accent-pop" /> :
                         <IconXCircle className="w-5 h-5 text-destructive" />}
                      </div>
                    </div>
                    <div className="space-y-1">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold">Overall Status</p>
                      <p className={`text-xl font-mono font-black ${
                        verificationResults.summary.overallStatus === 'PASS' ? 'text-secondary' :
                        verificationResults.summary.overallStatus === 'WARNING' ? 'text-accent-pop' :
                        'text-destructive'
                      }`}>
                        {verificationResults.summary.overallStatus}
                      </p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold">Total Checks</p>
                      <p className="text-xl font-mono font-black text-foreground">{verificationResults.summary.totalChecks}</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold">Failures</p>
                      <div className="flex items-center gap-2">
                        <p className={`text-xl font-mono font-black ${verificationResults.summary.totalFailed > 0 ? 'text-destructive' : 'text-secondary'}`}>
                          {verificationResults.summary.totalFailed}
                        </p>
                        {verificationResults.summary.criticalIssues > 0 && (
                          <span className="bg-destructive text-white text-[9px] px-1.5 py-0.5 rounded font-bold">
                            {verificationResults.summary.criticalIssues} CRITICAL
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <VerificationResults results={verificationResults} />

                  {suiteResults.get("golden-scenarios")?.data && (
                    <GoldenScenarioResults data={suiteResults.get("golden-scenarios")!.data} />
                  )}
                </div>
              ) : suiteResults.get("golden-scenarios")?.data ? (
                <GoldenScenarioResults data={suiteResults.get("golden-scenarios")!.data} />
              ) : (
                <div className="flex flex-col items-center justify-center py-20 text-muted-foreground space-y-4">
                  <IconPlayCircle className="w-12 h-12 opacity-20" />
                  <p className="text-sm font-medium">Select suites above and click "Run Selected" to start verification.</p>
                </div>
              )}
            </TabsContent>

            <TabsContent value="identities" className="min-h-[300px]">
              <IdentityDashboard
                properties={properties ?? null}
                globalAssumptions={globalAssumptions ?? null}
              />
            </TabsContent>

            <TabsContent value="history" className="min-h-[300px]">
              {verificationHistory && (
                <VerificationHistory history={verificationHistory} />
              )}
            </TabsContent>

            <TabsContent value="ai" className="min-h-[300px]">
              <AIReviewPanel
                review={aiReview}
                loading={aiReviewLoading}
                onRun={runAiVerification}
              />
            </TabsContent>

            <TabsContent value="pipeline" className="min-h-[300px]">
              <Suspense fallback={<div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>}>
                <HealthCheckDashboard />
              </Suspense>
            </TabsContent>

            <TabsContent value="calc-audit" className="min-h-[300px]">
              <Suspense fallback={<div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>}>
                <CalcAuditViewer />
              </Suspense>
            </TabsContent>

            <TabsContent value="testing" className="min-h-[300px]">
              <Suspense fallback={<div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>}>
                <TestingDashboard />
              </Suspense>
            </TabsContent>
          </Tabs>
        )}
      </CardContent>
    </Card>
  );
}
