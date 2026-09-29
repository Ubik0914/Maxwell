"use client";

import { useEffect, useRef, useState, type RefObject } from "react";

export type ScannerState =
  | "idle"
  | "starting"
  | "running"
  /** The person said no to the camera, or the browser did for them. */
  | "denied"
  /** No camera, or no camera API — an insecure page, an old browser. */
  | "unavailable"
  | "error";

interface NativeDetector {
  detect(source: HTMLVideoElement): Promise<{ rawValue: string }[]>;
}

interface NativeDetectorClass {
  new (options: { formats: string[] }): NativeDetector;
  getSupportedFormats(): Promise<string[]>;
}

const CONSTRAINTS: MediaStreamConstraints = {
  audio: false,
  video: {
    // The back camera on a phone; whatever there is on a laptop.
    facingMode: { ideal: "environment" },
    width: { ideal: 1280 },
    height: { ideal: 720 },
  },
};

/**
 * Reads EAN-13 barcodes off the camera into `onCode`, for as long as
 * `enabled` is true, until the component goes away.
 *
 * Two readers, one interface. Chrome on Android (and desktop Chrome on
 * some platforms) ships BarcodeDetector, which runs on the platform's
 * own decoder and is both faster and better in poor light. Safari has
 * no BarcodeDetector at all, and iPhones are where most books get
 * scanned, so ZXing — pure JavaScript, loaded only when it is needed —
 * reads the same frames there.
 *
 * `onCode` fires for every read, including the same barcode frame after
 * frame; deciding what counts as new is the caller's business (see
 * ScanSession), because only the caller knows what it already has.
 */
export function useBarcodeScanner(
  videoRef: RefObject<HTMLVideoElement | null>,
  onCode: (text: string) => void,
  enabled: boolean,
): ScannerState {
  const [state, setState] = useState<ScannerState>("idle");
  const onCodeRef = useRef(onCode);

  useEffect(() => {
    onCodeRef.current = onCode;
  }, [onCode]);

  useEffect(() => {
    const video = videoRef.current;
    if (!enabled || !video) {
      setState("idle");
      return;
    }

    let cancelled = false;
    let stop = () => {};

    async function start(video: HTMLVideoElement) {
      if (!navigator.mediaDevices?.getUserMedia) {
        setState("unavailable");
        return;
      }
      setState("starting");

      const Native = (
        window as unknown as { BarcodeDetector?: NativeDetectorClass }
      ).BarcodeDetector;
      const nativeReadsEan =
        Native &&
        (await Native.getSupportedFormats().catch((): string[] => [])).includes(
          "ean_13",
        );

      if (nativeReadsEan) {
        const stream = await navigator.mediaDevices.getUserMedia(CONSTRAINTS);
        const release = () => {
          stream.getTracks().forEach((track) => track.stop());
          video.srcObject = null;
        };
        if (cancelled) return release();

        video.srcObject = stream;
        await video.play();

        const detector = new Native({ formats: ["ean_13"] });
        let busy = false;
        const timer = window.setInterval(() => {
          if (busy || video.readyState < 2) return;
          busy = true;
          detector
            .detect(video)
            .then((codes) =>
              codes.forEach((code) => onCodeRef.current(code.rawValue)),
            )
            .catch(() => {})
            .finally(() => {
              busy = false;
            });
        }, 120);

        stop = () => {
          window.clearInterval(timer);
          release();
        };
      } else {
        const [
          { BrowserMultiFormatReader },
          { BarcodeFormat, DecodeHintType },
        ] = await Promise.all([
          import("@zxing/browser"),
          import("@zxing/library"),
        ]);
        if (cancelled) return;

        const reader = new BrowserMultiFormatReader(
          new Map([[DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.EAN_13]]]),
          { delayBetweenScanAttempts: 100, delayBetweenScanSuccess: 300 },
        );
        const controls = await reader.decodeFromConstraints(
          CONSTRAINTS,
          video,
          (result) => {
            if (result) onCodeRef.current(result.getText());
          },
        );
        stop = () => controls.stop();
        if (cancelled) return stop();
      }

      if (!cancelled) setState("running");
    }

    start(video).catch((error: unknown) => {
      if (cancelled) return;
      const name = error instanceof DOMException ? error.name : "";
      setState(
        name === "NotAllowedError" || name === "SecurityError"
          ? "denied"
          : name === "NotFoundError" || name === "OverconstrainedError"
            ? "unavailable"
            : "error",
      );
    });

    return () => {
      cancelled = true;
      stop();
    };
  }, [enabled, videoRef]);

  return state;
}
