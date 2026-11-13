'use client'

import { useEffect, useRef, useState } from 'react'

const bannerScriptUrl = 'https://serve.adslab.me/api/banner/js'

type AdsLabBannerProps = {
  id: string
  container: string
  alignment?: 'center' | 'right'
  format?: 'compact' | 'medium-banner' | 'medium-rectangle' | 'large-rectangle' | 'leaderboard' | 'skyscraper'
  onClick?: () => void
}

const bannerDimensions = {
  compact: { width: 320, height: 50 },
  'medium-banner': { width: 468, height: 60 },
  'medium-rectangle': { width: 300, height: 250 },
  'large-rectangle': { width: 336, height: 280 },
  leaderboard: { width: 728, height: 90 },
  skyscraper: { width: 160, height: 600 },
} satisfies Record<NonNullable<AdsLabBannerProps['format']>, { width: number; height: number }>

declare global {
  interface Window {
    adslab_banners?: Array<{ id: string; container: string }>
    __adslabBannerContainers?: WeakSet<HTMLElement>
  }
}

export function AdsLabBanner({ id, container: containerId, alignment = 'right', format = 'compact', onClick }: AdsLabBannerProps) {
  const viewportRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [bannerScale, setBannerScale] = useState(1)
  const { width: formatWidth, height: formatHeight } = bannerDimensions[format]

  useEffect(() => {
    const viewportElement = viewportRef.current
    if (!viewportElement) return

    const updateScale = () => {
      const availableWidth = viewportElement.getBoundingClientRect().width
      if (availableWidth <= 0) return
      const nextScale = Math.min(1, availableWidth / formatWidth)
      setBannerScale((currentScale) => Math.abs(currentScale - nextScale) < 0.001 ? currentScale : nextScale)
    }

    updateScale()
    const observer = new ResizeObserver(updateScale)
    observer.observe(viewportElement)
    return () => observer.disconnect()
  }, [formatWidth])

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

  useEffect(() => {
    const containerElement = containerRef.current
    if (!containerElement || !onClick) return

    const handleFrameFocus = (event: FocusEvent) => {
      if (event.target instanceof HTMLIFrameElement && containerElement.contains(event.target)) onClick()
    }
    const handleWindowBlur = () => {
      window.setTimeout(() => {
        const activeElement = document.activeElement
        if (activeElement instanceof HTMLIFrameElement && containerElement.contains(activeElement)) onClick()
      }, 0)
    }

    containerElement.addEventListener('focusin', handleFrameFocus)
    window.addEventListener('blur', handleWindowBlur)
    return () => {
      containerElement.removeEventListener('focusin', handleFrameFocus)
      window.removeEventListener('blur', handleWindowBlur)
    }
  }, [onClick])

  const alignmentClass = alignment === 'right'
    ? format === 'leaderboard'
      ? 'flex w-full max-w-full shrink-0 justify-center lg:w-[728px] lg:justify-end'
      : format === 'medium-banner'
        ? 'flex w-full max-w-full shrink-0 justify-center lg:w-[468px] lg:justify-end'
        : format === 'skyscraper'
          ? 'flex w-full max-w-full shrink-0 justify-center lg:w-[160px] lg:justify-end'
          : 'flex w-full max-w-full shrink-0 justify-center lg:w-[320px] lg:justify-end'
    : 'flex w-full justify-center'
  return (
    <aside aria-label="Advertisement" className={alignmentClass} onClickCapture={() => onClick?.()}>
      <div
        ref={viewportRef}
        className="w-full overflow-hidden"
        style={{ maxWidth: formatWidth, height: Math.ceil(formatHeight * bannerScale) }}
      >
        <div
          ref={containerRef}
          id={containerId}
          style={{
            width: formatWidth,
            height: formatHeight,
            transform: `scale(${bannerScale})`,
            transformOrigin: 'top left',
          }}
        />
      </div>
    </aside>
  )
}
