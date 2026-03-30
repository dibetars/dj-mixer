'use client'

import { useEffect, useRef, useState } from 'react'
import { Pause, Play, SkipBack, Volume2 } from 'lucide-react'
import { AudioFeatures, SpotifyTrack, keyName, msToTime } from '@/lib/spotify'

interface Props {
  side: 'A' | 'B'
  track: SpotifyTrack | null
  features: AudioFeatures | null
  isPlaying: boolean
  position: number // ms
  duration: number // ms
  volume: number // 0-100
  onPlay: () => void
  onPause: () => void
  onSeek: (ms: number) => void
  onVolumeChange: (v: number) => void
  onRestart: () => void
}

const SIDE_COLORS = {
  A: { accent: '#7c3aed', glow: 'glow-a', text: 'text-violet-400', border: 'border-violet-700/40', track: 'deck-a', bg: 'from-violet-900/20' },
  B: { accent: '#0891b2', glow: 'glow-b', text: 'text-cyan-400', border: 'border-cyan-700/40', track: 'deck-b', bg: 'from-cyan-900/20' },
}

export default function Deck({
  side, track, features, isPlaying, position, duration, volume,
  onPlay, onPause, onSeek, onVolumeChange, onRestart,
}: Props) {
  const c = SIDE_COLORS[side]
  const [vinylRotation, setVinylRotation] = useState(0)
  const rafRef = useRef<number>()
  const lastTimeRef = useRef<number>()

  useEffect(() => {
    if (isPlaying) {
      const spin = (ts: number) => {
        if (lastTimeRef.current) {
          const delta = ts - lastTimeRef.current
          setVinylRotation(r => r + (delta / 1000) * 33.3 * (360 / 60))
        }
        lastTimeRef.current = ts
        rafRef.current = requestAnimationFrame(spin)
      }
      rafRef.current = requestAnimationFrame(spin)
    } else {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      lastTimeRef.current = undefined
    }
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current) }
  }, [isPlaying])

  const albumArt = track?.album?.images?.[0]?.url
  const progress = duration > 0 ? (position / duration) * 100 : 0

  return (
    <div className={`bg-gradient-to-b ${c.bg} to-transparent rounded-2xl border ${c.border} p-3 flex flex-col gap-1.5 h-full overflow-hidden`}>
      {/* Header: deck label + BPM/key */}
      <div className="flex items-center justify-between shrink-0">
        <span className={`text-[10px] font-bold tracking-widest uppercase ${c.text} bg-white/5 px-2 py-0.5 rounded`}>
          Deck {side}
        </span>
        {features && (
          <div className="flex gap-2 text-[10px] text-slate-400">
            <span className={`font-mono font-bold ${c.text}`}>{Math.round(features.tempo)} BPM</span>
            <span>{keyName(features.key, features.mode)}</span>
            <span>E {Math.round(features.energy * 100)}%</span>
          </div>
        )}
      </div>

      {/* Vinyl + track info side by side */}
      <div className="flex items-center gap-3 shrink-0">
        <div className="relative shrink-0">
          <div
            className={`w-24 h-24 rounded-full ${c.glow}`}
            style={{
              background: `conic-gradient(from 0deg, #1a1a2e, #0d0d1a, #1a1a2e, #0d0d1a)`,
              transform: `rotate(${vinylRotation}deg)`,
              transition: isPlaying ? 'none' : 'transform 0.3s',
            }}
          >
            {[20, 28, 36, 44].map(r => (
              <div key={r} className="absolute inset-0 rounded-full"
                style={{ border: `1px solid rgba(255,255,255,0.04)`, margin: `${48 - r}px` }} />
            ))}
          </div>
          <div
            className="absolute top-1/2 left-1/2 w-11 h-11 rounded-full overflow-hidden"
            style={{ transform: `translate(-50%, -50%) rotate(${-vinylRotation}deg)` }}
          >
            {albumArt
              ? <img src={albumArt} alt="album" className="w-full h-full object-cover" />
              : <div className="w-full h-full" style={{ background: c.accent }} />
            }
          </div>
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full bg-[#050508] z-10" />
        </div>

        {/* Track name + controls stacked */}
        <div className="flex-1 min-w-0 flex flex-col gap-1.5">
          <div>
            {track ? (
              <>
                <p className="text-white font-semibold text-xs truncate">{track.name}</p>
                <p className="text-slate-400 text-[10px] truncate">{track.artists.map(a => a.name).join(', ')}</p>
              </>
            ) : (
              <p className="text-slate-600 text-xs">No track loaded</p>
            )}
          </div>

          {/* Transport controls */}
          <div className="flex items-center gap-2">
            <button onClick={onRestart} disabled={!track}
              className="w-7 h-7 flex items-center justify-center text-slate-400 hover:text-white disabled:opacity-30 transition-colors">
              <SkipBack size={13} />
            </button>
            <button
              onClick={isPlaying ? onPause : onPlay}
              disabled={!track}
              className="w-10 h-10 rounded-full flex items-center justify-center disabled:opacity-30 transition-all active:scale-95 shrink-0"
              style={{ background: track ? c.accent : '#1a1a2e' }}
            >
              {isPlaying
                ? <Pause size={16} fill="white" stroke="none" />
                : <Play size={16} fill="white" stroke="none" className="ml-0.5" />}
            </button>
            {/* Volume inline */}
            <div className="flex items-center gap-1 flex-1">
              <Volume2 size={11} className="text-slate-500 shrink-0" />
              <input type="range" min={0} max={100} value={volume}
                onChange={e => onVolumeChange(Number(e.target.value))}
                className={`${c.track} flex-1`} />
              <span className="text-[9px] text-slate-500 font-mono w-6 text-right">{volume}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Progress bar */}
      <div className="shrink-0">
        <input type="range" min={0} max={duration || 100} value={position}
          onChange={e => onSeek(Number(e.target.value))}
          className={`progress ${c.track} w-full`} disabled={!track} />
        <div className="flex justify-between text-[10px] text-slate-500 font-mono">
          <span>{msToTime(position)}</span>
          <span>{msToTime(duration)}</span>
        </div>
      </div>

      {/* Hot Cue Pads */}
      {track && duration > 0 && (
        <div className="shrink-0">
          <p className="text-[8px] text-slate-600 uppercase tracking-wider mb-1">Hot Cues</p>
          <div className="grid grid-cols-4 gap-1">
            {Array.from({ length: 8 }, (_, i) => {
              const padMs = Math.floor((i / 8) * duration)
              const nextMs = Math.floor(((i + 1) / 8) * duration)
              const active = position >= padMs && (i === 7 || position < nextMs)
              return (
                <button key={i} onClick={() => onSeek(padMs)}
                  title={`Cue ${i + 1} — ${msToTime(padMs)}`}
                  className={`h-6 rounded text-[9px] font-bold transition-all active:scale-95 ${
                    active ? 'text-white' : 'bg-white/5 text-slate-500 hover:bg-white/10 hover:text-white'
                  }`}
                  style={active ? { backgroundColor: c.accent + '70' } : undefined}
                >
                  {i + 1}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
