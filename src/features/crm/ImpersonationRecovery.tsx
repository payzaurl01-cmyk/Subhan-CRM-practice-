export function ImpersonationRecovery({ message }: { message: string }) {
  return (
    <main className="crm-loading">
      <section>
        <h1>Impersonation needs attention</h1>
        <p>{message}</p>
        <form method="post" action="/api/impersonation/exit">
          <button className="btn" type="submit">
            Exit impersonation
          </button>
        </form>
      </section>
    </main>
  );
}
