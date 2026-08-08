import {
  BarChart3,
  Building2,
  CheckSquare,
  CreditCard,
  FileText,
  FolderOpen,
  LayoutDashboard,
  LifeBuoy,
  Receipt,
  Settings,
  Tags,
  Target,
  Trash2,
  Landmark,
} from "lucide-react"
import type { ComponentType } from "react"

export type NavItem = {
  href: string
  label: string
  icon: ComponentType<{ className?: string }>
  /** Hidden from members who lack this capability. */
  capability?: string
  description?: string
}

export type NavSection = { label: string; items: NavItem[] }

export const NAV_SECTIONS: NavSection[] = [
  {
    label: "Overview",
    items: [
      {
        href: "/dashboard",
        label: "Dashboard",
        icon: LayoutDashboard,
        description: "Spending at a glance",
      },
      {
        href: "/dashboard/receipts",
        label: "Receipts",
        icon: Receipt,
        description: "Search and manage every receipt",
      },
      {
        href: "/dashboard/analytics",
        label: "Analytics",
        icon: BarChart3,
        description: "Trends, categories and merchants",
      },
    ],
  },
  {
    label: "Organise",
    items: [
      {
        href: "/dashboard/folders",
        label: "Folders",
        icon: FolderOpen,
        description: "Group receipts by project or period",
      },
      {
        href: "/dashboard/categories",
        label: "Categories & tags",
        icon: Tags,
        description: "Categories, tags and auto-rules",
      },
      {
        href: "/dashboard/budgets",
        label: "Budgets",
        icon: Target,
        description: "Limits and spend tracking",
      },
    ],
  },
  {
    label: "Finance",
    items: [
      {
        href: "/dashboard/reports",
        label: "Reports",
        icon: FileText,
        description: "Build and export expense reports",
      },
      {
        href: "/dashboard/tax",
        label: "Tax",
        icon: Landmark,
        description: "Deductible totals and year-end prep",
      },
      {
        href: "/dashboard/approvals",
        label: "Approvals",
        icon: CheckSquare,
        description: "Submit and review expense reports",
      },
    ],
  },
  {
    label: "Workspace",
    items: [
      {
        href: "/dashboard/team",
        label: "Team",
        icon: Building2,
        capability: "member.manage",
        description: "Members, roles and invitations",
      },
      {
        href: "/dashboard/billing",
        label: "Billing",
        icon: CreditCard,
        capability: "workspace.billing",
        description: "Plan, seats and storage",
      },
      {
        href: "/dashboard/settings",
        label: "Settings",
        icon: Settings,
        description: "Profile, preferences and privacy",
      },
    ],
  },
]

export const SECONDARY_NAV: NavItem[] = [
  { href: "/dashboard/trash", label: "Trash", icon: Trash2 },
  { href: "/help", label: "Help & support", icon: LifeBuoy },
]

/** Bottom bar on phones — five slots, the middle one is the capture button. */
export const MOBILE_NAV: NavItem[] = [
  { href: "/dashboard", label: "Home", icon: LayoutDashboard },
  { href: "/dashboard/receipts", label: "Receipts", icon: Receipt },
  { href: "/dashboard/analytics", label: "Insights", icon: BarChart3 },
  { href: "/dashboard/reports", label: "Reports", icon: FileText },
]

export function isActivePath(pathname: string, href: string) {
  if (href === "/dashboard") return pathname === "/dashboard"
  return pathname === href || pathname.startsWith(`${href}/`)
}
