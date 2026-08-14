"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import {
  Bell,
  Boxes,
  BriefcaseBusiness,
  CalendarDays,
  ChevronDown,
  CircleDollarSign,
  ClipboardCheck,
  ContactRound,
  FileText,
  LayoutDashboard,
  LockKeyhole,
  Menu,
  MessageSquareText,
  PackageSearch,
  Search,
  Settings,
  ShieldCheck,
  UsersRound,
  Warehouse,
  X,
  type LucideIcon,
} from "lucide-react";
import type { Viewer } from "@/lib/access/session";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";

type NavItem = { label: string; href: string; icon: LucideIcon; badge?: string };
type NavGroup = { label: string; items: NavItem[] };

const navigation: NavGroup[] = [
  {
    label: "Overview",
    items: [
      { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
      { label: "Notifications", href: "/notifications", icon: Bell, badge: "6" },
    ],
  },
  {
    label: "Sales",
    items: [
      { label: "Leads", href: "/leads", icon: BriefcaseBusiness, badge: "28" },
      { label: "Contacts", href: "/contacts", icon: ContactRound },
      { label: "Quotations", href: "/quotations", icon: FileText },
    ],
  },
  {
    label: "Operations",
    items: [
      { label: "Jobs", href: "/jobs", icon: ClipboardCheck },
      { label: "Tasks", href: "/tasks", icon: CircleDollarSign, badge: "7" },
      { label: "Calendar", href: "/calendar", icon: CalendarDays },
      { label: "Team chat", href: "/chat", icon: MessageSquareText, badge: "3" },
    ],
  },
  {
    label: "Stock",
    items: [
      { label: "Products", href: "/products", icon: PackageSearch },
      { label: "Inventory", href: "/inventory", icon: Boxes, badge: "12" },
      { label: "Warehouse", href: "/warehouse", icon: Warehouse },
    ],
  },
  {
    label: "Finance",
    items: [
      { label: "Invoices", href: "/finance/invoices", icon: FileText },
      { label: "Payments", href: "/finance/payments", icon: CircleDollarSign },
    ],
  },
  {
    label: "Administration",
    items: [
      { label: "Users", href: "/admin/users", icon: UsersRound },
      { label: "Audit logs", href: "/admin/audit", icon: ShieldCheck },
      { label: "Settings", href: "/admin/settings", icon: Settings },
      { label: "Master control", href: "/master", icon: LockKeyhole },
    ],
  },
];

const pageNames: Record<string, string> = {
  dashboard: "Dashboard Overview",
  leads: "Leads",
  contacts: "Contacts",
  quotations: "Quotations",
  jobs: "Job Orders",
  tasks: "Tasks",
  calendar: "Calendar",
  products: "Products",
  inventory: "Inventory",
  warehouse: "Warehouse",
  notifications: "Notifications",
  chat: "Team Chat",
  finance: "Finance",
  admin: "Administration",
  master: "Master Control",
};

function Brand() {
  return (
    <Link href="/dashboard" className="brand" aria-label="Interior Blinds CRM home">
      <span className="brand-mark">
        <Image src="/logo.jpeg" alt="" width={300} height={300} preload />
      </span>
      <span className="brand-copy">
        <strong>Interior Blinds</strong>
        <small>Operations CRM</small>
      </span>
    </Link>
  );
}

function Sidebar({ open, close }: { open: boolean; close: () => void }) {
  const pathname = usePathname();
  return (
    <>
      <div className={`drawer-scrim ${open ? "is-open" : ""}`} onClick={close} />
      <aside className={`sidebar ${open ? "is-open" : ""}`}>
        <div className="sidebar-head">
          <Brand />
          <button className="icon-button sidebar-close" onClick={close} aria-label="Close navigation">
            <X size={19} />
          </button>
        </div>
        <nav className="sidebar-nav" aria-label="Main navigation">
          {navigation.map((group) => (
            <div className="nav-group" key={group.label}>
              <p>{group.label}</p>
              {group.items.map((item) => {
                const active =
                  pathname === item.href ||
                  (item.href !== "/dashboard" && pathname.startsWith(`${item.href}/`));
                const Icon = item.icon;
                return (
                  <Link
                    href={item.href}
                    className={`nav-link ${active ? "active" : ""}`}
                    key={item.href}
                    onClick={close}
                  >
                    <Icon size={17} strokeWidth={1.9} />
                    <span>{item.label}</span>
                    {item.badge && <em>{item.badge}</em>}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>
        <div className="support-card">
          <span><MessageSquareText size={18} /></span>
          <div><strong>Need support?</strong><small>Contact the system team</small></div>
        </div>
      </aside>
    </>
  );
}

export function CrmShell({ viewer, children }: { viewer: Viewer; children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const segment = pathname.split("/").filter(Boolean)[0] || "dashboard";
  const title = pageNames[segment] || "Workspace";

  async function signOut() {
    const supabase = createBrowserSupabaseClient();
    if (supabase) await supabase.auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  return (
    <div className="crm-shell">
      <Sidebar open={drawerOpen} close={() => setDrawerOpen(false)} />
      <div className="app-column">
        <header className="topbar">
          <div className="topbar-left">
            <button className="icon-button menu-button" onClick={() => setDrawerOpen(true)} aria-label="Open navigation">
              <Menu size={21} />
            </button>
            <div>
              <div className="breadcrumb"><span>Workspace</span><b>/</b>{title}</div>
              <h1>{title}</h1>
            </div>
          </div>

          <div className={`global-search ${searchOpen ? "mobile-open" : ""}`}>
            <Search size={17} />
            <input aria-label="Search CRM" placeholder="Search leads, jobs, invoices…" />
            <kbd>⌘ K</kbd>
          </div>

          <div className="topbar-actions">
            {viewer.demo && <span className="demo-pill"><i /> Demo data</span>}
            <button className="icon-button mobile-search" onClick={() => setSearchOpen(!searchOpen)} aria-label="Search">
              <Search size={19} />
            </button>
            <div className="popover-wrap">
              <button className="icon-button has-alert" onClick={() => setNotificationsOpen(!notificationsOpen)} aria-label="Notifications">
                <Bell size={19} />
                <i />
              </button>
              {notificationsOpen && (
                <div className="popover notifications-popover">
                  <div className="popover-title"><strong>Notifications</strong><span>6 new</span></div>
                  <Link href="/leads"><b className="notice-icon blue">JL</b><span><strong>New website lead</strong><small>James Lawson · 3 min ago</small></span></Link>
                  <Link href="/tasks"><b className="notice-icon amber">!</b><span><strong>Task is overdue</strong><small>Confirm fabric delivery · 24 min ago</small></span></Link>
                  <Link href="/inventory"><b className="notice-icon red">12</b><span><strong>Low stock alert</strong><small>12 products need attention</small></span></Link>
                  <Link href="/notifications" className="view-all">View all notifications</Link>
                </div>
              )}
            </div>
            <div className="profile-wrap">
              <button className="profile-button" onClick={() => setProfileOpen(!profileOpen)}>
                <span className="avatar">{viewer.initials}</span>
                <span className="profile-copy"><strong>{viewer.name}</strong><small>{viewer.role}</small></span>
                <ChevronDown size={15} />
              </button>
              {profileOpen && (
                <div className="popover profile-popover">
                  <div><strong>{viewer.name}</strong><small>{viewer.email}</small></div>
                  <Link href="/admin/settings">Profile settings</Link>
                  <button onClick={signOut}>Sign out</button>
                </div>
              )}
            </div>
          </div>
        </header>
        <main className="app-main">{children}</main>
      </div>
    </div>
  );
}
