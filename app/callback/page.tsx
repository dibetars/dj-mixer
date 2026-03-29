'use client'

import { useEffect } from 'react'
import { exchangeCode } from '@/lib/spotify'

export default function Callback() {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const code = params.get('code')
    const error = params.get('error')

    if (error || !code) {
      window.location.href = '/?auth_error=' + (error ?? 'no_code')
      return
    }

    const verifier = sessionStorage.getItem('pkce_verifier')
    const clientId = localStorage.getItem('spotify_client_id')
    const redirectUri = localStorage.getItem('spotify_redirect_uri')

    if (!verifier || !clientId || !redirectUri) {
      window.location.href = '/?auth_error=missing_verifier'
      return
    }

    exchangeCode(code, verifier, clientId, redirectUri)
      .then((tokens) => {
        if (!tokens.access_token) {
          window.location.href = '/?auth_error=' + encodeURIComponent(
            tokens.error_description ?? tokens.error ?? 'no_access_token'
          )
          return
        }
        // Log granted scopes so we can verify playlist-read-private is included
        console.log('[DJ Mixer] Granted scopes:', tokens.scope)
        localStorage.setItem('spotify_access_token', tokens.access_token)
        localStorage.setItem('spotify_refresh_token', tokens.refresh_token ?? '')
        localStorage.setItem('spotify_token_expiry', String(Date.now() + (tokens.expires_in ?? 3600) * 1000))
        localStorage.setItem('spotify_granted_scopes', tokens.scope ?? '')
        sessionStorage.removeItem('pkce_verifier')
        window.location.href = '/'
      })
      .catch((err) => {
        window.location.href = '/?auth_error=' + encodeURIComponent(err.message)
      })
  }, [])

  return (
    <div className="flex items-center justify-center h-screen bg-[#050508] text-white">
      <div className="text-center">
        <div className="w-10 h-10 border-2 border-violet-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p className="text-slate-400">Connecting to Spotify…</p>
      </div>
    </div>
  )
}
