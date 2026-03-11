// ─── Serviço Z-API — Envio de mensagens WhatsApp ─────────────────────────────

// URL e token construídos dinamicamente para garantir que as env vars estejam carregadas
function getZapiBase(): string {
  return `https://api.z-api.io/instances/${process.env.ZAPI_INSTANCE_ID}/token/${process.env.ZAPI_TOKEN}`;
}

// Cabeçalhos padrão para todas as requisições Z-API
function headers() {
  return {
    "Content-Type": "application/json",
    "Client-Token": process.env.ZAPI_CLIENT_TOKEN || "",
  };
}

// Normaliza o número de telefone para o formato E.164 sem o +
// Ex: "11999998888" → "5511999998888"
export function normalizarTelefone(numero: string): string {
  const digits = numero.replace(/\D/g, "");
  if (digits.startsWith("55") && digits.length >= 12) return digits;
  return `55${digits}`;
}

// Envia mensagem de texto simples
export async function enviarTexto(telefone: string, mensagem: string): Promise<boolean> {
  try {
    const phone = normalizarTelefone(telefone);
    const res = await fetch(`${getZapiBase()}/send-text`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ phone, message: mensagem }),
    });
    const data = await res.json() as { zaapId?: string; messageId?: string; error?: string };
    if (data.error) {
      console.error("[ZAPI] Erro ao enviar mensagem:", data.error);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[ZAPI] Falha na requisição:", err);
    return false;
  }
}

// Envia mensagem de texto para um grupo
export async function enviarTextoGrupo(grupoId: string, mensagem: string): Promise<boolean> {
  try {
    const res = await fetch(`${getZapiBase()}/send-text`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ phone: grupoId, message: mensagem }),
    });
    const data = await res.json() as { zaapId?: string; messageId?: string; error?: string };
    if (data.error) {
      console.error("[ZAPI] Erro ao enviar mensagem no grupo:", data.error);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[ZAPI] Falha na requisição de grupo:", err);
    return false;
  }
}

// Verifica se o número tem WhatsApp
export async function verificarWhatsApp(telefone: string): Promise<boolean> {
  try {
    const phone = normalizarTelefone(telefone);
    const res = await fetch(`${getZapiBase()}/phone-exists/${phone}`, {
      headers: headers(),
    });
    const data = await res.json() as { exists?: boolean };
    return data.exists === true;
  } catch {
    return false;
  }
}

// Verifica status da conexão
export async function verificarConexao(): Promise<{ conectado: boolean; smartphoneConectado: boolean }> {
  try {
    const res = await fetch(`${getZapiBase()}/status`, { headers: headers() });
    const data = await res.json() as { connected?: boolean; smartphoneConnected?: boolean };
    return {
      conectado: data.connected === true,
      smartphoneConectado: data.smartphoneConnected === true,
    };
  } catch {
    return { conectado: false, smartphoneConectado: false };
  }
}
