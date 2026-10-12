"use client";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { initNativeBridge } from "@/mail/client/native";

export function NativeBridge() {
  const router = useRouter();
  useEffect(() => {
    void initNativeBridge((url) => router.push(url));
  }, [router]);
  return null;
}
