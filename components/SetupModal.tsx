'use client'

import { useState } from 'react'
import { Music2, Zap, X } from 'lucide-react'

interface Props {
  onSave: (spotifyClientId: string, groqKey: string) => void
  initial?: { spotifyClientId: string; groqKey: string }
  onClose?: () => void
}

export default function SetupModal({ onSave, initial, onClose }: Props) {
  const [clientId, setClientId] = useState(initial?.spotifyClientId ?? '')
  const [groqKey, setGroqKey] = useState(initial?.groqKey ?? '')

  const handleSave = () => {
    if (!clientId.trim() || !groqKey.trim()) return
    onSave(clientId.trim(), groqKey.trim())
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="bg-[#0d0d1a] border border-white/10 rounded-2xl p-8 w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-white">DJ Mixer Setup</h1>
            <p className="text-slate-400 text-sm mt-1">Connect your accounts to start mixing</p>
          </div>
          {onClose && (
            <button onClick={onClose} className="text-slate-500 hover:text-white transition-colors">
              <X size={20} />
            </button>
          )}
        </div>

        {/* Spotify */}
        <div className="mb-5">
          <label className="flex items-center gap-2 text-sm font-medium text-slate-300 mb-2">
            <Music2 size={16} className="text-[#1DB954]" />
            Spotify Client ID
          </label>
          <input
            type="text"
            value={clientId}
            onChange={e => setClientId(e.target.value)}
            placeholder="e.g. 9a8b7c6d5e4f3a2b1c0d..."
            className="w-full bg-[#1a1a2e] border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-[#1DB954]/50"
          />
          <p className="text-xs text-slate-500 mt-1.5">
            Create one at{' '}
            <span className="text-[#1DB954]">developer.spotify.com/dashboard</span>.
            Set redirect URI to <code className="text-slate-300">http://localhost:3003/callback</code>
          </p>
        </div>

        {/* Groq */}
        <div className="mb-7">
          <label className="flex items-center gap-2 text-sm font-medium text-slate-300 mb-2">
            <Zap size={16} className="text-yellow-400" />
            Groq API Key
          </label>
          <input
            type="password"
            value={groqKey}
            onChange={e => setGroqKey(e.target.value)}
            placeholder="gsk_..."
            className="w-full bg-[#1a1a2e] border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-yellow-400/50"
          />
          <p className="text-xs text-slate-500 mt-1.5">
            Get yours at <span className="text-yellow-400">console.groq.com</span>. Stored locally only.
          </p>
        </div>

        <button
          onClick={handleSave}
          disabled={!clientId.trim() || !groqKey.trim()}
          className="w-full py-3 rounded-xl font-semibold text-white bg-gradient-to-r from-violet-600 to-cyan-600 hover:from-violet-500 hover:to-cyan-500 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
        >
          Launch Mixer
        </button>
      </div>
    </div>
  )
}
