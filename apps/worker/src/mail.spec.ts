import { describe, expect, it, vi } from 'vitest';
import type { Transporter } from 'nodemailer';
import { createMailNotifier, createMailSender, type MailLogger, type SmtpConfig } from './mail';
import type { ReminderMessage } from './domain/reminders';

const silencioso: MailLogger & { info: ReturnType<typeof vi.fn>; warn: ReturnType<typeof vi.fn> } = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
};

const config = (over: Partial<SmtpConfig> = {}): SmtpConfig => ({
  enabled: true,
  host: 'localhost',
  port: 1025,
  secure: false,
  from: 'SCF <no-reply@scf.local>',
  ...over,
});

/** Transporte falso que registra as chamadas de `sendMail`. */
function makeTransport() {
  const sendMail = vi.fn(async () => ({ messageId: 'x' }));
  const transporter = { sendMail } as unknown as Transporter;
  const createTransport = vi.fn(() => transporter);
  return { createTransport, sendMail };
}

describe('mail (sender do worker)', () => {
  it('apenas registra no log quando MAIL_ENABLED=false', async () => {
    const { createTransport, sendMail } = makeTransport();
    const sender = createMailSender({ config: config({ enabled: false }), logger: silencioso, createTransport });

    await sender.send({ to: 'ana@example.com', subject: 'Oi', text: 'Corpo' });

    expect(createTransport).not.toHaveBeenCalled();
    expect(sendMail).not.toHaveBeenCalled();
    expect(silencioso.warn).toHaveBeenCalled();
    expect(silencioso.info).toHaveBeenCalledWith(
      { to: 'ana@example.com', subject: 'Oi' },
      expect.stringContaining('[mail:dev]'),
    );
  });

  it('envia por SMTP quando habilitado, com o remetente configurado', async () => {
    const { createTransport, sendMail } = makeTransport();
    const sender = createMailSender({ config: config(), logger: silencioso, createTransport });

    await sender.send({ to: 'ana@example.com', subject: 'Vencimento', text: 'Corpo' });

    expect(createTransport).toHaveBeenCalledWith({ host: 'localhost', port: 1025, secure: false, auth: undefined });
    expect(sendMail).toHaveBeenCalledWith({
      from: 'SCF <no-reply@scf.local>',
      to: 'ana@example.com',
      subject: 'Vencimento',
      text: 'Corpo',
    });
  });

  it('monta a autenticacao SMTP quando ha usuario', async () => {
    const { createTransport } = makeTransport();
    createMailSender({
      config: config({ user: 'bot', password: 'segredo' }),
      logger: silencioso,
      createTransport,
    });

    expect(createTransport).toHaveBeenCalledWith(expect.objectContaining({ auth: { user: 'bot', pass: 'segredo' } }));
  });
});

describe('mail notifier de lembretes', () => {
  it('encaminha a mensagem do dominio para o sender', async () => {
    const send = vi.fn(async () => {});
    const notifier = createMailNotifier({ send });

    const message: ReminderMessage = {
      to: 'bia@example.com',
      subject: 'SCF: 1 compromisso a vencer',
      text: 'Conteudo',
      obligationIds: ['o1'],
    };
    await notifier.send(message);

    expect(send).toHaveBeenCalledWith({
      to: 'bia@example.com',
      subject: 'SCF: 1 compromisso a vencer',
      text: 'Conteudo',
    });
  });
});
