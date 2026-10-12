import Link from "next/link";
export default function NotFound() {
  return (
    <main className="crm-loading">
      <div>
        <h1>Page not found</h1>
        <Link href="/" className="btn">
          Open CRM
        </Link>
      </div>
    </main>
  );
}
