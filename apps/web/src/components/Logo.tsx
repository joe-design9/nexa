'use client';

export function NexaLogo({ size = 40, animated = false }: { size?: number; animated?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 512 512" aria-label="Nexa" role="img">
      <defs>
        <linearGradient id="nexa-g" x1="0" y1="0" x2="512" y2="512" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#7C5CFF" />
          <stop offset="1" stopColor="#22D3EE" />
        </linearGradient>
      </defs>
      <rect x="16" y="16" width="480" height="480" rx="112" fill="#0B0B12" />
      <rect x="16" y="16" width="480" height="480" rx="112" fill="none" stroke="url(#nexa-g)" strokeWidth="10" />
      <path
        d="M150 362 V150 L362 362 V150"
        fill="none"
        stroke="url(#nexa-g)"
        strokeWidth="52"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={animated ? 'nexa-draw' : undefined}
      />
    </svg>
  );
}

export function NexaWordmark({ size = 28 }: { size?: number }) {
  return (
    <span className="font-extrabold tracking-[0.3em] bg-gradient-to-r from-nexa-violet to-nexa-cyan bg-clip-text text-transparent" style={{ fontSize: size }}>
      NEXA
    </span>
  );
}
