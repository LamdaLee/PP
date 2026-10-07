"use client";

import { useEffect, useRef, type ReactNode } from "react";

const focusable = 'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])';

export function Modal({ label, onClose, children }: { label: string; onClose: () => void; children: ReactNode }) {
  const container = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    (container.current?.querySelector<HTMLElement>(focusable) || container.current)?.focus();
    return () => { if (previous?.isConnected) previous.focus(); };
  }, []);
  return (
    <div className="modal" role="dialog" aria-modal="true" aria-label={label} ref={container} tabIndex={-1}
      onKeyDown={(event) => {
        if (event.key === "Escape") { event.preventDefault(); onClose(); }
        if (event.key !== "Tab") return;
        const controls = Array.from(container.current?.querySelectorAll<HTMLElement>(focusable) || []);
        const first = controls[0], last = controls[controls.length - 1];
        if (!first) { event.preventDefault(); container.current?.focus(); }
        else if (event.shiftKey && (document.activeElement === first || document.activeElement === container.current)) {
          event.preventDefault(); last.focus();
        } else if (!event.shiftKey && (document.activeElement === last || document.activeElement === container.current)) {
          event.preventDefault(); first.focus();
        }
      }}>
      {children}
    </div>
  );
}
