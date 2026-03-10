const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');
const os = require('os');

const CHROMIUM_PATH = '/usr/bin/chromium-browser';
const USER_DATA_DIR_ORIGINAL = '/home/ubuntu/.browser_data_dir';

async function main() {
  const tmpDir = path.join(os.tmpdir(), 'tjsp_inspect_' + Date.now());
  fs.mkdirSync(tmpDir, { recursive: true });
  ['Default/Cookies', 'Default/Local State'].forEach(arq => {
    const src = path.join(USER_DATA_DIR_ORIGINAL, arq);
    const dst = path.join(tmpDir, arq);
    try { fs.mkdirSync(path.dirname(dst), { recursive: true }); fs.copyFileSync(src, dst); } catch(e){}
  });

  const browser = await puppeteer.launch({
    executablePath: CHROMIUM_PATH,
    userDataDir: tmpDir,
    headless: true,
    args: ['--no-sandbox','--disable-setuid-sandbox','--disable-dev-shm-usage','--disable-gpu','--single-process'],
  });

  const page = await browser.newPage();
  await page.setRequestInterception(true);
  page.on('request', req => ['image','font','media'].includes(req.resourceType()) ? req.abort() : req.continue());
  
  await page.goto('https://esaj.tjsp.jus.br/cpopg/search.do?conversationId=&cbPesquisa=NUMOAB&dadosConsulta.valorConsulta=200287&cdForo=-1', { waitUntil: 'networkidle2', timeout: 60000 });
  
  const dados = await page.evaluate(() => {
    // Inspecionar headers da tabela
    const headers = Array.from(document.querySelectorAll('th')).map(th => th.textContent.trim()).filter(Boolean);
    
    // Pegar primeira linha de dados
    const primeiraLinha = document.querySelector('tr.fundocinza1, tr.fundocinza2, tr.fundo, tbody tr');
    const tds = primeiraLinha ? Array.from(primeiraLinha.querySelectorAll('td')).map((td, i) => ({
      index: i,
      texto: td.textContent.trim().substring(0, 150).replace(/\s+/g, ' '),
      classes: td.className
    })) : [];
    
    // Pegar o link do primeiro processo
    const primeiroLink = document.querySelector('a[href*="show.do"]');
    const linkHref = primeiroLink ? primeiroLink.href : '';
    const linkTexto = primeiroLink ? primeiroLink.textContent.trim() : '';
    
    // Pegar HTML da linha do primeiro processo (sem o link interno)
    const linhaHtml = primeiraLinha ? primeiraLinha.outerHTML.substring(0, 2000) : '';
    
    // Verificar classes das linhas
    const linhasClasses = Array.from(document.querySelectorAll('tr')).slice(0,5).map(tr => tr.className);
    
    return { headers, tds, linkHref, linkTexto, linhaHtml, linhasClasses };
  });
  
  process.stdout.write(JSON.stringify(dados, null, 2) + '\n');
  await browser.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
}

main().catch(e => { process.stderr.write('ERRO: ' + e.message + '\n'); process.exit(1); });
