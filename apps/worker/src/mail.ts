/**
 * Envio de e-mail transacional do worker (Fase 2).
 *
 * Espelha o `MailService` da API: com `MAIL_ENABLED=false` a mensagem e apenas
 * registrada no log (util sem SMTP); habilitado, sai por SMTP simples (MailHog
 * em dev, provedor real em homolog/producao). O transporte fica atras de
 * `MailSender`, entao o envio e testavel sem rede.
 */
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import type { ReminderMessage } from './domain/reminders';
import type { ReminderNotifier } from './reminders';

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
}

/** Entrega uma mensagem (implementado sobre o nodemailer, ou no-op em dev). */
export interface MailSender {
  send(message: MailMessage): Promise<void>;
}

/** Logger minimo aceito pelo sender (compativel com o pino do worker). */
export interface MailLogger {
  info(obj: Record<string, unknown>, msg: string): void;
  warn(obj: Record<string, unknown>, msg: string): void;
  error(obj: Record<string, unknown>, msg: string): void;
}

export interface SmtpConfig {
  enabled: boolean;
  host: string;
  port: number;
  secure: boolean;
  user?: string;
  password?: string;
  from: string;
}

export interface SmtpTransportOptions {
  host: string;
  port: number;
  secure: boolean;
  auth?: { user: string; pass?: string };
}

/** Fabrica de transporte injetavel para testes (padrao = `nodemailer.createTransport`). */
export type TransportFactory = (options: SmtpTransportOptions) => Transporter;

export interface MailSenderDeps {
  config: SmtpConfig;
  logger: MailLogger;
  createTransport?: TransportFactory;
}

/**
 * Cria o sender de e-mail. Sem `MAIL_ENABLED` e um no-op que apenas registra a
 * mensagem; com SMTP habilitado, delega ao nodemailer.
 */
export function createMailSender(deps: MailSenderDeps): MailSender {
  const { config, logger } = deps;
  const createTransport: TransportFactory = deps.createTransport ?? ((options) => nodemailer.createTransport(options));

  let transporter: Transporter | null = null;
  if (!config.enabled) {
    logger.warn({}, 'MAIL_ENABLED=false: e-mails serao apenas registrados no log');
  } else {
    transporter = createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: config.user ? { user: config.user, pass: config.password } : undefined,
    });
    logger.info({ host: config.host, port: config.port }, 'SMTP configurado para o worker');
  }

  return {
    async send(message: MailMessage): Promise<void> {
      if (!transporter) {
        logger.info({ to: message.to, subject: message.subject }, `[mail:dev] ${message.text}`);
        return;
      }
      await transporter.sendMail({
        from: config.from,
        to: message.to,
        subject: message.subject,
        text: message.text,
      });
    },
  };
}

/** Notifier de lembretes que entrega as mensagens por e-mail. */
export function createMailNotifier(sender: MailSender): ReminderNotifier {
  return {
    async send(message: ReminderMessage): Promise<void> {
      await sender.send({ to: message.to, subject: message.subject, text: message.text });
    },
  };
}
