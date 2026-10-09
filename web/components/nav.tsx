import Link from "next/link";

export function Nav() {
  return (
    <header className="border-b border-line">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
        <Link href="/" className="font-display text-xl tracking-tight">
          Second&nbsp;Reader
        </Link>
        <nav className="flex items-center gap-6 text-sm">
          <a href="/#how" className="text-mut hover:text-ink transition-colors">
            How it works
          </a>
          <Link href="/login" className="text-mut hover:text-ink transition-colors">
            Log in
          </Link>
          <Link
            href="/signup"
            className="rounded-full bg-ink px-5 py-2 text-paper transition-opacity hover:opacity-85"
          >
            Get started
          </Link>
        </nav>
      </div>
    </header>
  );
}

export function Footer() {
  return (
    <footer className="border-t border-line">
      <div className="mx-auto flex max-w-5xl flex-col gap-2 px-6 py-8 text-sm text-mut sm:flex-row sm:items-center sm:justify-between">
        <p className="font-display text-base text-ink">Second Reader</p>
        <p>Numbers checked, evidence quoted. No black-box scores.</p>
      </div>
    </footer>
  );
}
