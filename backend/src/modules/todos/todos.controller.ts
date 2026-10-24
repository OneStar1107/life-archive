/**
 * modules/todos/todos.controller.ts
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
  Patch,
  Post,
  Query,
} from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { TodosService } from './todos.service'
import { CurrentUser, type AuthUser } from '../../common/decorators/current-user.decorator'
import { PageResult } from '../../common/dto/result.dto'
import { CreateTodoDto, TodoDto, TodoGroupDto, QueryTodoDto, UpdateTodoDto } from './dto/todos.dto'

@ApiTags('待办')
@ApiBearerAuth()
@Controller('todos')
export class TodosController {
  constructor(private readonly todosService: TodosService) {}

  @Get()
  @ApiOperation({ summary: '待办列表', description: '支持状态、类型、人物过滤' })
  async list(
    @CurrentUser() user: AuthUser,
    @Query() query: QueryTodoDto,
  ): Promise<PageResult<TodoDto>> {
    return this.todosService.list(user.id, query)
  }

  @Get('grouped')
  @ApiOperation({ summary: '按时间分组', description: '今天 / 未来 7 天 / 已逾期 / 最近完成' })
  async grouped(@CurrentUser() user: AuthUser): Promise<TodoGroupDto> {
    return this.todosService.grouped(user.id)
  }

  @Get(':id')
  @ApiOperation({ summary: '待办详情' })
  async detail(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ): Promise<TodoDto> {
    return this.todosService.detail(user.id, id)
  }

  @Post()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '新建待办', description: '支持 task / birthday / festival / trip' })
  async create(@CurrentUser() user: AuthUser, @Body() dto: CreateTodoDto): Promise<TodoDto> {
    return this.todosService.create(user.id, dto)
  }

  @Patch(':id')
  @ApiOperation({ summary: '更新待办' })
  async update(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: UpdateTodoDto,
  ): Promise<TodoDto> {
    return this.todosService.update(user.id, id, dto)
  }

  @Post(':id/toggle')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '切换完成状态' })
  async toggle(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ): Promise<TodoDto> {
    return this.todosService.toggle(user.id, id)
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '删除待办（软删除）' })
  async remove(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ): Promise<{ success: true }> {
    return this.todosService.remove(user.id, id)
  }
}
