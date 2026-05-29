/**
 * 403 view (P2-E04-S01 AC2). Reached when a signed-in user whose role may not
 * use the POS (e.g. a parent or admin-family role) lands here — the `(pos)`
 * shell redirects them. It lives outside the `(pos)` route group so it is always
 * reachable and never forms a redirect loop. The "Sign in as till staff" link
 * lets the wrong account swap to a cashier/reception/packer login.
 */
export default function ForbiddenPage() {
  return (
    <main className="mx-auto flex max-w-md flex-col items-center gap-3 px-4 py-16 text-center">
      <h1 className="text-xl font-semibold">No POS access</h1>
      <p className="text-sm text-ink/70">
        This account is not permitted to use the in-store POS. The POS is for
        reception, cashier and packing staff.
      </p>
      <a
        href="/login"
        className="touch-target inline-flex items-center rounded-lg bg-brand px-5 font-medium text-surface"
      >
        Sign in as till staff
      </a>
    </main>
  );
}
