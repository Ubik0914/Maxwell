import { Spinner } from "@/components/Spinner";

/**
 * The camera box while there is no picture yet: black, the size the
 * video will be, and saying what it is waiting for. Shared by the scan
 * screen's loading shell and the screen itself, so the one hands over
 * to the other without the box jumping.
 */
export function CameraLoading({ className = "" }: { className?: string }) {
  return (
    <div
      role="status"
      className={`flex aspect-[4/3] w-full flex-col items-center justify-center gap-3 rounded-md bg-black text-sm text-white/70 sm:aspect-video ${className}`}
    >
      <span className="scale-[1.7]">
        <Spinner />
      </span>
      カメラを起動しています…
    </div>
  );
}
