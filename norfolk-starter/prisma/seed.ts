import { PrismaClient } from "../lib/generated/prisma";

const prisma = new PrismaClient();

async function main(): Promise<void> {
  console.log("🌱 Seeding database…");

  // Add your seed data here.
  // Example:
  // await prisma.post.create({ data: { title: "Hello World" } });

  console.log("✅ Seed complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
