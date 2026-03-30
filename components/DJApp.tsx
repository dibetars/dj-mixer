'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { LogOut, Settings } from 'lucide-react'
import Deck from './Deck'
import PlaylistPanel from './PlaylistPanel'
import AIPanel from './AIPanel'
import SetupModal from './SetupModal'
import {
  AudioFeatures, SpotifyTrack,
  buildAuthUrl, generatePKCE, getAudioFeatures,
  getMe, getPlaylists, getPlaylistTracks,
  pause, play, refreshAccessToken, seekTo, setVolume, transferPlayback,
} from '@/lib/spotify'
import { MixSuggestion, chatWithDJ, getMixSuggestion } from '@/lib/groq'

declare global {
  interface Window {
    onSpotifyWebPlaybackSDKReady: () => void
    Spotify: {
      Player: new (opts: {
        name: string
        getOAuthToken: (cb: (t: string) => void) => void
        volume: number
      }) => SpotifyPlayer
    }
  }
}

interface SpotifyPlayer {
  connect(): Promise<boolean>
  disconnect(): void
  addListener(event: string, cb: (data: unknown) => void): void
  removeListener(event: string): void
  getCurrentState(): Promise<SpotifyPlayerState | null>
  setVolume(v: number): Promise<void>
  resume(): Promise<void>
  pause(): Promise<void>
  seek(ms: number): Promise<void>
}

interface SpotifyPlayerState {
  paused: boolean
  position: number
  duration: number
  track_window: { current_track: { id: string; name: string; artists: { name: string }[]; album: { name: string; images: { url: string }[] }; uri: string; duration_ms: number } }
}

interface DeckState {
  track: SpotifyTrack | null
  features: AudioFeatures | null
  isPlaying: boolean
  position: number
  duration: number
  volume: number
  deviceId: string | null
  player: SpotifyPlayer | null
}

const DEFAULT_DECK: DeckState = {
  track: null, features: null, isPlaying: false,
  position: 0, duration: 0, volume: 80,
  deviceId: null, player: null,
}

type ChatMessage = { role: 'user' | 'assistant'; content: string }

export default function DJApp() {
  const [showSetup, setShowSetup] = useState(false)
  const [config, setConfig] = useState<{ spotifyClientId: string; groqKey: string } | null>(null)
  const [user, setUser] = useState<{ display_name: string; images: { url: string }[] } | null>(null)

  const [deckA, setDeckA] = useState<DeckState>({ ...DEFAULT_DECK })
  const [deckB, setDeckB] = useState<DeckState>({ ...DEFAULT_DECK })
  const [crossfader, setCrossfader] = useState(50) // 0=A, 100=B

  const [grantedScopes, setGrantedScopes] = useState<string>('')
  const [playlists, setPlaylists] = useState<{ id: string; name: string; images: { url: string }[]; tracks?: { total: number }; items?: { total: number } }[]>([])
  const [tracks, setTracks] = useState<SpotifyTrack[]>([])
  const [trackFeatures, setTrackFeatures] = useState<(AudioFeatures | null)[]>([])
  const [selectedPlaylistId, setSelectedPlaylistId] = useState<string | null>(null)
  const [loadingTracks, setLoadingTracks] = useState(false)
  const [tracksError, setTracksError] = useState<string | null>(null)

  const [suggestion, setSuggestion] = useState<MixSuggestion | null>(null)
  const [loadingSuggestion, setLoadingSuggestion] = useState(false)
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [loadingChat, setLoadingChat] = useState(false)
  const [autoDJ, setAutoDJ] = useState(false)
  const [autoSuggestTick, setAutoSuggestTick] = useState(0)

  const tokenRef = useRef<string | null>(null)
  const positionTimerRef = useRef<NodeJS.Timeout>()
  const autoDJRef = useRef(false)
  const crossfaderRef = useRef(50)
  const autoFadingRef = useRef(false)
  const fadeIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const deckARef = useRef<DeckState>({ ...DEFAULT_DECK })
  const deckBRef = useRef<DeckState>({ ...DEFAULT_DECK })
  const autoSuggestRef = useRef<string | null>(null)
  const autoFadeRef = useRef<string | null>(null)

  // ── Token management ──────────────────────────────────────────────────────

  const getToken = useCallback(async (): Promise<string | null> => {
    // localStorage coerces undefined/null to the strings "undefined"/"null" — reject those
    const clean = (v: string | null) =>
      v && v !== 'null' && v !== 'undefined' ? v : null

    const stored = clean(localStorage.getItem('spotify_access_token'))
    const expiry = Number(localStorage.getItem('spotify_token_expiry') ?? 0)
    const refresh = clean(localStorage.getItem('spotify_refresh_token'))
    const clientId = clean(localStorage.getItem('spotify_client_id'))

    if (stored && Date.now() < expiry - 30_000) {
      tokenRef.current = stored
      return stored
    }
    if (refresh && clientId) {
      try {
        const tokens = await refreshAccessToken(clientId, refresh)
        if (tokens.access_token) {
          localStorage.setItem('spotify_access_token', tokens.access_token)
          localStorage.setItem('spotify_token_expiry', String(Date.now() + tokens.expires_in * 1000))
          if (tokens.refresh_token) localStorage.setItem('spotify_refresh_token', tokens.refresh_token)
          tokenRef.current = tokens.access_token
          return tokens.access_token
        }
      } catch { /* fall through */ }
    }
    return null
  }, [])

  // ── Init ──────────────────────────────────────────────────────────────────

  useEffect(() => {
    const clientId = localStorage.getItem('spotify_client_id')
    const groqKey = localStorage.getItem('groq_api_key')

    if (!clientId || !groqKey) {
      setShowSetup(true)
      return
    }
    setConfig({ spotifyClientId: clientId, groqKey })

    const scopes = localStorage.getItem('spotify_granted_scopes') ?? ''
    setGrantedScopes(scopes)
    if (scopes && !scopes.includes('playlist-read-private')) {
      console.warn('[DJ Mixer] Token missing playlist-read-private scope. Granted:', scopes)
    }

    getToken().then(token => {
      if (!token) { setShowSetup(true); return }
      loadUser(token)
      loadPlaylists(token)
    })
  }, [getToken])

  // ── Spotify Web Playback SDK ──────────────────────────────────────────────

  function initPlayer(side: 'A' | 'B') {
    const createPlayer = () => {
      const player = new window.Spotify.Player({
        name: `DJ Mixer Deck ${side}`,
        getOAuthToken: async cb => { const t = await getToken(); if (t) cb(t) },
        volume: 0.8,
      })

      player.addListener('ready', (data: unknown) => {
        const { device_id } = data as { device_id: string }
        if (side === 'A') setDeckA(d => ({ ...d, player, deviceId: device_id }))
        else setDeckB(d => ({ ...d, player, deviceId: device_id }))
        getToken().then(t => { if (t) transferPlayback(t, device_id) })
      })

      player.addListener('player_state_changed', (state: unknown) => {
        const s = state as SpotifyPlayerState | null
        if (!s) return
        const setter = side === 'A' ? setDeckA : setDeckB
        setter(d => ({
          ...d,
          isPlaying: !s.paused,
          position: s.position,
          duration: s.duration,
        }))
      })

      player.addListener('initialization_error', (e: unknown) => console.error('SDK init error', e))
      player.addListener('authentication_error', (e: unknown) => console.error('SDK auth error', e))
      player.addListener('account_error', () => console.error('Spotify Premium required for Web Playback SDK'))

      player.connect()
    }

    if (window.Spotify) {
      // SDK already loaded — create player immediately
      createPlayer()
    } else {
      // Chain callbacks so both decks initialise when the SDK fires once
      const prev = window.onSpotifyWebPlaybackSDKReady
      window.onSpotifyWebPlaybackSDKReady = () => {
        if (typeof prev === 'function') prev()
        createPlayer()
      }
      if (!document.querySelector('script[src*="spotify-player"]')) {
        const script = document.createElement('script')
        script.src = 'https://sdk.scdn.co/spotify-player.js'
        script.async = true
        document.body.appendChild(script)
      }
    }
  }

  // ── Position ticker + Auto DJ ─────────────────────────────────────────────

  useEffect(() => {
    clearInterval(positionTimerRef.current)
    positionTimerRef.current = setInterval(() => {
      const dA = deckARef.current, dB = deckBRef.current
      if (dA.isPlaying) setDeckA(d => ({ ...d, position: Math.min(d.position + 500, d.duration) }))
      if (dB.isPlaying) setDeckB(d => ({ ...d, position: Math.min(d.position + 500, d.duration) }))

      if (!autoDJRef.current || autoFadingRef.current) return
      const playing = dA.isPlaying ? 'A' : dB.isPlaying ? 'B' : null
      if (!playing) return
      const active = playing === 'A' ? dA : dB
      if (!active.track || active.duration === 0) return
      const remaining = active.duration - active.position
      const tid = active.track.id

      // 30s out: request next suggestion
      if (remaining < 30_000 && remaining > 0 && autoSuggestRef.current !== tid) {
        autoSuggestRef.current = tid
        setAutoSuggestTick(t => t + 1)
      }
      // 8s out: smooth crossfade + start other deck
      if (remaining < 8_000 && remaining > 0 && autoFadeRef.current !== tid) {
        autoFadeRef.current = tid
        autoFadingRef.current = true
        const to = playing === 'A' ? 100 : 0
        const from = crossfaderRef.current; const steps = 14; let step = 0
        if (fadeIntervalRef.current) clearInterval(fadeIntervalRef.current)
        fadeIntervalRef.current = setInterval(() => {
          step++
          const v = Math.round(from + (to - from) * (step / steps))
          setCrossfader(v); crossfaderRef.current = v
          if (step >= steps) {
            clearInterval(fadeIntervalRef.current!); fadeIntervalRef.current = null; autoFadingRef.current = false
          }
        }, 7000 / steps)
        const other = playing === 'A' ? dB : dA
        if (other.track && !other.isPlaying && other.deviceId && tokenRef.current) {
          play(tokenRef.current, other.deviceId, [other.track.uri], 0).catch(() => {})
          const setter = playing === 'A' ? setDeckB : setDeckA
          setter(d => ({ ...d, isPlaying: true, position: 0 }))
        }
      }
    }, 500)
    return () => clearInterval(positionTimerRef.current)
  }, [deckA.isPlaying, deckB.isPlaying]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Crossfader → volume (fix: include players in deps to avoid stale closure)

  useEffect(() => {
    const volA = Math.round(((100 - crossfader) / 100) * deckA.volume)
    const volB = Math.round((crossfader / 100) * deckB.volume)
    if (deckA.player) deckA.player.setVolume(volA / 100)
    if (deckB.player) deckB.player.setVolume(volB / 100)
  }, [crossfader, deckA.player, deckB.player, deckA.volume, deckB.volume])

  // ── Sync refs ─────────────────────────────────────────────────────────────

  useEffect(() => { autoDJRef.current = autoDJ }, [autoDJ])
  useEffect(() => { crossfaderRef.current = crossfader }, [crossfader])
  useEffect(() => { deckARef.current = deckA }, [deckA])
  useEffect(() => { deckBRef.current = deckB }, [deckB])

  // ── Auto DJ: trigger AI suggestion when tick fires ─────────────────────────

  useEffect(() => {
    if (autoSuggestTick > 0) handleGetSuggestion()
  }, [autoSuggestTick]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Auto DJ: load suggestion to free deck ─────────────────────────────────

  useEffect(() => {
    if (!autoDJ || !suggestion?.nextTrack) return
    const freeDeck = deckA.isPlaying ? 'B' : deckB.isPlaying ? 'A' : null
    if (!freeDeck) return
    const freeState = freeDeck === 'A' ? deckA : deckB
    if (freeState.track?.id !== suggestion.nextTrack.id) handleLoadToDeck(suggestion.nextTrack, freeDeck)
  }, [suggestion?.nextTrack?.id, autoDJ]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Data loaders ──────────────────────────────────────────────────────────

  async function loadUser(token: string) {
    try { setUser(await getMe(token)) } catch { /* ignore */ }
  }

  async function loadPlaylists(token: string) {
    try {
      const data = await getPlaylists(token)
      // Filter out Spotify-owned algorithmic playlists (Discover Weekly, Daily Mixes, etc.)
      // These appear in /me/playlists but return 403 on /playlists/{id}/tracks
      const items = (data.items ?? []).filter((pl: any) => pl?.owner?.id !== 'spotify')
      setPlaylists(items)
    } catch { /* ignore */ }
  }

  async function handleSelectPlaylist(id: string) {
    setSelectedPlaylistId(id)
    setLoadingTracks(true)
    setTracks([])
    setTrackFeatures([])
    setTracksError(null)
    try {
      const token = await getToken()
      if (!token) {
        setTracksError('Spotify session expired — click Reconnect to re-authenticate.')
        return
      }
      const data = await getPlaylistTracks(token, id)
      // New endpoint returns i.item (old deprecated endpoint used i.track)
      const trackList: SpotifyTrack[] = (data.items ?? [])
        .map((i: any) => i.item ?? i.track)
        .filter((t: any): t is SpotifyTrack => !!t && t.type !== 'episode')
      setTracks(trackList)

      // Fetch audio features (gracefully — this API is restricted for many apps)
      if (trackList.length > 0) {
        const ids = trackList.map((t: SpotifyTrack) => t.id).filter(Boolean)
        const features: (AudioFeatures | null)[] = Array(trackList.length).fill(null)
        for (let i = 0; i < ids.length; i += 50) {
          const batch = await getAudioFeatures(token, ids.slice(i, i + 50))
          batch.forEach((f, j) => { features[i + j] = f })
        }
        setTrackFeatures(features)
      }
    } catch (e: any) {
      const msg = e?.message ?? ''
      if (msg.includes('403')) {
        setTracksError(`Access denied (403)${msg.includes('—') ? ': ' + msg.split('—')[1].trim() : ''} — this playlist may be restricted. Try another playlist or click Reconnect.`)
      } else if (msg.includes('401')) {
        setTracksError('Session expired — click Reconnect to sign in again.')
      } else {
        setTracksError(`Failed to load tracks: ${msg || 'unknown error'}`)
      }
    } finally {
      setLoadingTracks(false)
    }
  }

  // ── Deck actions ──────────────────────────────────────────────────────────

  async function handleLoadToDeck(track: SpotifyTrack, deck: 'A' | 'B') {
    const featIdx = tracks.findIndex(t => t.id === track.id)
    const features = featIdx >= 0 ? (trackFeatures[featIdx] ?? null) : null

    const setter = deck === 'A' ? setDeckA : setDeckB
    setter(d => ({ ...d, track, features, position: 0, duration: track.duration_ms, isPlaying: false }))

    // Init SDK player on first load
    const current = deck === 'A' ? deckA : deckB
    if (!current.player) initPlayer(deck)
  }

  async function handlePlay(deck: 'A' | 'B') {
    const d = deck === 'A' ? deckA : deckB
    const setter = deck === 'A' ? setDeckA : setDeckB
    if (!d.track) return
    try {
      const token = await getToken()
      if (!token) return
      if (d.player && d.deviceId) {
        await play(token, d.deviceId, [d.track.uri], d.position)
        setter(s => ({ ...s, isPlaying: true }))
      }
    } catch (e) { console.error('play error', e) }
  }

  async function handlePause(deck: 'A' | 'B') {
    const d = deck === 'A' ? deckA : deckB
    const setter = deck === 'A' ? setDeckA : setDeckB
    try {
      const token = await getToken()
      if (!token) return
      if (d.player && d.deviceId) {
        await pause(token, d.deviceId)
        setter(s => ({ ...s, isPlaying: false }))
      }
    } catch (e) { console.error('pause error', e) }
  }

  async function handleSeek(deck: 'A' | 'B', ms: number) {
    const d = deck === 'A' ? deckA : deckB
    const setter = deck === 'A' ? setDeckA : setDeckB
    setter(s => ({ ...s, position: ms }))
    try {
      const token = await getToken()
      if (token && d.deviceId) await seekTo(token, d.deviceId, ms)
    } catch { /* ignore */ }
  }

  async function handleVolume(deck: 'A' | 'B', v: number) {
    const d = deck === 'A' ? deckA : deckB
    const setter = deck === 'A' ? setDeckA : setDeckB
    setter(s => ({ ...s, volume: v }))
    try {
      const token = await getToken()
      const effective = deck === 'A'
        ? Math.round(((100 - crossfader) / 100) * v)
        : Math.round((crossfader / 100) * v)
      if (token && d.deviceId) await setVolume(token, d.deviceId, effective)
    } catch { /* ignore */ }
  }

  async function handleRestart(deck: 'A' | 'B') {
    await handleSeek(deck, 0)
  }

  // ── Spotify auth ──────────────────────────────────────────────────────────

  async function handleConnect() {
    const clientId = localStorage.getItem('spotify_client_id')
    if (!clientId) return
    const redirectUri = `${window.location.origin}/callback`
    localStorage.setItem('spotify_redirect_uri', redirectUri)
    const { verifier, challenge } = await generatePKCE()
    sessionStorage.setItem('pkce_verifier', verifier)
    window.location.href = buildAuthUrl(clientId, redirectUri, challenge)
  }

  function handleLogout() {
    localStorage.removeItem('spotify_access_token')
    localStorage.removeItem('spotify_refresh_token')
    localStorage.removeItem('spotify_token_expiry')
    setUser(null)
    setPlaylists([])
    setTracks([])
    setDeckA({ ...DEFAULT_DECK })
    setDeckB({ ...DEFAULT_DECK })
  }

  function handleReconnectSpotify() {
    // Clear all tokens to force a fresh OAuth flow with full scopes
    localStorage.removeItem('spotify_access_token')
    localStorage.removeItem('spotify_refresh_token')
    localStorage.removeItem('spotify_token_expiry')
    setUser(null)
    setPlaylists([])
    setTracks([])
    handleConnect()
  }

  // ── Save config ───────────────────────────────────────────────────────────

  function handleSaveConfig(clientId: string, groqKey: string) {
    localStorage.setItem('spotify_client_id', clientId)
    localStorage.setItem('groq_api_key', groqKey)
    setConfig({ spotifyClientId: clientId, groqKey })
    setShowSetup(false)
    handleConnect()
  }

  // ── AI ────────────────────────────────────────────────────────────────────

  async function handleGetSuggestion(request?: string) {
    const currentTrack = deckA.isPlaying ? deckA.track : deckB.isPlaying ? deckB.track : (deckA.track ?? deckB.track)
    const currentFeatures = deckA.isPlaying ? deckA.features : deckB.isPlaying ? deckB.features : null
    const groqKey = localStorage.getItem('groq_api_key')
    if (!currentTrack || !groqKey || !tracks.length) return

    setLoadingSuggestion(true)
    try {
      const result = await getMixSuggestion(groqKey, currentTrack, currentFeatures, tracks, trackFeatures, request)
      setSuggestion(result)
    } catch (e) {
      console.error('Groq error', e)
    } finally {
      setLoadingSuggestion(false)
    }
  }

  async function handleChat(msg: string) {
    const groqKey = localStorage.getItem('groq_api_key')
    if (!groqKey) return

    const newMessages: ChatMessage[] = [...chatMessages, { role: 'user', content: msg }]
    setChatMessages(newMessages)
    setLoadingChat(true)

    const currentTrack = deckA.isPlaying ? deckA.track : deckB.track
    const context = currentTrack
      ? `Playing "${currentTrack.name}" by ${currentTrack.artists.map(a => a.name).join(', ')}`
      : 'No track currently playing'

    try {
      const reply = await chatWithDJ(groqKey, newMessages, context)
      setChatMessages(m => [...m, { role: 'assistant', content: reply }])
    } catch (e) {
      console.error('Chat error', e)
    } finally {
      setLoadingChat(false)
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const isLoggedIn = !!user

  return (
    <>
      {showSetup && (
        <SetupModal
          onSave={handleSaveConfig}
          initial={config ? { spotifyClientId: config.spotifyClientId, groqKey: config.groqKey } : undefined}
          onClose={config ? () => setShowSetup(false) : undefined}
        />
      )}

      <div className="flex flex-col h-screen overflow-hidden">
        {/* Header */}
        <header className="flex items-center justify-between px-5 py-3 border-b border-white/5 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-600 to-cyan-600 flex items-center justify-center text-xs font-bold">
              DJ
            </div>
            <span className="text-white font-semibold text-sm">Groq × Spotify Mixer</span>
          </div>

          <div className="flex items-center gap-3">
            {!isLoggedIn && config && (
              <button
                onClick={handleConnect}
                className="text-xs px-3 py-1.5 rounded-lg bg-[#1DB954]/20 text-[#1DB954] hover:bg-[#1DB954]/30 font-medium transition-colors"
              >
                Connect Spotify
              </button>
            )}
            {isLoggedIn && (
              <div className="flex items-center gap-2">
                {user?.images?.[0]?.url && (
                  <img src={user.images[0].url} alt="" className="w-6 h-6 rounded-full" />
                )}
                <span className="text-sm text-slate-400">{user?.display_name}</span>
                <button
                  onClick={handleReconnectSpotify}
                  title="Re-authenticate Spotify to fix permission errors"
                  className="text-xs px-2 py-1 rounded-lg bg-white/5 text-slate-400 hover:bg-[#1DB954]/20 hover:text-[#1DB954] font-medium transition-colors"
                >
                  Reconnect
                </button>
              </div>
            )}
            <button
              onClick={() => setShowSetup(true)}
              className="w-7 h-7 flex items-center justify-center text-slate-500 hover:text-white transition-colors"
            >
              <Settings size={15} />
            </button>
            {isLoggedIn && (
              <button
                onClick={handleLogout}
                className="w-7 h-7 flex items-center justify-center text-slate-500 hover:text-white transition-colors"
              >
                <LogOut size={15} />
              </button>
            )}
          </div>
        </header>

        {/* Scope warning banner */}
        {grantedScopes && !grantedScopes.includes('playlist-read-private') && (
          <div className="shrink-0 px-5 py-2 bg-red-900/40 border-b border-red-500/30 text-xs text-red-300 flex items-center gap-2">
            <span>⚠</span>
            <span>Missing <code>playlist-read-private</code> scope — go to <strong>spotify.com/account/apps</strong>, revoke this app, then click <strong>Reconnect</strong>.</span>
          </div>
        )}

        {/* Main layout: decks+AI top half, playlist bottom half */}
        <div className="flex flex-1 flex-col overflow-hidden min-h-0">
        <div className="flex flex-1 overflow-hidden gap-0 min-h-0">
          {/* Deck A */}
          <div className="w-64 shrink-0 p-3">
            <Deck
              side="A"
              track={deckA.track}
              features={deckA.features}
              isPlaying={deckA.isPlaying}
              position={deckA.position}
              duration={deckA.duration}
              volume={deckA.volume}
              onPlay={() => handlePlay('A')}
              onPause={() => handlePause('A')}
              onSeek={ms => handleSeek('A', ms)}
              onVolumeChange={v => handleVolume('A', v)}
              onRestart={() => handleRestart('A')}
            />
          </div>

          {/* Center column: crossfader + AI */}
          <div className="flex flex-col flex-1 min-w-0 py-3 gap-3">
            {/* Crossfader */}
            <div className="bg-[#0d0d1a] border border-white/5 rounded-2xl px-6 py-4 shrink-0">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-violet-400">A</span>
                <span className="text-[10px] text-slate-500 font-mono uppercase tracking-wider">Crossfader</span>
                <span className="text-xs font-semibold text-cyan-400">B</span>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                value={crossfader}
                onChange={e => setCrossfader(Number(e.target.value))}
                className="crossfader w-full"
              />
              <div className="flex items-center justify-between mt-1">
                <span className="text-[10px] text-slate-600 font-mono">{100 - crossfader}%</span>
                <div className="flex items-center gap-2">
                  {autoDJ && (deckA.isPlaying || deckB.isPlaying) && (() => {
                    const active = deckA.isPlaying ? deckA : deckB
                    const rem = active.duration - active.position
                    return rem < 30_000 && rem > 0 ? (
                      <span className="text-[10px] text-yellow-400 font-mono animate-pulse">⟳ {Math.ceil(rem / 1000)}s</span>
                    ) : null
                  })()}
                  <button
                    onClick={() => setAutoDJ(a => !a)}
                    className={`flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full transition-colors ${autoDJ ? 'bg-green-400/20 text-green-400' : 'bg-white/5 text-slate-500 hover:text-white'}`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${autoDJ ? 'bg-green-400 animate-pulse' : 'bg-slate-600'}`} />
                    Auto DJ
                  </button>
                </div>
                <span className="text-[10px] text-slate-600 font-mono">{crossfader}%</span>
              </div>
            </div>

            {/* AI Panel */}
            <div className="flex-1 bg-[#0d0d1a] border border-white/5 rounded-2xl p-4 overflow-hidden flex flex-col">
              <div className="flex items-center gap-2 mb-3 shrink-0">
                <div className="w-5 h-5 rounded bg-yellow-400/20 flex items-center justify-center">
                  <span className="text-[10px]">⚡</span>
                </div>
                <span className="text-xs font-semibold text-slate-300">Groq AI Assistant</span>
              </div>
              <AIPanel
                suggestion={suggestion}
                loadingSuggestion={loadingSuggestion}
                chatMessages={chatMessages}
                loadingChat={loadingChat}
                currentTrack={deckA.isPlaying ? deckA.track : deckB.isPlaying ? deckB.track : null}
                onGetSuggestion={handleGetSuggestion}
                onChat={handleChat}
              />
            </div>
          </div>

          {/* Deck B */}
          <div className="w-64 shrink-0 p-3">
            <Deck
              side="B"
              track={deckB.track}
              features={deckB.features}
              isPlaying={deckB.isPlaying}
              position={deckB.position}
              duration={deckB.duration}
              volume={deckB.volume}
              onPlay={() => handlePlay('B')}
              onPause={() => handlePause('B')}
              onSeek={ms => handleSeek('B', ms)}
              onVolumeChange={v => handleVolume('B', v)}
              onRestart={() => handleRestart('B')}
            />
          </div>
        </div>

        {/* Playlist panel: bottom half */}
        <div className="flex-1 border-t border-white/5 px-3 py-3 overflow-hidden min-h-0">
          <PlaylistPanel
            playlists={playlists}
            tracks={tracks}
            loadingTracks={loadingTracks}
            tracksError={tracksError}
            selectedPlaylistId={selectedPlaylistId}
            onSelectPlaylist={handleSelectPlaylist}
            onLoadToDeck={handleLoadToDeck}
            suggestedTrackId={suggestion?.nextTrack?.id ?? null}
          />
        </div>
        </div>
      </div>
    </>
  )
}
