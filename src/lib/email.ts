import nodemailer from 'nodemailer'

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.hostinger.com',
  port: Number(process.env.SMTP_PORT) || 465,
  secure: true, // SSL
  auth: {
    user: process.env.SMTP_USER || 'info@Bytechsol.com',
    pass: process.env.SMTP_PASS || 'S@nghar123',
  },
  connectionTimeout: 10000,
  greetingTimeout: 10000,
  socketTimeout: 15000,
  tls: {
    rejectUnauthorized: false,
  },
})

export async function sendOTPEmail({ to, code, name }: { to: string; code: string; name?: string }) {
  const mailOptions = {
    from: `"Loop Team" <${process.env.SMTP_USER || 'info@Bytechsol.com'}>`,
    to,
    subject: `${code} is your Loop verification code`,
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
            Hi ${name || 'there'}, welcome to Loop! Enter the verification code below to complete your account registration:
          </p>
          <div class="code-box">${code}</div>
          <p style="font-size: 13px; color: #71717A;">
            This code expires in 10 minutes. If you did not request this email, please ignore it.
          </p>
          <div class="footer">
            © ${new Date().getFullYear()} Loop by Bytechsol. All rights reserved.
          </div>
        </div>
      </body>
      </html>
    `,
  }

  await transporter.sendMail(mailOptions)
}
