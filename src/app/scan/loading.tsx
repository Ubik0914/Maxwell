import Link from "next/link";
import { ArrowLeftIcon } from "@/components/icons";
import { CameraLoading } from "@/components/library/CameraLoading";
import { ScanShellMark } from "@/components/library/scanShell";
import { Window, WindowBar } from "@/components/library/Window";

/**
 * The scan screen before it is ready: the same sheet, header and camera
 * box, shown the moment スキャン is tapped, while the page's session
 * check and code are still on their way. Waiting on a screen that has
 * already opened reads as the camera starting; waiting on the list that
 * was tapped reads as the tap being missed.
 */
export default function ScanLoading() {
  return (
    <Window sheet>
      <ScanShellMark />
      <WindowBar>
        <Link
          href="/"
          aria-label="蔵書に戻る"
          title="蔵書に戻る"
          className="-ml-1 flex h-11 w-11 items-center justify-center rounded-md text-text-muted transition-colors hover:bg-surface-hover hover:text-text sm:h-auto sm:w-auto sm:p-1.5"
        >
          <ArrowLeftIcon />
        </Link>
        <h1 className="min-w-0 flex-1 truncate text-base text-text sm:text-lg">
          連続スキャン
        </h1>
      </WindowBar>
      <main className="flex min-h-0 flex-1 flex-col gap-4 px-3 py-3 sm:px-4">
        <section className="flex flex-col gap-3 rounded-lg bg-bg/40 p-3">
          <CameraLoading />
        </section>
      </main>
    </Window>
  );
}
