type FetchLike = typeof fetch;

export type VerificationEmailOptions = {
  to: string;
  verifyUrl: string;
  appUrl: string;
  apiKey?: string;
  from?: string;
  fetchImpl?: FetchLike;
};

export async function sendVerificationEmail(options: VerificationEmailOptions) {
  const apiKey = options.apiKey ?? process.env.RESEND_API_KEY ?? '';
  const from = options.from ?? process.env.VERIFICATION_EMAIL_FROM ?? 'YT2Do <onboarding@resend.dev>';
  const fetchImpl = options.fetchImpl ?? fetch;

  if (!apiKey) {
    console.info(`[YT2Do email verification] ${options.to}: ${options.verifyUrl}`);
    return { provider: 'dev-log' as const };
  }

  const response = await fetchImpl('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from,
      to: [options.to],
      subject: 'Verify your YT2Do account',
      html: renderVerificationEmail(options.verifyUrl, options.appUrl),
      text: `Verify your YT2Do account: ${options.verifyUrl}`
    })
  });

  if (!response.ok) {
    throw new Error('Could not send verification email.');
  }

  return { provider: 'resend' as const };
}

function renderVerificationEmail(verifyUrl: string, appUrl: string) {
  return `
    <div style="font-family:Inter,Arial,sans-serif;line-height:1.5;color:#111827">
      <h1>Verify your YT2Do account</h1>
      <p>Click the button below to verify your email address and finish creating your account.</p>
      <p><a href="${escapeHtml(verifyUrl)}" style="display:inline-block;background:#0d9488;color:white;padding:12px 16px;border-radius:8px;text-decoration:none">Verify email</a></p>
      <p>This link expires in 24 hours. If you did not request this account, you can ignore this email.</p>
      <p><a href="${escapeHtml(appUrl)}">Open YT2Do</a></p>
    </div>
  `;
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}
