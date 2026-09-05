import { AnimatePresence, motion } from 'framer-motion'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'

import Page from '../../components/layout/Page'
import Header from '../../components/layout/Header'
import Button from '../../components/ui/Button'
import IconButton from '../../components/ui/IconButton'
import Icon from '../../components/ui/Icon'
import Spinner from '../../components/ui/Spinner'
import SmartImage from '../../components/ui/SmartImage'
import Avatar from '../../components/ui/Avatar'

import { useStore } from '../../lib/store'
import { haptic } from '../../lib/haptics'
import { takePhoto, pickImages, pickVideo, ensurePermissions } from '../../lib/gallery'
import { feed as feedApi, stories as storiesApi, media as mediaApi } from '../../lib/data'
import VideoEditor from '../../components/composer/VideoEditor'
import CaptionOverlay from '../../components/composer/CaptionOverlay'

/**
 * Unified composer for posts and stories.
 *
 * Flow: pick source → (video? trim/caption) → caption + audience → publish.
 * Media is uploaded through the same pipeline in both mock and live mode, so
 * turning the API on changes nothing here.
 */

const AUDIENCES = [
  { id: 'followers', label: 'Followers', icon: 'users', blurb: 'People who follow you' },
  { id: 'campus', label: 'My campus', icon: 'cap', blurb: 'Verified students at your school' },
  { id: 'matches', label: 'Matches only', icon: 'heart', blurb: 'People you matched with' },
]

export default function Composer() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const initialMode = params.get('type') === 'story' ? 'story' : 'post'

  const { me, toast, dispatch } = useStore()

  const [mode, setMode] = useState(initialMode)
  const [asset, setAsset] = useState(null)      // { dataUrl, base64, mimeType, isVideo, width, height }
  const [caption, setCaption] = useState('')
  const [audience, setAudience] = useState('followers')
  const [overlays, setOverlays] = useState([])  // text overlays for stories
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState(null)
  const [editingVideo, setEditingVideo] = useState(false)

  const captionRef = useRef(null)

  useEffect(() => { ensurePermissions().catch(() => {}) }, [])

  /* ------------------------------ pick media ----------------------------- */

  const handlePick = useCallback(async (source) => {
    haptic('light')
    setError(null)
    try {
      const picked =
        source === 'camera' ? await takePhoto()
        : source === 'video' ? await pickVideo()
        : await pickImages({ limit: 1 })

      if (!picked.length) return
      const file = picked[0]
      setAsset(file)
      if (file.isVideo) setEditingVideo(true)
      haptic('success')
    } catch (err) {
      setError(err.message || "Couldn't open that.")
      haptic('error')
    }
  }, [])

  /* ------------------------------- publish ------------------------------- */

  const publish = useCallback(async () => {
    if (!asset || busy) return
    setBusy(true)
    setError(null)
    setProgress(0.15)

    try {
      const uploaded = await mediaApi.upload(asset, mode === 'story' ? 'story' : 'post')
      setProgress(0.7)

      const m = uploaded.media
      if (mode === 'story') {
        await storiesApi.create({
          mediaUrl: m.url,
          thumb: m.thumb,
          kind: asset.isVideo ? 'video' : 'image',
          caption: caption || undefined,
        })
        toast('Story added', 'success')
      } else {
        const res = await feedApi.create({
          mediaUrl: m.url,
          thumb: m.thumb,
          caption,
          scope: audience,
        })
        // Keep the local store in sync so the feed updates instantly.
        dispatch({
          type: 'post/create',
          post: {
            id: res.post?.id || res.postId || `p${Date.now()}`,
            author: { ...me, photos: me.photos },
            media: m.url,
            caption,
            likes: 0, comments: 0, liked: false, at: Date.now(), scope: audience,
          },
        })
        toast('Posted', 'success')
      }

      setProgress(1)
      haptic('success')
      navigate(mode === 'story' ? '/app/feed' : '/app/feed', { replace: true })
    } catch (err) {
      setError(err.message || 'Could not publish. Try again.')
      haptic('error')
      setBusy(false)
      setProgress(0)
    }
  }, [asset, busy, mode, caption, audience, me, dispatch, navigate, toast])

  /* -------------------------------- render ------------------------------- */

  if (editingVideo && asset?.isVideo) {
    return (
      <VideoEditor
        asset={asset}
        onCancel={() => { setEditingVideo(false); setAsset(null) }}
        onDone={(edited) => { setAsset(edited); setEditingVideo(false) }}
      />
    )
  }

  return (
    <Page nav={false} padBottom={false} scroll={false}>
      <Header
        close
        onClose={() => navigate(-1)}
        title={mode === 'story' ? 'New story' : 'New post'}
        right={
          <Button size="sm" disabled={!asset || busy} loading={busy} onClick={publish}>
            {mode === 'story' ? 'Add' : 'Share'}
          </Button>
        }
      />

      {/* upload progress */}
      <AnimatePresence>
        {busy && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="h-[3px] bg-[color:var(--app-elev)] overflow-hidden"
          >
            <motion.div
              className="h-full brand-fill"
              initial={{ width: 0 }}
              animate={{ width: `${progress * 100}%` }}
              transition={{ ease: [0.22, 1, 0.36, 1], duration: 0.5 }}
            />
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex-1 overflow-y-auto no-scrollbar">
        <div className="max-w-[var(--content-max)] w-full mx-auto px-5 pt-4 pb-12 space-y-5">

          {/* post / story toggle */}
          <div className="flex gap-1.5 p-1 rounded-2xl elev border hairline">
            {['post', 'story'].map((m) => (
              <button
                key={m}
                onClick={() => { haptic('light'); setMode(m) }}
                className="relative flex-1 h-9 rounded-xl text-[13.5px] font-medium capitalize"
              >
                {mode === m && (
                  <motion.span
                    layoutId="composer-mode"
                    transition={{ type: 'spring', stiffness: 520, damping: 40 }}
                    className="absolute inset-0 rounded-xl bg-brand-500/12"
                  />
                )}
                <span className={`relative ${mode === m ? 'text-brand-500' : 'muted'}`}>{m}</span>
              </button>
            ))}
          </div>

          {/* media area */}
          {!asset ? (
            <div className="space-y-3">
              <div
                className="w-full aspect-square rounded-3xl border-2 border-dashed border-[color:var(--app-border)] elev grid place-items-center"
              >
                <div className="text-center px-8">
                  <Icon name="camera" size={30} className="muted mx-auto" />
                  <p className="text-[14px] font-medium mt-3">Add a photo or video</p>
                  <p className="text-[12.5px] muted mt-1">Up to 90 seconds</p>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2.5">
                <SourceButton icon="camera" label="Camera" onClick={() => handlePick('camera')} />
                <SourceButton icon="grid" label="Gallery" onClick={() => handlePick('gallery')} />
                <SourceButton icon="video" label="Video" onClick={() => handlePick('video')} />
              </div>
            </div>
          ) : (
            <div className="relative">
              <div className="relative w-full aspect-square rounded-3xl overflow-hidden elev">
                {asset.isVideo ? (
                  <video
                    src={asset.dataUrl}
                    className="w-full h-full object-cover"
                    controls
                    playsInline
                  />
                ) : (
                  <SmartImage src={asset.dataUrl} alt="" className="w-full h-full" eager />
                )}

                {/* story text overlays render on top */}
                {mode === 'story' && (
                  <CaptionOverlay overlays={overlays} onChange={setOverlays} editable />
                )}
              </div>

              <div className="flex gap-2 mt-3">
                <Button variant="secondary" size="sm" icon="refresh" className="border hairline"
                  onClick={() => { setAsset(null); setOverlays([]) }}>
                  Replace
                </Button>
                {asset.isVideo && (
                  <Button variant="secondary" size="sm" icon="video" className="border hairline"
                    onClick={() => setEditingVideo(true)}>
                    Trim
                  </Button>
                )}
                {mode === 'story' && (
                  <Button variant="secondary" size="sm" className="border hairline"
                    onClick={() => setOverlays((o) => [...o, { id: Date.now(), text: 'Tap to edit', x: 0.5, y: 0.5, size: 22 }])}>
                    Add text
                  </Button>
                )}
              </div>
            </div>
          )}

          {/* caption */}
          {asset && mode === 'post' && (
            <div>
              <div className="flex items-start gap-3">
                <Avatar src={me.photos?.[0]} name={me.name} size="sm" />
                <textarea
                  ref={captionRef}
                  value={caption}
                  onChange={(e) => setCaption(e.target.value.slice(0, 300))}
                  placeholder="Say something…"
                  rows={3}
                  className="flex-1 bg-transparent resize-none outline-none text-[15px] leading-relaxed placeholder:text-[color:var(--app-muted)]"
                />
              </div>
              <p className="text-[11.5px] muted text-right mt-1">{caption.length}/300</p>
            </div>
          )}

          {/* audience */}
          {asset && mode === 'post' && (
            <div>
              <p className="text-[12px] font-medium muted uppercase tracking-wide mb-2">Who can see this</p>
              <div className="space-y-1.5">
                {AUDIENCES.map((a) => (
                  <button
                    key={a.id}
                    onClick={() => { haptic('light'); setAudience(a.id) }}
                    className={`w-full flex items-center gap-3 px-3.5 py-3 rounded-2xl border transition-colors ${
                      audience === a.id ? 'border-brand-500/50 bg-brand-500/8' : 'hairline elev'
                    }`}
                  >
                    <Icon name={a.icon} size={18} className={audience === a.id ? 'text-brand-500' : 'muted'} />
                    <span className="flex-1 text-left">
                      <span className="block text-[14px] font-medium">{a.label}</span>
                      <span className="block text-[12px] muted">{a.blurb}</span>
                    </span>
                    {audience === a.id && <Icon name="check" size={17} className="text-brand-500" />}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* error */}
          <AnimatePresence>
            {error && (
              <motion.div
                initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                className="px-3.5 py-2.5 rounded-2xl bg-red-500/10 border border-red-500/20"
              >
                <p className="text-[13px] text-red-500">{error}</p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </Page>
  )
}

function SourceButton({ icon, label, onClick }) {
  return (
    <motion.button
      whileTap={{ scale: 0.96 }}
      transition={{ type: 'spring', stiffness: 600, damping: 30 }}
      onClick={onClick}
      className="flex flex-col items-center justify-center gap-1.5 py-3.5 rounded-2xl elev border hairline"
    >
      <Icon name={icon} size={19} className="text-brand-500" />
      <span className="text-[12.5px] font-medium">{label}</span>
    </motion.button>
  )
}
