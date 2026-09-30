import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOkResponse,
  ApiOperation,
  ApiProperty,
  ApiTags,
} from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { newId } from '../../common/database/ids.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { ApiResponseDto } from '../../common/dto/api-response.dto.js';
import type { JwtPayload } from '../../common/interfaces/jwt-payload.js';
import { IdParamDto } from '../../common/dto/id-param.dto.js';
import { AdminGuard } from '../auth/guards/admin.guard.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import {
  CreateUserDto,
  UpdateUserDto,
  UserDetailDto,
  UserDetailResponseDto,
  UserListResponseDto,
  UserResponseEnvelopeDto,
  UsersQueryDto,
} from './dto/user.dto.js';
import { UserService } from './user.service.js';
import { ResponseMessage } from '../../common/decorators/response-message.decorator.js';

const imageExtensions: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
};

const profileImageUpload = {
  storage: diskStorage({
    destination: (_request, _file, callback) => {
      const directory = join(process.cwd(), 'uploads', 'profile-images');
      mkdirSync(directory, { recursive: true });
      callback(null, directory);
    },
    filename: (_request, file, callback) => {
      callback(null, `${newId()}${imageExtensions[file.mimetype]}`);
    },
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_request, file, callback) => {
    if (!imageExtensions[file.mimetype]) {
      callback(new BadRequestException('Profile image must be JPEG, PNG, or WebP'), false);
      return;
    }
    callback(null, true);
  },
};

class DeleteUserDataDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'date-time' })
  deletedAt!: string;
}

class DeleteUserResponseDto extends ApiResponseDto<DeleteUserDataDto> {
  @ApiProperty({ type: String, example: 'User deleted successfully' })
  declare message?: string;

  @ApiProperty({ type: DeleteUserDataDto })
  declare data: DeleteUserDataDto;
}

@ApiTags('Users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, AdminGuard)
@Controller('users')
export class UserController {
  constructor(private readonly usersService: UserService) { }

  @Get()
  @ResponseMessage('Users fetched successfully')
  @ApiOperation({
    summary: 'List users with search, filters, sorting, and pagination',
  })
  @ApiOkResponse({ type: UserListResponseDto })
  list(@Query() query: UsersQueryDto): Promise<UserListResponseDto> {
    return this.usersService.list(query);
  }

  @Get(':id')
  @ResponseMessage('User fetched successfully')
  @ApiOperation({ summary: 'Get a user by UUID' })
  @ApiOkResponse({ type: UserDetailResponseDto })
  get(@Param() params: IdParamDto): Promise<{ data: UserDetailDto }> {
    return this.usersService.get(params.id);
  }

  @Post()
  @ResponseMessage('User created successfully')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Create a user and login account atomically' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ type: CreateUserDto })
  @ApiOkResponse({ type: UserResponseEnvelopeDto })
  @UseInterceptors(FileInterceptor('profileImage', profileImageUpload))
  create(
    @Body() input: CreateUserDto,
    @UploadedFile() profileImage?: Express.Multer.File,
  ): Promise<{ data: UserResponseEnvelopeDto['data'] }> {
    return this.usersService.create(
      input,
      profileImage
        ? `/uploads/profile-images/${profileImage.filename}`
        : undefined,
    );
  }

  @Patch(':id')
  @ResponseMessage('User updated successfully')
  @ApiOperation({ summary: 'Update user profile, role, or status' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ type: UpdateUserDto })
  @ApiOkResponse({ type: UserResponseEnvelopeDto })
  @UseInterceptors(FileInterceptor('profileImage', profileImageUpload))
  update(
    @Param() params: IdParamDto,
    @Body() input: UpdateUserDto,
    @UploadedFile() profileImage?: Express.Multer.File,
  ): Promise<{ data: UserResponseEnvelopeDto['data'] }> {
    return this.usersService.update(
      params.id,
      input,
      profileImage
        ? `/uploads/profile-images/${profileImage.filename}`
        : undefined,
    );
  }

  @Delete(':id')
  @ResponseMessage('User deleted successfully')
  @ApiOperation({ summary: 'Soft-delete a user' })
  @ApiOkResponse({ type: DeleteUserResponseDto })
  remove(
    @Param() params: IdParamDto,
    @CurrentUser() actor: JwtPayload,
  ): Promise<DeleteUserResponseDto> {
    return this.usersService.remove(params.id, actor);
  }
}
