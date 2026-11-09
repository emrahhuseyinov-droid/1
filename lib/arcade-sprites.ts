export function createFiveCarTrainSprite(image: HTMLImageElement) {
  const sourceWidth = image.naturalWidth
  const sourceHeight = image.naturalHeight
  if (!sourceWidth || !sourceHeight) return null

  const source = document.createElement('canvas')
  source.width = sourceWidth
  source.height = sourceHeight
  const sourceContext = source.getContext('2d', { willReadFrequently: true })
  if (!sourceContext) return null

  sourceContext.drawImage(image, 0, 0)
  const sourcePixels = sourceContext.getImageData(0, 0, sourceWidth, sourceHeight)
  for (let index = 0; index < sourcePixels.data.length; index += 4) {
    const red = sourcePixels.data[index]
    const green = sourcePixels.data[index + 1]
    const blue = sourcePixels.data[index + 2]
    const isMagenta = red > 120 && blue > 120 && green < 145 && Math.abs(red - blue) < 100
    if (isMagenta) sourcePixels.data[index + 3] = 0
  }
  sourceContext.putImageData(sourcePixels, 0, 0)

  const carriageStart = Math.round(sourceWidth * 0.32)
  const carriageEnd = Math.round(sourceWidth * 0.61)
  const couplerEnd = Math.round(sourceWidth * 0.625)
  const locomotiveStart = couplerEnd
  const locomotiveEnd = Math.round(sourceWidth * 0.97)
  const carriageWidth = carriageEnd - carriageStart
  const couplerWidth = couplerEnd - carriageEnd
  const locomotiveWidth = locomotiveEnd - locomotiveStart
  const segmentWidth = carriageWidth + couplerWidth
  const carriageCount = 4

  if (carriageWidth <= 0 || couplerWidth <= 0 || locomotiveWidth <= 0) return null

  const extended = document.createElement('canvas')
  extended.width = carriageCount * segmentWidth + locomotiveWidth
  extended.height = sourceHeight
  const extendedContext = extended.getContext('2d', { willReadFrequently: true })
  if (!extendedContext) return null

  for (let index = 0; index < carriageCount; index += 1) {
    const destinationX = index * segmentWidth
    extendedContext.drawImage(source, carriageStart, 0, carriageWidth, sourceHeight, destinationX, 0, carriageWidth, sourceHeight)
    extendedContext.drawImage(source, carriageEnd, 0, couplerWidth, sourceHeight, destinationX + carriageWidth, 0, couplerWidth, sourceHeight)
  }

  extendedContext.drawImage(
    source,
    locomotiveStart,
    0,
    locomotiveWidth,
    sourceHeight,
    carriageCount * segmentWidth,
    0,
    locomotiveWidth,
    sourceHeight,
  )

  const extendedPixels = extendedContext.getImageData(0, 0, extended.width, extended.height).data
  let left = extended.width
  let top = extended.height
  let right = -1
  let bottom = -1

  for (let index = 3; index < extendedPixels.length; index += 4) {
    if (extendedPixels[index] === 0) continue
    const pixel = (index - 3) / 4
    const x = pixel % extended.width
    const y = Math.floor(pixel / extended.width)
    left = Math.min(left, x)
    top = Math.min(top, y)
    right = Math.max(right, x)
    bottom = Math.max(bottom, y)
  }

  if (right < left || bottom < top) return null

  const sprite = document.createElement('canvas')
  sprite.width = right - left + 1
  sprite.height = bottom - top + 1
  const spriteContext = sprite.getContext('2d')
  if (!spriteContext) return null
  spriteContext.drawImage(extended, left, top, sprite.width, sprite.height, 0, 0, sprite.width, sprite.height)
  return sprite
}

export function createPepeIdleSprite(image: HTMLImageElement) {
  const sourceWidth = image.naturalWidth
  const sourceHeight = image.naturalHeight
  if (!sourceWidth || !sourceHeight) return null

  const source = document.createElement('canvas')
  source.width = sourceWidth
  source.height = sourceHeight
  const sourceContext = source.getContext('2d', { willReadFrequently: true })
  if (!sourceContext) return null

  sourceContext.drawImage(image, 0, 0)
  const sourcePixels = sourceContext.getImageData(0, 0, sourceWidth, sourceHeight)
  for (let index = 0; index < sourcePixels.data.length; index += 4) {
    const red = sourcePixels.data[index]
    const green = sourcePixels.data[index + 1]
    const blue = sourcePixels.data[index + 2]
    if (red > 120 && blue > 120 && green < 145 && Math.abs(red - blue) < 100) sourcePixels.data[index + 3] = 0
  }
  sourceContext.putImageData(sourcePixels, 0, 0)

  const frameWidth = Math.round(sourceWidth / 3) - 8
  if (frameWidth <= 0) return null
  const frame = document.createElement('canvas')
  frame.width = frameWidth
  frame.height = sourceHeight
  const frameContext = frame.getContext('2d', { willReadFrequently: true })
  if (!frameContext) return null
  frameContext.drawImage(source, 0, 0, frameWidth, sourceHeight, 0, 0, frameWidth, sourceHeight)

  const framePixels = frameContext.getImageData(0, 0, frameWidth, sourceHeight).data
  let left = frameWidth
  let top = sourceHeight
  let right = -1
  let bottom = -1
  for (let index = 3; index < framePixels.length; index += 4) {
    if (framePixels[index] === 0) continue
    const pixel = (index - 3) / 4
    const x = pixel % frameWidth
    const y = Math.floor(pixel / frameWidth)
    left = Math.min(left, x)
    top = Math.min(top, y)
    right = Math.max(right, x)
    bottom = Math.max(bottom, y)
  }

  if (right < left || bottom < top) return null
  const sprite = document.createElement('canvas')
  sprite.width = right - left + 1
  sprite.height = bottom - top + 1
  const spriteContext = sprite.getContext('2d')
  if (!spriteContext) return null
  spriteContext.drawImage(frame, left, top, sprite.width, sprite.height, 0, 0, sprite.width, sprite.height)
  return sprite
}
