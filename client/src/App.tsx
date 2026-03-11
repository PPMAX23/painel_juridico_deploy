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
  // A rota /admin tem seu próprio sistema de autenticação — não usa a senha de acesso normal
  const isAdminRoute = location === "/admin";

  // Verificar se já está autenticado com a senha de acesso
  const [autenticado, setAutenticado] = useState<boolean>(verificarSenhaAcesso);

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
            // Salvar token na sessão para persistência
            sessionStorage.setItem("painel_acesso_token", token);
            sessionStorage.setItem("painel_acesso_usuario", JSON.stringify(data.usuario));
          }
        })
        .catch(() => {});
    } else {
      // Tentar restaurar da sessão
      const savedToken = sessionStorage.getItem("painel_acesso_token");
      const savedUsuario = sessionStorage.getItem("painel_acesso_usuario");
      if (savedToken && savedUsuario) {
        try {
          setUsuarioAcesso(JSON.parse(savedUsuario));
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
