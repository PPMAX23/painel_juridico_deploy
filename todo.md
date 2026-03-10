# Painel Jurídico - TODO

## Backend (API)
- [ ] Rota POST /api/auth/login com usuário/senha/captcha
- [ ] Rota GET /api/auth/logout
- [x] Rota GET /api/buscar?tipo=oab|processo|cpf&query=... (proxy para API externa)
- [x] Rota GET /api/consulta-nacional?num=... (consulta por número)
- [x] Rota POST /api/whatsapp/validar (validação de WhatsApp)
- [x] Rota POST /api/ia/processo (resumo IA do processo)
- [x] Rota POST /api/ia/advogado (dossiê IA do advogado)
- [x] Rota POST /api/ia/whatsapp (mensagem WA com IA)
- [x] Rota GET /api/foto-adv?uf=&num= (foto do advogado)
- [x] Gerenciamento de token JWT com renovação automática
- [x] Timer de sessão (30 minutos)

## Frontend - Página de Login
- [ ] Layout dark mode com logo
- [ ] Campo usuário
- [ ] Campo senha
- [ ] CAPTCHA visual
- [ ] Botão AUTENTICAR
- [ ] Validação e redirecionamento

## Frontend - Painel Principal
- [x] Header com logo "Painel Jurídico" + badge PRO
- [x] Timer de sessão regressivo
- [x] Botão SAIR
- [x] Dropdown tipo de busca (Nº Proc. / CPF/CNPJ / OAB)
- [x] Campo de busca com placeholder "Digite o alvo..."
- [x] Botão buscar com ícone
- [x] Tela inicial com ícone escudo + "Conexão Segura Estabelecida"
- [x] Mensagem "Consultando Bases Nacionais Seguras..." durante busca

## Frontend - Lista de Resultados
- [x] Contador "X Processos Exibidos"
- [x] Cards de processo com: tribunal, data, tipo ação, número, assunto, valor
- [x] Filtros: Todos / Ativos / Arquivados
- [x] Filtros tipo ação: CPF x CPF / CPF x CNPJ / CNPJ x CNPJ / CNPJ x CPF
- [x] Filtro por tribunal (dropdown dinâmico)
- [x] Botão Maior Valor (ordenação)
- [x] Botão Copiar Relatório
- [x] Botão Exportar TXT
- [x] Botão Enviar WhatsApp
- [x] Botão IA DOSSIÊ

## Frontend - Detalhe do Processo
- [x] Badge ATIVO/ARQUIVADO
- [x] Número do processo formatado
- [x] Tribunal + Classe processual
- [x] Assunto principal
- [x] Botão fechar
- [x] Botão Copiar Detalhes
- [x] Botão Baixar TXT
- [x] Botão Enviar WA
- [x] Botão WA Mensagem Causa Ganha
- [x] Botão WA Gerar com IA
- [x] Botão Resumo IA
- [x] Seção Ofício Gerado + Botão BAIXAR OFÍCIO FORMATADO
- [x] Informações Gerais (Valor, Distribuição, Situação, Fase, Órgão Julgador)
- [x] Polo Ativo com dados OSINT (Score, Renda, Idade, Poder Aquisitivo)
- [x] Telefones com botão Validar Zaps
- [x] Advogados representantes
- [x] Polo Passivo (mesma estrutura)
- [x] Timeline de movimentações
- [x] Lista de Docs. Oficiais com download

## Design
- [x] Tema dark mode (#050507 fundo, #18181b painel)
- [x] Cor accent indigo (#6366f1)
- [x] Fontes Inter + JetBrains Mono
- [x] Efeito glass no header
- [x] Cards com hover
- [x] Toast notifications
- [x] Animação ia-glow no botão IA
- [x] Responsivo
- [ ] Scrollbar customizada

## Segurança
- [x] Timer de sessão visual (apenas informativo)
- [x] Sistema de token JWT com renovação automática
- [x] Auto-login via worker Python com cairosvg + IA de visão

## Pendente
- [x] Sistema de renovação automática de token com IA (sem precisar logar manualmente)
- [x] Auto-login com resolução de CAPTCHA via IA de visão
- [x] Frontend sem tela de login (renovação transparente)
- [x] Retry automático até 3 tentativas se CAPTCHA errado

## Integração TJSP Direta (Fase 2)
- [x] Scraping via Puppeteer com perfil autenticado do Chromium
- [x] Busca por OAB diretamente no TJSP
- [x] Detalhe completo de cada processo (partes, movimentações, documentos)
- [x] Integração direta sem dependência de painel intermediário
- [x] Rota /api/processo/detalhe para detalhe lazy por URL
- [x] Rota /api/ia/dossie, /api/ia/resumo, /api/ia/whatsapp, /api/oficio
- [x] Frontend refatorado para formato de dados TJSP
- [x] Modal de detalhe com carregamento lazy
- [x] Indicador "TJSP CONECTADO" no header
- [x] Sem tela de login/renovação de token

## Migração para HTTP Direto (Fase 3 - Fix Produção)
- [x] Substituir Puppeteer por scraping HTTP direto com cheerio
- [x] Serviço tjsp-http.service.ts com parser de lista e detalhe
- [x] Parser preciso de classe, assunto, vara, foro, data da lista
- [x] Parser preciso de partes, movimentações, documentos do detalhe
- [x] Endpoint POST /api/tjsp/cookies para configurar sessão manualmente
- [x] Endpoint POST /api/tjsp/auto-login (sem Puppeteer)
- [x] Endpoint GET /api/tjsp/status com tempo restante
- [x] Modal de configuração de cookies no frontend
- [x] Indicador de status TJSP com tempo restante no header
- [x] Endpoint /api/processo/detalhe aceita codigo+foro ou url
- [x] Frontend atualizado para usar campos tipo/cpfCnpj/titulo dos novos tipos
- [x] 30 testes vitest passando
- [x] Correção do erro removeChild causado pelo Google Translate (translate=no no HTML/App)
