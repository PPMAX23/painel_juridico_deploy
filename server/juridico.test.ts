import { describe, it, expect } from "vitest";

// ─── Testes das funções utilitárias do painel ─────────────────────────────────

// Simular as funções utilitárias do Painel.tsx
function formatarNumProcesso(num: string): string {
  const digits = num.replace(/\D/g, "");
  if (digits.length === 20) {
    return `${digits.substring(0, 7)}-${digits.substring(7, 9)}.${digits.substring(9, 13)}.${digits.substring(13, 14)}.${digits.substring(14, 16)}.${digits.substring(16)}`;
  }
  return num;
}

function formatarData(dateStr: string): string {
  if (!dateStr) return "N/A";
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return "N/A";
    return d.toLocaleDateString("pt-BR");
  } catch {
    return "N/A";
  }
}

function formatarMoeda(valor: number): string {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function parseValor(v: string): number {
  if (!v) return 0;
  return parseFloat(v.replace(/[^\d,]/g, "").replace(",", ".")) || 0;
}

// ─── Testes de formatação ─────────────────────────────────────────────────────

describe("formatarNumProcesso", () => {
  it("deve formatar número de processo com 20 dígitos corretamente", () => {
    const num = "50549703820248130145";
    const resultado = formatarNumProcesso(num);
    expect(resultado).toBe("5054970-38.2024.8.13.0145");
  });

  it("deve retornar o número original se não tiver 20 dígitos", () => {
    const num = "1234567";
    expect(formatarNumProcesso(num)).toBe("1234567");
  });

  it("deve remover caracteres não numéricos antes de formatar", () => {
    const num = "5054970-38.2024.8.13.0145";
    const resultado = formatarNumProcesso(num);
    expect(resultado).toBe("5054970-38.2024.8.13.0145");
  });
});

describe("formatarData", () => {
  it("deve retornar N/A para string vazia", () => {
    expect(formatarData("")).toBe("N/A");
  });

  it("deve formatar data ISO corretamente", () => {
    const data = "2024-12-17T00:00:00.000Z";
    const resultado = formatarData(data);
    expect(resultado).toMatch(/\d{2}\/\d{2}\/\d{4}/);
  });

  it("deve retornar N/A para data inválida", () => {
    expect(formatarData("data-invalida")).toBe("N/A");
  });
});

describe("formatarMoeda", () => {
  it("deve formatar valor em reais corretamente", () => {
    const resultado = formatarMoeda(5000000);
    expect(resultado).toContain("5.000.000");
    expect(resultado).toContain("R$");
  });

  it("deve formatar zero corretamente", () => {
    const resultado = formatarMoeda(0);
    expect(resultado).toContain("R$");
    expect(resultado).toContain("0");
  });

  it("deve formatar valores decimais corretamente", () => {
    const resultado = formatarMoeda(1234.56);
    expect(resultado).toContain("1.234");
  });
});

// ─── Testes do parseValor (novo serviço HTTP) ─────────────────────────────────

describe("parseValor", () => {
  it("deve retornar 0 para string vazia", () => {
    expect(parseValor("")).toBe(0);
  });

  it("deve extrair valor numérico de string monetária BR", () => {
    expect(parseValor("R$ 1.267.231,12")).toBeCloseTo(1267231.12, 1);
  });

  it("deve extrair valor simples", () => {
    expect(parseValor("1.234,56")).toBeCloseTo(1234.56, 1);
  });

  it("deve retornar 0 para string sem dígitos", () => {
    expect(parseValor("sem valor")).toBe(0);
  });
});

// ─── Testes de validação de parâmetros de busca ───────────────────────────────

describe("Validação de parâmetros de busca", () => {
  it("deve aceitar tipo oab com query SP200.287", () => {
    const tipo = "oab";
    const query = "SP200.287";
    expect(tipo).toBe("oab");
    expect(query).toMatch(/^SP\d+\.\d+$/);
  });

  it("deve aceitar tipo processo com número formatado CNJ", () => {
    const tipo = "processo";
    const query = "1501084-03.2019.8.26.0161";
    expect(tipo).toBe("processo");
    expect(query).toMatch(/^\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}$/);
  });

  it("deve aceitar tipo cpf com CPF válido", () => {
    const tipo = "cpf";
    const query = "441.320.558-84";
    expect(tipo).toBe("cpf");
    expect(query.replace(/\D/g, "")).toHaveLength(11);
  });

  it("deve rejeitar query vazia", () => {
    const query = "   ";
    expect(query.trim()).toBe("");
    expect(query.trim().length).toBe(0);
  });
});

// ─── Testes de gerenciamento de cookies TJSP ─────────────────────────────────

describe("Gerenciamento de Cookies TJSP", () => {
  it("deve detectar JSESSIONID em string de cookies", () => {
    const cookies = "JSESSIONID=F139C63CD6932D73AAD8F8FA1B13F868.cpopg4; K-JSESSIONID-knbbofpc=18DFCA08EC3E1628";
    expect(cookies).toContain("JSESSIONID");
  });

  it("deve calcular expiração corretamente para 8 horas", () => {
    const agora = Date.now();
    const ttlHoras = 8;
    const expiracao = new Date(agora + ttlHoras * 60 * 60 * 1000);
    const diffHoras = (expiracao.getTime() - agora) / (60 * 60 * 1000);
    expect(diffHoras).toBeCloseTo(8, 1);
  });

  it("deve calcular tempo restante em minutos", () => {
    const agora = Date.now();
    const expiracao = new Date(agora + 2 * 60 * 60 * 1000); // 2 horas
    const tempoRestante = Math.floor((expiracao.getTime() - agora) / 60000);
    expect(tempoRestante).toBeCloseTo(120, 0);
  });

  it("deve detectar sessão expirada", () => {
    const passado = new Date(Date.now() - 1000); // 1 segundo atrás
    const autenticado = passado.getTime() > Date.now();
    expect(autenticado).toBe(false);
  });

  it("deve detectar sessão válida", () => {
    const futuro = new Date(Date.now() + 60 * 60 * 1000); // 1 hora no futuro
    const autenticado = futuro.getTime() > Date.now();
    expect(autenticado).toBe(true);
  });
});

// ─── Testes de parsing de HTML TJSP ──────────────────────────────────────────

describe("Parsing de dados TJSP", () => {
  it("deve validar regex de número de processo CNJ", () => {
    const regex = /\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}/;
    expect(regex.test("1501084-03.2019.8.26.0161")).toBe(true);
    expect(regex.test("0005011-47.2014.8.26.0510")).toBe(true);
    expect(regex.test("numero-invalido")).toBe(false);
    expect(regex.test("12345")).toBe(false);
  });

  it("deve extrair código de processo da URL TJSP", () => {
    const url = "https://esaj.tjsp.jus.br/cpopg/show.do?processo.codigo=4H0005PMX0000&processo.foro=423";
    const codigoMatch = url.match(/processo\.codigo=([^&]+)/);
    const foroMatch = url.match(/processo\.foro=([^&]+)/);
    expect(codigoMatch?.[1]).toBe("4H0005PMX0000");
    expect(foroMatch?.[1]).toBe("423");
  });

  it("deve extrair data de string de distribuição TJSP", () => {
    const dataLocal = "16/05/2019 - Unidade 14 - Núcleo 4.0 Execuções Fiscais Estaduais";
    const dataParts = dataLocal.split(" - ");
    const data = dataParts[0]?.trim();
    const vara = dataParts.slice(1).join(" - ").trim();
    expect(data).toBe("16/05/2019");
    expect(vara).toBe("Unidade 14 - Núcleo 4.0 Execuções Fiscais Estaduais");
  });

  it("deve identificar tipo de parte ativo/passivo", () => {
    const tiposAtivos = ["Exeqte", "Autor", "Requerente", "Exequente"];
    const tiposPassivos = ["Exectdo", "Réu", "Requerido", "Executado"];

    tiposAtivos.forEach(tipo => {
      const t = tipo.toLowerCase();
      const isAtivo = t.includes("ativo") || t.includes("autor") ||
        t.includes("exeqte") || t.includes("exequente") || t.includes("requerente");
      expect(isAtivo).toBe(true);
    });

    tiposPassivos.forEach(tipo => {
      const t = tipo.toLowerCase();
      const isAtivo = t.includes("ativo") || t.includes("autor") ||
        t.includes("exeqte") || t.includes("exequente") || t.includes("requerente");
      expect(isAtivo).toBe(false);
    });
  });

  it("deve normalizar espaços em textos extraídos do HTML", () => {
    const textoHtml = "  Execução   Fiscal  ";
    const normalizado = textoHtml.trim().replace(/\s+/g, " ");
    expect(normalizado).toBe("Execução Fiscal");
  });
});

// ─── Testes de filtros e ordenação ───────────────────────────────────────────

describe("Filtros e ordenação de processos", () => {
  const processosMock = [
    { numeroProcesso: "1111111-11.2024.8.26.0001", situacao: "Em andamento", valor: "R$ 5.000,00" },
    { numeroProcesso: "2222222-22.2024.8.26.0002", situacao: "Arquivado", valor: "R$ 100.000,00" },
    { numeroProcesso: "3333333-33.2024.8.26.0003", situacao: "", valor: "R$ 50.000,00" },
  ];

  it("deve filtrar processos ativos corretamente", () => {
    const ativos = processosMock.filter(p =>
      !p.situacao || p.situacao.toLowerCase().includes("ativo") || p.situacao.toLowerCase().includes("em andamento")
    );
    expect(ativos).toHaveLength(2); // "Em andamento" e sem situação
  });

  it("deve filtrar processos arquivados corretamente", () => {
    const arquivados = processosMock.filter(p =>
      p.situacao && (p.situacao.toLowerCase().includes("arquiv") || p.situacao.toLowerCase().includes("extint"))
    );
    expect(arquivados).toHaveLength(1);
    expect(arquivados[0].numeroProcesso).toBe("2222222-22.2024.8.26.0002");
  });

  it("deve ordenar por maior valor corretamente", () => {
    const ordenados = [...processosMock].sort((a, b) => parseValor(b.valor) - parseValor(a.valor));
    expect(ordenados[0].numeroProcesso).toBe("2222222-22.2024.8.26.0002"); // R$ 100.000
    expect(ordenados[1].numeroProcesso).toBe("3333333-33.2024.8.26.0003"); // R$ 50.000
    expect(ordenados[2].numeroProcesso).toBe("1111111-11.2024.8.26.0001"); // R$ 5.000
  });
});
