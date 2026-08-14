"use client";

export default function CrmError({ reset }: { reset: () => void }) {
  return <div className="state-page"><b>We couldn&apos;t load this workspace.</b><p>Your data is safe. Try loading the page again.</p><button className="primary-button" onClick={reset}>Try again</button></div>;
}
