import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const products = await prisma.affiliateProduct.findMany();
  console.log('--- Affiliate Products ---');
  console.log(JSON.stringify(products, null, 2));

  const links = await prisma.affiliateLink.findMany();
  console.log('--- Affiliate Links ---');
  console.log(JSON.stringify(links, null, 2));
}

main()
  .catch(e => console.error(e))
  .finally(() => prisma.$disconnect());
