import { useState, useEffect, useRef } from "react";

const SENHA_CORRETA = "384378";
const SESSION_KEY = "painel_juridico_senha_ok";

interface SenhaAcessoProps {
  onAutenticado: () => void;
}

export default function SenhaAcesso({ onAutenticado }: SenhaAcessoProps) {
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState(false);
  const [tentativas, setTentativas] = useState(0);
  const [bloqueado, setBloqueado] = useState(false);
  const [tempoRestante, setTempoRestante] = useState(0);
  const [mostrarSenha, setMostrarSenha] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (bloqueado && tempoRestante > 0) {
      const timer = setTimeout(() => setTempoRestante(t => t - 1), 1000);
      return () => clearTimeout(timer);
    }
    if (bloqueado && tempoRestante === 0) {
      setBloqueado(false);
      setTentativas(0);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [bloqueado, tempoRestante]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (bloqueado || senha.length === 0) return;

    if (senha === SENHA_CORRETA) {
      sessionStorage.setItem(SESSION_KEY, "true");
      onAutenticado();
    } else {
      const novasTentativas = tentativas + 1;
      setTentativas(novasTentativas);
      setErro(true);
      setSenha("");
      setTimeout(() => {
        setErro(false);
        inputRef.current?.focus();
      }, 1500);

      if (novasTentativas >= 3) {
        setBloqueado(true);
        setTempoRestante(30);
      }
    }
  };

  return (
    <div
      className="min-h-screen bg-[#07071a] flex items-center justify-center p-4"
      translate="no"
    >
      {/* Fundo com gradiente */}
      <div className="absolute inset-0 bg-gradient-to-br from-indigo-950/20 via-[#07071a] to-purple-950/10 pointer-events-none" />

      {/* Partículas decorativas */}
      <div className="absolute top-20 left-1/4 w-64 h-64 bg-indigo-600/5 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-20 right-1/4 w-48 h-48 bg-purple-600/5 rounded-full blur-3xl pointer-events-none" />

      <div className="relative w-full max-w-sm">
        {/* Logo e título */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-indigo-900/30 border border-indigo-700/30 rounded-3xl mb-5 shadow-lg shadow-indigo-900/20">
            <span className="text-4xl">⚖️</span>
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Painel Jurídico</h1>
          <p className="text-sm text-gray-500 mt-1 tracking-widest uppercase text-xs">TJSP — Consulta Processual</p>
        </div>

        {/* Card de login */}
        <div className="bg-[#0d0d1a] border border-[#1e1e2e] rounded-2xl p-8 shadow-2xl shadow-black/40">
          {/* Cabeçalho do card */}
          <div className="flex items-center gap-2 mb-5">
            <div className="w-8 h-8 rounded-lg bg-indigo-900/40 border border-indigo-700/30 flex items-center justify-center">
              <svg className="w-4 h-4 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
            <div>
              <h2 className="text-sm font-semibold text-white">Acesso Restrito</h2>
              <p className="text-xs text-gray-500">Informe a senha para continuar</p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-2 uppercase tracking-wider">
                Senha de Acesso
              </label>
              <div className="relative">
                <input
                  ref={inputRef}
                  type={mostrarSenha ? "text" : "password"}
                  value={senha}
                  onChange={e => setSenha(e.target.value)}
                  disabled={bloqueado}
                  placeholder={mostrarSenha ? "Digite a senha..." : "••••••"}
                  maxLength={20}
                  className={`w-full px-4 py-3.5 pr-12 rounded-xl bg-[#111128] border text-white placeholder-gray-600 text-center text-lg tracking-[0.4em] font-mono transition-all duration-200 outline-none
                    ${erro
                      ? "border-red-500/70 bg-red-950/20 shadow-sm shadow-red-900/30"
                      : bloqueado
                        ? "border-orange-700/40 bg-orange-950/10 cursor-not-allowed opacity-60"
                        : "border-[#2a2a3e] focus:border-indigo-500/60 focus:bg-[#13132a] focus:shadow-sm focus:shadow-indigo-900/20"
                    }`}
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setMostrarSenha(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 transition-colors"
                  tabIndex={-1}
                >
                  {mostrarSenha ? (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                    </svg>
                  ) : (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            {/* Mensagem de erro */}
            {erro && !bloqueado && (
              <div className="flex items-center gap-2 px-3 py-2.5 bg-red-950/30 border border-red-800/40 rounded-xl">
                <span className="text-red-400 text-base shrink-0">🔒</span>
                <p className="text-xs text-red-300">
                  Senha incorreta.{" "}
                  {tentativas < 3 && (
                    <span className="text-red-400/70">{3 - tentativas} tentativa(s) restante(s).</span>
                  )}
                </p>
              </div>
            )}

            {/* Mensagem de bloqueio */}
            {bloqueado && (
              <div className="flex items-center gap-2 px-3 py-2.5 bg-orange-950/30 border border-orange-800/40 rounded-xl">
                <span className="text-orange-400 text-base shrink-0">⏳</span>
                <p className="text-xs text-orange-300">
                  Acesso bloqueado por muitas tentativas.{" "}
                  <span className="font-bold text-orange-400">Aguarde {tempoRestante}s.</span>
                </p>
              </div>
            )}

            <button
              type="submit"
              disabled={bloqueado || senha.length === 0}
              className={`w-full py-3.5 rounded-xl font-bold text-sm transition-all duration-200 flex items-center justify-center gap-2
                ${bloqueado || senha.length === 0
                  ? "bg-gray-800/60 text-gray-600 cursor-not-allowed"
                  : "bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-900/30 active:scale-[0.98] hover:shadow-indigo-800/40"
                }`}
            >
              {bloqueado ? (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                  Bloqueado ({tempoRestante}s)
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
                  </svg>
                  Entrar no Painel
                </>
              )}
            </button>
          </form>
        </div>

        <p className="text-center text-xs text-gray-600 mt-5">
          Acesso autorizado somente para usuários credenciados
        </p>
      </div>
    </div>
  );
}

/** Verifica se a sessão atual já está autenticada com a senha */
export function verificarSenhaAcesso(): boolean {
  return sessionStorage.getItem(SESSION_KEY) === "true";
}
