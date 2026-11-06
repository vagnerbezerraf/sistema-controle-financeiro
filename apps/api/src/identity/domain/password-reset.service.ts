import { Injectable, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { randomBytes, createHash } from 'crypto';
import { MailService } from '../../common/mail/mail.service';

@Injectable()
export class PasswordResetService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly mail: MailService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Cria um token de redefinicao e envia por e-mail. Guardamos apenas o hash
   * SHA-256 do token; o valor claro so existe no link enviado ao usuario.
   * Nao revela se o e-mail existe (resposta uniforme no controller).
   */
  async request(email: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { email: email.trim().toLowerCase() },
    });
    if (!user?.passwordHash) return;

    const token = randomBytes(32).toString('hex');
    const tokenHash = createHash('sha256').update(token).digest('hex');
    const ttlMinutes = this.config.get<number>('app.PASSWORD_RESET_TTL_MINUTES') ?? 60;
    const expiresAt = new Date(Date.now() + ttlMinutes * 60_000);

    await this.prisma.passwordResetToken.create({
      data: { userId: user.id, tokenHash, expiresAt },
    });

    const webUrl = this.config.get<string>('app.WEB_APP_URL') ?? 'http://localhost:3000';
    const link = `${webUrl}/reset-password?token=${token}`;
    await this.mail.send({
      to: user.email,
      subject: 'Redefinicao de senha - SCF',
      text: `Recebemos um pedido para redefinir sua senha.\n\nAcesse: ${link}\n\nO link expira em ${ttlMinutes} minutos. Se nao foi voce, ignore este e-mail.`,
    });
  }

  /** Valida o token, troca a senha e invalida os tokens anteriores. */
  async reset(token: string, newPassword: string): Promise<void> {
    const tokenHash = createHash('sha256').update(token).digest('hex');
    const record = await this.prisma.passwordResetToken.findUnique({ where: { tokenHash } });

    if (!record || record.usedAt || record.expiresAt < new Date()) {
      throw new BadRequestException('Token invalido ou expirado');
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);

    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: record.userId }, data: { passwordHash } }),
      this.prisma.passwordResetToken.update({
        where: { id: record.id },
        data: { usedAt: new Date() },
      }),
      this.prisma.passwordResetToken.deleteMany({
        where: { userId: record.userId, id: { not: record.id } },
      }),
    ]);
  }
}
