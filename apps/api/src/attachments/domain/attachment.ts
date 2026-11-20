/**
 * Dominio puro dos comprovantes: valida tipo/tamanho e resolve a chave de
 * storage. Nada aqui toca disco ou banco — sao regras puras, testaveis.
 */

/** Limite de tamanho de um comprovante (5 MB). */
export const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;

/** Tipos de arquivo aceitos como comprovante. */
export const ALLOWED_ATTACHMENT_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'application/pdf',
] as const;

export type AllowedAttachmentType = (typeof ALLOWED_ATTACHMENT_TYPES)[number];

/** Motivos de recusa de um comprovante. */
export type AttachmentRejectionCode = 'EMPTY_FILE' | 'FILE_TOO_LARGE' | 'UNSUPPORTED_TYPE';

export type AttachmentValidation =
  | { ok: true; contentType: AllowedAttachmentType }
  | { ok: false; code: AttachmentRejectionCode; message: string };

/** Extensao canonica por tipo, usada na chave de storage. */
const EXTENSION_BY_TYPE: Record<AllowedAttachmentType, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
  'application/pdf': '.pdf',
};

/** Valida tipo e tamanho de um comprovante antes de grava-lo. */
export function validateAttachment(input: { contentType?: string; size: number }): AttachmentValidation {
  if (!Number.isFinite(input.size) || input.size <= 0) {
    return { ok: false, code: 'EMPTY_FILE', message: 'Comprovante vazio' };
  }
  if (input.size > MAX_ATTACHMENT_BYTES) {
    return {
      ok: false,
      code: 'FILE_TOO_LARGE',
      message: `Comprovante maior que ${MAX_ATTACHMENT_BYTES} bytes`,
    };
  }
  const type = (input.contentType ?? '').toLowerCase();
  if (!isAllowedAttachmentType(type)) {
    return { ok: false, code: 'UNSUPPORTED_TYPE', message: 'Tipo de arquivo nao suportado' };
  }
  return { ok: true, contentType: type };
}

export function isAllowedAttachmentType(value: string): value is AllowedAttachmentType {
  return (ALLOWED_ATTACHMENT_TYPES as readonly string[]).includes(value);
}

export function extensionForContentType(contentType: string): string {
  return isAllowedAttachmentType(contentType) ? EXTENSION_BY_TYPE[contentType] : '';
}

/** Sanitiza o nome exibido, removendo caminhos e caracteres de controle. */
export function safeAttachmentName(fileName: string): string {
  const base = fileName.split(/[\\/]/).pop() ?? '';
  const clean = Array.from(base)
    .filter((ch) => ch.charCodeAt(0) > 0x1f)
    .join('')
    .trim();
  if (!clean || clean === '.' || clean === '..') return 'comprovante';
  return clean.slice(0, 200);
}

/** Chave de storage: pasta por espaco e arquivo nomeado pelo id do comprovante. */
export function attachmentStorageKey(
  spaceId: string,
  attachmentId: string,
  contentType: string,
): string {
  return `${spaceId}/${attachmentId}${extensionForContentType(contentType)}`;
}
