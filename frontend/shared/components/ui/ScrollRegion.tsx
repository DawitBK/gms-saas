"use client";

import clsx from "clsx";
import { type PropsWithChildren } from "react";

interface ScrollRegionProps extends PropsWithChildren {
  className?: string;
  /** HTML id for targeting in tests */
  id?: string;
  /** aria-label for accessibility */
  "aria-label"?: string;
}

/**
 * ScrollRegion — the ONLY element allowed to scroll in this app.
 *
 * The global layout (PortalShell) uses `overflow-hidden` on both the sidebar
 * and the main content area. Each page wraps its content in a ScrollRegion
 * so that overflow is contained inside a bounded, styled container — never
 * on the browser viewport.
 */
export function ScrollRegion({
  className,
  id,
  children,
  ...rest
}: ScrollRegionProps) {
  return (
    <div
      id={id}
      className={clsx(
        "ui-scrollbar min-h-0 flex-1 overflow-y-auto overscroll-contain",
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
}
