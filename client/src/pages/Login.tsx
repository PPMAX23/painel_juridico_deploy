import { useState, useEffect } from "react";
import { toast } from "sonner";

export default function Login() {
  const [verificando, setVerificando] = useState(true);
  const [tokenValido, setTokenValido] = useState(false);
  const [tempoRestante, setTempoRestante] = useState(0);

  // Verificar status do token ao carregar
  useEffect(() => {
    verificarToken();
  }, []);

  const verificarToken = async () => {
    try {
      const resp = await fetch("/api/token/status");
      const data = await resp.json();
      setTokenValido(data.valido);
      setTempoRestante(data.tempoRestante || 0);
      
      if (data.valido) {
        // Token válido, redirecionar para o painel
        window.location.href = "/painel";
      }
    } catch {
      setTokenValido(false);
    } finally {
      setVerificando(false);
    }
  };

  if (verificando) {
    return (
      <div className="min-h-screen bg-[#050507] flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-2 border-indigo-500/30 border-t-indigo-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#050507] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center mb-4">
            <svg className="w-8 h-8 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l-3 9a5.002 5.002 0 006.001 0M18 7l3 9m-3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-white tracking-widest">PAINEL JURÍDICO</h1>
          <p className="text-gray-500 text-xs mt-1 uppercase tracking-widest">Acesso Restrito</p>
        </div>

        {/* Card de sessão expirada */}
        <div className="bg-[#0f0f14] border border-white/10 rounded-2xl p-6">
          <div className="flex items-center gap-3 mb-6 p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl">
            <svg className="w-5 h-5 text-amber-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <div>
              <p className="text-amber-400 text-sm font-bold">Sessão Expirada</p>
              <p className="text-amber-400/70 text-xs mt-0.5">
                O token de acesso expirou. Para renovar, faça login no painel de origem e copie o novo token.
              </p>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-gray-400 text-xs mb-2 uppercase tracking-widest">Como renovar o acesso:</label>
              <ol className="space-y-2 text-sm text-gray-400">
                <li className="flex gap-2">
                  <span className="text-indigo-400 font-bold shrink-0">1.</span>
                  <span>Acesse <a href="http://191.101.131.161/login" target="_blank" rel="noopener noreferrer" className="text-indigo-400 hover:underline">http://191.101.131.161/login</a> e faça login</span>
                </li>
                <li className="flex gap-2">
                  <span className="text-indigo-400 font-bold shrink-0">2.</span>
                  <span>Abra o DevTools (F12) → Application → Cookies</span>
                </li>
                <li className="flex gap-2">
                  <span className="text-indigo-400 font-bold shrink-0">3.</span>
                  <span>Copie o valor do cookie <code className="bg-white/5 px-1 rounded text-white">token</code></span>
                </li>
                <li className="flex gap-2">
                  <span className="text-indigo-400 font-bold shrink-0">4.</span>
                  <span>Cole abaixo e clique em Renovar</span>
                </li>
              </ol>
            </div>

            <TokenRenovarForm onRenovado={() => window.location.href = "/painel"} />
          </div>
        </div>

        <p className="text-center text-gray-600 text-xs mt-4">
          Rodrigo Cavalcanti — OAB/SP 200.287
        </p>
      </div>
    </div>
  );
}

function TokenRenovarForm({ onRenovado }: { onRenovado: () => void }) {
  const [token, setToken] = useState("");
  const [salvando, setSalvando] = useState(false);

  const renovar = async () => {
    if (!token.trim()) {
      toast.error("Cole o token JWT no campo acima");
      return;
    }
    setSalvando(true);
    try {
      const resp = await fetch("/api/token/atualizar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: token.trim() }),
      });
      const data = await resp.json();
      if (data.ok) {
        toast.success("Token renovado com sucesso!");
        setTimeout(onRenovado, 1000);
      } else {
        toast.error("Erro ao renovar token");
      }
    } catch {
      toast.error("Erro ao conectar ao servidor");
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="space-y-3">
      <div>
        <label className="block text-gray-400 text-xs mb-1.5 uppercase tracking-widest">Token JWT</label>
        <textarea
          value={token}
          onChange={e => setToken(e.target.value)}
          placeholder="Cole aqui o valor do cookie 'token'..."
          rows={3}
          className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white text-xs font-mono outline-none focus:border-indigo-500/50 transition-colors resize-none placeholder-gray-600"
        />
      </div>
      <button
        onClick={renovar}
        disabled={salvando || !token.trim()}
        className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-bold text-sm transition-all flex items-center justify-center gap-2"
      >
        {salvando ? (
          <>
            <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Renovando...
          </>
        ) : (
          <>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            RENOVAR ACESSO
          </>
        )}
      </button>
    </div>
  );
}
