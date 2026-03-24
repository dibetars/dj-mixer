'use client'

import { useState } from 'react'
import { Loader2, Send, Sparkles, Zap } from 'lucide-react'
import { MixSuggestion } from '@/lib/groq'
import { SpotifyTrack } from '@/lib/spotify'

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

interface Props {
  suggestion: MixSuggestion | null
  loadingSuggestion: boolean
  chatMessages: ChatMessage[]
  loadingChat: boolean
  currentTrack: SpotifyTrack | null
  onGetSuggestion: (request?: string) => void
  onChat: (msg: string) => void
}

const ENERGY_LABELS = {
  lift: { label: 'Energy Lift', color: 'text-green-400', bg: 'bg-green-400/10' },
  maintain: { label: 'Maintain Flow', color: 'text-yellow-400', bg: 'bg-yellow-400/10' },
  drop: { label: 'Energy Drop', color: 'text-blue-400', bg: 'bg-blue-400/10' },
}

export default function AIPanel({
  suggestion, loadingSuggestion, chatMessages, loadingChat,
  currentTrack, onGetSuggestion, onChat,
}: Props) {
  const [input, setInput] = useState('')
  const [tab, setTab] = useState<'suggest' | 'chat'>('suggest')

  const handleSend = () => {
    const msg = input.trim()
    if (!msg) return
    setInput('')
    if (tab === 'chat') onChat(msg)
    else onGetSuggestion(msg)
  }

  const energy = suggestion ? ENERGY_LABELS[suggestion.energy] : null

  return (
    <div className="flex flex-col h-full">
      {/* Tabs */}
      <div className="flex gap-1 mb-3">
        <button
          onClick={() => setTab('suggest')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
            tab === 'suggest' ? 'bg-yellow-400/20 text-yellow-300' : 'text-slate-500 hover:text-white'
          }`}
        >
          <Sparkles size={12} /> AI Mix
        </button>
        <button
          onClick={() => setTab('chat')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
            tab === 'chat' ? 'bg-yellow-400/20 text-yellow-300' : 'text-slate-500 hover:text-white'
          }`}
        >
          <Zap size={12} /> Chat
        </button>
      </div>

      {tab === 'suggest' && (
        <div className="flex flex-col gap-3 flex-1 overflow-y-auto">
          {/* Quick actions */}
          <div className="flex gap-2 flex-wrap">
            {['What plays next?', 'More energy', 'Slow it down', 'Same vibe'].map(q => (
              <button
                key={q}
                onClick={() => onGetSuggestion(q)}
                disabled={!currentTrack || loadingSuggestion}
                className="text-[11px] px-2.5 py-1 rounded-full bg-white/5 text-slate-400 hover:bg-yellow-400/10 hover:text-yellow-300 disabled:opacity-30 transition-colors"
              >
                {q}
              </button>
            ))}
          </div>

          {loadingSuggestion && (
            <div className="flex items-center gap-2 text-slate-400 text-sm">
              <Loader2 size={14} className="animate-spin" /> Groq is thinking…
            </div>
          )}

          {suggestion && !loadingSuggestion && (
            <div className="bg-[#0d0d1a] border border-yellow-400/20 rounded-xl p-4 space-y-3">
              {suggestion.nextTrack && (
                <div className="flex items-center gap-3">
                  {suggestion.nextTrack.album?.images?.[0]?.url && (
                    <img
                      src={suggestion.nextTrack.album.images[0].url}
                      alt=""
                      className="w-10 h-10 rounded object-cover"
                    />
                  )}
                  <div>
                    <p className="text-white text-sm font-semibold">{suggestion.nextTrack.name}</p>
                    <p className="text-slate-400 text-xs">{suggestion.nextTrack.artists.map(a => a.name).join(', ')}</p>
                  </div>
                  {energy && (
                    <span className={`ml-auto text-[10px] font-medium px-2 py-0.5 rounded-full ${energy.bg} ${energy.color}`}>
                      {energy.label}
                    </span>
                  )}
                </div>
              )}
              {suggestion.reason && (
                <p className="text-slate-300 text-xs leading-relaxed">{suggestion.reason}</p>
              )}
              {suggestion.transitionTip && (
                <div className="bg-white/5 rounded-lg px-3 py-2">
                  <p className="text-[10px] text-slate-500 uppercase font-semibold mb-1">Transition Tip</p>
                  <p className="text-yellow-200 text-xs">{suggestion.transitionTip}</p>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {tab === 'chat' && (
        <div className="flex flex-col flex-1 overflow-hidden">
          <div className="flex-1 overflow-y-auto space-y-2 mb-3">
            {chatMessages.length === 0 && (
              <p className="text-slate-600 text-xs text-center py-4">Ask anything about your mix…</p>
            )}
            {chatMessages.map((m, i) => (
              <div key={i} className={`text-xs rounded-lg px-3 py-2 max-w-[90%] ${
                m.role === 'user'
                  ? 'ml-auto bg-violet-600/20 text-violet-200'
                  : 'bg-white/5 text-slate-300'
              }`}>
                {m.content}
              </div>
            ))}
            {loadingChat && (
              <div className="flex items-center gap-1 text-slate-500 text-xs">
                <Loader2 size={10} className="animate-spin" /> thinking…
              </div>
            )}
          </div>
        </div>
      )}

      {/* Input */}
      <div className="flex gap-2 mt-auto pt-2 border-t border-white/5">
        <input
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSend()}
          placeholder={tab === 'chat' ? 'Ask the AI DJ…' : 'Custom request…'}
          className="flex-1 bg-[#1a1a2e] border border-white/10 rounded-lg px-3 py-2 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-yellow-400/30"
        />
        <button
          onClick={handleSend}
          disabled={!input.trim() || loadingChat || loadingSuggestion}
          className="w-8 h-8 flex items-center justify-center rounded-lg bg-yellow-400/20 text-yellow-300 hover:bg-yellow-400/30 disabled:opacity-30 transition-colors"
        >
          <Send size={13} />
        </button>
      </div>
    </div>
  )
}
