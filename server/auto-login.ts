/**
 * Serviço de Auto-Login
 * Faz login automático no painel de origem e renova o token JWT
 * sem qualquer intervenção manual do usuário.
 * 
 * Usa um processo filho separado para rodar o Puppeteer,
 * evitando conflitos com o servidor principal.
 */
import { spawn } from "child_process";
import { join } from "path";
import { ENV } from "./_core/env";

const API_BASE = "http://191.101.131.161";

// ─── Estado do token ──────────────────────────────────────────────────────────
let tokenAtual: string = "";
let tokenExpiracao: number = 0;
let renovandoToken: boolean = false;
let tentativasLogin: number = 0;

export function getToken(): string | null {
  if (!tokenAtual) return null;
  if (Date.now() > tokenExpiracao - 2 * 60 * 1000) return null;
  return tokenAtual;
}

export function setTokenManual(token: string) {
  _setToken(token);
  console.log("[AutoLogin] Token definido manualmente.");
}

function _setToken(token: string) {
  tokenAtual = token;
  try {
    const payload = JSON.parse(
      Buffer.from(token.split(".")[1], "base64").toString()
    );
    tokenExpiracao = (payload.exp || 0) * 1000;
    tentativasLogin = 0;
    console.log(
      `[AutoLogin] Token válido até: ${new Date(tokenExpiracao).toLocaleString("pt-BR")}`
    );
  } catch {
    tokenExpiracao = Date.now() + 25 * 60 * 1000;
  }
}

export function getTokenStatus() {
  const tempoRestante = Math.max(
    0,
    Math.floor((tokenExpiracao - Date.now()) / 1000)
  );
  return {
    valido: !!getToken(),
    tempoRestante,
    expiracao: tokenExpiracao ? new Date(tokenExpiracao).toISOString() : null,
    renovando: renovandoToken,
  };
}

// ─── Login automático via processo filho ─────────────────────────────────────
async function fazerLoginAutomatico(): Promise<boolean> {
  if (renovandoToken) {
    console.log("[AutoLogin] Renovação já em andamento...");
    return false;
  }

  renovandoToken = true;
  tentativasLogin++;
  console.log(`[AutoLogin] Iniciando login automático (tentativa ${tentativasLogin})...`);

  return new Promise((resolve) => {
    const scriptPath = join(__dirname, "login-worker.py");
    
    const child = spawn("python3", [scriptPath, ENV.forgeApiUrl, ENV.forgeApiKey], {
      timeout: 60000,
      env: { ...process.env },
    });

    let output = "";
    let errorOutput = "";

    child.stdout.on("data", (data: Buffer) => {
      output += data.toString();
    });

    child.stderr.on("data", (data: Buffer) => {
      errorOutput += data.toString();
    });

    child.on("close", (code: number) => {
      renovandoToken = false;
      
      if (code === 0 && output.trim()) {
        const token = output.trim();
        if (token.startsWith("eyJ")) {
          _setToken(token);
          console.log("[AutoLogin] Login realizado com sucesso!");
          resolve(true);
          return;
        }
      }
      
      if (errorOutput) {
        console.error(`[AutoLogin] Erro do worker: ${errorOutput.substring(0, 200)}`);
      }
      console.log(`[AutoLogin] Login falhou (código ${code})`);
      resolve(false);
    });

    child.on("error", (err: Error) => {
      renovandoToken = false;
      console.error(`[AutoLogin] Erro ao iniciar worker: ${err.message}`);
      resolve(false);
    });
  });
}

// ─── Garantir token válido (com retry) ───────────────────────────────────────
export async function garantirToken(): Promise<string | null> {
  const token = getToken();
  if (token) return token;

  console.log("[AutoLogin] Token expirado ou ausente. Renovando...");

  // Tentar até 3 vezes (CAPTCHA pode ser lido errado)
  for (let i = 0; i < 3; i++) {
    const sucesso = await fazerLoginAutomatico();
    if (sucesso) return getToken();
    if (i < 2) {
      console.log(`[AutoLogin] Tentativa ${i + 1} falhou. Aguardando 3s...`);
      await new Promise((r) => setTimeout(r, 3000));
    }
  }

  console.error("[AutoLogin] Todas as tentativas falharam.");
  return null;
}

// ─── Inicialização e renovação periódica ─────────────────────────────────────
export async function iniciarAutoLogin() {
  console.log("[AutoLogin] Iniciando serviço de auto-login...");

  // Login imediato na inicialização (não bloquear o servidor)
  garantirToken().catch(e => console.error("[AutoLogin] Erro na inicialização:", e.message));

  // Renovar verificando a cada 1 minuto
  setInterval(async () => {
    const status = getTokenStatus();
    if (!status.renovando && status.tempoRestante < 5 * 60) {
      console.log(
        `[AutoLogin] Token expira em ${status.tempoRestante}s. Renovando automaticamente...`
      );
      await garantirToken().catch(e => console.error("[AutoLogin] Erro na renovação:", e.message));
    }
  }, 60 * 1000);

  console.log("[AutoLogin] Serviço iniciado. Renovação automática ativa.");
}
