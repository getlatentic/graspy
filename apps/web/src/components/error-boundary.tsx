import { Component, type ErrorInfo, type ReactNode } from "react";
import { ErrorScreen } from "@/components/error-screen";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/** Outside the providers, so a failure in one of them still renders something. */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Unhandled render error:", error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    return error ? <ErrorScreen error={error} /> : this.props.children;
  }
}
