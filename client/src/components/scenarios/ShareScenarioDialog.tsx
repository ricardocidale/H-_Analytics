import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Loader2 } from "@/components/icons/themed-icons";
import { IconShare, IconUsers, IconTrash } from "@/components/icons";
import { useShareScenario, useScenarioAccess, useGrantScenarioAccess, useRevokeScenarioAccess } from "@/lib/api";
import type { ScenarioAccessGrant } from "@/lib/api/scenarios";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { motion, AnimatePresence } from "framer-motion";

interface ShareScenarioDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  scenarioId: number;
  scenarioName: string;
}

type Step = "enter" | "confirm" | "success";

export function ShareScenarioDialog({
  open,
  onOpenChange,
  scenarioId,
  scenarioName,
}: ShareScenarioDialogProps) {
  const [email, setEmail] = useState("");
  const [mode, setMode] = useState<"single" | "all">("single");
  const [step, setStep] = useState<Step>("enter");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [recipientName, setRecipientName] = useState<string | null>(null);
  const shareScenario = useShareScenario();
  const { data: grants, isLoading: grantsLoading } = useScenarioAccess();
  const grantAccess = useGrantScenarioAccess();
  const revokeAccess = useRevokeScenarioAccess();
  const { toast } = useToast();

  // Filter grants relevant to this scenario
  const relevantGrants = (grants ?? []).filter(
    (g: ScenarioAccessGrant) => g.grantType === "all" || g.scenarioId === scenarioId
  );

  const resetDialog = () => {
    setEmail("");
    setMode("single");
    setStep("enter");
    setEmailError(null);
    setRecipientName(null);
  };

  const handleClose = () => {
    resetDialog();
    onOpenChange(false);
  };

  const validateEmail = (value: string) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!value.trim()) {
      setEmailError("Please enter an email address");
      return false;
    }
    if (!emailRegex.test(value.trim())) {
      setEmailError("Please enter a valid email address");
      return false;
    }
    setEmailError(null);
    return true;
  };

  const handleProceedToConfirm = () => {
    if (!validateEmail(email)) return;
    setStep("confirm");
  };

  const handleConfirmShare = async () => {
    try {
      const result = await shareScenario.mutateAsync({
        recipientEmail: email.trim(),
        mode,
        scenarioId: mode === "single" ? scenarioId : undefined,
      });
      setRecipientName(result.recipientName);
      setStep("success");
    } catch (error: any) {
      const msg = error.message || "Failed to share scenario";
      if (msg.includes("No user found")) {
        setEmailError("No user found with that email address");
        setStep("enter");
      } else {
        toast({ title: "Error", description: msg, variant: "destructive" });
        setStep("enter");
      }
    }
  };

  const handleRevoke = async (grant: ScenarioAccessGrant) => {
    try {
      await revokeAccess.mutateAsync({
        granteeId: grant.granteeId,
        scenarioId: grant.grantType === "specific" ? grant.scenarioId : null,
      });
      toast({ title: "Access revoked", description: `Removed access for ${grant.granteeName || grant.granteeEmail}` });
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "Failed to revoke access", variant: "destructive" });
    }
  };

  if (step === "confirm") {
    return (
      <AlertDialog open={open} onOpenChange={(o) => { if (!o) handleClose(); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display">Confirm Sharing</AlertDialogTitle>
            <AlertDialogDescription className="label-text">
              {mode === "single"
                ? <>Share scenario <strong>"{scenarioName}"</strong> with <strong>{email.trim()}</strong>?</>
                : <>Share <strong>all your scenarios</strong> with <strong>{email.trim()}</strong>?</>
              }
              <br /><br />
              The recipient will be able to view and load {mode === "single" ? "this scenario" : "your scenarios"} but cannot edit or delete them.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setStep("enter")} data-testid="button-share-back">
              Back
            </AlertDialogCancel>
            <AlertDialogCancel onClick={handleClose} data-testid="button-share-cancel-confirm">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmShare}
              disabled={shareScenario.isPending}
              data-testid="button-share-confirm"
            >
              {shareScenario.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <IconShare className="w-4 h-4 mr-2" />}
              Share
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    );
  }

  if (step === "success") {
    return (
      <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose(); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-display">Shared Successfully</DialogTitle>
            <DialogDescription className="label-text">
              {mode === "single"
                ? <>Scenario <strong>"{scenarioName}"</strong> has been shared with <strong>{recipientName || email.trim()}</strong>.</>
                : <>All your scenarios have been shared with <strong>{recipientName || email.trim()}</strong>.</>
              }
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={handleClose} data-testid="button-share-done">
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-display">Share Scenario</DialogTitle>
          <DialogDescription className="label-text">
            Share "{scenarioName}" with another user by entering their email address.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <label className="label-text">Recipient Email</label>
            <Input
              type="email"
              value={email}
              onChange={(e) => { setEmail(e.target.value); setEmailError(null); }}
              placeholder="colleague@example.com"
              data-testid="input-share-email"
            />
            {emailError && (
              <p className="text-sm text-destructive" data-testid="text-share-email-error">{emailError}</p>
            )}
          </div>
          <div className="space-y-2">
            <label className="label-text">What to share</label>
            <div className="flex gap-3">
              <Button
                variant={mode === "single" ? "default" : "outline"}
                size="sm"
                onClick={() => setMode("single")}
                data-testid="button-share-mode-single"
                className="flex items-center gap-2"
              >
                <IconShare className="w-4 h-4" />
                This scenario only
              </Button>
              <Button
                variant={mode === "all" ? "default" : "outline"}
                size="sm"
                onClick={() => setMode("all")}
                data-testid="button-share-mode-all"
                className="flex items-center gap-2"
              >
                <IconUsers className="w-4 h-4" />
                All my scenarios
              </Button>
            </div>
          </div>

          {/* Current access grants */}
          {relevantGrants.length > 0 && (
            <>
              <Separator />
              <div className="space-y-2">
                <label className="label-text text-muted-foreground text-xs uppercase tracking-wider">Current access</label>
                <AnimatePresence mode="popLayout">
                  {relevantGrants.map((grant: ScenarioAccessGrant) => (
                    <motion.div
                      key={grant.id}
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -4 }}
                      className="flex items-center justify-between p-2 rounded-lg bg-muted border border-border"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-sm text-foreground truncate">
                          {grant.granteeName || grant.granteeEmail}
                        </span>
                        <Badge variant="outline" className="text-xs shrink-0">
                          {grant.grantType === "all" ? "All scenarios" : "This scenario"}
                        </Badge>
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleRevoke(grant)}
                        disabled={revokeAccess.isPending}
                        className="text-destructive/80 hover:text-destructive/60 hover:bg-destructive/10 shrink-0"
                        data-testid={`button-revoke-access-${grant.id}`}
                      >
                        {revokeAccess.isPending ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <IconTrash className="w-3 h-3" />
                        )}
                      </Button>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            </>
          )}

          {grantsLoading && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="w-3 h-3 animate-spin" />
              Loading current access...
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={handleClose} data-testid="button-share-cancel">
            Cancel
          </Button>
          <Button
            onClick={handleProceedToConfirm}
            disabled={!email.trim()}
            data-testid="button-share-next"
            className="flex items-center gap-2"
          >
            <IconShare className="w-4 h-4" />
            Next
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
