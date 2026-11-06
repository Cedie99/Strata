import Link from "next/link";

export default function ForbiddenPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-3 px-4 text-center">
      <h1 className="text-lg font-semibold">You don&apos;t have access to that page</h1>
      <p className="text-muted">Ask an administrator to give your role the needed permission.</p>
      <Link href="/" className="text-primary underline">
        Back to dashboard
      </Link>
    </main>
  );
}
