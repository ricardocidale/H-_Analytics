import { UserButton } from "@clerk/nextjs";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      {/* ── Header ─────────────────────────────────────────────── */}
      <header className="sticky top-0 z-50 flex h-14 items-center justify-between border-b border-border bg-background/80 px-6 backdrop-blur">
        <div className="flex items-center gap-3">
          {/* Replace with your app logo/name */}
          <svg
            width="28"
            height="28"
            viewBox="0 0 100 100"
            className="text-primary"
          >
            <rect
              width="100"
              height="100"
              rx="20"
              fill="currentColor"
            />
            <text
              x="50"
              y="68"
              textAnchor="middle"
              fill="white"
              fontSize="52"
              fontWeight="bold"
              fontFamily="system-ui"
            >
              N
            </text>
          </svg>
          <span className="text-lg font-semibold tracking-tight">
            Norfolk AI
          </span>
        </div>

        <UserButton afterSignOutUrl="/sign-in" />
      </header>

      {/* ── Main content ───────────────────────────────────────── */}
      <main className="flex-1 p-6">{children}</main>
    </div>
  );
}
