import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { resourceFromAttributes } from '@opentelemetry/resources';
import {
  ATTR_DEPLOYMENT_ENVIRONMENT_NAME,
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_VERSION,
} from '@opentelemetry/semantic-conventions';

const DEFAULT_OTLP_ENDPOINT = 'http://localhost:4318';
const DEFAULT_METRIC_INTERVAL_MS = 60_000;

let sdk: NodeSDK | undefined;

/**
 * Inicia o OpenTelemetry (traces e metricas) exportando via OTLP.
 *
 * Precisa ser chamado antes de carregar bibliotecas instrumentadas
 * (http, express, pg...), por isso o `dotenv/config` e a chamada ficam no
 * topo do `main.ts`, antes do import dinamico do modulo da aplicacao.
 *
 * Desabilitado por padrao; habilite com `OTEL_ENABLED=true`.
 */
export function startTelemetry(): boolean {
  if (process.env.OTEL_ENABLED !== 'true') {
    return false;
  }

  const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT || DEFAULT_OTLP_ENDPOINT;
  const exportIntervalMillis =
    Number(process.env.OTEL_METRIC_EXPORT_INTERVAL) || DEFAULT_METRIC_INTERVAL_MS;

  sdk = new NodeSDK({
    resource: resourceFromAttributes({
      [ATTR_SERVICE_NAME]: process.env.OTEL_SERVICE_NAME || 'scf-api',
      [ATTR_SERVICE_VERSION]: process.env.npm_package_version || '0.1.0',
      [ATTR_DEPLOYMENT_ENVIRONMENT_NAME]: process.env.NODE_ENV || 'development',
    }),
    traceExporter: new OTLPTraceExporter({ url: `${endpoint}/v1/traces` }),
    metricReaders: [
      new PeriodicExportingMetricReader({
        exporter: new OTLPMetricExporter({ url: `${endpoint}/v1/metrics` }),
        exportIntervalMillis,
      }),
    ],
    instrumentations: [
      getNodeAutoInstrumentations({
        // Ruido excessivo em producao sem valor para o SCF.
        '@opentelemetry/instrumentation-fs': { enabled: false },
      }),
    ],
  });

  sdk.start();
  return true;
}

/** Descarrega a telemetria pendente antes do encerramento do processo. */
export async function stopTelemetry(): Promise<void> {
  if (!sdk) {
    return;
  }
  const current = sdk;
  sdk = undefined;
  await current.shutdown();
}
