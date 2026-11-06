import 'dotenv/config';
import { startTelemetry } from './telemetry/otel';

async function main() {
  // A telemetria precisa estar ativa antes de carregar a aplicacao, pois o
  // auto-instrumentation atua no momento em que http/express/pg sao importados.
  startTelemetry();

  const { bootstrap } = await import('./bootstrap');
  await bootstrap();
}

main().catch((err) => {
  console.error('Falha no bootstrap da API:', err);
  process.exit(1);
});
