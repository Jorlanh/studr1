import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
    const email = 'thzanotto@gmail.com';
    const name = 'Thiago Zanotto';
    const password = 'Studr2026!';
    const hashedPassword = await bcrypt.hash(password, 10);

    console.log(`🚀 Criando/Atualizando usuário de teste: ${email}`);

    const user = await prisma.user.upsert({
        where: { email },
        update: {
            isPremium: true,
            isVerified: true,
            subscriptionStatus: 'FULL',
            role: 'student',
            password: hashedPassword,
            trialEndsAt: new Date('2099-12-31') // Garantindo acesso longo
        },
        create: {
            email,
            name,
            password: hashedPassword,
            isVerified: true,
            isPremium: true,
            subscriptionStatus: 'FULL',
            role: 'student',
            trialEndsAt: new Date('2099-12-31')
        }
    });

    console.log(`✅ Usuário ${user.name} (${user.email}) criado com sucesso como PREMIUM!`);
    console.log(`🔑 Senha: ${password}`);
}

main()
    .catch((e) => {
        console.error('❌ Erro:', e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
