import { Injectable, BadRequestException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaClient } from '@prisma/client';
import { generateSecret, generateURI, verify } from 'otplib';
import * as bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';

const RECOVERY_CODE_COUNT = 10;
const TOTP_TOLERANCE_SECONDS = 30;

@Injectable()
export class MfaService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly config: ConfigService,
  ) {}

  private get issuer(): string {
    return this.config.get<string>('app.MFA_ISSUER') ?? 'SCF';
  }

  /**
   * Gera um segredo TOTP e devolve o `otpauth://` para o QR code. O MFA ainda
   * fica desabilitado: so e ativado em `enable()` apos o usuario confirmar um
   * codigo valido.
   */
  async beginSetup(userId: string): Promise<{ secret: string; otpauthUrl: string }> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException('Usuario nao encontrado');

    const secret = generateSecret();
    await this.prisma.user.update({
      where: { id: userId },
      data: { mfaSecret: secret, mfaEnabled: false, mfaRecoveryCodes: [] },
    });

    return {
      secret,
      otpauthUrl: generateURI({ issuer: this.issuer, label: user.email, secret }),
    };
  }

  /** Confirma o codigo e ativa o MFA, devolvendo os codigos de recuperacao em claro. */
  async enable(userId: string, code: string): Promise<{ recoveryCodes: string[] }> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user?.mfaSecret) throw new BadRequestException('MFA nao foi iniciado');

    if (!(await this.verifyTotp(user.mfaSecret, code))) {
      throw new UnauthorizedException('Codigo de verificacao invalido');
    }

    const recoveryCodes = Array.from({ length: RECOVERY_CODE_COUNT }, () =>
      randomBytes(5).toString('hex'),
    );
    const hashed = await Promise.all(recoveryCodes.map((c) => bcrypt.hash(c, 10)));

    await this.prisma.user.update({
      where: { id: userId },
      data: { mfaEnabled: true, mfaRecoveryCodes: hashed },
    });

    return { recoveryCodes };
  }

  async disable(userId: string, code: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user?.mfaEnabled || !user.mfaSecret) throw new BadRequestException('MFA nao esta ativo');

    if (!(await this.verifyTotp(user.mfaSecret, code))) {
      throw new UnauthorizedException('Codigo de verificacao invalido');
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: { mfaEnabled: false, mfaSecret: null, mfaRecoveryCodes: [] },
    });
  }

  /**
   * Valida o segundo fator no login. Aceita um TOTP atual ou um codigo de
   * recuperacao (que e consumido). Retorna `true` quando o MFA do usuario
   * esta desligado.
   */
  async verifyForLogin(userId: string, code: string): Promise<boolean> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user?.mfaEnabled || !user.mfaSecret) return true;
    if (await this.verifyTotp(user.mfaSecret, code)) return true;
    return this.consumeRecoveryCode(user.id, user.mfaRecoveryCodes, code);
  }

  private async verifyTotp(secret: string, token: string): Promise<boolean> {
    try {
      const result = await verify({ secret, token, epochTolerance: TOTP_TOLERANCE_SECONDS });
      return result.valid;
    } catch {
      return false;
    }
  }

  private async consumeRecoveryCode(
    userId: string,
    hashes: string[],
    code: string,
  ): Promise<boolean> {
    for (let i = 0; i < hashes.length; i++) {
      if (await bcrypt.compare(code, hashes[i])) {
        await this.prisma.user.update({
          where: { id: userId },
          data: { mfaRecoveryCodes: hashes.filter((_, idx) => idx !== i) },
        });
        return true;
      }
    }
    return false;
  }
}
