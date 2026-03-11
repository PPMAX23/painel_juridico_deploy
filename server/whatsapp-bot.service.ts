/**
 * whatsapp-bot.service.ts
 * Chatbot jurídico via WhatsApp — integração Z-API + TJSP
 * Funciona EXCLUSIVAMENTE no grupo autorizado "Painel Puxada Adv"
 *
 * Comandos rápidos (sem menu):
 *   OAB 200287
 *   CPF 123.456.789-00
 *   CNPJ 12.345.678/0001-90
 *   PROCESSO 1234567-89.2023.8.26.0100
 *   NOME João da Silva
 *
 * Comandos de navegação:
 *   menu / ajuda / help
 */

import { enviarTextoGrupo, enviarDocumentoGrupo } from "./zapi.service";
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
import { gerarAlvaraPDF } from "./alvara.service";

// ─── Grupo autorizado ─────────────────────────────────────────────────────────
const GRUPO_AUTORIZADO = process.env.ZAPI_GRUPO_ID || "120363410236215446-group";

// ─── Estado das conversas ────────────────────────────────────────────────────
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

*Comandos rápidos (use diretamente):*
• \`OAB 200287\` — busca por OAB
• \`CPF 12345678900\` — busca por CPF
• \`CNPJ 12345678000190\` — busca por CNPJ
• \`PROCESSO 1234567-89.2023.8.26.0100\` — busca por nº do processo
• \`NOME João da Silva\` — busca por nome

*Comandos de menu (passo a passo):*
• \`1\` — Buscar por OAB
• \`2\` — Buscar por CPF / CNPJ
• \`3\` — Buscar por Nº do Processo
• \`4\` — Buscar por Nome

Digite *ajuda* a qualquer momento para ver este menu.`;

const MSG_SEM_COOKIES = `⚠️ *Sistema Temporariamente Indisponível*

A conexão com o TJSP está sendo renovada.
Tente novamente em alguns minutos.`;

// ─── Enriquecimento de CPF ────────────────────────────────────────────────────
interface DadosCPF {
  nome?: string;
  cpf?: string;
  dataNascimento?: string;
  idade?: number;
  rendaPresumida?: number;
  telefones?: { itens?: Array<{ numero_completo?: string }> };
}

async function enriquecerCPF(cpf: string): Promise<DadosCPF | null> {
  try {
    const cpfLimpo = cpf.replace(/\D/g, "");
    if (cpfLimpo.length !== 11) return null;
    const url = `https://gwfhslsfukikfbyvysms.supabase.co/functions/v1/consulta-cpf?token=bdd5ba8bf04400a22677a47550437bd5&cpf=${cpfLimpo}`;
    const resp = await fetch(url, { headers: { "Accept": "application/json" } });
    if (!resp.ok) return null;
    return await resp.json() as DadosCPF;
  } catch {
    return null;
  }
}

function calcularIdade(dataNasc: string): number | null {
  try {
    // Formato: DD/MM/AAAA
    const [d, m, a] = dataNasc.split("/").map(Number);
    const nasc = new Date(a, m - 1, d);
    const hoje = new Date();
    let idade = hoje.getFullYear() - nasc.getFullYear();
    const mesAtual = hoje.getMonth() + 1;
    if (mesAtual < m || (mesAtual === m && hoje.getDate() < d)) idade--;
    return idade;
  } catch {
    return null;
  }
}

function formatarCPF(cpf: string): string {
  const d = cpf.replace(/\D/g, "");
  if (d.length === 11) return `${d.slice(0,3)}.${d.slice(3,6)}.${d.slice(6,9)}-${d.slice(9)}`;
  return cpf;
}

// ─── Formatação de processo detalhado ─────────────────────────────────────────
async function formatarProcessoDetalhado(
  processo: ProcessoResumo,
  index: number,
  total: number,
  oabConsultante?: string
): Promise<string> {
  // Buscar detalhes completos do processo
  let detalhe: ProcessoDetalhe | null = null;
  try {
    if (processo.codigoProcesso && processo.foroProcesso) {
      detalhe = await obterDetalheProcesso(processo.codigoProcesso, processo.foroProcesso);
    }
  } catch {
    // continua sem detalhe
  }

  const sep = "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━";

  let msg = `📌 *Processo ${index}/${total}*\n${sep}\n`;
  msg += `*PROCESSO:* \`${processo.numeroProcesso || "N/D"}\`\n\n`;

  // Partes do processo
  const partes = detalhe?.partes || [];
  const poloAtivo = partes.filter(p =>
    /reqte|requerente|exeqte|exequente|autor|impte|impetrante|apelante|reclamante|embargante/i.test(p.tipo)
  );
  const poloPassivo = partes.filter(p =>
    /reqdo|requerido|executado|réu|reu|apelado|reclamado|embargado|impetrado/i.test(p.tipo)
  );

  // Enriquecer polo ativo (primeiro)
  if (poloAtivo.length > 0) {
    const parte = poloAtivo[0];
    let dadosCPF: DadosCPF | null = null;
    if (parte.cpfCnpj) {
      dadosCPF = await enriquecerCPF(parte.cpfCnpj);
    }

    const nome = dadosCPF?.nome || parte.nome || "N/D";
    const cpfFormatado = parte.cpfCnpj ? formatarCPF(parte.cpfCnpj) : "N/D";
    const dataNasc = dadosCPF?.dataNascimento || "";
    const idade = dataNasc ? calcularIdade(dataNasc) : null;
    const renda = dadosCPF?.rendaPresumida;
    const telefones = dadosCPF?.telefones?.itens
      ?.map(t => t.numero_completo)
      .filter(Boolean)
      .join(", ") || "N/D";

    msg += `👤 *Nome:* ${nome}\n`;
    msg += `💳 *CPF:* ${cpfFormatado}\n`;
    if (dataNasc) {
      msg += `🎂 *Data Nascimento:* ${dataNasc}${idade ? ` (IDADE: ${idade})` : ""}\n`;
    }
    if (renda) msg += `💰 *Renda Presumida:* ${renda}\n`;
    msg += `📞 *Telefones:* ${telefones}\n\n`;

    // Polo ativo
    const tipoLabel = parte.tipo || "Requerente (Polo Ativo)";
    msg += `*${tipoLabel}:*\n`;
    msg += `👤 *Nome:* ${nome}\n`;
    if (parte.cpfCnpj) msg += `💳 *Doc.:* ${cpfFormatado}\n`;
    if (parte.advogado) msg += `⚖️ *Advogado:* ${parte.advogado}\n`;
    if (oabConsultante) msg += `   *OAB:* ${oabConsultante}\n`;
    msg += "\n";
  }

  // Polo passivo
  if (poloPassivo.length > 0) {
    const parte = poloPassivo[0];
    const tipoLabel = parte.tipo || "Requerido (Polo Passivo)";
    msg += `*${tipoLabel}:*\n`;
    msg += `🏢 *Nome:* ${parte.nome || "N/D"}\n`;
    if (parte.cpfCnpj) msg += `💳 *Doc.:* ${formatarCPF(parte.cpfCnpj)}\n`;
    msg += "\n";
  }

  // Dados da ação
  msg += `*Dados da Ação:*\n`;
  if (detalhe?.assunto || processo.assunto) msg += `⚖️ *Natureza:* ${detalhe?.assunto || processo.assunto}\n`;
  if (detalhe?.valor || processo.valor) msg += `💰 *Valor da Causa:* ${detalhe?.valor || processo.valor}\n`;
  if (detalhe?.dataDistribuicao || processo.data) msg += `🗓️ *Data de Início:* ${detalhe?.dataDistribuicao || processo.data}\n`;
  if (detalhe?.classe || processo.classe) msg += `📋 *Classe:* ${detalhe?.classe || processo.classe}\n`;
  if (detalhe?.tribunal || processo.tribunal) msg += `🏛️ *Tribunal:* ${detalhe?.tribunal || processo.tribunal || "Tribunal de Justiça do Estado de São Paulo"}\n`;
  if (detalhe?.vara || processo.vara) msg += `📍 *Órgão Julgador:* ${detalhe?.vara || processo.vara}\n`;

  const agora = new Date();
  const dataCaptura = agora.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
  msg += `📅 *Data de Captura:* ${dataCaptura}\n`;

  if (oabConsultante) msg += `📌 *OAB Consultante:* ${oabConsultante}\n`;

  return msg;
}

// ─── Gerar e enviar PDF do alvará ─────────────────────────────────────────────
async function enviarAlvaraProcesso(processo: ProcessoResumo, detalhePartes: ProcessoDetalhe | null): Promise<void> {
  try {
    const partes = detalhePartes?.partes || [];
    const poloAtivo = partes.find(p =>
      /reqte|requerente|exeqte|exequente|autor|impte|impetrante|apelante|reclamante|embargante/i.test(p.tipo)
    );
    const poloPassivo = partes.find(p =>
      /reqdo|requerido|executado|réu|reu|apelado|reclamado|embargado|impetrado/i.test(p.tipo)
    );

    const pdfBuffer = await gerarAlvaraPDF({
      numeroProcesso: processo.numeroProcesso,
      valorCausa: detalhePartes?.valor || processo.valor || "N/D",
      nomeReclamante: poloAtivo?.nome || "N/D",
      cpfReclamante: poloAtivo?.cpfCnpj || "",
      nomeAdvogado: poloAtivo?.advogado || "",
      nomeReu: poloPassivo?.nome || "N/D",
      dataAtuacao: new Date().toLocaleDateString("pt-BR"),
    });

    // Converter buffer para base64
    const base64 = pdfBuffer.toString("base64");
    const nomeArquivo = `alvara_${processo.numeroProcesso.replace(/[^0-9]/g, "")}.pdf`;

    await enviarDocumentoGrupo(GRUPO_AUTORIZADO, base64, nomeArquivo, `📄 Alvará — ${processo.numeroProcesso}`);
  } catch (err) {
    console.error("[BOT] Erro ao gerar alvará:", err);
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
      await enviarTextoGrupo(GRUPO_AUTORIZADO, `❌ *Nenhum processo encontrado* para esta consulta.\n\nDigite *ajuda* para ver os comandos.`);
      return;
    }

    // Aviso inicial com total
    await enviarTextoGrupo(GRUPO_AUTORIZADO,
      `📋 *${total} processo(s) encontrado(s)* para ${tipo.toUpperCase()} ${valor}\n\n_Enviando todos os processos com detalhes e alvarás..._`
    );

    // Enviar TODOS os processos sem limite
    for (let i = 0; i < processos.length; i++) {
      const p = processos[i];

      // Buscar detalhes para o alvará
      let detalhe: ProcessoDetalhe | null = null;
      try {
        if (p.codigoProcesso && p.foroProcesso) {
          detalhe = await obterDetalheProcesso(p.codigoProcesso, p.foroProcesso);
        }
      } catch { /* continua */ }

      // Formatar e enviar texto do processo
      const msgProcesso = await formatarProcessoDetalhado(p, i + 1, total, oabConsultante);
      await enviarTextoGrupo(GRUPO_AUTORIZADO, msgProcesso);

      // Enviar PDF do alvará
      await enviarAlvaraProcesso(p, detalhe);

      // Pequena pausa para não sobrecarregar a Z-API
      if (i < processos.length - 1) {
        await new Promise(r => setTimeout(r, 1500));
      }
    }

    // Mensagem final
    await enviarTextoGrupo(GRUPO_AUTORIZADO,
      `✅ *Consulta concluída!*\n\n${total} processo(s) enviado(s) com detalhes e alvarás.\n\nDigite *ajuda* para nova consulta.`
    );

  } catch (err) {
    console.error("[BOT] Erro na busca:", err);
    await enviarTextoGrupo(GRUPO_AUTORIZADO, `❌ *Erro ao consultar o TJSP*\n\nTente novamente ou contate o administrador.`);
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

  // Detecção automática de CPF (11 dígitos)
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
    await enviarTextoGrupo(GRUPO_AUTORIZADO, `⏳ *Buscando no TJSP...*\n\nAguarde, estamos carregando todos os processos com detalhes completos.`);
    await executarBuscaCompleta(comandoRapido.tipo, comandoRapido.valor);
    return;
  }

  // ── Fluxo de menu (passo a passo) ──
  const estado = conversas.get(phone) || { etapa: "menu" as const, ultimaAtividade: Date.now() };
  estado.ultimaAtividade = Date.now();

  if (estado.etapa === "menu") {
    const opcoes: Record<string, { tipo: "oab" | "cpf" | "processo" | "nome"; label: string; exemplo: string }> = {
      "1": { tipo: "oab",      label: "OAB",          exemplo: "Ex: *200287* ou *SP200.287*" },
      "2": { tipo: "cpf",      label: "CPF / CNPJ",   exemplo: "Ex: *123.456.789-00*" },
      "3": { tipo: "processo", label: "Nº Processo",  exemplo: "Ex: *1234567-89.2023.8.26.0100*" },
      "4": { tipo: "nome",     label: "Nome",         exemplo: "Ex: *João da Silva*" },
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

  // ── Aguardando valor de busca (fluxo de menu) ──
  if (estado.etapa === "aguardando_busca" && estado.tipoBusca) {
    const tipo = estado.tipoBusca;
    await enviarTextoGrupo(GRUPO_AUTORIZADO, `⏳ *Buscando no TJSP...*\n\nAguarde, estamos carregando todos os processos com detalhes completos.`);
    await executarBuscaCompleta(tipo, msg);
    conversas.set(phone, { etapa: "menu", ultimaAtividade: Date.now() });
    return;
  }

  // Fallback
  conversas.set(phone, { etapa: "menu", ultimaAtividade: Date.now() });
  await enviarTextoGrupo(GRUPO_AUTORIZADO, MENU_AJUDA);
}
