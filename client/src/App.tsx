import { useState } from "react";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import Painel from "@/pages/Painel";
import SenhaAcesso, { verificarSenhaAcesso } from "@/pages/SenhaAcesso";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";

function Router() {
  return (
    <Switch>
      <Route path={"/"} component={Painel} />
      <Route path={"/painel"} component={Painel} />
      <Route path={"/404"} component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  // Verificar se já está autenticado com a senha de acesso
  const [autenticado, setAutenticado] = useState<boolean>(verificarSenhaAcesso);

  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="dark">
        <TooltipProvider>
          {/* translate="no" previne o Google Translate de modificar o DOM e causar erros no React */}
          <div translate="no" className="contents">
            <Toaster theme="dark" position="top-right" />
            {autenticado ? (
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
