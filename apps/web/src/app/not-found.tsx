import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="min-h-dvh flex flex-col items-center justify-center text-center px-6">
      <h1 className="font-display text-2xl font-semibold">404</h1>
      <p className="text-sm text-ink2 mt-1">Halaman tidak ditemukan · Pájina la hetan · Página não encontrada</p>
      <Link href="/dashboard" className="mt-5 inline-flex items-center h-9 px-3.5 rounded-md border border-line-strong text-sm font-medium hover:bg-hover">Beranda</Link>
    </div>
  );
}
