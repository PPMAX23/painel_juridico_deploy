import { execFile } from "child_process";
import { promisify } from "util";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import os from "os";

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const TEMPLATE_PATH = path.join(__dirname, "assets", "alvara-template.pdf");
const SCRIPT_PATH = path.join(__dirname, "gerar_alvara.py");

export interface DadosAlvara {
  numeroProcesso: string;
  dataAtuacao?: string;
  valorCausa: string;
  nomeReclamante: string;
  cpfReclamante?: string;
  nomeAdvogado?: string;
  nomeReu?: string;
  vara?: string;
  foro?: string;
}

function formatarDataAtual(): string {
  const hoje = new Date();
  const d = String(hoje.getDate()).padStart(2, "0");
  const m = String(hoje.getMonth() + 1).padStart(2, "0");
  const a = hoje.getFullYear();
  return `${d}/${m}/${a}`;
}

export async function gerarAlvaraPDF(dados: DadosAlvara): Promise<Buffer> {
  // Criar arquivo temporário de saída
  const tmpFile = path.join(os.tmpdir(), `alvara-${Date.now()}-${Math.random().toString(36).slice(2)}.pdf`);

  const payload = JSON.stringify({
    template_path: TEMPLATE_PATH,
    output_path: tmpFile,
    numero_processo: dados.numeroProcesso,
    data_atuacao: dados.dataAtuacao || formatarDataAtual(),
    valor_causa: dados.valorCausa,
    nome_reclamante: dados.nomeReclamante,
    cpf_reclamante: dados.cpfReclamante || "Não informado",
    nome_advogado: dados.nomeAdvogado || "",
    nome_reu: dados.nomeReu || "Não informado",
  });

  try {
    await execFileAsync("python3", [SCRIPT_PATH, payload], {
      timeout: 30000,
    });

    const buffer = fs.readFileSync(tmpFile);
    return buffer;
  } finally {
    // Limpar arquivo temporário
    try {
      if (fs.existsSync(tmpFile)) {
        fs.unlinkSync(tmpFile);
      }
    } catch {
      // ignorar erros de limpeza
    }
  }
}
