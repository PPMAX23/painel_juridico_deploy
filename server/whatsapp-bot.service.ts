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

import { enviarTextoGrupo } from "./zapi.service";
import {
  buscarPorOAB,
  buscarPorCPFCNPJ,
  buscarPorNumero,
  buscarPorNome,
  cookiesValidos,
  type ProcessoResumo,
} from "./tjsp-http.service";

// ─── Grupo autorizado ─────────────────────────────────────────────────────────
const GRUPO_AUTORIZADO = process.env.ZAPI_GRUPO_ID || "120363410236215446-group";

// ─── Estado das conversas (para fluxo de menu, se necessário) ────────────────
interface EstadoConversa {
  etapa: "menu" | "aguardando_busca";
  tipoBusca?: "oab" | "cpf" | "processo" | "nome";
  ultimaAtividade: number;
}

const conversas = new Map<string, EstadoConversa>();

setInterval(() => {
  const agora = Date.now();
  Array.from(conversas.entries()).forEach(([key, estado]) => {
    if (agora - estado.ultimaAtividade > 30 * 60 * 1000) {
      conversas.delete(key);
    }
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

function formatarProcessos(processos: ProcessoResumo[]): string {
  if (!processos || processos.length === 0) {
    return `❌ *Nenhum processo encontrado* para esta consulta.`;
  }

  const total = processos.length;
  const exibir = processos.slice(0, 5);

  let msg = `📋 *${total} processo(s) encontrado(s)*${total > 5 ? ` _(exibindo 5 primeiros)_` : ""}\n\n`;

  exibir.forEach((p, i) => {
    msg += `*${i + 1}.* \`${p.numeroProcesso || "Nº não disponível"}\`\n`;
    if (p.classe) msg += `   📁 ${p.classe}\n`;
    if (p.assunto) msg += `   📌 ${p.assunto}\n`;
    if (p.vara) msg += `   🏛️ ${p.vara}\n`;
    if (p.foro) msg += `   📍 ${p.foro}\n`;
    if (p.data) msg += `   📅 ${p.data}\n`;
    if (p.valor) msg += `   💰 ${p.valor}\n`;
    msg += "\n";
  });

  if (total > 5) {
    msg += `_... e mais ${total - 5} processo(s). Refine a busca para resultados mais precisos._\n\n`;
  }

  msg += `_Digite *ajuda* para ver todos os comandos._`;
  return msg;
}

// ─── Detecção de comandos rápidos ─────────────────────────────────────────────
interface ComandoRapido {
  tipo: "oab" | "cpf" | "processo" | "nome";
  valor: string;
}

function detectarComandoRapido(texto: string): ComandoRapido | null {
  const t = texto.trim();

  // OAB XXXXX ou OAB SP200287
  const matchOAB = t.match(/^oab\s+(.+)$/i);
  if (matchOAB) return { tipo: "oab", valor: matchOAB[1].trim() };

  // CPF XXXXXXXXXXX (com ou sem formatação)
  const matchCPF = t.match(/^cpf\s+(.+)$/i);
  if (matchCPF) return { tipo: "cpf", valor: matchCPF[1].trim() };

  // CNPJ XXXXXXXXXXXXXX
  const matchCNPJ = t.match(/^cnpj\s+(.+)$/i);
  if (matchCNPJ) return { tipo: "cpf", valor: matchCNPJ[1].trim() }; // usa mesma função

  // PROCESSO XXXXXXX-XX.XXXX.X.XX.XXXX
  const matchProcesso = t.match(/^processo\s+(.+)$/i);
  if (matchProcesso) return { tipo: "processo", valor: matchProcesso[1].trim() };

  // NOME Fulano de Tal
  const matchNome = t.match(/^nome\s+(.+)$/i);
  if (matchNome) return { tipo: "nome", valor: matchNome[1].trim() };

  // Detecção automática de número de processo (formato CNJ: NNNNNNN-DD.AAAA.J.TT.OOOO)
  const matchNumProcesso = t.match(/^\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}$/);
  if (matchNumProcesso) return { tipo: "processo", valor: t };

  // Detecção automática de CPF (11 dígitos com ou sem formatação)
  const matchCPFAuto = t.replace(/\D/g, "");
  if (matchCPFAuto.length === 11 && /^\d+$/.test(matchCPFAuto)) {
    return { tipo: "cpf", valor: t };
  }

  // Detecção automática de CNPJ (14 dígitos)
  if (matchCPFAuto.length === 14 && /^\d+$/.test(matchCPFAuto)) {
    return { tipo: "cpf", valor: t };
  }

  return null;
}

// ─── Executar busca ───────────────────────────────────────────────────────────
async function executarBusca(tipo: "oab" | "cpf" | "processo" | "nome", valor: string): Promise<string> {
  if (!cookiesValidos()) {
    return MSG_SEM_COOKIES;
  }

  try {
    let resultado: { processos: ProcessoResumo[]; totalEncontrados: number } = { processos: [], totalEncontrados: 0 };

    if (tipo === "oab") {
      resultado = await buscarPorOAB(valor) as typeof resultado;
    } else if (tipo === "cpf") {
      resultado = await buscarPorCPFCNPJ(valor) as typeof resultado;
    } else if (tipo === "processo") {
      resultado = await buscarPorNumero(valor) as typeof resultado;
    } else if (tipo === "nome") {
      resultado = await buscarPorNome(valor) as typeof resultado;
    }

    return formatarProcessos(resultado.processos);
  } catch (err) {
    console.error("[BOT] Erro na busca:", err);
    return `❌ *Erro ao consultar o TJSP*\n\nTente novamente ou contate o administrador.`;
  }
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
    conversas.delete(phone); // limpar estado
    await enviarTextoGrupo(GRUPO_AUTORIZADO, MENU_AJUDA);
    return;
  }

  // ── Verificar se é um comando rápido ──
  const comandoRapido = detectarComandoRapido(msg);
  if (comandoRapido) {
    conversas.delete(phone); // limpar qualquer estado anterior
    await enviarTextoGrupo(GRUPO_AUTORIZADO, `⏳ *Buscando no TJSP...*\n\nAguarde um momento.`);
    const resposta = await executarBusca(comandoRapido.tipo, comandoRapido.valor);
    await enviarTextoGrupo(GRUPO_AUTORIZADO, resposta);
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
      // Não reconhecido — mostrar ajuda
      await enviarTextoGrupo(GRUPO_AUTORIZADO, MENU_AJUDA);
    }
    return;
  }

  // ── Aguardando valor de busca (fluxo de menu) ──
  if (estado.etapa === "aguardando_busca" && estado.tipoBusca) {
    const tipo = estado.tipoBusca;
    await enviarTextoGrupo(GRUPO_AUTORIZADO, `⏳ *Buscando no TJSP...*\n\nAguarde um momento.`);
    const resposta = await executarBusca(tipo, msg);
    await enviarTextoGrupo(GRUPO_AUTORIZADO, resposta);
    conversas.set(phone, { etapa: "menu", ultimaAtividade: Date.now() });
    return;
  }

  // Fallback
  conversas.set(phone, { etapa: "menu", ultimaAtividade: Date.now() });
  await enviarTextoGrupo(GRUPO_AUTORIZADO, MENU_AJUDA);
}
