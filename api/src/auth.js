import { createHmac, randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback);
const secret = process.env.AUTH_SECRET;

export const permissionCatalog = [
  { key: "dashboard.view", label: "Acessar painel" },
  { key: "properties.view", label: "Visualizar imóveis" },
  { key: "properties.manage", label: "Cadastrar e editar imóveis" },
  { key: "clients.view", label: "Visualizar clientes e documentos" },
  { key: "clients.manage", label: "Cadastrar e editar clientes" },
  { key: "visits.view", label: "Visualizar agenda" },
  { key: "visits.manage", label: "Agendar e atualizar visitas" },
  { key: "finance.view", label: "Visualizar ficha financeira" },
  { key: "finance.manage", label: "Gerenciar locações e pagamentos" },
  { key: "users.manage", label: "Gerenciar usuários e permissões" }
];

export async function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const derived = await scrypt(password, salt, 64);
  return `${salt}:${derived.toString("hex")}`;
}

export async function verifyPassword(password, stored) {
  const [salt, expectedHex] = stored.split(":");
  if (!salt || !expectedHex) return false;
  const expected = Buffer.from(expectedHex, "hex");
  const actual = await scrypt(password, salt, expected.length);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export function createToken(userId) {
  if (!secret || secret.length < 32) throw new Error("AUTH_SECRET precisa ter pelo menos 32 caracteres.");
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(JSON.stringify({ sub: userId, exp: Math.floor(Date.now() / 1000) + 60 * 60 * 12 })).toString("base64url");
  const input = `${header}.${payload}`;
  const signature = createHmac("sha256", secret).update(input).digest("base64url");
  return `${input}.${signature}`;
}

export function readToken(token) {
  if (!secret || secret.length < 32) return null;
  const [header, payload, signature] = String(token || "").split(".");
  if (!header || !payload || !signature) return null;
  const input = `${header}.${payload}`;
  const expected = createHmac("sha256", secret).update(input).digest();
  let received;
  try { received = Buffer.from(signature, "base64url"); JSON.parse(Buffer.from(payload, "base64url").toString()); }
  catch { return null; }
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) return null;
  const claims = JSON.parse(Buffer.from(payload, "base64url").toString());
  return claims.exp > Math.floor(Date.now() / 1000) ? claims : null;
}

export function hasPermission(user, permission) {
  if (user?.permissoes?.[permission]) return true;
  if (permission === "finance.manage" && user?.permissoes?.["users.manage"]) return true;
  const [area, action] = permission.split(".");
  return action === "view" && Boolean(user?.permissoes?.[`${area}.manage`]);
}

export function publicUser(user) {
  const permissoes = Object.fromEntries(user.permissoes.map(item => [item.chave, item.permitido]));
  return { id: user.id, nome: user.nome, email: user.email, cargo: user.cargo, ativo: user.ativo, permissoes };
}
