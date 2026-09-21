// Verificação do Cloudflare Turnstile (captcha gratuito e ilimitado,
// nativo da Cloudflare) para proteger o formulário público contra spam
// sem depender de nenhum serviço pago.

export async function verificarTurnstile(secretKey: string, token: string, ip?: string): Promise<boolean> {
  if (!token) return false;
  const body = new URLSearchParams({ secret: secretKey, response: token });
  if (ip) body.set("remoteip", ip);

  const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const data = (await res.json()) as { success?: boolean };
  return !!data.success;
}
