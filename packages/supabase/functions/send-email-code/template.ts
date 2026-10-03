// Plain, branded email for a one-time code. No user-supplied text is placed in the message
// (only the 6-digit code), so nothing needs HTML escaping beyond the digits check.

export type EmailPurpose = 'reset' | 'verify';

export const CODE_TTL_MINUTES = 15;

export interface EmailContent {
  subject: string;
  text: string;
  html: string;
}

const COPY: Record<EmailPurpose, { subject: string; heading: string; lead: string; ignore: string }> = {
  reset: {
    subject: 'Your Nomadic password reset code',
    heading: 'Reset your password',
    lead: 'Enter this code in the Nomadic app to choose a new password.',
    ignore: 'If you did not ask to reset your password, you can ignore this email. Your password stays the same.',
  },
  verify: {
    subject: 'Verify your email for Nomadic',
    heading: 'Verify your email',
    lead: 'Enter this code in the Nomadic app to confirm this is your email address.',
    ignore: 'If you did not create a Nomadic account, you can ignore this email.',
  },
};

export function buildEmail(purpose: EmailPurpose, code: string): EmailContent {
  if (!/^[0-9]{6}$/.test(code)) throw new Error('code must be 6 digits');
  const c = COPY[purpose];
  const expiry = `The code expires in ${CODE_TTL_MINUTES} minutes and can be used once.`;

  const text = [
    c.heading,
    '',
    c.lead,
    '',
    `    ${code}`,
    '',
    expiry,
    '',
    c.ignore,
    '',
    'Nomadic',
  ].join('\n');

  const html = `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${c.subject}</title></head>
<body style="margin:0;padding:0;background:#f4f5f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#151a2d;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f8;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border:1px solid #e3e6ee;border-radius:12px;">
        <tr><td style="padding:24px 28px 0 28px;font-size:18px;font-weight:700;color:#2338e0;letter-spacing:-0.01em;">Nomadic</td></tr>
        <tr><td style="padding:16px 28px 0 28px;font-size:20px;font-weight:600;">${c.heading}</td></tr>
        <tr><td style="padding:8px 28px 0 28px;font-size:15px;line-height:22px;color:#424a63;">${c.lead}</td></tr>
        <tr><td style="padding:20px 28px;">
          <div style="display:inline-block;padding:12px 20px;border-radius:8px;background:#eef0fd;color:#151a2d;font-size:28px;font-weight:700;letter-spacing:6px;font-family:'SFMono-Regular',Consolas,'Liberation Mono',monospace;">${code}</div>
        </td></tr>
        <tr><td style="padding:0 28px;font-size:14px;line-height:20px;color:#424a63;">${expiry}</td></tr>
        <tr><td style="padding:16px 28px 24px 28px;font-size:13px;line-height:19px;color:#6b7390;">${c.ignore}</td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  return { subject: c.subject, text, html };
}
