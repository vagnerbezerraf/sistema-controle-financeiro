import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

/**
 * Envio de e-mail transacional.
 *
 * Em desenvolvimento `MAIL_ENABLED=false` faz o servico apenas registrar a
 * mensagem no log (util sem SMTP). Quando habilitado, usa SMTP simples
 * (MailHog em dev, provedor real em homolog/producao).
 */
@Injectable()
export class MailService implements OnModuleInit {
  private readonly logger = new Logger(MailService.name);
  private transporter: Transporter | null = null;
  private from = 'SCF <no-reply@scf.local>';

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    this.from = this.config.get<string>('app.MAIL_FROM') ?? this.from;
    const enabled = this.config.get<boolean>('app.MAIL_ENABLED') ?? false;

    if (!enabled) {
      this.logger.warn('MAIL_ENABLED=false: e-mails serao apenas registrados no log.');
      return;
    }

    const user = this.config.get<string>('app.MAIL_USER');
    this.transporter = nodemailer.createTransport({
      host: this.config.get<string>('app.MAIL_HOST'),
      port: this.config.get<number>('app.MAIL_PORT'),
      secure: this.config.get<boolean>('app.MAIL_SECURE') ?? false,
      auth: user ? { user, pass: this.config.get<string>('app.MAIL_PASSWORD') } : undefined,
    });
    this.logger.log(
      `SMTP configurado em ${this.config.get<string>('app.MAIL_HOST')}:${this.config.get<number>('app.MAIL_PORT')}`,
    );
  }

  async send(message: MailMessage): Promise<void> {
    if (!this.transporter) {
      this.logger.log(`[mail:dev] to=${message.to} subject="${message.subject}"\n${message.text}`);
      return;
    }
    await this.transporter.sendMail({
      from: this.from,
      to: message.to,
      subject: message.subject,
      text: message.text,
      html: message.html,
    });
  }
}
