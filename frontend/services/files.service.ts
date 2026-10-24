// services/files.service.ts
// ══════════════════════════════════════════════════════════════
// 文件上传 / 列表 / 删除
// ══════════════════════════════════════════════════════════════
//
// 对应 backend/src/modules/files/files.controller.ts
// （@Controller('files')）
//
// 路由核对清单：
//   POST   /files      上传（multipart/form-data，字段名固定为 'file'）
//   GET    /files      列表
//   DELETE /files/:id  删除（软删除记录 + 尝试删物理文件）
//
// ★★★ 为什么上传不走 @/core/http/request ★★★
//   request.ts 发的是 uni.request，只能带 JSON body，发不了 multipart。
//   uni.uploadFile 的 success 回调里 res.data 是**字符串**，不是对象，
//   所以这里必须手动 JSON.parse 再判 body.code —— 网络内核那套三层判定
//   在这条路径上帮不上忙，也不该把 uploadFile 塞进 request.ts 里污染它。
//
// ★ timeout 用 60000：普通请求 15s 是为体验，10MB 文件在弱网下 15s 会频繁超时，
//   用户看到的是「明明在上传却报失败」，比多等几秒糟糕得多。

import { getAccessToken } from '@/core/storage/secure'
import { BASE_URL } from '@/core/env/env'
import { PLATFORM } from '@/core/platform'
import { CODE, CANCELLED, messageOf } from '@/core/http/error-code'
import { ERROR_LAYER, HttpError, type PageResult, type Result } from '@/core/http/types'
import { del, get } from '@/core/http/request'
import type { FileQuery, UploadedFileInfo, UploadedFileResult, UploadFileInput } from './types'

/** 上传超时：60 秒（普通请求 15s 的 4 倍） */
const UPLOAD_TIMEOUT: number = 60000

export const filesService = {
  /**
   * 上传文件。
   *
   * @param params.filePath 本地路径，来自 uni.chooseImage / uni.chooseFile 的 res.tempFilePaths[0]
   * @param params.purpose  用途，缺省时按后端默认的 'memory' 处理（不传 formData.purpose）
   * @returns file.url 可直接访问的完整 URL；deduplicated 为 true 表示命中秒传
   * @throws { HttpError} 业务失败（10012 不支持的类型 / 10013 超大）
   *                   与网络失败（断网、超时）都归一为这一个错误类型
   */
  upload(params: UploadFileInput): Promise<UploadedFileResult> {
    return new Promise<UploadedFileResult>((resolve, reject) => {
      const header: Record<string, string> = {
        'X-Platform': PLATFORM,
      }

      // ★ 必须手动带 Authorization：request.ts 的鉴权头注入只对 uni.request 生效
      const token = getAccessToken()
      if (token.length > 0) {
        header['Authorization'] = `Bearer ${token}`
      }

      // formData 只在显式给了 purpose 时才带，避免传 undefined 被序列化成 "undefined"
      const formData: Record<string, string> = {}
      const purpose = params.purpose
      if (purpose != null) {
        formData['purpose'] = purpose
      }

      uni.uploadFile({
        url: `${BASE_URL}/files`,
        filePath: params.filePath,
        name: 'file',
        formData,
        header,
        timeout: UPLOAD_TIMEOUT,
        success: (res) => {
          const status = res.statusCode
          const raw = res.data

          // ── HTTP 层 ──
          if (status < 200 || status >= 300) {
            reject(
              new HttpError(
                status === 401 ? '请先登录' : `服务异常（${status}）`,
                status === 401 ? ERROR_LAYER.BIZ : ERROR_LAYER.HTTP,
                status === 401 ? CODE.TOKEN_INVALID : httpStatusToCode(status),
                status,
                '',
                null,
                status >= 500,
              ),
            )
            return
          }

          // ── 解析层：uploadFile 的 data 是字符串，必须自己解包 Result<T> ──
          let body: Result<UploadedFileResult> | null = null
          try {
            body = JSON.parse(raw) as Result<UploadedFileResult>
          } catch (e) {
            reject(
              new HttpError('服务返回了无法解析的内容', ERROR_LAYER.HTTP, CODE.INTERNAL_ERROR, status, '', null, true),
            )
            return
          }

          if (body == null) {
            reject(
              new HttpError('服务返回了空响应', ERROR_LAYER.HTTP, CODE.INTERNAL_ERROR, status, '', null, true),
            )
            return
          }

          // ── 业务层 ──
          if (body.code !== CODE.SUCCESS) {
            reject(
              new HttpError(
                body.message.length > 0 ? body.message : messageOf(body.code),
                ERROR_LAYER.BIZ,
                body.code,
                status,
                body.traceId,
                body.data,
                false,
              ),
            )
            return
          }

          const data = body.data
          if (data == null) {
            reject(
              new HttpError('服务返回了空响应', ERROR_LAYER.HTTP, CODE.INTERNAL_ERROR, status, body.traceId, null, true),
            )
            return
          }

          resolve(data)
        },
        fail: (err) => {
          // fail 只可能是网络层问题：断网、DNS 失败、超时、用户取消
          const msg = err.errMsg ?? ''
          if (msg.includes('abort')) {
            reject(new HttpError(CANCELLED, ERROR_LAYER.CANCELLED, 0, 0))
            return
          }
          if (msg.includes('timeout')) {
            reject(
              new HttpError('上传超时，请检查网络后重试', ERROR_LAYER.NETWORK, CODE.TIMEOUT, 0, '', null, true),
            )
            return
          }
          reject(
            new HttpError('上传失败，请检查网络后重试', ERROR_LAYER.NETWORK, CODE.SERVICE_UNAVAILABLE, 0, '', null, true),
          )
        },
      })
    })
  },

  /** 我的文件列表。默认按上传时间倒序 */
  list(query: FileQuery): Promise<PageResult<UploadedFileInfo>> {
    return get<PageResult<UploadedFileInfo>>('/files', query)
  },

  /** 删除文件（软删除记录；物理删除失败不影响本接口） */
  remove(id: string): Promise<{ success: boolean }> {
    return del<{ success: boolean }>(`/files/${id}`)
  },
}

/** HTTP 状态码 → 业务码。与 request.ts 内部那份同源同值。 */
function httpStatusToCode(status: number): number {
  if (status === 401) return CODE.TOKEN_INVALID
  if (status === 403) return CODE.NO_PERMISSION
  if (status === 404) return CODE.NOT_FOUND
  if (status === 409) return CODE.ALREADY_EXISTS
  if (status === 413) return CODE.FILE_TOO_LARGE
  if (status === 415) return CODE.UNSUPPORTED_MEDIA_TYPE
  if (status === 429) return CODE.RATE_LIMITED
  if (status === 503) return CODE.SERVICE_UNAVAILABLE
  if (status === 504) return CODE.TIMEOUT
  if (status >= 500) return CODE.INTERNAL_ERROR
  return CODE.PARAM_INVALID
}

export default filesService
