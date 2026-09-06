import { Component } from 'react'
import Button from './Button'
import Icon from './Icon'

/**
 * Catches render errors so a single broken component can't white-screen the
 * whole app. Scoped per-route in App.jsx, so a crash in the feed still leaves
 * the nav bar and every other tab usable.
 *
 * What the user sees is plain language and a short code. The stack trace is
 * tucked at the bottom behind a tap that copies it — a person reporting a bug
 * shouldn't have to open devtools, and a person who isn't reporting one
 * shouldn't have to look at a stack trace.
 */

/**
 * Map an error to a stable, human-quotable code.
 *
 * Ranges are deliberate so a support person can triage from the code alone:
 *   E1xx  connectivity
 *   E2xx  auth / permission
 *   E3xx  data shape — something was missing or malformed
 *   E4xx  media
 *   E5xx  unclassified
 */
export function errorCode(error) {
  const msg = String(error?.message || error || '')
  const name = error?.name || ''

  if (error?.code === 'TOKEN_REVOKED' || /session ended/i.test(msg)) return 'E201'
  if (error?.status === 401 || /unauthor/i.test(msg)) return 'E202'
  if (error?.status === 403 || /forbidden|not verified/i.test(msg)) return 'E203'

  if (name === 'TypeError' && /fetch|network/i.test(msg)) return 'E101'
  if (/offline|network request failed/i.test(msg)) return 'E102'
  if (/timed? ?out|aborted|AbortError/i.test(msg) || name === 'AbortError') return 'E103'

  // The class this boundary sees most: a render read a property off null.
  if (/reading '(\w+)'|of (null|undefined)/i.test(msg)) return 'E301'
  if (/is not a function/i.test(msg)) return 'E302'
  if (/is not iterable|not valid JSON|JSON/i.test(msg)) return 'E303'

  if (/image|decode|media/i.test(msg)) return 'E401'

  return 'E500'
}

/** One sentence, no jargon, and honest about whether the user can fix it. */
export function errorBlurb(code) {
  switch (code) {
    case 'E101':
    case 'E102':
      return "We couldn't reach Leenk. Check your connection and try again."
    case 'E103':
      return 'That took too long to load. Try again in a moment.'
    case 'E201':
      return 'You were signed out. Sign in again to continue.'
    case 'E202':
      return 'You need to be signed in to see this.'
    case 'E203':
      return "Your account doesn't have access to this yet."
    case 'E301':
    case 'E303':
      return "Something didn't load properly. Reloading this section usually fixes it."
    case 'E302':
      return 'This part of the app hit a snag. Reloading usually fixes it.'
    case 'E401':
      return "That media couldn't be loaded."
    default:
      return 'The rest of the app is fine — this section just needs a reload.'
  }
}

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null, info: null, copied: false }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    this.setState({ info })
    console.error('[Leenk] render error:', error, info?.componentStack)
  }

  reset = () => this.setState({ error: null, info: null, copied: false })

  /** The full detail a developer needs, as one pasteable block. */
  report() {
    const { error, info } = this.state
    return [
      `Leenk ${errorCode(error)}`,
      `When: ${new Date().toISOString()}`,
      `Where: ${typeof window !== 'undefined' ? window.location.pathname : 'unknown'}`,
      `What: ${error?.name || 'Error'}: ${error?.message || String(error)}`,
      '',
      (error?.stack || '').split('\n').slice(0, 12).join('\n'),
      info?.componentStack ? `\nComponent stack:${info.componentStack.split('\n').slice(0, 10).join('\n')}` : '',
    ].join('\n').trim()
  }

  copy = async () => {
    const text = this.report()
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      // clipboard API needs a secure context and permission; fall back to a
      // hidden textarea so copy still works on plain http and older webviews.
      const ta = document.createElement('textarea')
      ta.value = text
      ta.setAttribute('readonly', '')
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      try { document.execCommand('copy') } catch { /* nothing more we can do */ }
      document.body.removeChild(ta)
    }
    this.setState({ copied: true })
    clearTimeout(this._t)
    this._t = setTimeout(() => this.setState({ copied: false }), 2000)
  }

  componentWillUnmount() { clearTimeout(this._t) }

  render() {
    const { error, copied } = this.state
    if (!error) return this.props.children
    if (this.props.fallback) return this.props.fallback(error, this.reset)

    const code = errorCode(error)

    return (
      <div className="flex-1 flex flex-col items-center justify-center px-8 py-12 text-center">
        <div className="max-w-[300px] flex-1 flex flex-col items-center justify-center">
          <div className="w-14 h-14 rounded-3xl elev border hairline grid place-items-center mb-4">
            <Icon name="refresh" size={24} className="text-brand-500" />
          </div>
          <h3 className="font-display text-[18px] font-semibold tracking-[-0.02em]">
            Something went wrong here
          </h3>
          <p className="text-[13.5px] muted mt-2 leading-relaxed">
            {errorBlurb(code)}
          </p>
          <Button variant="secondary" className="mt-5 border hairline" onClick={this.reset}>
            Try again
          </Button>
        </div>

        {/* Detail lives at the bottom, out of the way. One tap copies the
            whole report so a user can paste it into a support message. */}
        <button
          onClick={this.copy}
          className="mt-8 group flex items-center gap-1.5 px-3 py-2 rounded-full transition-colors active:bg-[color:var(--app-elev)]"
          aria-label={`Error ${code}. Tap to copy the details.`}
        >
          <Icon
            name={copied ? 'check' : 'copy'}
            size={13}
            className={copied ? 'text-emerald-500' : 'muted'}
          />
          <span className={`text-[11.5px] tabular-nums ${copied ? 'text-emerald-500 font-medium' : 'muted'}`}>
            {copied ? 'Copied to clipboard' : `Error ${code} · tap to copy`}
          </span>
        </button>
      </div>
    )
  }
}
