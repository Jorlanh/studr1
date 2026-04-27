
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function promoteUser() {
  const email = 'sachabm@hotmail.com';
  try {
    const user = await prisma.user.update({
      where: { email: email.toLowerCase() },
      data: {
        isPremium: true,
        trialEndsAt: new Date('2099-12-31') // Liberação "eterna"
      }
    });
    console.log(`Usuário ${email} agora é PREMIUM com sucesso!`);
    console.log(user);
  } catch (error) {
    console.error('Erro ao promover usuário:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

promoteUser();
