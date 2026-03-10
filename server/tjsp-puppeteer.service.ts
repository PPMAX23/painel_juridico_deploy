/**
 * tjsp-puppeteer.service.ts
 * Serviço de busca no TJSP usando Puppeteer com o perfil do Chromium já autenticado.
 * Elimina a necessidade de cookies manuais — usa a sessão existente do browser.
 */

import { spawn } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const WORKER_PATH = path.resolve(__dirname, "tjsp-puppeteer.cjs");

/**
 * Executa o worker Puppeteer e retorna o resultado como objeto JSON.
 */
async function executarWorker(tipo: string, valor: string, timeout = 90000): Promise<any> {
  return new Promise((resolve, reject) => {
    const proc = spawn("node", [WORKER_PATH, tipo, valor], {
      env: { ...process.env, PATH: process.env.PATH },
      timeout,
    });

    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (d) => { stdout += d.toString(); });
    proc.stderr.on("data", (d) => { stderr += d.toString(); });

    proc.on("close", (code) => {
      if (code !== 0 || !stdout.trim()) {
        // Tentar extrair erro do stderr
        try {
          const errObj = JSON.parse(stderr.trim());
          if (errObj.error === "SESSAO_EXPIRADA") {
            return reject(new Error("TJSP_SESSAO_EXPIRADA"));
          }
          return reject(new Error(errObj.error || stderr || `Worker saiu com código ${code}`));
        } catch {
          return reject(new Error(stderr || `Worker saiu com código ${code}`));
        }
      }
      try {
        const resultado = JSON.parse(stdout.trim());
        if (resultado.error) {
          if (resultado.error === "SESSAO_EXPIRADA") {
            return reject(new Error("TJSP_SESSAO_EXPIRADA"));
          }
          return reject(new Error(resultado.error));
        }
        resolve(resultado);
      } catch (e) {
        reject(new Error(`Erro ao parsear resposta do worker: ${stdout.substring(0, 200)}`));
      }
    });

    proc.on("error", (err) => reject(err));
  });
}

/**
 * Busca processos por OAB no TJSP.
 * @param oab - Número da OAB (ex: "200287" ou "SP200.287")
 */
export async function buscarPorOABPuppeteer(oab: string): Promise<any> {
  // Normalizar OAB — remover prefixo SP, pontos, etc.
  const oabNumero = oab.replace(/^SP\s*/i, "").replace(/\./g, "").trim();
  return executarWorker("oab", oabNumero);
}

/**
 * Busca processo por número no TJSP.
 * @param numero - Número do processo (ex: "1501084-03.2019.8.26.0161")
 */
export async function buscarPorNumeroPuppeteer(numero: string): Promise<any> {
  return executarWorker("processo", numero);
}

/**
 * Busca processos por CPF ou CNPJ no TJSP.
 * @param documento - CPF ou CNPJ (apenas números)
 */
export async function buscarPorDocumentoPuppeteer(documento: string): Promise<any> {
  const doc = documento.replace(/\D/g, "");
  const tipo = doc.length <= 11 ? "cpf" : "cnpj";
  return executarWorker(tipo, doc);
}
