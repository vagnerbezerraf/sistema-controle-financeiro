import { defineConfig } from 'vitest/config';
import swc from 'unplugin-swc';

/**
 * Testes E2E da API: sobem o `AppModule` completo contra um Postgres real
 * (`scf_test`) via `@nestjs/testing` + Supertest.
 *
 * O Nest depende de `emitDecoratorMetadata` para a injecao de dependencias.
 * O esbuild (transformador padrao do Vitest) nao emite essa metadata, por isso
 * usamos o plugin SWC, que respeita `legacyDecorator`/`decoratorMetadata`.
 */
export default defineConfig({
  plugins: [
    swc.vite({
      jsc: {
        target: 'es2022',
        parser: { syntax: 'typescript', decorators: true },
        transform: { legacyDecorator: true, decoratorMetadata: true },
      },
      module: { type: 'es6' },
    }),
  ],
  test: {
    name: 'api-e2e',
    root: '.',
    include: ['test/e2e/**/*.e2e-spec.ts'],
    setupFiles: ['test/e2e/setup-env.ts'],
    globalSetup: ['test/e2e/global-setup.ts'],
    // Um unico processo: a suite trunca o banco entre os testes, entao nao pode
    // haver execucao concorrente.
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
    fileParallelism: false,
    sequence: { concurrent: false },
    testTimeout: 30_000,
    hookTimeout: 120_000,
  },
});
