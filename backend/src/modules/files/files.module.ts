/**
 * modules/files/files.module.ts
 * 文件上传模块。
 *
 * 存储抽象：默认本地磁盘实现，限制大小与 MIME 白名单；
 * 文件不落项目目录，落到 UPLOAD_ROOT 指定的挂载卷。
 */

import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { FilesController } from './files.controller'
import { FilesService } from './files.service'
@Module({
  imports: [ConfigModule],
  controllers: [FilesController],
  providers: [FilesService],
  exports: [FilesService],
})
export class FilesModule {}
