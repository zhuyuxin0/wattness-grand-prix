import { useEffect, useState } from "react";
import { copyText } from "../../lib/clipboard";

export function Code({ label, code }: { label: string; code: string }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const t = window.setTimeout(() => setCopied(false), 1400);
    return () => window.clearTimeout(t);
  }, [copied]);
  return (
    <figure className="gr-codeblock">
      <figcaption>
        <span className="eyebrow">{label}</span>
        <button type="button" className="gr-codeblock__copy" onClick={async () => setCopied(await copyText(code))} aria-label={copied ? "Copied" : `Copy: ${label}`}>
          {copied ? "Copied" : "Copy"}
        </button>
      </figcaption>
      <pre>
        <code>{code}</code>
      </pre>
    </figure>
  );
}
