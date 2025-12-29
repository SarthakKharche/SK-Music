import { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
  errorInfo?: ErrorInfo;
}

class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
    this.setState({ error, errorInfo });
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-spotify-black flex items-center justify-center p-8">
          <div className="bg-spotify-gray rounded-lg p-8 max-w-lg text-center">
            <h1 className="text-2xl font-bold text-white mb-4">Something went wrong</h1>
            <p className="text-spotify-lightgray mb-4">
              {this.state.error?.message || 'An unexpected error occurred'}
            </p>
            <button
              onClick={() => {
                this.setState({ hasError: false, error: undefined, errorInfo: undefined });
                window.location.reload();
              }}
              className="bg-spotify-green text-black px-6 py-2 rounded-full font-semibold hover:bg-green-400 transition-colors"
            >
              Reload Page
            </button>
            {process.env.NODE_ENV === 'development' && this.state.errorInfo && (
              <pre className="mt-4 text-left text-xs text-red-400 overflow-auto max-h-48 bg-black/50 p-2 rounded">
                {this.state.errorInfo.componentStack}
              </pre>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
