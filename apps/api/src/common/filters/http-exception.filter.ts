import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException as NestHttpException,
  HttpStatus,
  Logger,
  InternalServerErrorException,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { ZodError } from 'zod';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('AllExceptionsFilter');

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();
    const correlationId = (req as any).correlationId ?? 'unknown';

    let httpException: NestHttpException;
    if (exception instanceof NestHttpException) {
      httpException = exception;
    } else if (exception instanceof ZodError) {
      httpException = new InternalServerErrorException({
        code: 'VALIDATION_ERROR',
        issues: exception.issues,
      });
    } else {
      this.logger.error('Excecao nao tratada', exception instanceof Error ? exception.stack : String(exception));
      httpException = new InternalServerErrorException({
        code: 'UNEXPECTED_ERROR',
      });
    }

    const status = httpException.getStatus();
    const raw = httpException.getResponse();
    const bodyRaw = typeof raw === 'string' ? { message: raw } : (raw as Record<string, unknown>);

    res.status(status).json({
      type: `https://scf.app/errors/${bodyRaw.code ?? 'error'}`,
      title: HttpStatus[status] ?? 'Error',
      status,
      detail: bodyRaw.message ?? bodyRaw,
      instance: req.url,
      correlationId,
      ...bodyRaw,
    });
  }
}
