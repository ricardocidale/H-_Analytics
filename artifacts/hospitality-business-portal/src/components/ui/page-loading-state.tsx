import Layout from "@/components/Layout";
import { Skeleton } from "@/components/ui/skeleton";

export function PageLoadingState() {
  return (
    <Layout>
      <div className="p-6 space-y-6 max-w-5xl animate-pulse">
        <div className="space-y-2">
          <Skeleton className="h-7 w-56" />
          <Skeleton className="h-4 w-80" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
          <Skeleton className="h-28 rounded-lg" />
          <Skeleton className="h-28 rounded-lg" />
          <Skeleton className="h-28 rounded-lg" />
        </div>
        <Skeleton className="h-56 rounded-lg" />
        <Skeleton className="h-36 rounded-lg" />
      </div>
    </Layout>
  );
}
