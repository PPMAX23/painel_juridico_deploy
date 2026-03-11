import { useState, useEffect } from "react";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import Painel from "@/pages/Painel";
import AdminAcesso from "@/pages/AdminAcesso";
import SenhaAcesso, { verificarSenhaAcesso } from "@/pages/SenhaAcesso";
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

// Pegar token da URL (se existir)
function getTokenDaURL(): string | null {
  const params = new URLSearchParams(window.location.search);
  return params.get("token");
}

// Pegar token salvo na sessão
function getTokenDaSessao(): string | null {
  return sessionStorage.getItem("painel_acesso_token");
}

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

function App() {
  const [location] = useLocation();
  const isAdminRoute = location === "/admin";

  const tokenURL = getTokenDaURL();
  const tokenSessao = getTokenDaSessao();
  const temToken = !!(tokenURL || tokenSessao);

  // Estado de autenticação:
  // - "loading": tem token na URL, aguardando validação no backend
  // - true: autenticado (senha ok ou token válido)
  // - false: não autenticado, mostrar tela de senha
  const [autenticado, setAutenticado] = useState<boolean | "loading">(() => {
    if (isAdminRoute) return false; // admin tem seu próprio fluxo
    if (verificarSenhaAcesso()) return true; // já autenticado com senha
    if (temToken) return "loading"; // tem token, vai validar
    return false; // sem token, pedir senha
  });

  useEffect(() => {
    if (isAdminRoute) return;

    const token = tokenURL || tokenSessao;
    if (!token) return;

    // Validar token no backend e registrar log de acesso
    fetch("/api/acesso/validar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    })
      .then(r => r.json())
      .then(data => {
        if (data.valido && data.usuario) {
          setUsuarioAcesso(data.usuario);
          sessionStorage.setItem("painel_acesso_token", token);
          sessionStorage.setItem("painel_acesso_usuario", JSON.stringify(data.usuario));
          setAutenticado(true);
        } else {
          // Token inválido/revogado — limpar sessão mas AINDA abrir o painel
          // (não mostrar tela de senha para quem veio por link)
          sessionStorage.removeItem("painel_acesso_token");
          sessionStorage.removeItem("painel_acesso_usuario");
          // Se veio por link mas token inválido, mostrar painel mesmo assim
          // (o admin pode ter revogado, mas não bloqueamos o acesso com senha)
          setAutenticado(verificarSenhaAcesso());
        }
      })
      .catch(() => {
        // Erro de rede: se veio por link, abrir o painel mesmo assim
        const savedUsuario = sessionStorage.getItem("painel_acesso_usuario");
        if (savedUsuario) {
          try { setUsuarioAcesso(JSON.parse(savedUsuario)); } catch { /* ignore */ }
        }
        setAutenticado(true);
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
            ) : autenticado === "loading" ? (
              <CarregandoAcesso />
            ) : autenticado ? (
              <Router />
            ) : (
              <SenhaAcesso onAutenticado={() => setAutenticado(true)} />
            )}
          </div>
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
