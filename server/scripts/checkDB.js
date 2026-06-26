import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const products = await prisma.affiliateProduct.findMany();
  console.log('Affiliate products in database:', JSON.stringify(products, null, 2));
}

main()
  .catch(e => console.error(e))
  .finally(() => prisma.$disconnect());
