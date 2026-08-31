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

export function ImageIcon({ className }: { className?: string }) {
  return (
    <Icon className={className}>
      <rect x="2.5" y="4" width="15" height="12" rx="2" />
      <circle cx="7" cy="8" r="1.25" />
      <path d="M3 13.5l3.5-3.5 3 3 2.5-2.5 5 5" />
    </Icon>
  );
}

/**
 * Import — an arrow coming down into an open tray. Down rather than up
 * because this is the receiving end: something arrives here from a
 * file. An up arrow on the same toolbar would read as export.
 */
export function ImportIcon({ className }: { className?: string }) {
  return (
    <Icon className={className}>
      <path d="M10 3v8m0 0l-3-3m3 3l3-3" />
      <path d="M3.5 13v2a2 2 0 002 2h9a2 2 0 002-2v-2" />
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

/** An open book: the guide. */
export function BookIcon({ className }: { className?: string }) {
  return (
    <Icon className={className}>
      <path d="M10 5.5v10" />
      <path d="M10 5.5C8.5 4.2 6.8 3.7 4 3.7v9.6c2.8 0 4.5.5 6 1.8" />
      <path d="M10 5.5c1.5-1.3 3.2-1.8 6-1.8v9.6c-2.8 0-4.5.5-6 1.8" />
    </Icon>
  );
}

/**
 * The three ways to look at one story. They have to be distinguishable
 * at 16px in a row of three, so each is a different *shape* — scattered
 * nodes, stacked lines, side-by-side stacks — rather than three
 * variations on a rectangle.
 */
export function GraphViewIcon({ className }: { className?: string }) {
  return (
    <Icon className={className}>
      <circle cx="4.5" cy="10" r="1.8" />
      <circle cx="10" cy="5" r="1.8" />
      <circle cx="10" cy="15" r="1.8" />
      <circle cx="15.5" cy="10" r="1.8" />
      <path d="M5.8 8.8 8.7 6.2M5.8 11.2l2.9 2.6M11.3 6.2l2.9 2.6M11.3 13.8l2.9-2.6" />
    </Icon>
  );
}

/** Rows with a marker: the task list. */
export function ListIcon({ className }: { className?: string }) {
  return (
    <Icon className={className}>
      <path d="M3 5.5h1M3 10h1M3 14.5h1M7 5.5h10M7 10h10M7 14.5h10" />
    </Icon>
  );
}

/** Two columns of stacked cards: the board. */
export function BoardIcon({ className }: { className?: string }) {
  return (
    <Icon className={className}>
      <rect x="2.5" y="3" width="6" height="14" rx="1.2" />
      <rect x="11.5" y="3" width="6" height="9" rx="1.2" />
    </Icon>
  );
}

/** The handle you pick a card up by. */
export function GripIcon({ className }: { className?: string }) {
  return (
    <Icon className={className}>
      <path d="M7 5.5h.01M13 5.5h.01M7 10h.01M13 10h.01M7 14.5h.01M13 14.5h.01" />
    </Icon>
  );
}

/**
 * The mark that says "there is a list behind this".
 *
 * Small and low-contrast on purpose: it has to be legible at 12px
 * beside a one-word value without competing with the value itself,
 * which is the thing the control is actually showing.
 */
export function ChevronDownIcon({ className }: { className?: string }) {
  return (
    <Icon className={className}>
      <path d="M5.5 8L10 12.5 14.5 8" />
    </Icon>
  );
}

/**
 * Sliders rather than a gear: a gear's teeth are exactly the kind of
 * detail that turns to mush at 16px in this stroke weight, and two
 * lines with a knob on each survive it.
 */
/**
 * More — three dots stacked, the shape a row's own actions are kept
 * behind everywhere. Filled rather than stroked: at 14px a stroked
 * circle of 1.5 is mostly hole.
 */
export function MoreIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="currentColor"
      aria-hidden="true"
      className={`h-4 w-4 ${className}`}
    >
      <circle cx="10" cy="4.5" r="1.5" />
      <circle cx="10" cy="10" r="1.5" />
      <circle cx="10" cy="15.5" r="1.5" />
    </svg>
  );
}

export function SettingsIcon({ className }: { className?: string }) {
  return (
    <Icon className={className}>
      <path d="M3 7h5.5M11.5 7H17M3 13h2.5M8.5 13H17" />
      <circle cx="10" cy="7" r="1.75" />
      <circle cx="7" cy="13" r="1.75" />
    </Icon>
  );
}

export function SearchIcon({ className }: { className?: string }) {
  return (
    <Icon className={className}>
      <circle cx="8.75" cy="8.75" r="5.25" />
      <path d="M12.6 12.6L17 17" />
    </Icon>
  );
}

/**
 * One node branching into two: arrange the graph by dependency order.
 */
export function AutoLayoutIcon({ className }: { className?: string }) {
  return (
    <Icon className={className}>
      <rect x="2" y="7.5" width="5" height="5" rx="1.2" />
      <rect x="13" y="2.5" width="5" height="5" rx="1.2" />
      <rect x="13" y="12.5" width="5" height="5" rx="1.2" />
      <path d="M7 10h3V5h3M10 10v5h3" />
    </Icon>
  );
}
