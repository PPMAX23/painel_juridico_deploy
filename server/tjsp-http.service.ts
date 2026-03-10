/**
 * tjsp-http.service.ts
 * Serviço de scraping HTTP direto do TJSP usando fetch + cheerio.
 * Funciona em qualquer ambiente (sandbox e produção) sem precisar de Chromium.
 * Os cookies de sessão são capturados via Puppeteer no sandbox ou fornecidos manualmente.
 */
import * as cheerio from "cheerio";

// ─── Estado global de cookies ────────────────────────────────────────────────
let cookiesAtivos: string = "";
let cookiesExpiram: number = 0; // timestamp ms

const TJSP_BASE = "https://esaj.tjsp.jus.br";
const USER_AGENT =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

// ─── Gerenciamento de cookies ─────────────────────────────────────────────────
export function setCookiesTJSP(cookies: string, ttlMs = 4 * 60 * 60 * 1000) {
  cookiesAtivos = cookies;
  cookiesExpiram = Date.now() + ttlMs;
  console.log(`[TJSP] Cookies configurados. Expiram em ${new Date(cookiesExpiram).toLocaleTimeString("pt-BR")}`);
}

export function getCookiesTJSP(): string {
  return cookiesAtivos;
}

export function cookiesValidos(): boolean {
  return !!cookiesAtivos && Date.now() < cookiesExpiram;
}

export function statusCookies() {
  return {
    autenticado: cookiesValidos(),
    expiracao: cookiesExpiram ? new Date(cookiesExpiram).toISOString() : null,
    tempoRestante: cookiesExpiram ? Math.max(0, Math.round((cookiesExpiram - Date.now()) / 60000)) + " min" : null,
  };
}

// ─── Captura automática de cookies via Puppeteer (apenas no sandbox) ──────────
export async function capturarCookiesPuppeteer(): Promise<string> {
  try {
    const { execSync } = await import("child_process");
    const result = execSync(
      `node -e "
const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');
const os = require('os');
async function main() {
  const tmpDir = path.join(os.tmpdir(), 'tjsp_cap_' + Date.now());
  fs.mkdirSync(tmpDir, { recursive: true });
  for (const arq of ['Default/Cookies','Default/Local State','Default/Preferences']) {
    const src = path.join('/home/ubuntu/.browser_data_dir', arq);
    const dst = path.join(tmpDir, arq);
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    try { fs.copyFileSync(src, dst); } catch(e) {}
  }
  const browser = await puppeteer.launch({
    executablePath: '/usr/bin/chromium-browser',
    userDataDir: tmpDir,
    headless: true,
    args: ['--no-sandbox','--disable-setuid-sandbox','--disable-dev-shm-usage']
  });
  const page = await browser.newPage();
  await page.goto('https://esaj.tjsp.jus.br/cpopg/open.do', {waitUntil: 'networkidle2', timeout: 30000});
  const cookies = await page.cookies();
  const cookieStr = cookies.map(c => c.name + '=' + c.value).join('; ');
  console.log('COOKIES:' + cookieStr);
  await browser.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
}
main().catch(e => { console.error('ERRO:' + e.message); process.exit(1); });
"`,
      { timeout: 60000, encoding: "utf8" }
    );
    const match = result.match(/COOKIES:(.+)/);
    if (match) {
      const cookies = match[1].trim();
      setCookiesTJSP(cookies);
      return cookies;
    }
    throw new Error("Cookies não encontrados na saída");
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`Falha ao capturar cookies via Puppeteer: ${msg}`);
  }
}

// ─── Garantir cookies válidos ─────────────────────────────────────────────────
export async function garantirCookies(): Promise<string> {
  if (cookiesValidos()) return cookiesAtivos;
  // Tentar capturar via Puppeteer (apenas funciona no sandbox)
  try {
    console.log("[TJSP] Capturando cookies via Puppeteer...");
    return await capturarCookiesPuppeteer();
  } catch (e) {
    console.error("[TJSP] Puppeteer indisponível:", e instanceof Error ? e.message : e);
    throw new Error("TJSP_SEM_AUTENTICACAO");
  }
}

// ─── Fetch autenticado ────────────────────────────────────────────────────────
async function fetchTJSP(url: string): Promise<string> {
  const cookies = await garantirCookies();
  const resp = await fetch(url, {
    headers: {
      Cookie: cookies,
      "User-Agent": USER_AGENT,
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "pt-BR,pt;q=0.9",
      Referer: TJSP_BASE,
    },
  });
  if (!resp.ok) throw new Error(`HTTP ${resp.status} ao acessar ${url}`);
  const html = await resp.text();
  // Verificar se foi redirecionado para login
  if (html.includes("sajcas/login") || html.includes("id=\"usernameForm\"")) {
    cookiesAtivos = ""; // Invalidar cookies
    throw new Error("SESSAO_EXPIRADA");
  }
  return html;
}

// ─── Extrair lista de processos do HTML ──────────────────────────────────────
function extrairListaProcessos(html: string): ProcessoResumo[] {
  const $ = cheerio.load(html);
  const processos: ProcessoResumo[] = [];
  const numerosVistos = new Set<string>();

  // Mapear foros: cada h2.foroDosProcessos precede uma lista de processos
  const foroMap: Map<string, string> = new Map();
  $("h2.foroDosProcessos").each((_, h2) => {
    const foroNome = $(h2).text().trim().replace(/\s+/g, " ");
    // Pegar todos os divProcesso* que seguem este h2
    $(h2).nextAll("ul").first().find("div[id^='divProcesso']").each((_, div) => {
      const id = $(div).attr("id") || "";
      const codigo = id.replace("divProcesso", "");
      if (codigo) foroMap.set(codigo, foroNome);
    });
  });

  $("a.linkProcesso").each((_, el) => {
    const link = $(el);
    const numero = link.text().trim().replace(/\s+/g, " ");
    if (!/\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}/.test(numero)) return;
    if (numerosVistos.has(numero)) return;
    numerosVistos.add(numero);

    const href = link.attr("href") || "";
    const codigoMatch = href.match(/processo\.codigo=([^&]+)/);
    const foroMatch = href.match(/processo\.foro=([^&]+)/);
    const codigoProcesso = codigoMatch?.[1] || "";
    const foroProcesso = foroMatch?.[1] || "";

    // Navegar até o container pai .home__lista-de-processos
    const container = link.closest(".home__lista-de-processos, .row");

    let classe = "";
    let assunto = "";
    let data = "";
    let vara = "";

    if (container.length) {
      classe = container.find(".classeProcesso").first().text().trim().replace(/\s+/g, " ");
      assunto = container.find(".assuntoPrincipalProcesso").first().text().trim().replace(/\s+/g, " ");
      const dataLocal = container.find(".dataLocalDistribuicaoProcesso").first().text().trim().replace(/\s+/g, " ");
      // Formato: "12/08/2025 - Unidade 14 - Núcleo 4.0..."
      const dataParts = dataLocal.split(" - ");
      data = dataParts[0]?.trim() || "";
      vara = dataParts.slice(1).join(" - ").trim();
    }

    const foro = foroMap.get(codigoProcesso) || "";

    processos.push({
      numeroProcesso: numero,
      classe,
      assunto,
      vara,
      foro,
      data,
      valor: "",
      tribunal: "TJSP",
      urlDetalhe: codigoProcesso
        ? `${TJSP_BASE}/cpopg/show.do?processo.codigo=${codigoProcesso}&processo.foro=${foroProcesso}`
        : "",
      codigoProcesso,
      foroProcesso,
    });
  });

  return processos;
}

// ─── Extrair detalhe do processo ──────────────────────────────────────────────
function extrairDetalheProcesso(html: string, urlDetalhe: string): ProcessoDetalhe {
  const $ = cheerio.load(html);

  // Função auxiliar para extrair texto por id
  const byId = (id: string) => $(`#${id}`).first().text().trim().replace(/\s+/g, " ");

  // Dados básicos - IDs reais do TJSP
  const numero = byId("numeroProcesso");
  const classe = byId("classeProcesso");
  const assunto = byId("assuntoProcesso");
  const vara = byId("varaProcesso");
  const juiz = byId("juizProcesso");
  const foro = byId("foroProcesso");
  const valor = byId("valorAcaoProcesso");
  const dataDistribuicao = byId("dataHoraDistribuicaoProcesso");
  const situacao = byId("situacaoProcesso");

  // Partes
  const partes: Parte[] = [];
  $("#tablePartesPrincipais tr").each((_, row) => {
    const tipoEl = $(row).find(".tipoDeParticipacao");
    const nomeEl = $(row).find(".nomeParteEAdvogado");
    if (!tipoEl.length || !nomeEl.length) return;

    const tipo = tipoEl.text().trim().replace(/\s+/g, " ").replace(/&nbsp;/g, "").trim();

    // O nomeParteEAdvogado contém nome + advogados
    const nomeTexto = nomeEl.text().replace(/\s+/g, " ").trim();

    // Separar nome da parte do advogado
    const advMatches = nomeTexto.match(/Advogado[:\s]+([^A-Z][^\n]+?)(?=\s*Advogado|$)/gi) || [];
    const advogados: string[] = advMatches.map(m => m.replace(/^Advogado[:\s]+/i, "").trim()).filter(Boolean);

    // Nome da parte é o primeiro texto antes de "Advogado"
    const nomeParte = nomeTexto.split(/\s*Advogado[:\s]/i)[0].trim();

    if (nomeParte && tipo) {
      partes.push({
        tipo,
        nome: nomeParte,
        advogado: advogados.join(", "),
        cpfCnpj: "",
      });
    }
  });

  // Movimentações
  const movimentacoes: Movimentacao[] = [];
  $("#tabelaTodasMovimentacoes tr.containerMovimentacao").each((_, row) => {
    const data = $(row).find(".dataMovimentacao").text().trim().replace(/\s+/g, " ");
    const descricao = $(row).find(".descricaoMovimentacao").text().trim().replace(/\s+/g, " ");
    if (data && descricao) {
      movimentacoes.push({ data, descricao, documentos: [] });
    }
  });

  // Documentos (links de documentos nas movimentações)
  const documentos: Documento[] = [];
  const docsVistos = new Set<string>();
  $("a.linkMovVincProc[href]").each((_, el) => {
    const link = $(el);
    const titulo = link.text().trim().replace(/\s+/g, " ");
    const href = link.attr("href") || "";
    if (titulo && !docsVistos.has(titulo)) {
      docsVistos.add(titulo);
      documentos.push({
        titulo,
        url: href.startsWith("http") ? href : `${TJSP_BASE}${href}`,
      });
    }
  });

  return {
    numeroProcesso: numero,
    classe,
    assunto,
    vara,
    juiz,
    foro,
    valor,
    dataDistribuicao,
    situacao,
    tribunal: "TJSP",
    urlDetalhe,
    partes,
    movimentacoes,
    documentos,
  };
}

// ─── API pública ──────────────────────────────────────────────────────────────
export async function buscarPorOAB(oab: string): Promise<ProcessoResumo[]> {
  const oabNum = oab.replace(/\D/g, "");
  const url = `${TJSP_BASE}/cpopg/search.do?conversationId=&cbPesquisa=NUMOAB&dadosConsulta.valorConsulta=${oabNum}&cdForo=-1`;
  const html = await fetchTJSP(url);
  return extrairListaProcessos(html);
}

export async function buscarPorCPFCNPJ(doc: string): Promise<ProcessoResumo[]> {
  const docNum = doc.replace(/\D/g, "");
  const url = `${TJSP_BASE}/cpopg/search.do?conversationId=&cbPesquisa=DOCPARTE&dadosConsulta.valorConsulta=${docNum}&cdForo=-1`;
  const html = await fetchTJSP(url);
  return extrairListaProcessos(html);
}

export async function buscarPorNumero(numero: string): Promise<ProcessoResumo[]> {
  const numLimpo = numero.replace(/[^\d.-]/g, "");
  const url = `${TJSP_BASE}/cpopg/search.do?conversationId=&cbPesquisa=NUMPROC&dadosConsulta.valorConsulta=${encodeURIComponent(numLimpo)}&cdForo=-1`;
  const html = await fetchTJSP(url);
  return extrairListaProcessos(html);
}

export async function obterDetalheProcesso(
  codigoProcesso: string,
  foroProcesso: string
): Promise<ProcessoDetalhe> {
  const url = `${TJSP_BASE}/cpopg/show.do?processo.codigo=${codigoProcesso}&processo.foro=${foroProcesso}`;
  const html = await fetchTJSP(url);
  return extrairDetalheProcesso(html, url);
}

// ─── Tipos ────────────────────────────────────────────────────────────────────
export interface ProcessoResumo {
  numeroProcesso: string;
  classe: string;
  assunto: string;
  vara: string;
  foro: string;
  data: string;
  valor: string;
  tribunal: string;
  urlDetalhe: string;
  codigoProcesso: string;
  foroProcesso: string;
}

export interface Parte {
  tipo: string;
  nome: string;
  advogado: string;
  cpfCnpj: string;
}

export interface Movimentacao {
  data: string;
  descricao: string;
  documentos: string[];
}

export interface Documento {
  titulo: string;
  url: string;
}

export interface ProcessoDetalhe {
  numeroProcesso: string;
  classe: string;
  assunto: string;
  vara: string;
  juiz: string;
  foro: string;
  valor: string;
  dataDistribuicao: string;
  situacao: string;
  tribunal: string;
  urlDetalhe: string;
  partes: Parte[];
  movimentacoes: Movimentacao[];
  documentos: Documento[];
}
