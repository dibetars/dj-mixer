'use client'

import { useState } from 'react'
import { ChevronDown, ChevronRight, ListMusic, Loader2 } from 'lucide-react'
import { SpotifyTrack, msToTime } from '@/lib/spotify'

interface Playlist {
  id: string
  name: string
  images: { url: string }[]
  tracks: { total: number }
}

interface Props {
  playlists: Playlist[]
  tracks: SpotifyTrack[]
  loadingTracks: boolean
  tracksError: string | null
  selectedPlaylistId: string | null
  onSelectPlaylist: (id: string) => void
  onLoadToDeck: (track: SpotifyTrack, deck: 'A' | 'B') => void
  suggestedTrackId?: string | null
}

export default function PlaylistPanel({
  playlists, tracks, loadingTracks, tracksError, selectedPlaylistId,
  onSelectPlaylist, onLoadToDeck, suggestedTrackId,
}: Props) {
  const [showPlaylists, setShowPlaylists] = useState(true)

  return (
    <div className="flex h-full gap-3">
      {/* Playlists sidebar */}
      <div className="w-52 shrink-0 flex flex-col gap-1 overflow-y-auto">
        <button
          onClick={() => setShowPlaylists(p => !p)}
          className="flex items-center gap-2 text-xs font-semibold text-slate-400 hover:text-white px-1 mb-1 transition-colors"
        >
          {showPlaylists ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          PLAYLISTS
        </button>
        {showPlaylists && playlists.map(pl => (
          <button
            key={pl.id}
            onClick={() => onSelectPlaylist(pl.id)}
            className={`flex items-center gap-2 px-2 py-1.5 rounded-lg text-left transition-colors ${
              selectedPlaylistId === pl.id
                ? 'bg-violet-600/20 text-violet-300'
                : 'text-slate-400 hover:bg-white/5 hover:text-white'
            }`}
          >
            {pl.images?.[0]?.url
              ? <img src={pl.images[0].url} alt="" className="w-7 h-7 rounded object-cover shrink-0" />
              : <div className="w-7 h-7 rounded bg-white/10 flex items-center justify-center shrink-0"><ListMusic size={12} /></div>
            }
            <div className="min-w-0">
              <p className="text-xs font-medium truncate">{pl.name}</p>
              <p className="text-[10px] text-slate-600">{pl.tracks?.total ?? 0} tracks</p>
            </div>
          </button>
        ))}
      </div>

      {/* Track list */}
      <div className="flex-1 overflow-y-auto">
        {loadingTracks && (
          <div className="flex items-center justify-center h-16 text-slate-500">
            <Loader2 size={16} className="animate-spin mr-2" /> Loading tracks…
          </div>
        )}
        {!loadingTracks && tracksError && (
          <div className="flex items-center h-16 px-3 text-amber-400 text-xs">
            ⚠ {tracksError}
          </div>
        )}
        {!loadingTracks && !tracksError && tracks.length === 0 && (
          <div className="flex items-center justify-center h-16 text-slate-600 text-sm">
            Select a playlist to browse tracks
          </div>
        )}
        {!loadingTracks && tracks.map((track, i) => (
          <div
            key={`${track.id}-${i}`}
            className={`flex items-center gap-3 px-2 py-2 rounded-lg group hover:bg-white/5 transition-colors ${
              suggestedTrackId === track.id ? 'bg-yellow-400/10 ring-1 ring-yellow-400/30' : ''
            }`}
          >
            {track.album?.images?.[0]?.url
              ? <img src={track.album.images[0].url} alt="" className="w-8 h-8 rounded shrink-0 object-cover" />
              : <div className="w-8 h-8 rounded bg-white/10 shrink-0" />
            }
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-white truncate">{track.name}</p>
              <p className="text-[10px] text-slate-500 truncate">{track.artists.map(a => a.name).join(', ')}</p>
            </div>
            <span className="text-[10px] text-slate-600 font-mono shrink-0">{msToTime(track.duration_ms)}</span>
            {suggestedTrackId === track.id && (
              <span className="text-[10px] bg-yellow-400/20 text-yellow-300 px-1.5 py-0.5 rounded font-medium shrink-0">AI Pick</span>
            )}
            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
              <button
                onClick={() => onLoadToDeck(track, 'A')}
                className="text-[10px] px-2 py-0.5 rounded bg-violet-600/30 text-violet-300 hover:bg-violet-600/50 font-medium transition-colors"
              >A</button>
              <button
                onClick={() => onLoadToDeck(track, 'B')}
                className="text-[10px] px-2 py-0.5 rounded bg-cyan-600/30 text-cyan-300 hover:bg-cyan-600/50 font-medium transition-colors"
              >B</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
