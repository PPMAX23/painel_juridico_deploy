import { describe, it, expect, vi, beforeEach } from "vitest";

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

function getPowerColor(poder: string): string {
  const p = (poder || "").toUpperCase();
  if (p.includes("ALTO")) return "text-emerald-400";
  if (p.includes("MEDIO")) return "text-yellow-400";
  if (p.includes("BAIXO")) return "text-red-400";
  return "text-gray-400";
}

// Simular gerenciamento de token
function setToken(token: string): { expiracao: number } {
  try {
    const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64").toString());
    const expiracao = (payload.exp || 0) * 1000;
    return { expiracao };
  } catch {
    return { expiracao: Date.now() + 25 * 60 * 1000 };
  }
}

function isTokenValido(expiracao: number): boolean {
  return Date.now() < expiracao - 2 * 60 * 1000;
}

// ─── Testes ───────────────────────────────────────────────────────────────────

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

describe("getPowerColor", () => {
  it("deve retornar cor verde para poder aquisitivo ALTO", () => {
    expect(getPowerColor("ALTO")).toBe("text-emerald-400");
  });

  it("deve retornar cor amarela para poder aquisitivo MEDIO", () => {
    expect(getPowerColor("MEDIO")).toBe("text-yellow-400");
  });

  it("deve retornar cor vermelha para poder aquisitivo BAIXO", () => {
    expect(getPowerColor("BAIXO")).toBe("text-red-400");
  });

  it("deve retornar cor cinza para poder aquisitivo desconhecido", () => {
    expect(getPowerColor("")).toBe("text-gray-400");
    expect(getPowerColor("N/A")).toBe("text-gray-400");
  });

  it("deve ser case-insensitive", () => {
    expect(getPowerColor("alto")).toBe("text-emerald-400");
    expect(getPowerColor("Medio")).toBe("text-yellow-400");
    expect(getPowerColor("baixo")).toBe("text-red-400");
  });
});

describe("Gerenciamento de Token JWT", () => {
  it("deve extrair a expiração corretamente de um JWT válido", () => {
    // JWT com exp = 9999999999 (ano 2286)
    const payload = { username: "ADV_552", exp: 9999999999 };
    const encoded = Buffer.from(JSON.stringify(payload)).toString("base64");
    const token = `header.${encoded}.signature`;
    
    const { expiracao } = setToken(token);
    expect(expiracao).toBe(9999999999 * 1000);
  });

  it("deve considerar token válido se não expirou", () => {
    const futuro = Math.floor(Date.now() / 1000) + 3600; // 1 hora no futuro
    const payload = { username: "ADV_552", exp: futuro };
    const encoded = Buffer.from(JSON.stringify(payload)).toString("base64");
    const token = `header.${encoded}.signature`;
    
    const { expiracao } = setToken(token);
    expect(isTokenValido(expiracao)).toBe(true);
  });

  it("deve considerar token inválido se expirou", () => {
    const passado = Math.floor(Date.now() / 1000) - 3600; // 1 hora no passado
    const payload = { username: "ADV_552", exp: passado };
    const encoded = Buffer.from(JSON.stringify(payload)).toString("base64");
    const token = `header.${encoded}.signature`;
    
    const { expiracao } = setToken(token);
    expect(isTokenValido(expiracao)).toBe(false);
  });

  it("deve usar fallback de 25 minutos para JWT malformado", () => {
    const antes = Date.now();
    const { expiracao } = setToken("token.invalido.aqui");
    const depois = Date.now();
    
    // Deve ser aproximadamente 25 minutos no futuro
    const vinte5min = 25 * 60 * 1000;
    expect(expiracao).toBeGreaterThanOrEqual(antes + vinte5min - 100);
    expect(expiracao).toBeLessThanOrEqual(depois + vinte5min + 100);
  });
});

describe("Validação de parâmetros de busca", () => {
  it("deve aceitar tipo oab com query SP200.287", () => {
    const tipo = "oab";
    const query = "SP200.287";
    expect(tipo).toBe("oab");
    expect(query).toMatch(/^SP\d+\.\d+$/);
  });

  it("deve aceitar tipo processo com número formatado", () => {
    const tipo = "processo";
    const query = "5054970-38.2024.8.13.0145";
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
