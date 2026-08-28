/**
 * The app's icon set.
 *
 * One house style, so icons sit together without looking assembled from
 * different kits: a 20x20 box, 1.5 stroke in `currentColor`, no fill,
 * round caps and joins. Colour and size come from the button (via
 * `currentColor` and the `className`), never from the icon itself.
 *
 * They render at 16px by default, which is why none of them carries
 * detail that would disappear there — no nested glyphs, no hairlines
 * closer than about a stroke apart.
 *
 * All of them are decorative: every caller is a control that states its
 * own name in `aria-label` (icon-only) or in visible text beside the
 * icon, so `aria-hidden` here keeps screen readers from announcing the
 * name twice.
 */
function Icon({
  className = "",
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={`h-4 w-4 shrink-0 ${className}`}
    >
      {children}
    </svg>
  );
}

export function PlusIcon({ className }: { className?: string }) {
  return (
    <Icon className={className}>
      <path d="M10 4.5v11M4.5 10h11" />
    </Icon>
  );
}

export function CloseIcon({ className }: { className?: string }) {
  return (
    <Icon className={className}>
      <path d="M5.5 5.5l9 9M14.5 5.5l-9 9" />
    </Icon>
  );
}

export function ArrowLeftIcon({ className }: { className?: string }) {
  return (
    <Icon className={className}>
      <path d="M16 10H4.5M9 4.5L3.5 10 9 15.5" />
    </Icon>
  );
}

export function TrashIcon({ className }: { className?: string }) {
  return (
    <Icon className={className}>
      <path d="M3.5 5.5h13M8 5.5V4a1 1 0 011-1h2a1 1 0 011 1v1.5M5 5.5l.7 10a1 1 0 001 .9h6.6a1 1 0 001-.9l.7-10" />
    </Icon>
  );
}

/**
 * Zoom uses magnifiers rather than a bare +/-: the same toolbar carries
 * a plus for "new task", and two identical plus signs a few pixels
 * apart meaning different things is worse than a slightly busier glyph.
 */
export function ZoomInIcon({ className }: { className?: string }) {
  return (
    <Icon className={className}>
      <circle cx="8.75" cy="8.75" r="5.25" />
      <path d="M12.6 12.6L17 17M6.5 8.75h4.5M8.75 6.5v4.5" />
    </Icon>
  );
}

export function ZoomOutIcon({ className }: { className?: string }) {
  return (
    <Icon className={className}>
      <circle cx="8.75" cy="8.75" r="5.25" />
      <path d="M12.6 12.6L17 17M6.5 8.75h4.5" />
    </Icon>
  );
}

/** Four corner brackets: pull the whole graph inside the frame. */
export function FitViewIcon({ className }: { className?: string }) {
  return (
    <Icon className={className}>
      <path d="M3 7.5v-3A1.5 1.5 0 014.5 3h3M12.5 3h3A1.5 1.5 0 0117 4.5v3M17 12.5v3a1.5 1.5 0 01-1.5 1.5h-3M7.5 17h-3A1.5 1.5 0 013 15.5v-3" />
    </Icon>
  );
}

/** A crosshair: put the viewport back on its origin. */
export function ResetViewIcon({ className }: { className?: string }) {
  return (
    <Icon className={className}>
      <circle cx="10" cy="10" r="3.25" />
      <path d="M10 2.5v2.25M10 15.25v2.25M2.5 10h2.25M15.25 10h2.25" />
    </Icon>
  );
}

/** Three nodes wired together: the stories list. */
export function StoriesIcon({ className }: { className?: string }) {
  return (
    <Icon className={className}>
      <circle cx="4" cy="10" r="2" />
      <circle cx="16" cy="4" r="2" />
      <circle cx="16" cy="16" r="2" />
      <path d="M6 9.2 14 5M6 10.8l8 5.2" />
    </Icon>
  );
}

/** Two figures: workspace members. */
export function MembersIcon({ className }: { className?: string }) {
  return (
    <Icon className={className}>
      <circle cx="7" cy="6" r="2.5" />
      <path d="M2.5 16c.6-3 2.2-4.5 4.5-4.5s3.9 1.5 4.5 4.5" />
      <circle cx="14.5" cy="7" r="2" />
      <path d="M12.5 11.2c1.9.3 3.1 1.6 3.6 4.3" />
    </Icon>
  );
}
