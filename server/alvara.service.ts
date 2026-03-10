import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATE_PATH = path.join(__dirname, "assets", "alvara-template.pdf");
const FONT_REGULAR_PATH = path.join(__dirname, "assets", "times-regular.ttf");
const FONT_BOLD_PATH = path.join(__dirname, "assets", "times-bold.ttf");

// pdf-lib usa coordenadas com origem no canto inferior esquerdo (Y invertido)
// PyMuPDF usa origem no canto superior esquerdo
// Para converter: pdfY = pageHeight - muPdfY
// pageHeight = 841.9

const PAGE_H = 841.9;
const FS = 10.1; // font size base

function toY(muY: number): number {
  return PAGE_H - muY;
}

function meses(): string[] {
  return [
    "janeiro", "fevereiro", "março", "abril", "maio", "junho",
    "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
  ];
}

function formatarDataExtensoPg2(dataStr: string): string {
  try {
    const [d, m, a] = dataStr.split("/");
    return `${parseInt(d)} de ${meses()[parseInt(m) - 1]} de ${a}`;
  } catch {
    const hoje = new Date();
    return `${hoje.getDate()} de ${meses()[hoje.getMonth()]} de ${hoje.getFullYear()}`;
  }
}

function formatarDataAtual(): string {
  const hoje = new Date();
  const d = String(hoje.getDate()).padStart(2, "0");
  const m = String(hoje.getMonth() + 1).padStart(2, "0");
  return `${d}/${m}/${hoje.getFullYear()}`;
}

export interface DadosAlvara {
  numeroProcesso: string;
  dataAtuacao?: string;
  valorCausa: string;
  nomeReclamante: string;
  cpfReclamante?: string;
  nomeAdvogado?: string;
  nomeReu?: string;
}

export async function gerarAlvaraPDF(dados: DadosAlvara): Promise<Buffer> {
  const templateBytes = fs.readFileSync(TEMPLATE_PATH);
  const pdfDoc = await PDFDocument.load(templateBytes);
  pdfDoc.registerFontkit(fontkit);

  // Carregar fontes Times New Roman extraídas do template
  let fontRegular: Awaited<ReturnType<typeof pdfDoc.embedFont>>;
  let fontBold: Awaited<ReturnType<typeof pdfDoc.embedFont>>;

  try {
    const regularBytes = fs.readFileSync(FONT_REGULAR_PATH);
    const boldBytes = fs.readFileSync(FONT_BOLD_PATH);
    fontRegular = await pdfDoc.embedFont(regularBytes);
    fontBold = await pdfDoc.embedFont(boldBytes);
  } catch {
    // Fallback para fontes padrão se as TTF não estiverem disponíveis
    fontRegular = await pdfDoc.embedFont(StandardFonts.TimesRoman);
    fontBold = await pdfDoc.embedFont(StandardFonts.TimesRomanBold);
  }

  const pages = pdfDoc.getPages();
  const page1 = pages[0];
  const page2 = pages[1];

  const WHITE = rgb(1, 1, 1);
  const BLACK = rgb(0, 0, 0);

  // Normalizar dados
  const valorLimpo = dados.valorCausa.replace(/^R\$\s*/i, "").trim();
  const valorFmt = `R$ ${valorLimpo}`;
  const nomeUp = dados.nomeReclamante.toUpperCase();
  const reuUp = (dados.nomeReu || "Não informado").toUpperCase();
  const advLimpo = (dados.nomeAdvogado || "").replace(/Advogado[a]?:/i, "").trim();
  const dataAtuacao = dados.dataAtuacao || formatarDataAtual();
  const dataExtensoPg2 = formatarDataExtensoPg2(dataAtuacao);
  const cpf = dados.cpfReclamante || "Não informado";

  // Helper: desenhar retângulo branco (apagar texto)
  function apagar(page: typeof page1, x0: number, muY0: number, x1: number, muY1: number, pad = 2) {
    const y = toY(muY1) - pad;
    const height = (muY1 - muY0) + pad * 2;
    const width = x1 - x0 + pad * 2;
    page.drawRectangle({
      x: x0 - pad,
      y,
      width,
      height,
      color: WHITE,
      borderWidth: 0,
    });
  }

  // Helper: escrever texto
  function escrever(
    page: typeof page1,
    x: number,
    muY: number,
    texto: string,
    bold = false,
    size = FS
  ) {
    const font = bold ? fontBold : fontRegular;
    // muY é a baseline no sistema PyMuPDF (y1 do bbox)
    // Em pdf-lib, y é a baseline no sistema invertido
    page.drawText(texto, {
      x,
      y: toY(muY),
      size,
      font,
      color: BLACK,
    });
  }

  // Helper: medir largura do texto
  function tw(texto: string, bold = false, size = FS): number {
    const font = bold ? fontBold : fontRegular;
    return font.widthOfTextAtSize(texto, size);
  }

  // ─── PÁGINA 1 ─────────────────────────────────────────────────────────────

  // Linha 1: Processo Nº: [valor] (y=174..185)
  apagar(page1, 106, 174, 540, 186);
  escrever(page1, 108.8, 185, `Processo nº ${dados.numeroProcesso}`);

  // Linha 2: Data da Autuação: [valor] (y=190..202)
  apagar(page1, 133, 188, 300, 203);
  escrever(page1, 135.8, 201, dataAtuacao);

  // Linha 3: Valor da causa: [valor] (y=207..218, negrito)
  apagar(page1, 119, 205, 400, 220);
  escrever(page1, 121.7, 218, valorFmt, true);

  // Linha 5: RECLAMANTE: [nome] (y=240..251)
  apagar(page1, 136, 238, 540, 253);
  escrever(page1, 138, 251, nomeUp);

  // Linha 6: CPF: [valor] (y=256..267)
  apagar(page1, 83, 253, 350, 268);
  escrever(page1, 85, 267, cpf);

  // Linha 7: ADVOGADO: [nome] (y=272..283)
  apagar(page1, 123, 270, 540, 285);
  escrever(page1, 125, 283, advLimpo);

  // Linha 8: RÉU: [nome] (y=289..300)
  apagar(page1, 85, 286, 540, 302);
  escrever(page1, 87, 300, reuUp);

  // ─── PARÁGRAFO PRINCIPAL (y=377..445) ─────────────────────────────────────
  apagar(page1, 44, 374, 552, 447);

  const lh = 14.0;
  let y = 377;

  escrever(page1, 44, y, "Determina as medidas necessárias à satisfação do exequente. Fica reconhecido e determinado que a parte reclamante foi");
  y += lh;

  const t2b = `indenizada no valor total de ${valorFmt}`;
  const t2r = ". O respectivo montante encontra-se retido em subconta judicial, aguardando a";
  escrever(page1, 44, y, t2b, true);
  escrever(page1, 44 + tw(t2b, true), y, t2r);
  y += lh;

  const t3b = "indicação e vinculação do banco recebedor";
  const t3r = " por parte do(a) credor(a) ";
  const t3f = " para a imediata";
  let x = 44;
  escrever(page1, x, y, t3b, true); x += tw(t3b, true);
  escrever(page1, x, y, t3r); x += tw(t3r);
  escrever(page1, x, y, nomeUp, true); x += tw(nomeUp, true);
  escrever(page1, x, y, t3f);
  y += lh;

  escrever(page1, 44, y, "efetivação do pagamento. Os autos foram encaminhados à Vara da Fazenda para a execução e posteriormente à Vara das");
  y += lh;
  escrever(page1, 44, y, "Execuções gerando o processo de Execução.");

  // ─── INCISO I (y=458..484) ─────────────────────────────────────────────────
  apagar(page1, 44, 454, 552, 486);

  const yi = 458;
  x = 74;
  escrever(page1, x, yi, "I - DEFIRO", true); x += tw("I - DEFIRO", true);
  escrever(page1, x, yi, " o presente processo em favor de "); x += tw(" o presente processo em favor de ");
  escrever(page1, x, yi, nomeUp, true); x += tw(nomeUp, true);
  escrever(page1, x, yi, ", pelo valor de "); x += tw(", pelo valor de ");
  escrever(page1, x, yi, valorFmt, true); x += tw(valorFmt, true);
  escrever(page1, x, yi, ", contra");

  // Linha 2 do inciso I
  escrever(page1, 44, yi + lh, reuUp, true);
  escrever(page1, 44 + tw(reuUp, true), yi + lh, ".");

  // ─── INCISO III: data entre parênteses (y=521..532) ────────────────────────
  // Apagar o "(10/03/2026)" original: x0=337.8, y0=521.2, x1=383.9, y1=532.4
  apagar(page1, 337, 519, 390, 534);
  escrever(page1, 337.8, 532.4, `(${dataAtuacao})`);

  // ─── PÁGINA 2: data por extenso ────────────────────────────────────────────
  // "SÃO PAULO, 10 de março de 2026" — y=357..367, x=225..371
  // Apagar apenas a parte da data (após "SÃO PAULO, ")
  // "SÃO PAULO, " tem ~60px de largura, começa em x=225
  apagar(page2, 285, 355, 500, 369);
  escrever(page2, 286, 367, dataExtensoPg2, true);

  const pdfBytes = await pdfDoc.save();
  return Buffer.from(pdfBytes);
}
