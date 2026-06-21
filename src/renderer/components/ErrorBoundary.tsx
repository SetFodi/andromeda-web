import { Component, type ErrorInfo, type ReactNode } from "react";

type ErrorBoundaryProps = {
  children: ReactNode;
};

type ErrorBoundaryState = {
  error: Error | null;
};

const RECOVERY_STYLES = `
.error-boundary {
  position: fixed;
  inset: 0;
  z-index: 9999;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 32px;
  background: var(--bg-base);
  color: var(--text);
  font-family: var(--font-sans);
}
.error-boundary-card {
  width: 100%;
  max-width: 420px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 28px;
  text-align: center;
  border-radius: var(--r-xl);
  background: var(--surface-raised);
  border: 1px solid var(--border-soft);
  box-shadow: var(--shadow-lg);
}
.error-boundary-title {
  margin: 0;
  font-size: 19px;
  font-weight: 600;
}
.error-boundary-lede {
  margin: 0;
  font-size: 14px;
  color: var(--text-soft);
}
.error-boundary-details {
  text-align: left;
  padding: 10px 12px;
  border-radius: var(--r-md);
  background: var(--surface-sunken);
  border: 1px solid var(--border-soft);
  font-size: 12px;
  color: var(--text-muted);
}
.error-boundary-details summary {
  cursor: pointer;
  user-select: none;
  color: var(--text-soft);
}
.error-boundary-details pre {
  margin: 10px 0 0;
  white-space: pre-wrap;
  word-break: break-word;
  font-family: var(--font-sans);
  color: var(--text-muted);
}
.error-boundary-actions {
  display: flex;
  gap: 10px;
  justify-content: center;
  margin-top: 4px;
}
.error-boundary-btn {
  appearance: none;
  padding: 9px 18px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  color: var(--text);
  background: var(--surface-solid);
  border: 1px solid var(--border);
  border-radius: var(--r-full);
  transition: background var(--dur-fast) var(--ease-out), transform var(--dur-fast) var(--ease-out);
}
.error-boundary-btn:hover {
  background: var(--hover);
}
.error-boundary-btn:active {
  transform: translateY(1px);
}
.error-boundary-btn.is-primary {
  color: var(--text-inverse);
  background: var(--accent);
  border-color: transparent;
  box-shadow: var(--shadow-accent);
}
.error-boundary-btn.is-primary:hover {
  background: var(--accent-strong);
}
`;

/**
 * The single class component in the app: React error boundaries have no hooks
 * equivalent. Catches a render-time crash anywhere below it and swaps in a calm
 * recovery card instead of a blank white window, so the user can reload or copy
 * a report rather than lose the session to an unhandled exception.
 */
export default class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("Andromeda hit an unexpected error", error, info.componentStack);
  }

  private handleReload = (): void => {
    window.location.reload();
  };

  private handleReportCopy = (): void => {
    const { error } = this.state;
    if (!error) {
      return;
    }
    const report = `${error.message}\n\n${error.stack ?? ""}`.trim();
    void navigator.clipboard.writeText(report);
  };

  render(): ReactNode {
    const { error } = this.state;
    if (!error) {
      return this.props.children;
    }

    return (
      <div className="error-boundary" role="alert">
        <style>{RECOVERY_STYLES}</style>
        <div className="error-boundary-card">
          <h1 className="error-boundary-title">Something went wrong</h1>
          <p className="error-boundary-lede">Your tabs and data are safe.</p>
          <details className="error-boundary-details">
            <summary>Details</summary>
            <pre>{error.message}</pre>
          </details>
          <div className="error-boundary-actions">
            <button
              type="button"
              className="error-boundary-btn is-primary"
              onClick={this.handleReload}
            >
              Reload
            </button>
            <button type="button" className="error-boundary-btn" onClick={this.handleReportCopy}>
              Report copy
            </button>
          </div>
        </div>
      </div>
    );
  }
}
