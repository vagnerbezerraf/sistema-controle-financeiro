import { Injectable, OnApplicationShutdown } from '@nestjs/common';
import { stopTelemetry } from './otel';

/** Garante o flush da telemetria quando a aplicacao e encerrada. */
@Injectable()
export class TelemetryService implements OnApplicationShutdown {
  async onApplicationShutdown(): Promise<void> {
    await stopTelemetry();
  }
}
