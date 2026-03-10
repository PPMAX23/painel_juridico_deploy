import { useState, useCallback, useMemo, useEffect } from "react";
import { toast } from "sonner";

// ─── Tipos TJSP ───────────────────────────────────────────────────────────────
interface ParteTJSP {
  polo?: string;
  tipo?: string;
  nome: string;
  advogado: string;
  documento?: string;
  cpfCnpj?: string;
}

interface MovimentacaoTJSP {
  data: string;
  descricao: string;
}

interface DocumentoTJSP {
  nome?: string;
  titulo?: string;
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
  tribunal: string;
  codigoProcesso?: string;
  foroProcesso?: string;
  urlDetalhe?: string;
  urlPastaDigital?: string;
  detalheCarregado?: boolean;
  data?: string;
}

interface ResultadoBusca {
  total: number;
  totalEncontrados?: number;
  processos: ProcessoTJSP[];
}

// ─── Tipo retorno API CPF ─────────────────────────────────────────────────────
interface DadosCPF {
  status: string;
  cpf: string;
  nome: string;
  sexo?: string;
  nascimento?: string;
  filiacao?: { mae?: string; pai?: string };
  estado_civil?: string;
  score?: { CSB8?: string; faixa_CSB8?: string; CSBA?: number; faixa_CSBA?: string };
  enderecos?: { total: number; itens: Array<{ tipo_logradouro?: string; logradouro?: string; numero?: string; bairro?: string; cidade?: string; uf?: string; cep?: string }> };
  telefones?: { total: number; itens: Array<{ ddd: number; numero: number; numero_completo: string }> };
}

interface StatusTJSP {
  autenticado: boolean;
  expiracao: string | null;
  tempoRestante: string | null;
}

// ─── Utilitários ──────────────────────────────────────────────────────────────
function extrairTelefonesDeMovimentacoes(movimentacoes: MovimentacaoTJSP[]): string[] {
  const telefones: string[] = [];
  const vistos = new Set<string>();
  const regex = /\(?\d{2}\)?[\s.-]?(?:9[\s.]?)?\d{4}[\s.-]?\d{4}/g;
  for (const mov of movimentacoes) {
    const matches = mov.descricao.match(regex) || [];
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

function formatarRelatorioTxt(processos: ProcessoTJSP[]): string {
  const agora = new Date().toLocaleString("pt-BR");
  let txt = `⚖️ RELATORIO DE PROCESSOS - TJSP\n`;
  txt += `📅 DATA: ${agora}\n`;
  txt += `📊 TOTAL: ${processos.length} processo(s)\n`;
  txt += "=".repeat(60) + "\n\n";

  processos.forEach((p, idx) => {
    // Identificar partes
    const partePassiva = p.partes?.find(pt => {
      const t = (pt.polo || pt.tipo || "").toLowerCase();
      return t.includes("execut") || t.includes("exectd") || t.includes("r\u00e9u") || t.includes("requerid") || t.includes("passiv");
    }) || (p.partes && p.partes.length > 1 ? p.partes[p.partes.length - 1] : null);
    const parteAtiva = p.partes?.find(pt => {
      const t = (pt.polo || pt.tipo || "").toLowerCase();
      return t.includes("ativo") || t.includes("autor") || t.includes("exeqte") || t.includes("exequente") || t.includes("requerente");
    }) || (p.partes && p.partes.length > 0 ? p.partes[0] : null);
    const advogado = p.partes?.find(pt => pt.advogado)?.advogado || "";
    const telefones = extrairTelefonesDeMovimentacoes(p.movimentacoes || []);

    txt += `👤 CLIENTE ${idx + 1}\n`;
    txt += "-".repeat(50) + "\n";
    if (partePassiva) {
      txt += `👤 Recebedor: ${partePassiva.nome}\n`;
      if (partePassiva.documento || partePassiva.cpfCnpj) {
        txt += `📝 CPF/CNPJ: ${partePassiva.documento || partePassiva.cpfCnpj}\n`;
      }
    }
    if (parteAtiva) {
      txt += `🏢 Parte Ativa: ${parteAtiva.nome}\n`;
    }
    if (advogado) {
      txt += `⚖️ Advogado: ${advogado.split(",")[0]}\n`;
    }
    if (telefones.length > 0) {
      txt += `📱 Telefone(s): ${telefones.join(" | ")}\n`;
    }
    txt += `\n📄 PROCESSO: ${p.numeroProcesso}\n`;
    if (p.classe) txt += `🏷️  Classe: ${p.classe}\n`;
    if (p.assunto) txt += `📌 Assunto: ${p.assunto}\n`;
    if (p.vara) txt += `🏛️  Vara: ${p.vara}\n`;
    if (p.juiz) txt += `👨\u200d⚖️ Juiz: ${p.juiz}\n`;
    if (p.valor) txt += `💰 Valor: ${p.valor}\n`;
    if (p.dataDistribuicao) txt += `📅 Distribuicao: ${p.dataDistribuicao}\n`;
    if (p.situacao) txt += `🟢 Situacao: ${p.situacao}\n`;
    if (p.foro) txt += `📍 Foro: ${p.foro}\n`;
    if (p.movimentacoes && p.movimentacoes.length > 0) {
      txt += `\n🗓️  ULTIMAS MOVIMENTACOES:\n`;
      p.movimentacoes.slice(0, 5).forEach(mov => {
        txt += `   ▶ ${mov.data}: ${mov.descricao}\n`;
      });
    }
    txt += "\n" + "=".repeat(60) + "\n\n";
  });
  return txt;
}

function parseValor(v: string): number {
  if (!v) return 0;
  return parseFloat(v.replace(/[^\d,]/g, "").replace(",", ".")) || 0;
}

function downloadTxt(conteudo: string, nomeArquivo: string) {
  const blob = new Blob([conteudo], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = nomeArquivo;
  link.style.position = "fixed";
  link.style.top = "-9999px";
  link.style.left = "-9999px";
  document.body.appendChild(link);
  link.click();
  setTimeout(() => {
    if (link.parentNode === document.body) {
      document.body.removeChild(link);
    }
    URL.revokeObjectURL(url);
  }, 100);
}

// ─── Componente Principal ─────────────────────────────────────────────────────
export default function Painel() {
  const [tipoBusca, setTipoBusca] = useState<"processo" | "cpf" | "oab" | "nome">("oab");
  const [query, setQuery] = useState("");
  const [carregando, setCarregando] = useState(false);

  // Mapa de processos indexado por numeroProcesso para evitar mutações
  const [processosMap, setProcessosMap] = useState<Map<string, ProcessoTJSP>>(new Map());
  const [processosOrdem, setProcessosOrdem] = useState<string[]>([]);

  const [processoAbertoId, setProcessoAbertoId] = useState<string | null>(null);
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

  // Dados enriquecidos via API CPF
  const [dadosCpf, setDadosCpf] = useState<DadosCPF | null>(null);
  const [dadosCpfCarregando, setDadosCpfCarregando] = useState(false);
  const [dadosCpfProcesso, setDadosCpfProcesso] = useState<string | null>(null); // qual processo foi consultado

  // Status TJSP
  const [statusTJSP, setStatusTJSP] = useState<StatusTJSP>({ autenticado: false, expiracao: null, tempoRestante: null });
  const [modalCookies, setModalCookies] = useState(false);
  const [cookiesInput, setCookiesInput] = useState("");
  const [configurandoCookies, setConfigurandoCookies] = useState(false);

  // Verificar status TJSP ao iniciar
  useEffect(() => {
    fetch("/api/tjsp/status")
      .then(r => r.json())
      .then(data => {
        setStatusTJSP({
          autenticado: data.autenticado,
          expiracao: data.expiracao,
          tempoRestante: data.tempoRestante,
        });
        // Se não autenticado, tentar auto-login
        if (!data.autenticado) {
          fetch("/api/tjsp/auto-login", { method: "POST" })
            .then(r => r.json())
            .then(d => {
              if (d.ok) {
                setStatusTJSP({ autenticado: true, expiracao: d.expiracao, tempoRestante: d.tempoRestante });
              }
            })
            .catch(() => {});
        }
      })
      .catch(() => {});
  }, []);

  // Lista de processos derivada do mapa (sem mutação)
  const processos = useMemo(() => {
    return processosOrdem.map(id => processosMap.get(id)).filter(Boolean) as ProcessoTJSP[];
  }, [processosMap, processosOrdem]);

  // Processos filtrados e ordenados (usando useMemo, sem mutação)
  const processosFiltrados = useMemo(() => {
    let resultado = processos;

    // Filtro automático: quando filtro = "todos", ocultar processos extintos/arquivados/presos já carregados
    if (filtroStatus === "todos") {
      resultado = resultado.filter(p => {
        if (!p.detalheCarregado || !p.situacao) return true; // manter se ainda não carregado
        const sit = p.situacao.toLowerCase();
        return !sit.includes("extint") && !sit.includes("arquivad") && !sit.includes("baixad") && !sit.includes("preso");
      });
    }

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
      resultado = [...resultado].sort((a, b) => parseValor(b.valor) - parseValor(a.valor));
    }

    return resultado;
  }, [processos, filtroStatus, ordenarMaiorValor]);

  const processoAberto = useMemo(() => {
    if (!processoAbertoId) return null;
    return processosMap.get(processoAbertoId) ?? null;
  }, [processoAbertoId, processosMap]);

  // Enriquecer processos com detalhes em background (lotes de 5)
  const enriquecerEmBackground = useCallback(async (lista: ProcessoTJSP[]) => {
    const comCodigo = lista.filter(p => p.codigoProcesso && !p.detalheCarregado);
    const LOTE = 5;
    for (let i = 0; i < comCodigo.length; i += LOTE) {
      const lote = comCodigo.slice(i, i + LOTE);
      await Promise.all(lote.map(async (p) => {
        try {
          const params = new URLSearchParams({ codigo: p.codigoProcesso!, foro: p.foroProcesso || "" });
          const resp = await fetch(`/api/processo/detalhe?${params}`);
          if (!resp.ok) return;
          const detalhe: ProcessoTJSP = await resp.json();
          setProcessosMap(prev => {
            if (!prev.has(p.numeroProcesso)) return prev;
            const novoMapa = new Map(prev);
            novoMapa.set(p.numeroProcesso, { ...p, ...detalhe, numeroProcesso: p.numeroProcesso, detalheCarregado: true });
            return novoMapa;
          });
        } catch { /* silencioso */ }
      }));
      // Pequena pausa entre lotes para não sobrecarregar o TJSP
      if (i + LOTE < comCodigo.length) await new Promise(r => setTimeout(r, 500));
    }
  }, []);

  const buscar = useCallback(async () => {
    if (!query.trim()) {
      toast.error("Digite um valor para buscar");
      return;
    }
    setCarregando(true);
    setBuscaRealizada(true);
    setProcessoAbertoId(null);
    setProcessosMap(new Map());
    setProcessosOrdem([]);

    try {
      const resp = await fetch(`/api/buscar?tipo=${tipoBusca}&query=${encodeURIComponent(query.trim())}`);
      if (!resp.ok) {
        const errData = await resp.json().catch(() => ({}));
        if (errData.error === "SESSAO_EXPIRADA") {
          setStatusTJSP({ autenticado: false, expiracao: null, tempoRestante: null });
          setModalCookies(true);
          toast.error("Sessão do TJSP expirada. Configure os cookies de sessão.");
        } else {
          throw new Error(errData.error || `Erro ${resp.status}`);
        }
        return;
      }
      const data: ResultadoBusca = await resp.json();
      const lista: ProcessoTJSP[] = data.processos || [];

      // Construir mapa imutável
      const novoMapa = new Map<string, ProcessoTJSP>();
      const novaOrdem: string[] = [];
      lista.forEach((p, idx) => {
        const id = p.numeroProcesso || `proc-${idx}`;
        novoMapa.set(id, { ...p });
        novaOrdem.push(id);
      });

      setProcessosMap(novoMapa);
      setProcessosOrdem(novaOrdem);
      const totalEnc = data.totalEncontrados || data.total || lista.length;
      setTotalResultados(totalEnc);

      if (lista.length === 0) {
        toast.info("Nenhum processo encontrado");
      } else if (totalEnc > lista.length) {
        toast.success(`${lista.length} processo(s) carregados de ${totalEnc} encontrados no TJSP`);
      } else {
        toast.success(`${lista.length} processo(s) encontrado(s)`);
      }

      // Enriquecer com detalhes em background
      enriquecerEmBackground(lista);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error("Erro ao buscar processos: " + msg);
    } finally {
      setCarregando(false);
    }
  }, [query, tipoBusca, enriquecerEmBackground]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") buscar();
  };

  // Consultar API CPF para parte passiva
  const consultarCPF = useCallback(async (cpf: string, processoId: string) => {
    const cpfLimpo = cpf.replace(/\D/g, "");
    if (cpfLimpo.length !== 11) return; // só CPF (11 dígitos), não CNPJ
    if (dadosCpfProcesso === processoId) return; // já consultado para este processo
    setDadosCpfCarregando(true);
    setDadosCpf(null);
    setDadosCpfProcesso(processoId);
    try {
      const resp = await fetch(`/api/consulta-cpf?cpf=${cpfLimpo}`);
      if (!resp.ok) return;
      const data: DadosCPF = await resp.json();
      if (data.status === "OK") setDadosCpf(data);
    } catch { /* silencioso */ } finally {
      setDadosCpfCarregando(false);
    }
  }, [dadosCpfProcesso]);

  const abrirProcesso = useCallback(async (p: ProcessoTJSP) => {
    const id = p.numeroProcesso;
    setProcessoAbertoId(id);
    // Limpar dados CPF do processo anterior
    setDadosCpf(null);
    setDadosCpfProcesso(null);

    if (p.detalheCarregado || !p.codigoProcesso) {
      // Se já carregado, verificar se tem CPF da parte passiva para consultar
      if (p.detalheCarregado && p.partes) {
        const passiva = p.partes.find(pt => {
          const t = (pt.polo || pt.tipo || "").toLowerCase();
          return t.includes("execut") || t.includes("exectd") || t.includes("réu") || t.includes("requerid") || t.includes("passiv");
        });
        const cpf = passiva?.documento || passiva?.cpfCnpj || "";
        if (cpf) consultarCPF(cpf, id);
      }
      return;
    }

    setDetalheCarregando(true);

    try {
      const params = new URLSearchParams({
        codigo: p.codigoProcesso || "",
        foro: p.foroProcesso || "",
      });
      const resp = await fetch(`/api/processo/detalhe?${params}`);
      if (!resp.ok) throw new Error(`Erro ${resp.status}`);
      const detalhe: ProcessoTJSP = await resp.json();

      const processoCompleto: ProcessoTJSP = {
        ...p,
        ...detalhe,
        numeroProcesso: p.numeroProcesso || detalhe.numeroProcesso,
        detalheCarregado: true,
      };

      // Atualizar o mapa sem mutar — criar novo Map
      setProcessosMap(prev => {
        const novoMapa = new Map(prev);
        novoMapa.set(id, processoCompleto);
        return novoMapa;
      });

      // Consultar API CPF para parte passiva automaticamente
      const passiva = processoCompleto.partes?.find(pt => {
        const t = (pt.polo || pt.tipo || "").toLowerCase();
        return t.includes("execut") || t.includes("exectd") || t.includes("réu") || t.includes("requerid") || t.includes("passiv");
      });
      const cpfPassiva = passiva?.documento || passiva?.cpfCnpj || "";
      if (cpfPassiva) consultarCPF(cpfPassiva, id);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error("Erro ao carregar detalhe: " + msg);
    } finally {
      setDetalheCarregando(false);
    }
  }, [consultarCPF]);

  const configurarCookies = useCallback(async () => {
    if (!cookiesInput.trim()) {
      toast.error("Cole os cookies do TJSP");
      return;
    }
    setConfigurandoCookies(true);
    try {
      const resp = await fetch("/api/tjsp/cookies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cookies: cookiesInput.trim(), ttlHoras: 8 }),
      });
      const data = await resp.json();
      if (data.ok) {
        setStatusTJSP({ autenticado: true, expiracao: data.expiracao, tempoRestante: data.tempoRestante });
        setModalCookies(false);
        setCookiesInput("");
        toast.success("Cookies configurados! Sessão válida por 8 horas.");
      } else {
        toast.error(data.error || "Erro ao configurar cookies");
      }
    } catch (err: unknown) {
      toast.error("Erro: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setConfigurandoCookies(false);
    }
  }, [cookiesInput]);

  const copiarRelatorio = useCallback(() => {
    const txt = formatarRelatorioTxt(processosFiltrados);
    navigator.clipboard.writeText(txt).then(() => toast.success("Relatório copiado!"));
  }, [processosFiltrados]);

  const exportarTxt = useCallback(() => {
    const txt = formatarRelatorioTxt(processosFiltrados);
    const dataStr = new Date().toLocaleDateString("pt-BR").replace(/\//g, "-");
    downloadTxt(txt, `processos_${query}_${dataStr}.txt`);
    toast.success("Arquivo exportado!");
  }, [processosFiltrados, query]);

  const enviarWhatsApp = useCallback(() => {
    const txt = formatarRelatorioTxt(processosFiltrados);
    const encoded = encodeURIComponent(txt.substring(0, 4000));
    window.open(`https://wa.me/?text=${encoded}`, "_blank");
  }, [processosFiltrados]);

  const gerarIaDossie = useCallback(async () => {
    if (processosFiltrados.length === 0) return;
    setIaCarregando(true);
    setIaTitulo("IA DOSSIÊ — Análise Completa");
    setIaModal(true);
    setIaTexto("Gerando dossiê com IA...");
    try {
      const resp = await fetch("/api/ia/dossie", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ processos: processosFiltrados.slice(0, 10) }),
      });
      const data = await resp.json();
      setIaTexto(data.dossie || "Não foi possível gerar o dossiê.");
    } catch (err: unknown) {
      setIaTexto("Erro ao gerar dossiê: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setIaCarregando(false);
    }
  }, [processosFiltrados]);

  const gerarIaProcesso = useCallback(async (p: ProcessoTJSP) => {
    setIaCarregando(true);
    setIaTitulo(`Resumo IA — ${p.numeroProcesso}`);
    setIaModal(true);
    setIaTexto("Analisando processo com IA...");
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
  }, []);

  const gerarMensagemWA = useCallback(async (p: ProcessoTJSP, tipo: string) => {
    setIaCarregando(true);
    setIaTitulo(`Mensagem WhatsApp — ${p.numeroProcesso}`);
    setIaModal(true);
    setIaTexto("Gerando mensagem com IA...");
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
  }, []);

  const gerarOficio = useCallback(async (p: ProcessoTJSP) => {
    setIaCarregando(true);
    setIaTitulo(`Ofício — ${p.numeroProcesso}`);
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
  }, []);

  const copiarIaTexto = useCallback(() => {
    navigator.clipboard.writeText(iaTexto).then(() => toast.success("Texto copiado!"));
  }, [iaTexto]);

  const enviarIaWhatsApp = useCallback(() => {
    const encoded = encodeURIComponent(iaTexto.substring(0, 4000));
    window.open(`https://wa.me/?text=${encoded}`, "_blank");
  }, [iaTexto]);

  const fecharModal = useCallback(() => setProcessoAbertoId(null), []);
  const fecharIaModal = useCallback(() => setIaModal(false), []);

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
            {statusTJSP.autenticado ? (
              <div className="flex items-center gap-2 text-xs text-emerald-400">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                <span>TJSP CONECTADO</span>
                {statusTJSP.tempoRestante && (
                  <span className="text-gray-500">({statusTJSP.tempoRestante})</span>
                )}
              </div>
            ) : (
              <button
                onClick={() => setModalCookies(true)}
                className="flex items-center gap-2 text-xs text-red-400 hover:text-red-300 transition-colors"
              >
                <span className="w-2 h-2 rounded-full bg-red-400"></span>
                <span>TJSP DESCONECTADO — Configurar</span>
              </button>
            )}
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
            <select
              value={tipoBusca}
              onChange={e => setTipoBusca(e.target.value as "processo" | "cpf" | "oab" | "nome")}
              className="bg-[#1a1a2e] border border-[#2a2a4e] text-white rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-500 cursor-pointer"
            >
              <option value="oab">OAB</option>
              <option value="cpf">CPF / CNPJ</option>
              <option value="processo">Nº Processo</option>
              <option value="nome">Nome do Advogado</option>
            </select>

            <input
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={
                tipoBusca === "oab" ? "Ex: 200287 ou SP200.287" :
                tipoBusca === "cpf" ? "Ex: 123.456.789-00 ou 12.345.678/0001-00" :
                tipoBusca === "nome" ? "Ex: RODRIGO CAVALCANTI" :
                "Ex: 1234567-89.2023.8.26.0100"
              }
              className="flex-1 min-w-[200px] bg-[#1a1a2e] border border-[#2a2a4e] text-white rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-500 placeholder-gray-600"
            />

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

          {carregando && (
            <div className="mt-4 flex items-center gap-3 text-sm text-indigo-400">
              <span className="w-4 h-4 border-2 border-indigo-400/30 border-t-indigo-400 rounded-full animate-spin"></span>
              Consultando TJSP diretamente... Aguarde, isso pode levar até 30 segundos.
            </div>
          )}
        </div>

        {/* Filtros e Ações */}
        {buscaRealizada && !carregando && processos.length > 0 && (
          <div className="bg-[#0d0d1a] border border-[#1e1e2e] rounded-2xl p-4 mb-6 flex flex-wrap items-center gap-3">
            <div className="flex gap-2">
              {(["todos", "ativos", "arquivados"] as const).map(s => (
                <button
                  key={s}
                  onClick={() => setFiltroStatus(s)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold tracking-wider transition-all ${
                    filtroStatus === s ? "bg-indigo-600 text-white" : "bg-[#1a1a2e] text-gray-400 hover:text-white"
                  }`}
                >
                  {s.toUpperCase()}
                </button>
              ))}
            </div>

            <div className="h-4 w-px bg-[#2a2a4e]"></div>

            <button
              onClick={() => setOrdenarMaiorValor(!ordenarMaiorValor)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold tracking-wider transition-all ${
                ordenarMaiorValor ? "bg-yellow-600 text-white" : "bg-[#1a1a2e] text-gray-400 hover:text-white"
              }`}
            >
              💰 MAIOR VALOR
            </button>

            <div className="flex-1"></div>

            <span className="text-xs text-gray-500">
              {processosFiltrados.length} de {totalResultados} processos
            </span>

            <div className="h-4 w-px bg-[#2a2a4e]"></div>

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
              processosFiltrados.map((p) => {
                // Extrair parte passiva (executado/réu/requerido) e advogado
                const partePassiva = p.partes?.find(pt => {
                  const t = (pt.polo || pt.tipo || "").toLowerCase();
                  return t.includes("execut") || t.includes("exectd") || t.includes("r\u00e9u") || t.includes("requerid") || t.includes("passiv") || t.includes("impetrad") || t.includes("reclamad");
                }) || (p.partes && p.partes.length > 1 ? p.partes[p.partes.length - 1] : null);
                const advogado = p.partes?.find(pt => pt.advogado)?.advogado || "";
                return (
                  <div
                    key={p.numeroProcesso}
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
                        {(p.vara || p.foro) && (
                          <p className="text-xs text-gray-500 mt-1 truncate">🏙️ {p.vara || p.foro}</p>
                        )}
                        {partePassiva && (
                          <div className="mt-2 flex flex-col gap-0.5">
                            <p className="text-xs text-amber-400 truncate">
                              <span className="text-gray-500">Indenizado: </span>
                              <span className="font-semibold">{partePassiva.nome}</span>
                            </p>
                            {(partePassiva.documento || partePassiva.cpfCnpj) && (
                              <p className="text-xs text-gray-500">
                                CPF/CNPJ: {partePassiva.documento || partePassiva.cpfCnpj}
                              </p>
                            )}
                            {advogado && (
                              <p className="text-xs text-indigo-400 truncate">⚖️ {advogado.split(",")[0]}</p>
                            )}
                          </div>
                        )}
                      </div>
                      <div className="text-right shrink-0">
                        {p.valor && (
                          <p className="text-sm font-semibold text-emerald-400">{p.valor}</p>
                        )}
                        {(p.dataDistribuicao || p.data) && (
                          <p className="text-xs text-gray-500 mt-1">{p.dataDistribuicao || p.data}</p>
                        )}
                        <span className="text-xs text-indigo-400 mt-2 block">Ver detalhes →</span>
                      </div>
                    </div>
                  </div>
                );
              })
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
      {processoAberto !== null && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-start justify-end p-4 overflow-auto">
          <div className="bg-[#0d0d1a] border border-[#1e1e2e] rounded-2xl w-full max-w-2xl max-h-[95vh] overflow-auto">
            <div className="sticky top-0 bg-[#0d0d1a] border-b border-[#1e1e2e] p-4 flex items-center justify-between z-10">
              <div>
                <h2 className="font-mono text-indigo-400 font-bold text-sm">{processoAberto.numeroProcesso}</h2>
                <p className="text-xs text-gray-500 mt-0.5">{processoAberto.classe || "TJSP"}</p>
              </div>
              <button
                onClick={fecharModal}
                className="text-gray-500 hover:text-white text-xl w-8 h-8 flex items-center justify-center rounded-lg hover:bg-[#1a1a2e] transition-all"
              >
                ✕
              </button>
            </div>

            <div className="p-4 space-y-4">
              {detalheCarregando && (
                <div className="flex items-center gap-3 text-sm text-indigo-400 py-4">
                  <span className="w-5 h-5 border-2 border-indigo-400/30 border-t-indigo-400 rounded-full animate-spin"></span>
                  Carregando detalhes do TJSP...
                </div>
              )}

              {/* Telefones extraídos das movimentações */}
              {processoAberto.movimentacoes && processoAberto.movimentacoes.length > 0 && (() => {
                const tels = extrairTelefonesDeMovimentacoes(processoAberto.movimentacoes);
                if (tels.length === 0) return null;
                return (
                  <div className="bg-[#0f1f1a] border border-emerald-900/40 rounded-xl p-4">
                    <h3 className="text-xs font-bold text-emerald-400 tracking-wider mb-3">📱 TELEFONES ENCONTRADOS NOS AUTOS</h3>
                    <div className="flex flex-wrap gap-2">
                      {tels.map((tel, i) => (
                        <a
                          key={`tel-${i}`}
                          href={`https://wa.me/55${tel.replace(/\D/g, "")}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-3 py-1.5 bg-emerald-900/30 hover:bg-emerald-900/50 text-emerald-400 rounded-lg text-xs font-mono font-semibold flex items-center gap-1.5 transition-all"
                        >
                          📱 {tel}
                        </a>
                      ))}
                    </div>
                    <p className="text-xs text-gray-600 mt-2">Clique para abrir no WhatsApp</p>
                  </div>
                );
              })()}

              {/* ─── Painel de Dados Enriquecidos via API CPF ─── */}
              {(dadosCpfCarregando || dadosCpf) && (
                <div className="bg-gradient-to-br from-[#0a1628] to-[#0d1f3c] border border-blue-800/40 rounded-xl p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-xs font-bold text-blue-400 tracking-wider">🔍 DADOS ENRIQUECIDOS — INDENIZADO</h3>
                    {dadosCpfCarregando && (
                      <span className="flex items-center gap-1.5 text-xs text-blue-400">
                        <span className="w-3 h-3 border border-blue-400/30 border-t-blue-400 rounded-full animate-spin"></span>
                        Consultando base...
                      </span>
                    )}
                  </div>

                  {dadosCpf && (
                    <div className="space-y-3">
                      {/* Dados Pessoais */}
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <p className="text-xs text-gray-500">Nome Completo</p>
                          <p className="text-sm text-white font-semibold">{dadosCpf.nome}</p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-500">CPF</p>
                          <p className="text-sm text-white font-mono">{dadosCpf.cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4")}</p>
                        </div>
                        {dadosCpf.nascimento && (
                          <div>
                            <p className="text-xs text-gray-500">Nascimento</p>
                            <p className="text-sm text-white">{dadosCpf.nascimento}</p>
                          </div>
                        )}
                        {dadosCpf.sexo && (
                          <div>
                            <p className="text-xs text-gray-500">Sexo</p>
                            <p className="text-sm text-white">{dadosCpf.sexo === "M" ? "Masculino" : "Feminino"}</p>
                          </div>
                        )}
                        {dadosCpf.estado_civil && (
                          <div>
                            <p className="text-xs text-gray-500">Estado Civil</p>
                            <p className="text-sm text-white">{dadosCpf.estado_civil}</p>
                          </div>
                        )}
                      </div>

                      {/* Filiação */}
                      {dadosCpf.filiacao && (dadosCpf.filiacao.mae || dadosCpf.filiacao.pai) && (
                        <div className="border-t border-blue-900/30 pt-2">
                          <p className="text-xs text-gray-500 mb-1">Filiação</p>
                          {dadosCpf.filiacao.mae && <p className="text-xs text-gray-300">👩 Mãe: {dadosCpf.filiacao.mae}</p>}
                          {dadosCpf.filiacao.pai && <p className="text-xs text-gray-300">👨 Pai: {dadosCpf.filiacao.pai}</p>}
                        </div>
                      )}

                      {/* Score de Crédito */}
                      {dadosCpf.score && (
                        <div className="border-t border-blue-900/30 pt-2">
                          <p className="text-xs text-gray-500 mb-2">Score de Crédito</p>
                          <div className="flex gap-3">
                            {dadosCpf.score.CSB8 && (
                              <div className="bg-[#111128] rounded-lg px-3 py-2 text-center">
                                <p className="text-lg font-bold text-yellow-400">{dadosCpf.score.CSB8}</p>
                                <p className="text-xs text-gray-500">CSB8</p>
                                {dadosCpf.score.faixa_CSB8 && (
                                  <p className="text-xs font-semibold mt-0.5" style={{
                                    color: dadosCpf.score.faixa_CSB8 === "ALTISSIMO" ? "#f59e0b" :
                                           dadosCpf.score.faixa_CSB8 === "ALTO" ? "#22c55e" :
                                           dadosCpf.score.faixa_CSB8 === "MEDIO" ? "#3b82f6" :
                                           dadosCpf.score.faixa_CSB8 === "BAIXO" ? "#ef4444" : "#9ca3af"
                                  }}>{dadosCpf.score.faixa_CSB8}</p>
                                )}
                              </div>
                            )}
                            {dadosCpf.score.CSBA !== undefined && (
                              <div className="bg-[#111128] rounded-lg px-3 py-2 text-center">
                                <p className="text-lg font-bold text-blue-400">{dadosCpf.score.CSBA}</p>
                                <p className="text-xs text-gray-500">CSBA</p>
                                {dadosCpf.score.faixa_CSBA && (
                                  <p className="text-xs font-semibold mt-0.5" style={{
                                    color: dadosCpf.score.faixa_CSBA === "ALTISSIMO" ? "#f59e0b" :
                                           dadosCpf.score.faixa_CSBA === "ALTO" ? "#22c55e" :
                                           dadosCpf.score.faixa_CSBA === "MEDIO" ? "#3b82f6" :
                                           dadosCpf.score.faixa_CSBA === "BAIXO" ? "#ef4444" : "#9ca3af"
                                  }}>{dadosCpf.score.faixa_CSBA}</p>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Telefones da API CPF */}
                      {dadosCpf.telefones && dadosCpf.telefones.total > 0 && (
                        <div className="border-t border-blue-900/30 pt-2">
                          <p className="text-xs text-gray-500 mb-2">📱 Telefones Atualizados ({dadosCpf.telefones.total})</p>
                          <div className="flex flex-wrap gap-2">
                            {dadosCpf.telefones.itens.map((tel, i) => (
                              <a
                                key={`cpf-tel-${i}`}
                                href={`https://wa.me/55${tel.ddd}${tel.numero}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="px-3 py-1.5 bg-emerald-900/30 hover:bg-emerald-900/50 text-emerald-400 rounded-lg text-xs font-mono font-semibold flex items-center gap-1.5 transition-all border border-emerald-800/30"
                              >
                                📱 {tel.numero_completo}
                              </a>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Endereço */}
                      {dadosCpf.enderecos && dadosCpf.enderecos.total > 0 && dadosCpf.enderecos.itens[0] && (
                        <div className="border-t border-blue-900/30 pt-2">
                          <p className="text-xs text-gray-500 mb-1">📍 Endereço ({dadosCpf.enderecos.total} registro{dadosCpf.enderecos.total > 1 ? "s" : ""})</p>
                          {(() => {
                            const end = dadosCpf.enderecos!.itens[0];
                            return (
                              <p className="text-xs text-gray-300">
                                {[end.tipo_logradouro, end.logradouro, end.numero].filter(Boolean).join(" ")}
                                {end.bairro ? ` — ${end.bairro}` : ""}
                                {end.cidade ? `, ${end.cidade}/${end.uf}` : ""}
                                {end.cep ? ` — CEP ${end.cep}` : ""}
                              </p>
                            );
                          })()}
                        </div>
                      )}
                    </div>
                  )}
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
                    {processoAberto.partes.map((parte, i) => {
                      const tipoStr = (parte.polo || parte.tipo || "").toLowerCase();
                      const isAtivo = tipoStr.includes("ativo") || tipoStr.includes("autor") ||
                        tipoStr.includes("exeqte") || tipoStr.includes("exequente") || tipoStr.includes("requerente");
                      return (
                        <div key={`parte-${i}`} className="border border-[#1e1e2e] rounded-lg p-3">
                          <div className="flex items-center gap-2 mb-1">
                            <span className={`px-2 py-0.5 rounded text-xs font-bold ${
                              isAtivo ? "bg-emerald-900/40 text-emerald-400" : "bg-red-900/40 text-red-400"
                            }`}>
                              {parte.polo || parte.tipo || "PARTE"}
                            </span>
                          </div>
                          <p className="text-sm text-white font-semibold">{parte.nome}</p>
                          {(parte.documento || parte.cpfCnpj) && (
                            <p className="text-xs text-gray-500 mt-0.5">Doc: {parte.documento || parte.cpfCnpj}</p>
                          )}
                          {parte.advogado && (
                            <p className="text-xs text-indigo-400 mt-1">⚖️ Adv: {parte.advogado}</p>
                          )}
                        </div>
                      );
                    })}
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
                      <div key={`mov-${i}`} className="flex gap-3 text-sm border-b border-[#1e1e2e] pb-2 last:border-0">
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
                        key={`doc-${i}`}
                        href={doc.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
                      >
                        📄 {doc.titulo || doc.nome || "Documento"}
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
                      downloadTxt(txt, `processo_${processoAberto.numeroProcesso}.txt`);
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
                  {processoAberto.urlPastaDigital && (
                    <a
                      href={processoAberto.urlPastaDigital}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-3 py-2 bg-gradient-to-r from-teal-700 to-cyan-700 hover:from-teal-600 hover:to-cyan-600 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all"
                    >
                      📂 VISUALIZAR AUTOS
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
                onClick={fecharIaModal}
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

      {/* Modal de Configuração de Cookies */}
      {modalCookies && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[70] flex items-center justify-center p-4">
          <div className="bg-[#0d0d1a] border border-[#1e1e2e] rounded-2xl w-full max-w-lg">
            <div className="flex items-center justify-between p-4 border-b border-[#1e1e2e]">
              <h3 className="font-bold text-sm text-yellow-400 tracking-wider">🔑 CONFIGURAR SESSÃO TJSP</h3>
              <button
                onClick={() => setModalCookies(false)}
                className="text-gray-500 hover:text-white text-xl w-8 h-8 flex items-center justify-center rounded-lg hover:bg-[#1a1a2e]"
              >
                ✕
              </button>
            </div>
            <div className="p-4 space-y-4">
              <div className="bg-[#111128] rounded-xl p-3 text-xs text-gray-400 space-y-2">
                <p className="font-semibold text-yellow-400">Como obter os cookies do TJSP:</p>
                <ol className="list-decimal list-inside space-y-1">
                  <li>Acesse <a href="https://esaj.tjsp.jus.br/cpopg/open.do" target="_blank" rel="noopener noreferrer" className="text-indigo-400 hover:underline">esaj.tjsp.jus.br</a> e faça login</li>
                  <li>Pressione F12 para abrir o DevTools</li>
                  <li>Vá em Application → Cookies → esaj.tjsp.jus.br</li>
                  <li>Copie o valor de <code className="bg-[#1a1a2e] px-1 rounded">JSESSIONID</code> e <code className="bg-[#1a1a2e] px-1 rounded">K-JSESSIONID-*</code></li>
                  <li>Cole no formato: <code className="bg-[#1a1a2e] px-1 rounded">JSESSIONID=abc; K-JSESSIONID-xxx=yyy</code></li>
                </ol>
              </div>
              <textarea
                value={cookiesInput}
                onChange={e => setCookiesInput(e.target.value)}
                placeholder="Cole os cookies aqui: JSESSIONID=abc123; K-JSESSIONID-xxx=yyy..."
                rows={4}
                className="w-full bg-[#1a1a2e] border border-[#2a2a4e] text-white rounded-xl px-4 py-3 text-xs focus:outline-none focus:border-indigo-500 placeholder-gray-600 font-mono resize-none"
              />
              <div className="flex gap-3">
                <button
                  onClick={configurarCookies}
                  disabled={configurandoCookies}
                  className="flex-1 bg-gradient-to-r from-indigo-600 to-purple-700 hover:from-indigo-500 hover:to-purple-600 disabled:opacity-50 text-white font-bold px-6 py-3 rounded-xl text-sm tracking-wider transition-all"
                >
                  {configurandoCookies ? "Configurando..." : "✅ SALVAR COOKIES"}
                </button>
                <button
                  onClick={() => setModalCookies(false)}
                  className="px-6 py-3 bg-[#1a1a2e] hover:bg-[#2a2a4e] text-gray-400 rounded-xl text-sm transition-all"
                >
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
