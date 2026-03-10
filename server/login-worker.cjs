/**
 * Worker de Login Automático
 * Roda como processo filho independente para fazer login no painel de origem.
 * Resolve o CAPTCHA via IA de visão e retorna o token JWT via stdout.
 * 
 * Uso: node login-worker.cjs <forgeApiUrl> <forgeApiKey>
 */
'use strict';

const puppeteer = require('puppeteer-core');

const API_BASE = 'http://191.101.131.161';
const USERNAME = 'ADV_552';
const PASSWORD = '102030';

const FORGE_API_URL = process.argv[2] || 'https://forge.manus.ai';
const FORGE_API_KEY = process.argv[3] || process.env.BUILT_IN_FORGE_API_KEY || '';

async function resolverCaptcha(captchaBase64Png) {
  const payload = {
    model: 'claude-3-5-sonnet-20241022',
    max_tokens: 20,
    messages: [{
      role: 'user',
      content: [
        {
          type: 'image_url',
          image_url: {
            url: `data:image/png;base64,${captchaBase64Png}`,
            detail: 'high'
          }
        },
        {
          type: 'text',
          text: 'This is a CAPTCHA image with 5 characters. Read ONLY the exact characters shown. Reply with ONLY those 5 characters, no spaces, no explanation, no punctuation.'
        }
      ]
    }]
  };

  const resp = await fetch(`${FORGE_API_URL}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${FORGE_API_KEY}`
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(15000)
  });

  if (!resp.ok) throw new Error(`LLM error: ${resp.status}`);
  const data = await resp.json();
  const text = data.choices?.[0]?.message?.content || '';
  // Extrair apenas caracteres alfanuméricos
  return text.replace(/[^a-zA-Z0-9]/g, '').substring(0, 10);
}

async function main() {
  let browser = null;
  
  try {
    browser = await puppeteer.launch({
      executablePath: '/usr/bin/chromium-browser',
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--disable-extensions',
        '--disable-background-networking'
      ]
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 720 });
    
    // Navegar para a página de login
    await page.goto(`${API_BASE}/login`, {
      waitUntil: 'networkidle2',
      timeout: 20000
    });

    // Capturar screenshot do CAPTCHA em página separada
    const captchaPage = await browser.newPage();
    await captchaPage.setViewport({ width: 300, height: 100 });
    await captchaPage.goto(`${API_BASE}/auth/captcha`, {
      waitUntil: 'networkidle2',
      timeout: 10000
    });
    const captchaScreenshot = await captchaPage.screenshot({
      encoding: 'base64',
      type: 'png'
    });
    await captchaPage.close();

    // Resolver CAPTCHA com IA
    const captchaCode = await resolverCaptcha(captchaScreenshot);
    process.stderr.write(`[Worker] CAPTCHA resolvido: ${captchaCode}\n`);

    if (!captchaCode || captchaCode.length < 3) {
      throw new Error('CAPTCHA não resolvido corretamente');
    }

    // Interceptar a resposta do login para capturar o token
    let tokenCapturado = null;
    
    page.on('response', async (response) => {
      if (response.url().includes('/auth/login') && response.status() === 200) {
        try {
          const data = await response.json();
          if (data.token) {
            tokenCapturado = data.token;
          }
        } catch {}
      }
    });

    // Preencher o formulário
    await page.type('#user', USERNAME, { delay: 30 });
    await page.type('#pass', PASSWORD, { delay: 30 });
    await page.type('#captchaInput', captchaCode, { delay: 30 });

    // Submeter o formulário
    await Promise.all([
      page.keyboard.press('Enter'),
      new Promise(r => setTimeout(r, 8000)) // aguardar resposta
    ]);

    // Verificar se o token foi capturado via interceptação
    if (tokenCapturado) {
      process.stdout.write(tokenCapturado);
      await browser.close();
      process.exit(0);
      return;
    }

    // Tentar extrair o token dos cookies
    const cookies = await page.cookies();
    const tokenCookie = cookies.find(c => c.name === 'token');
    
    if (tokenCookie?.value && tokenCookie.value.startsWith('eyJ')) {
      process.stdout.write(tokenCookie.value);
      await browser.close();
      process.exit(0);
      return;
    }

    // Verificar se houve redirecionamento (login bem-sucedido)
    const currentUrl = page.url();
    process.stderr.write(`[Worker] URL atual após login: ${currentUrl}\n`);
    
    if (!currentUrl.includes('/login')) {
      // Tentar pegar o token via localStorage ou sessionStorage
      const tokenFromStorage = await page.evaluate(() => {
        return localStorage.getItem('token') || 
               sessionStorage.getItem('token') ||
               document.cookie.split(';').find(c => c.trim().startsWith('token='))?.split('=')[1];
      });
      
      if (tokenFromStorage && tokenFromStorage.startsWith('eyJ')) {
        process.stdout.write(tokenFromStorage);
        await browser.close();
        process.exit(0);
        return;
      }
    }

    throw new Error('Token não encontrado após login');

  } catch (err) {
    process.stderr.write(`[Worker] Erro: ${err.message}\n`);
    if (browser) {
      try { await browser.close(); } catch {}
    }
    process.exit(1);
  }
}

main();
