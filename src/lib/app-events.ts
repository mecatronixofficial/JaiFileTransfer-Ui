"use client";

export const APP_DATA_CHANGED_EVENT = "jai:data-changed";

export type AppDataChangedDetail = {
  source?: "upload" | "delete" | "move" | "restore" | "transfer" | "storage" | "other";
  files?: boolean;
  folders?: boolean;
  transfers?: boolean;
  storage?: boolean;
};

export function notifyAppDataChanged(detail: AppDataChangedDetail = {}) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(APP_DATA_CHANGED_EVENT, { detail }));
}

export function listenAppDataChanged(
  listener: (detail: AppDataChangedDetail) => void,
) {
  if (typeof window === "undefined") return () => undefined;

  const handler = (event: Event) => {
    listener((event as CustomEvent<AppDataChangedDetail>).detail ?? {});
  };

  window.addEventListener(APP_DATA_CHANGED_EVENT, handler);
  return () => window.removeEventListener(APP_DATA_CHANGED_EVENT, handler);
}
