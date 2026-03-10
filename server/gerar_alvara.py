import fitz
import sys
import json
from datetime import datetime


def formatar_data_extenso(data_str):
    meses = ["janeiro","fevereiro","março","abril","maio","junho",
             "julho","agosto","setembro","outubro","novembro","dezembro"]
    try:
        d, m, a = data_str.split("/")
        return f"{int(d)} de {meses[int(m)-1]} de {a}"
    except Exception:
        hoje = datetime.now()
        return f"{hoje.day} de {meses[hoje.month-1]} de {hoje.year}"


def gerar_alvara_pdf(template_path, output_path, numero_processo, data_atuacao,
                     valor_causa, nome_reclamante, cpf_reclamante, nome_advogado, nome_reu):
    doc = fitz.open(template_path)
    page1 = doc[0]
    page2 = doc[1]

    BLACK = (0, 0, 0)
    WHITE = (1, 1, 1)
    FS = 10.1
    fn = "tiro"
    fb = "tibo"

    nome_up = nome_reclamante.upper()
    reu_up = nome_reu.upper()
    adv_limpo = nome_advogado.replace("Advogado:", "").replace("Advogada:", "").strip()
    valor_fmt = "R$ " + valor_causa
    data_extenso = formatar_data_extenso(data_atuacao)

    def apagar(page, x0, y0, x1, y1, pad=2):
        page.draw_rect(fitz.Rect(x0-pad, y0-pad, x1+pad, y1+pad), color=WHITE, fill=WHITE)

    def escrever(page, x, y_base, texto, bold=False, size=FS):
        page.insert_text((x, y_base), texto, fontname=(fb if bold else fn), fontsize=size, color=BLACK)

    def tw(texto, bold=False, size=FS):
        return fitz.get_text_length(texto, fontname=(fb if bold else fn), fontsize=size)

    # CAIXA DE INFORMACOES
    apagar(page1, 108.8, 172, 540, 186)
    escrever(page1, 108.8, 185, "Processo nº " + numero_processo)

    apagar(page1, 135.8, 188, 300, 202)
    escrever(page1, 135.8, 201, data_atuacao)

    apagar(page1, 121.7, 205, 350, 219)
    escrever(page1, 121.7, 218, valor_fmt, bold=True)

    apagar(page1, 141.4, 238, 540, 252)
    escrever(page1, 141.4, 251, nome_up)

    apagar(page1, 87.9, 253, 300, 268)
    escrever(page1, 87.9, 267, cpf_reclamante)

    apagar(page1, 128.2, 270, 540, 284)
    escrever(page1, 128.2, 283, adv_limpo)

    apagar(page1, 89.6, 286, 540, 301)
    escrever(page1, 89.6, 300, reu_up)

    # PARAGRAFO PRINCIPAL
    apagar(page1, 44, 374, 552, 447)

    lh = 14.0
    y = 377

    escrever(page1, 44, y, "Determina as medidas necessárias à satisfação do exequente. Fica reconhecido e determinado que a parte reclamante foi")
    y += lh

    t2b = "indenizada no valor total de " + valor_fmt
    t2r = ". O respectivo montante encontra-se retido em subconta judicial, aguardando a"
    escrever(page1, 44, y, t2b, bold=True)
    escrever(page1, 44 + tw(t2b, True), y, t2r)
    y += lh

    t3b = "indicação e vinculação do banco recebedor"
    t3r = " por parte do(a) credor(a) "
    t3n = nome_up
    t3f = " para a imediata"
    x = 44
    escrever(page1, x, y, t3b, bold=True); x += tw(t3b, True)
    escrever(page1, x, y, t3r); x += tw(t3r)
    escrever(page1, x, y, t3n, bold=True); x += tw(t3n, True)
    escrever(page1, x, y, t3f)
    y += lh

    escrever(page1, 44, y, "efetivação do pagamento. Os autos foram encaminhados à Vara da Fazenda para a execução e posteriormente à Vara das")
    y += lh
    escrever(page1, 44, y, "Execuções gerando o processo de Execução.")

    # INCISO I
    apagar(page1, 44, 454, 552, 486)

    y_i = 458
    x = 44
    indent = "      "
    escrever(page1, x, y_i, indent); x += tw(indent)
    escrever(page1, x, y_i, "I - DEFIRO", bold=True); x += tw("I - DEFIRO", True)
    escrever(page1, x, y_i, " o presente processo em favor de "); x += tw(" o presente processo em favor de ")
    escrever(page1, x, y_i, nome_up, bold=True); x += tw(nome_up, True)
    escrever(page1, x, y_i, ", pelo valor de "); x += tw(", pelo valor de ")
    escrever(page1, x, y_i, valor_fmt, bold=True); x += tw(valor_fmt, True)
    escrever(page1, x, y_i, ", contra")

    escrever(page1, 44, y_i + lh, reu_up, bold=True)
    escrever(page1, 44 + tw(reu_up, True), y_i + lh, ".")

    # INCISO III: data entre parenteses
    apagar(page1, 334.4, 519, 392, 534)
    escrever(page1, 334.4, 532.4, "(" + data_atuacao + ")")

    # PAGINA 2: data por extenso
    rects_data = page2.search_for("10 de mar")
    if rects_data:
        r = rects_data[0]
        apagar(page2, r.x0, r.y0, r.x1 + 80, r.y1)
        escrever(page2, r.x0, r.y1, data_extenso, bold=True)

    doc.save(output_path)
    doc.close()


if __name__ == "__main__":
    data = json.loads(sys.argv[1])
    gerar_alvara_pdf(
        template_path=data["template_path"],
        output_path=data["output_path"],
        numero_processo=data["numero_processo"],
        data_atuacao=data["data_atuacao"],
        valor_causa=data["valor_causa"],
        nome_reclamante=data["nome_reclamante"],
        cpf_reclamante=data.get("cpf_reclamante", "Não informado"),
        nome_advogado=data.get("nome_advogado", ""),
        nome_reu=data.get("nome_reu", "Não informado"),
    )
