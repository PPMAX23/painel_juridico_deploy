import { Router, Request, Response } from "express";
import { invokeLLM } from "./_core/llm";
import { garantirToken, getTokenStatus, setTokenManual, iniciarAutoLogin } from "./auto-login";

const router = Router();
const API_BASE = "http://191.101.131.161";

// Iniciar o serviço de auto-login quando as rotas forem carregadas
iniciarAutoLogin().catch(e => console.error("[AutoLogin] Falha na inicialização:", e.message));

// ─── Função auxiliar para fazer requisições autenticadas ──────────────────────
async function fetchComToken(url: string, options: RequestInit = {}): Promise<globalThis.Response> {
  // Garantir token válido (renova automaticamente se necessário)
  const token = await garantirToken();
  if (!token) {
    throw new Error("TOKEN_INDISPONIVEL");
  }
  
  return fetch(url, {
    ...options,
    headers: {
      "Accept": "application/json",
      "Content-Type": "application/json",
      "Cookie": `token=${token}`,
      ...(options.headers || {}),
    },
    signal: AbortSignal.timeout(120000),
  });
}

// ─── Endpoint para atualizar o token manualmente (fallback) ──────────────────
router.post("/token/atualizar", (req: Request, res: Response) => {
  const { token } = req.body;
  if (!token) {
    return res.status(400).json({ error: "Token é obrigatório" });
  }
  setTokenManual(token);
  const status = getTokenStatus();
  return res.json({ ok: true, expiracao: status.expiracao });
});

// Verificar status do token
router.get("/token/status", (_req: Request, res: Response) => {
  return res.json(getTokenStatus());
});

// ─── Proxy para a API de busca jurídica ───────────────────────────────────────
router.get("/buscar", async (req: Request, res: Response) => {
  const { tipo, query } = req.query as { tipo: string; query: string };

  if (!tipo || !query) {
    return res.status(400).json({ error: "Parâmetros tipo e query são obrigatórios" });
  }

  try {
    const apiUrl = `http://191.101.131.161/api/buscar?tipo=${encodeURIComponent(tipo)}&query=${encodeURIComponent(query)}`;
    const response = await fetchComToken(apiUrl) as globalThis.Response;

    if (response.status === 401) {
      return res.status(401).json({ error: "TOKEN_EXPIRADO", message: "Sessão expirada. Faça login novamente." });
    }

    if (!response.ok) {
      return res.status(response.status).json({ error: "Erro na consulta", status: response.status });
    }

    const data = await response.json();
    return res.json(data);
  } catch (error: any) {
    if (error.message === "TOKEN_INDISPONIVEL") {
      return res.status(503).json({ error: "TOKEN_INDISPONIVEL", message: "Sistema de autenticação temporariamente indisponível. Tente novamente em instantes." });
    }
    console.error("Erro ao buscar processos:", error);
    return res.status(500).json({ error: "Erro interno ao consultar processos", message: error.message });
  }
});

// ─── Consulta nacional por número de processo ─────────────────────────────────
router.get("/consulta-nacional", async (req: Request, res: Response) => {
  const { num } = req.query as { num: string };

  if (!num) {
    return res.status(400).json({ error: "Parâmetro num é obrigatório" });
  }

  try {
    const apiUrl = `http://191.101.131.161/api/consulta-nacional?num=${encodeURIComponent(num)}`;
    const response = await fetchComToken(apiUrl) as globalThis.Response;

    if (!response.ok) {
      return res.status(response.status).json({ error: "Erro na consulta nacional" });
    }

    const data = await response.json();
    return res.json(data);
  } catch (error: any) {
    if (error.message === "TOKEN_INDISPONIVEL") {
      return res.status(503).json({ error: "TOKEN_INDISPONIVEL", message: "Autenticação temporariamente indisponível." });
    }
    console.error("Erro na consulta nacional:", error);
    return res.status(500).json({ error: "Erro interno", message: error.message });
  }
});

// // ─── Validar WhatsApp ────────────────────────────────────────────────────
router.post("/whatsapp/validar", async (req: Request, res: Response) => {
  try {
    const token = await garantirToken();
    if (!token) {
      return res.status(503).json({ error: "TOKEN_INDISPONIVEL" });
    }

    const apiUrl = `${API_BASE}/api/whatsapp/validar`;
    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Accept": "application/json",
        "Content-Type": "application/json",
        "Cookie": `token=${token}`,
      },
      body: JSON.stringify(req.body),
      signal: AbortSignal.timeout(30000),
    });

    const data = await response.json();
    return res.json(data);
  } catch (error: any) {
    console.error("Erro ao validar WhatsApp:", error);
    return res.status(500).json({ error: "Erro ao validar WhatsApp", message: error.message });
  }
});

//// ─── Foto do advogado ────────────────────────────────────────────────────
router.get("/foto-adv", async (req: Request, res: Response) => {
  const { uf, num } = req.query as { uf: string; num: string };

  try {
    const token = await garantirToken();
    const cookieHeader = token ? `token=${token}` : "";
    const apiUrl = `${API_BASE}/api/foto-adv?uf=${uf}&num=${num}`;
    
    const response = await fetch(apiUrl, {
      headers: { "Cookie": cookieHeader },
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      return res.status(404).json({ error: "Foto não encontrada" });
    }

    const contentType = response.headers.get("content-type") || "image/jpeg";
    const buffer = await response.arrayBuffer();
    res.setHeader("Content-Type", contentType);
    return res.send(Buffer.from(buffer));
  } catch (error: any) {
    return res.status(500).json({ error: "Erro ao buscar foto", message: error.message });
  }
});

// ─── IA - Resumo do processo ──────────────────────────────────────────────────
router.post("/ia/processo", async (req: Request, res: Response) => {
  const { processo } = req.body;

  if (!processo) {
    return res.status(400).json({ error: "Dados do processo são obrigatórios" });
  }

  try {
    const tramitacao = processo.tramitacaoAtual || (processo.tramitacoes ? processo.tramitacoes[0] : null);
    const assunto = processo.dadosMapeados?.assunto_principal || tramitacao?.assunto?.[0]?.descricao || "Não informado";
    const tribunal = tramitacao?.tribunal?.sigla || processo.siglaTribunal || "";
    const valor = parseFloat(tramitacao?.valorAcao || processo.dadosMapeados?.valor_causa || 0)
      .toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
    const situacao = processo.dadosMapeados?.situacao_processo || (tramitacao?.ativo ? "ATIVO" : "ARQUIVADO");
    
    const partes = tramitacao?.partes || [];
    const autores = partes.filter((p: any) => p.polo === "ATIVO").map((p: any) => p.nome).join(", ");
    const reus = partes.filter((p: any) => p.polo === "PASSIVO").map((p: any) => p.nome).join(", ");
    
    const ultimoMov = tramitacao?.ultimoMovimento;

    const prompt = `Você é um assistente jurídico especializado. Analise o seguinte processo judicial e forneça um resumo profissional e objetivo em português brasileiro.

PROCESSO: ${processo.numeroProcesso}
TRIBUNAL: ${tribunal}
ASSUNTO: ${assunto}
VALOR DA CAUSA: ${valor}
SITUAÇÃO: ${situacao}
POLO ATIVO (AUTOR): ${autores || "Não identificado"}
POLO PASSIVO (RÉU): ${reus || "Não identificado"}
ÚLTIMO MOVIMENTO: ${ultimoMov?.descricao || "Não disponível"} (${ultimoMov?.dataHora ? new Date(ultimoMov.dataHora).toLocaleDateString("pt-BR") : "N/A"})

Forneça:
1. Resumo da causa (2-3 linhas)
2. Situação atual do processo
3. Principais pontos de atenção
4. Perspectiva jurídica

Seja objetivo, profissional e use linguagem jurídica adequada.`;

    const result = await invokeLLM({
      messages: [{ role: "user", content: prompt }],
      maxTokens: 1024,
    });

    const content = result.choices[0]?.message?.content;
    const text = typeof content === "string" ? content : "";
    
    return res.json({ resumo: text });
  } catch (error: any) {
    console.error("Erro ao gerar resumo IA:", error);
    return res.status(500).json({ error: "Erro ao gerar resumo com IA", message: error.message });
  }
});

// ─── IA - Dossiê do advogado ──────────────────────────────────────────────────
router.post("/ia/advogado", async (req: Request, res: Response) => {
  const { processos, oab } = req.body;

  if (!processos || !Array.isArray(processos)) {
    return res.status(400).json({ error: "Lista de processos é obrigatória" });
  }

  try {
    const total = processos.length;
    const ativos = processos.filter((p: any) => {
      const t = p.tramitacaoAtual || (p.tramitacoes ? p.tramitacoes[0] : null);
      return t?.ativo;
    }).length;
    
    const tribunaisSet = new Set(processos.map((p: any) => p.siglaTribunal || p.tramitacoes?.[0]?.tribunal?.sigla));
    const tribunais = Array.from(tribunaisSet).join(", ");
    
    const valorTotal = processos.reduce((acc: number, p: any) => {
      const t = p.tramitacaoAtual || (p.tramitacoes ? p.tramitacoes[0] : null);
      return acc + parseFloat(t?.valorAcao || 0);
    }, 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

    const assuntos = processos.slice(0, 10).map((p: any) => {
      const t = p.tramitacaoAtual || (p.tramitacoes ? p.tramitacoes[0] : null);
      return t?.assunto?.[0]?.descricao || "N/A";
    }).join("; ");

    const prompt = `Você é um analista jurídico especializado. Com base nos dados abaixo, gere um dossiê profissional sobre a carteira de processos deste advogado.

OAB: ${oab || "Não informado"}
TOTAL DE PROCESSOS: ${total}
PROCESSOS ATIVOS: ${ativos}
PROCESSOS ARQUIVADOS: ${total - ativos}
TRIBUNAIS ATUANTES: ${tribunais}
VALOR TOTAL EM CAUSA: ${valorTotal}
PRINCIPAIS ASSUNTOS: ${assuntos}

Gere um dossiê com:
1. Perfil profissional do advogado baseado nos dados
2. Análise da carteira de processos
3. Áreas de atuação predominantes
4. Tribunais de maior atuação
5. Indicadores de performance
6. Observações estratégicas

Use linguagem jurídica profissional e seja objetivo.`;

    const result = await invokeLLM({
      messages: [{ role: "user", content: prompt }],
      maxTokens: 2048,
    });

    const content = result.choices[0]?.message?.content;
    const text = typeof content === "string" ? content : "";
    
    return res.json({ dossie: text });
  } catch (error: any) {
    console.error("Erro ao gerar dossiê IA:", error);
    return res.status(500).json({ error: "Erro ao gerar dossiê com IA", message: error.message });
  }
});

// ─── IA - Mensagem WhatsApp ───────────────────────────────────────────────────
router.post("/ia/whatsapp", async (req: Request, res: Response) => {
  const { processo, tipo } = req.body;

  if (!processo) {
    return res.status(400).json({ error: "Dados do processo são obrigatórios" });
  }

  try {
    const tramitacao = processo.tramitacaoAtual || (processo.tramitacoes ? processo.tramitacoes[0] : null);
    const assunto = processo.dadosMapeados?.assunto_principal || tramitacao?.assunto?.[0]?.descricao || "Não informado";
    const tribunal = tramitacao?.tribunal?.sigla || processo.siglaTribunal || "";
    const valor = parseFloat(tramitacao?.valorAcao || processo.dadosMapeados?.valor_causa || 0)
      .toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
    
    const partes = tramitacao?.partes || [];
    const autores = partes.filter((p: any) => p.polo === "ATIVO").map((p: any) => p.nome).join(", ");

    const tipoMsg = tipo === "causa_ganha" ? "mensagem profissional informando sobre resultado favorável na causa" : "mensagem de abordagem profissional sobre o processo";

    const prompt = `Você é um assistente jurídico. Crie uma ${tipoMsg} para envio via WhatsApp.

PROCESSO: ${processo.numeroProcesso}
TRIBUNAL: ${tribunal}
ASSUNTO: ${assunto}
VALOR: ${valor}
CLIENTE/AUTOR: ${autores || "Cliente"}

A mensagem deve ser:
- Profissional mas acessível
- Máximo 3 parágrafos curtos
- Adequada para WhatsApp (sem formatação complexa)
- Em português brasileiro
- Tom cordial e profissional

Gere apenas o texto da mensagem, sem explicações adicionais.`;

    const result = await invokeLLM({
      messages: [{ role: "user", content: prompt }],
      maxTokens: 512,
    });

    const content = result.choices[0]?.message?.content;
    const text = typeof content === "string" ? content : "";
    
    return res.json({ mensagem: text });
  } catch (error: any) {
    console.error("Erro ao gerar mensagem WA:", error);
    return res.status(500).json({ error: "Erro ao gerar mensagem com IA", message: error.message });
  }
});

export default router;
