import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    // Search by email, name or contains 'fabio'
    const target = 'fabio.patricio';
    const users = await prisma.user.findMany({
        where: {
            OR: [
                { email: { contains: target, mode: 'insensitive' } },
                { name: { contains: target, mode: 'insensitive' } }
            ]
        }
    });

    if (users.length === 0) {
        console.log('❌ Usuário não encontrado.');
        return;
    }

    const user = users[0];
    await prisma.user.update({
        where: { id: user.id },
        data: { role: 'admin' }
    });

    console.log(`✅ Usuário ${user.name || 'Sem nome'} (${user.email}) promovido a ADMIN com sucesso!`);
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
