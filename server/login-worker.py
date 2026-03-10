#!/usr/bin/env python3
"""
Worker de Login Automático
Resolve o CAPTCHA do painel de origem via IA de visão e faz login.
Retorna o token JWT via stdout.

Uso: python3 login-worker.py <forge_api_url> <forge_api_key>
"""
import sys
import re
import os
import json
import base64
import io
import urllib.request
import http.cookiejar
import urllib.parse
import urllib.error

try:
    import cairosvg
    from PIL import Image, ImageOps, ImageEnhance
    CAIROSVG_AVAILABLE = True
except ImportError:
    CAIROSVG_AVAILABLE = False

API_BASE = "http://191.101.131.161"
USERNAME = "ADV_552"
PASSWORD = "102030"

FORGE_API_URL = sys.argv[1] if len(sys.argv) > 1 else "https://forge.manus.ai"
FORGE_API_KEY = sys.argv[2] if len(sys.argv) > 2 else os.environ.get("BUILT_IN_FORGE_API_KEY", "")


def limpar_svg(svg_content: str) -> str:
    """Remove linhas de interferência e elementos de fundo."""
    # Remover linhas de interferência (<line> tags)
    clean = re.sub(r'<line[^/]*/>', '', svg_content)
    # Remover retângulos de fundo
    clean = re.sub(r'<rect[^/]*/>', '', clean)
    # Remover paths com fill=none
    clean = re.sub(r'<path fill="none"[^/]*/>', '', clean)
    clean = re.sub(r"<path fill='none'[^/]*/>", '', clean)
    return clean


def svg_para_png_base64(svg_content: str) -> str:
    """Converte SVG para PNG base64 com processamento para melhorar leitura."""
    if not CAIROSVG_AVAILABLE:
        return None
    
    # Renderizar SVG com fundo branco em alta resolução
    png_bytes = cairosvg.svg2png(bytestring=svg_content.encode(), background_color='white', scale=4)
    
    # Processar com PIL: inverter cores + aumentar contraste + binarizar
    img = Image.open(io.BytesIO(png_bytes)).convert('RGB')
    img = ImageOps.invert(img)  # Inverter: texto claro em fundo escuro -> texto escuro em fundo claro
    img = ImageEnhance.Contrast(img).enhance(3.0)  # Aumentar contraste
    img = img.convert('L').point(lambda x: 0 if x < 128 else 255, '1').convert('RGB')  # Binarizar
    
    buf = io.BytesIO()
    img.save(buf, format='PNG')
    return base64.b64encode(buf.getvalue()).decode()


def resolver_captcha_ia(png_base64: str) -> str:
    """Usa IA de visão para ler o CAPTCHA."""
    payload = json.dumps({
        "model": "claude-3-5-sonnet-20241022",
        "max_tokens": 20,
        "messages": [{
            "role": "user",
            "content": [
                {
                    "type": "image_url",
                    "image_url": {
                        "url": f"data:image/png;base64,{png_base64}",
                        "detail": "high"
                    }
                },
                {
                    "type": "text",
                    "text": "This is a CAPTCHA image with black text on white background. Read ONLY the alphanumeric characters (letters and digits) shown. Ignore any lines or decorations. Reply with ONLY those characters exactly as shown (case-sensitive), nothing else, no spaces, no punctuation."
                }
            ]
        }]
    }).encode()

    req = urllib.request.Request(
        f"{FORGE_API_URL}/v1/chat/completions",
        data=payload,
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {FORGE_API_KEY}"
        }
    )
    
    resp = urllib.request.urlopen(req, timeout=15)
    data = json.loads(resp.read())
    text = data["choices"][0]["message"]["content"]
    # Extrair apenas caracteres alfanuméricos
    return re.sub(r'[^a-zA-Z0-9]', '', text)[:10]


def fazer_login(captcha_code: str, session_cookie: str) -> str | None:
    """Faz login e retorna o token JWT."""
    payload = json.dumps({
        "username": USERNAME,
        "password": PASSWORD,
        "captcha": captcha_code
    }).encode()

    req = urllib.request.Request(
        f"{API_BASE}/auth/login",
        data=payload,
        headers={
            "Content-Type": "application/json",
            "Cookie": session_cookie,
            "Accept": "application/json"
        }
    )
    
    try:
        resp = urllib.request.urlopen(req, timeout=15)
        data = json.loads(resp.read())
        return data.get("token")
    except urllib.error.HTTPError as e:
        body = e.read().decode()
        print(f"[Worker] HTTP {e.code}: {body[:200]}", file=sys.stderr)
        return None


def obter_captcha_com_cookie() -> tuple[str, str]:
    """Obtém o SVG do captcha e o cookie de sessão."""
    # Criar um cookie jar para manter o session cookie
    cookie_jar = http.cookiejar.CookieJar()
    opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cookie_jar))
    
    # Primeiro acessar a página de login para obter o session cookie
    opener.open(f"{API_BASE}/login", timeout=10)
    
    # Agora obter o captcha (com o session cookie)
    resp = opener.open(f"{API_BASE}/auth/captcha", timeout=10)
    svg_content = resp.read().decode()
    
    # Extrair o cookie de sessão
    session_cookie = "; ".join([f"{c.name}={c.value}" for c in cookie_jar])
    
    return svg_content, session_cookie


def main():
    print("[Worker] Iniciando login automático...", file=sys.stderr)
    
    if not CAIROSVG_AVAILABLE:
        print("[Worker] ERRO: cairosvg não disponível", file=sys.stderr)
        sys.exit(1)
    
    try:
        # 1. Obter captcha e session cookie
        print("[Worker] Obtendo captcha...", file=sys.stderr)
        svg_content, session_cookie = obter_captcha_com_cookie()
        print(f"[Worker] SVG obtido ({len(svg_content)} bytes), cookie: {session_cookie[:50]}...", file=sys.stderr)
        
        # 2. Limpar SVG e converter para PNG
        clean_svg = limpar_svg(svg_content)
        png_base64 = svg_para_png_base64(clean_svg)
        
        if not png_base64:
            print("[Worker] ERRO: Falha ao converter SVG para PNG", file=sys.stderr)
            sys.exit(1)
        
        # 3. Resolver CAPTCHA com IA
        captcha_code = resolver_captcha_ia(png_base64)
        print(f"[Worker] CAPTCHA resolvido: '{captcha_code}'", file=sys.stderr)
        
        if not captcha_code or len(captcha_code) < 3:
            print("[Worker] ERRO: CAPTCHA não resolvido", file=sys.stderr)
            sys.exit(1)
        
        # 4. Fazer login
        print("[Worker] Fazendo login...", file=sys.stderr)
        token = fazer_login(captcha_code, session_cookie)
        
        if token and token.startswith("eyJ"):
            print(f"[Worker] Login bem-sucedido!", file=sys.stderr)
            # Retornar apenas o token via stdout
            sys.stdout.write(token)
            sys.stdout.flush()
            sys.exit(0)
        else:
            print(f"[Worker] Login falhou - token não recebido: {token}", file=sys.stderr)
            sys.exit(1)
            
    except Exception as e:
        print(f"[Worker] Erro: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
