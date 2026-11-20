import {
  BadRequestException,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import {
  CurrentUser,
  JwtAuthGuard,
  Roles,
  SpaceRoleGuard,
  type AuthenticatedUser,
} from '../common/auth/auth.guard';
import { AttachmentsService, type UploadedAttachment } from './attachments.service';

/**
 * Teto absoluto do multer, acima do limite de negocio (5 MB). Serve para cortar
 * uploads absurdos com 413 antes de bufferizar, mantendo o limite de negocio
 * (que devolve 400 com o codigo do dominio) como a regra visivel.
 */
const HARD_UPLOAD_LIMIT_BYTES = 25 * 1024 * 1024;

@ApiTags('attachments')
@Controller('financial-spaces/:spaceId/transactions/:transactionId/attachments')
@UseGuards(JwtAuthGuard, SpaceRoleGuard)
@ApiBearerAuth('access-token')
export class AttachmentsController {
  constructor(private readonly attachments: AttachmentsService) {}

  @Get()
  @Roles(['owner', 'admin', 'contributor', 'viewer'])
  @ApiOperation({ summary: 'Listar os comprovantes de uma transacao' })
  async list(
    @Param('spaceId') spaceId: string,
    @Param('transactionId') transactionId: string,
  ) {
    return { items: await this.attachments.list(spaceId, transactionId) };
  }

  @Post()
  @Roles(['owner', 'admin', 'contributor'])
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: HARD_UPLOAD_LIMIT_BYTES } }))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } },
  })
  @ApiOperation({ summary: 'Anexar um comprovante (PNG, JPEG, WEBP ou PDF) a transacao' })
  async upload(
    @Param('spaceId') spaceId: string,
    @Param('transactionId') transactionId: string,
    @UploadedFile() file: UploadedAttachment | undefined,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    if (!file) {
      throw new BadRequestException({
        code: 'FILE_REQUIRED',
        message: 'Envie um arquivo no campo file',
      });
    }
    return this.attachments.upload(spaceId, transactionId, file, user.sub);
  }

  @Get(':attachmentId/download')
  @Roles(['owner', 'admin', 'contributor', 'viewer'])
  @ApiOperation({ summary: 'Baixar o arquivo de um comprovante' })
  async download(
    @Param('spaceId') spaceId: string,
    @Param('transactionId') transactionId: string,
    @Param('attachmentId') attachmentId: string,
    @Res() res: Response,
  ): Promise<void> {
    const file = await this.attachments.download(spaceId, transactionId, attachmentId);
    res.setHeader('Content-Type', file.contentType);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${encodeURIComponent(file.fileName)}"`,
    );
    res.setHeader('Content-Length', file.buffer.length);
    res.end(file.buffer);
  }

  @Delete(':attachmentId')
  @Roles(['owner', 'admin', 'contributor'])
  @HttpCode(204)
  @ApiOperation({ summary: 'Remover um comprovante' })
  async remove(
    @Param('spaceId') spaceId: string,
    @Param('transactionId') transactionId: string,
    @Param('attachmentId') attachmentId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    await this.attachments.remove(spaceId, transactionId, attachmentId, user.sub);
  }
}
