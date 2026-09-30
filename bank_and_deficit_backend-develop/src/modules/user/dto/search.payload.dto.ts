import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import { PaginationDto } from 'src/common/dto/pagination.dto';

export class SearchUsersDto extends PaginationDto {
  @ApiProperty({
    description: 'Search keyword (firstName or lastName)',
    example: 'Rahul',
    required: false,
  })
  @IsOptional()
  @IsString()
  search?: string;
}
