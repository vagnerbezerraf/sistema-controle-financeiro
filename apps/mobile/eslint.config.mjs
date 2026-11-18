import react from '@scf/config/eslint.react.js';

export default [
  ...react,
  {
    // Scripts auxiliares (Node) usados pelo seed do E2E.
    files: ['scripts/**/*.{js,mjs}'],
    languageOptions: {
      globals: { process: 'readonly', console: 'readonly', fetch: 'readonly' },
    },
  },
  {
    // Fluxos e scripts do Maestro rodam no GraalJS (globais proprios, ex.: `output`).
    ignores: ['.maestro/**'],
  },
];
