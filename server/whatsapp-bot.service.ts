/**
 * whatsapp-bot.service.ts
 * Chatbot jurídico via WhatsApp — integração Z-API + TJSP
 * Funciona EXCLUSIVAMENTE no grupo autorizado "Painel Puxada Adv"
 * Qualquer mensagem fora do grupo é ignorada silenciosamente.
 */

import { enviarTexto, enviarTextoGrupo } from "./zapi.service";
import {
  buscarPorOAB,
  buscarPorCPFCNPJ,
  buscarPorNumero,
  buscarPorNome,
  cookiesValidos,
  type ProcessoResumo,
} from "./tjsp-http.service";

// ─── Grupo autorizado ─────────────────────────────────────────────────────────
// ID do grupo "Painel Puxada Adv" obtido via Z-API
const GRUPO_AUTORIZADO = process.env.ZAPI_GRUPO_ID || "120363410236215446-group";

// ─── Estado das conversas por remetente dentro do grupo ──────────────────────
interface EstadoConversa {
  etapa: "menu" | "aguardando_busca";
  tipoBusca?: "oab" | "cpf" | "processo" | "nome";
  ultimaAtividade: number;
}

const conversas = new Map<string, EstadoConversa>();

// Limpar conversas inativas após 30 minutos
setInterval(() => {
  const agora = Date.now();
  Array.from(conversas.entries()).forEach(([key, estado]) => {
    if (agora - estado.ultimaAtividade > 30 * 60 * 1000) {
      conversas.delete(key);
    }
  });
}, 5 * 60 * 1000);

// ─── Mensagens do bot ─────────────────────────────────────────────────────────

const MENU_PRINCIPAL = `⚖️ *PAINEL JURÍDICO TJSP*
_Consulta Processual Automatizada_

Como posso ajudar?

*1* — Buscar por OAB
*2* — Buscar por CPF / CNPJ
*3* — Buscar por Nº do Processo
*4* — Buscar por Nome do Advogado

Digite o número da opção desejada.`;

const MSG_SEM_COOKIES = `⚠️ *Sistema Temporariamente Indisponível*

A conexão com o TJSP está sendo renovada.
Tente novamente em alguns minutos.`;

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

function formatarProcessos(processos: ProcessoResumo[], remetente: string): string {
  if (!processos || processos.length === 0) {
    return `@${remetente}\n\n❌ *Nenhum processo encontrado* para esta consulta.`;
  }

  const total = processos.length;
  const exibir = processos.slice(0, 5);

  let msg = `@${remetente}\n\n📋 *${total} processo(s) encontrado(s)*${total > 5 ? ` _(exibindo 5 primeiros)_` : ""}\n\n`;

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

// ─── Enviar mensagem no grupo ─────────────────────────────────────────────────
async function responderGrupo(mensagem: string): Promise<void> {
  await enviarTextoGrupo(GRUPO_AUTORIZADO, mensagem);
}

// ─── Processador principal de mensagens ──────────────────────────────────────

export async function processarMensagem(
  phone: string,       // número do remetente
  texto: string,       // texto da mensagem
  grupoId?: string,    // ID do grupo (se for mensagem de grupo)
  remetente?: string   // número do remetente dentro do grupo
): Promise<void> {

  // ── BLOQUEIO: ignorar mensagens fora do grupo autorizado ──
  if (!grupoId || grupoId !== GRUPO_AUTORIZADO) {
    // Mensagem privada ou grupo não autorizado — ignorar silenciosamente
    console.log(`[BOT] Mensagem ignorada — fora do grupo autorizado. grupoId: ${grupoId || "privado"}`);
    return;
  }

  const msg = texto.trim().toLowerCase();
  // Usar o número do remetente dentro do grupo como chave de estado
  const chave = remetente || phone;
  const nomeExibicao = remetente ? remetente.replace("@c.us", "").replace("55", "") : "usuário";

  // Comandos globais
  if (msg === "menu" || msg === "inicio" || msg === "início" || msg === "oi" || msg === "olá" || msg === "ola" || msg === "start" || msg === "/menu") {
    conversas.set(chave, { etapa: "menu", ultimaAtividade: Date.now() });
    await responderGrupo(MENU_PRINCIPAL);
    return;
  }

  const estado = conversas.get(chave) || { etapa: "menu" as const, ultimaAtividade: Date.now() };
  estado.ultimaAtividade = Date.now();

  // ── Etapa: menu principal ──
  if (estado.etapa === "menu") {
    if (msg === "1") {
      conversas.set(chave, { etapa: "aguardando_busca", tipoBusca: "oab", ultimaAtividade: Date.now() });
      await responderGrupo(msgAguardandoBusca("oab"));
    } else if (msg === "2") {
      conversas.set(chave, { etapa: "aguardando_busca", tipoBusca: "cpf", ultimaAtividade: Date.now() });
      await responderGrupo(msgAguardandoBusca("cpf"));
    } else if (msg === "3") {
      conversas.set(chave, { etapa: "aguardando_busca", tipoBusca: "processo", ultimaAtividade: Date.now() });
      await responderGrupo(msgAguardandoBusca("processo"));
    } else if (msg === "4") {
      conversas.set(chave, { etapa: "aguardando_busca", tipoBusca: "nome", ultimaAtividade: Date.now() });
      await responderGrupo(msgAguardandoBusca("nome"));
    } else {
      // Mensagem não reconhecida — mostrar menu
      await responderGrupo(MENU_PRINCIPAL);
    }
    return;
  }

  // ── Etapa: aguardando termo de busca ──
  if (estado.etapa === "aguardando_busca" && estado.tipoBusca) {
    const tipo = estado.tipoBusca;

    if (!cookiesValidos()) {
      await responderGrupo(MSG_SEM_COOKIES);
      conversas.set(chave, { etapa: "menu", ultimaAtividade: Date.now() });
      return;
    }

    await responderGrupo(`⏳ *Buscando no TJSP...*\n\nAguarde um momento.`);

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

      const resposta = formatarProcessos(resultado.processos, nomeExibicao);
      await responderGrupo(resposta);
    } catch (err) {
      console.error("[BOT] Erro na busca:", err);
      await responderGrupo(`❌ *Erro ao consultar o TJSP*\n\nTente novamente ou contate o administrador.\n\nDigite *menu* para recomeçar.`);
    }

    conversas.set(chave, { etapa: "menu", ultimaAtividade: Date.now() });
    return;
  }

  // Fallback
  conversas.set(chave, { etapa: "menu", ultimaAtividade: Date.now() });
  await responderGrupo(MENU_PRINCIPAL);
}
