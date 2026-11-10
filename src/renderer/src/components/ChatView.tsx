import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { ArrowDown } from 'lucide-react'
import { useAppStore } from '../store/app'
import { ChatHeader } from './ChatHeader'
import { Composer } from './Composer'
import { EmptyState } from './EmptyState'
import { Timeline } from './Timeline'
import { LogoMark } from './LogoMark'

export function ChatView() {
  const session = useAppStore((state) => state.session)
  const running = useAppStore((state) => state.running)
  const sessionLoading = useAppStore((state) => state.sessionLoading)
  const scrollRef = useRef<HTMLDivElement>(null)
  const [atBottom, setAtBottom] = useState(true)

  const scrollToBottom = (smooth = false): void => {
    const el = scrollRef.current
    if (!el) return
    el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' })
  }

  useLayoutEffect(() => {
    setAtBottom(true)
    scrollToBottom()
    const el = scrollRef.current
    if (!el) return
    const snap = (): void => {
      el.scrollTop = el.scrollHeight
    }
    const raf = requestAnimationFrame(() => {
      snap()
      requestAnimationFrame(snap)
    })
    const timer = setTimeout(snap, 150)
    return () => {
      cancelAnimationFrame(raf)
      clearTimeout(timer)
    }
  }, [session?.id])

  useEffect(() => {
    if (atBottom) scrollToBottom()
  }, [session?.timeline, atBottom])

  if (!session) {
    return (
      <div className="chat-view">
        <div className="loading-pane">
          <LogoMark size={30} />
          <span>{sessionLoading ? '正在打开工作区…' : '正在准备 agent…'}</span>
        </div>
      </div>
    )
  }

  const empty = session.timeline.length === 0

  return (
    <div className="chat-view">
      <ChatHeader />
      <div
        className="chat-scroll"
        ref={scrollRef}
        onScroll={(event) => {
          const el = event.currentTarget
          const distance = el.scrollHeight - el.scrollTop - el.clientHeight
          setAtBottom(distance < 120)
        }}
      >
        <div className={`chat-inner ${empty ? 'is-empty' : ''}`}>
          {empty ? <EmptyState /> : <Timeline session={session} running={running} />}
          <div className="chat-bottom-space" />
        </div>
      </div>

      {!atBottom ? (
        <button className="jump-latest animate-pop" onClick={() => scrollToBottom(true)}>
          <ArrowDown size={13} /> 跳到最新
        </button>
      ) : null}

      <Composer />
    </div>
  )
}
