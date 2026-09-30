import { PrismaPg } from '@prisma/adapter-pg';
import * as bcrypt from 'bcrypt';
import 'dotenv/config';
import { PrismaClient, Role } from 'generated/prisma/client';

const prisma = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: process.env.DATABASE_URL,
  }),
});

async function seedAdmin() {
  const adminEmail = 'admin.cilans@gmail.com';
  const adminPassword = 'Admin@123';

  const existingAdmin = await prisma.auth.findFirst({
    where: {
      role: Role.ADMIN,
    },
  });

  if (!existingAdmin) {
    const hashedPassword = await bcrypt.hash(adminPassword, 10);

    await prisma.auth.create({
      data: {
        email: adminEmail,
        password: hashedPassword,
        role: Role.ADMIN,
        isActive: true,
        isEmailVerified: true,
      },
    });

    console.log(`✅ Admin seeded: ${adminEmail}`);
  } else {
    console.log('ℹ️ Admin already exists');
  }
}

async function main() {
  await seedAdmin();
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
