'use client'

import { useEffect, useRef, type PointerEvent as ReactPointerEvent } from 'react'
import {
  ARCADE_RUNNER_FRAME_MS,
  ARCADE_HOMERO_COIN_INTERVAL_M,
  ARCADE_HOMERO_COIN_MAX_REWARDS,
  ARCADE_HOMERO_COIN_REWARD,
  ARCADE_TRAIN_INTERVAL_SECONDS,
  ARCADE_TRAIN_PASS_SECONDS,
  ARCADE_RUNNER_GROUND_Y,
  ARCADE_RUNNER_HEIGHT,
  ARCADE_RUNNER_PLAYER_HEIGHT,
  ARCADE_RUNNER_PLAYER_WIDTH,
  ARCADE_RUNNER_PLAYER_X,
  ARCADE_RUNNER_WIDTH,
  createArcadeRunnerState,
  stepArcadeRunner,
  type ArcadeBoostCode,
  type ArcadeRunnerCoin,
  type ArcadeRunnerObstacle,
  type ArcadeRunnerState,
} from '@/lib/arcade-gameplay'
import { createFiveCarTrainSprite, createPepeIdleSprite } from '@/lib/arcade-sprites'

const GROUND_LINE_Y = 222

type PepeRunnerProps = {
  runId: string | null
  runSeed: number
  boostCodes: ArcadeBoostCode[]
  extraLives: number
  homeroCoinsEnabled: boolean
  homeroCoinsRemaining: number
  paused: boolean
  disabled: boolean
  jumpRequestRef: { current: boolean }
  onProgress: (distanceM: number, elapsedMs: number, homeroCoinsCollected: number) => void
  onLivesChange: (livesRemaining: number) => void
  onFinish: (jumpTimes: number[]) => void
}

type RunnerSprite = HTMLImageElement | HTMLCanvasElement

type SceneImages = {
  background: HTMLImageElement | null
  idle: RunnerSprite | null
  runA: RunnerSprite | null
  runB: RunnerSprite | null
  jump: RunnerSprite | null
  train: HTMLCanvasElement | null
  homeroCoin: HTMLImageElement | null
}

function drawObstacle(ctx: CanvasRenderingContext2D, obstacle: ArcadeRunnerObstacle) {
  if (obstacle.kind === 'candle') {
    const centerX = Math.round(obstacle.x + obstacle.width / 2)
    ctx.fillStyle = '#e8b83e'
    ctx.fillRect(centerX - 2, obstacle.y - 8, 4, obstacle.height + 16)
    ctx.fillStyle = '#ef4444'
    ctx.fillRect(obstacle.x, obstacle.y + 7, obstacle.width, obstacle.height - 14)
    ctx.fillStyle = '#ff7777'
    ctx.fillRect(obstacle.x + 4, obstacle.y + 10, 4, obstacle.height - 20)
    ctx.fillStyle = '#facc15'
    ctx.fillRect(obstacle.x - 2, obstacle.y + obstacle.height - 9, obstacle.width + 4, 4)
    return
  }

  if (obstacle.kind === 'cactus') {
    ctx.fillStyle = '#14532d'
    ctx.fillRect(obstacle.x + 6, obstacle.y + 7, 18, obstacle.height - 7)
    ctx.fillRect(obstacle.x, obstacle.y + 17, 10, 13)
    ctx.fillRect(obstacle.x + 20, obstacle.y + 22, 10, 14)
    ctx.fillStyle = '#22c55e'
    ctx.fillRect(obstacle.x + 10, obstacle.y, 10, obstacle.height)
    ctx.fillRect(obstacle.x + 2, obstacle.y + 15, 8, 5)
    ctx.fillRect(obstacle.x + 2, obstacle.y + 15, 5, 15)
    ctx.fillRect(obstacle.x + 20, obstacle.y + 21, 8, 5)
    ctx.fillRect(obstacle.x + 23, obstacle.y + 21, 5, 15)
    ctx.fillStyle = '#86efac'
    ctx.fillRect(obstacle.x + 12, obstacle.y + 7, 3, 8)
    return
  }

}

function drawHomeroCoin(ctx: CanvasRenderingContext2D, coin: ArcadeRunnerCoin, logo: HTMLImageElement | null) {
  if (!logo?.complete || logo.naturalWidth === 0) return

  ctx.save()
  ctx.imageSmoothingEnabled = true
  ctx.drawImage(
    logo,
    Math.round(coin.x),
    Math.round(coin.y),
    coin.width,
    coin.height,
  )
  ctx.restore()
}

function drawFallbackPepe(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ctx.fillStyle = '#16a34a'
  ctx.fillRect(x + 8, y + 15, 40, 34)
  ctx.fillRect(x + 3, y + 27, 50, 18)
  ctx.fillRect(x + 13, y + 5, 12, 16)
  ctx.fillRect(x + 33, y + 5, 12, 16)
  ctx.fillStyle = '#facc15'
  ctx.fillRect(x + 14, y + 9, 7, 8)
  ctx.fillRect(x + 37, y + 9, 7, 8)
  ctx.fillStyle = '#09090b'
  ctx.fillRect(x + 17, y + 11, 3, 4)
  ctx.fillRect(x + 39, y + 11, 3, 4)
  ctx.fillStyle = '#991b1b'
  ctx.fillRect(x + 20, y + 37, 20, 4)
}

function positiveModulo(value: number, divisor: number) {
  return ((value % divisor) + divisor) % divisor
}

function createBrownShoeSprite(image: HTMLImageElement) {
  const sprite = document.createElement('canvas')
  sprite.width = image.naturalWidth
  sprite.height = image.naturalHeight
  const context = sprite.getContext('2d', { willReadFrequently: true })
  if (!context) return null

  context.drawImage(image, 0, 0)
  const imageData = context.getImageData(0, 0, sprite.width, sprite.height)
  const firstShoeRow = Math.floor(sprite.height * 0.72)

  for (let y = firstShoeRow; y < sprite.height; y += 1) {
    for (let x = 0; x < sprite.width; x += 1) {
      const index = (y * sprite.width + x) * 4
      const red = imageData.data[index]
      const green = imageData.data[index + 1]
      const blue = imageData.data[index + 2]
      if (imageData.data[index + 3] === 0 || green < 55 || green < red * 1.15 || green < blue * 1.15) continue

      const shade = green < 100
        ? [78, 47, 31]
        : green < 145
          ? [112, 65, 36]
          : green < 190
            ? [153, 91, 47]
            : [194, 135, 70]
      imageData.data[index] = shade[0]
      imageData.data[index + 1] = shade[1]
      imageData.data[index + 2] = shade[2]
    }
  }

  context.putImageData(imageData, 0, 0)
  return sprite
}


function drawPixelCloud(ctx: CanvasRenderingContext2D, x: number, y: number, opacity: number, scale: number) {
  ctx.fillStyle = `rgba(23, 43, 62, ${opacity})`
  ctx.fillRect(x + 8 * scale, y, 22 * scale, 4 * scale)
  ctx.fillRect(x + 2 * scale, y + 4 * scale, 38 * scale, 5 * scale)
  ctx.fillRect(x, y + 8 * scale, 44 * scale, 4 * scale)
  ctx.fillStyle = `rgba(45, 212, 191, ${opacity * 0.48})`
  ctx.fillRect(x + 11 * scale, y + 4 * scale, 14 * scale, scale)
}

function drawShimmeringCityLights(ctx: CanvasRenderingContext2D, animationTime: number) {
  ctx.save()
  ctx.globalCompositeOperation = 'lighter'

  for (let index = 0; index < 54; index += 1) {
    const x = positiveModulo(index * 73 + 19, ARCADE_RUNNER_WIDTH)
    const y = 143 + (index * 19) % 42
    const shimmer = (Math.sin(animationTime * 2.1 + index * 1.83) + 1) / 2
    const alpha = 0.16 + shimmer * 0.54
    ctx.shadowColor = `rgba(250, 204, 21, ${alpha})`
    ctx.shadowBlur = 2 + shimmer * 7
    ctx.fillStyle = `rgba(253, 224, 71, ${alpha})`
    ctx.fillRect(x, y, index % 7 === 0 ? 3 : 2, 2)

    if (shimmer > 0.86) {
      ctx.fillRect(x + 1, y - 2, 1, 6)
      ctx.fillRect(x - 1, y, 5, 1)
    }
  }

  ctx.restore()
}

function drawPassingTrain(ctx: CanvasRenderingContext2D, train: HTMLCanvasElement | null, animationTime: number) {
  if (!train) return

  const passDurationSeconds = ARCADE_TRAIN_PASS_SECONDS
  const passPhase = positiveModulo(animationTime, ARCADE_TRAIN_INTERVAL_SECONDS)
  if (passPhase >= passDurationSeconds) return

  const trainWidth = Math.round(ARCADE_RUNNER_WIDTH * 0.81)
  const trainHeight = trainWidth * train.height / train.width
  const progress = passPhase / passDurationSeconds
  const x = -trainWidth + progress * (ARCADE_RUNNER_WIDTH + trainWidth)
  const y = GROUND_LINE_Y - trainHeight - 8

  ctx.save()
  ctx.globalAlpha = 0.88
  ctx.shadowColor = 'rgba(250, 204, 21, 0.4)'
  ctx.shadowBlur = 9
  ctx.drawImage(train, Math.round(x), Math.round(y), Math.round(trainWidth), Math.round(trainHeight))
  ctx.restore()
}

function drawTiledBackground(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement | null,
  opacity: number,
  scaledHeight: number,
) {
  if (!image?.complete || image.naturalWidth === 0 || opacity <= 0) return

  const width = ARCADE_RUNNER_WIDTH
  const backgroundY = (ARCADE_RUNNER_HEIGHT - scaledHeight) / 2
  ctx.save()
  ctx.globalAlpha = opacity

  for (let tile = -1; tile <= 1; tile += 1) {
    const tileX = tile * width
    ctx.save()
    if (tile % 2 !== 0) {
      ctx.translate(tileX + width, 0)
      ctx.scale(-1, 1)
      ctx.drawImage(image, 0, backgroundY, width, scaledHeight)
    } else {
      ctx.drawImage(image, tileX, backgroundY, width, scaledHeight)
    }
    ctx.restore()
  }

  ctx.restore()
}

function drawScene(
  ctx: CanvasRenderingContext2D,
  state: ArcadeRunnerState,
  images: SceneImages,
  running: boolean,
  animationTime: number,
) {
  const width = ARCADE_RUNNER_WIDTH
  const height = ARCADE_RUNNER_HEIGHT
  ctx.clearRect(0, 0, width, height)
  ctx.imageSmoothingEnabled = false
  ctx.fillStyle = '#09090b'
  ctx.fillRect(0, 0, width, height)

  const background = images.background
  if (background?.complete && background.naturalWidth > 0) {
    const scaledHeight = height * background.naturalWidth / width
    drawTiledBackground(ctx, background, 1, scaledHeight)
  }

  ctx.fillStyle = 'rgba(7, 8, 17, 0.2)'
  ctx.fillRect(0, 0, width, height)

  const cloudOffset = animationTime * 8
  for (let index = 0; index < 4; index += 1) {
    const cloudX = Math.round(positiveModulo(index * 238 - cloudOffset, width + 80) - 40)
    const cloudY = 34 + index % 3 * 23
    drawPixelCloud(ctx, cloudX, cloudY, 0.45 + index % 2 * 0.12, index % 2 === 0 ? 1 : 0.75)
  }

  for (let index = 0; index < 24; index += 1) {
    const drift = animationTime * (7 + index % 4 * 3)
    const particleX = Math.round(positiveModulo(index * 89 - drift, width))
    const particleY = 18 + (index * 43) % 126 + Math.round(Math.sin(animationTime * 1.3 + index) * 3)
    const glow = 0.2 + (Math.sin(animationTime * 2.4 + index * 1.7) + 1) * 0.22
    ctx.fillStyle = index % 3 === 0 ? `rgba(250, 204, 21, ${glow})` : `rgba(74, 222, 128, ${glow * 0.8})`
    ctx.fillRect(particleX, particleY, index % 6 === 0 ? 3 : 2, index % 6 === 0 ? 2 : 2)
    if (index % 8 === 0) ctx.fillRect(particleX + 2, particleY - 2, 1, 6)
  }

  drawShimmeringCityLights(ctx, animationTime)
  drawPassingTrain(ctx, images.train, animationTime)

  ctx.fillStyle = '#11131a'
  ctx.fillRect(0, GROUND_LINE_Y, width, height - GROUND_LINE_Y)
  ctx.fillStyle = 'rgba(250, 204, 21, 0.2)'
  ctx.fillRect(0, GROUND_LINE_Y + 3, width, 3)
  ctx.fillStyle = '#facc15'
  ctx.fillRect(0, GROUND_LINE_Y, width, 2)
  ctx.fillStyle = 'rgba(34, 197, 94, 0.42)'
  ctx.fillRect(0, GROUND_LINE_Y + 7, width, 1)
  const trackOffset = state.distancePx % 74
  for (let x = -trackOffset; x < width; x += 74) {
    ctx.fillStyle = 'rgba(250, 204, 21, 0.62)'
    ctx.fillRect(Math.round(x), GROUND_LINE_Y + 17, 26, 3)
    ctx.fillStyle = 'rgba(45, 212, 191, 0.46)'
    ctx.fillRect(Math.round(x + 37), GROUND_LINE_Y + 28, 12, 2)
  }
  ctx.fillStyle = 'rgba(255, 255, 255, 0.035)'
  for (let x = 0; x < width; x += 32) {
    ctx.fillRect(x + (Math.floor(x / 32) % 2) * 12, GROUND_LINE_Y + 39, 12, 1)
  }

  for (const obstacle of state.obstacles) {
    ctx.save()
    ctx.shadowColor = obstacle.kind === 'cactus' ? 'rgba(74, 222, 128, 0.62)' : 'rgba(248, 113, 113, 0.62)'
    ctx.shadowBlur = 6
    drawObstacle(ctx, obstacle)
    ctx.restore()
  }

  for (const coin of state.homeroCoins) drawHomeroCoin(ctx, coin, images.homeroCoin)

  const runningBob = running && !state.isJumping ? Math.sin(animationTime * 6) * 1.5 : 0
  const playerCenterX = ARCADE_RUNNER_PLAYER_X + ARCADE_RUNNER_PLAYER_WIDTH / 2
  const playerBaseline = state.playerY + ARCADE_RUNNER_PLAYER_HEIGHT
  const runFrame = running && Math.floor(animationTime * 4) % 2 === 1 ? images.runB : images.runA
  const sprite = state.isJumping ? images.jump : running ? runFrame : images.idle
  const spriteWidth = sprite ? sprite instanceof HTMLCanvasElement ? sprite.width : sprite.naturalWidth : 0
  const spriteHeight = sprite ? sprite instanceof HTMLCanvasElement ? sprite.height : sprite.naturalHeight : 0
  const playerVisible = state.invulnerabilityFrames === 0 || Math.floor(state.frameCount / 7) % 2 === 0
  if (playerVisible && sprite && spriteWidth > 0 && spriteHeight > 0) {
    const desiredHeight = state.isJumping ? 82 : 80
    const aspectRatio = spriteWidth / spriteHeight
    const drawWidth = Math.min(state.isJumping ? 104 : 82, desiredHeight * aspectRatio)
    const drawHeight = drawWidth / aspectRatio
    const playerX = Math.round(playerCenterX - drawWidth / 2)
    const playerY = Math.round(playerBaseline - drawHeight + runningBob)
    ctx.drawImage(sprite, playerX, playerY, Math.round(drawWidth), Math.round(drawHeight))
  } else if (playerVisible) {
    drawFallbackPepe(ctx, playerCenterX - 30, Math.round(playerBaseline - 64 + runningBob))
  }

  if (!running) {
    ctx.fillStyle = 'rgba(2, 6, 23, 0.08)'
    ctx.fillRect(0, 0, width, height)
  }
}

export function PepeRunner({
  runId,
  runSeed,
  boostCodes,
  extraLives,
  homeroCoinsEnabled,
  homeroCoinsRemaining,
  paused,
  disabled,
  jumpRequestRef,
  onProgress,
  onLivesChange,
  onFinish,
}: PepeRunnerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const imagesRef = useRef<SceneImages>({ background: null, idle: null, runA: null, runB: null, jump: null, train: null, homeroCoin: null })
  const pendingJumpRef = useRef(false)
  const pausedRef = useRef(paused)
  const disabledRef = useRef(disabled)
  const callbacksRef = useRef({ onProgress, onLivesChange, onFinish })

  pausedRef.current = paused
  disabledRef.current = disabled
  callbacksRef.current = { onProgress, onLivesChange, onFinish }

  useEffect(() => {
    const background = new Image()
    background.crossOrigin = 'anonymous'
    background.src = '/arcade/arcade-background-no-portal.png'

    const idleImage = new Image()
    idleImage.crossOrigin = 'anonymous'
    idleImage.onload = () => { imagesRef.current.idle = createPepeIdleSprite(idleImage) }
    idleImage.src = '/arcade/homepage-pepe-sheet-key.png'

    const runA = new Image()
    runA.crossOrigin = 'anonymous'
    runA.onload = () => { imagesRef.current.runA = createBrownShoeSprite(runA) ?? runA }
    runA.src = '/arcade/pepe-run-a.png'

    const runB = new Image()
    runB.crossOrigin = 'anonymous'
    runB.onload = () => { imagesRef.current.runB = createBrownShoeSprite(runB) ?? runB }
    runB.src = '/arcade/pepe-run-b.png'

    const jump = new Image()
    jump.crossOrigin = 'anonymous'
    jump.onload = () => { imagesRef.current.jump = createBrownShoeSprite(jump) ?? jump }
    jump.src = '/arcade/pepe-jump.png'

    const homeroCoin = new Image()
    homeroCoin.crossOrigin = 'anonymous'
    homeroCoin.src = '/homero-token.png'

    imagesRef.current = { background, idle: null, runA, runB, jump, train: null, homeroCoin }
    const trainImage = new Image()
    trainImage.crossOrigin = 'anonymous'
    trainImage.onload = () => { imagesRef.current.train = createFiveCarTrainSprite(trainImage) }
    trainImage.src = '/arcade/neon-train.png'
  }, [])

  useEffect(() => {
    if (!runId) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.code !== 'Space' && event.code !== 'ArrowUp') || event.repeat) return
      if (event.target instanceof Element && event.target.closest('button, a, input, textarea, select, [contenteditable="true"]')) return
      if (pausedRef.current || disabledRef.current) return
      event.preventDefault()
      pendingJumpRef.current = true
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [runId])

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return

    const state = createArcadeRunnerState(runSeed, boostCodes, extraLives, homeroCoinsEnabled, homeroCoinsRemaining)
    const jumpTimes: number[] = []
    let lastReportedLives = state.livesRemaining
    let animationFrameId = 0
    let previousTimestamp = 0
    let accumulator = 0
    let framesSinceProgress = 0
    let finishSent = false

    const render = (timestamp: number) => {
      if (previousTimestamp === 0) previousTimestamp = timestamp
      const frameDelta = Math.min(120, timestamp - previousTimestamp)
      previousTimestamp = timestamp

      if (runId && !pausedRef.current && !finishSent) {
        accumulator += frameDelta
        let stepsThisFrame = 0
        while (accumulator >= ARCADE_RUNNER_FRAME_MS && stepsThisFrame < 8 && !state.finishedBy) {
          const shouldJump = pendingJumpRef.current || jumpRequestRef.current
          pendingJumpRef.current = false
          jumpRequestRef.current = false
          const result = stepArcadeRunner(state, shouldJump)
          if (result.jumped) jumpTimes.push(Math.round(state.frameCount * 1000 / 60))
          if (state.livesRemaining !== lastReportedLives) {
            lastReportedLives = state.livesRemaining
            callbacksRef.current.onLivesChange(lastReportedLives)
          }
          accumulator -= ARCADE_RUNNER_FRAME_MS
          stepsThisFrame += 1
          framesSinceProgress += 1

          if (framesSinceProgress >= 6) {
            callbacksRef.current.onProgress(Math.floor(state.distanceM), Math.round(state.frameCount * 1000 / 60), state.homeroCoinsCollected)
            framesSinceProgress = 0
          }
        }

        if (state.finishedBy && !finishSent) {
          finishSent = true
          callbacksRef.current.onProgress(Math.floor(state.distanceM), Math.round(state.frameCount * 1000 / 60), state.homeroCoinsCollected)
          callbacksRef.current.onFinish([...jumpTimes])
        }
      }

      drawScene(ctx, state, imagesRef.current, Boolean(runId) && !pausedRef.current, timestamp / 1000)
      animationFrameId = window.requestAnimationFrame(render)
    }

    animationFrameId = window.requestAnimationFrame(render)
    return () => window.cancelAnimationFrame(animationFrameId)
  }, [boostCodes, extraLives, homeroCoinsEnabled, homeroCoinsRemaining, jumpRequestRef, runId, runSeed])

  const handlePointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!runId || pausedRef.current || disabledRef.current) return
    event.preventDefault()
    pendingJumpRef.current = true
  }

  return (
    <canvas
      ref={canvasRef}
      width={ARCADE_RUNNER_WIDTH}
      height={ARCADE_RUNNER_HEIGHT}
      role="img"
      aria-label={runId ? homeroCoinsEnabled ? `Pepe running through the nighttime pixel-art city. Jump to collect ${ARCADE_HOMERO_COIN_REWARD} HOMERO every ${ARCADE_HOMERO_COIN_INTERVAL_M} meters, with ${homeroCoinsRemaining} rewards remaining before the ${ARCADE_HOMERO_COIN_MAX_REWARDS} HOMERO limit.` : 'Pepe running through the nighttime pixel-art city. Tap or click to jump over obstacles.' : 'Pepe standing at the nighttime pixel-art city starting line.'}
      onPointerDown={handlePointerDown}
      className="block h-full w-full touch-manipulation [image-rendering:pixelated]"
    />
  )
}
