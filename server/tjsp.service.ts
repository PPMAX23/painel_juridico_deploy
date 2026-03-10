/**
 * Serviço de integração direta com o TJSP (esaj.tjsp.jus.br)
 * Faz scraping autenticado do portal e-SAJ para buscar processos
 */

import { load } from "cheerio";

const TJSP_BASE = "https://esaj.tjsp.jus.br";

// ─── Inicialização automática dos cookies TJSP via script Python ────────────────
import { execSync } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

export function inicializarCookiesTJSP() {
  try {
    // Resolver o caminho do script Python relativo ao diretório do servidor
    const scriptPath = path.resolve(process.cwd(), "server", "tjsp-cookie-extractor.py");
    const result = execSync(`/usr/bin/python3 ${scriptPath} --print-only`, {
      encoding: "utf-8",
      timeout: 10000,
    });
    const match = result.match(/COOKIES: (.+)/);
    if (match) {
      const cookies = match[1].trim();
      setTjspCookies(cookies);
      console.log("[TJSP] Cookies inicializados automaticamente do Chromium");
    }
  } catch (e: any) {
    console.warn("[TJSP] Não foi possível inicializar cookies automaticamente:", e.message);
  }
}

// ─── Gerenciamento de sessão TJSP ─────────────────────────────────────────────
let tjspCookies: string = "";
let tjspCookieExpiry: Date | null = null;

export function setTjspCookies(cookies: string) {
  tjspCookies = cookies;
  // Sessão TJSP dura ~2 horas
  tjspCookieExpiry = new Date(Date.now() + 2 * 60 * 60 * 1000);
  console.log("[TJSP] Cookies de sessão atualizados");
}

export function getTjspStatus() {
  const agora = new Date();
  const valido = tjspCookies.length > 0 && tjspCookieExpiry !== null && tjspCookieExpiry > agora;
  return {
    autenticado: valido,
    expiracao: tjspCookieExpiry?.toISOString() || null,
    temCookies: tjspCookies.length > 0,
  };
}

// ─── Função auxiliar para requisições ao TJSP ────────────────────────────────
async function fetchTJSP(url: string, options: RequestInit = {}): Promise<globalThis.Response> {
  return fetch(url, {
    ...options,
    headers: {
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Cookie": tjspCookies,
      ...(options.headers || {}),
    },
    signal: AbortSignal.timeout(30000),
  });
}

// ─── Parsear lista de processos do HTML do TJSP ───────────────────────────────
function parsearListaProcessos(html: string): any[] {
  const $ = load(html);
  const processos: any[] = [];

  // Cada processo está em uma linha da tabela ou div
  $("tr.fundocinza1, tr.fundocinza2, .resultTable tr").each((_, el) => {
    const linha = $(el);
    const linkProcesso = linha.find("a[href*='show.do']");
    if (!linkProcesso.length) return;

    const href = linkProcesso.attr("href") || "";
    const numeroProcesso = linkProcesso.text().trim();
    
    // Extrair código do processo da URL
    const codigoMatch = href.match(/processo\.codigo=([^&]+)/);
    const foroMatch = href.match(/processo\.foro=([^&]+)/);
    const codigo = codigoMatch ? codigoMatch[1] : "";
    const foro = foroMatch ? foroMatch[1] : "";

    const celulas = linha.find("td");
    const classe = $(celulas[1]).text().trim() || "";
    const assunto = $(celulas[2]).text().trim() || "";
    const fotoForo = $(celulas[3]).text().trim() || "";
    const vara = $(celulas[4]).text().trim() || "";
    const juiz = $(celulas[5]).text().trim() || "";
    const dataHora = $(celulas[6]).text().trim() || "";

    if (numeroProcesso) {
      processos.push({
        numeroProcesso,
        codigo,
        foro,
        classe,
        assunto,
        fotoForo,
        vara,
        juiz,
        dataHora,
        urlDetalhe: href ? `${TJSP_BASE}${href}` : "",
        tribunal: "TJSP",
      });
    }
  });

  // Formato alternativo — divs com classe de processo
  if (processos.length === 0) {
    $(".unj-entity-header__process-code, a[href*='cpopg/show.do']").each((_, el) => {
      const link = $(el);
      const href = link.attr("href") || "";
      const numero = link.text().trim();
      
      if (numero && href.includes("show.do")) {
        const codigoMatch = href.match(/processo\.codigo=([^&]+)/);
        const foroMatch = href.match(/processo\.foro=([^&]+)/);
        
        // Tentar pegar informações do contexto
        const container = link.closest("tr, .processo-item, li");
        const textoContainer = container.text();
        
        processos.push({
          numeroProcesso: numero,
          codigo: codigoMatch ? codigoMatch[1] : "",
          foro: foroMatch ? foroMatch[1] : "",
          classe: "",
          assunto: "",
          vara: "",
          juiz: "",
          dataHora: "",
          urlDetalhe: href.startsWith("http") ? href : `${TJSP_BASE}${href}`,
          tribunal: "TJSP",
          textoContexto: textoContainer.substring(0, 200),
        });
      }
    });
  }

  return processos;
}

// ─── Parsear HTML do TJSP para extrair processos da lista ─────────────────────
function parsearResultadosBusca(html: string): { processos: any[]; total: number; paginas: number } {
  const $ = load(html);
  
  const processos: any[] = [];
  
  // Verificar total de processos
  const textoTotal = $("body").text();
  const totalMatch = textoTotal.match(/(\d+)\s*[Pp]rocessos?\s*encontrados?/);
  const total = totalMatch ? parseInt(totalMatch[1]) : 0;

  // Paginação
  const ultimaPagina = $("a[title='Última página']").attr("href") || "";
  const paginaMatch = ultimaPagina.match(/paginaConsulta=(\d+)/);
  const paginas = paginaMatch ? parseInt(paginaMatch[1]) : 1;

  // Extrair processos — cada processo é um bloco com número clicável
  $("a[href*='cpopg/show.do'], a[href*='cposg/show.do']").each((_, el) => {
    const link = $(el);
    const href = link.attr("href") || "";
    const numero = link.text().trim();
    
    if (!numero || !numero.match(/\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}/)) return;
    
    const codigoMatch = href.match(/processo\.codigo=([^&]+)/);
    const foroMatch = href.match(/processo\.foro=([^&]+)/);
    
    // Pegar o container pai para extrair mais informações
    const row = link.closest("tr");
    const cells = row.find("td");
    
    // Extrair advogado, classe, assunto da linha
    let advogado = "";
    let classe = "";
    let assunto = "";
    let vara = "";
    let dataRecebimento = "";
    
    cells.each((i, cell) => {
      const texto = $(cell).text().trim();
      if (texto.includes("Advogado") || texto.includes("advogado")) {
        advogado = texto.replace(/Advogado\(a\):\s*/i, "").trim();
      }
    });
    
    // Tentar extrair do bloco completo
    const blocoTexto = row.text();
    const classeMatch = blocoTexto.match(/(?:Classe|Procedimento)[:\s]+([^\n]+)/i);
    if (classeMatch) classe = classeMatch[1].trim();
    
    processos.push({
      numeroProcesso: numero,
      codigo: codigoMatch ? codigoMatch[1] : "",
      foro: foroMatch ? foroMatch[1] : "",
      advogado,
      classe,
      assunto,
      vara,
      dataRecebimento,
      urlDetalhe: href.startsWith("http") ? href : `${TJSP_BASE}${href}`,
      tribunal: "TJSP",
    });
  });

  return { processos, total, paginas };
}

// ─── Parsear detalhes de um processo ─────────────────────────────────────────
function parsearDetalheProcesso(html: string): any {
  const $ = load(html);
  
  // Número do processo
  const numeroProcesso = $(".unj-entity-header__process-code, #numeroProcesso, h2").first().text().trim()
    || $("span:contains('Processo')").next().text().trim();
  
  // Dados básicos
  const classe = $("span:contains('Classe:')").next().text().trim()
    || $("div.unj-label:contains('Classe')").next().text().trim()
    || $("td:contains('Classe')").next("td").text().trim();
  
  const assunto = $("span:contains('Assunto:')").next().text().trim()
    || $("div.unj-label:contains('Assunto')").next().text().trim()
    || $("td:contains('Assunto')").next("td").text().trim();
  
  const foro = $("span:contains('Foro:')").next().text().trim()
    || $("td:contains('Foro')").next("td").text().trim();
  
  const vara = $("span:contains('Vara:')").next().text().trim()
    || $("td:contains('Vara')").next("td").text().trim();
  
  const juiz = $("span:contains('Juiz:')").next().text().trim()
    || $("span:contains('Magistrado:')").next().text().trim()
    || $("td:contains('Juiz')").next("td").text().trim();
  
  const valor = $("span:contains('Valor da ação:')").next().text().trim()
    || $("td:contains('Valor da ação')").next("td").text().trim()
    || $("td:contains('Valor')").next("td").text().trim();
  
  const dataDistribuicao = $("span:contains('Data de distribuição:')").next().text().trim()
    || $("td:contains('Distribuição')").next("td").text().trim();
  
  // Partes do processo
  const partes: any[] = [];
  
  // Polo ativo
  $("table:contains('Polo Ativo'), div:contains('Polo Ativo')").find("tr").each((_, el) => {
    const nome = $(el).find("td").first().text().trim();
    const advogado = $(el).find("td:contains('Advogado')").text().replace("Advogado:", "").trim();
    if (nome && !nome.includes("Polo")) {
      partes.push({ polo: "ATIVO", nome, advogado });
    }
  });
  
  // Polo passivo
  $("table:contains('Polo Passivo'), div:contains('Polo Passivo')").find("tr").each((_, el) => {
    const nome = $(el).find("td").first().text().trim();
    const advogado = $(el).find("td:contains('Advogado')").text().replace("Advogado:", "").trim();
    if (nome && !nome.includes("Polo")) {
      partes.push({ polo: "PASSIVO", nome, advogado });
    }
  });

  // Partes via tabela geral
  if (partes.length === 0) {
    $("table#tablePartesPrincipais tr, #tableTodasPartes tr").each((_, el) => {
      const cells = $(el).find("td");
      if (cells.length >= 2) {
        const tipo = $(cells[0]).text().trim();
        const nome = $(cells[1]).text().trim();
        if (nome && tipo) {
          const polo = tipo.toLowerCase().includes("exequ") || tipo.toLowerCase().includes("autor") || tipo.toLowerCase().includes("requerente") ? "ATIVO" : "PASSIVO";
          partes.push({ polo, tipo, nome });
        }
      }
    });
  }
  
  // Movimentações
  const movimentacoes: any[] = [];
  $("table#tabelaTodasMovimentacoes tr, tr.containerMovimentacao").each((_, el) => {
    const cells = $(el).find("td");
    if (cells.length >= 2) {
      const data = $(cells[0]).text().trim();
      const descricao = $(cells[1]).text().trim();
      if (data && descricao && data.match(/\d{2}\/\d{2}\/\d{4}/)) {
        movimentacoes.push({ data, descricao });
      }
    }
  });
  
  return {
    numeroProcesso: numeroProcesso || "",
    classe: classe || "",
    assunto: assunto || "",
    foro: foro || "",
    vara: vara || "",
    juiz: juiz || "",
    valor: valor || "",
    dataDistribuicao: dataDistribuicao || "",
    partes,
    movimentacoes: movimentacoes.slice(0, 20),
    tribunal: "TJSP",
    grau: "1º Grau",
  };
}

// ─── Buscar processos por OAB no TJSP ────────────────────────────────────────
export async function buscarPorOAB(numeroOAB: string, pagina: number = 1): Promise<any> {
  // Normalizar número OAB (remover pontos e letras)
  const numLimpo = numeroOAB.replace(/[^\d]/g, "");
  
  const url = `${TJSP_BASE}/cpopg/search.do?conversationId=&cbPesquisa=NUMOAB&dadosConsulta.valorConsulta=${numLimpo}&cdForo=-1&paginaConsulta=${pagina}`;
  
  console.log(`[TJSP] Buscando OAB ${numLimpo} - página ${pagina}`);
  
  const response = await fetchTJSP(url);
  
  if (!response.ok) {
    throw new Error(`TJSP retornou status ${response.status}`);
  }
  
  const html = await response.text();
  
  // Verificar se foi redirecionado para login
  if (html.includes("sajcas/login") || html.includes("Identificar-se")) {
    throw new Error("TJSP_SESSAO_EXPIRADA");
  }
  
  const resultado = parsearResultadosBusca(html);
  
  return {
    ...resultado,
    paginaAtual: pagina,
    oab: numeroOAB,
    fonte: "TJSP_1GRAU",
  };
}

// ─── Buscar processos por número ──────────────────────────────────────────────
export async function buscarPorNumero(numeroProcesso: string): Promise<any> {
  // Formato: NNNNNNN-DD.AAAA.J.TR.OOOO
  const partes = numeroProcesso.replace(/\D/g, "");
  
  // Tentar 1º grau primeiro
  const url = `${TJSP_BASE}/cpopg/search.do?conversationId=&cbPesquisa=NUMPROC&dadosConsulta.valorConsulta=${encodeURIComponent(numeroProcesso)}&cdForo=-1`;
  
  console.log(`[TJSP] Buscando processo ${numeroProcesso}`);
  
  const response = await fetchTJSP(url);
  const html = await response.text();
  
  if (html.includes("sajcas/login")) {
    throw new Error("TJSP_SESSAO_EXPIRADA");
  }
  
  // Se redirecionou para show.do, é um processo único
  if (response.url.includes("show.do")) {
    const detalhe = parsearDetalheProcesso(html);
    return { processos: [detalhe], total: 1, paginas: 1, fonte: "TJSP_1GRAU" };
  }
  
  const resultado = parsearResultadosBusca(html);
  return { ...resultado, fonte: "TJSP_1GRAU" };
}

// ─── Buscar detalhes de um processo específico ────────────────────────────────
export async function buscarDetalheProcesso(codigo: string, foro: string, numeroOAB?: string): Promise<any> {
  const params = new URLSearchParams({
    "processo.codigo": codigo,
    "processo.foro": foro,
    "conversationId": "",
    "cbPesquisa": "NUMOAB",
    "dadosConsulta.valorConsulta": numeroOAB || "",
    "cdForo": "-1",
    "paginaConsulta": "1",
  });
  
  const url = `${TJSP_BASE}/cpopg/show.do?${params.toString()}`;
  
  console.log(`[TJSP] Buscando detalhe do processo ${codigo}`);
  
  const response = await fetchTJSP(url);
  const html = await response.text();
  
  if (html.includes("sajcas/login")) {
    throw new Error("TJSP_SESSAO_EXPIRADA");
  }
  
  return parsearDetalheProcesso(html);
}

// ─── Buscar processos por CPF/CNPJ ───────────────────────────────────────────
export async function buscarPorDocumento(documento: string, pagina: number = 1): Promise<any> {
  const docLimpo = documento.replace(/[^\d]/g, "");
  const tipoBusca = docLimpo.length === 11 ? "DOCPARTE" : "DOCPARTE";
  
  const url = `${TJSP_BASE}/cpopg/search.do?conversationId=&cbPesquisa=${tipoBusca}&dadosConsulta.valorConsulta=${docLimpo}&cdForo=-1&paginaConsulta=${pagina}`;
  
  console.log(`[TJSP] Buscando documento ${docLimpo} - página ${pagina}`);
  
  const response = await fetchTJSP(url);
  const html = await response.text();
  
  if (html.includes("sajcas/login")) {
    throw new Error("TJSP_SESSAO_EXPIRADA");
  }
  
  const resultado = parsearResultadosBusca(html);
  return { ...resultado, documento, fonte: "TJSP_1GRAU" };
}

// ─── Fazer login no TJSP e capturar cookies ───────────────────────────────────
export async function fazerLoginTJSP(cpf: string, senha: string, codigoVerificacao?: string): Promise<string> {
  // Passo 1: Obter a página de login para pegar o cookie de sessão inicial
  const loginPageResp = await fetch(`${TJSP_BASE}/sajcas/login`, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    },
  });
  
  const setCookieHeader = loginPageResp.headers.get("set-cookie") || "";
  const sessionCookie = setCookieHeader.split(";")[0];
  
  // Passo 2: Submeter credenciais
  const loginBody = new URLSearchParams({
    "username": cpf.replace(/[^\d]/g, ""),
    "password": senha,
    "lt": "",
    "execution": "e1s1",
    "_eventId": "submit",
  });
  
  const loginResp = await fetch(`${TJSP_BASE}/sajcas/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "Cookie": sessionCookie,
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    },
    body: loginBody.toString(),
    redirect: "manual",
  });
  
  const cookies = loginResp.headers.get("set-cookie") || "";
  
  if (cookies) {
    setTjspCookies(cookies);
    return cookies;
  }
  
  throw new Error("Falha ao fazer login no TJSP");
}
