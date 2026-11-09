const ARCADE_TIME_ZONE = 'Asia/Baku'
const ARCADE_RESET_HOUR = 17
const ARCADE_RESET_MINUTE = 38
const ARCADE_RESET_WALL_TIME_MS = (ARCADE_RESET_HOUR * 60 + ARCADE_RESET_MINUTE) * 60_000
const DAY_MS = 24 * 60 * 60 * 1000

const bakuDateTimeFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: ARCADE_TIME_ZONE,
  calendar: 'iso8601',
  numberingSystem: 'latn',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
})

function getBakuDateTimeParts(date: Date) {
  const parts = Object.fromEntries(bakuDateTimeFormatter.formatToParts(date).map(({ type, value }) => [type, value]))
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
  }
}

function getBakuOffsetMs(date: Date) {
  const { year, month, day, hour, minute, second } = getBakuDateTimeParts(date)
  const localTimeAsUtc = Date.UTC(year, month - 1, day, hour, minute, second)
  return localTimeAsUtc - Math.floor(date.getTime() / 1000) * 1000
}

function getBakuResetInstant(dayKey: string) {
  const [year, month, day] = dayKey.split('-').map(Number)
  const localResetAsUtc = Date.UTC(year, month - 1, day, ARCADE_RESET_HOUR, ARCADE_RESET_MINUTE)
  let instant = localResetAsUtc

  for (let attempt = 0; attempt < 2; attempt += 1) {
    instant = localResetAsUtc - getBakuOffsetMs(new Date(instant))
  }

  return new Date(instant)
}

function addCalendarDays(dayKey: string, days: number) {
  const [year, month, day] = dayKey.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10)
}

export function getArcadeDayKey(date = new Date()) {
  const { year, month, day, hour, minute, second } = getBakuDateTimeParts(date)
  const arcadeDay = new Date(Date.UTC(year, month - 1, day, hour, minute, second) - ARCADE_RESET_WALL_TIME_MS)
  return arcadeDay.toISOString().slice(0, 10)
}

export function getArcadeDayWindow(date = new Date()) {
  const dayKey = getArcadeDayKey(date)
  return {
    start: getBakuResetInstant(dayKey),
    end: getBakuResetInstant(addCalendarDays(dayKey, 1)),
  }
}

export function getArcadeWeekWindow(date = new Date()) {
  const arcadeDay = new Date(`${getArcadeDayKey(date)}T00:00:00.000Z`)
  const daysSinceMonday = (arcadeDay.getUTCDay() + 6) % 7
  const periodStart = new Date(arcadeDay.getTime() - daysSinceMonday * DAY_MS).toISOString().slice(0, 10)
  const nextPeriodStart = addCalendarDays(periodStart, 7)

  return {
    start: getBakuResetInstant(periodStart),
    end: getBakuResetInstant(nextPeriodStart),
    periodStart,
  }
}
