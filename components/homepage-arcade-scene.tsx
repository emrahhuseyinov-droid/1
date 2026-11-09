'use client'

import { useEffect, useRef } from 'react'
import { ARCADE_TRAIN_INTERVAL_SECONDS, ARCADE_TRAIN_PASS_SECONDS } from '@/lib/arcade-gameplay'
import { createFiveCarTrainSprite } from '@/lib/arcade-sprites'

const SCENE_WIDTH = 840
const SCENE_HEIGHT = 600

type ArcadeImages = {
  background: HTMLImageElement
  train: HTMLImageElement
  characterSheet: HTMLImageElement
}

function loadImage(source: string) {
  const image = new Image()
  image.crossOrigin = 'anonymous'
  image.src = source
  return image
}

function createCharacterFrames(image: HTMLImageElement) {
  if (!image.naturalWidth || !image.naturalHeight) return []

  const source = document.createElement('canvas')
  source.width = image.naturalWidth
  source.height = image.naturalHeight
  const sourceContext = source.getContext('2d', { willReadFrequently: true })
  if (!sourceContext) return []

  sourceContext.drawImage(image, 0, 0)
  const imageData = sourceContext.getImageData(0, 0, source.width, source.height)
  for (let index = 0; index < imageData.data.length; index += 4) {
    const red = imageData.data[index]
    const green = imageData.data[index + 1]
    const blue = imageData.data[index + 2]
    if (red > 120 && blue > 120 && green < 145 && Math.abs(red - blue) < 100) imageData.data[index + 3] = 0
  }
  sourceContext.putImageData(imageData, 0, 0)

  const cellWidth = source.width / 3
  const frames: HTMLCanvasElement[] = []

  for (let frameIndex = 0; frameIndex < 3; frameIndex += 1) {
    const sourceX = Math.round(frameIndex * cellWidth) + (frameIndex === 0 ? 0 : 8)
    const sourceRight = Math.round((frameIndex + 1) * cellWidth) - (frameIndex === 2 ? 0 : 8)
    const frame = document.createElement('canvas')
    frame.width = sourceRight - sourceX
    frame.height = source.height
    const frameContext = frame.getContext('2d')
    if (!frameContext) continue
    frameContext.drawImage(source, sourceX, 0, frame.width, frame.height, 0, 0, frame.width, frame.height)

    const framePixels = frameContext.getImageData(0, 0, frame.width, frame.height).data
    let left = frame.width
    let top = frame.height
    let right = -1
    let bottom = -1
    for (let index = 3; index < framePixels.length; index += 4) {
      if (framePixels[index] === 0) continue
      const pixel = (index - 3) / 4
      const x = pixel % frame.width
      const y = Math.floor(pixel / frame.width)
      left = Math.min(left, x)
      top = Math.min(top, y)
      right = Math.max(right, x)
      bottom = Math.max(bottom, y)
    }

    if (right < left || bottom < top) continue
    const trimmed = document.createElement('canvas')
    trimmed.width = right - left + 1
    trimmed.height = bottom - top + 1
    const trimmedContext = trimmed.getContext('2d')
    if (!trimmedContext) continue
    trimmedContext.drawImage(frame, left, top, trimmed.width, trimmed.height, 0, 0, trimmed.width, trimmed.height)
    frames.push(trimmed)
  }

  return frames
}

function positiveModulo(value: number, divisor: number) {
  return ((value % divisor) + divisor) % divisor
}

function drawCityLights(context: CanvasRenderingContext2D, time: number) {
  context.save()
  context.globalCompositeOperation = 'lighter'

  for (let index = 0; index < 44; index += 1) {
    const x = positiveModulo(index * 97 + 31 - time * 3.5, SCENE_WIDTH)
    const y = SCENE_HEIGHT * 0.45 + (index * 23) % (SCENE_HEIGHT * 0.13)
    const shimmer = (Math.sin(time * 2.1 + index * 1.83) + 1) / 2
    const alpha = 0.12 + shimmer * 0.34
    context.shadowColor = index % 4 === 0 ? `rgba(79, 242, 221, ${alpha})` : `rgba(255, 203, 74, ${alpha})`
    context.shadowBlur = 2 + shimmer * 7
    context.fillStyle = index % 4 === 0 ? `rgba(94, 245, 225, ${alpha})` : `rgba(255, 218, 112, ${alpha})`
    context.fillRect(x, y, index % 6 === 0 ? 3 : 2, 2)
    if (shimmer > 0.9) context.fillRect(x + 1, y - 2, 1, 6)
  }

  context.restore()
}

function drawTrain(context: CanvasRenderingContext2D, train: HTMLCanvasElement | null, time: number) {
  if (!train) return

  const passPhase = positiveModulo(time, ARCADE_TRAIN_INTERVAL_SECONDS)
  if (passPhase >= ARCADE_TRAIN_PASS_SECONDS) return

  const trainWidth = SCENE_WIDTH * 1.15
  const trainHeight = trainWidth * train.height / train.width
  const progress = passPhase / ARCADE_TRAIN_PASS_SECONDS
  const x = -trainWidth + progress * (SCENE_WIDTH + trainWidth)
  const y = SCENE_HEIGHT * 0.51

  context.save()
  context.globalAlpha = 0.94
  context.shadowColor = 'rgba(255, 200, 75, 0.56)'
  context.shadowBlur = 16
  context.drawImage(train, Math.round(x), Math.round(y), Math.round(trainWidth), Math.round(trainHeight))
  context.restore()
}

function drawCharacter(context: CanvasRenderingContext2D, frames: HTMLCanvasElement[], time: number, reduceMotion: boolean) {
  if (frames.length === 0) return

  const blinkPhase = positiveModulo(time, 8.6)
  const wavePhase = positiveModulo(time, 18.5)
  const frameIndex = reduceMotion ? 0 : wavePhase >= 12.4 && wavePhase < 13.6 ? 2 : blinkPhase >= 6.1 && blinkPhase < 6.28 ? 1 : 0
  const frame = frames[frameIndex] ?? frames[0]
  const characterHeight = SCENE_HEIGHT * 0.34
  const characterWidth = characterHeight * frame.width / frame.height
  const baseline = SCENE_HEIGHT * 0.9
  const x = SCENE_WIDTH * 0.15

  context.save()
  context.fillStyle = 'rgba(2, 7, 18, 0.48)'
  context.beginPath()
  context.ellipse(x + characterWidth / 2, baseline + 3, characterWidth * 0.42, 8, 0, 0, Math.PI * 2)
  context.fill()
  context.imageSmoothingEnabled = false
  context.drawImage(frame, Math.round(x), Math.round(baseline - characterHeight), Math.round(characterWidth), Math.round(characterHeight))
  context.restore()
}

function drawScene(
  context: CanvasRenderingContext2D,
  images: ArcadeImages,
  trainSprite: HTMLCanvasElement | null,
  characterFrames: HTMLCanvasElement[],
  time: number,
  reduceMotion: boolean,
) {
  context.clearRect(0, 0, SCENE_WIDTH, SCENE_HEIGHT)
  context.fillStyle = '#070b17'
  context.fillRect(0, 0, SCENE_WIDTH, SCENE_HEIGHT)
  context.imageSmoothingEnabled = false

  if (images.background.complete && images.background.naturalWidth > 0) {
    const scale = Math.max(SCENE_WIDTH / images.background.naturalWidth, SCENE_HEIGHT / images.background.naturalHeight)
    const width = images.background.naturalWidth * scale
    const height = images.background.naturalHeight * scale
    const drift = reduceMotion ? 0 : Math.sin(time * 0.24) * 10
    context.drawImage(images.background, (SCENE_WIDTH - width) / 2 + drift, (SCENE_HEIGHT - height) / 2, width, height)
  }

  context.fillStyle = 'rgba(5, 10, 24, 0.12)'
  context.fillRect(0, 0, SCENE_WIDTH, SCENE_HEIGHT)
  drawCityLights(context, reduceMotion ? 0 : time)
  if (!reduceMotion) drawTrain(context, trainSprite, time)
  drawCharacter(context, characterFrames, time, reduceMotion)
}

export function HomepageArcadeScene() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const context = canvas.getContext('2d')
    if (!context) return
    const drawingContext = context as CanvasRenderingContext2D

    const images: ArcadeImages = {
      background: loadImage('/arcade/arcade-background-no-portal.png'),
      train: loadImage('/arcade/neon-train.png'),
      characterSheet: loadImage('/arcade/homepage-pepe-sheet-key.png'),
    }
    let trainSprite: HTMLCanvasElement | null = null
    let characterFrames: HTMLCanvasElement[] = []
    let animationFrameId = 0
    let lastFrameTime = 0
    let disposed = false
    const startedAt = performance.now()
    const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)')

    images.train.onload = () => {
      trainSprite = createFiveCarTrainSprite(images.train)
      if (motionPreference.matches) paintStaticFrame()
    }
    images.characterSheet.onload = () => {
      characterFrames = createCharacterFrames(images.characterSheet)
      if (motionPreference.matches) paintStaticFrame()
    }
    images.background.onload = () => {
      if (motionPreference.matches) paintStaticFrame()
    }

    function paintFrame(timestamp: number) {
      if (disposed) return
      const reduceMotion = motionPreference.matches
      const elapsedSeconds = reduceMotion ? 0 : (timestamp - startedAt) / 1000
      drawScene(drawingContext, images, trainSprite, characterFrames, elapsedSeconds, reduceMotion)
      if (!reduceMotion && !document.hidden) animationFrameId = window.requestAnimationFrame(render)
    }

    function paintStaticFrame() {
      if (animationFrameId) window.cancelAnimationFrame(animationFrameId)
      animationFrameId = 0
      paintFrame(performance.now())
    }

    function render(timestamp: number) {
      if (timestamp - lastFrameTime < 40) {
        animationFrameId = window.requestAnimationFrame(render)
        return
      }
      lastFrameTime = timestamp
      paintFrame(timestamp)
    }

    function resumeAnimation() {
      if (animationFrameId) window.cancelAnimationFrame(animationFrameId)
      animationFrameId = 0
      if (document.hidden || motionPreference.matches) paintStaticFrame()
      else animationFrameId = window.requestAnimationFrame(render)
    }

    motionPreference.addEventListener('change', resumeAnimation)
    document.addEventListener('visibilitychange', resumeAnimation)
    resumeAnimation()

    return () => {
      disposed = true
      if (animationFrameId) window.cancelAnimationFrame(animationFrameId)
      motionPreference.removeEventListener('change', resumeAnimation)
      document.removeEventListener('visibilitychange', resumeAnimation)
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      width={SCENE_WIDTH}
      height={SCENE_HEIGHT}
      role="img"
      aria-label="Animated neon arcade scene with a glowing city, a passing train, and Pepe standing upright."
      className="absolute inset-0 block h-full w-full [image-rendering:pixelated]"
    />
  )
}
