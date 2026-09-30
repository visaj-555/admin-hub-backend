import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';

export class DailyProgressDto {
  @ApiProperty({
    description: 'Date in YYYY-MM-DD format',
    example: '2026-05-14',
  })
  date: string;

  @ApiProperty({
    description: 'Day of the week',
    example: 'Wednesday',
  })
  day: string;

  @ApiProperty({
    description: 'Number of good acts (published posts) on that day',
    example: 3,
  })
  tasks: number;
}

export class InsightsResponseDto {
  @ApiProperty({ description: 'Current active streak', example: 7 })
  currentStreak: number;

  @ApiProperty({ description: 'Highest streak achieved', example: 45 })
  highestStreak: number;

  @ApiProperty({
    description: 'Total good deeds published today',
    example: 4,
  })
  todaysGoodness: number;

  @ApiProperty({
    description: 'Random motivational quote',
    example:
      'Small daily improvements are the key to staggering long-term results.',
  })
  quote: string;

  @ApiProperty({
    type: [DailyProgressDto],
    description:
      'Daily progress — current week (Mon → today) or past week (Mon → Sun)',
  })
  weeklyProgress: DailyProgressDto[];
}

export class InsightsQueryDto {
  @ApiPropertyOptional({
    description: 'Which week to fetch progress for',
    enum: ['current', 'past'],
    default: 'current',
  })
  @IsOptional()
  @IsEnum(['current', 'past'])
  week?: 'current' | 'past' = 'current';
}
