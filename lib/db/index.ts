import 'server-only'
import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import * as schema from './schema'

type PoolGlobal = typeof globalThis & { earnPepeDatabasePool?: Pool }
const globalForDatabase = globalThis as PoolGlobal

function getDatabaseConnectionString() {
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) return undefined

  try {
    const url = new URL(connectionString)
    const sslMode = url.searchParams.get('sslmode')?.toLowerCase()
    if (sslMode === 'prefer' || sslMode === 'require' || sslMode === 'verify-ca') {
      url.searchParams.set('sslmode', 'verify-full')
    }
    return url.toString()
  } catch {
    return connectionString
  }
}

const databaseConnectionString = getDatabaseConnectionString()

export const pool = globalForDatabase.earnPepeDatabasePool ?? new Pool({
  ...(databaseConnectionString ? { connectionString: databaseConnectionString } : {}),
  max: 4,
  idleTimeoutMillis: 10_000,
  connectionTimeoutMillis: 5_000,
  allowExitOnIdle: true,
})

if (process.env.NODE_ENV !== 'production') {
  globalForDatabase.earnPepeDatabasePool = pool
}

export const db = drizzle(pool, { schema })
