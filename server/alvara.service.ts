import { execFile } from "child_process";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import os from "os";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Caminho absoluto do Python para evitar ENOENT em produção
const PYTHON_BIN = "/usr/bin/python3";
const SCRIPT_PATH = path.join(__dirname, "gerar_alvara.py");
const TEMPLATE_PATH = path.join(__dirname, "assets", "alvara-template.pdf");

export interface DadosAlvara {
  numeroProcesso: string;
  dataAtuacao?: string;
  valorCausa: string;
  nomeReclamante: string;
  cpfReclamante?: string;
  nomeAdvogado?: string;
  nomeReu?: string;
}

function formatarDataAtual(): string {
  const hoje = new Date();
  const d = String(hoje.getDate()).padStart(2, "0");
  const m = String(hoje.getMonth() + 1).padStart(2, "0");
  return `${d}/${m}/${hoje.getFullYear()}`;
}

export async function gerarAlvaraPDF(dados: DadosAlvara): Promise<Buffer> {
  const outputPath = path.join(
    os.tmpdir(),
    `alvara-${Date.now()}-${Math.random().toString(36).slice(2)}.pdf`
  );

  const valorLimpo = dados.valorCausa.replace(/^R\$\s*/i, "").trim();

  const payload = JSON.stringify({
    template_path: TEMPLATE_PATH,
    output_path: outputPath,
    numero_processo: dados.numeroProcesso,
    data_atuacao: dados.dataAtuacao || formatarDataAtual(),
    valor_causa: valorLimpo,
    nome_reclamante: dados.nomeReclamante,
    cpf_reclamante: dados.cpfReclamante || "Não informado",
    nome_advogado: dados.nomeAdvogado || "",
    nome_reu: dados.nomeReu || "Não informado",
  });

  return new Promise((resolve, reject) => {
    execFile(
      PYTHON_BIN,
      [SCRIPT_PATH, payload],
      { timeout: 30000 },
      (error, stdout, stderr) => {
        if (error) {
          reject(new Error(`Erro ao gerar alvará: ${error.message}\n${stderr}`));
          return;
        }
        try {
          const pdfBuffer = fs.readFileSync(outputPath);
          fs.unlinkSync(outputPath);
          resolve(pdfBuffer);
        } catch (readErr) {
          reject(new Error(`Erro ao ler PDF gerado: ${readErr}`));
        }
      }
    );
  });
}
