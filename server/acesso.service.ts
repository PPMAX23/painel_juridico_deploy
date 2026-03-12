import { getDb } from "./db";
import { adminConfig, painelUsuarios, painelLogs, painelLinksShort } from "../drizzle/schema";
import { eq, desc, and, gte, sql } from "drizzle-orm";
import { generateSecret, generateURI, verify as otpVerify } from "otplib";
import * as QRCode from "qrcode";
import * as bcrypt from "bcryptjs";
import { randomBytes } from "crypto";

async function db() {
  const d = await getDb();
  if (!d) throw new Error("Banco de dados não disponível");
  return d;
}

// ─── Gerar token único de acesso ────────────────────────────────────────────
export function gerarToken(): string {
  return randomBytes(24).toString("hex");
}

// ─── Links Curtos (camuflagem) ────────────────────────────────────────────
// Gera um código alfanumérico curto e único
function gerarCodigo(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  let codigo = "";
  const bytes = randomBytes(8);
  for (let i = 0; i < 8; i++) {
    codigo += chars[bytes[i] % chars.length];
  }
  return codigo;
}

export async function criarLinkCurto(usuarioId: number, token: string): Promise<string> {
  const d = await db();
  // Verificar se já existe link para esse usuário
  const existentes = await d.select().from(painelLinksShort).where(eq(painelLinksShort.usuarioId, usuarioId));
  if (existentes[0]) return existentes[0].codigo;
  // Gerar código único
  let codigo = gerarCodigo();
  let tentativas = 0;
  while (tentativas < 10) {
    const dup = await d.select().from(painelLinksShort).where(eq(painelLinksShort.codigo, codigo));
    if (!dup[0]) break;
    codigo = gerarCodigo();
    tentativas++;
  }
  await d.insert(painelLinksShort).values({ codigo, usuarioId, token });
  return codigo;
}

export async function resolverLinkCurto(codigo: string): Promise<string | null> {
  const d = await db();
  const links = await d.select().from(painelLinksShort).where(eq(painelLinksShort.codigo, codigo));
  return links[0]?.token || null;
}

export async function deletarLinkCurto(usuarioId: number): Promise<void> {
  const d = await db();
  await d.delete(painelLinksShort).where(eq(painelLinksShort.usuarioId, usuarioId));
}

// ─── Admin Config ─────────────────────────────────────────────────────────────
export async function obterAdminConfig() {
  const d = await db();
  const configs = await d.select().from(adminConfig).limit(1);
  return configs[0] || null;
}

export async function inicializarAdminConfig(senhaPlana: string) {
  const d = await db();
  const senhaHash = await bcrypt.hash(senhaPlana, 12);
  const secret = generateSecret();
  const existente = await obterAdminConfig();
  if (existente) {
    await d.update(adminConfig)
      .set({ senhaHash, totpSecret: secret, totpEnabled: false })
      .where(eq(adminConfig.id, existente.id));
  } else {
    await d.insert(adminConfig).values({ senhaHash, totpSecret: secret, totpEnabled: false });
  }
  return obterAdminConfig();
}

export async function verificarSenhaAdmin(senha: string): Promise<boolean> {
  const config = await obterAdminConfig();
  if (!config?.senhaHash) {
    return senha === "991219"; // senha padrão inicial
  }
  return bcrypt.compare(senha, config.senhaHash);
}

export async function alterarSenhaAdmin(novaSenha: string): Promise<void> {
  const d = await db();
  const senhaHash = await bcrypt.hash(novaSenha, 12);
  const config = await obterAdminConfig();
  if (config) {
    await d.update(adminConfig).set({ senhaHash }).where(eq(adminConfig.id, config.id));
  } else {
    await d.insert(adminConfig).values({ senhaHash, totpEnabled: false });
  }
}

// ─── Cookie TJSP Permanente (persistência no banco) ───────────────────────────
export async function salvarCookiePermanenteNoBanco(cookie: string): Promise<void> {
  const d = await db();
  const config = await obterAdminConfig();
  if (config) {
    await d.update(adminConfig).set({ tjspCookiePermanente: cookie } as any).where(eq(adminConfig.id, config.id));
  } else {
    await d.insert(adminConfig).values({ totpEnabled: false, tjspCookiePermanente: cookie } as any);
  }
}

export async function carregarCookiePermanenteDoBanco(): Promise<string | null> {
  try {
    const d = await db();
    const configs = await d.select().from(adminConfig).limit(1);
    const config = configs[0] as any;
    return config?.tjspCookiePermanente || null;
  } catch {
    return null;
  }
}

export async function obterQRCodeTOTP(): Promise<{ qrcode: string; secret: string; uri: string }> {
  const d = await db();
  let config = await obterAdminConfig();
  if (!config) throw new Error("Admin não configurado. Configure a senha primeiro.");
  if (!config.totpSecret) {
    const secret = generateSecret();
    await d.update(adminConfig).set({ totpSecret: secret }).where(eq(adminConfig.id, config.id));
    config = { ...config, totpSecret: secret };
  }
  const uri = generateURI({ strategy: "totp", issuer: "Painel Jurídico", label: "admin", secret: config.totpSecret! });
  const qrcode = await QRCode.toDataURL(uri);
  return { qrcode, secret: config.totpSecret!, uri };
}

export async function ativarTOTP(codigo: string): Promise<boolean> {
  const d = await db();
  const config = await obterAdminConfig();
  if (!config?.totpSecret) return false;
  const resultado = await otpVerify({ strategy: "totp", token: codigo, secret: config.totpSecret });
  const valido = (resultado as any)?.valid === true;
  if (valido) {
    await d.update(adminConfig).set({ totpEnabled: true }).where(eq(adminConfig.id, config.id));
  }
  return valido;
}

export async function desativarTOTP(): Promise<void> {
  const d = await db();
  const config = await obterAdminConfig();
  if (config) {
    await d.update(adminConfig).set({ totpEnabled: false }).where(eq(adminConfig.id, config.id));
  }
}

export async function verificarTOTP(codigo: string): Promise<boolean> {
  const config = await obterAdminConfig();
  if (!config?.totpSecret || !config.totpEnabled) return true;
  const resultado = await otpVerify({ strategy: "totp", token: codigo, secret: config.totpSecret });
  return (resultado as any)?.valid === true;
}

// ─── Gestão de Usuários da Equipe ─────────────────────────────────────────────
export async function listarUsuarios() {
  const d = await db();
  return d.select().from(painelUsuarios).orderBy(desc(painelUsuarios.createdAt));
}

export async function criarUsuario(dados: {
  nome: string;
  email?: string;
  permBuscar?: boolean;
  permEnriquecimento?: boolean;
  permAlvara?: boolean;
  permOficio?: boolean;
  permIA?: boolean;
  limiteConsultasDia?: number;
  expiresAt?: Date | null;
}) {
  const d = await db();
  const token = gerarToken();
  await d.insert(painelUsuarios).values({
    nome: dados.nome,
    email: dados.email || null,
    token,
    ativo: true,
    permBuscar: dados.permBuscar ?? true,
    permEnriquecimento: dados.permEnriquecimento ?? true,
    permAlvara: dados.permAlvara ?? false,
    permOficio: dados.permOficio ?? false,
    permIA: dados.permIA ?? true,
    limiteConsultasDia: dados.limiteConsultasDia ?? 200,
    expiresAt: dados.expiresAt || null,
  });
  const usuarios = await d.select().from(painelUsuarios).where(eq(painelUsuarios.token, token));
  return usuarios[0];
}

export async function atualizarUsuario(id: number, dados: Partial<{
  nome: string;
  email: string;
  ativo: boolean;
  permBuscar: boolean;
  permEnriquecimento: boolean;
  permAlvara: boolean;
  permOficio: boolean;
  permIA: boolean;
  limiteConsultasDia: number;
  expiresAt: Date | null;
}>) {
  const d = await db();
  await d.update(painelUsuarios).set(dados).where(eq(painelUsuarios.id, id));
  const usuarios = await d.select().from(painelUsuarios).where(eq(painelUsuarios.id, id));
  return usuarios[0];
}

export async function revogarUsuario(id: number) {
  const d = await db();
  await d.update(painelUsuarios).set({ ativo: false }).where(eq(painelUsuarios.id, id));
}

export async function deletarUsuario(id: number) {
  const d = await db();
  await d.delete(painelUsuarios).where(eq(painelUsuarios.id, id));
}

export async function regenerarToken(id: number): Promise<string> {
  const d = await db();
  const novoToken = gerarToken();
  await d.update(painelUsuarios).set({ token: novoToken }).where(eq(painelUsuarios.id, id));
  return novoToken;
}

// ─── Validação de Token de Acesso ─────────────────────────────────────────────
export async function validarToken(token: string): Promise<{
  valido: boolean;
  usuario?: typeof painelUsuarios.$inferSelect;
  motivo?: string;
}> {
  if (!token) return { valido: false, motivo: "Token não fornecido" };
  const d = await db();
  const usuarios = await d.select().from(painelUsuarios).where(eq(painelUsuarios.token, token));
  const usuario = usuarios[0];

  if (!usuario) return { valido: false, motivo: "Token inválido" };
  if (!usuario.ativo) return { valido: false, motivo: "Acesso revogado pelo administrador" };
  if (usuario.expiresAt && new Date() > usuario.expiresAt) {
    return { valido: false, motivo: "Link de acesso expirado" };
  }

  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const consultasHoje = await d.select({ count: sql<number>`count(*)` })
    .from(painelLogs)
    .where(and(
      eq(painelLogs.usuarioId, usuario.id),
      eq(painelLogs.acao, "busca"),
      gte(painelLogs.createdAt, hoje)
    ));
  const totalHoje = Number(consultasHoje[0]?.count || 0);
  if (totalHoje >= usuario.limiteConsultasDia) {
    return { valido: false, motivo: `Limite diário de ${usuario.limiteConsultasDia} consultas atingido` };
  }

  return { valido: true, usuario };
}

// ─── Logs ─────────────────────────────────────────────────────────────────────
export async function registrarLog(dados: {
  usuarioId?: number | null;
  usuarioNome?: string;
  acao: string;
  detalhe?: string;
  ip?: string;
  userAgent?: string;
}) {
  try {
    const d = await db();
    await d.insert(painelLogs).values({
      usuarioId: dados.usuarioId || null,
      usuarioNome: dados.usuarioNome || "Admin",
      acao: dados.acao,
      detalhe: dados.detalhe || null,
      ip: dados.ip || null,
      userAgent: dados.userAgent || null,
    });
  } catch (e) {
    // Não bloquear a operação principal se o log falhar
    console.warn("[Log] Falha ao registrar log:", e);
  }
}

export async function listarLogs(limite = 100, usuarioId?: number) {
  const d = await db();
  if (usuarioId) {
    return d.select().from(painelLogs)
      .where(eq(painelLogs.usuarioId, usuarioId))
      .orderBy(desc(painelLogs.createdAt))
      .limit(limite);
  }
  return d.select().from(painelLogs)
    .orderBy(desc(painelLogs.createdAt))
    .limit(limite);
}

export async function estatisticasUsuario(usuarioId: number) {
  const d = await db();
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);

  const totalConsultas = await d.select({ count: sql<number>`count(*)` })
    .from(painelLogs)
    .where(and(eq(painelLogs.usuarioId, usuarioId), eq(painelLogs.acao, "busca")));

  const consultasHoje = await d.select({ count: sql<number>`count(*)` })
    .from(painelLogs)
    .where(and(
      eq(painelLogs.usuarioId, usuarioId),
      eq(painelLogs.acao, "busca"),
      gte(painelLogs.createdAt, hoje)
    ));

  const ultimoAcesso = await d.select().from(painelLogs)
    .where(and(eq(painelLogs.usuarioId, usuarioId), eq(painelLogs.acao, "login")))
    .orderBy(desc(painelLogs.createdAt))
    .limit(1);

  return {
    totalConsultas: Number(totalConsultas[0]?.count || 0),
    consultasHoje: Number(consultasHoje[0]?.count || 0),
    ultimoAcesso: ultimoAcesso[0]?.createdAt || null,
  };
}
