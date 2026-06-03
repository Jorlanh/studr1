import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
    // Altere este email para o email que você usa para logar no painel
    const adminEmail = 'sachabm@hotmail.com'; 
    const plainPassword = '101014';

    console.log(`Verificando se o admin ${adminEmail} existe...`);
    const existingUser = await prisma.user.findUnique({ where: { email: adminEmail } });

    if (existingUser) {
        console.log(`Usuário encontrado. Forçando cargo de ADMIN...`);
        await prisma.user.update({
            where: { email: adminEmail },
            data: {
                role: 'ADMIN', // 🔥 Força o papel de administrador
                isPremium: true,
                isVerified: true,
                subscriptionStatus: 'ACTIVE'
            }
        });
        console.log('✅ Usuário atualizado para ADMIN com sucesso!');
    } else {
        console.log(`Criando novo usuário ADMIN...`);
        const hashedPassword = await bcrypt.hash(plainPassword, 10);
        
        await prisma.user.create({
            data: {
                email: adminEmail,
                name: 'Administrador Chefe',
                password: hashedPassword,
                role: 'ADMIN', // 🔥 Força o papel de administrador
                isPremium: true,
                isVerified: true,
                subscriptionStatus: 'ACTIVE'
            }
        });
        console.log('✅ Novo ADMIN criado com sucesso!');
    }
}

main()
    .catch((e) => {
        console.error('❌ Erro:', e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });