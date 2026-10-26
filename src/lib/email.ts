import nodemailer from 'nodemailer'

function mailer() {
  const host = process.env.SMTP_HOST
  const user = process.env.SMTP_USER
  const pass = process.env.SMTP_PASS
  if (!host || !user || !pass) throw new Error('SMTP is not configured')
  return nodemailer.createTransport({
    host,
    port: Number(process.env.SMTP_PORT) || 465,
    secure: Number(process.env.SMTP_PORT || 465) === 465,
    auth: { user, pass },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
    tls: { rejectUnauthorized: true },
  })
}

export async function sendOTPEmail({ to, code, name }: { to: string; code: string; name?: string }) {
  const mailOptions = {
    from: `"BySync Team" <${process.env.SMTP_USER || 'info@Bytechsol.com'}>`,
    to,
    subject: `${code} is your BySync verification code`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #FAFAFA; margin: 0; padding: 40px 20px; color: #000000; }
          .container { max-width: 480px; margin: 0 auto; background: #FFFFFF; border: 1px solid #E4E4E7; border-radius: 16px; padding: 32px; box-shadow: 0 4px 12px rgba(0,0,0,0.05); }
          .logo { font-size: 24px; font-weight: 900; letter-spacing: 2px; text-transform: uppercase; margin-bottom: 24px; text-align: center; }
          .code-box { background: #F4F4F5; border: 1px solid #E4E4E7; border-radius: 12px; font-size: 32px; font-weight: 800; letter-spacing: 8px; text-align: center; padding: 16px; margin: 24px 0; color: #000000; }
          .footer { font-size: 12px; color: #71717A; text-align: center; margin-top: 24px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="logo">LOOP</div>
          <h2 style="font-size: 18px; font-weight: 700; margin-bottom: 8px;">Verify your email address</h2>
          <p style="font-size: 14px; color: #52525B; line-height: 1.5; margin-bottom: 0;">
            Hi ${name || 'there'}, welcome to BySync! Enter the verification code below to complete your account registration:
          </p>
          <div class="code-box">${code}</div>
          <p style="font-size: 13px; color: #71717A;">
            This code expires in 10 minutes. If you did not request this email, please ignore it.
          </p>
          <div class="footer">
            © ${new Date().getFullYear()} BySync by Bytechsol. All rights reserved.
          </div>
        </div>
      </body>
      </html>
    `,
  }

  await mailer().sendMail(mailOptions)
}

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]!)
}

export async function sendAccountLinkEmail({
  to, name, link, kind,
}: {
  to: string
  name: string
  link: string
  kind: 'invite' | 'recovery'
}) {
  const safeName = escapeHtml(name)
  const safeLink = escapeHtml(link)
  const invite = kind === 'invite'
  await mailer().sendMail({
    from: `"BySync Team" <${process.env.SMTP_USER}>`,
    to,
    subject: invite ? 'You are invited to BySync' : 'Reset your BySync password',
    html: `<!doctype html><html><body style="margin:0;background:#f8fafc;font-family:Arial,sans-serif;color:#0f172a">
      <div style="max-width:520px;margin:40px auto;background:#fff;border:1px solid #e2e8f0;border-radius:16px;padding:32px">
        <div style="font-size:24px;font-weight:900;letter-spacing:2px;margin-bottom:24px">LOOP</div>
        <h1 style="font-size:22px;margin:0 0 12px">${invite ? 'Welcome to BySync' : 'Reset your password'}</h1>
        <p style="color:#475569;line-height:1.6">Hi ${safeName}, ${invite ? 'you have been invited to join your company workspace.' : 'use the secure link below to choose a new password.'}</p>
        <a href="${safeLink}" style="display:inline-block;margin:16px 0;padding:12px 20px;border-radius:8px;background:#3589fa;color:#fff;text-decoration:none;font-weight:700">${invite ? 'Accept invitation' : 'Choose new password'}</a>
        <p style="font-size:12px;color:#94a3b8;line-height:1.5">This link is intended only for ${escapeHtml(to)}. If you were not expecting it, ignore this email.</p>
      </div></body></html>`,
  })
}
