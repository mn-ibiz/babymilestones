/**
 * Admin console landing inside the role-gated shell (P1-E10-S01). The shell
 * (`(console)/layout.tsx`) renders the permission-filtered side nav + header
 * around this page. The console root is reachable by any admin-family role; the
 * nav itself only shows the sections the role's permission set allows (AC1).
 */
export default function ConsoleHome() {
  return (
    <section>
      <h1>Admin Console</h1>
      <p>Select a section from the navigation to get started.</p>
    </section>
  );
}
