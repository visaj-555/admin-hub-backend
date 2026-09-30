import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/common/database/prisma.service';

@Injectable()
export class CountryService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(search?: string) {
    const where: {
      OR?: Array<{
        name?: {
          contains: string;
          mode: 'insensitive';
        };
        iso2?: {
          equals: string;
        };
        iso3?: {
          equals: string;
        };
        phoneCode?: {
          contains: string;
        };
      }>;
    } = {};

    if (search) {
      const upper = search.toUpperCase();

      where.OR = [
        {
          iso2: { equals: upper },
        },
        {
          iso3: { equals: upper },
        },
        {
          name: {
            contains: search,
            mode: 'insensitive',
          },
        },
        {
          phoneCode: {
            contains: search,
          },
        },
      ];
    }

    const countries = await this.prisma.country.findMany({
      where,
      select: {
        id: true,
        name: true,
        iso2: true,
        iso3: true,
        phoneCode: true,
        minLength: true,
        maxLength: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: {
        name: 'asc',
      },
    });

    return countries;
  }
}
