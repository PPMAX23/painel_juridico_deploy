/**
 * tjsp-puppeteer.cjs
 * Scraping completo do TJSP usando Puppeteer com perfil do Chromium já autenticado.
 * Suporta: busca por OAB, CPF/CNPJ, número de processo, e detalhe completo.
 *
 * Uso: node tjsp-puppeteer.cjs <tipo> <valor>
 *   tipos: oab | cpf | cnpj | processo | detalhe
 */

const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');
const os = require('os');

const CHROMIUM_PATH = '/usr/bin/chromium-browser';
const USER_DATA_DIR_ORIGINAL = '/home/ubuntu/.browser_data_dir';
const TJSP_BASE = 'https://esaj.tjsp.jus.br';

function criarPerfilTemp() {
  const tmpDir = path.join(os.tmpdir(), `tjsp_profile_${Date.now()}_${Math.random().toString(36).slice(2)}`);
  fs.mkdirSync(tmpDir, { recursive: true });
  const arquivos = ['Default/Cookies', 'Default/Local State', 'Default/Preferences'];
  for (const arq of arquivos) {
    const src = path.join(USER_DATA_DIR_ORIGINAL, arq);
    const dst = path.join(tmpDir, arq);
    try {
      fs.mkdirSync(path.dirname(dst), { recursive: true });
      fs.copyFileSync(src, dst);
    } catch (e) {}
  }
  return tmpDir;
}

async function iniciarBrowser() {
  const tmpProfile = criarPerfilTemp();
  const browser = await puppeteer.launch({
    executablePath: CHROMIUM_PATH,
    userDataDir: tmpProfile,
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--single-process',
      '--disable-extensions',
    ],
  });
  return { browser, tmpProfile };
}

async function configurarPagina(page) {
  await page.setDefaultNavigationTimeout(60000);
  await page.setDefaultTimeout(30000);
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    if (['image', 'font', 'media'].includes(req.resourceType())) {
      req.abort();
    } else {
      req.continue();
    }
  });
}

async function verificarSessao(page) {
  const url = page.url();
  const titulo = await page.title();
  if (titulo.toLowerCase().includes('login') || url.includes('/sajcas/login')) {
    throw new Error('SESSAO_EXPIRADA');
  }
}

// Extrair lista de processos da página de resultados do TJSP
async function extrairListaProcessos(page) {
  return await page.evaluate((tjspBase) => {
    const processos = [];
    const numerosVistos = new Set();

    // Extrair todos os links de processos (padrão CNJ)
    const links = document.querySelectorAll('a[href*="show.do"]');

    links.forEach(link => {
      const texto = link.textContent.trim();
      // Validar formato CNJ: 0000000-00.0000.0.00.0000
      if (!/\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}/.test(texto)) return;
      if (numerosVistos.has(texto)) return;
      numerosVistos.add(texto);

      const href = link.href || '';

      // Extrair parâmetros da URL
      const codigoMatch = href.match(/processo\.codigo=([^&]+)/);
      const foroMatch = href.match(/processo\.foro=([^&]+)/);

      // Tentar extrair dados do contexto ao redor do link
      // O TJSP usa uma estrutura de tabela com spans
      const container = link.closest('tr') || link.closest('li') || link.closest('div.linha');
      
      let classe = '', assunto = '', vara = '', foro = '', data = '', valor = '';

      if (container) {
        // Tentar pegar spans com classes específicas
        const spans = container.querySelectorAll('span, td');
        spans.forEach(span => {
          const cls = (span.className || '').toLowerCase();
          const txt = span.textContent.trim().replace(/\s+/g, ' ');
          if (!txt || txt === texto) return;
          
          if (cls.includes('classe')) classe = txt;
          else if (cls.includes('assunto')) assunto = txt;
          else if (cls.includes('vara') || cls.includes('orgao')) vara = txt;
          else if (cls.includes('foro')) foro = txt;
          else if (cls.includes('data')) data = txt;
          else if (cls.includes('valor')) valor = txt;
        });
      }

      processos.push({
        numeroProcesso: texto,
        classe,
        assunto,
        vara,
        foro,
        data,
        valor,
        codigoProcesso: codigoMatch ? decodeURIComponent(codigoMatch[1]) : '',
        foroProcesso: foroMatch ? decodeURIComponent(foroMatch[1]) : '',
        urlDetalhe: href,
        tribunal: 'TJSP',
        fonte: 'TJSP',
      });
    });

    // Tentar extrair o total de resultados
    const totalEl = document.querySelector('.unj-tag-total, #totalResultados, .resultados-count');
    const totalText = totalEl ? totalEl.textContent.trim() : '';
    const total = parseInt(totalText.replace(/\D/g, '')) || processos.length;

    return { total, processos, pagina: 1 };
  }, TJSP_BASE);
}

// Extrair detalhe completo de um processo
async function extrairDetalheProcesso(page) {
  return await page.evaluate(() => {
    const getTexto = (...sels) => {
      for (const sel of sels) {
        const el = document.querySelector(sel);
        if (el && el.textContent.trim()) return el.textContent.trim().replace(/\s+/g, ' ');
      }
      return '';
    };

    // Dados básicos do processo
    const numeroProcesso = getTexto(
      '#numeroProcesso .unj-value',
      '#numeroProcesso',
      'span[id*="numeroProcesso"]',
      '.unj-value[id*="numero"]'
    );

    const classe = getTexto(
      '#classeProcesso .unj-value',
      '#classeProcesso span',
      'span[id*="classe"]'
    );

    const assunto = getTexto(
      '#assuntoProcesso .unj-value',
      '#assuntoProcesso span',
      'span[id*="assunto"]'
    );

    const vara = getTexto(
      '#varaProcesso .unj-value',
      '#varaProcesso span',
      '#orgaoJulgadorProcesso .unj-value',
      'span[id*="vara"]',
      'span[id*="orgaoJulgador"]'
    );

    const juiz = getTexto(
      '#juizProcesso .unj-value',
      '#juizProcesso span',
      'span[id*="juiz"]'
    );

    const valor = getTexto(
      '#valorAcaoProcesso .unj-value',
      '#valorAcaoProcesso span',
      'span[id*="valorAcao"]'
    );

    const dataDistribuicao = getTexto(
      '#dataHoraDistribuicaoProcesso .unj-value',
      '#dataHoraDistribuicaoProcesso span',
      'span[id*="dataHoraDistribuicao"]',
      'span[id*="dataDistribuicao"]'
    );

    const situacao = getTexto(
      '#situacaoProcesso .unj-value',
      '#situacaoProcesso span',
      'span[id*="situacao"]'
    );

    const foro = getTexto(
      '#foroProcesso .unj-value',
      '#foroProcesso span',
      'span[id*="foro"]'
    );

    // ── Partes do processo ──
    const partes = [];
    
    // Estrutura principal de partes no TJSP
    const partesTable = document.querySelector('#tableTodasPartes, .partesEAdvogados, table[id*="partes"]');
    if (partesTable) {
      const linhas = partesTable.querySelectorAll('tr');
      linhas.forEach(tr => {
        const tds = tr.querySelectorAll('td');
        if (tds.length >= 2) {
          const polo = tds[0] ? tds[0].textContent.trim().replace(/\s+/g, ' ') : '';
          const nomeAdv = tds[1] ? tds[1].textContent.trim().replace(/\s+/g, ' ') : '';
          if (polo || nomeAdv) {
            // Separar nome da parte e advogado
            const partes_adv = nomeAdv.split(/Advogado:|Advogada:|Advogados:/i);
            partes.push({
              polo: polo,
              nome: partes_adv[0] ? partes_adv[0].trim() : nomeAdv,
              advogado: partes_adv[1] ? partes_adv[1].trim() : '',
              documento: '',
            });
          }
        }
      });
    }

    // Fallback: extrair partes de forma alternativa
    if (partes.length === 0) {
      document.querySelectorAll('.nomeParteEAdvogado, .unj-parte').forEach(el => {
        const texto = el.textContent.trim().replace(/\s+/g, ' ');
        if (texto) {
          partes.push({ polo: '', nome: texto, advogado: '', documento: '' });
        }
      });
    }

    // ── Movimentações ──
    const movimentacoes = [];
    const movRows = document.querySelectorAll(
      '#tabelaTodasMovimentacoes tr, .movimentacaoProcesso tr, table[id*="movimentacao"] tr'
    );
    movRows.forEach(tr => {
      const tds = tr.querySelectorAll('td');
      if (tds.length >= 2) {
        const data = tds[0] ? tds[0].textContent.trim() : '';
        const descricao = tds[1] ? tds[1].textContent.trim().replace(/\s+/g, ' ') : '';
        if (data && descricao && /\d{2}\/\d{2}\/\d{4}/.test(data)) {
          movimentacoes.push({ data, descricao });
        }
      }
    });

    // ── Documentos ──
    const documentos = [];
    document.querySelectorAll('a[href*="getArquivo"], a[href*="download"], a[href*="documento"], a[href*="abrirDocumento"]').forEach(link => {
      const nome = link.textContent.trim().replace(/\s+/g, ' ');
      if (nome && nome.length > 2 && !nome.includes('javascript')) {
        documentos.push({ nome, url: link.href });
      }
    });

    // ── Incidentes / Recursos ──
    const incidentes = [];
    document.querySelectorAll('a[href*="cposg"], a[href*="incidente"], .unj-incidente').forEach(el => {
      const texto = el.textContent.trim().replace(/\s+/g, ' ');
      if (texto && texto.length > 3) {
        incidentes.push({ descricao: texto, url: el.href || '' });
      }
    });

    return {
      numeroProcesso,
      classe,
      assunto,
      vara,
      juiz,
      valor,
      dataDistribuicao,
      situacao,
      foro,
      partes,
      movimentacoes,
      documentos,
      incidentes,
      tribunal: 'TJSP',
      fonte: 'TJSP',
    };
  });
}

// ─── Função principal ─────────────────────────────────────────────────────────
async function buscarTJSP(tipo, valor) {
  const { browser, tmpProfile } = await iniciarBrowser();

  try {
    const page = await browser.newPage();
    await configurarPagina(page);

    let url;
    const valorLimpo = valor.trim();

    if (tipo === 'oab') {
      const oabNumero = valorLimpo.replace(/^SP\s*/i, '').replace(/\./g, '').trim();
      url = `${TJSP_BASE}/cpopg/search.do?conversationId=&cbPesquisa=NUMOAB&dadosConsulta.valorConsulta=${encodeURIComponent(oabNumero)}&cdForo=-1`;
    } else if (tipo === 'processo') {
      url = `${TJSP_BASE}/cpopg/show.do?processo.codigo=&processo.foro=&processo.numero=${encodeURIComponent(valorLimpo)}&conversationId=`;
    } else if (tipo === 'cpf' || tipo === 'cnpj' || tipo === 'documento') {
      const docLimpo = valorLimpo.replace(/\D/g, '');
      url = `${TJSP_BASE}/cpopg/search.do?conversationId=&cbPesquisa=DOCPARTE&dadosConsulta.valorConsulta=${encodeURIComponent(docLimpo)}&cdForo=-1`;
    } else if (tipo === 'detalhe') {
      url = valorLimpo.startsWith('http') ? valorLimpo : `${TJSP_BASE}${valorLimpo}`;
    } else {
      throw new Error(`Tipo inválido: ${tipo}`);
    }

    await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
    await verificarSessao(page);

    let resultado;

    if (tipo === 'detalhe' || tipo === 'processo') {
      resultado = await extrairDetalheProcesso(page);
    } else {
      resultado = await extrairListaProcessos(page);
    }

    return resultado;

  } finally {
    await browser.close();
    try { fs.rmSync(tmpProfile, { recursive: true, force: true }); } catch (e) {}
  }
}

// ─── Entrada ──────────────────────────────────────────────────────────────────
const tipo = process.argv[2];
const valor = process.argv[3];

if (!tipo || !valor) {
  process.stderr.write(JSON.stringify({ error: 'Uso: node tjsp-puppeteer.cjs <tipo> <valor>' }) + '\n');
  process.exit(1);
}

buscarTJSP(tipo, valor)
  .then(resultado => {
    process.stdout.write(JSON.stringify(resultado) + '\n');
    process.exit(0);
  })
  .catch(err => {
    process.stderr.write(JSON.stringify({ error: err.message }) + '\n');
    process.exit(1);
  });
