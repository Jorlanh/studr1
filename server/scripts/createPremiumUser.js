import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
    const email = 'davioli1900@gmail.com';
    const name = 'Davi Oliver';
    const password = 'Studr2026!';
    const hashedPassword = await bcrypt.hash(password, 10);

    console.log(`🚀 Iniciando criação/atualização do usuário premium: ${email}`);

    const user = await prisma.user.upsert({
        where: { email },
        update: {
            isPremium: true,
            isVerified: true,
            subscriptionStatus: 'FULL',
            role: 'student',
            password: hashedPassword // Garantir que a senha seja a definida
        },
        create: {
            email,
            name,
            password: hashedPassword,
            isVerified: true,
            isPremium: true,
            subscriptionStatus: 'FULL',
            role: 'student'
        }
    });

    console.log(`✅ Usuário ${user.name} (${user.email}) agora é PREMIUM!`);
    console.log(`🔑 Senha definida como: ${password}`);
}

main()
    .catch((e) => {
        console.error('❌ Erro ao criar usuário:', e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
