import { Module } from '@nestjs/common';
import { OutboxService } from './outbox.service';

/**
 * Disponibiliza o registro de eventos do outbox para os modulos de negocio.
 * Nao tem controller: o consumo e feito pelo worker (`@scf/worker`).
 */
@Module({
  providers: [OutboxService],
  exports: [OutboxService],
})
export class OutboxModule {}
