import { Component } from 'react'
import Button from './Button'
import Icon from './Icon'

/**
 * Catches render errors so a single broken component can't white-screen the
 * whole app. Scoped per-route in App.jsx, so a crash in the feed still leaves
 * the nav bar and every other tab usable.
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    // Keep the detail in the console for dev; ship to a collector later.
    console.error('[Leenk] render error:', error, info?.componentStack)
  }

  reset = () => this.setState({ error: null })

  render() {
    const { error } = this.state
    if (!error) return this.props.children

    if (this.props.fallback) return this.props.fallback(error, this.reset)

    return (
      <div className="flex-1 grid place-items-center px-8 py-16 text-center">
        <div className="max-w-[300px]">
          <div className="w-14 h-14 rounded-3xl elev border hairline grid place-items-center mx-auto mb-4">
            <Icon name="refresh" size={24} className="text-brand-500" />
          </div>
          <h3 className="font-display text-[18px] font-semibold tracking-[-0.02em]">
            Something went wrong here
          </h3>
          <p className="text-[13.5px] muted mt-2 leading-relaxed">
            The rest of the app is fine — this section just needs a reload.
          </p>
          <Button variant="secondary" className="mt-5 border hairline" onClick={this.reset}>
            Try again
          </Button>
          {import.meta.env.DEV && (
            <pre className="mt-4 text-[10.5px] muted text-left whitespace-pre-wrap break-words opacity-70">
              {String(error?.message || error)}
            </pre>
          )}
        </div>
      </div>
    )
  }
}
