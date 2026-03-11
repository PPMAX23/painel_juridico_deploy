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

// Verificar se há token na URL (acesso direto de funcionário)
function temTokenNaURL(): boolean {
  const params = new URLSearchParams(window.location.search);
  return !!params.get("token");
}

// Verificar se há token salvo na sessão (funcionário já autenticado anteriormente)
function temTokenNaSessao(): boolean {
  return !!sessionStorage.getItem("painel_acesso_token");
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

function App() {
  const [location] = useLocation();
  const isAdminRoute = location === "/admin";

  // Autenticado se: já tem senha na sessão OU tem token na URL/sessão (funcionário)
  const [autenticado, setAutenticado] = useState<boolean>(() => {
    return verificarSenhaAcesso() || temTokenNaURL() || temTokenNaSessao();
  });

  // Processar token de URL ao carregar
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get("token");

    if (token && !isAdminRoute) {
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
            // Salvar token na sessão para persistência (não pede senha novamente)
            sessionStorage.setItem("painel_acesso_token", token);
            sessionStorage.setItem("painel_acesso_usuario", JSON.stringify(data.usuario));
            setAutenticado(true);
          } else {
            // Token inválido ou revogado — limpar sessão e pedir senha
            sessionStorage.removeItem("painel_acesso_token");
            sessionStorage.removeItem("painel_acesso_usuario");
            setAutenticado(verificarSenhaAcesso());
          }
        })
        .catch(() => {});
    } else if (!isAdminRoute) {
      // Tentar restaurar da sessão (funcionário que já acessou antes)
      const savedToken = sessionStorage.getItem("painel_acesso_token");
      const savedUsuario = sessionStorage.getItem("painel_acesso_usuario");
      if (savedToken && savedUsuario) {
        try {
          setUsuarioAcesso(JSON.parse(savedUsuario));
          setAutenticado(true);
        } catch { /* ignore */ }
      }
    }
  }, [isAdminRoute]);

  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="dark">
        <TooltipProvider>
          {/* translate="no" previne o Google Translate de modificar o DOM e causar erros no React */}
          <div translate="no" className="contents">
            <Toaster theme="dark" position="top-right" />
            {isAdminRoute ? (
              <AdminAcesso />
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
