import nodemailer, { type Transporter } from 'nodemailer';
import { config } from '../config';

function httpError(status: number, message: string): Error {
  return Object.assign(new Error(message), { status });
}

let transporter: Transporter | null = null;

export function isSmtpConfigured(): boolean {
  return Boolean(config.smtp.host && config.smtp.user && config.smtp.pass);
}

function getTransporter(): Transporter {
  if (!isSmtpConfigured()) {
    throw httpError(400, 'SMTP is not configured on the API (set SMTP_HOST, SMTP_USER, SMTP_PASS).');
  }
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: config.smtp.host,
      port: config.smtp.port,
      secure: config.smtp.secure,
      auth: { user: config.smtp.user, pass: config.smtp.pass },
    });
  }
  return transporter;
}

export interface SendEmailInput {
  to: string;
  subject: string;
  /** Plain-text body. HTML is derived from this (newlines → <br>). */
  text: string;
}

/** Convert a plain-text body to minimal, deliverability-friendly HTML. */
function textToHtml(text: string): string {
  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  return `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:#1a1a1a">${escaped.replace(
    /\n/g,
    '<br>'
  )}</div>`;
}

export async function sendEmail(input: SendEmailInput): Promise<{ messageId: string }> {
  const tx = getTransporter();
  const info = await tx.sendMail({
    from: config.smtp.from,
    to: input.to,
    subject: input.subject,
    text: input.text,
    html: textToHtml(input.text),
  });
  return { messageId: info.messageId };
}

/** Verify SMTP credentials/connection without sending. */
export async function verifySmtp(): Promise<boolean> {
  const tx = getTransporter();
  await tx.verify();
  return true;
}
