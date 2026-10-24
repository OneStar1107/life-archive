/**
 * modules/files/redis.util.ts
 * 轻量 Redis 探活与黑名单工具。
 *
 * 说明：本项目刻意**不引入 ioredis 依赖**——Redis 在本项目里只做两件小事
 * （令牌黑名单、分布式限流计数），且是**可选依赖**（.env 中 REDIS_URL 可留空）。
 * 用一个极小的 TCP 探活既满足健康检查需求，又不增加原生依赖与连接泄漏风险。
 *
 * 若后续确实需要 Redis 存黑名单，可在 AuthModule 中按需引入 ioredis。
 */

import { createConnection } from 'node:net'
import { URL } from 'node:url'

let redisUrl: string | null = null
let probed = false

/** 惰性读取 REDIS_URL（测试可注入） */
export function setRedisUrl(url: string): void {
  redisUrl = url
  probed = false
}

function getRedisUrl(): string | null {
  if (!probed) {
    redisUrl = process.env['REDIS_URL'] ?? null
    probed = true
  }
  return redisUrl && redisUrl.length > 0 ? redisUrl : null
}

/**
 * 探活 Redis。
 * @returns true=通 / false=不通 / null=未配置（跳过）
 */
export function redisPing(timeoutMs = 1500): Promise<boolean | null> {
  const url = getRedisUrl()
  if (!url) return Promise.resolve(null)

  return new Promise((resolve) => {
    let settled = false
    const done = (v: boolean): void => {
      if (settled) return
      settled = true
      resolve(v)
    }

    let parsed: URL
    try {
      parsed = new URL(url)
    } catch {
      return done(false)
    }

    const port = Number(parsed.port || 6379)
    const host = parsed.hostname || '127.0.0.1'
    // 库名（db 路径），ping 不关心，但保留解析以确保 URL 合法
    void parsed.pathname

    const socket = createConnection({ host, port })
    const timer = setTimeout(() => {
      socket.destroy()
      done(false)
    }, timeoutMs)

    socket.on('connect', () => {
      // 发一条 PING
      socket.write('*1\r\n$4\r\nPING\r\n')
    })

    let buf = ''
    socket.on('data', (chunk: Buffer) => {
      buf += chunk.toString('utf8')
      if (buf.includes('+PONG') || buf.includes('-NOAUTH') || buf.includes('+OK')) {
        // NOAUTH 也说明服务在监听
        clearTimeout(timer)
        socket.end()
        done(true)
      }
    })

    socket.on('error', () => {
      clearTimeout(timer)
      done(false)
    })

    socket.on('close', () => {
      clearTimeout(timer)
      done(false)
    })
  })
}
