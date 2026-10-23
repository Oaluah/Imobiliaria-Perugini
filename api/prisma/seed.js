import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

dotenv.config({ path: "../.env" });
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL })
});
try {
  await prisma.cliente.upsert({
    where: { documento: "00000000000" }, update: {},
    create: { nome: "Cliente de demonstração", documento: "00000000000", tipo: "INTERESSADO" }
  });
  await prisma.imovel.upsert({
    where: { codigo: "PER-001" }, update: {},
    create: { codigo: "PER-001", titulo: "Casa para demonstração", endereco: "Rua Exemplo, 100", cidade: "Andirá", tipo: "Casa", quartos: 2, valor: "1200.00" }
  });
  console.log("Dados de demonstração incluídos.");
} finally { await prisma.$disconnect(); }
