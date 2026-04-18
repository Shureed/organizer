import { Component, type ReactNode, type ErrorInfo } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
  info: ErrorInfo | null
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, info: null }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary]', error, info)
    this.setState({ info })
  }

  render() {
    if (this.state.error) {
      return (
        <div
          style={{
            background: 'var(--bg)',
            color: 'var(--text)',
            padding: '24px',
            minHeight: '100vh',
            fontFamily: 'ui-monospace, monospace',
            fontSize: '12px',
            lineHeight: 1.5,
            overflow: 'auto',
          }}
        >
          <h1 style={{ fontSize: '14px', marginBottom: '8px', color: '#f85149' }}>
            App crashed
          </h1>
          <p style={{ color: 'var(--text-muted)', marginBottom: '12px' }}>
            {this.state.error.name}: {this.state.error.message}
          </p>
          <pre style={{ whiteSpace: 'pre-wrap', color: 'var(--text-muted)' }}>
            {this.state.error.stack}
          </pre>
          {this.state.info?.componentStack && (
            <>
              <p style={{ color: 'var(--text-muted)', marginTop: '12px', marginBottom: '4px' }}>
                Component stack:
              </p>
              <pre style={{ whiteSpace: 'pre-wrap', color: 'var(--text-muted)' }}>
                {this.state.info.componentStack}
              </pre>
            </>
          )}
          <button
            onClick={() => location.reload()}
            style={{
              marginTop: '16px',
              background: 'var(--accent)',
              color: '#0d1117',
              padding: '6px 12px',
              borderRadius: '6px',
              fontSize: '12px',
            }}
          >
            Reload
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
