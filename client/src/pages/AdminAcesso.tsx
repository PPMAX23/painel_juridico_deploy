import { useState, useEffect, useCallback } from "react";

// ─── Tipos ────────────────────────────────────────────────────────────────────
interface Usuario {
  id: number;
  nome: string;
  email?: string;
  token: string;
  ativo: boolean;
  permBuscar: boolean;
  permEnriquecimento: boolean;
  permAlvara: boolean;
  permOficio: boolean;
  permIA: boolean;
  limiteConsultasDia: number;
  expiresAt?: string | null;
  createdAt: string;
  totalConsultas?: number;
  consultasHoje?: number;
  ultimoAcesso?: string | null;
}

interface Log {
  id: number;
  usuarioNome: string;
  acao: string;
  detalhe?: string;
  ip?: string;
  createdAt: string;
}

// ─── Componente Principal ─────────────────────────────────────────────────────
export default function AdminAcesso() {
  const [autenticado, setAutenticado] = useState(false);
  const [verificando, setVerificando] = useState(true);
  const [aba, setAba] = useState<"usuarios" | "logs" | "config">("usuarios");

  // Verificar status de autenticação ao montar
  useEffect(() => {
    fetch("/api/admin/status")
      .then(r => r.json())
      .then(d => { setAutenticado(d.autenticado); setVerificando(false); })
      .catch(() => setVerificando(false));
  }, []);

  if (verificando) {
    return (
      <div className="min-h-screen bg-[#0a0f1e] flex items-center justify-center">
        <div className="text-blue-400 text-lg animate-pulse">Verificando acesso...</div>
      </div>
    );
  }

  if (!autenticado) {
    return <LoginAdmin onLogin={() => setAutenticado(true)} />;
  }

  return (
    <div className="min-h-screen bg-[#0a0f1e] text-white">
      {/* Header */}
      <div className="bg-[#0d1526] border-b border-blue-900/40 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-2xl">🛡️</span>
          <div>
            <h1 className="text-lg font-bold text-blue-300">Gestão de Acesso</h1>
            <p className="text-xs text-slate-400">Controle de usuários e permissões</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <a href="/" className="text-sm text-slate-400 hover:text-white transition-colors">← Voltar ao Painel</a>
          <button
            onClick={async () => {
              await fetch("/api/admin/logout", { method: "POST" });
              setAutenticado(false);
            }}
            className="px-3 py-1.5 bg-red-900/40 hover:bg-red-800/60 border border-red-700/40 rounded text-sm text-red-300 transition-colors"
          >
            Sair
          </button>
        </div>
      </div>

      {/* Abas */}
      <div className="flex border-b border-blue-900/30 px-6 bg-[#0d1526]">
        {[
          { id: "usuarios", label: "👥 Usuários", },
          { id: "logs", label: "📋 Logs de Acesso" },
          { id: "config", label: "⚙️ Configurações" },
        ].map(a => (
          <button
            key={a.id}
            onClick={() => setAba(a.id as any)}
            className={`px-5 py-3 text-sm font-medium border-b-2 transition-colors ${
              aba === a.id
                ? "border-blue-500 text-blue-300"
                : "border-transparent text-slate-400 hover:text-white"
            }`}
          >
            {a.label}
          </button>
        ))}
      </div>

      {/* Conteúdo */}
      <div className="p-6">
        {aba === "usuarios" && <AbaUsuarios />}
        {aba === "logs" && <AbaLogs />}
        {aba === "config" && <AbaConfig />}
      </div>
    </div>
  );
}

// ─── Login Admin ──────────────────────────────────────────────────────────────
function LoginAdmin({ onLogin }: { onLogin: () => void }) {
  const [senha, setSenha] = useState("");
  const [totp, setTotp] = useState("");
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(false);
  const [precisaTotp, setPrecisaTotp] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErro("");
    setCarregando(true);
    try {
      const r = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ senha, totp: totp || undefined }),
      });
      const d = await r.json();
      if (r.ok) {
        onLogin();
      } else {
        if (d.error?.includes("autenticador")) {
          setPrecisaTotp(true);
          setErro("Digite o código do seu aplicativo autenticador");
        } else {
          setErro(d.error || "Erro ao fazer login");
        }
      }
    } catch {
      setErro("Erro de conexão");
    } finally {
      setCarregando(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0f1e] flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="text-5xl mb-4">🛡️</div>
          <h1 className="text-2xl font-bold text-blue-300">Gestão de Acesso</h1>
          <p className="text-slate-400 text-sm mt-1">Área restrita ao administrador</p>
        </div>

        <form onSubmit={handleLogin} className="bg-[#0d1526] border border-blue-900/40 rounded-xl p-6 space-y-4">
          <div>
            <label className="block text-xs text-slate-400 mb-1.5">Senha de Administrador</label>
            <input
              type="password"
              value={senha}
              onChange={e => setSenha(e.target.value)}
              placeholder="Digite sua senha"
              className="w-full bg-[#0a0f1e] border border-blue-900/40 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-blue-500"
              autoFocus
            />
          </div>

          {precisaTotp && (
            <div>
              <label className="block text-xs text-slate-400 mb-1.5">Código do Autenticador (6 dígitos)</label>
              <input
                type="text"
                value={totp}
                onChange={e => setTotp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="000000"
                className="w-full bg-[#0a0f1e] border border-yellow-700/40 rounded-lg px-3 py-2.5 text-white text-sm text-center tracking-widest text-lg font-mono focus:outline-none focus:border-yellow-500"
                maxLength={6}
              />
            </div>
          )}

          {erro && (
            <div className="bg-red-900/20 border border-red-700/40 rounded-lg px-3 py-2 text-red-300 text-sm">
              {erro}
            </div>
          )}

          <button
            type="submit"
            disabled={carregando || !senha}
            className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 rounded-lg text-sm font-medium transition-colors"
          >
            {carregando ? "Verificando..." : "Entrar"}
          </button>
        </form>
      </div>
    </div>
  );
}

// ─── Aba Usuários ─────────────────────────────────────────────────────────────
function AbaUsuarios() {
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [modalCriar, setModalCriar] = useState(false);
  const [modalEditar, setModalEditar] = useState<Usuario | null>(null);
  const [linkCopiado, setLinkCopiado] = useState<number | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const r = await fetch("/api/admin/usuarios");
      if (r.ok) setUsuarios(await r.json());
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  const copiarLink = (u: Usuario) => {
    const url = `${window.location.origin}/?token=${u.token}`;
    navigator.clipboard.writeText(url);
    setLinkCopiado(u.id);
    setTimeout(() => setLinkCopiado(null), 2000);
  };

  const revogar = async (id: number) => {
    if (!confirm("Revogar acesso deste usuário?")) return;
    await fetch(`/api/admin/usuarios/${id}/revogar`, { method: "POST" });
    carregar();
  };

  const ativar = async (id: number) => {
    await fetch(`/api/admin/usuarios/${id}/ativar`, { method: "POST" });
    carregar();
  };

  const deletar = async (id: number) => {
    if (!confirm("Deletar permanentemente este usuário?")) return;
    await fetch(`/api/admin/usuarios/${id}`, { method: "DELETE" });
    carregar();
  };

  const regenerar = async (id: number) => {
    if (!confirm("Gerar novo link para este usuário? O link antigo deixará de funcionar.")) return;
    const r = await fetch(`/api/admin/usuarios/${id}/regenerar-token`, { method: "POST" });
    if (r.ok) { carregar(); alert("Novo link gerado! Copie e envie para o usuário."); }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-bold text-white">Usuários da Equipe</h2>
          <p className="text-sm text-slate-400">{usuarios.length} usuário(s) cadastrado(s)</p>
        </div>
        <button
          onClick={() => setModalCriar(true)}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
        >
          <span>+</span> Adicionar Usuário
        </button>
      </div>

      {carregando ? (
        <div className="text-center py-12 text-slate-400">Carregando...</div>
      ) : usuarios.length === 0 ? (
        <div className="text-center py-12 bg-[#0d1526] border border-blue-900/30 rounded-xl">
          <div className="text-4xl mb-3">👥</div>
          <p className="text-slate-400">Nenhum usuário cadastrado ainda.</p>
          <p className="text-sm text-slate-500 mt-1">Clique em "Adicionar Usuário" para criar o primeiro acesso.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {usuarios.map(u => (
            <div key={u.id} className={`bg-[#0d1526] border rounded-xl p-4 ${u.ativo ? "border-blue-900/40" : "border-red-900/30 opacity-60"}`}>
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-semibold text-white">{u.nome}</span>
                    {u.ativo ? (
                      <span className="px-2 py-0.5 bg-green-900/30 border border-green-700/40 rounded text-xs text-green-400">Ativo</span>
                    ) : (
                      <span className="px-2 py-0.5 bg-red-900/30 border border-red-700/40 rounded text-xs text-red-400">Revogado</span>
                    )}
                    {u.expiresAt && new Date(u.expiresAt) < new Date() && (
                      <span className="px-2 py-0.5 bg-yellow-900/30 border border-yellow-700/40 rounded text-xs text-yellow-400">Expirado</span>
                    )}
                  </div>
                  {u.email && <p className="text-xs text-slate-400 mb-2">{u.email}</p>}

                  {/* Permissões */}
                  <div className="flex flex-wrap gap-1.5 mb-3">
                    {u.permBuscar && <span className="px-2 py-0.5 bg-blue-900/30 border border-blue-700/30 rounded text-xs text-blue-300">🔍 Busca</span>}
                    {u.permEnriquecimento && <span className="px-2 py-0.5 bg-purple-900/30 border border-purple-700/30 rounded text-xs text-purple-300">👤 Enriquecimento</span>}
                    {u.permAlvara && <span className="px-2 py-0.5 bg-green-900/30 border border-green-700/30 rounded text-xs text-green-300">📄 Alvará</span>}
                    {u.permOficio && <span className="px-2 py-0.5 bg-orange-900/30 border border-orange-700/30 rounded text-xs text-orange-300">📝 Ofício</span>}
                    {u.permIA && <span className="px-2 py-0.5 bg-cyan-900/30 border border-cyan-700/30 rounded text-xs text-cyan-300">🤖 IA</span>}
                    <span className="px-2 py-0.5 bg-slate-800 border border-slate-700/30 rounded text-xs text-slate-300">📊 {u.limiteConsultasDia}/dia</span>
                  </div>

                  {/* Estatísticas */}
                  <div className="flex gap-4 text-xs text-slate-400">
                    <span>Total: <strong className="text-white">{u.totalConsultas || 0}</strong> consultas</span>
                    <span>Hoje: <strong className="text-white">{u.consultasHoje || 0}</strong></span>
                    {u.ultimoAcesso && (
                      <span>Último acesso: <strong className="text-white">{new Date(u.ultimoAcesso).toLocaleDateString("pt-BR")}</strong></span>
                    )}
                    {u.expiresAt && (
                      <span>Expira: <strong className="text-yellow-300">{new Date(u.expiresAt).toLocaleDateString("pt-BR")}</strong></span>
                    )}
                  </div>
                </div>

                {/* Ações */}
                <div className="flex flex-col gap-2 shrink-0">
                  <button
                    onClick={() => copiarLink(u)}
                    className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                      linkCopiado === u.id
                        ? "bg-green-700 text-white"
                        : "bg-blue-900/40 hover:bg-blue-800/60 border border-blue-700/40 text-blue-300"
                    }`}
                  >
                    {linkCopiado === u.id ? "✓ Copiado!" : "🔗 Copiar Link"}
                  </button>
                  <button
                    onClick={() => setModalEditar(u)}
                    className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-600/40 rounded text-xs text-slate-300 transition-colors"
                  >
                    ✏️ Editar
                  </button>
                  <button
                    onClick={() => regenerar(u.id)}
                    className="px-3 py-1.5 bg-yellow-900/30 hover:bg-yellow-800/40 border border-yellow-700/30 rounded text-xs text-yellow-300 transition-colors"
                  >
                    🔄 Novo Link
                  </button>
                  {u.ativo ? (
                    <button
                      onClick={() => revogar(u.id)}
                      className="px-3 py-1.5 bg-red-900/30 hover:bg-red-800/40 border border-red-700/30 rounded text-xs text-red-300 transition-colors"
                    >
                      🚫 Revogar
                    </button>
                  ) : (
                    <button
                      onClick={() => ativar(u.id)}
                      className="px-3 py-1.5 bg-green-900/30 hover:bg-green-800/40 border border-green-700/30 rounded text-xs text-green-300 transition-colors"
                    >
                      ✅ Reativar
                    </button>
                  )}
                  <button
                    onClick={() => deletar(u.id)}
                    className="px-3 py-1.5 bg-red-950/40 hover:bg-red-900/40 border border-red-800/30 rounded text-xs text-red-400 transition-colors"
                  >
                    🗑️ Deletar
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {modalCriar && <ModalUsuario onClose={() => { setModalCriar(false); carregar(); }} />}
      {modalEditar && <ModalUsuario usuario={modalEditar} onClose={() => { setModalEditar(null); carregar(); }} />}
    </div>
  );
}

// ─── Modal Criar/Editar Usuário ───────────────────────────────────────────────
function ModalUsuario({ usuario, onClose }: { usuario?: Usuario; onClose: () => void }) {
  const [nome, setNome] = useState(usuario?.nome || "");
  const [email, setEmail] = useState(usuario?.email || "");
  const [permBuscar, setPermBuscar] = useState(usuario?.permBuscar ?? true);
  const [permEnriquecimento, setPermEnriquecimento] = useState(usuario?.permEnriquecimento ?? true);
  const [permAlvara, setPermAlvara] = useState(usuario?.permAlvara ?? false);
  const [permOficio, setPermOficio] = useState(usuario?.permOficio ?? false);
  const [permIA, setPermIA] = useState(usuario?.permIA ?? true);
  const [limite, setLimite] = useState(usuario?.limiteConsultasDia ?? 50);
  const [expira, setExpira] = useState(usuario?.expiresAt ? usuario.expiresAt.split("T")[0] : "");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  const salvar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nome.trim()) { setErro("Nome obrigatório"); return; }
    setSalvando(true);
    setErro("");
    try {
      const dados = {
        nome: nome.trim(),
        email: email.trim() || undefined,
        permBuscar, permEnriquecimento, permAlvara, permOficio, permIA,
        limiteConsultasDia: limite,
        expiresAt: expira ? new Date(expira).toISOString() : null,
      };
      const url = usuario ? `/api/admin/usuarios/${usuario.id}` : "/api/admin/usuarios";
      const method = usuario ? "PUT" : "POST";
      const r = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(dados),
      });
      if (r.ok) {
        onClose();
      } else {
        const d = await r.json();
        setErro(d.error || "Erro ao salvar");
      }
    } catch {
      setErro("Erro de conexão");
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-[#0d1526] border border-blue-900/40 rounded-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-blue-900/30">
          <h3 className="font-bold text-white">{usuario ? "Editar Usuário" : "Novo Usuário"}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white text-xl">×</button>
        </div>

        <form onSubmit={salvar} className="p-5 space-y-4">
          <div>
            <label className="block text-xs text-slate-400 mb-1">Nome *</label>
            <input
              value={nome}
              onChange={e => setNome(e.target.value)}
              placeholder="Ex: João Silva"
              className="w-full bg-[#0a0f1e] border border-blue-900/40 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
            />
          </div>

          <div>
            <label className="block text-xs text-slate-400 mb-1">E-mail (opcional)</label>
            <input
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="joao@escritorio.com"
              type="email"
              className="w-full bg-[#0a0f1e] border border-blue-900/40 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
            />
          </div>

          <div>
            <label className="block text-xs text-slate-400 mb-2">Permissões</label>
            <div className="space-y-2">
              {[
                { key: "buscar", label: "🔍 Buscar processos", val: permBuscar, set: setPermBuscar },
                { key: "enriquecimento", label: "👤 Enriquecimento de dados", val: permEnriquecimento, set: setPermEnriquecimento },
                { key: "alvara", label: "📄 Gerar Alvará", val: permAlvara, set: setPermAlvara },
                { key: "oficio", label: "📝 Gerar Ofício", val: permOficio, set: setPermOficio },
                { key: "ia", label: "🤖 Usar IA (dossiê, resumo)", val: permIA, set: setPermIA },
              ].map(p => (
                <label key={p.key} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={p.val}
                    onChange={e => p.set(e.target.checked)}
                    className="w-4 h-4 rounded accent-blue-500"
                  />
                  <span className="text-sm text-slate-300">{p.label}</span>
                </label>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs text-slate-400 mb-1">Limite de consultas por dia</label>
            <input
              type="number"
              value={limite}
              onChange={e => setLimite(parseInt(e.target.value) || 50)}
              min={1}
              max={500}
              className="w-full bg-[#0a0f1e] border border-blue-900/40 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
            />
          </div>

          <div>
            <label className="block text-xs text-slate-400 mb-1">Expiração do acesso (opcional)</label>
            <input
              type="date"
              value={expira}
              onChange={e => setExpira(e.target.value)}
              className="w-full bg-[#0a0f1e] border border-blue-900/40 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
            />
            <p className="text-xs text-slate-500 mt-1">Deixe em branco para acesso sem expiração</p>
          </div>

          {erro && (
            <div className="bg-red-900/20 border border-red-700/40 rounded-lg px-3 py-2 text-red-300 text-sm">{erro}</div>
          )}

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-600/40 rounded-lg text-sm text-slate-300 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={salvando}
              className="flex-1 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 rounded-lg text-sm font-medium transition-colors"
            >
              {salvando ? "Salvando..." : usuario ? "Salvar" : "Criar Usuário"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Aba Logs ─────────────────────────────────────────────────────────────────
function AbaLogs() {
  const [logs, setLogs] = useState<Log[]>([]);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    fetch("/api/admin/logs?limite=200")
      .then(r => r.json())
      .then(d => { setLogs(Array.isArray(d) ? d : []); setCarregando(false); })
      .catch(() => setCarregando(false));
  }, []);

  const acaoIcone: Record<string, string> = {
    "login": "🔑",
    "login-admin": "🛡️",
    "busca": "🔍",
    "enriquecimento": "👤",
    "alvara": "📄",
    "oficio": "📝",
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-bold text-white">Logs de Acesso</h2>
          <p className="text-sm text-slate-400">Últimas {logs.length} ações registradas</p>
        </div>
        <button
          onClick={() => {
            setCarregando(true);
            fetch("/api/admin/logs?limite=200")
              .then(r => r.json())
              .then(d => { setLogs(Array.isArray(d) ? d : []); setCarregando(false); });
          }}
          className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-600/40 rounded text-sm text-slate-300 transition-colors"
        >
          🔄 Atualizar
        </button>
      </div>

      {carregando ? (
        <div className="text-center py-12 text-slate-400">Carregando...</div>
      ) : logs.length === 0 ? (
        <div className="text-center py-12 text-slate-400">Nenhum log registrado ainda.</div>
      ) : (
        <div className="bg-[#0d1526] border border-blue-900/30 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-blue-900/30 text-xs text-slate-400">
                <th className="text-left px-4 py-3">Data/Hora</th>
                <th className="text-left px-4 py-3">Usuário</th>
                <th className="text-left px-4 py-3">Ação</th>
                <th className="text-left px-4 py-3">Detalhe</th>
                <th className="text-left px-4 py-3">IP</th>
              </tr>
            </thead>
            <tbody>
              {logs.map(log => (
                <tr key={log.id} className="border-b border-blue-900/20 hover:bg-blue-900/10 transition-colors">
                  <td className="px-4 py-2.5 text-slate-400 whitespace-nowrap">
                    {new Date(log.createdAt).toLocaleString("pt-BR")}
                  </td>
                  <td className="px-4 py-2.5 text-white font-medium">{log.usuarioNome}</td>
                  <td className="px-4 py-2.5">
                    <span className="flex items-center gap-1.5">
                      <span>{acaoIcone[log.acao] || "📌"}</span>
                      <span className="text-slate-300">{log.acao}</span>
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-slate-400 max-w-xs truncate">{log.detalhe || "—"}</td>
                  <td className="px-4 py-2.5 text-slate-500 font-mono text-xs">{log.ip || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Aba Configurações ────────────────────────────────────────────────────────
function AbaConfig() {
  const [novaSenha, setNovaSenha] = useState("");
  const [confirmaSenha, setConfirmaSenha] = useState("");
  const [senhaErro, setSenhaErro] = useState("");
  const [senhaOk, setSenhaOk] = useState(false);
  const [salvandoSenha, setSalvandoSenha] = useState(false);

  const [qrcode, setQrcode] = useState("");
  const [secret, setSecret] = useState("");
  const [codigoTotp, setCodigoTotp] = useState("");
  const [totpErro, setTotpErro] = useState("");
  const [totpOk, setTotpOk] = useState(false);
  const [carregandoQR, setCarregandoQR] = useState(false);

  const alterarSenha = async (e: React.FormEvent) => {
    e.preventDefault();
    setSenhaErro("");
    setSenhaOk(false);
    if (novaSenha.length < 4) { setSenhaErro("Senha deve ter pelo menos 4 caracteres"); return; }
    if (novaSenha !== confirmaSenha) { setSenhaErro("As senhas não coincidem"); return; }
    setSalvandoSenha(true);
    try {
      const r = await fetch("/api/admin/alterar-senha", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ novaSenha }),
      });
      if (r.ok) { setSenhaOk(true); setNovaSenha(""); setConfirmaSenha(""); }
      else { const d = await r.json(); setSenhaErro(d.error || "Erro"); }
    } finally {
      setSalvandoSenha(false);
    }
  };

  const carregarQR = async () => {
    setCarregandoQR(true);
    setTotpErro("");
    try {
      const r = await fetch("/api/admin/totp/qrcode");
      if (r.ok) {
        const d = await r.json();
        setQrcode(d.qrcode);
        setSecret(d.secret);
      }
    } finally {
      setCarregandoQR(false);
    }
  };

  const ativarTotp = async () => {
    setTotpErro("");
    const r = await fetch("/api/admin/totp/ativar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ codigo: codigoTotp }),
    });
    if (r.ok) { setTotpOk(true); setQrcode(""); }
    else { const d = await r.json(); setTotpErro(d.error || "Código inválido"); }
  };

  const desativarTotp = async () => {
    if (!confirm("Desativar autenticação de dois fatores? Isso reduz a segurança do painel.")) return;
    await fetch("/api/admin/totp/desativar", { method: "POST" });
    setTotpOk(false);
    setQrcode("");
    setSecret("");
  };

  return (
    <div className="max-w-lg space-y-6">
      {/* Alterar Senha */}
      <div className="bg-[#0d1526] border border-blue-900/40 rounded-xl p-5">
        <h3 className="font-bold text-white mb-4">🔐 Alterar Senha de Administrador</h3>
        <form onSubmit={alterarSenha} className="space-y-3">
          <div>
            <label className="block text-xs text-slate-400 mb-1">Nova Senha</label>
            <input
              type="password"
              value={novaSenha}
              onChange={e => setNovaSenha(e.target.value)}
              placeholder="Mínimo 4 caracteres"
              className="w-full bg-[#0a0f1e] border border-blue-900/40 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">Confirmar Nova Senha</label>
            <input
              type="password"
              value={confirmaSenha}
              onChange={e => setConfirmaSenha(e.target.value)}
              placeholder="Repita a senha"
              className="w-full bg-[#0a0f1e] border border-blue-900/40 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
            />
          </div>
          {senhaErro && <p className="text-red-400 text-sm">{senhaErro}</p>}
          {senhaOk && <p className="text-green-400 text-sm">✓ Senha alterada com sucesso!</p>}
          <button
            type="submit"
            disabled={salvandoSenha}
            className="w-full py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 rounded-lg text-sm font-medium transition-colors"
          >
            {salvandoSenha ? "Salvando..." : "Alterar Senha"}
          </button>
        </form>
      </div>

      {/* Autenticador 2FA */}
      <div className="bg-[#0d1526] border border-blue-900/40 rounded-xl p-5">
        <h3 className="font-bold text-white mb-2">📱 Autenticação de Dois Fatores (2FA)</h3>
        <p className="text-sm text-slate-400 mb-4">
          Adicione uma camada extra de segurança usando Google Authenticator, Authy ou outro app TOTP.
        </p>

        {totpOk ? (
          <div className="space-y-3">
            <div className="bg-green-900/20 border border-green-700/40 rounded-lg px-4 py-3 text-green-300 text-sm">
              ✅ Autenticação de dois fatores ativada com sucesso!
            </div>
            <button
              onClick={desativarTotp}
              className="w-full py-2 bg-red-900/30 hover:bg-red-800/40 border border-red-700/30 rounded-lg text-sm text-red-300 transition-colors"
            >
              Desativar 2FA
            </button>
          </div>
        ) : qrcode ? (
          <div className="space-y-4">
            <div className="text-center">
              <p className="text-sm text-slate-300 mb-3">Escaneie o QR Code com seu aplicativo autenticador:</p>
              <img src={qrcode} alt="QR Code 2FA" className="mx-auto rounded-lg border border-blue-900/40" style={{ width: 200, height: 200 }} />
              <p className="text-xs text-slate-500 mt-2">Ou insira manualmente: <code className="text-yellow-300 font-mono">{secret}</code></p>
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Código de verificação (6 dígitos)</label>
              <input
                type="text"
                value={codigoTotp}
                onChange={e => setCodigoTotp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="000000"
                maxLength={6}
                className="w-full bg-[#0a0f1e] border border-blue-900/40 rounded-lg px-3 py-2 text-white text-center text-xl font-mono tracking-widest focus:outline-none focus:border-blue-500"
              />
            </div>
            {totpErro && <p className="text-red-400 text-sm">{totpErro}</p>}
            <button
              onClick={ativarTotp}
              disabled={codigoTotp.length !== 6}
              className="w-full py-2 bg-green-700 hover:bg-green-600 disabled:opacity-50 rounded-lg text-sm font-medium transition-colors"
            >
              Verificar e Ativar 2FA
            </button>
          </div>
        ) : (
          <button
            onClick={carregarQR}
            disabled={carregandoQR}
            className="w-full py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 rounded-lg text-sm font-medium transition-colors"
          >
            {carregandoQR ? "Carregando..." : "Configurar Autenticador 2FA"}
          </button>
        )}
      </div>
    </div>
  );
}
