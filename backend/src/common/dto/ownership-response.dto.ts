/**
 * common/dto/ownership-response.dto.ts
 * 各业务模块出参 DTO 的公共部分说明。
 *
 * ★ 02 号 T10 铁律：每个出参必须用 DTO 显式裁剪，
 *   禁止直接把 Prisma Entity 返回给客户端（会泄漏 passwordHash 等字段）。
 *
 * 本文件只放「出参 DTO 的编写规范」，具体 DTO 在各模块的 dto/ 目录。
 */

/**
 * 编写出参 DTO 的检查清单：
 *
 * 1. 每个字段都有 @ApiProperty
 * 2. 绝不包含：passwordHash、tokenVersion、deletedAt、tokenHash、familyId
 * 3. 字符串长度与库中 @db.VarChar 一致
 * 4. 日期统一序列化为 ISO 8601 字符串（前端直接 new Date() 即可）
 * 5. 需要裁剪的字段用 @Exclude() + ClassSerializerInterceptor，或在 Service 里手写 map
 */
export const RESPONSE_DTO_CHECKLIST = [
  '每个字段都有 @ApiProperty',
  '不含 passwordHash / tokenVersion / deletedAt / tokenHash / familyId',
  '字符串长度与 @db.VarChar 一致',
  '日期序列化为 ISO 8601',
] as const
