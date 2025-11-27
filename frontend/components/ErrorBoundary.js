import { Component } from 'react';

// Minimal error boundary to prevent the app from crashing on render errors.
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    // eslint-disable-next-line no-console
    console.error('ErrorBoundary caught an error', error, info);
  }

  render() {
    if (this.state.hasError) {
      return <div style={{ padding: '2rem', textAlign: 'center' }}>Something went wrong.</div>;
    }
    return this.props.children;
  }
}
