import { Component, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  name?: string;
  onReset?: () => void;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: { componentStack?: string }) {
    console.error(`[ErrorBoundary${this.props.name ? ':' + this.props.name : ''}]`, error, info.componentStack);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: undefined });
    this.props.onReset?.();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex items-center justify-center h-full bg-strudel-dark text-white p-4 min-h-[60px]">
          <div className="text-center space-y-2">
            <p className="text-xs font-bold text-red-400">
              {this.props.name ? `${this.props.name} crashed` : 'Something went wrong'}
            </p>
            <p className="text-[10px] text-muted-foreground">{this.state.error?.message}</p>
            <button
              onClick={this.handleReset}
              className="px-3 py-1 bg-strudel-primary hover:bg-strudel-secondary rounded text-[10px]"
            >
              Retry
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
