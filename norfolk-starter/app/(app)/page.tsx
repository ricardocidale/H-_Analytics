export default function HomePage() {
  return (
    <div className="mx-auto max-w-3xl space-y-8 py-12">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">
          Welcome to Norfolk AI
        </h1>
        <p className="text-muted-foreground">
          Your new project is ready. Start building by editing{" "}
          <code className="rounded bg-muted px-1.5 py-0.5 text-sm font-mono">
            app/(app)/page.tsx
          </code>
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card
          title="Database"
          description="Add models in prisma/schema.prisma, then run npm run db:migrate"
        />
        <Card
          title="Authentication"
          description="Clerk is configured — users sign in at /sign-in"
        />
        <Card
          title="UI Components"
          description="Add shadcn components with npx shadcn@latest add <name>"
        />
        <Card
          title="API Routes"
          description="Create handlers in app/api/ using the jsonOk/jsonErr helpers"
        />
      </div>
    </div>
  );
}

function Card({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-5 space-y-1.5">
      <h3 className="font-semibold">{title}</h3>
      <p className="text-sm text-muted-foreground">{description}</p>
    </div>
  );
}
