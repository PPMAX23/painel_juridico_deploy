/**
 * whatsapp-bot.service.ts
 * Chatbot jurídico via WhatsApp — integração Z-API + TJSP
 * Fluxo: usuário envia mensagem → bot interpreta → busca no TJSP → responde
 */

import { enviarTexto } from "./zapi.service";
import {
  buscarPorOAB,
  buscarPorCPFCNPJ,
  buscarPorNumero,
  buscarPorNome,
  cookiesValidos,
  type ProcessoResumo,
} from "./tjsp-http.service";

// ─── Estado das conversas (em memória) ───────────────────────────────────────
// Guarda o estado de cada conversa por número de telefone
interface EstadoConversa {
  etapa: "menu" | "aguardando_busca";
  tipoBusca?: "oab" | "cpf" | "processo" | "nome";
  ultimaAtividade: number;
}

const conversas = new Map<string, EstadoConversa>();

// Limpar conversas inativas após 30 minutos
setInterval(() => {
  const agora = Date.now();
  Array.from(conversas.entries()).forEach(([phone, estado]) => {
    if (agora - estado.ultimaAtividade > 30 * 60 * 1000) {
      conversas.delete(phone);
    }
  });
}, 5 * 60 * 1000);

// ─── Mensagens do bot ─────────────────────────────────────────────────────────

const MENU_PRINCIPAL = `⚖️ *PAINEL JURÍDICO TJSP*
_Consulta Processual Automatizada_

Olá! Como posso ajudar?

*1* — Buscar por OAB
*2* — Buscar por CPF / CNPJ
*3* — Buscar por Nº do Processo
*4* — Buscar por Nome do Advogado

Digite o número da opção desejada.`;

const MSG_SEM_COOKIES = `⚠️ *Sistema Temporariamente Indisponível*

A conexão com o TJSP está sendo renovada.
Por favor, tente novamente em alguns minutos.

Se o problema persistir, contate o administrador.`;

function msgAguardandoBusca(tipo: string): string {
  const exemplos: Record<string, string> = {
    oab: "Ex: *200287* ou *SP200.287*",
    cpf: "Ex: *123.456.789-00* ou *12345678900*",
    processo: "Ex: *1234567-89.2023.8.26.0100*",
    nome: "Ex: *João da Silva*",
  };
  const labels: Record<string, string> = {
    oab: "número da OAB",
    cpf: "CPF ou CNPJ",
    processo: "número do processo",
    nome: "nome do advogado",
  };
  return `🔍 *Busca por ${labels[tipo] || tipo}*\n\nDigite o ${labels[tipo] || tipo}:\n${exemplos[tipo] || ""}\n\n_Digite *menu* para voltar ao início._`;
}

function formatarProcessos(processos: ProcessoResumo[]): string {
  if (!processos || processos.length === 0) {
    return "❌ *Nenhum processo encontrado* para esta consulta.";
  }

  const total = processos.length;
  const exibir = processos.slice(0, 5); // máximo 5 por mensagem

  let msg = `📋 *${total} processo(s) encontrado(s)*${total > 5 ? ` _(exibindo 5 primeiros)_` : ""}\n\n`;

  exibir.forEach((p, i) => {
    msg += `*${i + 1}.* ${p.numeroProcesso || "Nº não disponível"}\n`;
    if (p.classe) msg += `   📁 ${p.classe}\n`;
    if (p.assunto) msg += `   📌 ${p.assunto}\n`;
    if (p.vara) msg += `   🏛️ ${p.vara}\n`;
    if (p.foro) msg += `   📍 ${p.foro}\n`;
    if (p.data) msg += `   📅 ${p.data}\n`;
    if (p.valor) msg += `   💰 ${p.valor}\n`;
    msg += "\n";
  });

  msg += `_Digite *menu* para nova consulta._`;
  return msg;
}

// ─── Processador principal de mensagens ──────────────────────────────────────

export async function processarMensagem(phone: string, texto: string): Promise<void> {
  const msg = texto.trim().toLowerCase();

  // Comandos globais
  if (msg === "menu" || msg === "inicio" || msg === "início" || msg === "oi" || msg === "olá" || msg === "ola" || msg === "start") {
    conversas.set(phone, { etapa: "menu", ultimaAtividade: Date.now() });
    await enviarTexto(phone, MENU_PRINCIPAL);
    return;
  }

  const estado = conversas.get(phone) || { etapa: "menu" as const, ultimaAtividade: Date.now() };
  estado.ultimaAtividade = Date.now();

  // ── Etapa: menu principal ──
  if (estado.etapa === "menu") {
    if (msg === "1") {
      conversas.set(phone, { etapa: "aguardando_busca", tipoBusca: "oab", ultimaAtividade: Date.now() });
      await enviarTexto(phone, msgAguardandoBusca("oab"));
    } else if (msg === "2") {
      conversas.set(phone, { etapa: "aguardando_busca", tipoBusca: "cpf", ultimaAtividade: Date.now() });
      await enviarTexto(phone, msgAguardandoBusca("cpf"));
    } else if (msg === "3") {
      conversas.set(phone, { etapa: "aguardando_busca", tipoBusca: "processo", ultimaAtividade: Date.now() });
      await enviarTexto(phone, msgAguardandoBusca("processo"));
    } else if (msg === "4") {
      conversas.set(phone, { etapa: "aguardando_busca", tipoBusca: "nome", ultimaAtividade: Date.now() });
      await enviarTexto(phone, msgAguardandoBusca("nome"));
    } else {
      // Mensagem não reconhecida no menu — mostrar menu
      await enviarTexto(phone, MENU_PRINCIPAL);
    }
    return;
  }

  // ── Etapa: aguardando termo de busca ──
  if (estado.etapa === "aguardando_busca" && estado.tipoBusca) {
    const tipo = estado.tipoBusca;

    // Verificar se os cookies TJSP estão ativos
    if (!cookiesValidos()) {
      await enviarTexto(phone, MSG_SEM_COOKIES);
      conversas.set(phone, { etapa: "menu", ultimaAtividade: Date.now() });
      return;
    }

    // Mensagem de "buscando..."
    await enviarTexto(phone, `⏳ *Buscando no TJSP...*\n\nAguarde um momento.`);

    try {
      let resultado: { processos: ProcessoResumo[]; totalEncontrados: number } = { processos: [], totalEncontrados: 0 };

      if (tipo === "oab") {
        resultado = await buscarPorOAB(texto.trim()) as typeof resultado;
      } else if (tipo === "cpf") {
        resultado = await buscarPorCPFCNPJ(texto.trim()) as typeof resultado;
      } else if (tipo === "processo") {
        resultado = await buscarPorNumero(texto.trim()) as typeof resultado;
      } else if (tipo === "nome") {
        resultado = await buscarPorNome(texto.trim()) as typeof resultado;
      }

      const resposta = formatarProcessos(resultado.processos);
      await enviarTexto(phone, resposta);
    } catch (err) {
      console.error("[BOT] Erro na busca:", err);
      await enviarTexto(phone, `❌ *Erro ao consultar o TJSP*\n\nTente novamente ou contate o administrador.\n\nDigite *menu* para recomeçar.`);
    }

    // Voltar ao menu após a busca
    conversas.set(phone, { etapa: "menu", ultimaAtividade: Date.now() });
    return;
  }

  // Fallback: mostrar menu
  conversas.set(phone, { etapa: "menu", ultimaAtividade: Date.now() });
  await enviarTexto(phone, MENU_PRINCIPAL);
}
