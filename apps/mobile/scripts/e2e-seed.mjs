// Semeia a conta usada pelos fluxos Maestro do app mobile.
// Idempotente: se o e-mail ja existir (409), apenas segue.
const API = process.env.SCF_API_URL ?? 'http://127.0.0.1:3001/api/v1';
const email = process.env.SCF_E2E_EMAIL ?? 'e2e.mobile@scf.dev';
const password = process.env.SCF_E2E_PASSWORD ?? 'SenhaForte!123';

const res = await fetch(`${API}/identity/register`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email, password, name: 'E2E Mobile', timezone: 'America/Sao_Paulo' }),
});

if (res.status === 201) {
  console.log(`e2e:seed conta criada -> ${email}`);
} else if (res.status === 409) {
  console.log(`e2e:seed conta ja existe -> ${email}`);
} else {
  console.error(`e2e:seed falhou (${res.status}): ${await res.text()}`);
  process.exit(1);
}
