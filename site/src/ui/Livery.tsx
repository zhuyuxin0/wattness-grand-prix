// The one livery motif: a thin stripe of graphite, teal and a short run of BNB
// yellow, cut at the same angle as the product mark.

export function LiveryStripe({ className }: { className?: string }) {
  return (
    <div className={`livery${className ? ` ${className}` : ""}`} aria-hidden="true">
      <span className="livery__teal" />
      <span className="livery__bnb" />
    </div>
  );
}

export function Mark({ size = 22 }: { size?: number }) {
  return (
    <svg className="mark" width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M2 5h4.2l3.1 14H5.1Z" fill="currentColor" />
      <path d="M8.6 5h4.2l3.1 14h-4.2Z" fill="var(--teal)" />
      <path d="M15.2 5h4.2L22 16.6 20.9 19h-2.6Z" fill="var(--bnb)" />
    </svg>
  );
}
