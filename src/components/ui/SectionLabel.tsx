/**
 * The heading over a group of rows.
 *
 * Small, uppercase and wide-tracked, so it reads as a label on the
 * group rather than as a line of the content — the same treatment the
 * drawer, the settings window and the workspaces screen all want, which
 * is why it stopped being three private copies of the same six lines.
 */
export function SectionLabel({ children }: { children: string }) {
  return (
    <p className="text-[10px] font-semibold tracking-[0.16em] text-text-faint uppercase">
      {children}
    </p>
  );
}
