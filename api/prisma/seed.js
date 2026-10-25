import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { copyFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

dotenv.config({ path: "../.env" });
const here = path.dirname(fileURLToPath(import.meta.url));
const assetRoot = path.join(here, "demo-assets");
const uploadRoot = path.resolve(here, "../uploads");
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

async function ensureClient(data) {
  return prisma.cliente.upsert({ where: { documento: data.documento }, create: data, update: {} });
}

async function ensureAsset(sourceName, storedName) {
  await mkdir(uploadRoot, { recursive: true });
  const destination = path.join(uploadRoot, storedName);
  try { await copyFile(path.join(assetRoot, sourceName), destination, 1); }
  catch (error) { if (error.code !== "EEXIST") throw error; }
  return destination;
}

async function ensurePhoto(imovelId, sourceName, position) {
  const storedName = sourceName;
  await ensureAsset(sourceName, storedName);
  const existing = await prisma.fotoImovel.findUnique({ where: { arquivo: storedName } });
  if (!existing) await prisma.fotoImovel.create({ data: { imovelId, nomeOriginal: sourceName.replace("demo-", ""), arquivo: storedName, mimeType: "image/jpeg", posicao: position } });
}

async function ensureDocument(clienteId, sourceName, title, category) {
  const storedName = sourceName;
  await ensureAsset(sourceName, storedName);
  const existing = await prisma.documentoCliente.findUnique({ where: { arquivo: storedName } });
  if (!existing) await prisma.documentoCliente.create({ data: { clienteId, categoria: category, nomeOriginal: title, arquivo: storedName, mimeType: "application/pdf" } });
}

try {
  const helena = await ensureClient({ nome: "Helena Martins", email: "helena.demo@example.test", telefone: "(43) 90000-0101", documento: "DEMO-PROP-001", tipoDocumento: "OUTRO", tipo: "PROPRIETARIO" });
  const ana = await ensureClient({ nome: "Ana Beatriz Ferreira", email: "ana.demo@example.test", telefone: "(43) 90000-0102", documento: "DEMO-INQ-001", tipoDocumento: "OUTRO", tipo: "INQUILINO" });
  const paulo = await ensureClient({ nome: "Paulo Henrique Lima", email: "fiador.demo@example.test", telefone: "(43) 90000-0103", documento: "DEMO-FIA-001", tipoDocumento: "OUTRO", tipo: "FIADOR" });
  const roberto = await ensureClient({ nome: "Roberto Almeida", email: "roberto.demo@example.test", telefone: "(43) 90000-0201", documento: "DEMO-PROP-002", tipoDocumento: "OUTRO", tipo: "PROPRIETARIO" });
  const lucas = await ensureClient({ nome: "Lucas Nogueira", email: "lucas.demo@example.test", telefone: "(43) 90000-0202", documento: "DEMO-INQ-002", tipoDocumento: "OUTRO", tipo: "INQUILINO" });
  const sofia = await ensureClient({ nome: "Sofia Carvalho", email: "sofia.demo@example.test", telefone: "(43) 90000-0301", documento: "DEMO-INT-001", tipoDocumento: "OUTRO", tipo: "INTERESSADO" });
  await ensureClient({ nome: "Marina Costa", email: "marina.demo@example.test", telefone: "(43) 90000-0401", documento: "DEMO-FUNC-001", tipoDocumento: "OUTRO", tipo: "FUNCIONARIO" });

  const house = await prisma.imovel.upsert({ where: { codigo: "PER-DEMO-001" }, create: { codigo: "PER-DEMO-001", titulo: "Casa térrea com jardim", endereco: "Rua das Acácias, 120", cidade: "Andirá", tipo: "Casa", quartos: 3, valor: "1850.00", status: "ALUGADO", observacoes: "Imóvel de demonstração com quintal, garagem e ambientes integrados." }, update: {} });
  const apartment = await prisma.imovel.upsert({ where: { codigo: "PER-DEMO-002" }, create: { codigo: "PER-DEMO-002", titulo: "Apartamento iluminado no Centro", endereco: "Avenida Brasil, 540", cidade: "Andirá", tipo: "Apartamento", quartos: 2, valor: "1450.00", status: "ALUGADO", observacoes: "Exemplo de apartamento para locação, próximo a comércio e serviços." }, update: {} });
  const townhouse = await prisma.imovel.upsert({ where: { codigo: "PER-DEMO-003" }, create: { codigo: "PER-DEMO-003", titulo: "Sobrado contemporâneo", endereco: "Rua Ipê Amarelo, 82", cidade: "Ourinhos", tipo: "Sobrado", quartos: 3, valor: "395000.00", status: "DISPONIVEL", observacoes: "Imóvel de demonstração à venda, com varanda e duas vagas." }, update: {} });

  await ensurePhoto(house.id, "demo-casa-fachada.jpg", 0);
  await ensurePhoto(house.id, "demo-casa-interior.jpg", 1);
  await ensurePhoto(apartment.id, "demo-apartamento.jpg", 0);
  await ensurePhoto(townhouse.id, "demo-sobrado.jpg", 0);

  const firstContract = await prisma.contrato.upsert({ where: { numero: "CT-DEMO-001" }, create: { numero: "CT-DEMO-001", imovelId: house.id, inquilinoId: ana.id, proprietarioId: helena.id, fiadorId: paulo.id, inicio: new Date("2026-10-01T12:00:00.000Z"), fim: new Date("2027-09-30T12:00:00.000Z"), diaVencimento: 10, valorAluguel: "1850.00", indiceReajuste: "IPCA", ativo: true }, update: {} });
  const secondContract = await prisma.contrato.upsert({ where: { numero: "CT-DEMO-002" }, create: { numero: "CT-DEMO-002", imovelId: apartment.id, inquilinoId: lucas.id, proprietarioId: roberto.id, inicio: new Date("2026-06-01T12:00:00.000Z"), fim: new Date("2027-05-31T12:00:00.000Z"), diaVencimento: 5, valorAluguel: "1450.00", indiceReajuste: "IGP-M", ativo: true }, update: {} });

  const now = new Date();
  const currentMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const previousMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const reference = date => `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
  const dueDate = (date, day) => new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), day, 12));
  await prisma.pagamento.upsert({ where: { contratoId_referencia: { contratoId: firstContract.id, referencia: reference(previousMonth) } }, create: { contratoId: firstContract.id, referencia: reference(previousMonth), vencimento: dueDate(previousMonth, 10), pagoEm: dueDate(previousMonth, 10), valor: "1850.00", valorRecebido: "1850.00", troco: "0.00", formaPagamento: "PIX", recibo: "REC-DEMO-001", status: "PAGO" }, update: {} });
  await prisma.pagamento.upsert({ where: { contratoId_referencia: { contratoId: firstContract.id, referencia: reference(currentMonth) } }, create: { contratoId: firstContract.id, referencia: reference(currentMonth), vencimento: dueDate(currentMonth, 10), valor: "1850.00", status: "PENDENTE" }, update: {} });
  await prisma.pagamento.upsert({ where: { contratoId_referencia: { contratoId: secondContract.id, referencia: reference(currentMonth) } }, create: { contratoId: secondContract.id, referencia: reference(currentMonth), vencimento: dueDate(currentMonth, 5), valor: "1450.00", status: "PENDENTE" }, update: {} });

  await ensureDocument(ana.id, "demo-contrato-locacao.pdf", "Contrato demonstrativo - CT-DEMO-001.pdf", "CONTRATO");
  await ensureDocument(paulo.id, "demo-documento-fiador.pdf", "Ficha de fiador demonstrativa.pdf", "DOCUMENTO_IDENTIDADE");
  await prisma.chaveImovel.upsert({ where: { imovelId_numero: { imovelId: house.id, numero: "CH-DEMO-01" } }, create: { imovelId: house.id, numero: "CH-DEMO-01", localizacao: "Armário da recepção - posição 2" }, update: {} });
  await prisma.interesseImovel.upsert({ where: { imovelId_clienteId: { imovelId: townhouse.id, clienteId: sofia.id } }, create: { imovelId: townhouse.id, clienteId: sofia.id, prioridade: 4, observacoes: "Prefere visitar no período da tarde." }, update: {} });

  const visitStart = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000);
  visitStart.setUTCHours(14, 0, 0, 0);
  const existingVisit = await prisma.visita.findFirst({ where: { imovelId: townhouse.id, clienteId: sofia.id, observacoes: "Visita de demonstração" } });
  if (!existingVisit) await prisma.visita.create({ data: { imovelId: townhouse.id, clienteId: sofia.id, corretor: "Marina Costa", inicio: visitStart, observacoes: "Visita de demonstração", status: "AGENDADA" } });
  const existingInspection = await prisma.vistoria.findFirst({ where: { imovelId: house.id, descricao: "Vistoria inicial de demonstração" } });
  if (!existingInspection) await prisma.vistoria.create({ data: { imovelId: house.id, tipo: "ENTRADA", realizadaEm: new Date("2026-10-01T12:00:00.000Z"), descricao: "Vistoria inicial de demonstração" } });

  console.log("Exemplos fictícios adicionados: 3 imóveis com fotos, 7 pessoas, 2 contratos, pagamentos, documentos, chave, interessado, visita e vistoria.");
} finally { await prisma.$disconnect(); }
