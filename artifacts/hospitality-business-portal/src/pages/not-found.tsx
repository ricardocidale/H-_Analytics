import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { IconAlertCircle, IconHome } from "@/components/icons";
import { Link } from "wouter";
import { useAuth } from "@/lib/auth";
import Layout from "@/components/Layout";
import { AnimatedPage } from "@/components/graphics/AnimatedPage";

function NotFoundContent() {
  return (
    <AnimatedPage>
    <Card className="w-full max-w-md mx-auto">
      <CardContent className="pt-6">
        <div className="flex mb-4 gap-2">
          <IconAlertCircle className="h-8 w-8 text-destructive" />
          <h1 className="text-2xl font-bold text-foreground">Page Not Found</h1>
        </div>

        <p className="mt-4 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or may have been moved.
        </p>

        <Link href="/">
          <Button className="mt-6" data-testid="button-go-home">
            <IconHome className="w-4 h-4" />
            Go to Dashboard
          </Button>
        </Link>
      </CardContent>
    </Card>
    </AnimatedPage>
  );
}

export default function NotFound() {
  const { user } = useAuth();

  if (user) {
    return (
      <Layout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <NotFoundContent />
        </div>
      </Layout>
    );
  }

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-muted">
      <NotFoundContent />
    </div>
  );
}
