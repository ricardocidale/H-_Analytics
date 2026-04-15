/**
 * ErrorBoundary.tsx — React error boundary for graceful crash recovery.
 *
 * Wraps child components in a class-based error boundary. If any child
 * throws during rendering, the boundary catches the error and displays
 * a friendly fallback UI with a "Try Again" button instead of a blank
 * screen. Used at the top level of the app and around critical sections
 * like financial calculations that depend on user-supplied data.
 */
import React from "react";
import { Button } from "@/components/ui/button";
import { IconAlertTriangle, IconRefreshCw } from "@/components/icons";
import { captureClientException } from "@/lib/sentry";

interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("ErrorBoundary caught:", error, errorInfo);
    captureClientException(error, { boundary: "ErrorBoundary" });
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <div className="min-h-screen flex items-center justify-center bg-background">
          <div className="max-w-md mx-auto p-8 text-center">
            <IconAlertTriangle className="w-12 h-12 text-accent-pop mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-foreground mb-2">Something went wrong</h2>
            <p className="text-muted-foreground mb-4 text-sm">
              Something went wrong. Please reload the page.
            </p>
            <Button onClick={() => window.location.reload()}>
              <IconRefreshCw className="w-4 h-4" />
              Reload page
            </Button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

interface SelfHealingBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
  maxRetries?: number;
  retryDelayMs?: number;
}

interface SelfHealingBoundaryState {
  hasError: boolean;
  error: Error | null;
  retryCount: number;
  retryKey: number;
}

export class SelfHealingBoundary extends React.Component<SelfHealingBoundaryProps, SelfHealingBoundaryState> {
  private retryTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(props: SelfHealingBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null, retryCount: 0, retryKey: 0 };
  }

  static getDerivedStateFromError(error: Error): Partial<SelfHealingBoundaryState> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    const maxRetries = this.props.maxRetries ?? 3;
    const nextRetry = this.state.retryCount + 1;
    if (nextRetry > maxRetries) {
      console.error("SelfHealingBoundary exhausted retries:", error?.message, errorInfo?.componentStack);
      captureClientException(error, { boundary: "SelfHealingBoundary" });
      return;
    }
    if (this.retryTimer) clearTimeout(this.retryTimer);
    // Exponential backoff: 300ms → 900ms → 2700ms — gives async queries time to resolve
    const baseDelay = this.props.retryDelayMs ?? 300;
    const delay = baseDelay * Math.pow(3, this.state.retryCount);
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      this.setState((prev) => ({
        hasError: false,
        error: null,
        retryCount: prev.retryCount + 1,
        retryKey: prev.retryKey + 1,
      }));
    }, delay);
  }

  componentWillUnmount() {
    if (this.retryTimer) clearTimeout(this.retryTimer);
  }

  render() {
    if (this.state.hasError) {
      const maxRetries = this.props.maxRetries ?? 3;
      if (this.state.retryCount + 1 > maxRetries) {
        if (this.props.fallback) return this.props.fallback;
        return (
          <div className="w-full p-8 text-center">
            <IconAlertTriangle className="w-10 h-10 text-accent-pop mx-auto mb-3" />
            <h3 className="text-lg font-semibold text-foreground mb-2">Failed to load</h3>
            <p className="text-muted-foreground text-sm mb-4">
              A component error occurred. Try again or reload the page.
            </p>
            <div className="flex items-center justify-center gap-3">
              <Button onClick={() => this.setState({ hasError: false, error: null, retryCount: 0, retryKey: this.state.retryKey + 1 })}>
                <IconRefreshCw className="w-4 h-4" />
                Try Again
              </Button>
              <Button variant="outline" onClick={() => window.location.reload()}>
                Reload page
              </Button>
            </div>
          </div>
        );
      }
      return null;
    }
    return <React.Fragment key={this.state.retryKey}>{this.props.children}</React.Fragment>;
  }
}

export class FinancialErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("Financial calculation error:", error, errorInfo);
    captureClientException(error, { boundary: "FinancialErrorBoundary" });
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <div className="w-full p-8 text-center">
          <IconAlertTriangle className="w-10 h-10 text-accent-pop mx-auto mb-3" />
          <h3 className="text-lg font-semibold text-foreground mb-2">Calculation Error</h3>
          <p className="text-muted-foreground text-sm mb-4">
            A financial calculation failed. This may be caused by invalid property or assumption data.
          </p>
          <p className="text-muted-foreground text-xs mb-4">
            Something went wrong. Please reload the page.
          </p>
          <Button onClick={() => this.setState({ hasError: false, error: null })}>
            <IconRefreshCw className="w-4 h-4" />
            Retry
          </Button>
        </div>
      );
    }
    return this.props.children;
  }
}
