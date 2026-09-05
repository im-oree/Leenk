import { useEffect, useRef, useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import Page from '../../components/layout/Page'
import Header from '../../components/layout/Header'
import Icon from '../../components/ui/Icon'
import Sheet from '../../components/ui/Sheet'
import Button from '../../components/ui/Button'
import Avatar from '../../components/ui/Avatar'
import ListRow from '../../components/ui/ListRow'
import EmptyState from '../../components/ui/EmptyState'
import Spinner from '../../components/ui/Spinner'
import { campusMap } from '../../lib/data'
import { useAsync } from '../../lib/useAsync'
import { useTheme } from '../../lib/ThemeContext'
import { useStore } from '../../lib/store'
import { haptic } from '../../lib/haptics'

/**
 * Campus map.
 *
 * MapLibre GL + OpenFreeMap tiles (no API key, no account, no usage limits).
 * The library is imported dynamically because it's ~200KB gzipped — loading it
 * on app boot would slow every user for a screen most never open.
 *
 * Pins are avatar markers with a name label and a HARD size cap, so a long
 * name or tall photo can never overflow the marker.
 *
 * Everything safety-critical happens server-side (see services/map.js): the
 * client only ever receives already-snapped cells, bucketed "last seen"
 * strings, and pins that already passed k-anonymity. There is no raw
 * coordinate and no timestamp here to leak.
 */

const PIN = { maxWidth: 96, maxHeight: 76, avatar: 40 }

export default function CampusMap() {
  const navigate = useNavigate()
  const { theme } = useTheme()
  const { me } = useStore()
  const holder = useRef(null)
  const mapRef = useRef(null)
  const markers = useRef([])
  const [ready, setReady] = useState(false)
  const [failed, setFailed] = useState(false)
  const [selected, setSelected] = useState(null)
  const [settingsOpen, setSettingsOpen] = useState(false)

  const { data: cfg } = useAsync(() => campusMap.config(), [])
  const { data: pinData, loading } = useAsync(() => campusMap.pins(), [])
  const [settings, setSettings] = useState(null)

  useEffect(() => { if (cfg?.settings) setSettings(cfg.settings) }, [cfg])

  const pins = pinData?.pins || []
  const styleUrl = theme === 'dark' ? cfg?.tileStyleUrlDark : cfg?.tileStyleUrl

  /* ------------------------------ map init ------------------------------ */
  useEffect(() => {
    if (!holder.current || !styleUrl || mapRef.current) return
    let cancelled = false

    ;(async () => {
      try {
        const maplibregl = (await import('maplibre-gl')).default
        await import('maplibre-gl/dist/maplibre-gl.css')
        if (cancelled || !holder.current) return

        const map = new maplibregl.Map({
          container: holder.current,
          style: styleUrl,
          center: [3.7186, 6.8917],   // Babcock; campus centroid, not a user
          zoom: 14.4,
          attributionControl: { compact: true },
        })
        map.on('load', () => !cancelled && setReady(true))
        map.on('error', () => !cancelled && setFailed(true))
        mapRef.current = map
      } catch {
        if (!cancelled) setFailed(true)
      }
    })()

    return () => {
      cancelled = true
      markers.current.forEach((m) => m.remove())
      markers.current = []
      mapRef.current?.remove()
      mapRef.current = null
    }
  }, [styleUrl])

  /* ---------------------------- render pins ----------------------------- */
  const openPin = useCallback((p) => {
    haptic('light')
    setSelected(p)
    // Fire-and-forget: feeds the anti-stalking signal. Never blocks the UI
    // and never tells the viewer anything about the outcome.
    campusMap.view(p.uid, { interacted: false })
  }, [])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return

    let cancelled = false
    ;(async () => {
      const maplibregl = (await import('maplibre-gl')).default
      if (cancelled) return

      markers.current.forEach((m) => m.remove())
      markers.current = pins.map((p) => {
        const el = document.createElement('button')
        el.type = 'button'
        el.setAttribute('aria-label', `${p.name}, ${p.lastSeen}`)
        // Fixed max box so nothing can overflow the marker.
        el.style.cssText = `
          max-width:${PIN.maxWidth}px; max-height:${PIN.maxHeight}px;
          width:${PIN.maxWidth}px; display:flex; flex-direction:column;
          align-items:center; gap:3px; background:none; border:0; padding:0;
          cursor:pointer; overflow:hidden;`

        const ring = document.createElement('span')
        ring.style.cssText = `
          width:${PIN.avatar}px; height:${PIN.avatar}px; border-radius:9999px;
          overflow:hidden; flex:0 0 auto; background:var(--app-elev);
          box-shadow:0 0 0 2.5px var(--brand), 0 4px 14px rgba(0,0,0,.28);`
        if (p.photo) {
          const img = document.createElement('img')
          img.src = p.photo
          img.alt = ''
          img.loading = 'lazy'
          img.style.cssText = 'width:100%;height:100%;object-fit:cover;display:block'
          ring.appendChild(img)
        }

        const label = document.createElement('span')
        label.textContent = p.name
        label.style.cssText = `
          max-width:${PIN.maxWidth}px; white-space:nowrap; overflow:hidden;
          text-overflow:ellipsis; font-size:11px; font-weight:600; line-height:1.3;
          padding:1.5px 7px; border-radius:9999px; color:var(--app-text);
          background:var(--app-surface); box-shadow:0 2px 8px rgba(0,0,0,.16);`

        el.append(ring, label)
        el.addEventListener('click', () => openPin(p))

        return new maplibregl.Marker({ element: el, anchor: 'bottom' })
          .setLngLat([p.lng, p.lat])
          .addTo(map)
      })
    })()

    return () => { cancelled = true }
  }, [pins, ready, openPin])

  const saveSettings = async (patch) => {
    const next = { ...settings, ...patch }
    setSettings(next)
    haptic('light')
    await campusMap.settings(patch)
  }

  const invisible = !settings || settings.visibility === 'off' || settings.ghost

  return (
    <Page
      nav={false}
      padBottom={false}
      scroll={false}
      header={
        <Header
          back
          title="Campus map"
          subtitle={pinData ? `${pinData.onCampusCount ?? 0} on campus` : 'Loading…'}
          right={
            <button
              onClick={() => { haptic('light'); setSettingsOpen(true) }}
              aria-label="Map privacy"
              className="hit-expand flex items-center gap-1.5 px-3 h-9 rounded-full elev text-[12.5px] font-semibold"
            >
              <Icon name={invisible ? 'eyeOff' : 'eye'} size={15} />
              {invisible ? 'Hidden' : 'Visible'}
            </button>
          }
        />
      }
    >
      <div className="relative flex-1 min-h-0">
        <div ref={holder} className="absolute inset-0" />

        {(!ready || loading) && !failed && (
          <div className="absolute inset-0 grid place-items-center bg-[color:var(--app-bg)]">
            <Spinner />
          </div>
        )}

        {failed && (
          <div className="absolute inset-0 grid place-items-center bg-[color:var(--app-bg)] px-6">
            <EmptyState
              icon="compass"
              title="Map unavailable"
              description="We couldn't load the map right now. Check your connection and try again."
            />
          </div>
        )}

        {/* You are invisible: say so plainly, and make it one tap to change. */}
        <AnimatePresence>
          {ready && invisible && (
            <motion.button
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 12 }}
              onClick={() => setSettingsOpen(true)}
              className="absolute left-4 right-4 bottom-4 mx-auto max-w-[var(--content-max)] flex items-center gap-3 px-4 py-3 rounded-2xl glass border hairline text-left"
            >
              <Icon name="eyeOff" size={17} className="muted shrink-0" />
              <span className="flex-1 min-w-0">
                <span className="block text-[13.5px] font-medium">You're not on the map</span>
                <span className="block text-[11.5px] muted">Others can't see your location.</span>
              </span>
              <span className="text-[12.5px] font-semibold brand-text shrink-0">Change</span>
            </motion.button>
          )}
        </AnimatePresence>
      </div>

      {/* Tapped pin */}
      <Sheet open={!!selected} onClose={() => setSelected(null)} title={selected?.name}>
        {selected && (
          <div className="pb-1">
            <div className="flex items-center gap-3.5 px-1 pb-4">
              <Avatar src={selected.photo} name={selected.name} size="lg" verified={selected.verified} />
              <div className="min-w-0">
                <p className="font-semibold text-[16px] truncate">{selected.name}</p>
                {/* Bucketed, never a precise time. */}
                <p className="text-[12.5px] muted mt-0.5">{selected.lastSeen} · nearby</p>
              </div>
            </div>
            <Button
              full
              onClick={() => { campusMap.view(selected.uid, { interacted: true }); navigate(`/app/user/${selected.uid}`) }}
            >
              View profile
            </Button>
          </div>
        )}
      </Sheet>

      {/* Privacy controls */}
      <Sheet open={settingsOpen} onClose={() => setSettingsOpen(false)} title="Who can see you">
        <div className="-mx-1">
          {[
            { id: 'off', label: 'Nobody', blurb: "You won't appear on the map" },
            { id: 'matches', label: 'Matches only', blurb: 'Only people you matched with' },
            { id: 'campus', label: 'My campus', blurb: 'Verified students at your school' },
          ].map((o) => (
            <ListRow
              key={o.id}
              icon={settings?.visibility === o.id ? 'check' : 'circle'}
              label={o.label}
              sublabel={o.blurb}
              onClick={() => saveSettings({ visibility: o.id })}
            />
          ))}

          <div className="mt-2 pt-2 border-t hairline">
            <ListRow
              icon="eyeOff"
              label="Ghost mode"
              sublabel="See the map without appearing on it — always free"
              right={
                <span className={`w-11 h-6 rounded-full transition-colors ${settings?.ghost ? 'brand-fill' : 'elev'} relative`}>
                  <span
                    className="absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all"
                    style={{ left: settings?.ghost ? 22 : 2 }}
                  />
                </span>
              }
              onClick={() => saveSettings({ ghost: !settings?.ghost })}
            />
          </div>

          <p className="px-4 pt-3 pb-1 text-[11.5px] muted leading-relaxed">
            Your location is always approximate and delayed — never live. You're
            only shown when enough people are nearby to keep it anonymous.
          </p>
        </div>
      </Sheet>
    </Page>
  )
}
