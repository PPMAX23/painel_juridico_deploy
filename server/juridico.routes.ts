import { Router, Request, Response } from "express";
import { invokeLLM } from "./_core/llm";
import { obterDDDsPorForo, filtrarPessoasPorDDD } from "./foro-ddd";
import {
  buscarPorOAB,
  buscarPorCPFCNPJ,
  buscarPorNumero,
  buscarPorNome,
  filtrarProcessosIndesejados,
  obterDetalheProcesso,
  obterDocumento,
  setCookiesTJSP,
  statusCookies,
  garantirCookies,
} from "./tjsp-http.service";

const router = Router();

// ─── Busca principal (OAB, CPF/CNPJ, Nº Processo) ────────────────────────────
router.get("/buscar", async (req: Request, res: Response) => {
  const { tipo, query } = req.query as { tipo: string; query: string };

  if (!tipo || !query) {
    return res.status(400).json({ error: "Parâmetros tipo e query são obrigatórios" });
  }

  try {
    let resultado;
    if (tipo === "oab") {
      resultado = await buscarPorOAB(query);
    } else if (tipo === "cpf" || tipo === "cnpj" || tipo === "documento") {
      resultado = await buscarPorCPFCNPJ(query);
    } else if (tipo === "processo") {
      resultado = await buscarPorNumero(query);
    } else if (tipo === "nome") {
      resultado = await buscarPorNome(query);
    } else {
      return res.status(400).json({ error: `Tipo de busca inválido: ${tipo}` });
    }

    // Filtrar processos indesejados (usucapião, herança, partilha, etc.)
    const processosFiltrados = filtrarProcessosIndesejados(resultado.processos);
    const totalFiltrados = resultado.processos.length - processosFiltrados.length;
    if (totalFiltrados > 0) {
      console.log(`[TJSP] Filtrados ${totalFiltrados} processos indesejados`);
    }

    return res.json({
      total: processosFiltrados.length,
      totalEncontrados: resultado.totalEncontrados,
      totalFiltrados,
      processos: processosFiltrados,
      fonte: "TJSP",
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg === "TJSP_SEM_AUTENTICACAO" || msg === "SESSAO_EXPIRADA") {
      return res.status(401).json({
        error: "SESSAO_EXPIRADA",
        mensagem: "Sessão do TJSP expirada. Configure os cookies de sessão.",
      });
    }
    console.error("[TJSP Buscar]", msg);
    return res.status(500).json({ error: msg });
  }
});

// ─── Detalhe de processo ──────────────────────────────────────────────────────
router.get("/processo/detalhe", async (req: Request, res: Response) => {
  const { codigo, foro, url } = req.query as { codigo?: string; foro?: string; url?: string };

  try {
    let detalhe;
    if (codigo && foro) {
      detalhe = await obterDetalheProcesso(codigo, foro);
    } else if (url) {
      // Extrair código e foro da URL
      const codigoMatch = url.match(/processo\.codigo=([^&]+)/);
      const foroMatch = url.match(/processo\.foro=([^&]+)/);
      if (!codigoMatch || !foroMatch) {
        return res.status(400).json({ error: "URL inválida: não foi possível extrair código e foro" });
      }
      detalhe = await obterDetalheProcesso(codigoMatch[1], foroMatch[1]);
    } else {
      return res.status(400).json({ error: "Parâmetros codigo+foro ou url são obrigatórios" });
    }
    return res.json(detalhe);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg === "TJSP_SEM_AUTENTICACAO" || msg === "SESSAO_EXPIRADA") {
      return res.status(401).json({ error: "SESSAO_EXPIRADA" });
    }
    console.error("[TJSP Detalhe]", msg);
    return res.status(500).json({ error: msg });
  }
});

// ─── Status da sessão TJSP ────────────────────────────────────────────────────
router.get("/tjsp/status", async (_req: Request, res: Response) => {
  const status = statusCookies();
  return res.json({ ...status, fonte: "TJSP", timestamp: new Date().toISOString() });
});

// ─── Configurar cookies manualmente ──────────────────────────────────────────
router.post("/tjsp/cookies", async (req: Request, res: Response) => {
  const { cookies, ttlHoras } = req.body as { cookies: string; ttlHoras?: number };

  if (!cookies || typeof cookies !== "string" || cookies.trim().length < 10) {
    return res.status(400).json({ error: "Cookies inválidos ou muito curtos" });
  }

  const ttlMs = (ttlHoras || 4) * 60 * 60 * 1000;
  setCookiesTJSP(cookies.trim(), ttlMs);
  const status = statusCookies();
  return res.json({ ok: true, ...status });
});

// ─── Auto-capturar cookies via Puppeteer (apenas sandbox) ────────────────────
router.post("/tjsp/auto-login", async (_req: Request, res: Response) => {
  try {
    await garantirCookies();
    const status = statusCookies();
    return res.json({ ok: true, ...status });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ error: msg });
  }
});

// ─── Proxy de documento do TJSP ─────────────────────────────────────────────
router.get("/documento/proxy", async (req: Request, res: Response) => {
  const { url } = req.query as { url?: string };

  if (!url || !url.includes("esaj.tjsp.jus.br")) {
    return res.status(400).json({ error: "URL inválida ou não autorizada" });
  }

  try {
    const { buffer, contentType, filename } = await obterDocumento(url);
    res.setHeader("Content-Type", contentType);
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Content-Length", buffer.length);
    return res.send(buffer);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg === "TJSP_SEM_AUTENTICACAO" || msg === "SESSAO_EXPIRADA") {
      return res.status(401).json({ error: "SESSAO_EXPIRADA" });
    }
    console.error("[TJSP Documento]", msg);
    return res.status(500).json({ error: msg });
  }
});

// ─── IA: Gerar dossiê completo ────────────────────────────────────────────────
router.post("/ia/dossie", async (req: Request, res: Response) => {
  const { processo } = req.body;

  if (!processo) {
    return res.status(400).json({ error: "Dados do processo são obrigatórios" });
  }

  try {
    const prompt = `Você é um assistente jurídico especializado. Analise o processo abaixo e gere um dossiê jurídico completo e profissional em português brasileiro.

DADOS DO PROCESSO:
Número: ${processo.numeroProcesso || "N/A"}
Tribunal: ${processo.tribunal || "TJSP"}
Classe: ${processo.classe || "N/A"}
Assunto: ${processo.assunto || "N/A"}
Vara: ${processo.vara || "N/A"}
Juiz: ${processo.juiz || "N/A"}
Valor da Causa: ${processo.valor || "N/A"}
Data de Distribuição: ${processo.dataDistribuicao || "N/A"}
Situação: ${processo.situacao || "N/A"}

PARTES:
${(processo.partes || []).map((p: { polo?: string; tipo?: string; nome: string; advogado?: string }) => `- [${p.polo || p.tipo || "Parte"}] ${p.nome}${p.advogado ? ` | Adv: ${p.advogado}` : ""}`).join("\n") || "N/A"}

ÚLTIMAS MOVIMENTAÇÕES:
${(processo.movimentacoes || []).slice(0, 10).map((m: { data: string; descricao: string }) => `- ${m.data}: ${m.descricao}`).join("\n") || "N/A"}

Gere um dossiê jurídico profissional incluindo:
1. RESUMO EXECUTIVO
2. ANÁLISE DAS PARTES
3. HISTÓRICO PROCESSUAL
4. ANÁLISE JURÍDICA
5. ESTRATÉGIA RECOMENDADA
6. PONTOS DE ATENÇÃO`;

    const resultado = await invokeLLM({ messages: [{ role: "user", content: prompt }], maxTokens: 2000 });
    const resposta = resultado.choices[0]?.message?.content || "";
    return res.json({ dossie: typeof resposta === "string" ? resposta : JSON.stringify(resposta) });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ error: msg });
  }
});

// ─── IA: Resumo do processo ───────────────────────────────────────────────────
router.post("/ia/resumo", async (req: Request, res: Response) => {
  const { processo } = req.body;

  if (!processo) {
    return res.status(400).json({ error: "Dados do processo são obrigatórios" });
  }

  try {
    const prompt = `Você é um assistente jurídico. Faça um resumo conciso e objetivo do processo abaixo em português brasileiro, em no máximo 3 parágrafos.

PROCESSO: ${processo.numeroProcesso || "N/A"}
CLASSE: ${processo.classe || "N/A"}
ASSUNTO: ${processo.assunto || "N/A"}
VARA: ${processo.vara || "N/A"}
JUIZ: ${processo.juiz || "N/A"}
VALOR: ${processo.valor || "N/A"}
PARTES: ${(processo.partes || []).map((p: { polo?: string; tipo?: string; nome: string }) => `${p.polo || p.tipo}: ${p.nome}`).join(" | ") || "N/A"}
ÚLTIMA MOVIMENTAÇÃO: ${processo.movimentacoes?.[0] ? `${processo.movimentacoes[0].data}: ${processo.movimentacoes[0].descricao}` : "N/A"}`;

    const resultado = await invokeLLM({ messages: [{ role: "user", content: prompt }], maxTokens: 500 });
    const resposta = resultado.choices[0]?.message?.content || "";
    return res.json({ resumo: typeof resposta === "string" ? resposta : JSON.stringify(resposta) });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ error: msg });
  }
});

// ─── IA: Gerar mensagem WhatsApp ──────────────────────────────────────────────
router.post("/ia/whatsapp", async (req: Request, res: Response) => {
  const { processo, tipo } = req.body;

  if (!processo) {
    return res.status(400).json({ error: "Dados do processo são obrigatórios" });
  }

  try {
    const tipoMsg = tipo || "atualização";
    const prompt = `Você é um assistente jurídico. Crie uma mensagem profissional para WhatsApp sobre ${tipoMsg} do processo abaixo. A mensagem deve ser clara, objetiva e adequada para comunicação com o cliente.

PROCESSO: ${processo.numeroProcesso || "N/A"}
CLASSE: ${processo.classe || "N/A"}
ASSUNTO: ${processo.assunto || "N/A"}
VARA: ${processo.vara || "N/A"}
ÚLTIMA MOVIMENTAÇÃO: ${processo.movimentacoes?.[0] ? `${processo.movimentacoes[0].data}: ${processo.movimentacoes[0].descricao}` : "N/A"}

Crie uma mensagem WhatsApp profissional e amigável, com no máximo 5 linhas.`;

    const resultado = await invokeLLM({ messages: [{ role: "user", content: prompt }], maxTokens: 300 });
    const resposta = resultado.choices[0]?.message?.content || "";
    return res.json({ mensagem: typeof resposta === "string" ? resposta : JSON.stringify(resposta) });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ error: msg });
  }
});

// ─── Gerar ofício formatado ───────────────────────────────────────────────────
router.post("/oficio", async (req: Request, res: Response) => {
  const { processo, advogado } = req.body;

  if (!processo) {
    return res.status(400).json({ error: "Dados do processo são obrigatórios" });
  }

  try {
    const prompt = `Você é um assistente jurídico. Gere um ofício jurídico formal e completo em português brasileiro para o processo abaixo.

PROCESSO: ${processo.numeroProcesso || "N/A"}
TRIBUNAL: ${processo.tribunal || "TJSP"}
CLASSE: ${processo.classe || "N/A"}
ASSUNTO: ${processo.assunto || "N/A"}
VARA: ${processo.vara || "N/A"}
JUIZ: ${processo.juiz || "N/A"}
VALOR: ${processo.valor || "N/A"}
PARTES: ${(processo.partes || []).map((p: { polo?: string; tipo?: string; nome: string }) => `${p.polo || p.tipo}: ${p.nome}`).join(" | ") || "N/A"}
ADVOGADO: ${advogado || "Rodrigo Cavalcanti Alves Silva - OAB/SP 200.287"}

Gere um ofício formal com:
- Cabeçalho completo
- Endereçamento ao juízo
- Corpo do ofício com referência ao processo
- Pedido específico
- Fecho formal
- Local e data
- Assinatura do advogado`;

    const resultado = await invokeLLM({ messages: [{ role: "user", content: prompt }], maxTokens: 1000 });
    const resposta = resultado.choices[0]?.message?.content || "";
    return res.json({ oficio: typeof resposta === "string" ? resposta : JSON.stringify(resposta) });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ error: msg });
  }
});

export default router;

// ─── Geração de Alvará em PDF ───────────────────────────────────────────────
router.post("/alvara/gerar", async (req: Request, res: Response) => {
  try {
    const { gerarAlvaraPDF } = await import("./alvara.service.js");
    const dados = req.body;
    if (!dados || !dados.numeroProcesso || !dados.nomeReclamante) {
      return res.status(400).json({ error: "Dados insuficientes para gerar o alvará" });
    }
    const pdfBuffer = await gerarAlvaraPDF(dados);
    const nomeArquivo = `Alvara-${dados.nomeReclamante.replace(/\s+/g, "").toUpperCase()}.pdf`;
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${nomeArquivo}"`);
    res.setHeader("Content-Length", pdfBuffer.length);
    return res.send(pdfBuffer);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ error: msg });
  }
});

// ─── Consulta por Nome via API Supabase ─────────────────────────────────────
router.get("/consulta-nome", async (req: Request, res: Response) => {
  const { nome, foro } = req.query as { nome?: string; foro?: string };
  if (!nome || String(nome).trim().length < 3) {
    return res.status(400).json({ error: "Parâmetro nome é obrigatório (mínimo 3 caracteres)" });
  }
  try {
    const nomeLimpo = String(nome).trim().toUpperCase();
    const url = `https://gwfhslsfukikfbyvysms.supabase.co/functions/v1/consulta?token=bdd5ba8bf04400a22677a47550437bd5&name=${encodeURIComponent(nomeLimpo)}`;
    const resp = await fetch(url, {
      headers: {
        "Accept": "application/json",
        "User-Agent": "PainelJuridico/1.0",
      },
    });
    if (!resp.ok) {
      return res.status(resp.status).json({ error: `Erro na API: ${resp.status}` });
    }
    const data = await resp.json();

    // ── Filtro por DDD da comarca do fórum ──────────────────────────────────
    if (foro && data.itens && Array.isArray(data.itens) && data.itens.length > 1) {
      const dddsValidos = obterDDDsPorForo(String(foro));
      if (dddsValidos.length > 0) {
        const itensFiltrados = filtrarPessoasPorDDD(data.itens, dddsValidos);
        console.log(`[consulta-nome] Foro: "${foro}" → DDDs: [${dddsValidos}] | ${data.itens.length} → ${itensFiltrados.length} pessoas`);
        return res.json({ ...data, itens: itensFiltrados, total: itensFiltrados.length, _filtro_ddd: dddsValidos });
      }
    }

    return res.json(data);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ error: msg });
  }
});

// ─── Consulta CPF via API Supabase ────────────────────────────────────────────
router.get("/consulta-cpf", async (req: Request, res: Response) => {
  const { cpf } = req.query as { cpf?: string };
  if (!cpf) {
    return res.status(400).json({ error: "Parâmetro cpf é obrigatório" });
  }

  // Limpar CPF (remover pontos, traços, espaços)
  const cpfLimpo = String(cpf).replace(/\D/g, "");
  if (cpfLimpo.length !== 11) {
    return res.status(400).json({ error: "CPF deve ter 11 dígitos" });
  }

  try {
    const url = `https://gwfhslsfukikfbyvysms.supabase.co/functions/v1/consulta-cpf?token=bdd5ba8bf04400a22677a47550437bd5&cpf=${cpfLimpo}`;
    const resp = await fetch(url, {
      headers: {
        "Accept": "application/json",
        "User-Agent": "PainelJuridico/1.0",
      },
    });

    if (!resp.ok) {
      return res.status(resp.status).json({ error: `Erro na API: ${resp.status}` });
    }

    const data = await resp.json();
    return res.json(data);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ error: msg });
  }
});
