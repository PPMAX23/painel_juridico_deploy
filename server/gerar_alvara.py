#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Gerador de Alvará usando PyMuPDF com redaction.
Preserva imagens de fundo (brasão, marca d'água, assinatura).
"""
import fitz
import sys
import json
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


def apagar_redact(page, x0, y0, x1, y1, pad=1):
    """
    Apaga texto usando redaction - NÃO afeta imagens de fundo.
    """
    rect = fitz.Rect(x0 - pad, y0 - pad, x1 + pad, y1 + pad)
    page.add_redact_annot(rect, fill=(1, 1, 1))
    page.apply_redactions(images=fitz.PDF_REDACT_IMAGE_NONE)


def escrever(page, x, y_baseline, texto, bold=False, size=10.1):
    """Escreve texto. y_baseline é a linha base no sistema PyMuPDF."""
    fontname = "Times-Bold" if bold else "Times-Roman"
    page.insert_text((x, y_baseline), texto, fontname=fontname, fontsize=size, color=(0, 0, 0))


def tw(texto, bold=False, size=10.1):
    """Mede a largura do texto."""
    fontname = "Times-Bold" if bold else "Times-Roman"
    return fitz.get_text_length(texto, fontname=fontname, fontsize=size)


def gerar_alvara_pdf(template_path, output_path, numero_processo, data_atuacao,
                     valor_causa, nome_reclamante, cpf_reclamante, nome_advogado, nome_reu):
    doc = fitz.open(template_path)
    page1 = doc[0]
    page2 = doc[1]

    FS = 10.1

    nome_up = nome_reclamante.upper()
    reu_up = nome_reu.upper()
    adv_limpo = nome_advogado
    for prefix in ["Advogado(a):", "Advogado:", "Advogada:"]:
        if adv_limpo.lower().startswith(prefix.lower()):
            adv_limpo = adv_limpo[len(prefix):].strip()
            break
    valor_limpo = valor_causa.replace("R$", "").strip()
    valor_fmt = "R$ " + valor_limpo
    data_extenso = formatar_data_extenso(data_atuacao)

    # ─── CAIXA DE INFORMAÇÕES ─────────────────────────────────────────────────

    # Processo Nº: (label termina em x=105.8, valor começa em x=108.3)
    apagar_redact(page1, 108.3, 174, 540, 186)
    escrever(page1, 110, 184, "Processo nº " + numero_processo, size=FS)

    # Data da Autuação: (label termina em x=132.8)
    apagar_redact(page1, 133.5, 190, 300, 202)
    escrever(page1, 135, 200, data_atuacao, size=FS)

    # Valor da causa: (label termina em x=118.7)
    apagar_redact(page1, 119.5, 207, 400, 219)
    escrever(page1, 121, 217, valor_fmt, bold=True, size=FS)

    # RECLAMANTE: (label+':' termina em x=138.37, valor original começa em x=138.39 com espaço)
    apagar_redact(page1, 138.4, 239, 540, 252)
    escrever(page1, 139.5, 250, " " + nome_up, size=FS)

    # CPF: (label+':' termina em x=84.9)
    apagar_redact(page1, 85.5, 255, 350, 268)
    escrever(page1, 87, 266, cpf_reclamante, size=FS)

    # ADVOGADO: (label+':' termina em x=125.2)
    apagar_redact(page1, 126, 272, 540, 284)
    escrever(page1, 127, 282, adv_limpo, size=FS)

    # RÉU: (label+':' termina em x=86.6)
    apagar_redact(page1, 87.2, 288, 540, 301)
    escrever(page1, 88, 299, reu_up, size=FS)

    # ─── PARÁGRAFO PRINCIPAL (y=377..445) ─────────────────────────────────────
    apagar_redact(page1, 44, 374, 553, 447)

    lh = 14.0
    y = 387

    escrever(page1, 44, y,
             "Determina as medidas necessárias à satisfação do exequente. "
             "Fica reconhecido e determinado que a parte reclamante foi", size=FS)
    y += lh

    t2b = "indenizada no valor total de " + valor_fmt
    t2r = ". O respectivo montante encontra-se retido em subconta judicial, aguardando a"
    escrever(page1, 44, y, t2b, bold=True, size=FS)
    escrever(page1, 44 + tw(t2b, True, FS), y, t2r, size=FS)
    y += lh

    # Linha 3: posição fixa para 'por parte' baseada no PDF original (x=234.6)
    # O texto 'indicação...' ocupa 43.5..234.6 no original (190.57 pts)
    escrever(page1, 44, y, "indicação e vinculação do banco recebedor", bold=True, size=FS)
    # 'por parte' na posição original
    t3_normal = " por parte do(a) credor(a) "
    escrever(page1, 234.6, y, t3_normal, size=FS)
    # Nome variável: começa logo após " por parte do(a) credor(a) "
    x_nome = 234.6 + tw(t3_normal, False, FS)
    escrever(page1, x_nome, y, nome_up, bold=True, size=FS)
    # ' para a imediata' logo após o nome
    x_apos_nome = x_nome + tw(nome_up, True, FS)
    escrever(page1, x_apos_nome, y, " para a imediata", size=FS)
    y += lh

    escrever(page1, 44, y,
             "efetivação do pagamento. Os autos foram encaminhados à Vara da Fazenda "
             "para a execução e posteriormente à Vara das", size=FS)
    y += lh
    escrever(page1, 44, y, "Execuções gerando o processo de Execução.", size=FS)

    # ─── INCISO I (y=458..484) ─────────────────────────────────────────────────
    apagar_redact(page1, 44, 454, 553, 486)

    y_i = 468
    x = 74
    escrever(page1, x, y_i, "I - DEFIRO", bold=True, size=FS); x += tw("I - DEFIRO", True, FS)
    escrever(page1, x, y_i, " o presente processo em favor de ", size=FS); x += tw(" o presente processo em favor de ", False, FS)
    escrever(page1, x, y_i, nome_up, bold=True, size=FS); x += tw(nome_up, True, FS)
    escrever(page1, x, y_i, ", pelo valor de ", size=FS); x += tw(", pelo valor de ", False, FS)
    escrever(page1, x, y_i, valor_fmt, bold=True, size=FS); x += tw(valor_fmt, True, FS)
    escrever(page1, x, y_i, ", contra", size=FS)

    escrever(page1, 44, y_i + lh, reu_up, bold=True, size=FS)
    escrever(page1, 44 + tw(reu_up, True, FS), y_i + lh, ".", size=FS)

    # ─── INCISO III: data entre parênteses (y=521..532) ────────────────────────
    apagar_redact(page1, 334, 519, 395, 534)
    escrever(page1, 334.4, 531, "(" + data_atuacao + ")", size=FS)

    # ─── PÁGINA 2: data por extenso ────────────────────────────────────────────
    # "SÃO PAULO, 10 de março de 2026" — y=357..367
    # Apagar apenas a parte da data (após "SÃO PAULO, ")
    apagar_redact(page2, 285, 355, 500, 369)
    escrever(page2, 286, 366, data_extenso, bold=True, size=FS)

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
