import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useNavigate, useParams } from 'react-router-dom'
import Page from '../../components/layout/Page'
import Header from '../../components/layout/Header'
import SmartImage from '../../components/ui/SmartImage'
import { chat as chatApi, media as mediaApi } from '../../lib/data'
import { pickImages, takePhoto } from '../../lib/gallery'
import Avatar from '../../components/ui/Avatar'
import Icon from '../../components/ui/Icon'
import IconButton from '../../components/ui/IconButton'
import Sheet from '../../components/ui/Sheet'
import Modal from '../../components/ui/Modal'
import Button from '../../components/ui/Button'
import ListRow from '../../components/ui/ListRow'
import { useStore } from '../../lib/store'
import { clockTime } from '../../lib/format'
import { campusById } from '../../lib/mock'
import { haptic } from '../../lib/haptics'

export default function Chat() {
  const { matchId } = useParams()
  const navigate = useNavigate()
  const { matches, threads, dispatch, toast } = useStore()
  const match = matches.find((m) => m.id === matchId)
  const messages = threads[matchId] || []
  const [text, setText] = useState('')
  const [menuOpen, setMenuOpen] = useState(false)
  const [confirmUnmatch, setConfirmUnmatch] = useState(false)
  const [typing, setTyping] = useState(false)
  const [attaching, setAttaching] = useState(false)
  const endRef = useRef(null)

  useEffect(() => {
    if (matchId) dispatch({ type: 'match/read', matchId })
  }, [matchId, dispatch])

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages.length, typing])

  if (!match) {
    return (
      <Page nav={false}>
        <Header back title="Conversation" />
        <div className="flex-1 grid place-items-center px-8 text-center">
          <div>
            <p className="font-display text-[19px] font-semibold">This chat is gone</p>
            <p className="text-[14px] muted mt-2">The match was removed. Nothing is stored for either side.</p>
            <Button className="mt-5" onClick={() => navigate('/app/matches')}>Back to chats</Button>
          </div>
        </div>
      </Page>
    )
  }

  const send = async () => {
    const t = text.trim()
    if (!t) return
    haptic('light')

    // Optimistic: paint the bubble now, reconcile after the server replies.
    dispatch({ type: 'message/send', matchId, text: t })
    setText('')
    setTyping(true)
    setTimeout(() => setTyping(false), 2200)

    try {
      await chatApi.send(matchId, { text: t, kind: 'text' })
    } catch (err) {
      toast(err.message || 'Message failed to send', 'error')
    }
  }

  /** Attach a photo: pick -> upload -> send as an image message. */
  const sendPhoto = async (source = 'gallery') => {
    try {
      const picked = source === 'camera' ? await takePhoto() : await pickImages({ limit: 1 })
      if (!picked.length) return
      setAttaching(true)

      const up = await mediaApi.upload(picked[0], 'chat')
      const url = up.media.url

      dispatch({ type: 'message/send', matchId, text: '', mediaUrl: url, kind: 'image' })
      await chatApi.send(matchId, { mediaUrl: url, kind: 'image', meta: { thumb: up.media.thumb } })
      haptic('success')
    } catch (err) {
      toast(err.message || "Couldn't send that photo", 'error')
      haptic('error')
    } finally {
      setAttaching(false)
    }
  }

  return (
    <Page nav={false} padBottom={false} scroll={false} swipeBack>
      <Header
        back
        onBack={() => navigate('/app/matches')}
        left={
          <button onClick={() => navigate(`/app/user/${match.user.uid}`)} className="flex items-center gap-2.5 pl-0.5">
            <Avatar src={match.user.photos[0]} name={match.user.name} size="sm" verified />
          </button>
        }
        title={match.user.name}
        subtitle={`${campusById(match.user.campusId).short} · Active recently`}
        right={
          <>
            <IconButton icon="phone" label="Voice call" onClick={() => { haptic("light"); navigate(`/app/call/${matchId}?kind=audio`) }} />
            <IconButton icon="dots" label="Options" onClick={() => setMenuOpen(true)} />
          </>
        }
      />

      <div className="flex-1 overflow-y-auto no-scrollbar px-4 py-4">
        <div className="max-w-[var(--content-max)] mx-auto">
          <div className="flex flex-col items-center text-center py-6 mb-2">
            <Avatar src={match.user.photos[0]} name={match.user.name} size="xl" verified />
            <p className="font-display text-[19px] font-semibold mt-3">{match.user.name}, {match.user.age}</p>
            <p className="text-[13px] muted mt-1">{campusById(match.user.campusId).short} · {match.user.department}</p>
            <p className="text-[12.5px] muted mt-3 max-w-[260px] leading-relaxed">
              You matched. Messages here stay between you two, and disappear for both if either unmatches.
            </p>
          </div>

          {messages.length === 0 && (
            <div className="flex flex-wrap gap-2 justify-center py-3">
              {['Hey 👋', 'Your prompt made me laugh', 'What are you studying?'].map((s) => (
                <button
                  key={s}
                  onClick={() => { setText(s); haptic('light') }}
                  className="px-3.5 py-2 rounded-full border hairline text-[13.5px] active:bg-[color:var(--app-elev)]"
                >
                  {s}
                </button>
              ))}
            </div>
          )}

          <AnimatePresence initial={false}>
            {messages.map((m, i) => {
              const prev = messages[i - 1]
              const grouped = prev && prev.mine === m.mine
              return (
                <motion.div
                  key={m.id}
                  initial={{ opacity: 0, y: 10, scale: 0.97 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ type: 'spring', stiffness: 460, damping: 34 }}
                  className={`flex ${m.mine ? 'justify-end' : 'justify-start'} ${grouped ? 'mt-1' : 'mt-3'}`}
                >
                  <div
                    className={`max-w-[76%] px-4 py-2.5 text-[14.5px] leading-snug ${
                      m.mine
                        ? 'brand-fill text-white rounded-3xl rounded-br-lg'
                        : 'elev border hairline rounded-3xl rounded-bl-lg'
                    }`}
                  >
                    {m.mediaUrl && (
                      <SmartImage
                        src={m.mediaUrl}
                        alt=""
                        className="w-[210px] rounded-2xl mb-1.5 -mx-1"
                        aspect="1 / 1"
                      />
                    )}
                    {m.text}
                    <span className={`block text-[10.5px] mt-1 ${m.mine ? 'text-white/65' : 'muted'}`}>
                      {clockTime(m.at)}{m.editedAt ? ' · edited' : ''}
                    </span>
                  </div>
                </motion.div>
              )
            })}
          </AnimatePresence>

          <AnimatePresence>
            {typing && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="flex justify-start mt-3"
              >
                <div className="elev border hairline rounded-3xl rounded-bl-lg px-4 py-3.5 flex gap-1.5">
                  {[0, 1, 2].map((d) => (
                    <motion.span
                      key={d}
                      className="w-1.5 h-1.5 rounded-full bg-[color:var(--app-muted)]"
                      animate={{ y: [0, -4, 0], opacity: [0.4, 1, 0.4] }}
                      transition={{ duration: 1, repeat: Infinity, delay: d * 0.16 }}
                    />
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
          <div ref={endRef} />
        </div>
      </div>

      <div className="glass border-t hairline px-3 pt-2.5 pb-[max(env(safe-area-inset-bottom),12px)]">
        <div className="max-w-[var(--content-max)] mx-auto flex items-end gap-2">
          <IconButton icon="image" label="Send photo" disabled={attaching} onClick={() => sendPhoto('gallery')} />
          <div className="flex-1 flex items-end rounded-3xl elev border hairline px-4 py-1">
            <textarea
              rows={1}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
              placeholder="Message…"
              className="flex-1 bg-transparent outline-none resize-none py-2.5 text-[15px] max-h-[110px] placeholder:text-[color:var(--app-muted)]"
            />
          </div>
          <motion.button
            whileTap={{ scale: 0.88 }}
            onClick={send}
            disabled={!text.trim()}
            aria-label="Send"
            className={`w-11 h-11 rounded-full grid place-items-center shrink-0 transition-all duration-200 ${
              text.trim() ? 'brand-fill text-white shadow-glow' : 'elev muted'
            }`}
          >
            <Icon name="send" size={19} />
          </motion.button>
        </div>
      </div>

      <Sheet open={menuOpen} onClose={() => setMenuOpen(false)} title={match.user.name}>
        <div className="-mx-1">
          <ListRow icon="user" label="View profile" onClick={() => { setMenuOpen(false); navigate(`/app/user/${match.user.uid}`) }} />
          <ListRow icon="shield" label="Share my meetup" description="Send your plan to a trusted contact" onClick={() => { setMenuOpen(false); navigate('/app/safety') }} />
          <ListRow icon="flag" label="Report" danger onClick={() => { setMenuOpen(false); navigate('/app/report') }} />
          <ListRow icon="block" label="Block" danger onClick={() => { setMenuOpen(false); toast('Blocked') }} />
          <ListRow icon="trash" label="Unmatch" danger onClick={() => { setMenuOpen(false); setConfirmUnmatch(true) }} />
        </div>
      </Sheet>

      <Modal
        open={confirmUnmatch}
        onClose={() => setConfirmUnmatch(false)}
        tone="danger"
        title={`Unmatch ${match.user.name}?`}
        description="This deletes the conversation for both of you immediately. It can't be undone."
        actions={
          <>
            <Button full variant="secondary" onClick={() => setConfirmUnmatch(false)}>Cancel</Button>
            <Button
              full variant="danger"
              onClick={() => { dispatch({ type: 'match/unmatch', matchId }); setConfirmUnmatch(false); navigate('/app/matches') }}
            >
              Unmatch
            </Button>
          </>
        }
      />
    </Page>
  )
}
