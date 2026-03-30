// Spotify PKCE OAuth + API helpers

export const SPOTIFY_SCOPES = [
  'streaming',
  'user-read-email',
  'user-read-private',
  'user-read-playback-state',
  'user-modify-playback-state',
  'user-read-currently-playing',
  'playlist-read-private',
  'playlist-read-collaborative',
  'user-library-read',
].join(' ')

export interface SpotifyTrack {
  id: string
  name: string
  artists: { name: string }[]
  album: { name: string; images: { url: string }[] }
  duration_ms: number
  uri: string
  preview_url: string | null
}

export interface AudioFeatures {
  tempo: number
  key: number
  mode: number
  energy: number
  danceability: number
  valence: number
  time_signature: number
}

const KEYS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

export function keyName(key: number, mode: number) {
  return `${KEYS[key] ?? '?'} ${mode === 1 ? 'maj' : 'min'}`
}

// ── PKCE helpers ─────────────────────────────────────────────────────────────

function base64url(buffer: ArrayBuffer | Uint8Array) {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer)
  let str = ''
  for (let i = 0; i < bytes.length; i++) str += String.fromCharCode(bytes[i])
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

export async function generatePKCE() {
  const verifierBytes = crypto.getRandomValues(new Uint8Array(32))
  const verifier = base64url(verifierBytes)
  const challenge = base64url(
    await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))
  )
  return { verifier, challenge }
}

export function buildAuthUrl(clientId: string, redirectUri: string, challenge: string) {
  const state = base64url(crypto.getRandomValues(new Uint8Array(8)))
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    redirect_uri: redirectUri,
    code_challenge_method: 'S256',
    code_challenge: challenge,
    state,
    scope: SPOTIFY_SCOPES,
    show_dialog: 'true',
  })
  return `https://accounts.spotify.com/authorize?${params}`
}

export async function exchangeCode(
  code: string, verifier: string, clientId: string, redirectUri: string
) {
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      client_id: clientId,
      code_verifier: verifier,
    }),
  })
  if (!res.ok) throw new Error('Token exchange failed')
  return res.json()
}

export async function refreshAccessToken(clientId: string, refreshToken: string) {
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: clientId,
    }),
  })
  if (!res.ok) throw new Error('Refresh failed')
  return res.json()
}

// ── API calls ─────────────────────────────────────────────────────────────────

async function spotifyFetch(path: string, token: string) {
  const res = await fetch(`https://api.spotify.com/v1${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) {
    let detail = ''
    try {
      const body = await res.json()
      detail = body?.error?.message ?? body?.error_description ?? JSON.stringify(body)
    } catch {
      try { detail = await res.text() } catch { /* ignore */ }
    }
    throw new Error(`Spotify API error ${res.status}: ${path}${detail ? ` — ${detail}` : ''}`)
  }
  return res.json()
}

export async function getMe(token: string) {
  return spotifyFetch('/me', token)
}

export async function getPlaylists(token: string, limit = 50) {
  // tracks field renamed to items in simplified playlist objects
  return spotifyFetch(
    `/me/playlists?limit=${limit}&fields=items(id,name,images,owner(id),tracks(total))`,
    token
  )
}

export async function getPlaylistTracks(token: string, playlistId: string, limit = 50) {
  // Use the current endpoint /items (not deprecated /tracks)
  // Response shape: { items: [{ item: TrackObject }] }
  return spotifyFetch(
    `/playlists/${playlistId}/items?limit=${limit}&fields=items(item(id,name,type,artists(name),album(name,images),duration_ms,uri,preview_url))`,
    token
  )
}

export async function getAudioFeatures(token: string, trackIds: string[]): Promise<(AudioFeatures | null)[]> {
  if (!trackIds.length) return []
  try {
    const data = await spotifyFetch(`/audio-features?ids=${trackIds.join(',')}`, token)
    return data.audio_features ?? []
  } catch {
    // Audio features API may be restricted or deprecated for this app
    return trackIds.map(() => null)
  }
}

export async function transferPlayback(token: string, deviceId: string) {
  await fetch('https://api.spotify.com/v1/me/player', {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ device_ids: [deviceId], play: false }),
  })
}

export async function play(token: string, deviceId: string, uris: string[], positionMs = 0) {
  await fetch(`https://api.spotify.com/v1/me/player/play?device_id=${deviceId}`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ uris, position_ms: positionMs }),
  })
}

export async function pause(token: string, deviceId: string) {
  await fetch(`https://api.spotify.com/v1/me/player/pause?device_id=${deviceId}`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}` },
  })
}

export async function setVolume(token: string, deviceId: string, pct: number) {
  await fetch(`https://api.spotify.com/v1/me/player/volume?volume_percent=${pct}&device_id=${deviceId}`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}` },
  })
}

export async function seekTo(token: string, deviceId: string, positionMs: number) {
  await fetch(`https://api.spotify.com/v1/me/player/seek?position_ms=${positionMs}&device_id=${deviceId}`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}` },
  })
}

export function msToTime(ms: number) {
  const s = Math.floor(ms / 1000)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}
