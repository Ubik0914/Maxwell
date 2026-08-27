"use client";

import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from "react";

interface ToastItem {
  id: string;
  message: string;
  variant: "error" | "success";
}

interface ToastContextValue {
  showError: (message: string) => void;
  showSuccess: (message: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return context;
}

/**
 * App-wide toast host (Section 85/86: Graph mutation errors use a
 * toast, not a blocking dialog). Mount once in the root layout.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  const push = useCallback(
    (message: string, variant: ToastItem["variant"]) => {
      const id =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random()}`;
      setToasts((prev) => [...prev, { id, message, variant }]);
      setTimeout(() => dismiss(id), 4000);
    },
    [dismiss],
  );

  const showError = useCallback(
    (message: string) => push(message, "error"),
    [push],
  );
  const showSuccess = useCallback(
    (message: string) => push(message, "success"),
    [push],
  );

  return (
    <ToastContext.Provider value={{ showError, showSuccess }}>
      {children}
      {/* Every status notification in the app lands here — one fixed
          spot (top-right), never scattered per-screen. */}
      <div className="pointer-events-none fixed top-4 right-4 z-100 flex flex-col items-end gap-2">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            role="alert"
            className={`animate-toast-in pointer-events-auto rounded-md border px-4 py-2 text-sm shadow-lg select-text ${
              toast.variant === "error"
                ? "border-danger/40 bg-danger text-inverse"
                : "border-success/40 bg-surface text-success"
            }`}
          >
            {toast.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
