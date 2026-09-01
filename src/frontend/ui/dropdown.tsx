"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

export type DropdownProps = {
  trigger: ReactNode;
  children: ReactNode;
  align?: "start" | "end";
};

export function Dropdown({ trigger, children, align = "end" }: DropdownProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    function handleClickOutside(event: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="dropdown relative inline-block">
      <div
        role="button"
        tabIndex={0}
        onClick={() => setOpen((prev) => !prev)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setOpen((prev) => !prev);
          }
        }}
        className="cursor-pointer select-none"
      >
        {trigger}
      </div>
      {open ? (
        <ul
          onClick={() => setOpen(false)}
          className={`menu bg-base-100 border-base-content/10 rounded-box absolute z-50 mt-2 min-w-40 border p-2 shadow-lg ${
            align === "end" ? "end-0" : "start-0"
          }`}
        >
          {children}
        </ul>
      ) : null}
    </div>
  );
}

export function DropdownItem({ children }: { children: ReactNode }) {
  return <li>{children}</li>;
}

