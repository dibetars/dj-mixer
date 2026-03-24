import { AudioFeatures, SpotifyTrack, keyName } from './spotify'

export interface MixSuggestion {
  nextTrack: SpotifyTrack | null
  reason: string
  transitionTip: string
  energy: 'lift' | 'maintain' | 'drop'
}

function buildPrompt(
  current: SpotifyTrack,
  features: AudioFeatures | null,
  candidates: SpotifyTrack[],
  candidateFeatures: (AudioFeatures | null)[],
  userRequest?: string
) {
  const currentInfo = features
    ? `BPM: ${Math.round(features.tempo)}, Key: ${keyName(features.key, features.mode)}, Energy: ${Math.round(features.energy * 100)}%, Danceability: ${Math.round(features.danceability * 100)}%`
    : 'audio features unavailable'

  const trackList = candidates
    .slice(0, 20)
    .map((t, i) => {
      const f = candidateFeatures[i]
      const feat = f
        ? ` [${Math.round(f.tempo)}BPM, ${keyName(f.key, f.mode)}, E:${Math.round(f.energy * 100)}%]`
        : ''
      return `${i + 1}. "${t.name}" by ${t.artists.map(a => a.name).join(', ')}${feat}`
    })
    .join('\n')

  return `You are an expert DJ assistant. Help choose the perfect next track for a smooth mix.

CURRENTLY PLAYING:
"${current.name}" by ${current.artists.map(a => a.name).join(', ')}
${currentInfo}

AVAILABLE TRACKS:
${trackList}

${userRequest ? `DJ REQUEST: ${userRequest}\n` : ''}
Reply in JSON with this exact shape:
{
  "trackNumber": <1-based index from the list, or null>,
  "reason": "<why this track flows well>",
  "transitionTip": "<specific mixing technique: e.g. 'fade at 3:20, match the kick drum'>",
  "energy": "<lift|maintain|drop>"
}`
}

export async function getMixSuggestion(
  apiKey: string,
  current: SpotifyTrack,
  currentFeatures: AudioFeatures | null,
  candidates: SpotifyTrack[],
  candidateFeatures: (AudioFeatures | null)[],
  userRequest?: string
): Promise<MixSuggestion> {
  const prompt = buildPrompt(current, currentFeatures, candidates, candidateFeatures, userRequest)

  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7,
      max_tokens: 400,
      response_format: { type: 'json_object' },
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Groq error: ${err}`)
  }

  const data = await res.json()
  const content = data.choices?.[0]?.message?.content ?? '{}'
  const parsed = JSON.parse(content)

  const idx = parsed.trackNumber ? parsed.trackNumber - 1 : null
  return {
    nextTrack: idx !== null && candidates[idx] ? candidates[idx] : null,
    reason: parsed.reason ?? '',
    transitionTip: parsed.transitionTip ?? '',
    energy: parsed.energy ?? 'maintain',
  }
}

export async function chatWithDJ(
  apiKey: string,
  messages: { role: 'user' | 'assistant'; content: string }[],
  context: string
): Promise<string> {
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      messages: [
        {
          role: 'system',
          content: `You are an expert DJ assistant. Be concise and practical. Current context: ${context}`,
        },
        ...messages,
      ],
      temperature: 0.8,
      max_tokens: 300,
    }),
  })

  if (!res.ok) throw new Error('Groq chat failed')
  const data = await res.json()
  return data.choices?.[0]?.message?.content ?? ''
}
