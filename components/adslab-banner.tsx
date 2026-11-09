'use client'

import { useEffect, useRef } from 'react'

const bannerScriptUrl = 'https://serve.adslab.me/api/banner/js'

type AdsLabBannerProps = {
  id: string
  container: string
  alignment?: 'center' | 'right'
  format?: 'compact' | 'medium-rectangle' | 'large-rectangle'
}

declare global {
  interface Window {
    adslab_banners?: Array<{ id: string; container: string }>
    __adslabBannerContainers?: WeakSet<HTMLElement>
  }
}

export function AdsLabBanner({ id, container: containerId, alignment = 'right', format = 'compact' }: AdsLabBannerProps) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const containerElement = containerRef.current
    if (!containerElement) return

    const initializedContainers = window.__adslabBannerContainers ?? new WeakSet<HTMLElement>()
    if (initializedContainers.has(containerElement)) return
    window.__adslabBannerContainers = initializedContainers
    initializedContainers.add(containerElement)

    const queue = window.adslab_banners ?? []
    window.adslab_banners = queue.filter((banner) => banner.container !== containerId)
    window.adslab_banners.push({ id, container: containerId })

    const script = document.createElement('script')
    script.src = bannerScriptUrl
    script.async = true
    script.dataset.adslabBannerUnit = id
    document.head.appendChild(script)
  }, [containerId, id])

  const alignmentClass = alignment === 'right'
    ? 'flex w-full shrink-0 justify-center lg:w-[320px] lg:justify-end'
    : 'flex w-full justify-center'
  const sizeClass = format === 'large-rectangle'
    ? 'h-[280px] w-[336px] max-w-full overflow-hidden'
    : format === 'medium-rectangle'
      ? 'h-[250px] w-[300px] max-w-full overflow-hidden'
      : 'h-[50px] w-[320px] max-w-full overflow-hidden'

  return (
    <aside aria-label="Advertisement" className={alignmentClass}>
      <div ref={containerRef} id={containerId} className={sizeClass} />
    </aside>
  )
}
