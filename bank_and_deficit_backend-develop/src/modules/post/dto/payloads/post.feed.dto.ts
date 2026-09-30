import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsUUID } from 'class-validator';
import { Visibility } from 'generated/prisma/enums';
import { PaginationDto } from 'src/common/dto/pagination.dto';

export class GetFeedDto extends PaginationDto {
  @ApiPropertyOptional({
    description: 'Filter by user id',
  })
  @IsOptional()
  @IsUUID()
  userId?: string;

  @ApiPropertyOptional({
    enum: Visibility,
    description: 'Filter by visibility',
  })
  @IsOptional()
  @IsEnum(Visibility)
  visibility?: Visibility;
}
