#!/usr/bin/env python3
"""
Script para extrair automaticamente os cookies de sessão do TJSP
do banco de dados do Chromium e configurar o serviço.
"""
import sqlite3, shutil, tempfile, os, json, sys, hashlib
from Crypto.Cipher import AES

def decrypt_cookie(encrypted_value: bytes) -> str:
    """Descriptografa cookie do Chromium no Linux usando senha 'peanuts'."""
    try:
        if not encrypted_value or len(encrypted_value) < 3:
            return ""
        
        prefix = encrypted_value[:3]
        if prefix in (b'v10', b'v11'):
            # Chromium Linux usa PBKDF2 com senha 'peanuts'
            password = b'peanuts'
            salt = b'saltysalt'
            iterations = 1
            key = hashlib.pbkdf2_hmac('sha1', password, salt, iterations, dklen=16)
            iv = b' ' * 16
            cipher = AES.new(key, AES.MODE_CBC, IV=iv)
            decrypted = cipher.decrypt(encrypted_value[3:])
            # Remover padding PKCS7
            pad_len = decrypted[-1]
            if pad_len <= 16:
                decrypted = decrypted[:-pad_len]
            return decrypted.decode('utf-8', errors='ignore')
        else:
            return encrypted_value.decode('utf-8', errors='ignore')
    except Exception as e:
        return ""

def get_tjsp_cookies() -> str:
    """Extrai e retorna os cookies do TJSP como string para uso em headers."""
    cookie_db = os.path.expanduser('~/.browser_data_dir/Default/Cookies')
    
    if not os.path.exists(cookie_db):
        print("ERRO: Banco de cookies não encontrado", file=sys.stderr)
        return ""
    
    tmp = tempfile.mktemp(suffix='.db')
    shutil.copy2(cookie_db, tmp)
    
    try:
        conn = sqlite3.connect(tmp)
        cursor = conn.cursor()
        
        # Buscar cookies mais recentes do TJSP
        cursor.execute('''
            SELECT host_key, name, value, encrypted_value
            FROM cookies 
            WHERE host_key LIKE "%tjsp%"
            ORDER BY last_access_utc DESC
        ''')
        
        rows = cursor.fetchall()
        conn.close()
        
        cookies = {}
        for host, name, value, enc_value in rows:
            if name in cookies:
                continue  # Pegar apenas o mais recente de cada nome
            
            if enc_value and len(enc_value) > 3:
                decrypted = decrypt_cookie(enc_value)
                if decrypted:
                    cookies[name] = decrypted
            elif value:
                cookies[name] = value
        
        # Montar string de cookies
        cookie_str = "; ".join(f"{k}={v}" for k, v in cookies.items() if v)
        return cookie_str
        
    finally:
        os.unlink(tmp)

def configure_service(api_base: str, cookies: str) -> bool:
    """Configura o serviço TJSP com os cookies capturados."""
    import urllib.request
    import urllib.error
    
    try:
        data = json.dumps({"cookies": cookies}).encode('utf-8')
        req = urllib.request.Request(
            f"{api_base}/api/juridico/tjsp/session",
            data=data,
            headers={"Content-Type": "application/json"},
            method="POST"
        )
        with urllib.request.urlopen(req, timeout=10) as resp:
            result = json.loads(resp.read())
            print(f"Serviço configurado: {result}")
            return True
    except Exception as e:
        print(f"Erro ao configurar serviço: {e}", file=sys.stderr)
        return False

if __name__ == "__main__":
    cookies = get_tjsp_cookies()
    
    if not cookies:
        print("ERRO: Não foi possível extrair cookies do TJSP", file=sys.stderr)
        sys.exit(1)
    
    # Modo --print-only: apenas imprimir os cookies
    if "--print-only" in sys.argv:
        print(f"COOKIES: {cookies}")
        sys.exit(0)
    
    print(f"Cookies extraídos ({len(cookies)} chars)")
    
    # Se passado como argumento, configurar o serviço
    api_base = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:3000"
    
    if configure_service(api_base, cookies):
        print("OK: Serviço TJSP configurado com sucesso")
    else:
        # Imprimir cookies para uso manual
        print(f"COOKIES: {cookies}")
        sys.exit(1)
