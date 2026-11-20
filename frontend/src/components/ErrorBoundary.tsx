import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
  info: ErrorInfo | null;
  copied: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, info: null, copied: false };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    this.setState({ error, info });
  }

  private handleCopy = async () => {
    const { error, info } = this.state;
    const text = [
      `Error: ${error?.message ?? 'Unknown error'}`,
      `URL: ${window.location.href}`,
      `User-Agent: ${navigator.userAgent}`,
      `Stack:\n${error?.stack ?? ''}`,
      `Component Stack:\n${info?.componentStack ?? ''}`,
    ].join('\n\n');
    await navigator.clipboard.writeText(text);
    this.setState({ copied: true });
    setTimeout(() => this.setState({ copied: false }), 2000);
  };

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="min-h-screen bg-[#0b0f17] text-slate-100 p-6 flex items-start justify-center">
        <div className="w-full max-w-3xl border border-slate-700 rounded-lg bg-[#111827] p-6 space-y-4">
          <h1 className="text-xl font-semibold text-red-400">Application Error</h1>
          <p className="text-sm text-slate-300">
            An unexpected rendering error occurred. You can copy the diagnostic details below and reload the page.
          </p>
          <div className="p-3 rounded bg-slate-950 border border-slate-800 text-xs font-mono text-red-300 whitespace-pre-wrap select-all">
            {this.state.error.message}
          </div>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="px-4 py-2 rounded bg-amber-500 text-slate-950 font-medium text-sm cursor-pointer"
            >
              Reload page
            </button>
            <button
              type="button"
              onClick={this.handleCopy}
              className="px-4 py-2 rounded border border-slate-600 text-slate-200 text-sm cursor-pointer"
            >
              {this.state.copied ? 'Copied' : 'Copy diagnostics'}
            </button>
          </div>
          {this.state.error.stack && (
            <pre className="p-3 rounded bg-slate-950 border border-slate-800 text-xs font-mono text-slate-400 overflow-x-auto select-all">
              {this.state.error.stack}
            </pre>
          )}
        </div>
      </div>
    );
  }
}
