import {
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
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { ResponseMessage } from '../../common/decorators/response-message.decorator.js';
import { ApiResponseDto } from '../../common/dto/api-response.dto.js';
import { IdParamDto } from '../../common/dto/id-param.dto.js';
import type { JwtPayload } from '../../common/interfaces/jwt-payload.interface.js';
import {
  CreateUserDto,
  UpdateUserDto,
  UserDetailDto,
  UserDetailResponseDto,
  UserListResponseDto,
  UserResponseEnvelopeDto,
  UsersQueryDto,
} from './dto/user.dto.js';
import { profileImageInterceptor } from './interceptors/profile-image.interceptor.js';
import { UserService } from './user.service.js';

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
  @UseInterceptors(profileImageInterceptor)
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
  @UseInterceptors(profileImageInterceptor)
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
