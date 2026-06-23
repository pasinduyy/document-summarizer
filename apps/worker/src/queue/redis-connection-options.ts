import { ConnectionOptions } from 'bullmq'

export function createWorkerRedisConnectionOptions(redisUrl: string): ConnectionOptions {
  let url: URL

  try {
    url = new URL(redisUrl)
  } catch {
    throw new Error('REDIS_URL must be a valid redis:// or rediss:// URL')
  }

  if (url.protocol !== 'redis:' && url.protocol !== 'rediss:') {
    throw new Error('REDIS_URL must use the redis:// or rediss:// protocol')
  }

  return {
    host: url.hostname,
    ...(url.port ? { port: Number.parseInt(url.port, 10) } : {}),
    ...(url.username ? { username: decodeURIComponent(url.username) } : {}),
    ...(url.password ? { password: decodeURIComponent(url.password) } : {}),
    ...(url.protocol === 'rediss:' ? { tls: {} } : {}),
    maxRetriesPerRequest: null,
  }
}
