"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="crm-loading">
      <div>
        <h1>Could not open this page</h1>
        <button className="btn" onClick={reset}>
          Try again
        </button>
      </div>
    </main>
  );
}
