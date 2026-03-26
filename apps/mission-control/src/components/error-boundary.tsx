'use client';
import { Component, ReactNode } from 'react';

interface Props { children: ReactNode; fallback?: ReactNode; }
interface State { hasError: boolean; error?: Error; }

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) { super(props); this.state = { hasError: false }; }
  static getDerivedStateFromError(error: Error) { return { hasError: true, error }; }
  render() {
    if (this.state.hasError) {
      return this.props.fallback || (
        <div className="flex items-center justify-center h-[50vh]">
          <div className="text-center">
            <div className="text-2xl mb-2">&#9888;&#65039;</div>
            <div className="text-sm text-gray-400">Something went wrong</div>
            <div className="text-[10px] text-gray-600 mt-1 max-w-xs">{this.state.error?.message}</div>
            <button onClick={() => this.setState({ hasError: false })}
              className="mt-3 px-3 py-1.5 text-[10px] bg-amber-500 text-gray-900 rounded hover:bg-amber-400">
              Try Again
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
