/**
 * Sends one message through the user's own SMTP account. Callers own the review rule,
 * daily caps and spacing; this class only talks to the server.
 */
import nodemailer from 'nodemailer';

export interface SmtpSettings {
  host: string;
  port: number;
  /** Implicit TLS. Defaults to true for port 465, otherwise STARTTLS is required. */
  secure?: boolean;
  user: string;
  pass: string;
}

export interface MailMessage {
  from: string;
  to: string;
  subject: string;
  text: string;
  replyTo?: string;
}

export interface SendResult {
  messageId: string | null;
  accepted: string[];
  rejected: string[];
}

/** The part of a nodemailer transport this class uses (injectable for tests). */
export interface MailTransport {
  verify(): Promise<unknown>;
  sendMail(msg: Record<string, unknown>): Promise<{ messageId?: string; accepted?: unknown[]; rejected?: unknown[] }>;
  close?(): void;
}

export type TransportFactory = (options: Record<string, unknown>) => MailTransport;

const defaultFactory: TransportFactory = (options) => nodemailer.createTransport(options) as unknown as MailTransport;

export function transportOptions(s: SmtpSettings): Record<string, unknown> {
  const secure = s.secure ?? s.port === 465;
  return {
    host: s.host,
    port: s.port,
    secure,
    requireTLS: !secure,
    auth: { user: s.user, pass: s.pass },
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 30_000,
  };
}

const addr = (v: unknown) => (typeof v === 'string' ? v : v && typeof v === 'object' && 'address' in v ? String((v as { address: unknown }).address) : String(v));

export class SmtpSender {
  private readonly transport: MailTransport;

  constructor(settings: SmtpSettings, factory: TransportFactory = defaultFactory) {
    this.transport = factory(transportOptions(settings));
  }

  /** Signs in to the server without sending anything. Throws with the server's reason. */
  async verify(): Promise<void> {
    await this.transport.verify();
  }

  async send(msg: MailMessage): Promise<SendResult> {
    const info = await this.transport.sendMail({
      from: msg.from,
      to: msg.to,
      subject: msg.subject,
      text: msg.text,
      ...(msg.replyTo ? { replyTo: msg.replyTo } : {}),
    });
    return {
      messageId: info.messageId ?? null,
      accepted: (info.accepted ?? []).map(addr),
      rejected: (info.rejected ?? []).map(addr),
    };
  }

  close(): void {
    this.transport.close?.();
  }
}
