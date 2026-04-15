import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AGENT_PERSONAS, type AgentPersona } from "@shared/agent-personas";
import { IconSparkles, IconBot } from "@/components/icons";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";

function PersonaCard({ persona }: { persona: AgentPersona }) {
  const icon = persona.type === "intelligence"
    ? <IconSparkles className="w-5 h-5 text-primary" />
    : <IconBot className="w-5 h-5 text-primary" />;

  return (
    <Card className="border-border/60" data-testid={`card-persona-${persona.id}`}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-primary/10">
              {icon}
            </div>
            <div>
              <CardTitle className="text-lg" data-testid={`text-persona-name-${persona.id}`}>
                {persona.name}
              </CardTitle>
              <CardDescription className="text-xs mt-0.5">
                {persona.subtitle}
              </CardDescription>
            </div>
          </div>
          <Badge variant="secondary" className="text-xs whitespace-nowrap" data-testid={`badge-persona-${persona.id}`}>
            {persona.badge}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground leading-relaxed" data-testid={`text-persona-desc-${persona.id}`}>
          {persona.description}
        </p>
        <div>
          <p className="text-xs font-medium text-foreground mb-2">Key capabilities</p>
          <ul className="space-y-1.5">
            {persona.capabilities.map((cap, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-primary/60 flex-shrink-0" />
                {cap}
              </li>
            ))}
          </ul>
        </div>
        <PersonaStats persona={persona} />
      </CardContent>
    </Card>
  );
}

function PersonaStats({ persona }: { persona: AgentPersona }) {
  if (persona.type === "intelligence") {
    const { data: stats } = useQuery({
      queryKey: ["/api/guidance/stats"],
      retry: false,
    });

    const guidanceCount = (stats as any)?.totalNotes ?? "—";
    const avgConviction = (stats as any)?.averageConviction ?? "—";

    return (
      <div className="flex items-center gap-4 pt-2 border-t border-border/40">
        <StatItem label="Analyst Notes" value={String(guidanceCount)} testId="stat-analyst-notes" />
        <StatItem label="Avg. conviction" value={String(avgConviction)} testId="stat-avg-conviction" />
      </div>
    );
  }

  const { data: stats } = useQuery({
    queryKey: ["/api/rebecca/stats"],
    retry: false,
  });

  const conversations = (stats as any)?.totalConversations ?? "—";
  const messagesToday = (stats as any)?.messagesToday ?? "—";

  return (
    <div className="flex items-center gap-4 pt-2 border-t border-border/40">
      <StatItem label="Conversations" value={String(conversations)} testId="stat-conversations" />
      <StatItem label="Messages today" value={String(messagesToday)} testId="stat-messages-today" />
    </div>
  );
}

function StatItem({ label, value, testId }: { label: string; value: string; testId: string }) {
  return (
    <div className="flex flex-col" data-testid={testId}>
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm font-medium">{value}</span>
    </div>
  );
}

export default function AgentPersonasTab() {
  return (
    <div className="space-y-6" data-testid="agent-personas-tab">
      <div>
        <h3 className="text-lg font-semibold" data-testid="text-personas-title">AI Agents</h3>
        <p className="text-sm text-muted-foreground mt-1">
          Two AI agents power the H+ Analytics experience. These personas are defined in code and are not user-configurable.
        </p>
      </div>
      <div className="grid gap-6 md:grid-cols-2">
        {AGENT_PERSONAS.map((persona) => (
          <PersonaCard key={persona.id} persona={persona} />
        ))}
      </div>
    </div>
  );
}
