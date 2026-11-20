import { describe, expect, it } from 'vitest';
import {
  ALLOWED_ATTACHMENT_TYPES,
  MAX_ATTACHMENT_BYTES,
  attachmentStorageKey,
  extensionForContentType,
  isAllowedAttachmentType,
  safeAttachmentName,
  validateAttachment,
} from './attachment';

describe('attachment', () => {
  describe('validateAttachment', () => {
    it('aceita um PNG dentro do limite', () => {
      expect(validateAttachment({ contentType: 'image/png', size: 1024 })).toEqual({
        ok: true,
        contentType: 'image/png',
      });
    });

    it('normaliza o tipo para minusculas', () => {
      expect(validateAttachment({ contentType: 'IMAGE/JPEG', size: 10 })).toEqual({
        ok: true,
        contentType: 'image/jpeg',
      });
    });

    it('aceita exatamente o limite maximo', () => {
      const result = validateAttachment({ contentType: 'application/pdf', size: MAX_ATTACHMENT_BYTES });
      expect(result.ok).toBe(true);
    });

    it('recusa arquivo vazio', () => {
      expect(validateAttachment({ contentType: 'image/png', size: 0 })).toMatchObject({
        ok: false,
        code: 'EMPTY_FILE',
      });
    });

    it('recusa tamanho invalido (negativo ou nao numerico)', () => {
      expect(validateAttachment({ contentType: 'image/png', size: -1 })).toMatchObject({
        ok: false,
        code: 'EMPTY_FILE',
      });
      expect(validateAttachment({ contentType: 'image/png', size: Number.NaN })).toMatchObject({
        ok: false,
        code: 'EMPTY_FILE',
      });
    });

    it('recusa um byte acima do limite', () => {
      expect(validateAttachment({ contentType: 'image/png', size: MAX_ATTACHMENT_BYTES + 1 })).toMatchObject({
        ok: false,
        code: 'FILE_TOO_LARGE',
      });
    });

    it('recusa tipo nao suportado (inclusive ausente)', () => {
      expect(validateAttachment({ contentType: 'text/plain', size: 10 })).toMatchObject({
        ok: false,
        code: 'UNSUPPORTED_TYPE',
      });
      expect(validateAttachment({ size: 10 })).toMatchObject({
        ok: false,
        code: 'UNSUPPORTED_TYPE',
      });
    });
  });

  describe('isAllowedAttachmentType', () => {
    it('reconhece os tipos permitidos', () => {
      for (const type of ALLOWED_ATTACHMENT_TYPES) {
        expect(isAllowedAttachmentType(type)).toBe(true);
      }
      expect(isAllowedAttachmentType('application/zip')).toBe(false);
    });
  });

  describe('extensionForContentType', () => {
    it('mapeia cada tipo para a extensao canonica', () => {
      expect(extensionForContentType('image/png')).toBe('.png');
      expect(extensionForContentType('image/jpeg')).toBe('.jpg');
      expect(extensionForContentType('image/webp')).toBe('.webp');
      expect(extensionForContentType('application/pdf')).toBe('.pdf');
    });

    it('devolve vazio para tipo desconhecido', () => {
      expect(extensionForContentType('text/csv')).toBe('');
    });
  });

  describe('safeAttachmentName', () => {
    it('remove o caminho e mantem apenas o nome do arquivo', () => {
      expect(safeAttachmentName('C:\\Users\\vagne\\recibo.png')).toBe('recibo.png');
      expect(safeAttachmentName('/tmp/comprovantes/fatura.pdf')).toBe('fatura.pdf');
    });

    it('usa um nome padrao quando fica vazio ou relativo', () => {
      expect(safeAttachmentName('')).toBe('comprovante');
      expect(safeAttachmentName('..')).toBe('comprovante');
      expect(safeAttachmentName('/')).toBe('comprovante');
    });

    it('remove caracteres de controle', () => {
      expect(safeAttachmentName('rec\u0000i\u001fbo.pdf')).toBe('recibo.pdf');
    });

    it('trunca nomes muito longos em 200 caracteres', () => {
      const name = `${'a'.repeat(500)}.png`;
      expect(safeAttachmentName(name)).toHaveLength(200);
    });
  });

  describe('attachmentStorageKey', () => {
    it('monta a chave por espaco com a extensao do tipo', () => {
      expect(attachmentStorageKey('space-1', 'att-9', 'image/png')).toBe('space-1/att-9.png');
      expect(attachmentStorageKey('space-1', 'att-9', 'application/pdf')).toBe('space-1/att-9.pdf');
    });
  });
});
