#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Gerador de Alvará usando PyMuPDF.
Estratégia: remove todo o texto do stream original (preservando imagens)
e reescreve o texto com os dados novos usando insert_text.
Isso garante que brasão, marca d'água e assinatura fiquem 100% intactos.
"""
import fitz
import sys
import json
import re
from datetime import datetime

MESES = [
    "janeiro", "fevereiro", "março", "abril", "maio", "junho",
    "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
]


def formatar_data_extenso(data_str):
    try:
        d, m, a = data_str.split("/")
        return f"{int(d)} de {MESES[int(m)-1]} de {a}"
    except Exception:
        hoje = datetime.now()
        return f"{hoje.day} de {MESES[hoje.month-1]} de {hoje.year}"


def formatar_data_atual():
    hoje = datetime.now()
    return f"{hoje.day:02d}/{hoje.month:02d}/{hoje.year}"


def tw(texto, bold=False, size=10.1):
    """Mede a largura do texto com as fontes padrão do PDF.
    Corrige subestimacao de 2.525 pts por caractere acentuado (ord > 127)
    causada por bug no get_text_length do PyMuPDF com UTF-8.
    """
    fontname = "Times-Bold" if bold else "Times-Roman"
    w = fitz.get_text_length(texto, fontname=fontname, fontsize=size)
    # Compensar subestimacao por caracteres acentuados
    n_acentos = sum(1 for c in texto if ord(c) > 127)
    if n_acentos > 0:
        w += n_acentos * 2.525
    return w


def escrever(page, x, y_baseline, texto, bold=False, size=10.1):
    """Escreve texto na página. y_baseline é a coordenada y1 do bbox (baseline)."""
    fontname = "Times-Bold" if bold else "Times-Roman"
    page.insert_text((x, y_baseline), texto, fontname=fontname, fontsize=size, color=(0, 0, 0))


def remover_texto_stream(doc, xref):
    """
    Remove todos os blocos BT...ET do stream de conteúdo da página,
    preservando completamente as imagens e elementos gráficos.
    """
    stream = doc.xref_stream(xref)
    if not stream:
        return
    text = stream.decode('latin-1')
    # Remover blocos de texto marcados com BDC/EMC
    text_limpo = re.sub(r'BDC\s*BT.*?ET\s*EMC', 'BDC\nEMC', text, flags=re.DOTALL)
    # Remover blocos BT...ET soltos (sem BDC/EMC)
    text_limpo = re.sub(r'\nBT\b.*?\bET\n', '\n', text_limpo, flags=re.DOTALL)
    doc.update_stream(xref, text_limpo.encode('latin-1'))


def gerar_alvara_pdf(template_path, output_path, numero_processo, data_atuacao,
                     valor_causa, nome_reclamante, cpf_reclamante, nome_advogado, nome_reu):
    doc = fitz.open(template_path)
    page1 = doc[0]
    page2 = doc[1]

    # ── Normalizar dados ──────────────────────────────────────────────────────
    valor_limpo = valor_causa.replace("R$", "").strip()
    valor_fmt = "R$ " + valor_limpo
    nome_up = nome_reclamante.upper()
    reu_up = nome_reu.upper()
    adv_limpo = nome_advogado
    for prefix in ["Advogado(a):", "Advogado:", "Advogada:"]:
        if adv_limpo.lower().startswith(prefix.lower()):
            adv_limpo = adv_limpo[len(prefix):].strip()
            break
    data_extenso = formatar_data_extenso(data_atuacao)

    # ── Remover todo o texto dos streams (preserva imagens) ───────────────────
    remover_texto_stream(doc, 15)   # página 1
    remover_texto_stream(doc, 20)   # página 2

    FS = 10.1
    FS_TITULO = 10.5
    FS_PG2 = 9.8

    # ════════════════════════════════════════════════════════════════════════
    # PÁGINA 1 — reescrever todo o texto
    # ════════════════════════════════════════════════════════════════════════

    # ── Cabeçalho (fixo) ─────────────────────────────────────────────────────
    escrever(page1, 246.6, 94.1,  "PODER JUDICIÁRIO",                           bold=True,  size=FS_TITULO)
    escrever(page1, 190.9, 108.4, "TRIBUNAL DE JUSTIÇA DO ESTADO DE SP",        bold=True,  size=FS_TITULO)
    escrever(page1, 174.8, 123.4, "PROCEDIMENTO DO JUIZADO ESPECIAL CÍVEL",     bold=True,  size=FS_TITULO)
    escrever(page1, 206.5, 137.6, "PROCESSO JUDICIAL ELETRÔNICO",               bold=True,  size=FS_TITULO)

    # ── Caixa de informações ──────────────────────────────────────────────────
    escrever(page1, 51.8,  174.0, "Processo Nº:",    bold=True,  size=FS)
    escrever(page1, 105.8, 174.0, " " + numero_processo,         size=FS)

    escrever(page1, 51.8,  190.5, "Data da Autuação:", bold=True, size=FS)
    escrever(page1, 132.8, 190.5, " " + data_atuacao,            size=FS)

    escrever(page1, 51.8,  207.0, "Valor da causa:", bold=True,  size=FS)
    escrever(page1, 118.7, 207.0, " ",                            size=FS)
    escrever(page1, 121.2, 207.0, valor_fmt,          bold=True,  size=FS)

    escrever(page1, 51.8,  223.5, "Partes:",          bold=True,  size=FS)

    escrever(page1, 51.8,  240.0, "    ",                         size=FS)
    escrever(page1, 61.9,  240.0, "RECLAMANTE:",      bold=True,  size=FS)
    escrever(page1, 138.4, 240.0, " " + nome_up,                  size=FS)

    escrever(page1, 51.8,  255.7, "    ",                         size=FS)
    escrever(page1, 61.9,  255.7, "CPF:",             bold=True,  size=FS)
    escrever(page1, 84.9,  255.7, " " + cpf_reclamante,           size=FS)

    escrever(page1, 51.8,  272.2, "    ",                         size=FS)
    escrever(page1, 61.9,  272.2, "ADVOGADO:",        bold=True,  size=FS)
    escrever(page1, 125.2, 272.2, " " + adv_limpo,                size=FS)

    escrever(page1, 51.8,  288.7, "    ",                         size=FS)
    escrever(page1, 61.9,  288.7, "RÉU:",             bold=True,  size=FS)
    escrever(page1, 86.6,  288.7, " " + reu_up,                   size=FS)

    # ── Art. 536 (fixo) ───────────────────────────────────────────────────────
    escrever(page1, 43.5, 324.7, "Art. 536.", bold=True, size=FS)
    escrever(page1, 81.7, 324.7,
             " No cumprimento de sentença que reconheça a exigibilidade de obrigação de fazer ou não fazer, o juiz, de ofício ou",
             size=FS)
    escrever(page1, 43.5, 339.0,
             "a requerimento, para a efetivação da tutela específica ou a obtenção de tutela pelo resultado prático equivalente, determinará",
             size=FS)
    escrever(page1, 43.5, 353.2,
             "as medidas necessárias à satisfação do exequente.",
             size=FS)

    # ── Parágrafo principal (variável) ────────────────────────────────────────
    escrever(page1, 43.5, 377.2,
             "Determina as medidas necessárias à satisfação do exequente. Fica reconhecido e determinado que a parte reclamante foi",
             size=FS)

    # Linha 2: "indenizada no valor total de R$ X.XXX,XX. O respectivo montante..."
    # Posições fixas baseadas no PDF original para os segmentos não-variáveis
    t2b = "indenizada no valor total de " + valor_fmt
    escrever(page1, 43.5, 391.5, t2b, bold=True, size=FS)
    # " . O respectivo montante..." começa logo após o valor (calculado)
    x2r = 43.5 + tw(t2b, True, FS)
    t2r = ". O respectivo montante encontra-se retido em subconta judicial, "
    escrever(page1, x2r, 391.5, t2r, size=FS)
    # "aguardando a" - posição fixa do PDF original: x=492.3
    escrever(page1, 492.3, 391.5, "aguardando a", bold=True, size=FS)

    # Linha 3: calcular posicoes dinamicamente para eliminar espacos
    t3a = "indicação e vinculação do banco recebedor"
    escrever(page1, 43.5, 405.7, t3a, bold=True, size=FS)
    x3 = 43.5 + tw(t3a, True, FS)
    t3b = " por parte do(a) credor(a) "
    escrever(page1, x3, 405.7, t3b, size=FS)
    x3 += tw(t3b, False, FS)
    escrever(page1, x3, 405.7, nome_up, bold=True, size=FS)
    x3 += tw(nome_up, True, FS)
    escrever(page1, x3, 405.7, " para a imediata", size=FS)

    escrever(page1, 43.5, 420.0,
             "efetivação do pagamento. Os autos foram encaminhados à Vara da Fazenda para a execução e posteriormente à Vara das",
             size=FS)
    escrever(page1, 43.5, 434.2, "Execuções gerando o processo de Execução.", size=FS)

    # ── Inciso I (variável) ───────────────────────────────────────────────────
    x = 73.5
    escrever(page1, x, 458.2, "I - DEFIRO", bold=True, size=FS); x += tw("I - DEFIRO", True, FS)
    t_favor = " o presente processo em favor de "
    escrever(page1, x, 458.2, t_favor, size=FS); x += tw(t_favor, False, FS)
    escrever(page1, x, 458.2, nome_up, bold=True, size=FS); x += tw(nome_up, True, FS)
    t_valor = ", pelo valor de "
    escrever(page1, x, 458.2, t_valor, size=FS); x += tw(t_valor, False, FS)
    escrever(page1, x, 458.2, valor_fmt, bold=True, size=FS); x += tw(valor_fmt, True, FS)
    escrever(page1, x, 458.2, ", contra", size=FS)

    escrever(page1, 43.5, 472.5, reu_up, bold=True, size=FS)
    escrever(page1, 43.5 + tw(reu_up, True, FS), 472.5, ".", size=FS)

    # ── Incisos II a VII (fixos) ──────────────────────────────────────────────
    escrever(page1, 73.5, 497.2, "II -", bold=True, size=FS)
    escrever(page1, 87.3, 497.2, " Valor sujeito a revisão administrativa e atualização monetária.", size=FS)

    # Inciso III com data variável
    escrever(page1, 73.5, 521.2, "III -", bold=True, size=FS)
    escrever(page1, 91.2, 521.2, f" Inclua-se a requisição de pagamento na ordem cronológica ({data_atuacao}).", size=FS)

    escrever(page1, 73.5, 545.2, "IV -", bold=True, size=FS)
    escrever(page1, 90.5, 545.2, " O Juízo da Execução deverá comunicar imediatamente fatos supervenientes.", size=FS)

    escrever(page1, 73.5, 570.0, "V -", bold=True, size=FS)
    escrever(page1, 86.5, 570.0, " Cientifiquem-se o Juízo da execução e a parte credora.", size=FS)

    escrever(page1, 73.5, 594.0, "VI -", bold=True, size=FS)
    escrever(page1, 90.7, 594.0, " Intime-se o Ente devedor para fins de repasses.", size=FS)

    escrever(page1, 73.5, 618.0, "VII -", bold=True, size=FS)
    escrever(page1, 94.6, 618.0, " Após, aguarde-se pagamento.", size=FS)

    # ════════════════════════════════════════════════════════════════════════
    # PÁGINA 2 — reescrever todo o texto
    # ════════════════════════════════════════════════════════════════════════

    # ── Cabeçalho (fixo) ─────────────────────────────────────────────────────
    escrever(page2, 177.2, 31.1,  "TERMO DE SIGILO E LIBERAÇÃO DE VALORES",          bold=True, size=FS_TITULO)
    escrever(page2, 135.0, 46.1,  "ANEXO I - PROCEDIMENTO ADMINISTRATIVO DE PAGAMENTO", bold=True, size=FS_TITULO)

    # ── Incisos VIII a XIII (fixos) ───────────────────────────────────────────
    escrever(page2, 73.5, 82.5,  "VIII - DA CONFIDENCIALIDADE:", bold=True, size=FS)
    escrever(page2, 233.0, 82.5, " Acesso restrito ao titular do crédito e ao seu advogado constituído.", size=FS)

    escrever(page2, 73.5, 107.2, "IX - DA AUDITORIA FINANCEIRA:", bold=True, size=FS)
    escrever(page2, 238.1, 107.2, " Auditor Fiscal dará início ao processo de verificação e transferência.", size=FS)

    escrever(page2, 73.5, 131.2, "X - DA EFETIVAÇÃO DO PAGAMENTO:", bold=True, size=FS)
    escrever(page2, 261.7, 131.2, " O repasse ocorrerá via TED/PIX assim que homologado.", size=FS)

    escrever(page2, 73.5, 155.2, "XI - DAS TARIFAS E PRAZOS:", bold=True, size=FS)
    escrever(page2, 215.0, 155.2, " Absoluta isenção de cobranças de taxas judiciais prévias.", size=FS)

    escrever(page2, 73.5, 180.0, "XII - DAS PENALIDADES:", bold=True, size=FS)
    escrever(page2, 195.9, 180.0, " A adulteração constitui crime previsto no Código Penal.", size=FS)

    escrever(page2, 73.5, 204.0, "XIII -", bold=True, size=FS)
    escrever(page2, 98.5, 204.0, " Cumpra-se com urgência.", size=FS)

    # ── Assinatura (fixa) ─────────────────────────────────────────────────────
    escrever(page2, 234.1, 308.6, "Rita de Cassia de Brito Morais", bold=True, size=FS_PG2)
    escrever(page2, 216.6, 331.8, "Magistrada / Responsável pela Expedição",      size=FS_PG2)

    # ── Data por extenso (variável) ───────────────────────────────────────────
    escrever(page2, 225.2, 356.6, "SÃO PAULO, " + data_extenso, bold=True, size=FS_PG2)

    doc.save(output_path, garbage=4, deflate=True)
    doc.close()


if __name__ == "__main__":
    data = json.loads(sys.argv[1])
    gerar_alvara_pdf(
        template_path=data["template_path"],
        output_path=data["output_path"],
        numero_processo=data["numero_processo"],
        data_atuacao=data.get("data_atuacao") or formatar_data_atual(),
        valor_causa=data["valor_causa"],
        nome_reclamante=data["nome_reclamante"],
        cpf_reclamante=data.get("cpf_reclamante") or "Não informado",
        nome_advogado=data.get("nome_advogado") or "",
        nome_reu=data.get("nome_reu") or "Não informado",
    )
