
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';

dotenv.config({ path: 'c:/Users/Fabio Patricio/Projetos/FGPNegociosDigitais/SBM Cloud/studr/server/.env' });

const prisma = new PrismaClient();

async function resetPassword() {
  const email = 'sachabm@hotmail.com';
  const newPassword = 'Studr@2026';

  try {
    const user = await prisma.user.findUnique({
      where: { email }
    });

    if (!user) {
      console.log(`User ${email} not found.`);
      process.exit(1);
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    const updatedUser = await prisma.user.update({
      where: { email },
      data: { password: hashedPassword }
    });

    console.log(`Password reset successfully for user: ${email}`);
    console.log(`New password set to: ${newPassword}`);

  } catch (error) {
    console.error('Error resetting password:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

resetPassword();
