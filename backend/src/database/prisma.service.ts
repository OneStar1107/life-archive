/**
 * database/prisma.service.ts
 * Prisma 生命周期管理 + 优雅断连。
 */

import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common'
import { Prisma, PrismaClient } from '@prisma/client'
import { databaseConfig } from '../config/configuration'
import { BusinessException } from '../common/exceptions/business.exception'
import { ErrorCode } from '../common/constants/error-codes'

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name)

  constructor() {
    const logLevel = (databaseConfig().logLevel ?? 'warn') as Prisma.LogLevel
    super({
      log: [
        { emit: 'event', level: logLevel },
        { emit: 'stdout', level: logLevel },
      ],
      errorFormat: 'minimal',
    })
  }

  async onModuleInit(): Promise<void> {
    await this.$connect()
    this.logger.log('PostgreSQL 连接已建立')
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect()
    this.logger.log('PostgreSQL 连接已优雅关闭')
  }

  /** 探活：供 /health/ready 使用 */
  async ping(): Promise<boolean> {
    try {
      await this.$queryRaw`SELECT 1`
      return true
    } catch (e) {
      this.logger.error(`数据库探活失败：${(e as Error).message}`)
      return false
    }
  }

  /**
   * 把唯一约束冲突转成业务错误码。
   * 注意：本项目大量字段带 @unique（如 nickname），需要给出可读文案。
   */
  translateP2002(target: string): never {
    const friendly: Record<string, { code: number; message: string }> = {
      phone: { code: ErrorCode.ALREADY_EXISTS, message: '这个手机号已经注册过了' },
      email: { code: ErrorCode.ALREADY_EXISTS, message: '这个邮箱已经注册过了' },
      nickname: { code: ErrorCode.ALREADY_EXISTS, message: '这个昵称已经被用过了' },
    }
    const hit = friendly[target]
    throw new BusinessException(
      hit?.code ?? ErrorCode.ALREADY_EXISTS,
      hit?.message ?? '数据已存在',
      `unique constraint on ${target}`,
    )
  }
}
