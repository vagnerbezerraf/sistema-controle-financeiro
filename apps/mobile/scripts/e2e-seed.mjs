// Semeia a conta usada pelos fluxos Maestro do app mobile.
// Idempotente: registra o usuario (se novo) e garante uma conta no espaco,
// necessaria ao fluxo de sincronizacao do Open Finance.
const API = process.env.SCF_API_URL ?? 'http://127.0.0.1:3001/api/v1';
const email = process.env.SCF_E2E_EMAIL ?? 'e2e.mobile@scf.dev';
const password = process.env.SCF_E2E_PASSWORD ?? 'SenhaForte!123';

/** Autentica o usuario ja existente e devolve o accessToken. */
async function login() {
  const res = await fetch(`${API}/identity/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    console.error(`e2e:seed login falhou (${res.status}): ${await res.text()}`);
    process.exit(1);
  }
  return (await res.json()).accessToken;
}

const register = await fetch(`${API}/identity/register`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email, password, name: 'E2E Mobile', timezone: 'America/Sao_Paulo' }),
});

let token;
if (register.status === 201) {
  console.log(`e2e:seed conta criada -> ${email}`);
  token = (await register.json()).accessToken;
} else if (register.status === 409) {
  console.log(`e2e:seed conta ja existe -> ${email}`);
  token = await login();
} else {
  console.error(`e2e:seed falhou (${register.status}): ${await register.text()}`);
  process.exit(1);
}

const headers = { authorization: `Bearer ${token}` };

const spaces = await fetch(`${API}/financial-spaces`, { headers });
const spaceId = (await spaces.json())[0].id;

// Garante ao menos uma conta de destino; sem conta o consentimento nao
// consegue sincronizar lancamentos.
const accountsRes = await fetch(`${API}/financial-spaces/${spaceId}/accounts`, { headers });
const accounts = await accountsRes.json();
if (accounts.length === 0) {
  const created = await fetch(`${API}/financial-spaces/${spaceId}/accounts`, {
    method: 'POST',
    headers: { ...headers, 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'Conta E2E', type: 'checking' }),
  });
  if (created.status !== 201) {
    console.error(`e2e:seed conta falhou (${created.status}): ${await created.text()}`);
    process.exit(1);
  }
  console.log('e2e:seed conta padrao criada -> Conta E2E');
} else {
  console.log(`e2e:seed espaco ja tem ${accounts.length} conta(s)`);
}
