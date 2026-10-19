"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type PropsWithChildren } from "react";
import clsx from "clsx";
import {
  Bell,
  Building2,
  CheckCheck,
  LogOut,
  Menu,
  X,
  ChevronDown,
} from "lucide-react";
import { motion } from "framer-motion";
import { authApi } from "@features/auth/api";
import {
  useNotifications,
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
} from "@features/notifications/hooks";
import { useAuthStore } from "@state/auth.store";
import { ThemeSwitcher } from "@shared/components/ThemeSwitcher";
import { InstallAppButton } from "@shared/components/InstallAppButton";
import { usePermission } from "@shared/hooks/usePermission";
import {
  isPortalNavGroup,
  type PortalNavEntry,
  type PortalNavLink,
} from "@shared/lib/portal-links";
import { getCurrentAppPath } from "@shared/lib/auth-redirect";
import { getRoleLabel, hasAllowedRole } from "@shared/lib/roles";
import { SystemStatusBanner } from "@shared/components/SystemStatusBanner";
import { LicenseBanner } from "@shared/components/LicenseBanner";
import { useLicenseStatus } from "@features/license/hooks";
import type { LicenseStatus } from "@features/license/types";
import { isLicenseModuleEnabled } from "@shared/lib/license";
import { useResetOnChange } from '@shared/hooks/useResetOnChange';

type PortalShellProps = PropsWithChildren<{
  portalRole: string;
  title: string;
  subtitle: string;
  accentClassName?: string;
  homeHref: string;
  navLinks: PortalNavEntry[];
}>;

function NavList({
  entries,
  pathname,
  isSuperRole,
  currentRole,
  variant,
  licenseStatus,
}: {
  entries: PortalNavEntry[];
  pathname: string;
  isSuperRole: boolean;
  currentRole: string;
  variant: "desktop" | "mobile";
  licenseStatus: LicenseStatus | undefined;
}) {
  const [expandedOverride, setExpandedOverride] = useState<
    Record<string, boolean>
  >({});

  const linkClass =
    variant === "desktop"
      ? "gms-sidebar-nav-item rounded-lg px-3 py-1.5 text-[13px] font-medium transition-colors"
      : "gms-sidebar-nav-item rounded-lg px-3 py-2 text-sm font-medium transition-colors";
  const groupButtonClass =
    variant === "desktop"
      ? "gms-sidebar-nav-item flex w-full items-center justify-between rounded-lg px-3 py-1.5 text-[13px] font-medium transition-colors"
      : "gms-sidebar-nav-item flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm font-medium transition-colors";

  const isChildVisible = (link: {
    isSuperOnly?: boolean;
    allowedRoles?: string[];
    module?: PortalNavLink["module"];
  }) => {
    // A module the licence does not include is hidden; no licence information means show everything.
    if (!isLicenseModuleEnabled(licenseStatus, link.module)) return false;
    if (link.isSuperOnly && !isSuperRole) return false;
    if (link.allowedRoles)
      return hasAllowedRole([currentRole], link.allowedRoles);
    return true;
  };

  const renderLink = (link: { href: string; label: string }) => {
    const active = pathname === link.href;
    return (
      <Link
        key={link.href}
        href={link.href}
        aria-current={active ? "page" : undefined}
        className={clsx(
          linkClass,
          active && "gms-sidebar-nav-item--active"
        )}
      >
        {link.label}
      </Link>
    );
  };

  return (
    <div className="flex flex-col gap-0.5">
      {entries.map((entry) => {
        if (isPortalNavGroup(entry)) {
          const children = entry.children.filter(isChildVisible);
          if (children.length === 0) return null;
          const hasActiveChild = children.some(
            (child) => pathname === child.href,
          );
          const isOpen = expandedOverride[entry.group] ?? hasActiveChild;
          return (
            <div key={entry.group}>
              <button
                type="button"
                aria-expanded={isOpen}
                onClick={() =>
                  setExpandedOverride((prev) => ({
                    ...prev,
                    [entry.group]: !isOpen,
                  }))
                }
                className={clsx(
                  groupButtonClass,
                  hasActiveChild && "gms-sidebar-nav-item--active"
                )}
              >
                <span>{entry.group}</span>
                <ChevronDown
                  className={clsx(
                    "h-3.5 w-3.5 shrink-0 transition-transform duration-150",
                    !isOpen && "-rotate-90",
                  )}
                />
              </button>
              {isOpen ? (
                <div className="gms-sidebar-border ml-2 flex flex-col gap-0.5 border-l pl-2">
                  {children.map(renderLink)}
                </div>
              ) : null}
            </div>
          );
        }
        return isChildVisible(entry) ? renderLink(entry) : null;
      })}
    </div>
  );
}

export function PortalShell({
  portalRole,
  title,
  subtitle,
  accentClassName = "text-cyan-400",
  homeHref,
  navLinks,
  children,
}: PortalShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { isSuperRole } = usePermission();
  const clearSession = useAuthStore((state) => state.clearSession);
  const roles = useAuthStore((state) => state.roles);
  const selectedRole = useAuthStore((state) => state.selectedRole);
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    if (typeof window === "undefined") return 288;
    const saved = window.localStorage.getItem("gms-sidebar-width");
    return saved ? parseInt(saved, 10) : 288;
  });
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const { data: licenseStatus } = useLicenseStatus();
  const notificationsEnabled = isLicenseModuleEnabled(licenseStatus, "notifications");
  const { data: notifications = [] } = useNotifications({ enabled: notificationsEnabled });
  const markRead = useMarkNotificationRead();
  const markAllRead = useMarkAllNotificationsRead();
  const unreadCount = notifications.filter((item) => !item.is_read).length;
  const currentRole = selectedRole ?? roles[0] ?? portalRole;
  const roleSwitchHref = (() => {
    const nextPath = getCurrentAppPath();
    return nextPath
      ? `/select-role?next=${encodeURIComponent(nextPath)}`
      : "/select-role";
  })();

  // Close the mobile drawer on navigation. Adjusted during render: the effect
  // version rendered the new route once with the drawer still open.
  useResetOnChange([pathname], () => {
    setMobileNavOpen(false);
  });

  const onLogout = () => {
    void authApi
      .logout()
      .catch(() => undefined)
      .finally(() => {
        clearSession();
        router.replace("/login");
      });
  };

  const notificationHref = (type: string) => {
    if (type.includes("ESCALATED")) return "/reception/visits?status=ESCALATED";
    if (type.includes("CHECKIN")) return "/reception/checkin";
    if (type.includes("HOST")) return "/host/visits";
    if (type.includes("VISIT")) return "/dashboard/visits";
    return `${homeHref}/notifications`.replace("//", "/");
  };

  const openNotification = async (item: {
    id: number;
    type: string;
    is_read: boolean;
  }) => {
    if (!item.is_read) {
      markRead.mutate(item.id);
    }
    setNotificationsOpen(false);
    router.push(notificationHref(item.type));
  };

  const handleSidebarResize = (e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = sidebarWidth;
    let finalWidth = startWidth;

    const onMouseMove = (moveEvent: MouseEvent) => {
      const newWidth = Math.max(
        180,
        Math.min(500, startWidth + (moveEvent.clientX - startX)),
      );
      finalWidth = newWidth;
      setSidebarWidth(newWidth);
    };

    const onMouseUp = () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
      window.localStorage.setItem("gms-sidebar-width", String(finalWidth));
    };

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  };

  return (
    <div className="flex h-full flex-col bg-slate-950 text-slate-100">
      {/* ── Mobile top bar ── */}
      <header className="z-30 flex items-center justify-between border-b border-slate-800/90 bg-slate-950/95 px-4 py-2.5 backdrop-blur-sm lg:hidden">
        <Link
          href={homeHref}
          className="inline-flex min-w-0 items-center gap-2 text-sm font-medium text-slate-100"
        >
          <Building2 className={clsx("h-4 w-4 shrink-0", accentClassName)} />
          <span className="truncate">{title}</span>
        </Link>
        <button
          type="button"
          aria-label="Open menu"
          onClick={() => setMobileNavOpen(true)}
          className="rounded-lg border border-slate-800 bg-slate-900 p-2"
        >
          <Menu className="h-4 w-4" />
        </button>
      </header>

      {/* ── Desktop: sidebar + main ── */}
      <div className="flex min-h-0 flex-1">
        {/* Desktop sidebar — flex col, nav scrolls, footer pinned */}
        <aside
          className="gms-sidebar sticky top-0 h-screen hidden shrink-0 flex-col border-r lg:flex"
          style={{ width: sidebarWidth }}
        >
          {/* Top: branding */}
          <div className="gms-sidebar-border shrink-0 border-b px-4 py-4">
            <Link href={homeHref} className="flex items-center gap-2.5">
              <div className="gms-sidebar-btn flex h-8 w-8 items-center justify-center rounded-lg border">
                <Building2 className={clsx("h-4 w-4", accentClassName)} />
              </div>
              <div className="min-w-0">
                <p className="gms-sidebar-section-text text-[9px] uppercase tracking-[0.2em]">
                  {portalRole}
                </p>
                <p className="gms-sidebar-logo-text truncate text-sm font-semibold">
                  {title}
                </p>
              </div>
            </Link>
          </div>

          {/* Middle: nav links — scrollable */}
          <nav className="ui-scrollbar flex-1 overflow-y-auto px-3 py-3">
            <NavList
              entries={navLinks}
              pathname={pathname}
              isSuperRole={isSuperRole}
              currentRole={currentRole}
              variant="desktop"
              licenseStatus={licenseStatus}
            />
          </nav>

          {/* Sidebar resize handle */}
          <div
            className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-cyan-500/50 transition-colors"
            onMouseDown={handleSidebarResize}
          />

          {/* Bottom: theme + signout — always visible, pinned */}
          <div className="gms-sidebar-border shrink-0 border-t px-3 py-3 space-y-2">
            <div className="flex items-center justify-between px-1">
              <span className="gms-sidebar-text-muted truncate text-[11px] font-medium">
                Active role: {getRoleLabel(currentRole)}
              </span>
              <div className="flex items-center gap-2">
                {roles.length > 1 ? (
                  <Link
                    href={roleSwitchHref}
                    className="gms-sidebar-btn rounded-md border px-2 py-1 text-[11px] font-medium transition"
                  >
                    Switch
                  </Link>
                ) : null}
                <InstallAppButton />
                <ThemeSwitcher />
              </div>
            </div>
            <button
              onClick={onLogout}
              className="gms-sidebar-btn flex w-full items-center justify-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition"
            >
              <LogOut className="h-3 w-3" />
              Sign out
            </button>
          </div>
        </aside>

        {/* Main content — dynamic margin to match sidebar */}
        <main
          className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden ui-scrollbar"
          style={{ width: `calc(100% - ${sidebarWidth}px)` }}
        >
          <div className="px-4 py-5 sm:px-6 lg:px-8">
            <div className="mb-4 flex items-center justify-end">
              <div className="relative">
                {notificationsEnabled ? (<>
                <button
                  type="button"
                  aria-label="Open notifications"
                  onClick={() => setNotificationsOpen((open) => !open)}
                  className="relative rounded-lg border border-slate-800 bg-slate-900 p-2 text-slate-300 transition hover:text-white"
                >
                  <motion.span
                    animate={
                      unreadCount > 0
                        ? { rotate: [0, -10, 10, -6, 6, 0] }
                        : { rotate: 0 }
                    }
                    transition={{ duration: 0.6 }}
                    className="block"
                  >
                    <Bell className="h-4 w-4" />
                  </motion.span>
                  {unreadCount > 0 ? (
                    <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold text-white">
                      {Math.min(unreadCount, 9)}
                    </span>
                  ) : null}
                </button>
                {notificationsOpen ? (
                  <div className="absolute right-0 top-11 z-30 w-80 rounded-lg border border-slate-800 bg-slate-950 p-3 shadow-2xl">
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-sm font-semibold text-white">
                        Notifications
                      </span>
                      <button
                        type="button"
                        onClick={() => markAllRead.mutate()}
                        className="inline-flex items-center gap-1 text-xs text-slate-400 hover:text-white"
                      >
                        <CheckCheck className="h-3 w-3" />
                        Mark all read
                      </button>
                    </div>
                    <div className="max-h-80 space-y-1 overflow-y-auto">
                      {notifications.slice(0, 10).map((item) => (
                        <button
                          type="button"
                          key={item.id}
                          onClick={() => openNotification(item)}
                          className={clsx(
                            "w-full rounded-md px-3 py-2 text-left text-xs transition",
                            item.is_read
                              ? "text-slate-400 hover:bg-slate-900"
                              : "bg-slate-900 text-slate-100",
                          )}
                        >
                          <span className="block font-medium">
                            {item.title}
                          </span>
                          <span className="mt-1 block line-clamp-2 text-slate-500">
                            {item.message}
                          </span>
                        </button>
                      ))}
                      {notifications.length === 0 ? (
                        <div className="px-3 py-6 text-center text-xs text-slate-500">
                          No notifications
                        </div>
                      ) : null}
                    </div>
                    <Link
                      href={`${homeHref}/notifications`.replace("//", "/")}
                      className="mt-2 block rounded-md px-3 py-2 text-center text-xs text-slate-400 hover:bg-slate-900 hover:text-white"
                    >
                      View all
                    </Link>
                  </div>
                ) : null}
                </>) : null}
              </div>
            </div>
            <LicenseBanner />
            <SystemStatusBanner />
            {children}
          </div>
        </main>
      </div>

      {/* ── Mobile drawer ── */}
      {mobileNavOpen && (
        <div
          className="fixed inset-0 z-40 lg:hidden"
          role="dialog"
          aria-modal="true"
        >
          <button
            type="button"
            onClick={() => setMobileNavOpen(false)}
            className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm"
          />
          <aside className="gms-sidebar absolute right-0 top-0 flex h-full w-64 flex-col border-l shadow-2xl">
            {/* Close */}
            <div className="gms-sidebar-border flex items-center justify-between border-b px-4 py-3">
              <p className="gms-sidebar-logo-text text-sm font-semibold">{title}</p>
              <button
                type="button"
                onClick={() => setMobileNavOpen(false)}
                className="gms-sidebar-btn rounded-lg border p-1.5"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Nav */}
            <nav className="ui-scrollbar flex-1 overflow-y-auto px-3 py-3">
              <NavList
                entries={navLinks}
                pathname={pathname}
                isSuperRole={isSuperRole}
                currentRole={currentRole}
                variant="mobile"
                licenseStatus={licenseStatus}
              />
            </nav>

            {/* Footer */}
            <div className="gms-sidebar-border shrink-0 border-t px-3 py-3 space-y-2">
              <div className="flex items-center justify-between px-1">
                <span className="gms-sidebar-text-muted truncate text-[11px] font-medium">
                  Active role: {getRoleLabel(currentRole)}
                </span>
                <div className="flex items-center gap-2">
                  {roles.length > 1 ? (
                    <Link
                      href={roleSwitchHref}
                      className="gms-sidebar-btn rounded-md border px-2 py-1 text-[11px] font-medium transition"
                    >
                      Switch
                    </Link>
                  ) : null}
                  <InstallAppButton />
                  <ThemeSwitcher />
                </div>
              </div>
              <button
                onClick={onLogout}
                className="gms-sidebar-btn flex w-full items-center justify-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition"
              >
                <LogOut className="h-3 w-3" />
                Sign out
              </button>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
