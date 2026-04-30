"use client";

import { useEffect } from "react";

export type ModalName = "methodology" | "data-quality" | "transit";

const EVENT = "app:open-modal";

/** Fire a request to open a named modal. Modals listen via useOpenModalEvent. */
export function openModal(name: ModalName) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(EVENT, { detail: name }));
}

/** Subscribe to open requests for a specific modal name. */
export function useOpenModalEvent(name: ModalName, onOpen: () => void) {
  useEffect(() => {
    const handler = (e: Event) => {
      if ((e as CustomEvent<ModalName>).detail === name) onOpen();
    };
    window.addEventListener(EVENT, handler);
    return () => window.removeEventListener(EVENT, handler);
  }, [name, onOpen]);
}
