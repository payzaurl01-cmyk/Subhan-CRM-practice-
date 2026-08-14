export function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="login-page">
      <div className="login-art">
        <div className="art-content">
          <span>Interior Blinds & Shutters</span>
          <h2>One clear view of every customer, job and payment.</h2>
          <p>Built for the team that keeps every installation moving.</p>
          <div className="art-stats">
            <div><strong>28</strong><small>Open leads</small></div>
            <div><strong>16</strong><small>Active jobs</small></div>
            <div><strong>£89k</strong><small>Pipeline</small></div>
          </div>
        </div>
      </div>
      <section className="login-form-wrap">{children}</section>
    </main>
  );
}
