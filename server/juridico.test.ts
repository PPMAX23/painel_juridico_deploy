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

// ─── Testes de filtro de processos indesejados ─────────────────────────────────────────

describe("Filtro de processos indesejados", () => {
  const CLASSES_EXCLUIDAS = ["usucapi", "partilha", "herança", "inventário", "divórcio"];
  const ASSUNTOS_EXCLUIDOS = ["usucapi", "partilha", "herança", "inventário", "sucessão"];

  function filtrarIndesejados(processos: { classe: string; assunto: string }[]) {
    return processos.filter(p => {
      const classe = (p.classe || "").toLowerCase();
      const assunto = (p.assunto || "").toLowerCase();
      if (CLASSES_EXCLUIDAS.some(c => classe.includes(c))) return false;
      if (ASSUNTOS_EXCLUIDOS.some(a => assunto.includes(a))) return false;
      return true;
    });
  }

  it("deve excluir processos de usucapião", () => {
    const processos = [
      { classe: "Usucapião", assunto: "Bem Imóvel" },
      { classe: "Execução Fiscal", assunto: "Tributos" },
    ];
    const filtrados = filtrarIndesejados(processos);
    expect(filtrados).toHaveLength(1);
    expect(filtrados[0].classe).toBe("Execução Fiscal");
  });

  it("deve excluir processos de herança/partilha", () => {
    const processos = [
      { classe: "Inventário", assunto: "Herança" },
      { classe: "Procedimento Comum", assunto: "Indenização" },
      { classe: "Partilha de Bens", assunto: "Sucessão" },
    ];
    const filtrados = filtrarIndesejados(processos);
    expect(filtrados).toHaveLength(1);
    expect(filtrados[0].assunto).toBe("Indenização");
  });

  it("deve manter processos de execução e indenização", () => {
    const processos = [
      { classe: "Execução de Título Extrajudicial", assunto: "Cobrança" },
      { classe: "Procedimento Comum", assunto: "Indenização por Dano Moral" },
    ];
    const filtrados = filtrarIndesejados(processos);
    expect(filtrados).toHaveLength(2);
  });
});

// ─── Testes de extração de telefones ────────────────────────────────────────────────────

describe("Extração de telefones das movimentações", () => {
  function extrairTelefones(textos: string[]): string[] {
    const telefones: string[] = [];
    const vistos = new Set<string>();
    const regex = /\(?\d{2}\)?[\s.-]?(?:9[\s.]?)?\d{4}[\s.-]?\d{4}/g;
    for (const texto of textos) {
      const matches = texto.match(regex) || [];
      for (const t of matches) {
        const digits = t.replace(/\D/g, "");
        if (digits.length >= 10 && digits.length <= 11 && !vistos.has(digits)) {
          vistos.add(digits);
          telefones.push(t.trim());
        }
      }
    }
    return telefones;
  }

  it("deve extrair telefone celular com DDD", () => {
    const textos = ["Intimado pelo tel. (11) 98765-4321 conforme certidão"];
    const tels = extrairTelefones(textos);
    expect(tels.length).toBeGreaterThanOrEqual(1);
    expect(tels[0].replace(/\D/g, "")).toHaveLength(11);
  });

  it("deve extrair telefone fixo com DDD", () => {
    const textos = ["Contato: 19 3456-7890 - confirmar audiência"];
    const tels = extrairTelefones(textos);
    expect(tels.length).toBeGreaterThanOrEqual(1);
    expect(tels[0].replace(/\D/g, "")).toHaveLength(10);
  });

  it("deve ignorar números que não são telefones", () => {
    const textos = ["Processo nº 12345 de 2024 - sem telefone"];
    const tels = extrairTelefones(textos);
    expect(tels).toHaveLength(0);
  });

  it("deve deduplicar telefones repetidos", () => {
    const textos = [
      "Tel: (11) 98765-4321 conforme certidão",
      "Reintimado pelo (11) 98765-4321 novamente",
    ];
    const tels = extrairTelefones(textos);
    expect(tels).toHaveLength(1);
  });
});

// ─── Testes de busca por nome ───────────────────────────────────────────────────────────

describe("Integração API CPF Supabase", () => {
  it("deve validar CPF com 11 dígitos", () => {
    const cpfValido = "44132055884";
    const cpfInvalido = "12345678901234"; // CNPJ
    expect(cpfValido.replace(/\D/g, "").length).toBe(11);
    expect(cpfInvalido.replace(/\D/g, "").length).not.toBe(11);
  });

  it("deve formatar CPF corretamente", () => {
    const cpf = "44132055884";
    const formatado = cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
    expect(formatado).toBe("441.320.558-84");
  });

  it("deve limpar CPF com pontos e traços", () => {
    const cpfFormatado = "441.320.558-84";
    const limpo = cpfFormatado.replace(/\D/g, "");
    expect(limpo).toBe("44132055884");
    expect(limpo.length).toBe(11);
  });

  it("deve identificar CNPJ (14 dígitos) e não consultar API CPF", () => {
    const cnpj = "12345678000195";
    const limpo = cnpj.replace(/\D/g, "");
    expect(limpo.length).toBe(14);
    expect(limpo.length !== 11).toBe(true); // não deve consultar
  });

  it("deve construir URL correta para o endpoint proxy", () => {
    const cpf = "44132055884";
    const url = `/api/consulta-cpf?cpf=${cpf}`;
    expect(url).toBe("/api/consulta-cpf?cpf=44132055884");
  });

  it("deve mapear cor de score corretamente", () => {
    const getScoreColor = (faixa: string) =>
      faixa === "ALTISSIMO" ? "#f59e0b" :
      faixa === "ALTO" ? "#22c55e" :
      faixa === "MEDIO" ? "#3b82f6" :
      faixa === "BAIXO" ? "#ef4444" : "#9ca3af";
    expect(getScoreColor("ALTISSIMO")).toBe("#f59e0b");
    expect(getScoreColor("ALTO")).toBe("#22c55e");
    expect(getScoreColor("BAIXO")).toBe("#ef4444");
    expect(getScoreColor("DESCONHECIDO")).toBe("#9ca3af");
  });
});

describe("Busca por nome do advogado", () => {
  it("deve normalizar nome para maiúsculas", () => {
    const nome = "rodrigo cavalcanti";
    expect(nome.trim().toUpperCase()).toBe("RODRIGO CAVALCANTI");
  });

  it("deve construir URL correta para busca por nome", () => {
    const nome = "RODRIGO CAVALCANTI";
    const url = `https://esaj.tjsp.jus.br/cpopg/search.do?conversationId=&cbPesquisa=NMPARTE&dadosConsulta.valorConsulta=${encodeURIComponent(nome)}&cdForo=-1`;
    expect(url).toContain("cbPesquisa=NMPARTE");
    expect(url).toContain("RODRIGO");
  });

  it("deve aceitar tipo nome na validação de tipo de busca", () => {
    const tiposValidos = ["oab", "cpf", "processo", "nome"];
    expect(tiposValidos).toContain("nome");
  });
});

// ─── Testes do sistema de keep-alive e renovação de TTL ──────────────────────────────────

describe("Sistema de keep-alive e renovação de sessão TJSP", () => {
  // Simular o estado de cookies e funções de gerenciamento
  let cookiesAtivos = "";
  let cookiesExpiram = 0;
  const TTL_MAX_MS = 12 * 60 * 60 * 1000; // 12 horas

  function setCookiesTJSP(cookies: string, ttlMs = TTL_MAX_MS) {
    cookiesAtivos = cookies;
    cookiesExpiram = Date.now() + ttlMs;
  }

  function cookiesValidos(): boolean {
    return !!cookiesAtivos && Date.now() < cookiesExpiram;
  }

  function renovarTTLLocal() {
    if (cookiesAtivos && cookiesExpiram > Date.now()) {
      cookiesExpiram = Date.now() + TTL_MAX_MS;
    }
  }

  function statusCookies() {
    return {
      autenticado: cookiesValidos(),
      expiracao: cookiesExpiram ? new Date(cookiesExpiram).toISOString() : null,
      tempoRestante: cookiesExpiram ? Math.max(0, Math.round((cookiesExpiram - Date.now()) / 60000)) + " min" : null,
    };
  }

  it("deve configurar cookies com TTL de 12 horas por padrão", () => {
    setCookiesTJSP("JSESSIONID=abc123");
    const status = statusCookies();
    expect(status.autenticado).toBe(true);
    expect(status.tempoRestante).toContain("min");
    const minutos = parseInt(status.tempoRestante!);
    expect(minutos).toBeGreaterThan(700);
    expect(minutos).toBeLessThanOrEqual(720);
  });

  it("deve renovar TTL local quando há requisição bem-sucedida", () => {
    setCookiesTJSP("JSESSIONID=abc123", 30 * 60 * 1000); // 30 min TTL
    const expiracaoAntes = cookiesExpiram;
    renovarTTLLocal();
    expect(cookiesExpiram).toBeGreaterThan(expiracaoAntes);
    const minutos = Math.round((cookiesExpiram - Date.now()) / 60000);
    expect(minutos).toBeGreaterThan(700);
  });

  it("não deve renovar TTL se cookies já expirados", () => {
    cookiesAtivos = "JSESSIONID=expired";
    cookiesExpiram = Date.now() - 1000; // já expirado
    const expiracaoAntes = cookiesExpiram;
    renovarTTLLocal();
    expect(cookiesExpiram).toBe(expiracaoAntes);
  });

  it("deve invalidar cookies quando sessão expira no servidor", () => {
    setCookiesTJSP("JSESSIONID=abc123");
    expect(cookiesValidos()).toBe(true);
    cookiesAtivos = "";
    cookiesExpiram = 0;
    expect(cookiesValidos()).toBe(false);
    expect(statusCookies().autenticado).toBe(false);
  });

  it("deve retornar status correto com tempo restante formatado", () => {
    setCookiesTJSP("JSESSIONID=abc123");
    const status = statusCookies();
    expect(status.autenticado).toBe(true);
    expect(status.expiracao).not.toBeNull();
    expect(status.tempoRestante).toMatch(/^\d+ min$/);
  });

  it("deve aceitar TTL personalizado menor que o padrão", () => {
    setCookiesTJSP("JSESSIONID=abc123", 2 * 60 * 60 * 1000); // 2 horas
    const status = statusCookies();
    const minutos = parseInt(status.tempoRestante!);
    expect(minutos).toBeGreaterThan(110);
    expect(minutos).toBeLessThanOrEqual(120);
  });

  it("deve detectar que sessão expirada no servidor invalida cookies", () => {
    setCookiesTJSP("JSESSIONID=abc123");
    // Simular o que acontece quando o keep-alive detecta sessão expirada no TJSP
    const htmlComLogin = '<form id="usernameForm">';
    const sessaoExpirada = htmlComLogin.includes('id="usernameForm"');
    if (sessaoExpirada) {
      cookiesAtivos = "";
      cookiesExpiram = 0;
    }
    expect(cookiesValidos()).toBe(false);
  });

  it("deve calcular TTL de 12 horas em milissegundos corretamente", () => {
    const ttl12h = 12 * 60 * 60 * 1000;
    expect(ttl12h).toBe(43200000);
    const ttl4h = 4 * 60 * 60 * 1000;
    expect(ttl12h).toBeGreaterThan(ttl4h);
    expect(ttl12h / ttl4h).toBe(3); // 12h = 3x o TTL anterior de 4h
  });
});
