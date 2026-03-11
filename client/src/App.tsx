import { useState, useEffect } from "react";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import Painel from "@/pages/Painel";
import AdminAcesso from "@/pages/AdminAcesso";
import { Route, Switch, useLocation } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";

// Informações do usuário autenticado via token de URL
export interface UsuarioAcesso {
  id: number;
  nome: string;
  permBuscar: boolean;
  permEnriquecimento: boolean;
  permAlvara: boolean;
  permOficio: boolean;
  permIA: boolean;
  limiteConsultasDia: number;
}

// Contexto global do usuário (token de URL)
let _usuarioAcesso: UsuarioAcesso | null = null;
export function getUsuarioAcesso(): UsuarioAcesso | null { return _usuarioAcesso; }
export function setUsuarioAcesso(u: UsuarioAcesso | null) { _usuarioAcesso = u; }

// Tela de carregamento enquanto valida o token
function CarregandoAcesso() {
  return (
    <div className="min-h-screen bg-[#07071a] flex items-center justify-center">
      <div className="text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 bg-indigo-900/30 border border-indigo-700/30 rounded-2xl mb-4">
          <span className="text-3xl">⚖️</span>
        </div>
        <div className="flex items-center gap-2 text-indigo-400 text-sm">
          <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <span>Verificando acesso...</span>
        </div>
      </div>
    </div>
  );
}

// Tela de acesso negado (token revogado, expirado ou excluído)
function AcessoNegado({ motivo }: { motivo: string }) {
  return (
    <div className="min-h-screen bg-[#07071a] flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        <div className="bg-[#0d0d2b] border border-red-800/40 rounded-2xl p-8 text-center shadow-2xl">
          {/* Ícone */}
          <div className="inline-flex items-center justify-center w-20 h-20 bg-red-900/20 border border-red-700/30 rounded-full mb-6">
            <svg className="w-10 h-10 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
            </svg>
          </div>

          {/* Título */}
          <h1 className="text-xl font-bold text-red-300 mb-2">Acesso Não Autorizado</h1>
          <p className="text-slate-400 text-sm mb-6 leading-relaxed">{motivo}</p>

          {/* Detalhes */}
          <div className="bg-red-950/20 border border-red-800/20 rounded-xl p-4 mb-6 text-left">
            <p className="text-xs text-slate-500 leading-relaxed">
              Este link de acesso foi <span className="text-red-400 font-medium">desativado ou expirou</span>.
              Entre em contato com o administrador do sistema para obter um novo link de acesso.
            </p>
          </div>

          {/* Logo */}
          <div className="flex items-center justify-center gap-2 text-slate-600 text-xs">
            <span>⚖️</span>
            <span>Painel Jurídico — Acesso Restrito</span>
          </div>
        </div>
      </div>
    </div>
  );
}

type EstadoAcesso = "loading" | "liberado" | "bloqueado";

function Router() {
  return (
    <Switch>
      <Route path={"/"} component={Painel} />
      <Route path={"/painel"} component={Painel} />
      <Route path={"/admin"} component={AdminAcesso} />
      <Route path={"/404"} component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  const [location] = useLocation();
  const isAdminRoute = location === "/admin";

  const tokenURL = new URLSearchParams(window.location.search).get("token");
  const tokenSessao = sessionStorage.getItem("painel_acesso_token");
  const token = tokenURL || tokenSessao;

  // Se não há token nenhum, acesso livre ao painel
  // Se há token, precisamos validar antes de liberar
  const [estado, setEstado] = useState<EstadoAcesso>(
    isAdminRoute ? "liberado" : token ? "loading" : "liberado"
  );
  const [motivoBloqueio, setMotivoBloqueio] = useState<string>("");

  useEffect(() => {
    if (isAdminRoute || !token) return;

    // Validar token no backend
    fetch("/api/acesso/validar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    })
      .then(r => r.json())
      .then(data => {
        if (data.valido && data.usuario) {
          // Token válido: salvar usuário e liberar acesso
          setUsuarioAcesso(data.usuario);
          sessionStorage.setItem("painel_acesso_token", token);
          sessionStorage.setItem("painel_acesso_usuario", JSON.stringify(data.usuario));
          setEstado("liberado");
        } else {
          // Token inválido, revogado ou expirado: bloquear acesso
          sessionStorage.removeItem("painel_acesso_token");
          sessionStorage.removeItem("painel_acesso_usuario");
          const motivo = data.motivo || "Link de acesso inválido ou expirado.";
          setMotivoBloqueio(motivo);
          setEstado("bloqueado");
        }
      })
      .catch(() => {
        // Erro de rede: tentar restaurar da sessão
        const savedUsuario = sessionStorage.getItem("painel_acesso_usuario");
        if (savedUsuario) {
          try {
            setUsuarioAcesso(JSON.parse(savedUsuario));
            setEstado("liberado");
          } catch {
            setEstado("liberado"); // fallback: liberar em caso de erro de rede
          }
        } else {
          setEstado("liberado"); // sem sessão salva, liberar normalmente
        }
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdminRoute]);

  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="dark">
        <TooltipProvider>
          <div translate="no" className="contents">
            <Toaster theme="dark" position="top-right" />
            {isAdminRoute ? (
              <AdminAcesso />
            ) : estado === "loading" ? (
              <CarregandoAcesso />
            ) : estado === "bloqueado" ? (
              <AcessoNegado motivo={motivoBloqueio} />
            ) : (
              <Router />
            )}
          </div>
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
