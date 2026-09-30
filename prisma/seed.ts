import { PrismaPg } from '@prisma/adapter-pg';
import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { PrismaClient, UserRole } from '../src/generated/prisma/client.js';
import { newId } from '../src/common/database/ids.js';

const prisma = new PrismaClient({
    adapter: new PrismaPg({
        connectionString: process.env.DATABASE_URL,
    }),
});

async function seedAdmin() {
    const adminEmail = 'admin@gmail.com';
    const adminPassword = 'Admin@123';

    const hashedPassword = await bcrypt.hash(adminPassword, 10);

    const existingAdmin = await prisma.auth.findUnique({
        where: {
            email: adminEmail,
        },
        include: {
            user: true,
        },
    });

    if (!existingAdmin) {
        const userId = newId();

        await prisma.user.create({
            data: {
                id: userId,
                firstName: 'Admin',
                lastName: 'Visaj',
                role: UserRole.ADMIN,

                auth: {
                    create: {
                        id: newId(),
                        email: adminEmail,
                        passwordHash: hashedPassword,
                    },
                },
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
    .catch((error) => {
        console.error('❌ Seeding failed:', error);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
