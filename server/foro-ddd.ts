/**
 * Mapa de Foros TJSP → DDD(s) da comarca
 *
 * Fonte: Tabela de Comarcas do TJSP e DDDs da ANATEL.
 * Cada foro pode ter múltiplos DDDs (ex: São Paulo capital tem 11 e 15).
 * A busca é feita por substring case-insensitive no nome do foro.
 */

export interface EntradaForoDDD {
  /** Substring a ser buscada no nome do foro (case-insensitive) */
  chave: string;
  /** DDDs válidos para esta comarca */
  ddds: number[];
}

export const FORO_DDD_MAP: EntradaForoDDD[] = [
  // ── Capital e Grande SP ──────────────────────────────────────────────────
  { chave: "foro central",          ddds: [11] },
  { chave: "foro regional",         ddds: [11] },
  { chave: "são paulo",             ddds: [11] },
  { chave: "guarulhos",             ddds: [11] },
  { chave: "osasco",                ddds: [11] },
  { chave: "santo andré",           ddds: [11] },
  { chave: "são bernardo",          ddds: [11] },
  { chave: "são caetano",           ddds: [11] },
  { chave: "diadema",               ddds: [11] },
  { chave: "mauá",                  ddds: [11] },
  { chave: "ribeirão pires",        ddds: [11] },
  { chave: "rio grande da serra",   ddds: [11] },
  { chave: "carapicuíba",           ddds: [11] },
  { chave: "itapevi",               ddds: [11] },
  { chave: "jandira",               ddds: [11] },
  { chave: "barueri",               ddds: [11] },
  { chave: "cotia",                 ddds: [11] },
  { chave: "embu",                  ddds: [11] },
  { chave: "taboão da serra",       ddds: [11] },
  { chave: "itapecerica da serra",  ddds: [11] },
  { chave: "mairiporã",             ddds: [11] },
  { chave: "arujá",                 ddds: [11] },
  { chave: "ferraz de vasconcelos", ddds: [11] },
  { chave: "itaquaquecetuba",       ddds: [11] },
  { chave: "mogi das cruzes",       ddds: [11] },
  { chave: "suzano",                ddds: [11] },
  { chave: "poá",                   ddds: [11] },
  { chave: "francisco morato",      ddds: [11] },
  { chave: "franco da rocha",       ddds: [11] },
  { chave: "caieiras",              ddds: [11] },
  { chave: "santana de parnaíba",   ddds: [11] },
  { chave: "pirapora do bom jesus", ddds: [11] },

  // ── Baixada Santista ─────────────────────────────────────────────────────
  { chave: "santos",                ddds: [13] },
  { chave: "são vicente",           ddds: [13] },
  { chave: "praia grande",          ddds: [13] },
  { chave: "cubatão",               ddds: [13] },
  { chave: "guarujá",               ddds: [13] },
  { chave: "itanhaém",              ddds: [13] },
  { chave: "mongaguá",              ddds: [13] },
  { chave: "peruíbe",               ddds: [13] },

  // ── Vale do Paraíba / Litoral Norte ──────────────────────────────────────
  { chave: "são josé dos campos",   ddds: [12] },
  { chave: "taubaté",               ddds: [12] },
  { chave: "jacareí",               ddds: [12] },
  { chave: "pindamonhangaba",       ddds: [12] },
  { chave: "guaratinguetá",         ddds: [12] },
  { chave: "lorena",                ddds: [12] },
  { chave: "cruzeiro",              ddds: [12] },
  { chave: "aparecida",             ddds: [12] },
  { chave: "caraguatatuba",         ddds: [12] },
  { chave: "ubatuba",               ddds: [12] },
  { chave: "são sebastião",         ddds: [12] },
  { chave: "ilhabela",              ddds: [12] },

  // ── Campinas e RMC ───────────────────────────────────────────────────────
  { chave: "campinas",              ddds: [19] },
  { chave: "sumaré",                ddds: [19] },
  { chave: "americana",             ddds: [19] },
  { chave: "santa bárbara d'oeste", ddds: [19] },
  { chave: "nova odessa",           ddds: [19] },
  { chave: "hortolândia",           ddds: [19] },
  { chave: "indaiatuba",            ddds: [19] },
  { chave: "valinhos",              ddds: [19] },
  { chave: "vinhedo",               ddds: [19] },
  { chave: "itatiba",               ddds: [11, 19] },
  { chave: "jaguariúna",            ddds: [19] },
  { chave: "paulínia",              ddds: [19] },
  { chave: "cosmópolis",            ddds: [19] },
  { chave: "artur nogueira",        ddds: [19] },
  { chave: "engenheiro coelho",     ddds: [19] },
  { chave: "holambra",              ddds: [19] },
  { chave: "monte mor",             ddds: [19] },
  { chave: "pedreira",              ddds: [19] },
  { chave: "piracicaba",            ddds: [19] },
  { chave: "limeira",               ddds: [19] },
  { chave: "rio claro",             ddds: [19] },
  { chave: "araras",                ddds: [19] },
  { chave: "leme",                  ddds: [19] },
  { chave: "cordeirópolis",         ddds: [19] },
  { chave: "iracemápolis",          ddds: [19] },
  { chave: "santa gertrudes",       ddds: [19] },
  { chave: "ipeúna",                ddds: [19] },
  { chave: "charqueada",            ddds: [19] },
  { chave: "mogi guaçu",            ddds: [19] },
  { chave: "mogi mirim",            ddds: [19] },
  { chave: "estiva gerbi",          ddds: [19] },
  { chave: "itapira",               ddds: [19] },
  { chave: "amparo",                ddds: [19] },
  { chave: "monte alegre do sul",   ddds: [19] },
  { chave: "pedra bela",            ddds: [19] },
  { chave: "pinhalzinho",           ddds: [19] },
  { chave: "socorro",               ddds: [19] },
  { chave: "bragança paulista",     ddds: [11, 19] },
  { chave: "atibaia",               ddds: [11] },
  { chave: "jundiaí",               ddds: [11] },
  { chave: "várzea paulista",       ddds: [11] },
  { chave: "campo limpo paulista",  ddds: [11] },
  { chave: "jarinu",                ddds: [11] },
  { chave: "cabreúva",              ddds: [11] },
  { chave: "louveira",              ddds: [11] },

  // ── Ribeirão Preto e região ───────────────────────────────────────────────
  { chave: "ribeirão preto",        ddds: [16] },
  { chave: "franca",                ddds: [16] },
  { chave: "sertãozinho",           ddds: [16] },
  { chave: "jardinópolis",          ddds: [16] },
  { chave: "brodowski",             ddds: [16] },
  { chave: "cravinhos",             ddds: [16] },
  { chave: "dumont",                ddds: [16] },
  { chave: "guatapará",             ddds: [16] },
  { chave: "luís antônio",          ddds: [16] },
  { chave: "pradópolis",            ddds: [16] },
  { chave: "serrana",               ddds: [16] },
  { chave: "altinópolis",           ddds: [16] },
  { chave: "batatais",              ddds: [16] },
  { chave: "cajuru",                ddds: [16] },
  { chave: "cássia dos coqueiros",  ddds: [16] },
  { chave: "cristais paulista",     ddds: [16] },
  { chave: "itirapuã",              ddds: [16] },
  { chave: "jeriquara",             ddds: [16] },
  { chave: "patrocínio paulista",   ddds: [16] },
  { chave: "pedregulho",            ddds: [16] },
  { chave: "restinga",              ddds: [16] },
  { chave: "rifaina",               ddds: [16] },
  { chave: "sales oliveira",        ddds: [16] },
  { chave: "são josé da bela vista", ddds: [16] },
  { chave: "araraquara",            ddds: [16] },
  { chave: "são carlos",            ddds: [16] },
  { chave: "jaboticabal",           ddds: [16] },
  { chave: "catanduva",             ddds: [17] },

  // ── Sorocaba e região ─────────────────────────────────────────────────────
  { chave: "sorocaba",              ddds: [15] },
  { chave: "itú",                   ddds: [11, 15] },
  { chave: "salto",                 ddds: [11, 15] },
  { chave: "votorantim",            ddds: [15] },
  { chave: "boituva",               ddds: [15] },
  { chave: "porto feliz",           ddds: [15] },
  { chave: "cerquilho",             ddds: [15] },
  { chave: "tietê",                 ddds: [15] },
  { chave: "tatuí",                 ddds: [15] },
  { chave: "itapetininga",          ddds: [15] },
  { chave: "itapeva",               ddds: [15] },
  { chave: "capão bonito",          ddds: [15] },
  { chave: "itararé",               ddds: [15] },
  { chave: "botucatu",              ddds: [14] },
  { chave: "avaré",                 ddds: [14] },

  // ── Bauru e região ────────────────────────────────────────────────────────
  { chave: "bauru",                 ddds: [14] },
  { chave: "marília",               ddds: [14] },
  { chave: "assis",                 ddds: [18] },
  { chave: "ourinhos",              ddds: [14] },
  { chave: "jaú",                   ddds: [14] },
  { chave: "lençóis paulista",      ddds: [14] },
  { chave: "pederneiras",           ddds: [14] },

  // ── Presidente Prudente e região ──────────────────────────────────────────
  { chave: "presidente prudente",   ddds: [18] },
  { chave: "araçatuba",             ddds: [18] },
  { chave: "birigui",               ddds: [18] },
  { chave: "andradina",             ddds: [18] },
  { chave: "dracena",               ddds: [18] },
  { chave: "adamantina",            ddds: [18] },
  { chave: "osvaldo cruz",          ddds: [18] },
  { chave: "tupã",                  ddds: [14] },

  // ── São José do Rio Preto e região ────────────────────────────────────────
  { chave: "rio preto",             ddds: [17] },
  { chave: "são josé do rio preto", ddds: [17] },
  { chave: "votuporanga",           ddds: [17] },
  { chave: "fernandópolis",         ddds: [17] },
  { chave: "mirassol",              ddds: [17] },
  { chave: "olímpia",               ddds: [17] },
  { chave: "barretos",              ddds: [17] },

  // ── Interior SP (outros) ──────────────────────────────────────────────────
  { chave: "pirassununga",          ddds: [19] },
  { chave: "são joão da boa vista", ddds: [19] },
  { chave: "casa branca",           ddds: [19] },
  { chave: "mococa",                ddds: [19] },
  { chave: "porto ferreira",        ddds: [19] },
  { chave: "descalvado",            ddds: [16] },
  { chave: "ibaté",                 ddds: [16] },
];

/**
 * Extrai os DDDs válidos para um dado foro TJSP.
 * @param nomeForo - Texto do foro como vem do TJSP (ex: "Foro Central Cível", "Foro de Campinas")
 * @returns Array de DDDs válidos, ou array vazio se não encontrado
 */
export function obterDDDsPorForo(nomeForo: string): number[] {
  if (!nomeForo) return [];
  const foro = nomeForo.toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, ""); // remove acentos para comparação

  for (const entrada of FORO_DDD_MAP) {
    const chave = entrada.chave.toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
    if (foro.includes(chave)) {
      return entrada.ddds;
    }
  }
  return [];
}

/**
 * Filtra uma lista de pessoas pelo DDD do foro do processo.
 * Regras:
 * - Se não há foro ou não há DDDs mapeados: retorna todos (sem filtro)
 * - Se há apenas 1 pessoa: retorna ela sem filtrar
 * - Filtra pessoas que têm pelo menos 1 telefone com DDD da comarca
 * - Se o filtro eliminar todos: retorna a lista original (fallback)
 */
export function filtrarPessoasPorDDD(
  pessoas: any[],
  dddsValidos: number[]
): any[] {
  // Sem mapeamento ou lista vazia: sem filtro
  if (dddsValidos.length === 0 || pessoas.length === 0) return pessoas;
  // Apenas 1 pessoa: retornar sem filtrar
  if (pessoas.length === 1) return pessoas;

  const filtradas = pessoas.filter(p => {
    const telefones: any[] = p.telefones?.itens || p.telefones || [];
    if (telefones.length === 0) return false; // sem telefone: excluir
    return telefones.some((t: any) => {
      const ddd = typeof t.ddd === "number" ? t.ddd : parseInt(String(t.ddd), 10);
      return dddsValidos.includes(ddd);
    });
  });

  // Fallback: se filtro eliminou todos, retornar original
  return filtradas.length > 0 ? filtradas : pessoas;
}
