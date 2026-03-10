/**
 * Serviço de geração de Alvará em Node.js puro.
 * Usa pdf-lib + @pdf-lib/fontkit + Liberation Serif para gerar o PDF sem Python.
 *
 * Abordagem:
 * 1. Carrega o PDF template
 * 2. Descomprime o stream de conteúdo e remove todos os blocos BT...ET (texto)
 * 3. Embutir fontes Liberation Serif (Bold e Regular) no PDF
 * 4. Usa page.drawText() para escrever os dados corretos nas posições exatas
 * 5. Salva o PDF com as imagens originais preservadas (brasão, marca d'água, assinatura)
 */

import { PDFDocument, PDFName, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { inflateSync } from "zlib";
import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ASSETS = path.join(__dirname, "assets");
const TEMPLATE_PATH = path.join(ASSETS, "alvara-template.pdf");
const BOLD_FONT_PATH = path.join(ASSETS, "LiberationSerif-Bold.ttf");
const REGULAR_FONT_PATH = path.join(ASSETS, "LiberationSerif-Regular.ttf");

const PAGE_HEIGHT = 841.92;
const FS = 10.1;   // font size padrão
const FS2 = 9.8;   // font size assinatura
const BLACK = rgb(0, 0, 0);

export interface DadosAlvara {
  numeroProcesso: string;
  dataAtuacao?: string;
  valorCausa: string;
  nomeReclamante: string;
  cpfReclamante?: string;
  nomeAdvogado?: string;
  nomeReu?: string;
}

/** Converte y do sistema PyMuPDF (y=0 no topo) para pdf-lib (y=0 na base) */
function y(yMupdf: number): number {
  return PAGE_HEIGHT - yMupdf - FS;
}

/** Converte y para assinatura (tamanho diferente) */
function y2(yMupdf: number): number {
  return PAGE_HEIGHT - yMupdf - FS2;
}

/** Formata data atual como DD/MM/AAAA */
function formatarDataAtual(): string {
  const hoje = new Date();
  const d = String(hoje.getDate()).padStart(2, "0");
  const m = String(hoje.getMonth() + 1).padStart(2, "0");
  return `${d}/${m}/${hoje.getFullYear()}`;
}

/** Formata data por extenso: "10 de março de 2026" */
function formatarDataExtenso(data: string): string {
  const meses = [
    "janeiro", "fevereiro", "março", "abril", "maio", "junho",
    "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
  ];
  const partes = data.split("/");
  if (partes.length !== 3) return data;
  const dia = parseInt(partes[0], 10);
  const mes = parseInt(partes[1], 10) - 1;
  const ano = partes[2];
  return `${dia} de ${meses[mes]} de ${ano}`;
}

/** Remove todos os blocos BT...ET do stream de conteúdo de uma página */
function removerTextoDaPagina(doc: PDFDocument, pageIndex: number): void {
  const page = doc.getPages()[pageIndex];
  const contentsRef = page.node.get(PDFName.of("Contents"));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const contentsObj = doc.context.lookup(contentsRef) as any;

  if (!contentsObj) {
    throw new Error(`Stream de conteúdo não encontrado na página ${pageIndex + 1}`);
  }

  const rawBytes = contentsObj.contents as Uint8Array;
  const decompressed = inflateSync(Buffer.from(rawBytes)).toString("latin1");
  const semTexto = decompressed.replace(/BT[\s\S]*?ET/g, "");

  const novoStreamObj = doc.context.flateStream(Buffer.from(semTexto, "latin1"));
  const novoRef = doc.context.register(novoStreamObj);
  page.node.set(PDFName.of("Contents"), novoRef);
}

/** Função principal: gera o PDF do alvará com os dados fornecidos */
export async function gerarAlvaraPDF(dados: DadosAlvara): Promise<Buffer> {
  const templateBytes = readFileSync(TEMPLATE_PATH);
  const boldFontBytes = readFileSync(BOLD_FONT_PATH);
  const regularFontBytes = readFileSync(REGULAR_FONT_PATH);

  const doc = await PDFDocument.load(templateBytes, { updateMetadata: false });
  doc.registerFontkit(fontkit);

  const boldFont = await doc.embedFont(boldFontBytes);
  const regularFont = await doc.embedFont(regularFontBytes);

  // Normalizar dados
  const valorLimpo = dados.valorCausa.replace(/^R\$\s*/i, "").trim();
  const nomeUp = dados.nomeReclamante.toUpperCase();
  const reuUp = (dados.nomeReu || "Não informado").toUpperCase();
  const dataAtuacao = dados.dataAtuacao || formatarDataAtual();
  const cpf = dados.cpfReclamante || "Não informado";
  const advogado = dados.nomeAdvogado || "Não informado";
  const dataExtenso = formatarDataExtenso(dataAtuacao);

  // === PÁGINA 1 ===
  removerTextoDaPagina(doc, 0);
  const page1 = doc.getPages()[0];

  // Helper para escrever texto na página 1
  const draw1 = (text: string, x: number, yMupdf: number, bold: boolean, size = FS) => {
    page1.drawText(text, {
      x,
      y: PAGE_HEIGHT - yMupdf - size,
      size,
      font: bold ? boldFont : regularFont,
      color: BLACK,
    });
  };

  // --- CABEÇALHO ---
  draw1("PODER JUDICIÁRIO", 261.5, 93.4, true, 10.5);
  draw1("TRIBUNAL DE JUSTIÇA DO ESTADO DE SP", 190.9, 108.4, true, 10.5);
  draw1("PROCEDIMENTO DO JUIZADO ESPECIAL CÍVEL", 174.8, 123.4, true, 10.5);
  draw1("PROCESSO JUDICIAL ELETRÔNICO", 206.5, 137.6, true, 10.5);

  // --- CAIXA DE INFORMAÇÕES ---
  draw1("Processo Nº:", 51.8, 174.0, true);
  draw1(` ${dados.numeroProcesso}`, 105.8, 174.0, false);

  draw1("Data da Autuação:", 51.8, 190.5, true);
  draw1(` ${dataAtuacao}`, 132.8, 190.5, false);

  draw1("Valor da causa:", 51.8, 207.0, true);
  draw1(`R$ ${valorLimpo}`, 121.2, 207.0, true);

  draw1("Partes:", 51.8, 223.5, true);

  draw1("    ", 51.8, 240.0, false);
  draw1("RECLAMANTE:", 61.9, 240.0, true);
  draw1(` ${nomeUp}`, 138.4, 240.0, false);

  draw1("    ", 51.8, 255.7, false);
  draw1("CPF:", 61.9, 255.7, true);
  draw1(` ${cpf}`, 84.9, 255.7, false);

  draw1("    ", 51.8, 272.2, false);
  draw1("ADVOGADO:", 61.9, 272.2, true);
  draw1(` ${advogado}`, 125.2, 272.2, false);

  draw1("    ", 51.8, 288.7, false);
  draw1("RÉU:", 61.9, 288.7, true);
  draw1(` ${reuUp}`, 86.6, 288.7, false);

  // --- ART. 536 ---
  draw1("Art. 536.", 43.5, 324.7, true);
  draw1(" No cumprimento de sentença que reconheça a exigibilidade de obrigação de fazer ou não fazer, o juiz, de ofício ou", 81.7, 324.7, false);
  draw1("a requerimento, para a efetivação da tutela específica ou a obtenção de tutela pelo resultado prático equivalente, determinará", 43.5, 339.0, false);
  draw1("as medidas necessárias à satisfação do exequente.", 43.5, 353.2, false);

  // --- PARÁGRAFO PRINCIPAL ---
  draw1("Determina as medidas necessárias à satisfação do exequente. Fica reconhecido e determinado que a parte reclamante foi", 43.5, 377.2, false);

  // Linha 2: "indenizada no valor total de R$ X.XXX,XX. O respectivo montante..."
  draw1(`indenizada no valor total de R$ ${valorLimpo}`, 43.5, 391.5, true);
  const w2b = boldFont.widthOfTextAtSize(`indenizada no valor total de R$ ${valorLimpo}`, FS);
  draw1(". O respectivo montante encontra-se retido em subconta judicial, ", 43.5 + w2b, 391.5, false);
  draw1("aguardando a", 492.3, 391.5, true);

  // Linha 3: "indicação e vinculação do banco recebedor por parte do(a) credor(a) NOME para a imediata"
  const t3a = "indicação e vinculação do banco recebedor";
  draw1(t3a, 43.5, 405.7, true);
  const w3a = boldFont.widthOfTextAtSize(t3a, FS);
  const t3b = " por parte do(a) credor(a) ";
  draw1(t3b, 43.5 + w3a, 405.7, false);
  const w3b = regularFont.widthOfTextAtSize(t3b, FS);
  draw1(nomeUp, 43.5 + w3a + w3b, 405.7, true);
  const w3c = boldFont.widthOfTextAtSize(nomeUp, FS);
  draw1(" para a imediata", 43.5 + w3a + w3b + w3c, 405.7, false);

  draw1("efetivação do pagamento. Os autos foram encaminhados à Vara da Fazenda para a execução e posteriormente à Vara das", 43.5, 420.0, false);
  draw1("Execuções gerando o processo de Execução.", 43.5, 434.2, false);

  // --- INCISO I ---
  draw1("I - DEFIRO", 73.5, 458.2, true);
  const wI = boldFont.widthOfTextAtSize("I - DEFIRO", FS);
  draw1(" o presente processo em favor de ", 73.5 + wI, 458.2, false);
  const wI2 = regularFont.widthOfTextAtSize(" o presente processo em favor de ", FS);
  draw1(nomeUp, 73.5 + wI + wI2, 458.2, true);
  const wI3 = boldFont.widthOfTextAtSize(nomeUp, FS);
  draw1(", pelo valor de ", 73.5 + wI + wI2 + wI3, 458.2, false);
  const wI4 = regularFont.widthOfTextAtSize(", pelo valor de ", FS);
  draw1(`R$ ${valorLimpo}`, 73.5 + wI + wI2 + wI3 + wI4, 458.2, true);
  const wI5 = boldFont.widthOfTextAtSize(`R$ ${valorLimpo}`, FS);
  draw1(", contra", 73.5 + wI + wI2 + wI3 + wI4 + wI5, 458.2, false);

  draw1(reuUp, 43.5, 472.5, true);
  const wReu = boldFont.widthOfTextAtSize(reuUp, FS);
  draw1(".", 43.5 + wReu, 472.5, false);

  // --- INCISOS II-VII ---
  draw1("II -", 73.5, 497.2, true);
  draw1(" Valor sujeito a revisão administrativa e atualização monetária.", 87.3, 497.2, false);

  draw1("III -", 73.5, 521.2, true);
  draw1(` Inclua-se a requisição de pagamento na ordem cronológica (${dataAtuacao}).`, 91.2, 521.2, false);

  draw1("IV -", 73.5, 545.2, true);
  draw1(" O Juízo da Execução deverá comunicar imediatamente fatos supervenientes.", 90.5, 545.2, false);

  draw1("V -", 73.5, 570.0, true);
  draw1(" Cientifiquem-se o Juízo da execução e a parte credora.", 86.5, 570.0, false);

  draw1("VI -", 73.5, 594.0, true);
  draw1(" Intime-se o Ente devedor para fins de repasses.", 90.7, 594.0, false);

  draw1("VII -", 73.5, 618.0, true);
  draw1(" Após, aguarde-se pagamento.", 94.6, 618.0, false);

  // === PÁGINA 2 ===
  removerTextoDaPagina(doc, 1);
  const page2 = doc.getPages()[1];

  const draw2 = (text: string, x: number, yMupdf: number, bold: boolean, size = FS) => {
    page2.drawText(text, {
      x,
      y: PAGE_HEIGHT - yMupdf - size,
      size,
      font: bold ? boldFont : regularFont,
      color: BLACK,
    });
  };

  // --- CABEÇALHO ---
  draw2("TERMO DE SIGILO E LIBERAÇÃO DE VALORES", 177.2, 31.1, true, 10.5);
  draw2("ANEXO I - PROCEDIMENTO ADMINISTRATIVO DE PAGAMENTO", 135.0, 46.1, true, 10.5);

  // --- INCISOS VIII-XIII ---
  draw2("VIII - DA CONFIDENCIALIDADE:", 73.5, 82.5, true);
  draw2(" Acesso restrito ao titular do crédito e ao seu advogado constituído.", 233.0, 82.5, false);

  draw2("IX - DA AUDITORIA FINANCEIRA:", 73.5, 107.2, true);
  draw2(" Auditor Fiscal dará início ao processo de verificação e transferência.", 238.1, 107.2, false);

  draw2("X - DA EFETIVAÇÃO DO PAGAMENTO:", 73.5, 131.2, true);
  draw2(" O repasse ocorrerá via TED/PIX assim que homologado.", 261.7, 131.2, false);

  draw2("XI - DAS TARIFAS E PRAZOS:", 73.5, 155.2, true);
  draw2(" Absoluta isenção de cobranças de taxas judiciais prévias.", 215.0, 155.2, false);

  draw2("XII - DAS PENALIDADES:", 73.5, 180.0, true);
  draw2(" A adulteração constitui crime previsto no Código Penal.", 195.9, 180.0, false);

  draw2("XIII -", 73.5, 204.0, true);
  draw2(" Cumpra-se com urgência.", 98.5, 204.0, false);

  // --- ASSINATURA ---
  draw2("Rita de Cassia de Brito Morais", 234.1, 308.6, true, FS2);
  draw2("Magistrada / Responsável pela Expedição", 216.6, 331.8, false, FS2);
  draw2(`SÃO PAULO, ${dataExtenso}`, 225.2, 356.6, true, FS2);

  const pdfBytes = await doc.save();
  return Buffer.from(pdfBytes);
}
