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

  // Processar token de URL ao carregar (para registrar log e identificar o usuário)
  useEffect(() => {
    if (isAdminRoute) return;

    const params = new URLSearchParams(window.location.search);
    const token = params.get("token") || sessionStorage.getItem("painel_acesso_token");

    if (!token) return;

    // Validar token no backend para registrar log e obter dados do usuário
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
        } else {
          // Token inválido: limpar sessão mas manter acesso ao painel
          sessionStorage.removeItem("painel_acesso_token");
          sessionStorage.removeItem("painel_acesso_usuario");
        }
      })
      .catch(() => {
        // Erro de rede: tentar restaurar usuário da sessão
        const savedUsuario = sessionStorage.getItem("painel_acesso_usuario");
        if (savedUsuario) {
          try { setUsuarioAcesso(JSON.parse(savedUsuario)); } catch { /* ignore */ }
        }
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdminRoute]);

  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="dark">
        <TooltipProvider>
          {/* translate="no" previne o Google Translate de modificar o DOM e causar erros no React */}
          <div translate="no" className="contents">
            <Toaster theme="dark" position="top-right" />
            {/* Painel admin tem sua própria autenticação. Painel principal é sempre acessível. */}
            {isAdminRoute ? <AdminAcesso /> : <Router />}
          </div>
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
