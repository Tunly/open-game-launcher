import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { isRouteErrorResponse, useRouteError } from "react-router-dom";

type AppErrorBoundaryProps = {
  children: ReactNode;
};

type AppErrorBoundaryState = {
  error: Error | null;
};

function messageFromUnknown(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (isRouteErrorResponse(error)) {
    return `${error.status} ${error.statusText}`;
  }
  return String(error);
}

function ErrorPanel({ message }: { message: string }) {
  return (
    <main className="neo-dots grid min-h-screen place-items-center bg-[#fbf4e7] p-6 text-[#171411]">
      <section className="w-full max-w-[620px] border-4 border-black bg-[#f6edd8] shadow-[8px_8px_0_#171411]">
        <div className="flex items-center gap-3 border-b-4 border-black bg-[#b7102a] px-4 py-3 text-white">
          <AlertTriangle className="h-7 w-7" />
          <h1 className="neo-title text-3xl uppercase leading-none">Launcher Fault</h1>
        </div>
        <div className="space-y-4 p-4">
          <p className="neo-copy text-[12px] font-black uppercase leading-5 text-[#5b403f]">
            OG-Launcher caught a startup error instead of closing the app.
          </p>
          <pre className="max-h-[180px] overflow-auto whitespace-pre-wrap border-2 border-black bg-[#fff9ed] p-3 text-[11px] font-bold text-[#171411]">
            {message}
          </pre>
          <button
            type="button"
            className="neo-copy inline-flex h-10 items-center gap-2 border-2 border-black bg-[#087d6d] px-4 text-[11px] font-black uppercase text-white shadow-[3px_3px_0_#171411]"
            onClick={() => window.location.reload()}
          >
            <RotateCcw className="h-4 w-4" />
            Restart UI
          </button>
        </div>
      </section>
    </main>
  );
}

export class AppErrorBoundary extends Component<
  AppErrorBoundaryProps,
  AppErrorBoundaryState
> {
  state: AppErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): AppErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[OG-Launcher] UI crash caught:", error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return <ErrorPanel message={messageFromUnknown(this.state.error)} />;
    }

    return this.props.children;
  }
}

export function RouteErrorBoundary() {
  return <ErrorPanel message={messageFromUnknown(useRouteError())} />;
}
