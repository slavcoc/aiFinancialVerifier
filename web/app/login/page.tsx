import Link from "next/link";
import { AuthForm } from "@/components/auth-form";

export default function LoginPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-line">
        <div className="mx-auto max-w-5xl px-6 py-4">
          <Link href="/" className="font-display text-xl tracking-tight">
            Second&nbsp;Reader
          </Link>
        </div>
      </header>
      <main className="flex flex-1 items-center justify-center px-6 py-16">
        <AuthForm mode="login" />
      </main>
    </div>
  );
}
