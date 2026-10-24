/**
 * modules/files/files.controller.ts
 * 文件上传 / 列表 / 删除。
 *
 * ★ 控制器只返回业务数据，Result<T> 包装由 ResponseInterceptor 统一完成
 *   （见 common/interceptors/response.interceptor.ts）。
 *
 * 上传走 multipart/form-data，MIME 校验统一放在 Service，
 * fileFilter 这里只放行，具体类型由 Service 给出可读的 10012 文案。
 */

import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common'
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger'
import { FileInterceptor } from '@nestjs/platform-express'
import { FilesService } from './files.service'
import { CurrentUser, type AuthUser } from '../../common/decorators/current-user.decorator'
import { ErrorCode, messageOf } from '../../common/constants/error-codes'
import { BusinessException } from '../../common/exceptions/business.exception'
import { PageResult } from '../../common/dto/result.dto'
// QueryFileDto 被 @Query() 使用：emitDecoratorMetadata 需要它的「值」引用，
// type-only 导入会在编译后被擦除，实测 design:paramtypes 退化成 Function（不是 DTO 类），
// ValidationPipe 白名单为空 → 任何查询参数都报 "property X should not exist"。
// FileDto / UploadResultDto 仅作返回类型，保持 type-only。
import {
  FILE_PURPOSES,
  type FileDto,
  QueryFileDto,
  type UploadResultDto,
} from './dto/files.dto'

/** 单文件大小上限 10MB，与 upload.maxSize 默认值一致 */
const MAX_FILE_SIZE = 10 * 1024 * 1024

@ApiTags('files')
@ApiBearerAuth()
@Controller('files')
export class FilesController {
  constructor(private readonly filesService: FilesService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: MAX_FILE_SIZE },
      // 一律放行：交给 Service 统一给出可读文案
      fileFilter: () => true,
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: {
        file: { type: 'string', format: 'binary' },
        purpose: { type: 'string', enum: [...FILE_PURPOSES], default: 'memory' },
      },
    },
  })
  @ApiOperation({
    summary: '上传文件',
    description:
      '图片类文件上传。同用户重复上传内容相同的文件会命中秒传，deduplicated 为 true。' +
      `单个文件不超过 ${MAX_FILE_SIZE / 1024 / 1024}MB。`,
  })
  async upload(
    @CurrentUser() user: AuthUser,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body('purpose') purpose?: string,
  ): Promise<UploadResultDto> {
    if (!file) {
      throw new BusinessException(ErrorCode.PARAM_MISSING, '请选择要上传的文件')
    }
    return this.filesService.upload(user.id, file, purpose ?? 'memory')
  }

  @Get()
  @ApiOperation({ summary: '我的文件列表', description: '支持按用途过滤，默认按上传时间倒序' })
  async list(
    @CurrentUser() user: AuthUser,
    @Query() query: QueryFileDto,
  ): Promise<PageResult<FileDto>> {
    return this.filesService.list(user.id, query)
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '删除文件',
    description: `软删除记录并尝试删除物理文件；物理删除失败不影响本接口。${messageOf(ErrorCode.FILE_NOT_FOUND)}`,
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  async remove(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ): Promise<{ success: true }> {
    return this.filesService.remove(user.id, id)
  }
}
