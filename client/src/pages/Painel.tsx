import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";

// ─── Tipos TJSP ───────────────────────────────────────────────────────────────
interface ParteTJSP {
  polo: string;
  nome: string;
  advogado: string;
  documento: string;
}

interface MovimentacaoTJSP {
  data: string;
  descricao: string;
}

interface DocumentoTJSP {
  nome: string;
  url: string;
}

interface ProcessoTJSP {
  numeroProcesso: string;
  classe: string;
  assunto: string;
  vara: string;
  juiz: string;
  valor: string;
  dataDistribuicao: string;
  situacao: string;
  foro: string;
  partes: ParteTJSP[];
  movimentacoes: MovimentacaoTJSP[];
  documentos: DocumentoTJSP[];
  incidentes: { descricao: string; url: string }[];
  tribunal: string;
  fonte: string;
  codigoProcesso?: string;
  foroProcesso?: string;
  urlDetalhe?: string;
  // Detalhe carregado
  detalheCarregado?: boolean;
}

interface ResultadoBusca {
  total: number;
  processos: ProcessoTJSP[];
  pagina: number;
}

// ─── Utilitários ──────────────────────────────────────────────────────────────
function formatarRelatorioTxt(processos: ProcessoTJSP[]): string {
  let txt = `RELATÓRIO DE PROCESSOS - TJSP\nDATA: ${new Date().toLocaleString("pt-BR")}\nTOTAL: ${processos.length}\n\n`;
  txt += "=".repeat(80) + "\n";

  processos.forEach((p) => {
    txt += `\n${"=".repeat(50)}\n`;
    txt += `PROCESSO: ${p.numeroProcesso}\n`;
    txt += `${"=".repeat(50)}\n`;
    if (p.classe) txt += `⚖️ Classe: ${p.classe}\n`;
    if (p.assunto) txt += `📋 Assunto: ${p.assunto}\n`;
    if (p.vara) txt += `🏛️ Vara: ${p.vara}\n`;
    if (p.juiz) txt += `👨‍⚖️ Juiz: ${p.juiz}\n`;
    if (p.valor) txt += `💵 Valor: ${p.valor}\n`;
    if (p.dataDistribuicao) txt += `📅 Distribuição: ${p.dataDistribuicao}\n`;
    if (p.situacao) txt += `📌 Situação: ${p.situacao}\n`;
    if (p.foro) txt += `🏢 Foro: ${p.foro}\n`;

    if (p.partes && p.partes.length > 0) {
      txt += `\nPARTES:\n`;
      p.partes.forEach(parte => {
        txt += `  [${parte.polo || "Parte"}] ${parte.nome}\n`;
        if (parte.advogado) txt += `    Advogado: ${parte.advogado}\n`;
        if (parte.documento) txt += `    Documento: ${parte.documento}\n`;
      });
    }

    if (p.movimentacoes && p.movimentacoes.length > 0) {
      txt += `\nÚLTIMAS MOVIMENTAÇÕES:\n`;
      p.movimentacoes.slice(0, 5).forEach(mov => {
        txt += `  ${mov.data}: ${mov.descricao}\n`;
      });
    }

    txt += "\n" + "-".repeat(80) + "\n";
  });

  return txt;
}

// ─── Componente Principal ─────────────────────────────────────────────────────
export default function Painel() {
  const [tipoBusca, setTipoBusca] = useState<"processo" | "cpf" | "oab">("oab");
  const [query, setQuery] = useState("");
  const [carregando, setCarregando] = useState(false);
  const [processos, setProcessos] = useState<ProcessoTJSP[]>([]);
  const [processosFiltrados, setProcessosFiltrados] = useState<ProcessoTJSP[]>([]);
  const [processoAberto, setProcessoAberto] = useState<ProcessoTJSP | null>(null);
  const [buscaRealizada, setBuscaRealizada] = useState(false);
  const [totalResultados, setTotalResultados] = useState(0);

  // Filtros
  const [filtroStatus, setFiltroStatus] = useState<"todos" | "ativos" | "arquivados">("todos");
  const [ordenarMaiorValor, setOrdenarMaiorValor] = useState(false);

  // IA
  const [iaCarregando, setIaCarregando] = useState(false);
  const [iaTexto, setIaTexto] = useState("");
  const [iaModal, setIaModal] = useState(false);
  const [iaTitulo, setIaTitulo] = useState("");

  // Detalhe carregando
  const [detalheCarregando, setDetalheCarregando] = useState(false);

  // Aplicar filtros
  useEffect(() => {
    let resultado = [...processos];

    if (filtroStatus === "ativos") {
      resultado = resultado.filter(p =>
        !p.situacao || p.situacao.toLowerCase().includes("ativo") || p.situacao.toLowerCase().includes("em andamento")
      );
    } else if (filtroStatus === "arquivados") {
      resultado = resultado.filter(p =>
        p.situacao && (p.situacao.toLowerCase().includes("arquiv") || p.situacao.toLowerCase().includes("extint") || p.situacao.toLowerCase().includes("baixad"))
      );
    }

    if (ordenarMaiorValor) {
      resultado.sort((a, b) => {
        const parseValor = (v: string) => {
          if (!v) return 0;
          return parseFloat(v.replace(/[^\d,]/g, "").replace(",", ".")) || 0;
        };
        return parseValor(b.valor) - parseValor(a.valor);
      });
    }

    setProcessosFiltrados(resultado);
  }, [processos, filtroStatus, ordenarMaiorValor]);

  const buscar = useCallback(async () => {
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
      if (!resp.ok) {
        const errData = await resp.json().catch(() => ({}));
        if (errData.error === "SESSAO_EXPIRADA") {
          toast.error("Sessão do TJSP expirada. Recarregue a página.");
        } else {
          throw new Error(errData.error || `Erro ${resp.status}`);
        }
        return;
      }
      const data: ResultadoBusca = await resp.json();

      const lista: ProcessoTJSP[] = data.processos || [];
      setProcessos(lista);
      setTotalResultados(data.total || lista.length);

      if (lista.length === 0) {
        toast.info("Nenhum processo encontrado");
      } else {
        toast.success(`${lista.length} processo(s) encontrado(s) de ${data.total || lista.length} total`);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error("Erro ao buscar processos: " + msg);
    } finally {
      setCarregando(false);
    }
  }, [query, tipoBusca]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") buscar();
  };

  const abrirProcesso = async (p: ProcessoTJSP) => {
    // Se já tem detalhe carregado, apenas abrir
    if (p.detalheCarregado) {
      setProcessoAberto(p);
      return;
    }

    // Carregar detalhe do processo
    if (!p.urlDetalhe) {
      setProcessoAberto(p);
      return;
    }

    setDetalheCarregando(true);
    setProcessoAberto(p);

    try {
      const resp = await fetch(`/api/processo/detalhe?url=${encodeURIComponent(p.urlDetalhe)}`);
      if (!resp.ok) throw new Error(`Erro ${resp.status}`);
      const detalhe: ProcessoTJSP = await resp.json();

      const processoCompleto: ProcessoTJSP = {
        ...p,
        ...detalhe,
        numeroProcesso: p.numeroProcesso || detalhe.numeroProcesso,
        detalheCarregado: true,
      };

      setProcessoAberto(processoCompleto);
      // Atualizar na lista
      setProcessos(prev => prev.map(proc =>
        proc.numeroProcesso === p.numeroProcesso ? processoCompleto : proc
      ));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error("Erro ao carregar detalhe: " + msg);
    } finally {
      setDetalheCarregando(false);
    }
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
      const resp = await fetch("/api/ia/dossie", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ processo: processosFiltrados[0], processos: processosFiltrados }),
      });
      const data = await resp.json();
      setIaTexto(data.dossie || "Não foi possível gerar o dossiê.");
    } catch (err: unknown) {
      setIaTexto("Erro ao gerar dossiê: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setIaCarregando(false);
    }
  };

  const gerarIaProcesso = async (p: ProcessoTJSP) => {
    setIaCarregando(true);
    setIaTitulo(`Resumo IA - ${p.numeroProcesso}`);
    setIaModal(true);
    setIaTexto("Analisando processo com inteligência artificial...");
    try {
      const resp = await fetch("/api/ia/resumo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ processo: p }),
      });
      const data = await resp.json();
      setIaTexto(data.resumo || "Não foi possível gerar o resumo.");
    } catch (err: unknown) {
      setIaTexto("Erro ao gerar resumo: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setIaCarregando(false);
    }
  };

  const gerarMensagemWA = async (p: ProcessoTJSP, tipo: string) => {
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
    } catch (err: unknown) {
      setIaTexto("Erro ao gerar mensagem: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setIaCarregando(false);
    }
  };

  const gerarOficio = async (p: ProcessoTJSP) => {
    setIaCarregando(true);
    setIaTitulo(`Ofício - ${p.numeroProcesso}`);
    setIaModal(true);
    setIaTexto("Gerando ofício jurídico...");
    try {
      const resp = await fetch("/api/oficio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ processo: p, advogado: "Rodrigo Cavalcanti Alves Silva - OAB/SP 200.287" }),
      });
      const data = await resp.json();
      setIaTexto(data.oficio || "Não foi possível gerar o ofício.");
    } catch (err: unknown) {
      setIaTexto("Erro ao gerar ofício: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setIaCarregando(false);
    }
  };

  const copiarIaTexto = () => {
    navigator.clipboard.writeText(iaTexto).then(() => toast.success("Texto copiado!"));
  };

  const enviarIaWhatsApp = () => {
    const encoded = encodeURIComponent(iaTexto.substring(0, 4000));
    window.open(`https://wa.me/?text=${encoded}`, "_blank");
  };

  // ─── RENDER ───────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white font-sans">
      {/* Header */}
      <header className="border-b border-[#1e1e2e] bg-[#0d0d1a] px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-600 to-purple-700 flex items-center justify-center text-xl">
              ⚖️
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-wider text-white">PAINEL JURÍDICO</h1>
              <p className="text-xs text-gray-500 tracking-widest">TJSP — CONSULTA PROCESSUAL</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 text-xs text-emerald-400">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
              <span>TJSP CONECTADO</span>
            </div>
            <div className="text-xs text-gray-500">
              Rodrigo Cavalcanti — OAB/SP 200.287
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-6 py-6">
        {/* Barra de Busca */}
        <div className="bg-[#0d0d1a] border border-[#1e1e2e] rounded-2xl p-6 mb-6">
          <div className="flex gap-3 flex-wrap">
            {/* Tipo de Busca */}
            <select
              value={tipoBusca}
              onChange={e => setTipoBusca(e.target.value as "processo" | "cpf" | "oab")}
              className="bg-[#1a1a2e] border border-[#2a2a4e] text-white rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-500 cursor-pointer"
            >
              <option value="oab">OAB</option>
              <option value="cpf">CPF / CNPJ</option>
              <option value="processo">Nº Processo</option>
            </select>

            {/* Campo de Busca */}
            <input
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={
                tipoBusca === "oab" ? "Ex: 200287 ou SP200.287" :
                tipoBusca === "cpf" ? "Ex: 123.456.789-00 ou 12.345.678/0001-00" :
                "Ex: 1234567-89.2023.8.26.0100"
              }
              className="flex-1 min-w-[200px] bg-[#1a1a2e] border border-[#2a2a4e] text-white rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-500 placeholder-gray-600"
            />

            {/* Botão Buscar */}
            <button
              onClick={buscar}
              disabled={carregando}
              className="bg-gradient-to-r from-indigo-600 to-purple-700 hover:from-indigo-500 hover:to-purple-600 disabled:opacity-50 text-white font-bold px-8 py-3 rounded-xl text-sm tracking-wider transition-all duration-200 flex items-center gap-2"
            >
              {carregando ? (
                <>
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                  CONSULTANDO...
                </>
              ) : (
                <>🔍 BUSCAR</>
              )}
            </button>
          </div>

          {/* Mensagem de carregamento */}
          {carregando && (
            <div className="mt-4 flex items-center gap-3 text-sm text-indigo-400">
              <span className="w-4 h-4 border-2 border-indigo-400/30 border-t-indigo-400 rounded-full animate-spin"></span>
              Consultando Bases Nacionais Seguras... Aguarde, isso pode levar até 60 segundos.
            </div>
          )}
        </div>

        {/* Filtros e Ações */}
        {buscaRealizada && !carregando && processos.length > 0 && (
          <div className="bg-[#0d0d1a] border border-[#1e1e2e] rounded-2xl p-4 mb-6 flex flex-wrap items-center gap-3">
            {/* Filtros de Status */}
            <div className="flex gap-2">
              {(["todos", "ativos", "arquivados"] as const).map(s => (
                <button
                  key={s}
                  onClick={() => setFiltroStatus(s)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold tracking-wider transition-all ${
                    filtroStatus === s
                      ? "bg-indigo-600 text-white"
                      : "bg-[#1a1a2e] text-gray-400 hover:text-white"
                  }`}
                >
                  {s.toUpperCase()}
                </button>
              ))}
            </div>

            <div className="h-4 w-px bg-[#2a2a4e]"></div>

            {/* Maior Valor */}
            <button
              onClick={() => setOrdenarMaiorValor(!ordenarMaiorValor)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold tracking-wider transition-all ${
                ordenarMaiorValor ? "bg-yellow-600 text-white" : "bg-[#1a1a2e] text-gray-400 hover:text-white"
              }`}
            >
              💰 MAIOR VALOR
            </button>

            <div className="flex-1"></div>

            {/* Contagem */}
            <span className="text-xs text-gray-500">
              {processosFiltrados.length} de {totalResultados} processos
            </span>

            <div className="h-4 w-px bg-[#2a2a4e]"></div>

            {/* Ações */}
            <button onClick={copiarRelatorio} className="px-3 py-1.5 bg-[#1a1a2e] hover:bg-[#2a2a4e] text-gray-300 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all">
              📋 COPIAR
            </button>
            <button onClick={exportarTxt} className="px-3 py-1.5 bg-[#1a1a2e] hover:bg-[#2a2a4e] text-gray-300 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all">
              📄 EXPORTAR TXT
            </button>
            <button onClick={enviarWhatsApp} className="px-3 py-1.5 bg-[#1a1a2e] hover:bg-[#2a2a4e] text-gray-300 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all">
              📱 WHATSAPP
            </button>
            <button onClick={gerarIaDossie} className="px-3 py-1.5 bg-gradient-to-r from-violet-700 to-indigo-700 hover:from-violet-600 hover:to-indigo-600 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all">
              🤖 IA DOSSIÊ
            </button>
          </div>
        )}

        {/* Lista de Processos */}
        {buscaRealizada && !carregando && (
          <div className="space-y-3">
            {processosFiltrados.length === 0 ? (
              <div className="text-center py-16 text-gray-500">
                <div className="text-4xl mb-4">⚖️</div>
                <p className="text-lg">Nenhum processo retornado.</p>
                <p className="text-sm mt-2">Verifique os dados informados e tente novamente.</p>
              </div>
            ) : (
              processosFiltrados.map((p, idx) => (
                <div
                  key={`${p.numeroProcesso}-${idx}`}
                  className="bg-[#0d0d1a] border border-[#1e1e2e] hover:border-indigo-800 rounded-xl p-4 cursor-pointer transition-all duration-200 hover:bg-[#111128]"
                  onClick={() => abrirProcesso(p)}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 flex-wrap mb-2">
                        <span className="text-indigo-400 font-mono text-sm font-bold">{p.numeroProcesso}</span>
                        <span className="px-2 py-0.5 bg-indigo-900/40 text-indigo-300 rounded text-xs font-semibold">TJSP</span>
                        {p.classe && (
                          <span className="px-2 py-0.5 bg-[#1a1a2e] text-gray-400 rounded text-xs">{p.classe}</span>
                        )}
                      </div>
                      {p.assunto && (
                        <p className="text-sm text-gray-300 truncate">{p.assunto}</p>
                      )}
                      {p.vara && (
                        <p className="text-xs text-gray-500 mt-1 truncate">🏛️ {p.vara}</p>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      {p.valor && (
                        <p className="text-sm font-semibold text-emerald-400">{p.valor}</p>
                      )}
                      {p.dataDistribuicao && (
                        <p className="text-xs text-gray-500 mt-1">{p.dataDistribuicao}</p>
                      )}
                      <span className="text-xs text-indigo-400 mt-2 block">Ver detalhes →</span>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* Estado inicial */}
        {!buscaRealizada && (
          <div className="text-center py-20 text-gray-600">
            <div className="text-5xl mb-6">⚖️</div>
            <h2 className="text-xl font-semibold text-gray-400 mb-2">Painel Jurídico TJSP</h2>
            <p className="text-sm">Consulte processos por OAB, CPF/CNPJ ou número do processo</p>
            <p className="text-xs mt-2 text-gray-700">Dados diretos do Tribunal de Justiça de São Paulo</p>
          </div>
        )}
      </div>

      {/* Modal de Detalhe do Processo */}
      {processoAberto && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-start justify-end p-4 overflow-auto">
          <div className="bg-[#0d0d1a] border border-[#1e1e2e] rounded-2xl w-full max-w-2xl max-h-[95vh] overflow-auto">
            {/* Header do Modal */}
            <div className="sticky top-0 bg-[#0d0d1a] border-b border-[#1e1e2e] p-4 flex items-center justify-between z-10">
              <div>
                <h2 className="font-mono text-indigo-400 font-bold text-sm">{processoAberto.numeroProcesso}</h2>
                <p className="text-xs text-gray-500 mt-0.5">{processoAberto.classe || "TJSP"}</p>
              </div>
              <button
                onClick={() => setProcessoAberto(null)}
                className="text-gray-500 hover:text-white text-xl w-8 h-8 flex items-center justify-center rounded-lg hover:bg-[#1a1a2e] transition-all"
              >
                ✕
              </button>
            </div>

            <div className="p-4 space-y-4">
              {/* Carregando detalhe */}
              {detalheCarregando && (
                <div className="flex items-center gap-3 text-sm text-indigo-400 py-4">
                  <span className="w-5 h-5 border-2 border-indigo-400/30 border-t-indigo-400 rounded-full animate-spin"></span>
                  Carregando detalhes do TJSP...
                </div>
              )}

              {/* Dados do Processo */}
              <div className="bg-[#111128] rounded-xl p-4 space-y-2">
                <h3 className="text-xs font-bold text-gray-400 tracking-wider mb-3">DADOS DO PROCESSO</h3>
                {[
                  { label: "Assunto", value: processoAberto.assunto },
                  { label: "Vara", value: processoAberto.vara },
                  { label: "Juiz", value: processoAberto.juiz },
                  { label: "Valor", value: processoAberto.valor },
                  { label: "Distribuição", value: processoAberto.dataDistribuicao },
                  { label: "Situação", value: processoAberto.situacao },
                  { label: "Foro", value: processoAberto.foro },
                ].filter(item => item.value).map(item => (
                  <div key={item.label} className="flex gap-2 text-sm">
                    <span className="text-gray-500 min-w-[100px] shrink-0">{item.label}:</span>
                    <span className="text-gray-200">{item.value}</span>
                  </div>
                ))}
              </div>

              {/* Partes */}
              {processoAberto.partes && processoAberto.partes.length > 0 && (
                <div className="bg-[#111128] rounded-xl p-4">
                  <h3 className="text-xs font-bold text-gray-400 tracking-wider mb-3">PARTES DO PROCESSO</h3>
                  <div className="space-y-3">
                    {processoAberto.partes.map((parte, i) => (
                      <div key={i} className="border border-[#1e1e2e] rounded-lg p-3">
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`px-2 py-0.5 rounded text-xs font-bold ${
                            parte.polo?.toLowerCase().includes("ativo") || parte.polo?.toLowerCase().includes("autor") || parte.polo?.toLowerCase().includes("exequente")
                              ? "bg-emerald-900/40 text-emerald-400"
                              : "bg-red-900/40 text-red-400"
                          }`}>
                            {parte.polo || "PARTE"}
                          </span>
                        </div>
                        <p className="text-sm text-white font-semibold">{parte.nome}</p>
                        {parte.documento && <p className="text-xs text-gray-500 mt-0.5">Doc: {parte.documento}</p>}
                        {parte.advogado && (
                          <p className="text-xs text-indigo-400 mt-1">⚖️ Adv: {parte.advogado}</p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Movimentações */}
              {processoAberto.movimentacoes && processoAberto.movimentacoes.length > 0 && (
                <div className="bg-[#111128] rounded-xl p-4">
                  <h3 className="text-xs font-bold text-gray-400 tracking-wider mb-3">
                    MOVIMENTAÇÕES ({processoAberto.movimentacoes.length})
                  </h3>
                  <div className="space-y-2 max-h-60 overflow-auto">
                    {processoAberto.movimentacoes.map((mov, i) => (
                      <div key={i} className="flex gap-3 text-sm border-b border-[#1e1e2e] pb-2 last:border-0">
                        <span className="text-indigo-400 font-mono text-xs shrink-0 pt-0.5">{mov.data}</span>
                        <span className="text-gray-300 text-xs">{mov.descricao}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Documentos */}
              {processoAberto.documentos && processoAberto.documentos.length > 0 && (
                <div className="bg-[#111128] rounded-xl p-4">
                  <h3 className="text-xs font-bold text-gray-400 tracking-wider mb-3">
                    DOCUMENTOS ({processoAberto.documentos.length})
                  </h3>
                  <div className="space-y-2">
                    {processoAberto.documentos.slice(0, 10).map((doc, i) => (
                      <a
                        key={i}
                        href={doc.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
                      >
                        📄 {doc.nome}
                      </a>
                    ))}
                  </div>
                </div>
              )}

              {/* Ações do Processo */}
              <div className="bg-[#111128] rounded-xl p-4">
                <h3 className="text-xs font-bold text-gray-400 tracking-wider mb-3">AÇÕES</h3>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => {
                      const txt = formatarRelatorioTxt([processoAberto]);
                      navigator.clipboard.writeText(txt).then(() => toast.success("Copiado!"));
                    }}
                    className="px-3 py-2 bg-[#1a1a2e] hover:bg-[#2a2a4e] text-gray-300 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all"
                  >
                    📋 COPIAR
                  </button>
                  <button
                    onClick={() => {
                      const txt = formatarRelatorioTxt([processoAberto]);
                      const blob = new Blob([txt], { type: "text/plain;charset=utf-8" });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement("a");
                      a.href = url;
                      a.download = `processo_${processoAberto.numeroProcesso}.txt`;
                      a.click();
                    }}
                    className="px-3 py-2 bg-[#1a1a2e] hover:bg-[#2a2a4e] text-gray-300 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all"
                  >
                    📄 BAIXAR TXT
                  </button>
                  <button
                    onClick={() => {
                      const txt = formatarRelatorioTxt([processoAberto]);
                      const encoded = encodeURIComponent(txt.substring(0, 4000));
                      window.open(`https://wa.me/?text=${encoded}`, "_blank");
                    }}
                    className="px-3 py-2 bg-[#1a1a2e] hover:bg-[#2a2a4e] text-gray-300 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all"
                  >
                    📱 ENVIAR WA
                  </button>
                  <button
                    onClick={() => gerarMensagemWA(processoAberto, "atualização")}
                    className="px-3 py-2 bg-[#1a1a2e] hover:bg-[#2a2a4e] text-gray-300 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all"
                  >
                    🤖 WA COM IA
                  </button>
                  <button
                    onClick={() => gerarIaProcesso(processoAberto)}
                    className="px-3 py-2 bg-gradient-to-r from-violet-700 to-indigo-700 hover:from-violet-600 hover:to-indigo-600 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all"
                  >
                    🤖 RESUMO IA
                  </button>
                  <button
                    onClick={() => gerarOficio(processoAberto)}
                    className="px-3 py-2 bg-gradient-to-r from-blue-700 to-indigo-700 hover:from-blue-600 hover:to-indigo-600 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all"
                  >
                    📜 OFÍCIO
                  </button>
                  {processoAberto.urlDetalhe && (
                    <a
                      href={processoAberto.urlDetalhe}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-3 py-2 bg-[#1a1a2e] hover:bg-[#2a2a4e] text-gray-300 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all"
                    >
                      🔗 ABRIR NO TJSP
                    </a>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal de IA */}
      {iaModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
          <div className="bg-[#0d0d1a] border border-[#1e1e2e] rounded-2xl w-full max-w-2xl max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-[#1e1e2e]">
              <h3 className="font-bold text-sm text-indigo-400 tracking-wider">{iaTitulo}</h3>
              <button
                onClick={() => setIaModal(false)}
                className="text-gray-500 hover:text-white text-xl w-8 h-8 flex items-center justify-center rounded-lg hover:bg-[#1a1a2e]"
              >
                ✕
              </button>
            </div>
            <div className="flex-1 overflow-auto p-4">
              {iaCarregando ? (
                <div className="flex items-center gap-3 text-indigo-400">
                  <span className="w-5 h-5 border-2 border-indigo-400/30 border-t-indigo-400 rounded-full animate-spin"></span>
                  Processando com IA...
                </div>
              ) : (
                <pre className="text-sm text-gray-300 whitespace-pre-wrap font-sans leading-relaxed">{iaTexto}</pre>
              )}
            </div>
            {!iaCarregando && iaTexto && (
              <div className="p-4 border-t border-[#1e1e2e] flex gap-2">
                <button
                  onClick={copiarIaTexto}
                  className="px-4 py-2 bg-[#1a1a2e] hover:bg-[#2a2a4e] text-gray-300 rounded-lg text-xs font-semibold transition-all"
                >
                  📋 COPIAR
                </button>
                <button
                  onClick={enviarIaWhatsApp}
                  className="px-4 py-2 bg-[#1a1a2e] hover:bg-[#2a2a4e] text-gray-300 rounded-lg text-xs font-semibold transition-all"
                >
                  📱 ENVIAR WA
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
