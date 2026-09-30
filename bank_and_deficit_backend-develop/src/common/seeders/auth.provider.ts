import { PrismaPg } from '@prisma/adapter-pg';
import 'dotenv/config';

import { AuthProvider, PrismaClient } from 'generated/prisma/client';

const prisma = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: process.env.DATABASE_URL!,
  }),
});

async function main() {
  const auths = await prisma.auth.findMany({
    where: {
      providers: {
        none: {},
      },
    },
  });

  for (const auth of auths) {
    await prisma.authProviderAccount.create({
      data: {
        provider: AuthProvider.LOCAL,
        providerId: auth.id,
        authId: auth.id,
      },
    });
  }

  console.log(`✅ Migrated ${auths.length} users`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
