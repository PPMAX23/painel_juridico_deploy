import { useState, useEffect, useRef, useCallback } from "react";
import { toast } from "sonner";

// ─── Tipos ────────────────────────────────────────────────────────────────────
interface OsintData {
  RENDA?: string;
  IDADE?: string;
  DATA_NASCIMENTO_RAW?: string;
  SCORE?: string;
  TELEFONES?: string;
  RG?: string;
  NOME_MAE?: string;
  NOME_PAI?: string;
  TITULO_ELEITOR?: string;
  PODER_AQUISITIVO?: string;
  FAIXA_PODER_AQUISITIVO?: string;
  erro?: string;
  CNPJ_SKIP?: boolean;
  CNPJ?: string;
  RAZAO_SOCIAL?: string;
  NOME_FANTASIA?: string;
  SITUACAO_CADASTRAL?: string;
  DATA_ABERTURA?: string;
  PORTE?: string;
  NATUREZA_JURIDICA?: string;
  CAPITAL_SOCIAL?: string;
  ATIVIDADE_PRINCIPAL?: string;
  SOCIOS?: string;
}

interface AutorEnriquecido {
  autor_index: number;
  nome: string;
  documento: string;
  tipo_documento: string;
  tipo_pessoa: string;
  advogados: { nome: string; oab_completa: string }[];
  osint: OsintData;
}

interface Parte {
  polo: string;
  tipoParte: string;
  nome: string;
  tipoPessoa: string;
  documentosPrincipais?: { numero: string; tipo: string }[];
  sigilosa: boolean;
  representantes?: { tipoRepresentacao: string; nome: string; situacao: string; oab?: { numero: string; uf: string }[] }[];
}

interface Movimento {
  sequencia: number;
  dataHora: string;
  codigo: number;
  descricao: string;
  orgaoJulgador?: { id: number; nome: string }[];
}

interface Tramitacao {
  tribunal: { sigla: string; nome: string; segmento: string; jtr: string };
  grau: { sigla: string; nome: string; numero: number };
  valorAcao: number;
  dataHoraUltimaDistribuicao: string;
  dataHoraAjuizamento?: string;
  classe: { codigo: number; descricao: string }[];
  assunto: { codigo: number; descricao: string; hierarquia?: string }[];
  ultimoMovimento?: Movimento;
  movimentos?: Movimento[];
  partes: Parte[];
  ativo: boolean;
  orgaoJulgador?: { id: number; nome: string };
  liminar?: boolean;
}

interface Documento {
  nome?: string;
  tipo?: string;
  hrefBinario?: string;
  hrefTexto?: string;
  dataHora?: string;
}

interface DadosMapeados {
  assunto_principal?: string;
  situacao_processo?: string;
  fase_judicial?: string;
  valor_causa?: string;
  documentos?: Documento[];
}

interface Processo {
  numeroProcesso: string;
  siglaTribunal: string;
  nivelSigilo: number;
  tramitacoes: Tramitacao[];
  tramitacaoAtual?: Tramitacao;
  autoresEnriquecidos?: AutorEnriquecido[];
  reusEnriquecidos?: AutorEnriquecido[];
  dadosMapeados?: DadosMapeados;
}

// ─── Utilitários ──────────────────────────────────────────────────────────────
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

function getTipoAcao(p: Processo): string {
  const tramitacao = p.tramitacaoAtual || p.tramitacoes?.[0];
  if (!tramitacao) return "N/A";
  const partes = tramitacao.partes || [];
  
  let tipoAtivo = "N/A";
  let tipoPassivo = "N/A";
  
  if (p.autoresEnriquecidos && p.autoresEnriquecidos.length > 0) {
    tipoAtivo = p.autoresEnriquecidos[0].tipo_pessoa === "JURIDICA" ? "CNPJ" : "CPF";
  } else {
    const ativo = partes.find(pt => pt.polo === "ATIVO");
    if (ativo) tipoAtivo = ativo.tipoPessoa === "JURIDICA" ? "CNPJ" : ativo.tipoPessoa === "FISICA" ? "CPF" : "N/A";
  }
  
  if (p.reusEnriquecidos && p.reusEnriquecidos.length > 0) {
    tipoPassivo = p.reusEnriquecidos[0].tipo_pessoa === "JURIDICA" ? "CNPJ" : "CPF";
  } else {
    const passivo = partes.find(pt => pt.polo === "PASSIVO");
    if (passivo) tipoPassivo = passivo.tipoPessoa === "JURIDICA" ? "CNPJ" : passivo.tipoPessoa === "FISICA" ? "CPF" : "N/A";
  }
  
  return `${tipoAtivo} VS ${tipoPassivo}`;
}

function getPowerColor(poder: string): string {
  const p = (poder || "").toUpperCase();
  if (p.includes("ALTO")) return "text-emerald-400";
  if (p.includes("MEDIO")) return "text-yellow-400";
  if (p.includes("BAIXO")) return "text-red-400";
  return "text-gray-400";
}

function formatarRelatorioTxt(processos: Processo[]): string {
  let txt = `RELATÓRIO DE PROCESSOS\nDATA: ${new Date().toLocaleString("pt-BR")}\nTOTAL: ${processos.length}\n\n\n`;
  txt += "--------------------------------------------------------------------------------";

  processos.forEach((p) => {
    const tramitacao = p.tramitacaoAtual || p.tramitacoes?.[0];
    if (!tramitacao) return;

    const tipoAcao = getTipoAcao(p);
    txt += `\n==================================================\n`;
    txt += `* AÇÃO: *${tipoAcao}* | PROCESSO: *${p.numeroProcesso}*\n`;
    txt += `==================================================\n`;

    if (p.autoresEnriquecidos && p.autoresEnriquecidos.length > 0) {
      p.autoresEnriquecidos.forEach((autor, i) => {
        txt += `---------------------- POLO ATIVO 0${i + 1}--------------------------\n`;
        const icone = autor.tipo_pessoa === "JURIDICA" ? "🏢" : "👤";
        if (autor.osint?.erro && !autor.osint?.CNPJ_SKIP) {
          txt += `${icone} Nome(s) (0${i + 1}): *${autor.nome}* [🚫 ERRO: *${autor.osint.erro}*]\n`;
          txt += `💳 Documento: ${autor.documento.split("(")[0].trim()}\n`;
        } else if (autor.tipo_pessoa === "JURIDICA" && autor.osint?.CNPJ_SKIP) {
          txt += `${icone} Razão Social: *${autor.osint.RAZAO_SOCIAL || autor.nome}*\n`;
          txt += `💳 CNPJ: ${autor.documento.split("(")[0].trim()}\n`;
          if (autor.osint.SITUACAO_CADASTRAL) txt += `📋 Situação: ${autor.osint.SITUACAO_CADASTRAL}\n`;
          if (autor.osint.ATIVIDADE_PRINCIPAL) txt += `🏭 Atividade: ${autor.osint.ATIVIDADE_PRINCIPAL}\n`;
        } else {
          txt += `${icone} Nome(s) (0${i + 1}): *${autor.nome}*\n`;
          txt += `💳 CPF: ${autor.documento.split("(")[0].trim()}\n`;
          if (autor.osint?.SCORE) txt += `📊 Score: ${autor.osint.SCORE}\n`;
          if (autor.osint?.RENDA) txt += `💰 Renda: R$ ${autor.osint.RENDA}\n`;
          if (autor.osint?.IDADE) txt += `🎂 Idade: ${autor.osint.IDADE} anos\n`;
          if (autor.osint?.PODER_AQUISITIVO) txt += `💎 Poder Aquisitivo: ${autor.osint.PODER_AQUISITIVO}\n`;
          if (autor.osint?.TELEFONES) txt += `📱 Telefones: ${autor.osint.TELEFONES}\n`;
        }
        if (autor.advogados?.length > 0) {
          txt += `⚖️ Advogado(s): ${autor.advogados.map(a => `${a.nome} ${a.oab_completa}`).join(", ")}\n`;
        }
      });
    }

    txt += `\n📋 INFORMAÇÕES DO PROCESSO\n`;
    txt += `🏛️ Tribunal: ${tramitacao.tribunal?.sigla || p.siglaTribunal}\n`;
    txt += `📅 Distribuição: ${formatarData(tramitacao.dataHoraUltimaDistribuicao)}\n`;
    txt += `⚖️ Assunto: ${p.dadosMapeados?.assunto_principal || tramitacao.assunto?.[0]?.descricao || "N/A"}\n`;
    txt += `💵 Valor: ${formatarMoeda(tramitacao.valorAcao || 0)}\n`;
    txt += `📌 Situação: ${p.dadosMapeados?.situacao_processo || (tramitacao.ativo ? "ATIVO" : "ARQUIVADO")}\n`;
    if (tramitacao.ultimoMovimento) {
      txt += `🔄 Último Mov.: ${tramitacao.ultimoMovimento.descricao} (${formatarData(tramitacao.ultimoMovimento.dataHora)})\n`;
    }
    txt += "\n--------------------------------------------------------------------------------";
  });

  return txt;
}

// ─── Componente Principal ─────────────────────────────────────────────────────
export default function Painel() {
  const [tipoBusca, setTipoBusca] = useState<"processo" | "cpf" | "oab">("oab");
  const [query, setQuery] = useState("");
  const [carregando, setCarregando] = useState(false);
  const [processos, setProcessos] = useState<Processo[]>([]);
  const [processosFiltrados, setProcessosFiltrados] = useState<Processo[]>([]);
  const [processoAberto, setProcessoAberto] = useState<Processo | null>(null);
  const [buscaRealizada, setBuscaRealizada] = useState(false);
  
  // Filtros
  const [filtroStatus, setFiltroStatus] = useState<"todos" | "ativos" | "arquivados">("todos");
  const [filtroTipo, setFiltroTipo] = useState<string>("todos");
  const [filtroTribunal, setFiltroTribunal] = useState<string>("todos");
  const [ordenarMaiorValor, setOrdenarMaiorValor] = useState(false);
  
  // Tribunais disponíveis
  const [tribunaisDisponiveis, setTribunaisDisponiveis] = useState<string[]>([]);
  
  // Timer de sessão
  const [tempoSessao, setTempoSessao] = useState(30 * 60); // 30 min
  
  // IA
  const [iaCarregando, setIaCarregando] = useState(false);
  const [iaTexto, setIaTexto] = useState("");
  const [iaModal, setIaModal] = useState(false);
  const [iaTitulo, setIaTitulo] = useState("");
  
  // WhatsApp validação
  const [zapValidando, setZapValidando] = useState<Record<string, boolean>>({});
  const [zapResultados, setZapResultados] = useState<Record<string, boolean>>({});

  // Verificar status do token ao carregar e atualizar timer
  useEffect(() => {
    const verificarToken = () => {
      fetch("/api/token/status")
        .then(r => r.json())
        .then(data => {
          // O servidor renova automaticamente - apenas atualizar o timer
          setTempoSessao(data.tempoRestante || 30 * 60);
        })
        .catch(() => {});
    };
    verificarToken();
    // Verificar a cada 60 segundos para atualizar o timer
    const interval = setInterval(verificarToken, 60000);
    return () => clearInterval(interval);
  }, []);

  // Timer de contagem regressiva (apenas visual)
  useEffect(() => {
    const interval = setInterval(() => {
      setTempoSessao(prev => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const formatarTempo = (segundos: number) => {
    const m = Math.floor(segundos / 60).toString().padStart(2, "0");
    const s = (segundos % 60).toString().padStart(2, "0");
    return `${m}m ${s}s`;
  };

  // Aplicar filtros
  useEffect(() => {
    let resultado = [...processos];

    if (filtroStatus === "ativos") {
      resultado = resultado.filter(p => {
        const t = p.tramitacaoAtual || p.tramitacoes?.[0];
        return p.dadosMapeados?.situacao_processo === "ATIVO" || t?.ativo;
      });
    } else if (filtroStatus === "arquivados") {
      resultado = resultado.filter(p => {
        const t = p.tramitacaoAtual || p.tramitacoes?.[0];
        return p.dadosMapeados?.situacao_processo === "ARQUIVADO" || !t?.ativo;
      });
    }

    if (filtroTipo !== "todos") {
      resultado = resultado.filter(p => {
        const tipo = getTipoAcao(p);
        return tipo === filtroTipo;
      });
    }

    if (filtroTribunal !== "todos") {
      resultado = resultado.filter(p => {
        const t = p.tramitacaoAtual || p.tramitacoes?.[0];
        return (t?.tribunal?.sigla || p.siglaTribunal) === filtroTribunal;
      });
    }

    if (ordenarMaiorValor) {
      resultado.sort((a, b) => {
        const va = a.tramitacaoAtual?.valorAcao || a.tramitacoes?.[0]?.valorAcao || 0;
        const vb = b.tramitacaoAtual?.valorAcao || b.tramitacoes?.[0]?.valorAcao || 0;
        return vb - va;
      });
    }

    setProcessosFiltrados(resultado);
  }, [processos, filtroStatus, filtroTipo, filtroTribunal, ordenarMaiorValor]);

  const buscar = async () => {
    if (!query.trim()) {
      toast.error("Digite um valor para buscar");
      return;
    }
    setCarregando(true);
    setBuscaRealizada(true);
    setProcessoAberto(null);
    setProcessos([]);
    setProcessosFiltrados([]);

    try {
      const resp = await fetch(`/api/buscar?tipo=${tipoBusca}&query=${encodeURIComponent(query.trim())}`);
      if (!resp.ok) throw new Error(`Erro ${resp.status}`);
      const data = await resp.json();
      
      const lista: Processo[] = data.processos || [];
      setProcessos(lista);
      
      // Extrair tribunais únicos
      const tribunaisSet = new Set(lista.map(p => {
        const t = p.tramitacaoAtual || p.tramitacoes?.[0];
        return t?.tribunal?.sigla || p.siglaTribunal;
      }).filter(Boolean));
      setTribunaisDisponiveis(Array.from(tribunaisSet) as string[]);
      
      if (lista.length === 0) {
        toast.info("Nenhum processo encontrado");
      } else {
        toast.success(`${lista.length} processo(s) encontrado(s)`);
      }
    } catch (err: any) {
      if (err.message?.includes("401") || err.message?.includes("TOKEN_EXPIRADO") || err.message?.includes("503") || err.message?.includes("TOKEN_INDISPONIVEL")) {
        toast.info("⏳ Renovando sessão automaticamente... Aguarde.");
        // Aguardar 5 segundos e tentar novamente
        setTimeout(() => {
          setCarregando(false);
          buscar();
        }, 5000);
      } else {
        toast.error("Erro ao buscar processos: " + err.message);
        setCarregando(false);
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") buscar();
  };

  const copiarRelatorio = () => {
    const txt = formatarRelatorioTxt(processosFiltrados);
    navigator.clipboard.writeText(txt).then(() => toast.success("Relatório copiado!"));
  };

  const exportarTxt = () => {
    const txt = formatarRelatorioTxt(processosFiltrados);
    const blob = new Blob([txt], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `processos_${query}_${new Date().toLocaleDateString("pt-BR").replace(/\//g, "-")}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Arquivo exportado!");
  };

  const enviarWhatsApp = () => {
    const txt = formatarRelatorioTxt(processosFiltrados);
    const encoded = encodeURIComponent(txt.substring(0, 4000));
    window.open(`https://wa.me/?text=${encoded}`, "_blank");
  };

  const gerarIaDossie = async () => {
    setIaCarregando(true);
    setIaTitulo("IA DOSSIÊ - Análise da Carteira");
    setIaModal(true);
    setIaTexto("Gerando análise com inteligência artificial...");
    try {
      const resp = await fetch("/api/ia/advogado", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ processos: processosFiltrados, oab: query }),
      });
      const data = await resp.json();
      setIaTexto(data.dossie || "Não foi possível gerar o dossiê.");
    } catch (err: any) {
      setIaTexto("Erro ao gerar dossiê: " + err.message);
    } finally {
      setIaCarregando(false);
    }
  };

  const gerarIaProcesso = async (p: Processo) => {
    setIaCarregando(true);
    setIaTitulo(`Resumo IA - ${p.numeroProcesso}`);
    setIaModal(true);
    setIaTexto("Analisando processo com inteligência artificial...");
    try {
      const resp = await fetch("/api/ia/processo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ processo: p }),
      });
      const data = await resp.json();
      setIaTexto(data.resumo || "Não foi possível gerar o resumo.");
    } catch (err: any) {
      setIaTexto("Erro ao gerar resumo: " + err.message);
    } finally {
      setIaCarregando(false);
    }
  };

  const gerarMensagemWA = async (p: Processo, tipo: string) => {
    setIaCarregando(true);
    setIaTitulo("Mensagem WhatsApp com IA");
    setIaModal(true);
    setIaTexto("Gerando mensagem personalizada...");
    try {
      const resp = await fetch("/api/ia/whatsapp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ processo: p, tipo }),
      });
      const data = await resp.json();
      setIaTexto(data.mensagem || "Não foi possível gerar a mensagem.");
    } catch (err: any) {
      setIaTexto("Erro ao gerar mensagem: " + err.message);
    } finally {
      setIaCarregando(false);
    }
  };

  const validarZaps = async (telefones: string[], key: string) => {
    setZapValidando(prev => ({ ...prev, [key]: true }));
    try {
      const resp = await fetch("/api/whatsapp/validar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ telefones }),
      });
      const data = await resp.json();
      setZapResultados(prev => ({ ...prev, [key]: data.temWhatsApp || false }));
    } catch {
      toast.error("Erro ao validar WhatsApp");
    } finally {
      setZapValidando(prev => ({ ...prev, [key]: false }));
    }
  };

  const copiarProcesso = (p: Processo) => {
    const txt = formatarRelatorioTxt([p]);
    navigator.clipboard.writeText(txt).then(() => toast.success("Processo copiado!"));
  };

  const enviarProcessoWA = (p: Processo) => {
    const txt = formatarRelatorioTxt([p]);
    const encoded = encodeURIComponent(txt.substring(0, 4000));
    window.open(`https://wa.me/?text=${encoded}`, "_blank");
  };

  const baixarOficio = (p: Processo) => {
    const tramitacao = p.tramitacaoAtual || p.tramitacoes?.[0];
    const assunto = p.dadosMapeados?.assunto_principal || tramitacao?.assunto?.[0]?.descricao || "N/A";
    const valor = formatarMoeda(tramitacao?.valorAcao || 0);
    const partes = tramitacao?.partes || [];
    const autores = partes.filter(pt => pt.polo === "ATIVO").map(pt => pt.nome).join(", ");
    const reus = partes.filter(pt => pt.polo === "PASSIVO").map(pt => pt.nome).join(", ");
    
    const oficio = `OFÍCIO JURÍDICO

Data: ${new Date().toLocaleDateString("pt-BR")}

PROCESSO: ${p.numeroProcesso}
TRIBUNAL: ${tramitacao?.tribunal?.sigla || p.siglaTribunal}
ASSUNTO: ${assunto}
VALOR DA CAUSA: ${valor}

POLO ATIVO (AUTOR): ${autores || "N/A"}
POLO PASSIVO (RÉU): ${reus || "N/A"}

SITUAÇÃO: ${p.dadosMapeados?.situacao_processo || (tramitacao?.ativo ? "ATIVO" : "ARQUIVADO")}
DATA DE DISTRIBUIÇÃO: ${formatarData(tramitacao?.dataHoraUltimaDistribuicao || "")}
ÓRGÃO JULGADOR: ${tramitacao?.orgaoJulgador?.nome || "N/A"}

Atenciosamente,
Rodrigo Cavalcanti Alves Silva
OAB/SP 200.287`;

    const blob = new Blob([oficio], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `oficio_${p.numeroProcesso.replace(/[^0-9]/g, "")}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Ofício baixado!");
  };

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#050507] text-white font-sans">
      {/* ── Header ── */}
      <header className="sticky top-0 z-50 border-b border-white/5 bg-[#0a0a0f]/80 backdrop-blur-xl">
        <div className="flex items-center gap-3 px-4 py-3">
          {/* Logo */}
          <div className="flex items-center gap-2 mr-4">
            <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center text-white font-bold text-sm">⚖</div>
            <span className="font-bold text-white text-sm hidden sm:block">Painel Jurídico</span>
            <span className="text-xs px-1.5 py-0.5 rounded bg-indigo-600/20 text-indigo-400 border border-indigo-500/20 font-mono hidden sm:block">PRO</span>
          </div>

          {/* Busca */}
          <div className="flex flex-1 items-center gap-2 bg-white/5 border border-white/10 rounded-xl px-3 py-2 focus-within:border-indigo-500/50 transition-colors">
            <select
              value={tipoBusca}
              onChange={e => setTipoBusca(e.target.value as any)}
              className="bg-transparent text-gray-300 text-sm outline-none cursor-pointer pr-1 border-r border-white/10 mr-2"
            >
              <option value="processo">Nº Proc.</option>
              <option value="cpf">CPF / CNPJ</option>
              <option value="oab">OAB</option>
            </select>
            <input
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Digite o alvo..."
              className="flex-1 bg-transparent text-white text-sm outline-none placeholder-gray-500 font-mono"
            />
            <button
              onClick={buscar}
              disabled={carregando}
              className="text-indigo-400 hover:text-indigo-300 transition-colors disabled:opacity-50"
            >
              {carregando ? (
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              ) : (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              )}
            </button>
          </div>

          {/* Timer */}
          <div className="flex items-center gap-1.5 text-xs text-gray-400 bg-white/5 border border-white/10 rounded-lg px-3 py-2 ml-2">
            <svg className="w-3.5 h-3.5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="font-mono text-red-400">{formatarTempo(tempoSessao)}</span>
          </div>

          {/* Sair */}
          <a
            href="/login"
            className="text-xs text-gray-400 hover:text-red-400 transition-colors bg-white/5 border border-white/10 rounded-lg px-3 py-2 ml-1"
          >
            SAIR
          </a>
        </div>
      </header>

      {/* ── Conteúdo ── */}
      <main className="p-4">
        {/* Estado inicial */}
        {!buscaRealizada && !carregando && (
          <div className="flex flex-col items-center justify-center py-32 text-center">
            <div className="w-20 h-20 rounded-2xl bg-indigo-600/10 border border-indigo-500/20 flex items-center justify-center mb-6">
              <svg className="w-10 h-10 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            </div>
            <h2 className="text-xl font-bold text-white mb-2">Conexão Segura Estabelecida</h2>
            <p className="text-gray-500 text-sm max-w-sm">
              Busque por número de processo, CPF/CNPJ ou OAB para consultar processos nas bases nacionais.
            </p>
          </div>
        )}

        {/* Carregando */}
        {carregando && (
          <div className="flex flex-col items-center justify-center py-32 text-center">
            <div className="w-16 h-16 rounded-full border-2 border-indigo-500/30 border-t-indigo-500 animate-spin mb-6" />
            <p className="text-indigo-400 text-sm font-mono animate-pulse">Consultando Bases Nacionais Seguras...</p>
          </div>
        )}

        {/* Detalhe do processo */}
        {processoAberto && !carregando && (
          <ProcessoDetalhe
            processo={processoAberto}
            onFechar={() => setProcessoAberto(null)}
            onCopiar={copiarProcesso}
            onBaixarTxt={(p) => {
              const txt = formatarRelatorioTxt([p]);
              const blob = new Blob([txt], { type: "text/plain;charset=utf-8" });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = `processo_${p.numeroProcesso.replace(/[^0-9]/g, "")}.txt`;
              a.click();
              URL.revokeObjectURL(url);
              toast.success("Arquivo baixado!");
            }}
            onEnviarWA={enviarProcessoWA}
            onMensagemCausaGanha={(p) => gerarMensagemWA(p, "causa_ganha")}
            onMensagemIA={(p) => gerarMensagemWA(p, "abordagem")}
            onResumoIA={gerarIaProcesso}
            onBaixarOficio={baixarOficio}
            onValidarZaps={validarZaps}
            zapValidando={zapValidando}
            zapResultados={zapResultados}
          />
        )}

        {/* Lista de resultados */}
        {!carregando && !processoAberto && buscaRealizada && processos.length > 0 && (
          <>
            {/* Barra de filtros */}
            <div className="flex flex-wrap items-center gap-2 mb-4">
              {/* Status */}
              <div className="flex gap-1 bg-white/5 border border-white/10 rounded-xl p-1">
                {(["todos", "ativos", "arquivados"] as const).map(s => (
                  <button
                    key={s}
                    onClick={() => setFiltroStatus(s)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all capitalize ${
                      filtroStatus === s
                        ? "bg-indigo-600 text-white"
                        : "text-gray-400 hover:text-white"
                    }`}
                  >
                    {s === "todos" ? "Todos" : s === "ativos" ? "Ativos" : "Arquivados"}
                  </button>
                ))}
              </div>

              {/* Tipo de ação */}
              <div className="flex gap-1 bg-white/5 border border-white/10 rounded-xl p-1">
                {["todos", "CPF VS CPF", "CPF VS CNPJ", "CNPJ VS CNPJ", "CNPJ VS CPF"].map(t => (
                  <button
                    key={t}
                    onClick={() => setFiltroTipo(t)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                      filtroTipo === t
                        ? "bg-indigo-600 text-white"
                        : "text-gray-400 hover:text-white"
                    }`}
                  >
                    {t === "todos" ? "Todos" : t.replace(" VS ", " x ")}
                  </button>
                ))}
              </div>

              {/* Tribunal */}
              <select
                value={filtroTribunal}
                onChange={e => setFiltroTribunal(e.target.value)}
                className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs text-gray-300 outline-none"
              >
                <option value="todos">Todos Tribunais</option>
                {tribunaisDisponiveis.map(t => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>

              {/* Maior Valor */}
              <button
                onClick={() => setOrdenarMaiorValor(!ordenarMaiorValor)}
                className={`px-3 py-2 rounded-xl text-xs font-medium border transition-all flex items-center gap-1.5 ${
                  ordenarMaiorValor
                    ? "bg-indigo-600 border-indigo-500 text-white"
                    : "bg-white/5 border-white/10 text-gray-400 hover:text-white"
                }`}
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4h13M3 8h9m-9 4h6m4 0l4-4m0 0l4 4m-4-4v12" />
                </svg>
                Maior Valor
              </button>

              <div className="ml-auto flex gap-2">
                {/* Copiar */}
                <button
                  onClick={copiarRelatorio}
                  title="Copiar Relatório Completo"
                  className="p-2 rounded-xl bg-white/5 border border-white/10 text-gray-400 hover:text-white transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                </button>
                {/* Exportar TXT */}
                <button
                  onClick={exportarTxt}
                  title="Exportar para TXT"
                  className="p-2 rounded-xl bg-white/5 border border-white/10 text-gray-400 hover:text-white transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </button>
                {/* WhatsApp */}
                <button
                  onClick={enviarWhatsApp}
                  title="Enviar Lista em TXT para WhatsApp"
                  className="p-2 rounded-xl bg-white/5 border border-white/10 text-green-400 hover:text-green-300 transition-colors"
                >
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                  </svg>
                </button>
                {/* IA DOSSIÊ */}
                <button
                  onClick={gerarIaDossie}
                  className="px-3 py-2 rounded-xl bg-indigo-600/20 border border-indigo-500/30 text-indigo-300 hover:bg-indigo-600/30 transition-all text-xs font-bold flex items-center gap-1.5 ia-glow"
                >
                  <span className="text-base">✦</span>
                  IA DOSSIÊ
                </button>
              </div>
            </div>

            {/* Contador */}
            <p className="text-xs text-gray-500 mb-3 font-mono">
              {processosFiltrados.length} PROCESSOS EXIBIDOS
            </p>

            {/* Cards */}
            <div className="space-y-2">
              {processosFiltrados.map((p, idx) => {
                const tramitacao = p.tramitacaoAtual || p.tramitacoes?.[0];
                if (!tramitacao) return null;
                const tipoAcao = getTipoAcao(p);
                const assunto = p.dadosMapeados?.assunto_principal || tramitacao.assunto?.[0]?.descricao || "N/A";
                const valor = formatarMoeda(tramitacao.valorAcao || 0);
                const tribunal = tramitacao.tribunal?.sigla || p.siglaTribunal;
                const data = formatarData(tramitacao.dataHoraUltimaDistribuicao);
                const isAtivo = p.dadosMapeados?.situacao_processo === "ATIVO" || tramitacao.ativo;

                return (
                  <div
                    key={p.numeroProcesso + idx}
                    onClick={() => setProcessoAberto(p)}
                    className="group flex items-center justify-between bg-[#0f0f14] border border-white/5 rounded-xl p-4 cursor-pointer hover:border-indigo-500/30 hover:bg-[#13131a] transition-all"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="text-xs text-gray-400 uppercase tracking-widest font-bold mb-1.5">
                        <span className="text-indigo-400">{tribunal}</span>
                        <span className="mx-1.5 opacity-50">•</span>
                        {data}
                        <span className="mx-1.5 opacity-50">-</span>
                        <span className="text-gray-200">{tipoAcao}</span>
                      </div>
                      <div className="font-mono text-white font-bold text-sm mb-1">
                        {formatarNumProcesso(p.numeroProcesso)}
                      </div>
                      <div className="text-xs text-indigo-400 truncate">{assunto}</div>
                    </div>
                    <div className="flex items-center gap-3 ml-4 shrink-0">
                      <span className={`text-sm font-bold font-mono ${isAtivo ? "text-emerald-400" : "text-gray-500"}`}>
                        {valor}
                      </span>
                      <svg className="w-4 h-4 text-gray-600 group-hover:text-indigo-400 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {/* Sem resultados */}
        {!carregando && buscaRealizada && processos.length === 0 && (
          <div className="flex flex-col items-center justify-center py-32 text-center">
            <div className="w-16 h-16 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center mb-4">
              <svg className="w-8 h-8 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <p className="text-gray-500 text-sm">Nenhum processo retornado.</p>
          </div>
        )}
      </main>

      {/* ── Modal IA ── */}
      {iaModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="bg-[#0f0f14] border border-white/10 rounded-2xl w-full max-w-2xl max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-white/5">
              <h3 className="font-bold text-white flex items-center gap-2">
                <span className="text-indigo-400">✦</span>
                {iaTitulo}
              </h3>
              <button
                onClick={() => setIaModal(false)}
                className="text-gray-400 hover:text-white transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-4 overflow-y-auto flex-1">
              {iaCarregando ? (
                <div className="flex items-center gap-3 text-indigo-400">
                  <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  <span className="text-sm animate-pulse">{iaTexto}</span>
                </div>
              ) : (
                <pre className="text-sm text-gray-300 whitespace-pre-wrap font-sans leading-relaxed">{iaTexto}</pre>
              )}
            </div>
            <div className="p-4 border-t border-white/5 flex gap-2 justify-end">
              <button
                onClick={() => navigator.clipboard.writeText(iaTexto).then(() => toast.success("Copiado!"))}
                className="px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-gray-300 hover:text-white text-sm transition-colors"
              >
                Copiar
              </button>
              <button
                onClick={() => setIaModal(false)}
                className="px-4 py-2 rounded-xl bg-indigo-600 text-white text-sm hover:bg-indigo-700 transition-colors"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Componente de Detalhe do Processo ────────────────────────────────────────
interface ProcessoDetalheProps {
  processo: Processo;
  onFechar: () => void;
  onCopiar: (p: Processo) => void;
  onBaixarTxt: (p: Processo) => void;
  onEnviarWA: (p: Processo) => void;
  onMensagemCausaGanha: (p: Processo) => void;
  onMensagemIA: (p: Processo) => void;
  onResumoIA: (p: Processo) => void;
  onBaixarOficio: (p: Processo) => void;
  onValidarZaps: (telefones: string[], key: string) => void;
  zapValidando: Record<string, boolean>;
  zapResultados: Record<string, boolean>;
}

function ProcessoDetalhe({
  processo: p,
  onFechar,
  onCopiar,
  onBaixarTxt,
  onEnviarWA,
  onMensagemCausaGanha,
  onMensagemIA,
  onResumoIA,
  onBaixarOficio,
  onValidarZaps,
  zapValidando,
  zapResultados,
}: ProcessoDetalheProps) {
  const tramitacao = p.tramitacaoAtual || p.tramitacoes?.[0];
  if (!tramitacao) return null;

  const assunto = p.dadosMapeados?.assunto_principal || tramitacao.assunto?.[0]?.descricao || "N/A";
  const valor = formatarMoeda(tramitacao.valorAcao || 0);
  const tribunal = tramitacao.tribunal?.sigla || p.siglaTribunal;
  const classe = tramitacao.classe?.[0]?.descricao || "";
  const situacao = p.dadosMapeados?.situacao_processo || (tramitacao.ativo ? "ATIVO" : "ARQUIVADO");
  const isAtivo = situacao === "ATIVO";
  const movimentos = tramitacao.movimentos || (tramitacao.ultimoMovimento ? [tramitacao.ultimoMovimento] : []);
  const documentos = p.dadosMapeados?.documentos || [];

  const extrairTelefones = (telefonesStr: string): string[] => {
    if (!telefonesStr) return [];
    return telefonesStr.split(",").map(t => t.trim()).filter(Boolean);
  };

  return (
    <div className="flex gap-4">
      {/* Movimentações */}
      <div className="w-64 shrink-0 hidden lg:block">
        <div className="bg-[#0f0f14] border border-white/5 rounded-xl p-4 sticky top-20">
          <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3 flex items-center gap-2">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Movimentações
          </h3>
          <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
            {movimentos.length === 0 ? (
              <p className="text-xs text-gray-600">Sem movimentações</p>
            ) : (
              movimentos.map((mov, i) => (
                <div key={i} className="flex gap-2">
                  <div className="flex flex-col items-center">
                    <div className="w-2 h-2 rounded-full bg-indigo-500 mt-1 shrink-0" />
                    {i < movimentos.length - 1 && <div className="w-px flex-1 bg-white/5 mt-1" />}
                  </div>
                  <div className="pb-3">
                    <p className="text-xs text-indigo-400 font-mono">{formatarData(mov.dataHora)}</p>
                    <p className="text-xs text-gray-300 leading-relaxed">{mov.descricao}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Conteúdo principal */}
      <div className="flex-1 min-w-0">
        {/* Botões de ação */}
        <div className="flex flex-wrap gap-2 mb-4">
          <button onClick={() => onCopiar(p)} title="Copiar Detalhes do Processo" className="p-2 rounded-xl bg-white/5 border border-white/10 text-gray-400 hover:text-white transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
          </button>
          <button onClick={() => onBaixarTxt(p)} title="Baixar Relatório TXT" className="p-2 rounded-xl bg-white/5 border border-white/10 text-gray-400 hover:text-white transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
          </button>
          <button onClick={() => onEnviarWA(p)} title="Enviar Processo Completo pro WA" className="p-2 rounded-xl bg-white/5 border border-white/10 text-green-400 hover:text-green-300 transition-colors">
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" /></svg>
          </button>
          <button onClick={() => onMensagemCausaGanha(p)} title="WA: Mensagem Causa Ganha" className="px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-gray-300 hover:text-white text-xs transition-colors flex items-center gap-1.5">
            <svg className="w-3.5 h-3.5 text-green-400" fill="currentColor" viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" /></svg>
            Causa Ganha
          </button>
          <button onClick={() => onMensagemIA(p)} title="WA: Gerar com IA" className="px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-indigo-300 hover:text-indigo-200 text-xs transition-colors flex items-center gap-1.5">
            <span>✦</span>
            WA: Gerar com IA
          </button>
          <button onClick={() => onResumoIA(p)} className="px-3 py-2 rounded-xl bg-indigo-600/20 border border-indigo-500/30 text-indigo-300 hover:bg-indigo-600/30 text-xs transition-all flex items-center gap-1.5">
            <span>✦</span>
            Resumo IA da Causa
          </button>
          <button onClick={onFechar} className="ml-auto p-2 rounded-xl bg-white/5 border border-white/10 text-gray-400 hover:text-white transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
          {/* Coluna principal */}
          <div className="xl:col-span-2 space-y-4">
            {/* Header do processo */}
            <div className="bg-[#0f0f14] border border-white/5 rounded-xl p-5">
              <div className="flex items-start justify-between gap-4 mb-3">
                <div>
                  <span className={`inline-block text-xs font-bold px-2 py-0.5 rounded-full mb-2 ${isAtivo ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" : "bg-gray-500/10 text-gray-400 border border-gray-500/20"}`}>
                    {situacao}
                  </span>
                  <h2 className="font-mono font-bold text-white text-lg">{formatarNumProcesso(p.numeroProcesso)}</h2>
                  <p className="text-sm text-gray-400 mt-1">{tribunal} • {classe}</p>
                </div>
              </div>
              <div className="inline-flex items-center gap-2 bg-indigo-600/10 border border-indigo-500/20 rounded-lg px-3 py-1.5">
                <span className="text-xs text-gray-400">ASSUNTO:</span>
                <span className="text-xs text-indigo-300 font-medium">{assunto}</span>
              </div>
            </div>

            {/* Polo Ativo */}
            {p.autoresEnriquecidos && p.autoresEnriquecidos.length > 0 && (
              <div className="bg-[#0f0f14] border border-white/5 rounded-xl p-5">
                <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                  POLO ATIVO (AUTOR)
                  <span className="text-xs px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">ENRIQUECIDO</span>
                </h3>
                <div className="space-y-4">
                  {p.autoresEnriquecidos.map((autor, i) => (
                    <ParteCard key={i} parte={autor} onValidarZaps={onValidarZaps} zapValidando={zapValidando} zapResultados={zapResultados} />
                  ))}
                </div>
              </div>
            )}

            {/* Polo Passivo */}
            {p.reusEnriquecidos && p.reusEnriquecidos.length > 0 && (
              <div className="bg-[#0f0f14] border border-white/5 rounded-xl p-5">
                <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4">POLO PASSIVO (RÉU)</h3>
                <div className="space-y-4">
                  {p.reusEnriquecidos.map((reu, i) => (
                    <ParteCard key={i} parte={reu} onValidarZaps={onValidarZaps} zapValidando={zapValidando} zapResultados={zapResultados} />
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Coluna lateral */}
          <div className="space-y-4">
            {/* Ofício */}
            <div className="bg-[#0f0f14] border border-emerald-500/20 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <svg className="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                <span className="text-xs font-bold text-emerald-400 uppercase tracking-widest">Ofício Gerado (Padrão)</span>
              </div>
              <button
                onClick={() => onBaixarOficio(p)}
                className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold transition-colors flex items-center justify-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                BAIXAR OFÍCIO FORMATADO
              </button>
            </div>

            {/* Informações Gerais */}
            <div className="bg-[#0f0f14] border border-white/5 rounded-xl p-4">
              <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                Informações Gerais
              </h3>
              <div className="space-y-2.5">
                <InfoRow label="Valor da Causa" value={valor} valueClass="text-emerald-400 font-bold font-mono" />
                <InfoRow label="Distribuição" value={formatarData(tramitacao.dataHoraUltimaDistribuicao)} />
                <InfoRow label="Situação" value={situacao} valueClass={isAtivo ? "text-emerald-400" : "text-gray-400"} />
                <InfoRow label="Fase Judicial" value={p.dadosMapeados?.fase_judicial || "Não disponível"} />
                <InfoRow label="Órgão Julgador" value={tramitacao.orgaoJulgador?.nome || "N/A"} />
              </div>
            </div>

            {/* Documentos */}
            {documentos.length > 0 && (
              <div className="bg-[#0f0f14] border border-white/5 rounded-xl p-4">
                <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3 flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                    Docs. Oficiais
                  </span>
                  <span className="text-xs px-1.5 py-0.5 rounded bg-white/5 text-gray-400">{documentos.length} ITENS</span>
                </h3>
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {documentos.slice(0, 20).map((doc, i) => {
                    const isPdf = (doc.nome || "").toLowerCase().includes(".pdf") || (doc.hrefBinario || "").includes(".pdf");
                    const href = doc.hrefBinario || doc.hrefTexto || "#";
                    return (
                      <a
                        key={i}
                        href={href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center justify-between bg-black/30 border border-white/5 p-3 rounded-lg hover:border-indigo-500/30 transition-colors group"
                      >
                        <div className="flex items-center gap-3 truncate">
                          <div className={`w-8 h-8 rounded flex items-center justify-center shrink-0 border text-sm ${isPdf ? "bg-red-500/10 border-red-500/20 text-red-400" : "bg-blue-500/10 border-blue-500/20 text-blue-400"}`}>
                            {isPdf ? "📄" : "📋"}
                          </div>
                          <div className="truncate">
                            <p className="text-xs text-white truncate">{doc.nome || "Documento"}</p>
                            <p className="text-xs text-gray-500">{doc.tipo || ""}</p>
                          </div>
                        </div>
                        <svg className="w-4 h-4 text-gray-600 group-hover:text-indigo-400 transition-colors shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                        </svg>
                      </a>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Card de Parte ─────────────────────────────────────────────────────────────
function ParteCard({
  parte,
  onValidarZaps,
  zapValidando,
  zapResultados,
}: {
  parte: AutorEnriquecido;
  onValidarZaps: (telefones: string[], key: string) => void;
  zapValidando: Record<string, boolean>;
  zapResultados: Record<string, boolean>;
}) {
  const isJuridica = parte.tipo_pessoa === "JURIDICA";
  const telefones = parte.osint?.TELEFONES ? parte.osint.TELEFONES.split(",").map(t => t.trim()).filter(Boolean) : [];
  const zapKey = parte.documento.split("(")[0].trim();

  return (
    <div className="bg-black/30 border border-white/5 rounded-xl p-4">
      <div className="flex items-start gap-3 mb-3">
        <div className="w-10 h-10 rounded-xl bg-indigo-600/10 border border-indigo-500/20 flex items-center justify-center text-lg shrink-0">
          {isJuridica ? "🏢" : "👤"}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-bold text-white text-sm">{parte.nome}</p>
          <p className="text-xs text-gray-500 font-mono">{parte.tipo_documento}: {parte.documento.split("(")[0].trim()}</p>
        </div>
      </div>

      {/* OSINT */}
      {!parte.osint?.erro && !isJuridica && (
        <div className="grid grid-cols-4 gap-2 mb-3">
          <div className="bg-white/5 rounded-lg p-2 text-center">
            <p className="text-xs text-gray-500 mb-0.5">SCORE</p>
            <p className="text-sm font-bold text-white">{parte.osint?.SCORE || "N/A"}</p>
          </div>
          <div className="bg-white/5 rounded-lg p-2 text-center">
            <p className="text-xs text-gray-500 mb-0.5">RENDA</p>
            <p className="text-xs font-bold text-emerald-400">R$ {parte.osint?.RENDA || "N/A"}</p>
          </div>
          <div className="bg-white/5 rounded-lg p-2 text-center">
            <p className="text-xs text-gray-500 mb-0.5">IDADE</p>
            <p className="text-sm font-bold text-white">{parte.osint?.IDADE || "N/A"}</p>
          </div>
          <div className="bg-white/5 rounded-lg p-2 text-center">
            <p className="text-xs text-gray-500 mb-0.5">PODER AQ.</p>
            <p className={`text-xs font-bold ${getPowerColor(parte.osint?.PODER_AQUISITIVO || "")}`}>
              {(parte.osint?.PODER_AQUISITIVO || "N/A").replace(" ", "\n")}
            </p>
          </div>
        </div>
      )}

      {/* Empresa */}
      {isJuridica && parte.osint?.RAZAO_SOCIAL && (
        <div className="mb-3 space-y-1">
          <p className="text-xs text-gray-400">Razão Social: <span className="text-white">{parte.osint.RAZAO_SOCIAL}</span></p>
          {parte.osint.SITUACAO_CADASTRAL && <p className="text-xs text-gray-400">Situação: <span className="text-white">{parte.osint.SITUACAO_CADASTRAL}</span></p>}
          {parte.osint.ATIVIDADE_PRINCIPAL && <p className="text-xs text-gray-400">Atividade: <span className="text-white">{parte.osint.ATIVIDADE_PRINCIPAL}</span></p>}
        </div>
      )}

      {/* Telefones */}
      {telefones.length > 0 && (
        <div className="mb-3">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs text-gray-400 uppercase tracking-widest">Telefones Encontrados</p>
            <button
              onClick={() => onValidarZaps(telefones, zapKey)}
              disabled={zapValidando[zapKey]}
              className="text-xs px-2 py-1 rounded-lg bg-green-500/10 border border-green-500/20 text-green-400 hover:bg-green-500/20 transition-colors flex items-center gap-1 disabled:opacity-50"
            >
              {zapValidando[zapKey] ? (
                <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
              ) : (
                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" /></svg>
              )}
              Validar Zaps
            </button>
          </div>
          <div className="space-y-1">
            {telefones.map((tel, i) => (
              <div key={i} className="flex items-center gap-2 text-xs text-gray-300">
                <svg className="w-3.5 h-3.5 text-gray-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg>
                {tel}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Advogados */}
      {parte.advogados && parte.advogados.length > 0 && (
        <div className="border-t border-white/5 pt-3">
          {parte.advogados.map((adv, i) => (
            <div key={i} className="flex items-center gap-2 text-xs text-gray-400">
              <svg className="w-3.5 h-3.5 text-indigo-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l-3 9a5.002 5.002 0 006.001 0M18 7l3 9m-3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3" /></svg>
              <span className="text-gray-300">{adv.nome}</span>
              <span className="text-gray-600">{adv.oab_completa}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function InfoRow({ label, value, valueClass }: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="flex items-start justify-between gap-2">
      <span className="text-xs text-gray-500 shrink-0">{label}:</span>
      <span className={`text-xs text-right ${valueClass || "text-gray-300"}`}>{value}</span>
    </div>
  );
}
