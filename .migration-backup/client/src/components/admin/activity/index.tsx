import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { IconClock, IconActivity, IconFileCheck, IconShare } from "@/components/icons";
import type { User, LoginLog, ActivityLogEntry, CheckerActivityData, ActiveSession, ActivitySubView } from "../types";
import { ActivityLogList } from "./ActivityLogList";
import { ActivityFeed } from "./ActivityFeed";
import { CheckerActivity } from "./CheckerActivity";
import { SharingLog } from "./SharingLog";

export default function ActivityTab() {
  const [activitySubTab, setActivitySubTab] = useState<ActivitySubView>("login");
  const [loginLogUserFilter, setLoginLogUserFilter] = useState<string>("");
  const [loginLogIpFilter, setLoginLogIpFilter] = useState<string>("");
  const [activityEntityFilter, setActivityEntityFilter] = useState<string>("");
  const [activityUserFilter, setActivityUserFilter] = useState<string>("");

  const { data: users } = useQuery<User[]>({
    queryKey: ["admin", "users"],
    queryFn: async () => {
      const res = await fetch("/api/admin/users", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch users");
      return res.json();
    },
  });

  const { data: loginLogs, isLoading: logsLoading } = useQuery<LoginLog[]>({
    queryKey: ["admin", "login-logs"],
    queryFn: async () => {
      const res = await fetch("/api/admin/login-logs", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch login logs");
      return res.json();
    },
  });

  const { data: activityLogs, isLoading: activityLogsLoading } = useQuery<ActivityLogEntry[]>({
    queryKey: ["admin", "activity-logs", activityEntityFilter, activityUserFilter],
    queryFn: async () => {
      const params = new URLSearchParams({ limit: "50" });
      if (activityEntityFilter) params.set("entityType", activityEntityFilter);
      if (activityUserFilter) params.set("userId", activityUserFilter);
      const res = await fetch(`/api/activity-logs?${params}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch activity logs");
      return res.json();
    },
  });

  const { data: checkerActivity } = useQuery<CheckerActivityData>({
    queryKey: ["admin", "checker-activity"],
    queryFn: async () => {
      const res = await fetch("/api/admin/checker-activity", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch checker activity");
      return res.json();
    },
    enabled: activitySubTab === "checker",
  });

  const { data: activeSessionsList } = useQuery<ActiveSession[]>({
    queryKey: ["admin", "active-sessions"],
    queryFn: async () => {
      const res = await fetch("/api/admin/active-sessions", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch active sessions");
      return res.json();
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 p-1 bg-muted border border-border/60 rounded-xl w-fit">
        <Button
          variant={activitySubTab === "login" ? "default" : "ghost"}
          size="sm"
          onClick={() => setActivitySubTab("login")}
          className="rounded-lg font-display"
          data-testid="button-activity-subtab-login"
        >
          <IconClock className="w-4 h-4 mr-2" />
          Login Log
        </Button>
        <Button
          variant={activitySubTab === "feed" ? "default" : "ghost"}
          size="sm"
          onClick={() => setActivitySubTab("feed")}
          className="rounded-lg font-display"
          data-testid="button-activity-subtab-feed"
        >
          <IconActivity className="w-4 h-4 mr-2" />
          Activity Feed
        </Button>
        <Button
          variant={activitySubTab === "sharing" ? "default" : "ghost"}
          size="sm"
          onClick={() => setActivitySubTab("sharing")}
          className="rounded-lg font-display"
          data-testid="button-activity-subtab-sharing"
        >
          <IconShare className="w-4 h-4 mr-2" />
          Sharing Log
        </Button>
        <Button
          variant={activitySubTab === "checker" ? "default" : "ghost"}
          size="sm"
          onClick={() => setActivitySubTab("checker")}
          className="rounded-lg font-display"
          data-testid="button-activity-subtab-checker"
        >
          <IconFileCheck className="w-4 h-4 mr-2" />
          Checker Activity
        </Button>
      </div>

      {activitySubTab === "login" && (
        <ActivityLogList
          users={users}
          loginLogs={loginLogs}
          logsLoading={logsLoading}
          activeSessionsList={activeSessionsList}
          loginLogUserFilter={loginLogUserFilter}
          setLoginLogUserFilter={setLoginLogUserFilter}
          loginLogIpFilter={loginLogIpFilter}
          setLoginLogIpFilter={setLoginLogIpFilter}
        />
      )}
      {activitySubTab === "feed" && (
        <ActivityFeed
          users={users}
          activityLogs={activityLogs}
          activityLogsLoading={activityLogsLoading}
          activityEntityFilter={activityEntityFilter}
          setActivityEntityFilter={setActivityEntityFilter}
          activityUserFilter={activityUserFilter}
          setActivityUserFilter={setActivityUserFilter}
        />
      )}
      {activitySubTab === "sharing" && (
        <SharingLog users={users} />
      )}
      {activitySubTab === "checker" && (
        <CheckerActivity checkerActivity={checkerActivity} />
      )}
    </div>
  );
}
