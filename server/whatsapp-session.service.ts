/**
 * Serviço de sessões WhatsApp Web por funcionário
 * Cada funcionário tem sua própria sessão do WhatsApp Web (whatsapp-web.js)
 * As sessões são persistidas em disco e restauradas automaticamente ao reiniciar
 */

// whatsapp-web.js é CJS — usar createRequire para importá-lo em módulo ESM
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const { Client, LocalAuth } = require("whatsapp-web.js");
import QRCode from "qrcode";
import path from "path";
import fs from "fs";

// Diretório para armazenar as sessões (fora do build)
const SESSIONS_DIR = path.join(process.cwd(), ".wwebjs_sessions");
if (!fs.existsSync(SESSIONS_DIR)) {
  fs.mkdirSync(SESSIONS_DIR, { recursive: true });
}

// Estado de cada sessão por usuário
// eslint-disable-next-line @typescript-eslint/no-explicit-any
interface SessionState {
  client: any; // Client do whatsapp-web.js (CJS, sem tipos ESM)
  status: "initializing" | "qr_ready" | "authenticated" | "disconnected" | "error";
  qrDataUrl: string | null;        // QR code como data URL (imagem PNG base64)
  qrRaw: string | null;            // QR code texto bruto
  phoneNumber: string | null;      // número conectado após autenticação
  displayName: string | null;      // nome do WhatsApp conectado
  lastActivity: number;
  readyResolvers: Array<() => void>;
}

// Mapa global de sessões: token do funcionário → estado da sessão
const sessions = new Map<string, SessionState>();

// Listeners de QR por token (para SSE/polling)
const qrListeners = new Map<string, Array<(qr: string) => void>>();

function notifyQrListeners(token: string, qrDataUrl: string) {
  const listeners = qrListeners.get(token) || [];
  listeners.forEach(fn => fn(qrDataUrl));
}

export function addQrListener(token: string, fn: (qr: string) => void) {
  if (!qrListeners.has(token)) qrListeners.set(token, []);
  qrListeners.get(token)!.push(fn);
}

export function removeQrListener(token: string, fn: (qr: string) => void) {
  const arr = qrListeners.get(token) || [];
  const idx = arr.indexOf(fn);
  if (idx !== -1) arr.splice(idx, 1);
}

/**
 * Inicializa ou retorna a sessão existente de um funcionário
 */
export async function getOrCreateSession(token: string): Promise<SessionState> {
  if (sessions.has(token)) {
    return sessions.get(token)!;
  }

  console.log(`[WA-Session] Criando nova sessão para token: ${token.substring(0, 8)}...`);

  const client = new Client({
    authStrategy: new LocalAuth({
      clientId: `funcionario_${token}`,
      dataPath: SESSIONS_DIR,
    }),
    puppeteer: {
      headless: true,
      executablePath: "/usr/bin/chromium-browser",
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-accelerated-2d-canvas",
        "--no-first-run",
        "--no-zygote",
        "--disable-gpu",
        "--disable-extensions",
        "--disable-background-networking",
        "--disable-default-apps",
        "--disable-sync",
        "--disable-translate",
        "--hide-scrollbars",
        "--metrics-recording-only",
        "--mute-audio",
        "--safebrowsing-disable-auto-update",
        "--single-process",
      ],
    },
  });

  const state: SessionState = {
    client,
    status: "initializing",
    qrDataUrl: null,
    qrRaw: null,
    phoneNumber: null,
    displayName: null,
    lastActivity: Date.now(),
    readyResolvers: [],
  };

  sessions.set(token, state);

  // Evento: QR code gerado
  client.on("qr", async (qr: string) => {
    console.log(`[WA-Session] QR gerado para ${token.substring(0, 8)}...`);
    try {
      const dataUrl = await QRCode.toDataURL(qr, { width: 300, margin: 2 });
      state.qrDataUrl = dataUrl;
      state.qrRaw = qr;
      state.status = "qr_ready";
      notifyQrListeners(token, dataUrl);
    } catch (err) {
      console.error("[WA-Session] Erro ao gerar QR data URL:", err);
    }
  });

  // Evento: autenticado com sucesso
  client.on("authenticated", () => {
    console.log(`[WA-Session] Autenticado: ${token.substring(0, 8)}...`);
    state.status = "authenticated";
    state.qrDataUrl = null;
    state.qrRaw = null;
  });

  // Evento: pronto para uso
  client.on("ready", async () => {
    console.log(`[WA-Session] Pronto: ${token.substring(0, 8)}...`);
    state.status = "authenticated";
    state.lastActivity = Date.now();
    try {
      const info = client.info;
      state.phoneNumber = info?.wid?.user || null;
      state.displayName = info?.pushname || null;
    } catch { /* silencioso */ }
    state.readyResolvers.forEach(fn => fn());
    state.readyResolvers = [];
  });

  // Evento: desconectado
  client.on("disconnected", (reason: string) => {
    console.log(`[WA-Session] Desconectado (${token.substring(0, 8)}): ${reason}`);
    state.status = "disconnected";
    state.phoneNumber = null;
    state.displayName = null;
    // Remover sessão do mapa para permitir reconexão
    sessions.delete(token);
  });

  // Evento: erro de autenticação
  client.on("auth_failure", (msg: string) => {
    console.error(`[WA-Session] Falha de autenticação (${token.substring(0, 8)}): ${msg}`);
    state.status = "error";
    sessions.delete(token);
  });

  // Inicializar o cliente
  client.initialize().catch((err: Error) => {
    console.error(`[WA-Session] Erro ao inicializar (${token.substring(0, 8)}):`, err);
    state.status = "error";
    sessions.delete(token);
  });

  return state;
}

/**
 * Retorna o status atual da sessão de um funcionário
 */
export function getSessionStatus(token: string): {
  status: string;
  phoneNumber: string | null;
  displayName: string | null;
  hasQr: boolean;
} {
  const state = sessions.get(token);
  if (!state) {
    // Verificar se há sessão salva em disco (já conectado anteriormente)
    const sessionPath = path.join(SESSIONS_DIR, `session-funcionario_${token}`);
    const hasSavedSession = fs.existsSync(sessionPath);
    return {
      status: hasSavedSession ? "saved" : "not_started",
      phoneNumber: null,
      displayName: null,
      hasQr: false,
    };
  }
  return {
    status: state.status,
    phoneNumber: state.phoneNumber,
    displayName: state.displayName,
    hasQr: state.qrDataUrl !== null,
  };
}

/**
 * Retorna o QR code atual (data URL) de uma sessão
 */
export function getSessionQR(token: string): string | null {
  return sessions.get(token)?.qrDataUrl || null;
}

/**
 * Envia uma mensagem de texto via sessão do funcionário
 */
export async function sendMessageFromSession(
  token: string,
  telefone: string,
  mensagem: string
): Promise<{ ok: boolean; error?: string }> {
  const state = sessions.get(token);
  if (!state) {
    return { ok: false, error: "Sessão não iniciada. Conecte o WhatsApp primeiro." };
  }
  if (state.status !== "authenticated") {
    return { ok: false, error: `WhatsApp não conectado (status: ${state.status})` };
  }

  try {
    // Normalizar número: garantir formato 55XXXXXXXXXXX@c.us
    const digits = telefone.replace(/\D/g, "");
    const numero = digits.startsWith("55") ? digits : `55${digits}`;
    const chatId = `${numero}@c.us`;

    await state.client.sendMessage(chatId, mensagem);
    state.lastActivity = Date.now();
    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[WA-Session] Erro ao enviar mensagem (${token.substring(0, 8)}):`, msg);
    return { ok: false, error: msg };
  }
}

/**
 * Desconecta e remove a sessão de um funcionário
 */
export async function disconnectSession(token: string): Promise<void> {
  const state = sessions.get(token);
  if (!state) return;
  try {
    await state.client.logout();
  } catch { /* silencioso */ }
  try {
    await state.client.destroy();
  } catch { /* silencioso */ }
  sessions.delete(token);

  // Remover arquivos de sessão do disco
  const sessionPath = path.join(SESSIONS_DIR, `session-funcionario_${token}`);
  if (fs.existsSync(sessionPath)) {
    fs.rmSync(sessionPath, { recursive: true, force: true });
  }
}

/**
 * Verifica se há sessão salva em disco para um funcionário (já conectou antes)
 */
export function hasSavedSession(token: string): boolean {
  const sessionPath = path.join(SESSIONS_DIR, `session-funcionario_${token}`);
  return fs.existsSync(sessionPath);
}

/**
 * Restaura sessões salvas em disco ao iniciar o servidor
 * (apenas para tokens que existem no banco)
 */
export async function restaurarSessoesSalvas(tokens: string[]): Promise<void> {
  for (const token of tokens) {
    if (hasSavedSession(token) && !sessions.has(token)) {
      console.log(`[WA-Session] Restaurando sessão salva: ${token.substring(0, 8)}...`);
      // Inicializar em background sem bloquear
      getOrCreateSession(token).catch(err =>
        console.error(`[WA-Session] Erro ao restaurar sessão ${token.substring(0, 8)}:`, err)
      );
    }
  }
}
