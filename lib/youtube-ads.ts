const youtubeVideoIdPattern = /^[A-Za-z0-9_-]{11}$/

export function getYouTubeVideoId(value: string): string | null {
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:' || url.username || url.password) return null

    const hostname = url.hostname.toLowerCase().replace(/^www\./, '')
    let videoId: string | null = null

    if (hostname === 'youtu.be') {
      videoId = url.pathname.split('/').filter(Boolean)[0] ?? null
    } else if (hostname === 'youtube.com' || hostname === 'm.youtube.com' || hostname === 'youtube-nocookie.com') {
      const parts = url.pathname.split('/').filter(Boolean)
      if (url.pathname === '/watch') videoId = url.searchParams.get('v')
      else if (['embed', 'shorts', 'live'].includes(parts[0] ?? '')) videoId = parts[1] ?? null
    }

    return videoId && youtubeVideoIdPattern.test(videoId) ? videoId : null
  } catch {
    return null
  }
}

export function getYouTubeWatchUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${videoId}`
}
