import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'DJ Mixer — Groq × Spotify',
  description: 'AI-powered DJ tool with Spotify and Groq',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
