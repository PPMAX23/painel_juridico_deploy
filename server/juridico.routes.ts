import { Router, Request, Response } from "express";
import { invokeLLM } from "./_core/llm";
import { spawn } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = Router();

// ─── Função auxiliar: executar o scraper Puppeteer do TJSP ───────────────────
function executarScraperTJSP(tipo: string, valor: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const scriptPath = path.join(__dirname, "tjsp-puppeteer.cjs");
    const proc = spawn("node", [scriptPath, tipo, valor], {
      timeout: 120000,
      env: { ...process.env, NODE_PATH: path.join(__dirname, "../node_modules") },
    });

    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (data: Buffer) => { stdout += data.toString(); });
    proc.stderr.on("data", (data: Buffer) => { stderr += data.toString(); });

    proc.on("close", (code: number) => {
      if (code === 0 && stdout.trim()) {
        try {
          resolve(JSON.parse(stdout.trim()));
        } catch {
          reject(new Error(`JSON inválido: ${stdout.substring(0, 200)}`));
        }
      } else {
        try {
          const errObj = JSON.parse(stderr.trim() || stdout.trim());
          reject(new Error(errObj.error || `Código ${code}`));
        } catch {
          reject(new Error(stderr.substring(0, 300) || `Processo encerrou com código ${code}`));
        }
      }
    });

    proc.on("error", (err: Error) => reject(err));
  });
}

// ─── Busca principal (OAB, CPF/CNPJ, Nº Processo) ────────────────────────────
router.get("/buscar", async (req: Request, res: Response) => {
  const { tipo, query } = req.query as { tipo: string; query: string };

  if (!tipo || !query) {
    return res.status(400).json({ error: "Parâmetros tipo e query são obrigatórios" });
  }

  try {
    let tipoTJSP = tipo;
    if (tipo === "cpf" || tipo === "cnpj") tipoTJSP = "documento";
    
    const resultado = await executarScraperTJSP(tipoTJSP, query);
    return res.json(resultado);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg === "SESSAO_EXPIRADA") {
      return res.status(401).json({ error: "SESSAO_EXPIRADA", mensagem: "Sessão do TJSP expirada. Faça login novamente." });
    }
    console.error("[TJSP Buscar]", msg);
    return res.status(500).json({ error: msg });
  }
});

// ─── Detalhe de processo ──────────────────────────────────────────────────────
router.get("/processo/detalhe", async (req: Request, res: Response) => {
  const { url } = req.query as { url: string };

  if (!url) {
    return res.status(400).json({ error: "Parâmetro url é obrigatório" });
  }

  try {
    const resultado = await executarScraperTJSP("detalhe", url);
    return res.json(resultado);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[TJSP Detalhe]", msg);
    return res.status(500).json({ error: msg });
  }
});

// ─── Status da sessão TJSP ────────────────────────────────────────────────────
router.get("/tjsp/status", async (_req: Request, res: Response) => {
  try {
    // Fazer uma busca rápida para verificar se a sessão está ativa
    const resultado = await executarScraperTJSP("oab", "200287") as { total?: number; processos?: unknown[] };
    const ok = resultado && (resultado.total || 0) > 0;
    return res.json({ autenticado: ok, fonte: "TJSP", timestamp: new Date().toISOString() });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return res.json({ autenticado: false, erro: msg, fonte: "TJSP" });
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
${(processo.partes || []).map((p: { polo: string; nome: string; advogado: string }) => `- [${p.polo || "Parte"}] ${p.nome}${p.advogado ? ` | Adv: ${p.advogado}` : ""}`).join("\n") || "N/A"}

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
PARTES: ${(processo.partes || []).map((p: { polo: string; nome: string }) => `${p.polo}: ${p.nome}`).join(" | ") || "N/A"}
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
PARTES: ${(processo.partes || []).map((p: { polo: string; nome: string }) => `${p.polo}: ${p.nome}`).join(" | ") || "N/A"}
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
