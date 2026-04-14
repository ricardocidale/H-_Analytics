import { useState, useRef, useCallback } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "@/components/icons/themed-icons";
import { IconMail, IconSend, IconTrash } from "@/components/icons";
import { UserRole } from "@shared/constants";
import { motion, AnimatePresence } from "framer-motion";
import { CheckCircle2, XCircle, AlertCircle } from "lucide-react";

interface InviteResult {
  email: string;
  status: "created" | "existing" | "failed";
  error?: string;
}

interface InviteSummary {
  created: number;
  existing: number;
  failed: number;
}

interface InviteUsersDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function InviteUsersDialog({
  open,
  onOpenChange,
}: InviteUsersDialogProps) {
  const queryClient = useQueryClient();
  const [emails, setEmails] = useState<string[]>([]);
  const [currentEmail, setCurrentEmail] = useState("");
  const [role, setRole] = useState<string>("user");
  const [message, setMessage] = useState("");
  const [results, setResults] = useState<InviteResult[] | null>(null);
  const [summary, setSummary] = useState<InviteSummary | null>(null);
  const [showSuccess, setShowSuccess] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const sendInvitations = useMutation({
    mutationFn: async (data: { emails: string[]; role: string; message?: string }) => {
      const res = await fetch("/api/admin/invitations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to send invitations");
      }
      return res.json() as Promise<{ results: InviteResult[]; summary: InviteSummary }>;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
      setResults(data.results);
      setSummary(data.summary);
      setShowSuccess(true);
    },
  });

  const addEmail = useCallback((emailStr: string) => {
    const trimmed = emailStr.trim().toLowerCase();
    if (!trimmed) return;

    const newEmails = trimmed
      .split(/[,;\s]+/)
      .map(e => e.trim())
      .filter(e => e && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e))
      .filter(e => !emails.includes(e));

    if (newEmails.length > 0) {
      setEmails(prev => [...prev, ...newEmails]);
    }
    setCurrentEmail("");
  }, [emails]);

  const removeEmail = (email: string) => {
    setEmails(prev => prev.filter(e => e !== email));
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === "," || e.key === "Tab") {
      e.preventDefault();
      addEmail(currentEmail);
    }
    if (e.key === "Backspace" && !currentEmail && emails.length > 0) {
      setEmails(prev => prev.slice(0, -1));
    }
  };

  const handleSubmit = () => {
    if (currentEmail.trim()) {
      addEmail(currentEmail);
    }
    const allEmails = [...emails];
    if (currentEmail.trim() && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(currentEmail.trim())) {
      if (!allEmails.includes(currentEmail.trim().toLowerCase())) {
        allEmails.push(currentEmail.trim().toLowerCase());
      }
    }
    if (allEmails.length === 0) return;

    sendInvitations.mutate({
      emails: allEmails,
      role,
      message: message.trim() || undefined,
    });
  };

  const handleClose = (isOpen: boolean) => {
    if (!isOpen) {
      setEmails([]);
      setCurrentEmail("");
      setRole("user");
      setMessage("");
      setResults(null);
      setSummary(null);
      setShowSuccess(false);
    }
    onOpenChange(isOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose} modal={false}>
      <DialogContent className="sm:max-w-lg">
        <AnimatePresence mode="wait">
          {showSuccess && summary ? (
            <motion.div
              key="success"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ duration: 0.4, ease: "easeOut" }}
              className="flex flex-col items-center py-6"
            >
              <motion.div
                initial={{ scale: 0, rotate: -180 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ delay: 0.1, duration: 0.5, type: "spring", stiffness: 200 }}
              >
                <div className="relative">
                  <motion.div
                    className="absolute inset-0 rounded-full bg-emerald-500/20"
                    initial={{ scale: 1 }}
                    animate={{ scale: [1, 1.8, 1.5] }}
                    transition={{ delay: 0.3, duration: 0.8, ease: "easeOut" }}
                  />
                  <CheckCircle2 className="w-16 h-16 text-emerald-500 relative z-10" />
                </div>
              </motion.div>

              <motion.h3
                className="text-xl font-display font-bold mt-5 text-foreground"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4, duration: 0.3 }}
              >
                {summary.created === 1 ? "Invitation Sent!" : `${summary.created} Invitations Sent!`}
              </motion.h3>

              <motion.p
                className="text-sm text-muted-foreground mt-2 text-center"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5, duration: 0.3 }}
              >
                {summary.created > 0 && `${summary.created} new user${summary.created > 1 ? "s" : ""} invited`}
                {summary.existing > 0 && ` · ${summary.existing} already existed`}
                {summary.failed > 0 && ` · ${summary.failed} failed`}
              </motion.p>

              {results && results.length > 0 && (
                <motion.div
                  className="w-full mt-5 space-y-1.5 max-h-48 overflow-y-auto"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.6, duration: 0.3 }}
                >
                  {results.map((r, i) => (
                    <motion.div
                      key={r.email}
                      className="flex items-center gap-2 px-3 py-2 rounded-md bg-muted/50 text-sm"
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.7 + i * 0.08, duration: 0.25 }}
                      data-testid={`invite-result-${r.email}`}
                    >
                      {r.status === "created" && <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />}
                      {r.status === "existing" && <AlertCircle className="w-4 h-4 text-amber-500 shrink-0" />}
                      {r.status === "failed" && <XCircle className="w-4 h-4 text-destructive shrink-0" />}
                      <span className="truncate flex-1">{r.email}</span>
                      <Badge
                        variant={r.status === "created" ? "default" : r.status === "existing" ? "secondary" : "destructive"}
                        className="text-[10px] shrink-0"
                      >
                        {r.status === "created" ? "Invited" : r.status === "existing" ? "Already exists" : "Failed"}
                      </Badge>
                    </motion.div>
                  ))}
                </motion.div>
              )}

              <motion.div
                className="mt-6"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.9, duration: 0.3 }}
              >
                <Button onClick={() => handleClose(false)} data-testid="button-close-invite-success">
                  Done
                </Button>
              </motion.div>
            </motion.div>
          ) : (
            <motion.div
              key="form"
              initial={{ opacity: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.2 }}
            >
              <DialogHeader>
                <DialogTitle className="font-display flex items-center gap-2">
                  <IconSend className="w-5 h-5" />
                  Invite Users
                </DialogTitle>
                <DialogDescription className="label-text">
                  Send invitations to one or more email addresses. Accounts are created automatically.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4 py-4">
                <div>
                  <Label className="label-text font-semibold flex items-center gap-1.5 mb-2">
                    <IconMail className="w-4 h-4" />
                    Email Addresses
                  </Label>
                  <div
                    className="min-h-[42px] flex flex-wrap items-center gap-1.5 p-2 border rounded-md bg-background cursor-text focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-1"
                    onClick={() => inputRef.current?.focus()}
                    data-testid="input-invite-emails-container"
                  >
                    <AnimatePresence>
                      {emails.map(email => (
                        <motion.div
                          key={email}
                          initial={{ opacity: 0, scale: 0.8 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.8 }}
                          transition={{ duration: 0.15 }}
                        >
                          <Badge
                            variant="secondary"
                            className="gap-1 pr-1 text-xs"
                            data-testid={`badge-invite-email-${email}`}
                          >
                            {email}
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); removeEmail(email); }}
                              className="ml-0.5 rounded-full hover:bg-muted-foreground/20 p-0.5"
                              data-testid={`button-remove-email-${email}`}
                            >
                              <IconTrash className="w-3 h-3" />
                            </button>
                          </Badge>
                        </motion.div>
                      ))}
                    </AnimatePresence>
                    <Input
                      ref={inputRef}
                      type="email"
                      placeholder={emails.length === 0 ? "Type email and press Enter..." : "Add more..."}
                      value={currentEmail}
                      onChange={e => setCurrentEmail(e.target.value)}
                      onKeyDown={handleKeyDown}
                      onBlur={() => { if (currentEmail.trim()) addEmail(currentEmail); }}
                      onPaste={(e) => {
                        e.preventDefault();
                        const pasted = e.clipboardData.getData("text");
                        addEmail(pasted);
                      }}
                      className="border-0 shadow-none p-0 h-7 min-w-[160px] flex-1 focus-visible:ring-0 focus-visible:ring-offset-0"
                      data-testid="input-invite-email"
                    />
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Press Enter, comma, or Tab to add. Paste multiple emails at once.
                  </p>
                </div>

                <div>
                  <Label className="label-text font-semibold mb-2 block">Role</Label>
                  <Select value={role} onValueChange={setRole}>
                    <SelectTrigger data-testid="select-invite-role">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={UserRole.USER}>User</SelectItem>
                      <SelectItem value={UserRole.CHECKER}>Checker</SelectItem>
                      <SelectItem value={UserRole.INVESTOR}>Investor</SelectItem>
                      <SelectItem value={UserRole.ADMIN}>Admin</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label className="label-text font-semibold mb-2 block">Personal Message (optional)</Label>
                  <Textarea
                    placeholder="Add a personal note to include in the invitation email..."
                    value={message}
                    onChange={e => setMessage(e.target.value)}
                    rows={2}
                    maxLength={500}
                    className="resize-none"
                    data-testid="input-invite-message"
                  />
                </div>
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => handleClose(false)} data-testid="button-cancel-invite">
                  Cancel
                </Button>
                <Button
                  onClick={handleSubmit}
                  disabled={emails.length === 0 && !currentEmail.trim() || sendInvitations.isPending}
                  data-testid="button-send-invitations"
                >
                  {sendInvitations.isPending ? (
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  ) : (
                    <IconSend className="w-4 h-4 mr-2" />
                  )}
                  {sendInvitations.isPending
                    ? "Sending..."
                    : `Send ${emails.length || (currentEmail.trim() ? 1 : 0)} Invitation${emails.length !== 1 ? "s" : ""}`}
                </Button>
              </DialogFooter>

              {sendInvitations.isError && (
                <p className="text-sm text-destructive mt-2" data-testid="text-invite-error">
                  {sendInvitations.error?.message || "Failed to send invitations."}
                </p>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </DialogContent>
    </Dialog>
  );
}
