import { useEffect, useState } from "react";
import { copyText } from "../../lib/clipboard";

/** A code block on chrome, below the pane, with no frame; its lines wrap rather than scroll. Copy is a word, as on the Terminal. */
export function Code({ label, code }: { label: string; code: string }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const t = window.setTimeout(() => setCopied(false), 1400);
    return () => window.clearTimeout(t);
  }, [copied]);
  return (
    <figure className="ag-code">
      <figcaption>
        <span className="ag-code__label">{label}</span>
        <button type="button" className="ag-code__copy" onClick={async () => setCopied(await copyText(code))} aria-label={copied ? "Copied" : `Copy: ${label}`}>
          {copied ? "Copied" : "Copy"}
        </button>
      </figcaption>
      <pre>
        <code>{code}</code>
      </pre>
    </figure>
  );
}
