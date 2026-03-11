/**
 * whatsapp-bot.service.ts
 * Chatbot jurídico via WhatsApp — integração Z-API + TJSP
 * Funciona EXCLUSIVAMENTE no grupo autorizado
 *
 * Comandos rápidos:
 *   OAB 200287
 *   CPF 123.456.789-00
 *   CNPJ 12.345.678/0001-90
 *   PROCESSO 1234567-89.2023.8.26.0100
 *   NOME João da Silva
 *   ajuda / menu
 */

import { enviarTextoGrupo, enviarDocumentoGrupoUrl } from "./zapi.service";
import { execFile } from "child_process";
import { promisify } from "util";
import { writeFile, unlink } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
const execFileAsync = promisify(execFile);
import {
  buscarPorOAB,
  buscarPorCPFCNPJ,
  buscarPorNumero,
  buscarPorNome,
  obterDetalheProcesso,
  cookiesValidos,
  type ProcessoResumo,
  type ProcessoDetalhe,
} from "./tjsp-http.service";

// ─── Grupo autorizado ─────────────────────────────────────────────────
const GRUPO_AUTORIZADO = process.env.ZAPI_GRUPO_ID || "120363410236215446-group";

// ─── Controle de consulta em andamento ──────────────────────────────────
let consultaAtiva = false;
let consultaCancelada = false;

function iniciarConsulta(): boolean {
  if (consultaAtiva) return false;
  consultaAtiva = true;
  consultaCancelada = false;
  return true;
}

function cancelarConsulta(): void {
  consultaCancelada = true;
}

function finalizarConsulta(): void {
  consultaAtiva = false;
  consultaCancelada = false;
}

function foiCancelada(): boolean {
  return consultaCancelada;
}

// Estado das conversas
interface EstadoConversa {
  etapa: "menu" | "aguardando_busca";
  tipoBusca?: "oab" | "cpf" | "processo" | "nome";
  ultimaAtividade: number;
}
const conversas = new Map<string, EstadoConversa>();
setInterval(() => {
  const agora = Date.now();
  Array.from(conversas.entries()).forEach(([key, estado]) => {
    if (agora - estado.ultimaAtividade > 30 * 60 * 1000) conversas.delete(key);
  });
}, 5 * 60 * 1000);

// ─── Mensagens ────────────────────────────────────────────────────────────────
const MENU_AJUDA = `⚖️ *PAINEL JURÍDICO TJSP*
_Consulta Processual — Comandos Disponíveis_

*Comandos rápidos:*
• \`OAB 200287\`
• \`CPF 12345678900\`
• \`CNPJ 12345678000190\`
• \`PROCESSO 1234567-89.2023.8.26.0100\`
• \`NOME João da Silva\`

*Menu passo a passo:*
• \`1\` — Buscar por OAB
• \`2\` — Buscar por CPF / CNPJ
• \`3\` — Buscar por Nº do Processo
• \`4\` — Buscar por Nome

Digite *ajuda* a qualquer momento para ver este menu.`;

const MSG_SEM_COOKIES = `⚠️ *Sistema Temporariamente Indisponível*
A conexão com o TJSP está sendo renovada. Tente novamente em alguns minutos.`;

// ─── Interfaces da API de enriquecimento ─────────────────────────────────────
interface DadosCPF {
  status?: string;
  cpf?: string | number;
  nome?: string;
  nascimento?: string;       // formato DD/MM/AAAA
  dataNascimento?: string;   // alternativo
  rendaPresumida?: number;
  score?: { CSBA?: number; faixa_CSBA?: string };
  telefones?: {
    total?: number;
    itens?: Array<{
      ddd?: number;
      numero?: number;
      numero_completo?: string;
    }>;
  };
}

interface PessoaNome {
  nome?: string;
  cpf?: string | number;
  nascimento?: string;
  score?: unknown;
}

// ─── Helpers de enriquecimento ────────────────────────────────────────────────

/** Busca dados completos pelo CPF */
async function buscarPorCPF(cpf: string): Promise<DadosCPF | null> {
  try {
    const cpfLimpo = String(cpf).replace(/\D/g, "");
    if (cpfLimpo.length !== 11) return null;
    const url = `https://gwfhslsfukikfbyvysms.supabase.co/functions/v1/consulta-cpf?token=bdd5ba8bf04400a22677a47550437bd5&cpf=${cpfLimpo}`;
    const resp = await fetch(url, {
      headers: { "Accept": "application/json" },
      signal: AbortSignal.timeout(8000),
    });
    if (!resp.ok) return null;
    const data = await resp.json() as DadosCPF;
    if (data.status !== "OK" && !data.cpf) return null;
    return data;
  } catch {
    return null;
  }
}

/** Busca CPF pelo nome completo */
async function buscarCPFPorNome(nome: string): Promise<string | null> {
  try {
    const nomeLimpo = nome.trim().toUpperCase();
    const url = `https://gwfhslsfukikfbyvysms.supabase.co/functions/v1/consulta?token=bdd5ba8bf04400a22677a47550437bd5&name=${encodeURIComponent(nomeLimpo)}`;
    const resp = await fetch(url, {
      headers: { "Accept": "application/json" },
      signal: AbortSignal.timeout(8000),
    });
    if (!resp.ok) return null;
    const data = await resp.json() as { itens?: PessoaNome[] };
    const itens = data.itens || [];
    if (itens.length === 0) return null;
    // Pegar o primeiro resultado com CPF
    const pessoa = itens.find(p => p.cpf);
    return pessoa?.cpf ? String(pessoa.cpf).replace(/\D/g, "") : null;
  } catch {
    return null;
  }
}

/** Formata CPF: 50731688872 → 507.316.888-72 */
function formatarCPF(cpf: string | number): string {
  const d = String(cpf).replace(/\D/g, "");
  if (d.length === 11) return `${d.slice(0,3)}.${d.slice(3,6)}.${d.slice(6,9)}-${d.slice(9)}`;
  return String(cpf);
}

/** Calcula idade a partir de DD/MM/AAAA */
function calcularIdade(dataNasc: string): number | null {
  try {
    const partes = dataNasc.split("/");
    if (partes.length !== 3) return null;
    const [d, m, a] = partes.map(Number);
    const nasc = new Date(a, m - 1, d);
    const hoje = new Date();
    let idade = hoje.getFullYear() - nasc.getFullYear();
    if (hoje.getMonth() + 1 < m || (hoje.getMonth() + 1 === m && hoje.getDate() < d)) idade--;
    return idade;
  } catch {
    return null;
  }
}

/** Extrai telefones formatados da resposta da API */
function extrairTelefones(dados: DadosCPF): string {
  const itens = dados.telefones?.itens || [];
  if (itens.length === 0) return "N/D";
  return itens
    .map(t => t.numero_completo || (t.ddd && t.numero ? `${t.ddd}${t.numero}` : null))
    .filter(Boolean)
    .join(", ");
}

// ─── Formatação de processo ───────────────────────────────────────────────────

interface DadosProcessoFormatado {
  texto: string;
  dadosAlvara: {
    numeroProcesso: string;
    valorCausa: string;
    nomeReclamante: string;
    cpfReclamante: string;
    nomeAdvogado: string;
    nomeReu: string;
  };
}

async function formatarProcesso(
  processo: ProcessoResumo,
  detalhe: ProcessoDetalhe | null,
  index: number,
  total: number,
  oabConsultante?: string
): Promise<DadosProcessoFormatado> {
  const sep = "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━";
  const partes = detalhe?.partes || [];

  // Identificar polo ativo e passivo
  const poloAtivo = partes.find(p =>
    /reqte|requerente|exeqte|exequente|autor|impte|impetrante|apelante|reclamante|embargante/i.test(p.tipo)
  );
  const poloPassivo = partes.find(p =>
    /reqdo|requerido|executado|réu|reu|apelado|reclamado|embargado|impetrado/i.test(p.tipo)
  );

  // Enriquecer polo ativo: primeiro tenta pelo CPF, se não tiver busca pelo nome
  let dadosCPF: DadosCPF | null = null;
  let cpfEncontrado = "";

  if (poloAtivo) {
    // Tentar CPF direto (TJSP raramente fornece)
    if (poloAtivo.cpfCnpj && poloAtivo.cpfCnpj.replace(/\D/g, "").length === 11) {
      cpfEncontrado = poloAtivo.cpfCnpj.replace(/\D/g, "");
      dadosCPF = await buscarPorCPF(cpfEncontrado);
    }

    // Se não tem CPF, buscar pelo nome
    if (!dadosCPF && poloAtivo.nome && poloAtivo.nome.length > 3) {
      const cpfPorNome = await buscarCPFPorNome(poloAtivo.nome);
      if (cpfPorNome) {
        cpfEncontrado = cpfPorNome;
        dadosCPF = await buscarPorCPF(cpfPorNome);
      }
    }
  }

  const nome = dadosCPF?.nome || poloAtivo?.nome || "N/D";
  const cpfFormatado = cpfEncontrado ? formatarCPF(cpfEncontrado) : "N/D";
  const dataNasc = dadosCPF?.nascimento || dadosCPF?.dataNascimento || "";
  const idade = dataNasc ? calcularIdade(dataNasc) : null;
  const telefones = dadosCPF ? extrairTelefones(dadosCPF) : "N/D";
  const renda = dadosCPF?.rendaPresumida;
  const advogado = poloAtivo?.advogado || "";
  const nomeReu = poloPassivo?.nome || "N/D";

  let msg = `📌 *Processo ${index}/${total}*\n${sep}\n`;
  msg += `*PROCESSO:* \`${processo.numeroProcesso || "N/D"}\`\n\n`;

  // Dados enriquecidos do polo ativo
  msg += `👤 *Nome:* ${nome}\n`;
  msg += `💳 *CPF:* ${cpfFormatado}\n`;
  if (dataNasc) msg += `🎂 *Data Nascimento:* ${dataNasc}${idade ? ` (IDADE: ${idade})` : ""}\n`;
  if (renda) msg += `💰 *Renda Presumida:* ${renda}\n`;
  msg += `📞 *Telefones:* ${telefones}\n\n`;

  // Polo ativo
  const tipoAtivoLabel = poloAtivo?.tipo || "Requerente (Polo Ativo)";
  msg += `*${tipoAtivoLabel}:*\n`;
  msg += `👤 *Nome:* ${nome}\n`;
  if (cpfEncontrado) msg += `💳 *Doc.:* CPF: ${cpfFormatado}\n`;
  if (advogado) {
    msg += `⚖️ *Advogado:* ${advogado}\n`;
    if (oabConsultante) msg += `   *OAB:* ${oabConsultante}\n`;
  }
  msg += "\n";

  // Polo passivo
  if (poloPassivo) {
    const tipoPassivoLabel = poloPassivo.tipo || "Requerido (Polo Passivo)";
    msg += `*${tipoPassivoLabel}:*\n`;
    msg += `🏢 *Nome:* ${nomeReu}\n`;
    if (poloPassivo.cpfCnpj) msg += `💳 *Doc.:* ${formatarCPF(poloPassivo.cpfCnpj)}\n`;
    msg += "\n";
  }

  // Dados da ação
  msg += `*Dados da Ação:*\n`;
  const assunto = detalhe?.assunto || processo.assunto || "";
  const valor = detalhe?.valor || processo.valor || "N/D";
  const dataInicio = detalhe?.dataDistribuicao || processo.data || "";
  const classe = detalhe?.classe || processo.classe || "";
  const vara = detalhe?.vara || processo.vara || "";
  const tribunal = detalhe?.tribunal || processo.tribunal || "Tribunal de Justiça do Estado de São Paulo";

  if (assunto) msg += `⚖️ *Natureza:* ${assunto}\n`;
  msg += `💰 *Valor da Causa:* ${valor}\n`;
  if (dataInicio) msg += `🗓️ *Data de Início:* ${dataInicio}\n`;
  if (classe) msg += `📋 *Classe:* ${classe}\n`;
  msg += `🏛️ *Tribunal:* ${tribunal}\n`;
  if (vara) msg += `📍 *Órgão Julgador:* ${vara}\n`;

  const agora = new Date();
  const dataCaptura = agora.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
  msg += `📅 *Data de Captura:* ${dataCaptura}\n`;
  if (oabConsultante) msg += `📌 *OAB Consultante:* ${oabConsultante}\n`;

  return {
    texto: msg,
    dadosAlvara: {
      numeroProcesso: processo.numeroProcesso,
      valorCausa: valor,
      nomeReclamante: nome,
      cpfReclamante: cpfEncontrado,
      nomeAdvogado: advogado,
      nomeReu,
    },
  };
}

// ─── Gerar e enviar PDF do alvará ─────────────────────────────────────────────
async function gerarEEnviarAlvara(dadosAlvara: {
  numeroProcesso: string;
  valorCausa: string;
  nomeReclamante: string;
  cpfReclamante: string;
  nomeAdvogado: string;
  nomeReu: string;
}): Promise<void> {
  try {
    // Chamar o endpoint interno de geração de alvará
    const resp = await fetch("http://localhost:3000/api/alvara/gerar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        numeroProcesso: dadosAlvara.numeroProcesso,
        valorCausa: dadosAlvara.valorCausa,
        nomeReclamante: dadosAlvara.nomeReclamante,
        cpfReclamante: dadosAlvara.cpfReclamante,
        nomeAdvogado: dadosAlvara.nomeAdvogado,
        nomeReu: dadosAlvara.nomeReu,
        dataAtuacao: new Date().toLocaleDateString("pt-BR"),
      }),
      signal: AbortSignal.timeout(30000),
    });

    if (!resp.ok) {
      console.error("[BOT] Erro ao gerar alvará HTTP:", resp.status);
      return;
    }

    const contentType = resp.headers.get("content-type") || "";
    if (!contentType.includes("pdf")) {
      console.error("[BOT] Resposta do alvará não é PDF:", contentType);
      return;
    }

    const pdfBuffer = Buffer.from(await resp.arrayBuffer());
    const nomeArquivo = `alvara_${dadosAlvara.numeroProcesso.replace(/[^0-9]/g, "")}.pdf`;
    const caption = `📄 *Alvará — ${dadosAlvara.numeroProcesso}*`;

    // Salvar PDF em arquivo temp, fazer upload para CDN e enviar URL
    const tmpPath = join(tmpdir(), nomeArquivo);
    try {
      await writeFile(tmpPath, pdfBuffer);
      const { stdout } = await execFileAsync("manus-upload-file", [tmpPath], { timeout: 60000 });
      const urlMatch = stdout.match(/CDN URL:\s*(https:\/\/\S+)/);
      if (!urlMatch) {
        console.error("[BOT] Não foi possível obter URL do CDN:", stdout);
        return;
      }
      const urlPdf = urlMatch[1].trim();
      console.log("[BOT] PDF hospedado em:", urlPdf);

      const ok = await enviarDocumentoGrupoUrl(GRUPO_AUTORIZADO, urlPdf, nomeArquivo, caption);
      if (!ok) {
        console.error("[BOT] Falha ao enviar PDF do alvará:", dadosAlvara.numeroProcesso);
      } else {
        console.log("[BOT] Alvará enviado com sucesso:", dadosAlvara.numeroProcesso);
      }
    } finally {
      unlink(tmpPath).catch(() => {});
    }
  } catch (err) {
    console.error("[BOT] Erro ao gerar/enviar alvará:", err);
  }
}

// ─── Executar busca completa ──────────────────────────────────────────────────
async function executarBuscaCompleta(
  tipo: "oab" | "cpf" | "processo" | "nome",
  valor: string
): Promise<void> {
  if (!cookiesValidos()) {
    await enviarTextoGrupo(GRUPO_AUTORIZADO, MSG_SEM_COOKIES);
    return;
  }

  // Verificar se já há uma consulta em andamento
  if (!iniciarConsulta()) {
    await enviarTextoGrupo(GRUPO_AUTORIZADO,
      `⏳ *Consulta em andamento*\n\nAguarde a consulta atual terminar ou envie *PARAR* para cancelar.`
    );
    return;
  }

  try {
    let resultado: { processos: ProcessoResumo[]; totalEncontrados: number } = { processos: [], totalEncontrados: 0 };
    let oabConsultante: string | undefined;

    if (tipo === "oab") {
      resultado = await buscarPorOAB(valor) as typeof resultado;
      oabConsultante = `SP${valor.replace(/\D/g, "")}`;
    } else if (tipo === "cpf") {
      resultado = await buscarPorCPFCNPJ(valor) as typeof resultado;
    } else if (tipo === "processo") {
      resultado = await buscarPorNumero(valor) as typeof resultado;
    } else if (tipo === "nome") {
      resultado = await buscarPorNome(valor) as typeof resultado;
    }

    const processos = resultado.processos || [];
    const total = processos.length;

    if (total === 0) {
      await enviarTextoGrupo(GRUPO_AUTORIZADO,
        `❌ *Nenhum processo encontrado* para ${tipo.toUpperCase()} ${valor}.\n\nDigite *ajuda* para ver os comandos.`
      );
      finalizarConsulta();
      return;
    }

    await enviarTextoGrupo(GRUPO_AUTORIZADO,
      `📋 *${total} processo(s) encontrado(s)* para ${tipo.toUpperCase()} ${valor}\n\n_Carregando informações, aguarde..._\n\n_Envie *PARAR* a qualquer momento para interromper._`
    );

    // ── Processar em lotes paralelos de 5 para velocidade ──
    const LOTE = 5;
    let enviados = 0;
    for (let i = 0; i < processos.length; i += LOTE) {
      // Verificar cancelamento antes de cada lote
      if (foiCancelada()) {
        await enviarTextoGrupo(GRUPO_AUTORIZADO,
          `⏹️ *Consulta interrompida!*\n\n${enviados} de ${total} processo(s) enviado(s) até o momento.`
        );
        finalizarConsulta();
        return;
      }

      const lote = processos.slice(i, i + LOTE);

      // Buscar detalhes em paralelo para o lote
      const detalhes = await Promise.all(
        lote.map(async (p) => {
          try {
            if (p.codigoProcesso && p.foroProcesso) {
              return await obterDetalheProcesso(p.codigoProcesso, p.foroProcesso);
            }
          } catch { /* continua sem detalhe */ }
          return null;
        })
      );

      // Formatar cada processo do lote em paralelo
      const formatados = await Promise.all(
        lote.map((p, idx) => formatarProcesso(p, detalhes[idx], i + idx + 1, total, oabConsultante))
      );

      // Enviar texto + PDF de cada processo do lote sequencialmente
      for (const fmt of formatados) {
        if (foiCancelada()) break;
        await enviarTextoGrupo(GRUPO_AUTORIZADO, fmt.texto);
        await gerarEEnviarAlvara(fmt.dadosAlvara);
        enviados++;
        await new Promise(r => setTimeout(r, 800));
      }
    }

    if (!foiCancelada()) {
      await enviarTextoGrupo(GRUPO_AUTORIZADO,
        `✅ *Consulta concluída!*\n\n${total} processo(s) enviado(s) com dados completos e alvarás.\n\nDigite *ajuda* para nova consulta.`
      );
    }

  } catch (err) {
    console.error("[BOT] Erro na busca:", err);
    await enviarTextoGrupo(GRUPO_AUTORIZADO,
      `❌ *Erro ao consultar o TJSP*\n\nTente novamente ou contate o administrador.`
    );
  } finally {
    finalizarConsulta();
  }
}

// ─── Detecção de comandos rápidos ─────────────────────────────────────────────
interface ComandoRapido {
  tipo: "oab" | "cpf" | "processo" | "nome";
  valor: string;
}

function detectarComandoRapido(texto: string): ComandoRapido | null {
  const t = texto.trim();

  const matchOAB = t.match(/^oab\s+(.+)$/i);
  if (matchOAB) return { tipo: "oab", valor: matchOAB[1].trim() };

  const matchCPF = t.match(/^cpf\s+(.+)$/i);
  if (matchCPF) return { tipo: "cpf", valor: matchCPF[1].trim() };

  const matchCNPJ = t.match(/^cnpj\s+(.+)$/i);
  if (matchCNPJ) return { tipo: "cpf", valor: matchCNPJ[1].trim() };

  const matchProcesso = t.match(/^processo\s+(.+)$/i);
  if (matchProcesso) return { tipo: "processo", valor: matchProcesso[1].trim() };

  const matchNome = t.match(/^nome\s+(.+)$/i);
  if (matchNome) return { tipo: "nome", valor: matchNome[1].trim() };

  // Detecção automática de número de processo CNJ
  if (/^\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}$/.test(t)) {
    return { tipo: "processo", valor: t };
  }

  // Detecção automática de CPF (11 dígitos) ou CNPJ (14 dígitos)
  const digits = t.replace(/\D/g, "");
  if (digits.length === 11) return { tipo: "cpf", valor: t };
  if (digits.length === 14) return { tipo: "cpf", valor: t };

  return null;
}

// ─── Processador principal de mensagens ──────────────────────────────────────
export async function processarMensagem(
  phone: string,
  texto: string,
  grupoId?: string,
  _remetente?: string
): Promise<void> {

  // BLOQUEIO: ignorar mensagens fora do grupo autorizado
  if (!grupoId || grupoId !== GRUPO_AUTORIZADO) {
    console.log(`[BOT] Mensagem ignorada — fora do grupo autorizado. grupoId: ${grupoId || "privado"}`);
    return;
  }

  const msg = texto.trim();
  const msgLower = msg.toLowerCase();

  // ── Comando PARAR ──
  if (["parar", "stop", "cancelar", "pare", "/parar", "/stop"].includes(msgLower)) {
    if (consultaAtiva) {
      cancelarConsulta();
      await enviarTextoGrupo(GRUPO_AUTORIZADO,
        `⏹️ *Cancelando consulta...*\n\nA consulta em andamento será interrompida após o processo atual.`
      );
    } else {
      await enviarTextoGrupo(GRUPO_AUTORIZADO,
        `ℹ️ *Nenhuma consulta em andamento.*\n\nDigite *ajuda* para ver os comandos disponíveis.`
      );
    }
    return;
  }

  // ── Comandos de ajuda/menu ──
  if (["menu", "ajuda", "help", "/menu", "/ajuda", "oi", "olá", "ola", "start"].includes(msgLower)) {
    conversas.delete(phone);
    await enviarTextoGrupo(GRUPO_AUTORIZADO, MENU_AJUDA);
    return;
  }

  // ── Verificar se é um comando rápido ──
  const comandoRapido = detectarComandoRapido(msg);
  if (comandoRapido) {
    conversas.delete(phone);
    // executarBuscaCompleta já envia a mensagem de "encontrado(s)" com o aviso de PARAR
    await executarBuscaCompleta(comandoRapido.tipo, comandoRapido.valor);
    return;
  }

  // ── Fluxo de menu (passo a passo) ──
  const estado = conversas.get(phone) || { etapa: "menu" as const, ultimaAtividade: Date.now() };
  estado.ultimaAtividade = Date.now();

  if (estado.etapa === "menu") {
    const opcoes: Record<string, { tipo: "oab" | "cpf" | "processo" | "nome"; label: string; exemplo: string }> = {
      "1": { tipo: "oab",      label: "OAB",         exemplo: "Ex: *200287* ou *SP200.287*" },
      "2": { tipo: "cpf",      label: "CPF / CNPJ",  exemplo: "Ex: *123.456.789-00*" },
      "3": { tipo: "processo", label: "Nº Processo", exemplo: "Ex: *1234567-89.2023.8.26.0100*" },
      "4": { tipo: "nome",     label: "Nome",        exemplo: "Ex: *João da Silva*" },
    };

    const opcao = opcoes[msgLower];
    if (opcao) {
      conversas.set(phone, { etapa: "aguardando_busca", tipoBusca: opcao.tipo, ultimaAtividade: Date.now() });
      await enviarTextoGrupo(GRUPO_AUTORIZADO,
        `🔍 *Busca por ${opcao.label}*\n\nDigite o valor:\n${opcao.exemplo}\n\n_Ou use o comando rápido: \`${opcao.tipo.toUpperCase()} valor\`_`
      );
    } else {
      await enviarTextoGrupo(GRUPO_AUTORIZADO, MENU_AJUDA);
    }
    return;
  }

  // ── Aguardando valor de busca ──
  if (estado.etapa === "aguardando_busca" && estado.tipoBusca) {
    const tipo = estado.tipoBusca;
    await enviarTextoGrupo(GRUPO_AUTORIZADO,
      `⏳ *Buscando no TJSP...*\n\nAguarde, estamos carregando os processos com dados completos e gerando os alvarás.`
    );
    await executarBuscaCompleta(tipo, msg);
    conversas.set(phone, { etapa: "menu", ultimaAtividade: Date.now() });
    return;
  }

  // Fallback
  conversas.set(phone, { etapa: "menu", ultimaAtividade: Date.now() });
  await enviarTextoGrupo(GRUPO_AUTORIZADO, MENU_AJUDA);
}
