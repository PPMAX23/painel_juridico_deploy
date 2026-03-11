import { boolean, int, mysqlEnum, mysqlTable, text, timestamp, varchar } from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 */
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// ─── Configuração do Administrador (2FA TOTP) ─────────────────────────────────
export const adminConfig = mysqlTable("admin_config", {
  id: int("id").autoincrement().primaryKey(),
  totpSecret: varchar("totpSecret", { length: 64 }),          // segredo TOTP para Google Authenticator
  totpEnabled: boolean("totpEnabled").default(false).notNull(), // 2FA ativado?
  senhaHash: varchar("senhaHash", { length: 256 }),            // hash bcrypt da senha master
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type AdminConfig = typeof adminConfig.$inferSelect;

// ─── Usuários do Painel (equipe) ──────────────────────────────────────────────
export const painelUsuarios = mysqlTable("painel_usuarios", {
  id: int("id").autoincrement().primaryKey(),
  nome: varchar("nome", { length: 128 }).notNull(),
  email: varchar("email", { length: 320 }),
  token: varchar("token", { length: 64 }).notNull().unique(),  // token único do link de acesso
  ativo: boolean("ativo").default(true).notNull(),
  // Permissões granulares
  permBuscar: boolean("permBuscar").default(true).notNull(),
  permEnriquecimento: boolean("permEnriquecimento").default(true).notNull(),
  permAlvara: boolean("permAlvara").default(false).notNull(),
  permOficio: boolean("permOficio").default(false).notNull(),
  permIA: boolean("permIA").default(true).notNull(),
  // Limites
  limiteConsultasDia: int("limiteConsultasDia").default(200).notNull(),
  // Validade
  expiresAt: timestamp("expiresAt"),                           // null = sem expiração
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type PainelUsuario = typeof painelUsuarios.$inferSelect;
export type InsertPainelUsuario = typeof painelUsuarios.$inferInsert;

// ─── Logs de Acesso ───────────────────────────────────────────────────────────
export const painelLogs = mysqlTable("painel_logs", {
  id: int("id").autoincrement().primaryKey(),
  usuarioId: int("usuarioId"),                                 // null = admin
  usuarioNome: varchar("usuarioNome", { length: 128 }),
  acao: varchar("acao", { length: 64 }).notNull(),             // "login", "busca", "alvara", etc.
  detalhe: text("detalhe"),                                    // detalhes da ação
  ip: varchar("ip", { length: 64 }),
  userAgent: varchar("userAgent", { length: 512 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type PainelLog = typeof painelLogs.$inferSelect;
