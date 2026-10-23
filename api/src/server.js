import "dotenv/config";
import express from "express";
import cors from "cors";
import multer from "multer";
import { randomUUID } from "node:crypto";
import { mkdir, unlink } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { prisma } from "./db.js";
import { createToken, hashPassword, hasPermission, permissionCatalog, publicUser, readToken, verifyPassword } from "./auth.js";

const app = express();
const uploadRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../uploads");
await mkdir(uploadRoot, { recursive: true });
app.use(cors({ origin: (origin, callback) => {
  if (!origin || /^http:\/\/(localhost|127\.0\.0\.1):517\d+$/.test(origin)) return callback(null, true);
  callback(new Error("Origem não permitida."));
} }));
app.use(express.json({ limit: "1mb" }));

const mimeExtensions = { "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp", "application/pdf": ".pdf" };
function uploader({ photos = false } = {}) {
  const allowed = photos ? ["image/jpeg", "image/png", "image/webp"] : [...Object.keys(mimeExtensions)];
  return multer({
    storage: multer.diskStorage({ destination: uploadRoot, filename: (_req, file, done) => done(null, `${randomUUID()}${mimeExtensions[file.mimetype] || ".bin"}`) }),
    limits: { fileSize: photos ? 12 * 1024 * 1024 : 15 * 1024 * 1024, files: 20 },
    fileFilter: (_req, file, done) => allowed.includes(file.mimetype) ? done(null, true) : done(new Error(photos ? "Envie fotos JPG, PNG ou WebP." : "Envie arquivos PDF, JPG, PNG ou WebP."))
  });
}
const uploadPhotos = uploader({ photos: true });
const uploadDocuments = uploader();
const publicClientAttachment = { id: true, categoria: true, nomeOriginal: true, mimeType: true, criadoEm: true };
const publicPropertyPhoto = { id: true, nomeOriginal: true, mimeType: true, posicao: true, criadoEm: true };

app.get("/api/health", async (_req, res) => {
  try { await prisma.$queryRaw`SELECT 1`; res.json({ ok: true, service: "perugine-api" }); }
  catch { res.status(503).json({ ok: false, error: "Banco indisponível. Confira DATABASE_URL e PostgreSQL." }); }
});

app.get("/api/auth/setup-status", async (_req, res, next) => {
  try { res.json({ required: await prisma.usuario.count() === 0 }); }
  catch (error) { next(error); }
});
app.post("/api/auth/setup", async (req, res, next) => {
  try {
    const { nome, email, senha } = req.body;
    if (!nome?.trim() || !email?.trim() || typeof senha !== "string" || senha.length < 12) return res.status(400).json({ error: "Informe nome, e-mail e uma senha com pelo menos 12 caracteres." });
    if (await prisma.usuario.count()) return res.status(409).json({ error: "O administrador inicial já foi criado. Faça login." });
    const permissoes = permissionCatalog.map(({ key }) => ({ chave: key, permitido: true }));
    const user = await prisma.usuario.create({ data: { nome: nome.trim(), email: email.trim().toLowerCase(), senhaHash: await hashPassword(senha), cargo: "ADMINISTRADOR", permissoes: { create: permissoes } }, include: { permissoes: true } });
    res.status(201).json({ token: createToken(user.id), usuario: publicUser(user) });
  } catch (error) { next(error); }
});
app.post("/api/auth/login", async (req, res, next) => {
  try {
    const user = await prisma.usuario.findUnique({ where: { email: String(req.body.email || "").trim().toLowerCase() }, include: { permissoes: true } });
    if (!user?.ativo || !await verifyPassword(String(req.body.senha || ""), user.senhaHash)) return res.status(401).json({ error: "E-mail ou senha inválidos." });
    res.json({ token: createToken(user.id), usuario: publicUser(user) });
  } catch (error) { next(error); }
});

app.use("/api", async (req, res, next) => {
  const claims = readToken(req.headers.authorization?.replace(/^Bearer\s+/i, ""));
  if (!claims) return res.status(401).json({ error: "Sessão expirada. Entre novamente." });
  try {
    const user = await prisma.usuario.findUnique({ where: { id: Number(claims.sub) }, include: { permissoes: true } });
    if (!user?.ativo) return res.status(401).json({ error: "Conta inativa. Fale com um administrador." });
    req.usuario = publicUser(user);
    next();
  } catch (error) { next(error); }
});
app.get("/api/auth/me", (req, res) => res.json(req.usuario));

app.use("/api", (req, res, next) => {
  if (req.path.startsWith("/auth/")) return next();
  let permission;
  if (req.path.startsWith("/clientes")) permission = req.method === "GET" ? "clients.view" : "clients.manage";
  else if (req.path.startsWith("/imoveis")) permission = req.method === "GET" ? "properties.view" : "properties.manage";
  else if (req.path.startsWith("/visitas")) permission = req.method === "GET" ? "visits.view" : "visits.manage";
  else if (req.path.startsWith("/vistorias")) permission = req.method === "GET" ? "properties.view" : "properties.manage";
  else if (req.path.startsWith("/financeiro") || req.path.startsWith("/contratos")) permission = req.method === "GET" ? "finance.view" : "finance.manage";
  else if (req.path.startsWith("/arquivos/documento/")) permission = "clients.view";
  else if (req.path.startsWith("/arquivos/foto/")) permission = "properties.view";
  else if (req.path.startsWith("/usuarios")) permission = "users.manage";
  if (permission && !hasPermission(req.usuario, permission)) return res.status(403).json({ error: "Seu usuário não tem permissão para esta ação." });
  next();
});

const userInclude = { permissoes: { orderBy: { chave: "asc" } } };
app.get("/api/usuarios", async (_req, res, next) => {
  try { res.json((await prisma.usuario.findMany({ include: userInclude, orderBy: { nome: "asc" } })).map(publicUser)); }
  catch (error) { next(error); }
});
app.post("/api/usuarios", async (req, res, next) => {
  try {
    const { nome, email, senha, cargo, permissoes = {} } = req.body;
    if (!nome?.trim() || !email?.trim() || typeof senha !== "string" || senha.length < 12) return res.status(400).json({ error: "Informe nome, e-mail e senha com pelo menos 12 caracteres." });
    const allowed = new Set(permissionCatalog.map(item => item.key));
    const user = await prisma.usuario.create({ data: { nome: nome.trim(), email: email.trim().toLowerCase(), senhaHash: await hashPassword(senha), cargo: cargo?.trim() || "CORRETOR", permissoes: { create: [...allowed].map(chave => ({ chave, permitido: permissoes[chave] === true })) } }, include: userInclude });
    res.status(201).json(publicUser(user));
  } catch (error) { next(error); }
});
app.patch("/api/usuarios/:id", async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const { nome, email, cargo, ativo, permissoes, senha } = req.body;
    const current = await prisma.usuario.findUnique({ where: { id }, include: { permissoes: true } });
    if (!current) return res.status(404).json({ error: "Usuário não encontrado." });
    const nextPermissions = permissoes === undefined ? Object.fromEntries(current.permissoes.map(item => [item.chave, item.permitido])) : permissoes;
    if (id === req.usuario.id && (ativo === false || nextPermissions["users.manage"] !== true)) return res.status(400).json({ error: "Você não pode desativar sua conta nem remover sua própria permissão de administração." });
    if (typeof senha === "string" && senha && senha.length < 12) return res.status(400).json({ error: "A senha precisa ter pelo menos 12 caracteres." });
    if (ativo === false || nextPermissions["users.manage"] !== true) {
      const otherAdmins = await prisma.usuario.count({ where: { ativo: true, id: { not: id }, permissoes: { some: { chave: "users.manage", permitido: true } } } });
      if (!otherAdmins && current.ativo && current.permissoes.some(item => item.chave === "users.manage" && item.permitido)) return res.status(400).json({ error: "Mantenha pelo menos um administrador ativo com acesso aos usuários." });
    }
    const allowed = permissionCatalog.map(item => item.key);
    const updated = await prisma.$transaction(async tx => {
      const data = {};
      if (nome !== undefined) data.nome = nome.trim();
      if (email !== undefined) data.email = email.trim().toLowerCase();
      if (cargo !== undefined) data.cargo = cargo.trim();
      if (ativo !== undefined) data.ativo = Boolean(ativo);
      if (senha) data.senhaHash = await hashPassword(senha);
      const saved = await tx.usuario.update({ where: { id }, data });
      if (permissoes !== undefined) for (const chave of allowed) await tx.permissaoUsuario.upsert({ where: { usuarioId_chave: { usuarioId: id, chave } }, create: { usuarioId: id, chave, permitido: permissoes[chave] === true }, update: { permitido: permissoes[chave] === true } });
      return tx.usuario.findUnique({ where: { id: saved.id }, include: userInclude });
    });
    res.json(publicUser(updated));
  } catch (error) { next(error); }
});

app.get("/api/financeiro", async (_req, res, next) => {
  try {
    const contracts = await prisma.contrato.findMany({
      where: { ativo: true },
      include: {
        imovel: { select: { id: true, codigo: true, titulo: true, endereco: true, cidade: true } },
        inquilino: { select: { id: true, nome: true } },
        proprietario: { select: { id: true, nome: true } },
        pagamentos: { orderBy: { vencimento: "asc" }, select: { id: true, referencia: true, vencimento: true, pagoEm: true, valor: true, status: true, recibo: true } },
        aditamentos: { orderBy: { aplicadoEm: "desc" } }
      },
      orderBy: { criadoEm: "desc" }
    });
    res.json(contracts);
  } catch (error) { next(error); }
});

app.post("/api/contratos", async (req, res, next) => {
  try {
    const { imovelId, inquilinoId, proprietarioId, fiadorId, inicio, fim, diaVencimento, valorAluguel, indiceReajuste } = req.body;
    const start = new Date(inicio); const end = new Date(fim);
    const rent = Number(valorAluguel); const dueDay = Number(diaVencimento);
    if (!imovelId || !inquilinoId || !proprietarioId || Number.isNaN(start.valueOf()) || Number.isNaN(end.valueOf()) || end <= start || !Number.isFinite(rent) || rent <= 0 || !Number.isInteger(dueDay) || dueDay < 1 || dueDay > 31)
      return res.status(400).json({ error: "Confira imóvel, inquilino, proprietário, período, aluguel e dia de vencimento." });
    const [imovel, inquilino, proprietario, fiador] = await Promise.all([
      prisma.imovel.findUnique({ where: { id: Number(imovelId) } }),
      prisma.cliente.findFirst({ where: { id: Number(inquilinoId), ativo: true, tipo: "INQUILINO" } }),
      prisma.cliente.findFirst({ where: { id: Number(proprietarioId), ativo: true, tipo: "PROPRIETARIO" } }),
      fiadorId ? prisma.cliente.findFirst({ where: { id: Number(fiadorId), ativo: true, tipo: "FIADOR" } }) : null
    ]);
    if (!imovel || !["DISPONIVEL", "RESERVADO"].includes(imovel.status) || !inquilino || !proprietario || (fiadorId && !fiador)) return res.status(400).json({ error: "Selecione um imóvel disponível ou reservado e clientes com os perfis correspondentes." });
    const contrato = await prisma.$transaction(async tx => {
      // Claim the property atomically so two simultaneous requests cannot create overlapping leases.
      const claimed = await tx.imovel.updateMany({
        where: { id: Number(imovelId), status: { in: ["DISPONIVEL", "RESERVADO"] } },
        data: { status: "ALUGADO" }
      });
      if (claimed.count !== 1) return null;
      const created = await tx.contrato.create({ data: { numero: `LOC-${randomUUID().slice(0, 8).toUpperCase()}`, imovelId: Number(imovelId), inquilinoId: Number(inquilinoId), proprietarioId: Number(proprietarioId), fiadorId: fiadorId ? Number(fiadorId) : null, inicio: start, fim: end, diaVencimento: dueDay, valorAluguel: rent.toFixed(2), indiceReajuste: indiceReajuste?.trim() || null } });
      return created;
    });
    if (!contrato) return res.status(409).json({ error: "Este imóvel acabou de ser vinculado a outra locação. Atualize a carteira e tente novamente." });
    res.status(201).json(contrato);
  } catch (error) { next(error); }
});

app.post("/api/contratos/:id/reajustes", async (req, res, next) => {
  try {
    const contratoId = Number(req.params.id);
    const indice = String(req.body.indice || "").trim().toUpperCase();
    const percentual = Number(req.body.percentual);
    if (!["IPCA", "IGP-M"].includes(indice) || !Number.isFinite(percentual) || percentual < -100 || percentual > 1000)
      return res.status(400).json({ error: "Informe o índice IPCA ou IGP-M e um percentual válido." });
    const contrato = await prisma.contrato.findFirst({ where: { id: contratoId, ativo: true } });
    if (!contrato) return res.status(404).json({ error: "Contrato ativo não encontrado." });
    const anterior = Number(contrato.valorAluguel);
    const novo = Math.round(anterior * (1 + percentual / 100) * 100) / 100;
    if (!Number.isFinite(novo) || novo <= 0) return res.status(400).json({ error: "O reajuste precisa manter o aluguel acima de zero." });
    const saved = await prisma.$transaction(async tx => {
      const aditamento = await tx.aditamento.create({ data: { contratoId, valorAnterior: anterior.toFixed(2), valorNovo: novo.toFixed(2), indice: `${indice} ${percentual >= 0 ? "+" : ""}${percentual}%` } });
      await tx.contrato.update({ where: { id: contratoId }, data: { valorAluguel: novo.toFixed(2) } });
      return aditamento;
    });
    res.status(201).json({ aditamento: saved, valorAnterior: anterior, valorNovo: novo });
  } catch (error) { next(error); }
});

app.get("/api/vistorias", async (_req, res, next) => {
  try {
    res.json(await prisma.vistoria.findMany({ include: { imovel: { select: { id: true, codigo: true, titulo: true, endereco: true } } }, orderBy: { realizadaEm: "desc" } }));
  } catch (error) { next(error); }
});
app.post("/api/vistorias", async (req, res, next) => {
  try {
    const imovelId = Number(req.body.imovelId);
    const tipo = String(req.body.tipo || "").trim().toUpperCase();
    const descricao = String(req.body.descricao || "").trim();
    const realizadaEm = req.body.realizadaEm ? new Date(req.body.realizadaEm) : new Date();
    if (!Number.isInteger(imovelId) || imovelId < 1 || !["ENTRADA", "SAIDA", "MANUTENCAO", "OCORRENCIA"].includes(tipo) || descricao.length < 5 || Number.isNaN(realizadaEm.valueOf()))
      return res.status(400).json({ error: "Informe o imóvel, o tipo de vistoria, uma data válida e uma descrição com pelo menos 5 caracteres." });
    const imovel = await prisma.imovel.findUnique({ where: { id: imovelId }, select: { id: true } });
    if (!imovel) return res.status(404).json({ error: "Imóvel não encontrado." });
    const vistoria = await prisma.vistoria.create({ data: { imovelId, tipo, descricao, realizadaEm }, include: { imovel: { select: { id: true, codigo: true, titulo: true, endereco: true } } } });
    res.status(201).json(vistoria);
  } catch (error) { next(error); }
});

app.post("/api/financeiro/:contratoId/pagamentos", async (req, res, next) => {
  try {
    const contractId = Number(req.params.contratoId);
    const referencia = String(req.body.referencia || "");
    if (!/^\d{4}-\d{2}$/.test(referencia)) return res.status(400).json({ error: "Informe a competência no formato AAAA-MM." });
    const [year, month] = referencia.split("-").map(Number);
    if (month < 1 || month > 12) return res.status(400).json({ error: "Mês da competência inválido." });
    const contract = await prisma.contrato.findFirst({ where: { id: contractId, ativo: true } });
    if (!contract) return res.status(404).json({ error: "Contrato ativo não encontrado." });
    const firstReference = contract.inicio.toISOString().slice(0, 7);
    const lastReference = contract.fim.toISOString().slice(0, 7);
    if (referencia < firstReference || referencia > lastReference) return res.status(400).json({ error: "A competência informada está fora do período do contrato." });
    const day = Math.min(contract.diaVencimento, new Date(year, month, 0).getDate());
    const vencimento = new Date(year, month - 1, day, 12);
    const payment = await prisma.pagamento.create({ data: { contratoId: contractId, referencia, vencimento, valor: contract.valorAluguel, status: "PENDENTE" } });
    res.status(201).json(payment);
  } catch (error) { next(error); }
});

app.patch("/api/financeiro/pagamentos/:id", async (req, res, next) => {
  try {
    const { status } = req.body;
    if (!["PENDENTE", "PAGO", "ATRASADO"].includes(status)) return res.status(400).json({ error: "Situação do pagamento inválida." });
    const current = await prisma.pagamento.findUnique({ where: { id: Number(req.params.id) } });
    if (!current) return res.status(404).json({ error: "Pagamento não encontrado." });
    const recibo = status === "PAGO" ? current.recibo || `REC-${new Date().getFullYear()}-${randomUUID().slice(0, 8).toUpperCase()}` : current.recibo;
    const payment = await prisma.pagamento.update({ where: { id: current.id }, data: { status, pagoEm: status === "PAGO" ? current.pagoEm || new Date() : null, recibo } });
    res.json(payment);
  } catch (error) { next(error); }
});

app.get("/api/clientes", async (_req, res, next) => {
  try { res.json(await prisma.cliente.findMany({ where: { ativo: true }, include: { anexos: { select: publicClientAttachment, orderBy: { criadoEm: "desc" } } }, orderBy: { nome: "asc" } })); }
  catch (error) { next(error); }
});
app.post("/api/clientes", async (req, res, next) => {
  try {
    const { nome, email, telefone, documento, tipoDocumento, tipo } = req.body;
    if (!nome?.trim()) return res.status(400).json({ error: "Informe o nome do cliente." });
    const cliente = await prisma.cliente.create({ data: { nome: nome.trim(), email: email || null, telefone: telefone || null, documento: documento || null, tipoDocumento: tipoDocumento || null, tipo: tipo || "INTERESSADO" } });
    res.status(201).json(cliente);
  } catch (error) { next(error); }
});
app.put("/api/clientes/:id", async (req, res, next) => {
  try {
    const { nome, email, telefone, documento, tipoDocumento, tipo } = req.body;
    if (!nome?.trim()) return res.status(400).json({ error: "Informe o nome do cliente." });
    res.json(await prisma.cliente.update({ where: { id: Number(req.params.id) }, data: { nome: nome.trim(), email: email || null, telefone: telefone || null, documento: documento || null, tipoDocumento: tipoDocumento || null, tipo } }));
  } catch (error) { next(error); }
});
app.delete("/api/clientes/:id", async (req, res, next) => {
  try { res.json(await prisma.cliente.update({ where: { id: Number(req.params.id) }, data: { ativo: false } })); }
  catch (error) { next(error); }
});
app.post("/api/clientes/:id/documentos", uploadDocuments.array("files", 20), async (req, res, next) => {
  try {
    const clienteId = Number(req.params.id);
    const categorias = JSON.parse(req.body.categorias || "[]");
    const cliente = await prisma.cliente.findUnique({ where: { id: clienteId }, select: { id: true } });
    if (!cliente) { await removeUploaded(req.files); return res.status(404).json({ error: "Cliente não encontrado." }); }
    const documentos = await prisma.documentoCliente.createMany({ data: (req.files || []).map((file, index) => ({ clienteId, categoria: categorias[index] || "OUTRO", nomeOriginal: file.originalname, arquivo: file.filename, mimeType: file.mimetype })) });
    res.status(201).json({ enviados: documentos.count });
  } catch (error) { await removeUploaded(req.files); next(error); }
});
app.delete("/api/clientes/:clienteId/documentos/:id", async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const doc = await prisma.documentoCliente.findFirst({ where: { id, clienteId: Number(req.params.clienteId) } });
    if (!doc) return res.status(404).json({ error: "Documento não encontrado." });
    await prisma.documentoCliente.delete({ where: { id } }); await removeStored(doc.arquivo);
    res.status(204).end();
  } catch (error) { next(error); }
});

app.get("/api/imoveis", async (_req, res, next) => {
  try { res.json(await prisma.imovel.findMany({ include: { fotos: { select: publicPropertyPhoto, orderBy: { posicao: "asc" } } }, orderBy: { criadoEm: "desc" } })); }
  catch (error) { next(error); }
});
app.post("/api/imoveis", async (req, res, next) => {
  try {
    const { codigo, titulo, endereco, cidade, tipo, quartos, valor, status, observacoes } = req.body;
    if (!codigo?.trim() || !titulo?.trim() || !endereco?.trim() || !Number.isFinite(Number(valor)) || Number(valor) <= 0)
      return res.status(400).json({ error: "Código, título, endereço e valor maior que zero são obrigatórios." });
    res.status(201).json(await prisma.imovel.create({ data: { codigo: codigo.trim(), titulo: titulo.trim(), endereco: endereco.trim(), cidade: cidade || "Andirá", tipo: tipo || null, quartos: Number(quartos) || 0, valor: String(valor), status: status || "DISPONIVEL", observacoes: observacoes || null } }));
  } catch (error) { next(error); }
});
app.put("/api/imoveis/:id", async (req, res, next) => {
  try {
    const { codigo, titulo, endereco, cidade, tipo, quartos, valor, status, observacoes } = req.body;
    if (!codigo?.trim() || !titulo?.trim() || !endereco?.trim() || !Number.isFinite(Number(valor)) || Number(valor) <= 0)
      return res.status(400).json({ error: "Código, título, endereço e valor maior que zero são obrigatórios." });
    if (["DISPONIVEL", "RESERVADO"].includes(status)) {
      const activeLease = await prisma.contrato.findFirst({ where: { imovelId: Number(req.params.id), ativo: true }, select: { id: true } });
      if (activeLease) return res.status(409).json({ error: "Este imóvel tem uma locação ativa. Encerre o contrato antes de alterar a situação." });
    }
    res.json(await prisma.imovel.update({ where: { id: Number(req.params.id) }, data: { codigo: codigo.trim(), titulo: titulo.trim(), endereco: endereco.trim(), cidade, tipo: tipo || null, quartos: Number(quartos) || 0, valor: String(valor), status, observacoes: observacoes || null } }));
  } catch (error) { next(error); }
});
app.delete("/api/imoveis/:id", async (req, res, next) => {
  try {
    const imovelId = Number(req.params.id);
    const photos = await prisma.fotoImovel.findMany({ where: { imovelId }, select: { arquivo: true } });
    await prisma.imovel.delete({ where: { id: imovelId } });
    await Promise.all(photos.map(photo => removeStored(photo.arquivo)));
    res.status(204).end();
  } catch (error) { next(error); }
});
app.post("/api/imoveis/:id/fotos", uploadPhotos.array("files", 20), async (req, res, next) => {
  try {
    const imovelId = Number(req.params.id);
    const imovel = await prisma.imovel.findUnique({ where: { id: imovelId }, select: { id: true } });
    if (!imovel) { await removeUploaded(req.files); return res.status(404).json({ error: "Imóvel não encontrado." }); }
    const currentCount = await prisma.fotoImovel.count({ where: { imovelId } });
    if (currentCount + (req.files?.length || 0) > 20) { await removeUploaded(req.files); return res.status(400).json({ error: "Cada imóvel pode ter até 20 fotos." }); }
    const photos = await prisma.fotoImovel.createMany({ data: (req.files || []).map((file, index) => ({ imovelId, nomeOriginal: file.originalname, arquivo: file.filename, mimeType: file.mimetype, posicao: currentCount + index })) });
    res.status(201).json({ enviados: photos.count });
  } catch (error) { await removeUploaded(req.files); next(error); }
});
app.delete("/api/imoveis/:imovelId/fotos/:id", async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const foto = await prisma.fotoImovel.findFirst({ where: { id, imovelId: Number(req.params.imovelId) } });
    if (!foto) return res.status(404).json({ error: "Foto não encontrada." });
    await prisma.fotoImovel.delete({ where: { id } }); await removeStored(foto.arquivo);
    res.status(204).end();
  } catch (error) { next(error); }
});

app.get("/api/visitas", async (_req, res, next) => {
  try { res.json(await prisma.visita.findMany({ include: { imovel: { select: { id: true, codigo: true, titulo: true, endereco: true, cidade: true } }, cliente: { select: { id: true, nome: true, telefone: true } } }, orderBy: { inicio: "asc" } })); }
  catch (error) { next(error); }
});
app.post("/api/visitas", async (req, res, next) => {
  try {
    const { imovelId, clienteId, corretor, inicio, observacoes } = req.body;
    const date = new Date(inicio);
    if (!imovelId || !clienteId || !inicio || Number.isNaN(date.valueOf())) return res.status(400).json({ error: "Selecione o imóvel, o cliente e uma data válida para a visita." });
    if (date < new Date()) return res.status(400).json({ error: "A visita precisa ser agendada para o futuro." });
    res.status(201).json(await prisma.visita.create({ data: { imovelId: Number(imovelId), clienteId: Number(clienteId), corretor: corretor || null, inicio: date, observacoes: observacoes || null } }));
  } catch (error) { next(error); }
});
app.patch("/api/visitas/:id/status", async (req, res, next) => {
  try {
    const { status } = req.body;
    if (!["AGENDADA", "REALIZADA", "CANCELADA"].includes(status)) return res.status(400).json({ error: "Situação de visita inválida." });
    res.json(await prisma.visita.update({ where: { id: Number(req.params.id) }, data: { status } }));
  } catch (error) { next(error); }
});

app.get("/api/arquivos/:tipo/:id", async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const file = req.params.tipo === "documento"
      ? await prisma.documentoCliente.findUnique({ where: { id }, select: { arquivo: true, nomeOriginal: true, mimeType: true } })
      : req.params.tipo === "foto"
        ? await prisma.fotoImovel.findUnique({ where: { id }, select: { arquivo: true, nomeOriginal: true, mimeType: true } })
        : null;
    if (!file) return res.status(404).json({ error: "Arquivo não encontrado." });
    res.type(file.mimeType).set("Content-Disposition", `inline; filename*=UTF-8''${encodeURIComponent(file.nomeOriginal)}`).sendFile(path.join(uploadRoot, file.arquivo));
  } catch (error) { next(error); }
});

async function removeStored(filename) { try { await unlink(path.join(uploadRoot, path.basename(filename))); } catch (error) { if (error.code !== "ENOENT") throw error; } }
async function removeUploaded(files = []) { await Promise.all((files || []).map(file => removeStored(file.filename))); }

app.use((error, _req, res, _next) => {
  if (error instanceof multer.MulterError) return res.status(error.code === "LIMIT_FILE_SIZE" ? 413 : 400).json({ error: error.code === "LIMIT_FILE_SIZE" ? "O arquivo excede o limite permitido." : "Não foi possível receber os arquivos selecionados." });
  if (error.message?.startsWith("Envie arquivos") || error.message?.startsWith("Envie fotos")) return res.status(400).json({ error: error.message });
  console.error(error);
  if (error.code === "P2002") return res.status(409).json({ error: "Já existe um registro com esse código ou documento." });
  if (error.code === "P2025") return res.status(404).json({ error: "Registro não encontrado." });
  if (error.code === "P2003") return res.status(409).json({ error: "Este registro está vinculado a uma locação e não pode ser excluído." });
  res.status(500).json({ error: "Não foi possível concluir a operação." });
});

const port = Number(process.env.API_PORT || 3001);
app.listen(port, "127.0.0.1", () => console.log(`API Perugine disponível em http://localhost:${port}`));
