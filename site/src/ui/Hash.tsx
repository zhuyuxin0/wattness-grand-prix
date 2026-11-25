import { useEffect, useState } from "react";
import { copyText } from "../lib/clipboard";
import { Glyph } from "./Glyph";

interface HashProps {
  value: string;
  /** Characters kept after the 0x prefix, and at the end. */
  head?: number;
  tail?: number;
  /** Show the whole value; it still wraps by character, never overflows. */
  full?: boolean;
  href?: string | null;
  copy?: boolean;
  /** What the value is, for the copy button's label. */
  label?: string;
  className?: string;
}

export function middle(value: string, head = 6, tail = 4): string {
  const prefix = value.startsWith("0x") ? 2 : 0;
  if (value.length <= prefix + head + tail + 1) return value;
  return `${value.slice(0, prefix + head)}…${value.slice(-tail)}`;
}

/** A hash, root, address or transaction id: mono, shortened in the middle, the whole value in its title and its copy. */
export function Hash({ value, head = 6, tail = 4, full = false, href, copy = true, label = "hash", className }: HashProps) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const t = window.setTimeout(() => setCopied(false), 1400);
    return () => window.clearTimeout(t);
  }, [copied]);

  const text = full ? value : middle(value, head, tail);
  const body = (
    <span className="hash__text" title={value}>
      {text}
    </span>
  );

  return (
    <span className={`hash${full ? " hash--full" : ""}${className ? ` ${className}` : ""}`}>
      {href ? (
        <a className="hash__link" href={href} target="_blank" rel="noreferrer">
          {body}
          <Glyph name="popout" />
        </a>
      ) : (
        body
      )}
      {copy && (
        <button type="button" className="hash__copy" aria-label={copied ? `Copied the ${label}` : `Copy the ${label}`} onClick={async () => setCopied(await copyText(value))}>
          {copied ? "Copied" : "Copy"}
        </button>
      )}
    </span>
  );
}
