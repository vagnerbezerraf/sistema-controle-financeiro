import Link from 'next/link';

export default function HomePage() {
  return (
    <main id="conteudo">
      <header className="sticky top-0 z-30 w-full border-b border-neutral-200 bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
          <Link href="/" className="flex items-center gap-2 font-semibold text-brand-700">
            <span className="inline-block h-8 w-8 rounded-md bg-brand-600 text-white grid place-items-center font-bold">SCF</span>
            Controle Financeiro
          </Link>
          <nav className="flex items-center gap-2 text-sm">
            <Link className="px-3 py-2 text-neutral-700 hover:text-brand-700" href="/login">Entrar</Link>
            <Link className="btn-primary" href="/register">Criar conta</Link>
          </nav>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-4 py-20 text-center">
        <span className="badge border-brand-200 bg-brand-50 text-brand-700">Controle pessoal e familiar</span>
        <h1 className="mt-6 text-4xl font-bold tracking-tight text-neutral-900 sm:text-5xl">
          Registre o que aconteceu, entenda hoje e planeje os compromissos futuros.
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-lg text-neutral-600">
          Um sistema financeiro que separa com clareza saldo realizado, obrigações e projeções.
          Com interface web, aplicativo instalavel para desktop e sincronizacao por API.
        </p>
        <div className="mt-8 flex items-center justify-center gap-3">
          <Link className="btn-primary px-6 py-3 text-base" href="/register">Comecar gratis</Link>
          <Link className="btn-outline px-6 py-3 text-base" href="#beneficios">Ver beneficios</Link>
        </div>
      </section>

      <section id="beneficios" className="mx-auto max-w-6xl px-4 py-12">
        <div className="grid gap-6 md:grid-cols-3">
          {[
            {
              title: 'Registro rapido',
              desc: 'Receitas, despesas, transferencias e parcelamentos organizados por conta, categoria e etiqueta.',
              color: 'bg-brand-50 text-brand-700 border-brand-200',
            },
            {
              title: 'Clareza financeira',
              desc: 'Distincao explicita entre realizado, comprometido e projetado. Nunca confunda o futuro com o passado.',
              color: 'bg-success-50 text-success-700 border-success-200',
            },
            {
              title: 'Multiplataforma',
              desc: 'Acesso via navegador, aplicativo instalavel para Windows/macOS/Linux e aplicativo movel.',
              color: 'bg-warning-50 text-warning-700 border-warning-200',
            },
          ].map((b) => (
            <div key={b.title} className="card p-6">
              <span className={`mb-4 inline-flex rounded-md border px-2 py-1 text-xs font-medium ${b.color}`}>
                SCF
              </span>
              <h3 className="card-title mb-2">{b.title}</h3>
              <p className="text-sm text-neutral-600">{b.desc}</p>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
