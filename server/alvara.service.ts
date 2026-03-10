import PDFDocument from "pdfkit";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BRASAO_PATH = path.join(__dirname, "brasao_republica.jpg");

export interface DadosAlvara {
  numeroProcesso: string;
  dataAtuacao: string;
  valorCausa: string;
  nomeReclamante: string;
  cpfReclamante?: string;
  nomeAdvogado?: string;
  nomeReu?: string;
  vara?: string;
  foro?: string;
}

function formatarDataPorExtenso(data: Date): string {
  const meses = [
    "janeiro", "fevereiro", "março", "abril", "maio", "junho",
    "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"
  ];
  return `${data.getDate()} de ${meses[data.getMonth()]} de ${data.getFullYear()}`;
}

export async function gerarAlvaraPDF(dados: DadosAlvara): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const doc = new PDFDocument({
      size: "A4",
      margins: { top: 50, bottom: 50, left: 60, right: 60 },
      info: {
        Title: `Alvará - ${dados.nomeReclamante}`,
        Author: "Tribunal de Justiça do Estado de São Paulo",
        Subject: `Processo ${dados.numeroProcesso}`,
      },
    });

    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const pageW = doc.page.width;
    const marginL = 60;
    const marginR = 60;
    const contentW = pageW - marginL - marginR;
    const hoje = new Date();
    const dataAtual = `${String(hoje.getDate()).padStart(2, "0")}/${String(hoje.getMonth() + 1).padStart(2, "0")}/${hoje.getFullYear()}`;
    const dataExtenso = formatarDataPorExtenso(hoje);

    // ─────────────────────────────────────────────
    // PÁGINA 1
    // ─────────────────────────────────────────────

    // Brasão centralizado
    try {
      doc.image(BRASAO_PATH, (pageW - 70) / 2, 40, { width: 70 });
    } catch {
      // Se não conseguir carregar a imagem, pula
    }

    // Cabeçalho
    doc.moveDown(4.5);
    doc.font("Helvetica-Bold").fontSize(11).fillColor("#000000");
    doc.text("PODER JUDICIÁRIO", { align: "center" });
    doc.text("TRIBUNAL DE JUSTIÇA DO ESTADO DE SP", { align: "center" });
    doc.text("PROCEDIMENTO DO JUIZADO ESPECIAL CÍVEL", { align: "center" });
    doc.text("PROCESSO JUDICIAL ELETRÔNICO", { align: "center" });

    doc.moveDown(1);

    // Caixa de informações do processo
    const boxY = doc.y;
    const boxPad = 12;
    const lineH = 18;
    const nomeAdvogadoLimpo = (dados.nomeAdvogado || "").replace(/advogad[oa]?:?\s*/gi, "").trim();
    const linhasPartes = [
      `  RECLAMANTE: ${dados.nomeReclamante.toUpperCase()}`,
      `  CPF: ${dados.cpfReclamante || "Não informado"}`,
      `  ADVOGADO: ${nomeAdvogadoLimpo || "Não informado"}`,
      `  RÉU: ${(dados.nomeReu || "Não informado").toUpperCase()}`,
    ];
    const boxHeight = boxPad * 2 + lineH * 4 + lineH * 3 + 10; // 4 campos partes + 3 linhas iniciais

    doc.rect(marginL, boxY, contentW, boxHeight).stroke("#000000");

    let ty = boxY + boxPad;

    doc.font("Helvetica-Bold").fontSize(10).fillColor("#000000");
    doc.text(`Processo Nº: `, marginL + boxPad, ty, { continued: true });
    doc.font("Helvetica").text(`Processo nº ${dados.numeroProcesso}`);
    ty += lineH;

    doc.font("Helvetica-Bold").text(`Data da Autuação: `, marginL + boxPad, ty, { continued: true });
    doc.font("Helvetica").text(dataAtual);
    ty += lineH;

    doc.font("Helvetica-Bold").text(`Valor da causa: `, marginL + boxPad, ty, { continued: true });
    doc.font("Helvetica").text(`R$ ${dados.valorCausa || "Não informado"}`);
    ty += lineH;

    doc.font("Helvetica-Bold").text(`Partes:`, marginL + boxPad, ty);
    ty += lineH;

    for (const linha of linhasPartes) {
      const partes = linha.split(": ");
      if (partes.length >= 2) {
        doc.font("Helvetica-Bold").fontSize(10).text(`  ${partes[0].trim()}: `, marginL + boxPad, ty, { continued: true });
        doc.font("Helvetica").text(partes.slice(1).join(": "));
      } else {
        doc.font("Helvetica").text(linha, marginL + boxPad, ty);
      }
      ty += lineH;
    }

    doc.y = boxY + boxHeight + 15;

    // Corpo do texto - Art. 536
    doc.font("Helvetica").fontSize(10).fillColor("#000000");
    doc.text(
      "Art. 536. No cumprimento de sentença que reconheça a exigibilidade de obrigação de fazer ou não fazer, o juiz, de ofício ou a requerimento, para a efetivação da tutela específica ou a obtenção de tutela pelo resultado prático equivalente, determinará as medidas necessárias à satisfação do exequente.",
      marginL, doc.y,
      { width: contentW, align: "justify", lineGap: 2 }
    );

    doc.moveDown(0.8);

    // Parágrafo principal com nomes em negrito
    const valorFormatado = `R$ ${dados.valorCausa || "Não informado"}`;
    const nomeReclamante = dados.nomeReclamante.toUpperCase();
    const nomeReu = (dados.nomeReu || "Não informado").toUpperCase();

    doc.font("Helvetica").fontSize(10).text(
      "Determina as medidas necessárias à satisfação do exequente. Fica reconhecido e determinado que a parte reclamante foi ",
      marginL, doc.y,
      { width: contentW, align: "justify", continued: true, lineGap: 2 }
    );
    doc.font("Helvetica-Bold").text(`indenizada no valor total de ${valorFormatado}`, { continued: true });
    doc.font("Helvetica").text(
      ". O respectivo montante encontra-se retido em subconta judicial, ",
      { continued: true }
    );
    doc.font("Helvetica-Bold").text("aguardando a indicação e vinculação do banco recebedor", { continued: true });
    doc.font("Helvetica").text(
      ` por parte do(a) credor(a) `,
      { continued: true }
    );
    doc.font("Helvetica-Bold").text(nomeReclamante, { continued: true });
    doc.font("Helvetica").text(
      " para a imediata efetivação do pagamento. Os autos foram encaminhados à Vara da Fazenda para a execução e posteriormente à Vara das Execuções gerando o processo de Execução.",
      { align: "justify", lineGap: 2 }
    );

    doc.moveDown(0.8);

    // Inciso I - DEFIRO
    doc.font("Helvetica").fontSize(10).text(
      "      ",
      marginL, doc.y,
      { continued: true }
    );
    doc.font("Helvetica-Bold").text("I - DEFIRO", { continued: true });
    doc.font("Helvetica").text(
      ` o presente processo em favor de `,
      { continued: true }
    );
    doc.font("Helvetica-Bold").text(nomeReclamante, { continued: true });
    doc.font("Helvetica").text(`, pelo valor de `, { continued: true });
    doc.font("Helvetica-Bold").text(valorFormatado, { continued: true });
    doc.font("Helvetica").text(`, contra `, { continued: true });
    doc.font("Helvetica-Bold").text(`${nomeReu}`, { continued: true });
    doc.font("Helvetica").text(".", { align: "justify", lineGap: 2 });

    doc.moveDown(0.6);

    // Incisos II a VII
    const incisos = [
      ["II", "Valor sujeito a revisão administrativa e atualização monetária."],
      ["III", `Inclua-se a requisição de pagamento na ordem cronológica (${dataAtual}).`],
      ["IV", "O Juízo da Execução deverá comunicar imediatamente fatos supervenientes."],
      ["V", "Cientifiquem-se o Juízo da execução e a parte credora."],
      ["VI", "Intime-se o Ente devedor para fins de repasses."],
      ["VII", "Após, aguarde-se pagamento."],
    ];

    for (const [num, texto] of incisos) {
      doc.font("Helvetica-Bold").fontSize(10).text(`${num} - `, marginL, doc.y, { continued: true });
      doc.font("Helvetica").text(texto, { width: contentW, align: "justify", lineGap: 2 });
      doc.moveDown(0.4);
    }

    // ─────────────────────────────────────────────
    // PÁGINA 2
    // ─────────────────────────────────────────────
    doc.addPage();

    // Brasão marca d'água na página 2
    try {
      doc.save();
      doc.opacity(0.06);
      doc.image(BRASAO_PATH, (pageW - 350) / 2, (doc.page.height - 350) / 2, { width: 350 });
      doc.restore();
    } catch {
      // Se não conseguir, pula
    }

    // Cabeçalho página 2
    doc.font("Helvetica-Bold").fontSize(11).fillColor("#000000");
    doc.text("TERMO DE SIGILO E LIBERAÇÃO DE VALORES", marginL, 60, { align: "center", width: contentW });
    doc.text("ANEXO I - PROCEDIMENTO ADMINISTRATIVO DE PAGAMENTO", { align: "center", width: contentW });

    doc.moveDown(1.5);

    // Cláusulas VIII a XIII
    const clausulas = [
      ["VIII - DA CONFIDENCIALIDADE:", "Acesso restrito ao titular do crédito e ao seu advogado constituído."],
      ["IX - DA AUDITORIA FINANCEIRA:", "Auditor Fiscal dará início ao processo de verificação e transferência."],
      ["X - DA EFETIVAÇÃO DO PAGAMENTO:", "O repasse ocorrerá via TED/PIX assim que homologado."],
      ["XI - DAS TARIFAS E PRAZOS:", "Absoluta isenção de cobranças de taxas judiciais prévias."],
      ["XII - DAS PENALIDADES:", "A adulteração constitui crime previsto no Código Penal."],
      ["XIII -", "Cumpra-se com urgência."],
    ];

    for (const [titulo, texto] of clausulas) {
      doc.font("Helvetica-Bold").fontSize(10).text(titulo + " ", marginL, doc.y, { continued: true });
      doc.font("Helvetica").text(texto, { width: contentW, align: "justify", lineGap: 2 });
      doc.moveDown(0.7);
    }

    doc.moveDown(2);

    // Linha de assinatura
    const assinaturaX = pageW / 2 - 60;
    doc.moveTo(assinaturaX, doc.y).lineTo(assinaturaX + 120, doc.y).stroke("#000000");
    doc.moveDown(0.3);

    // Nome da magistrada
    doc.font("Helvetica-Bold").fontSize(10).fillColor("#000000");
    doc.text("Rita de Cassia de Brito Morais", marginL, doc.y, { align: "center", width: contentW });
    doc.font("Helvetica").fontSize(10);
    doc.text("Magistrada / Responsável pela Expedição", { align: "center", width: contentW });

    doc.moveDown(0.8);
    doc.font("Helvetica-Bold").fontSize(10);
    doc.text(`SÃO PAULO, ${dataExtenso}`, { align: "center", width: contentW });

    doc.end();
  });
}
