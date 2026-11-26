import { NextResponse, type NextRequest } from 'next/server'
import { getAdminUserSummaries, isAdminRequest } from '@/lib/admin-users'

const noStoreHeaders = { 'Cache-Control': 'no-store, max-age=0' }

export async function GET(request: NextRequest) {
  if (!(await isAdminRequest(request.headers))) {
    return NextResponse.json({ error: 'Not found.' }, { status: 404, headers: noStoreHeaders })
  }

  try {
    return NextResponse.json(await getAdminUserSummaries(), { headers: noStoreHeaders })
  } catch (error) {
    console.error('[admin-users] failed to load user summaries', error)
    return NextResponse.json({ error: 'Не удалось загрузить список пользователей.' }, { status: 500, headers: noStoreHeaders })
  }
}
