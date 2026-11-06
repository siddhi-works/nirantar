import { Component, type ReactNode } from 'react';

/** If a screen fails to draw, show a plain message and a way back instead of a blank page. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: Error) { console.error(`screen failed: ${error.name}`); } // the kind only, never what was on the screen
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="screen" role="alert" style={{ display: 'grid', placeItems: 'center', padding: 24 }}>
        <div className="card" style={{ maxWidth: 460, padding: 24 }}>
          <h1 style={{ fontSize: 22, margin: '0 0 8px' }}>Something went wrong on this screen</h1>
          <p className="muted">Your data is safe. Reload the page to continue.</p>
          <button className="btn" onClick={() => window.location.reload()}>Reload</button>
        </div>
      </div>
    );
  }
}
