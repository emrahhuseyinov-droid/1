import { NextResponse, type NextRequest } from 'next/server'
import { getAdminUserActivity, isAdminRequest } from '@/lib/admin-users'

const noStoreHeaders = { 'Cache-Control': 'no-store, max-age=0' }
const userIdPattern = /^[a-zA-Z0-9_-]{1,128}$/

export async function GET(request: NextRequest, { params }: { params: Promise<{ userId: string }> }) {
  if (!(await isAdminRequest(request.headers))) {
    return NextResponse.json({ error: 'Not found.' }, { status: 404, headers: noStoreHeaders })
  }

  const { userId } = await params
  if (!userIdPattern.test(userId)) {
    return NextResponse.json({ error: 'Пользователь не найден.' }, { status: 404, headers: noStoreHeaders })
  }

  const search = request.nextUrl.searchParams
  const beforeAtValue = search.get('beforeAt')
  const beforeId = search.get('beforeId')
  const beforeAt = beforeAtValue ? new Date(beforeAtValue) : undefined
  if (
    (beforeAtValue && Number.isNaN(beforeAt?.getTime())) ||
    (beforeId !== null && (beforeId.length > 256 || !beforeAtValue))
  ) {
    return NextResponse.json({ error: 'Некорректный курсор.' }, { status: 400, headers: noStoreHeaders })
  }

  try {
    const activity = await getAdminUserActivity(userId, beforeAt, beforeId ?? undefined)
    if (!activity) return NextResponse.json({ error: 'Пользователь не найден.' }, { status: 404, headers: noStoreHeaders })
    return NextResponse.json(activity, { headers: noStoreHeaders })
  } catch (error) {
    console.error('[admin-users] failed to load user activity', error)
    return NextResponse.json({ error: 'Не удалось загрузить историю пользователя.' }, { status: 500, headers: noStoreHeaders })
  }
}
