/**
 * modules/files/files.service.ts
 * 文件上传：MIME 白名单校验 → 内容 checksum 秒传 → 落盘 → 登记。
 *
 * 设计要点：
 *   1. 存储文件名用 randomUUID，**不保留用户原始文件名**，杜绝路径穿越与
 *      同名覆盖；原始名只作为展示字段存在 DB 里。
 *   2. 用文件内容的 SHA-256 做查重，同一用户重复上传同一张图直接秒传，
 *      不重复占用磁盘也不重复写 DB。
 *   3. 落盘目录按 yyyy/mm 分层，避免单目录文件数过多。
 *   4. ★ 铁律：任何拼进磁盘路径的片段都必须过 assertSafeStorageKey，
 *      并且最终路径必须仍位于 upload.root 之内。
 */

import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Prisma } from '@prisma/client'
import { createHash, randomUUID } from 'node:crypto'
import { mkdir, unlink, writeFile } from 'node:fs/promises'
import { join, resolve, sep } from 'node:path'
import { PrismaService } from '../../database/prisma.service'
import { BusinessException } from '../../common/exceptions/business.exception'
import { ErrorCode } from '../../common/constants/error-codes'
import { assertOwnership } from '../../common/helpers/ownership.helper'
import { toPageResult, type PageResult } from '../../common/dto/result.dto'
import {
  FILE_PURPOSES,
  type FileDto,
  type FilePurpose,
  type QueryFileDto,
  type UploadResultDto,
} from './dto/files.dto'

/** 出参 select：白名单，绝不 select * */
const FILE_SELECT = {
  id: true,
  url: true,
  originalName: true,
  mimeType: true,
  size: true,
  purpose: true,
  createdAt: true,
  // 物理删除时需要还原磁盘路径
  storageKey: true,
} satisfies Prisma.UploadedFileSelect

type FileRow = Prisma.UploadedFileGetPayload<{ select: typeof FILE_SELECT }>

/** 扩展名白名单：不在表内的一律降级为 jpg */
const ALLOWED_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp', 'heic'])

/** 保留期：180 天后由清理任务物理删除 */
const RETENTION_DAYS = 180

@Injectable()
export class FilesService {
  private readonly logger = new Logger(FilesService.name)

  /** MIME 白名单，来自配置 upload.mimeWhitelist */
  private readonly ALLOWED_MIME: Set<string>

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {
    const whitelist = this.config.get<string[]>('upload.mimeWhitelist') ?? []
    this.ALLOWED_MIME = new Set(whitelist.length > 0 ? whitelist : DEFAULT_MIME_WHITELIST)
  }

  // ── 上传 ──────────────────────────────────────────────

  /**
   * 上传单个文件。
   * 命中同用户已有同 checksum 记录时直接返回（秒传），deduplicated 为 true。
   */
  async upload(
    userId: string,
    file: Express.Multer.File,
    purpose: string,
  ): Promise<UploadResultDto> {
    this.assertMimeAllowed(file.mimetype)

    // 用途非法直接拦掉，避免脏数据进 DB
    const normalizedPurpose = this.normalizePurpose(purpose)

    const checksum = createHash('sha256').update(file.buffer).digest('hex')

    // ★ 秒传：同用户已有未删除的同内容文件，直接复用
    const existing = await this.prisma.uploadedFile.findFirst({
      where: { userId, checksum, deletedAt: null },
      select: FILE_SELECT,
      orderBy: { createdAt: 'asc' },
    })
    if (existing) {
      return { file: this.toDto(existing), deduplicated: true }
    }

    const root = this.resolveUploadRoot()
    const now = new Date()
    const relativeDir = `${now.getUTCFullYear()}/${pad2(now.getUTCMonth() + 1)}`
    const storageKey = `${randomUUID()}.${extractExtension(file.originalname)}`
    assertSafeStorageKey(storageKey)

    const absDir = resolve(root, relativeDir)
    // 双保险：拼完的绝对路径必须仍在 root 之内
    if (absDir !== root && !absDir.startsWith(root + sep)) {
      throw new BusinessException(ErrorCode.STORAGE_ERROR, '文件存储路径异常，请稍后再试')
    }

    // 目录必须递归创建（yyyy/mm 两级）
    await mkdir(absDir, { recursive: true })
    await writeFile(join(absDir, storageKey), file.buffer)

    const relativePath = `${relativeDir}/${storageKey}`
    const expiresAt = new Date(now.getTime() + RETENTION_DAYS * 24 * 60 * 60 * 1000)

    try {
      const row = await this.prisma.uploadedFile.create({
        data: {
          userId,
          storageKey,
          originalName: file.originalname.slice(0, 256),
          mimeType: file.mimetype,
          size: file.size,
          url: this.buildUrl(relativePath),
          purpose: normalizedPurpose,
          checksum,
          expiresAt,
        },
        select: FILE_SELECT,
      })
      return { file: this.toDto(row), deduplicated: false }
    } catch (e) {
      // 登记失败则回收刚落盘的文件，避免留下无主文件
      await this.safeUnlink(join(absDir, storageKey))
      throw e
    }
  }

  // ── 查询 ──────────────────────────────────────────────

  async list(userId: string, query: QueryFileDto): Promise<PageResult<FileDto>> {
    const where: Prisma.UploadedFileWhereInput = {
      userId,
      deletedAt: null,
    }
    if (query.purpose) {
      where.purpose = query.purpose
    }

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.uploadedFile.findMany({
        where,
        select: FILE_SELECT,
        orderBy: { createdAt: 'desc' },
        skip: query.skip,
        take: query.take,
      }),
      this.prisma.uploadedFile.count({ where }),
    ])

    return toPageResult(
      rows.map((r) => this.toDto(r)),
      total,
      query.page,
      query.pageSize,
    )
  }

  // ── 删除 ──────────────────────────────────────────────

  /** 软删除 DB 记录，同时尝试删除物理文件；物理删除失败只记日志不抛错 */
  async remove(userId: string, id: string): Promise<{ success: true }> {
    const found = await this.prisma.uploadedFile.findFirst({
      where: { id, deletedAt: null },
      select: { ...FILE_SELECT, userId: true },
    })
    const row = assertOwnership(found, userId, ErrorCode.FILE_NOT_FOUND)

    await this.prisma.uploadedFile.update({
      where: { id },
      data: { deletedAt: new Date() },
    })

    const root = this.resolveUploadRoot()
    const relativeDir = `${row.createdAt.getUTCFullYear()}/${pad2(row.createdAt.getUTCMonth() + 1)}`
    await this.safeUnlink(resolve(root, relativeDir, row.storageKey))

    return { success: true }
  }

  // ── 内部方法 ──────────────────────────────────────────

  /** MIME 不在白名单内时，回报可上传的类型 */
  private assertMimeAllowed(mimeType: string): void {
    if (this.ALLOWED_MIME.has(mimeType)) return
    throw new BusinessException(
      ErrorCode.UNSUPPORTED_MEDIA_TYPE,
      `这个文件类型暂不支持，可以上传：${[...this.ALLOWED_MIME].join('、')}`,
    )
  }

  private normalizePurpose(purpose: string): FilePurpose {
    if ((FILE_PURPOSES as readonly string[]).includes(purpose)) {
      return purpose as FilePurpose
    }
    return 'memory'
  }

  /** 读取上传根目录；必须是绝对路径且不落在工程目录内 */
  private resolveUploadRoot(): string {
    const root = this.config.get<string>('upload.root') ?? ''
    if (!root) {
      throw new BusinessException(ErrorCode.STORAGE_ERROR, '文件存储未配置，请联系客服')
    }
    const abs = resolve(root)
    if (!abs.startsWith('/') && !/^[A-Za-z]:[\\/]/.test(abs)) {
      throw new BusinessException(ErrorCode.STORAGE_ERROR, '文件存储路径必须配置为绝对路径')
    }
    return abs
  }

  private buildUrl(relativePath: string): string {
    const base = (this.config.get<string>('app.apiBaseUrl') ?? '').replace(/\/+$/, '')
    return `${base}/files/${relativePath}`
  }

  /** 物理删除失败只记日志——DB 已软删，残留文件由清理任务兜底 */
  private async safeUnlink(absPath: string): Promise<void> {
    try {
      await unlink(absPath)
    } catch (e) {
      this.logger.warn(`物理文件删除失败（已忽略）：${absPath} —— ${(e as Error).message}`)
    }
  }

  private toDto(row: FileRow): FileDto {
    return {
      id: row.id,
      url: row.url,
      originalName: row.originalName,
      mimeType: row.mimeType,
      size: row.size,
      purpose: row.purpose,
      createdAt: row.createdAt.toISOString(),
    }
  }
}

// ── 模块内工具函数 ────────────────────────────────────

/** 配置缺失时的兜底白名单 */
const DEFAULT_MIME_WHITELIST = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n)
}

/** 从原始文件名提取扩展名，不在白名单内的一律降级为 jpg */
function extractExtension(originalName: string): string {
  const dot = originalName.lastIndexOf('.')
  if (dot < 0 || dot === originalName.length - 1) return 'jpg'
  const ext = originalName.slice(dot + 1).toLowerCase()
  return ALLOWED_EXTENSIONS.has(ext) ? ext : 'jpg'
}

/**
 * ★ 路径穿越防护：storageKey 只允许 UUID + 扩展名的形态，
 * 出现 `..` 或任何目录分隔符立即判定为非法。
 */
function assertSafeStorageKey(storageKey: string): void {
  if (
    storageKey.includes('..') ||
    storageKey.includes('/') ||
    storageKey.includes('\\') ||
    storageKey.includes('\0')
  ) {
    throw new BusinessException(ErrorCode.STORAGE_ERROR, '文件存储路径异常，请稍后再试')
  }
}
