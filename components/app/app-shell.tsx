"use client"

import { useAuthActions } from "@convex-dev/auth/react"
import { useMutation, useQuery } from "convex/react"
import {
  Check,
  ChevronsUpDown,
  LogOut,
  Menu,
  Monitor,
  Moon,
  Plus,
  Receipt,
  Search,
  Sun,
  User,
} from "lucide-react"
import { useTheme } from "next-themes"
import { toast } from "sonner"
import Image from "next/image"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { useEffect, useState, type ReactNode } from "react"

import { CommandPalette } from "@/components/app/command-palette"
import {
  MOBILE_NAV,
  NAV_SECTIONS,
  SECONDARY_NAV,
  isActivePath,
} from "@/components/app/nav-config"
import { NotificationsMenu } from "@/components/app/notifications-menu"
import { CaptureProvider, useCapture } from "@/components/capture/capture-provider"
import { AskProvider, promptDialog } from "@/components/common/confirm"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { Skeleton } from "@/components/ui/skeleton"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { useHaptics } from "@/hooks/use-haptics"
import { errorMessage } from "@/lib/errors"
import { initials, ROLE_LABELS } from "@/lib/format"
import { cn } from "@/lib/utils"

type Session = NonNullable<typeof api.users.me._returnType>

function Brand() {
  return (
    <Link
      href="/dashboard"
      className="flex items-center gap-2.5 rounded-lg text-sm font-semibold tracking-tight focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
    >
      <Image
        src="/logo.png"
        alt="Receiptful"
        width={28}
        height={28}
        className="h-7 w-7 rounded-lg object-contain"
        priority
      />
      <span>Receiptful</span>
    </Link>
  )
}

function WorkspaceSwitcher({ session }: { session: Session }) {
  const switchWorkspace = useMutation(api.users.changeActiveWorkspace)
  const createWorkspace = useMutation(api.workspaces.create)
  const router = useRouter()
  const [pending, setPending] = useState(false)

  if (!session.activeWorkspace) return null

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className="h-auto w-full justify-between px-2 py-2 text-left"
          disabled={pending}
        >
          <span className="min-w-0">
            <span className="block truncate text-sm font-medium">
              {session.activeWorkspace.name}
            </span>
            <span className="block truncate text-xs text-muted-foreground">
              {ROLE_LABELS[session.role ?? "member"]} ·{" "}
              {session.activeWorkspace.plan.charAt(0).toUpperCase() +
                session.activeWorkspace.plan.slice(1)}
            </span>
          </span>
          <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
          Workspaces
        </DropdownMenuLabel>
        {session.workspaces.map((workspace) => (
          <DropdownMenuItem
            key={workspace._id}
            onSelect={async () => {
              if (workspace._id === session.activeWorkspace?._id) return
              setPending(true)
              await switchWorkspace({ workspaceId: workspace._id as Id<"workspaces"> })
              setPending(false)
              router.push("/dashboard")
            }}
          >
            <span className="flex h-6 w-6 items-center justify-center rounded-md bg-muted text-[10px] font-semibold">
              {initials(workspace.name)}
            </span>
            <span className="min-w-0 flex-1 truncate">{workspace.name}</span>
            {workspace._id === session.activeWorkspace?._id ? (
              <Check className="h-3.5 w-3.5" />
            ) : null}
          </DropdownMenuItem>
        ))}

        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={async () => {
            const name = await promptDialog({
              title: "New workspace",
              description:
                "Workspaces keep receipts, categories and team members separate. You can rename it later.",
              label: "Workspace name",
              placeholder: "Morgan Design Studio",
              confirmLabel: "Create workspace",
              validate: (value) =>
                value.length < 2
                  ? "Use at least 2 characters."
                  : value.length > 80
                    ? "Keep the name under 80 characters."
                    : null,
            })
            if (!name) return

            setPending(true)
            try {
              const workspaceId = await createWorkspace({ name })
              await switchWorkspace({ workspaceId })
              router.push("/dashboard")
            } catch (caught) {
              toast.error(errorMessage(caught))
            } finally {
              setPending(false)
            }
          }}
        >
          <Plus className="h-3.5 w-3.5" />
          New workspace
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function NavLinks({ session, onNavigate }: { session: Session; onNavigate?: () => void }) {
  const pathname = usePathname()
  const role = session.role ?? "viewer"
  const canManageMembers = ["owner", "admin"].includes(role)
  const isOwner = role === "owner"

  const visible = (capability?: string) => {
    if (!capability) return true
    if (capability === "member.manage") return canManageMembers
    if (capability === "workspace.billing") return isOwner
    return true
  }

  return (
    <nav className="space-y-6" aria-label="Main">
      {NAV_SECTIONS.map((section) => {
        const items = section.items.filter((item) => visible(item.capability))
        if (items.length === 0) return null

        return (
          <div key={section.label}>
            <p className="px-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              {section.label}
            </p>
            <ul className="mt-1.5 space-y-0.5">
              {items.map((item) => {
                const active = isActivePath(pathname, item.href)
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={onNavigate}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors",
                        active
                          ? "bg-accent font-medium text-accent-foreground"
                          : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
                      )}
                    >
                      <item.icon className="h-4 w-4 shrink-0" />
                      {item.label}
                    </Link>
                  </li>
                )
              })}
            </ul>
          </div>
        )
      })}

      <div>
        <ul className="space-y-0.5 border-t pt-4">
          {SECONDARY_NAV.map((item) => {
            const active = isActivePath(pathname, item.href)
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  onClick={onNavigate}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors",
                    active
                      ? "bg-accent font-medium text-accent-foreground"
                      : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
                  )}
                >
                  <item.icon className="h-4 w-4 shrink-0" />
                  {item.label}
                </Link>
              </li>
            )
          })}
        </ul>
      </div>
    </nav>
  )
}

function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  const options = [
    { value: "light", label: "Light", icon: Sun },
    { value: "dark", label: "Dark", icon: Moon },
    { value: "system", label: "System", icon: Monitor },
  ] as const

  const current = options.find((option) => option.value === theme) ?? options[2]
  const Icon = mounted ? current.icon : Monitor

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Change theme">
          <Icon className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {options.map((option) => (
          <DropdownMenuItem key={option.value} onSelect={() => setTheme(option.value)}>
            <option.icon className="h-3.5 w-3.5" />
            {option.label}
            {mounted && theme === option.value ? (
              <Check className="ml-auto h-3.5 w-3.5" />
            ) : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function UserMenu({ session }: { session: Session }) {
  const { signOut } = useAuthActions()
  const router = useRouter()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="h-auto w-full justify-start gap-2 px-2 py-2">
          <Avatar className="h-7 w-7">
            <AvatarImage src={session.user.image} alt="" />
            <AvatarFallback className="text-[10px]">
              {initials(session.user.name || session.user.email)}
            </AvatarFallback>
          </Avatar>
          <span className="min-w-0 flex-1 text-left">
            <span className="block truncate text-sm font-medium">
              {session.user.name || "Your account"}
            </span>
            <span className="block truncate text-xs text-muted-foreground">
              {session.user.email}
            </span>
          </span>
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuItem onSelect={() => router.push("/dashboard/settings")}>
          <User className="h-3.5 w-3.5" />
          Profile & settings
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={async () => {
            await signOut()
            router.push("/login")
          }}
        >
          <LogOut className="h-3.5 w-3.5" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function CaptureButton({ className }: { className?: string }) {
  const capture = useCapture()
  const haptics = useHaptics()

  return (
    <Button
      className={className}
      onClick={() => {
        haptics("medium")
        capture.open()
      }}
    >
      <Plus className="h-4 w-4" />
      Add receipt
    </Button>
  )
}

function MobileCaptureFab() {
  const capture = useCapture()
  const haptics = useHaptics()

  return (
    <button
      type="button"
      onClick={() => {
        haptics("medium")
        capture.open()
      }}
      aria-label="Add receipt"
      className="flex h-14 w-14 -translate-y-4 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/25 transition-transform active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
    >
      <Plus className="h-6 w-6" />
    </button>
  )
}

function ShellChrome({ session, children }: { session: Session; children: ReactNode }) {
  const pathname = usePathname()
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault()
        setPaletteOpen((open) => !open)
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [])

  const role = session.role ?? "viewer"
  const capabilities = {
    "member.manage": ["owner", "admin"].includes(role),
    "workspace.billing": role === "owner",
  }

  return (
    <div className="flex min-h-dvh flex-col lg:flex-row">
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r bg-card lg:flex">
        <div className="border-b p-3">
          <div className="px-2 pb-3 pt-1">
            <Brand />
          </div>
          <WorkspaceSwitcher session={session} />
        </div>

        <div className="flex-1 overflow-y-auto p-3">
          <NavLinks session={session} />
        </div>

        <div className="border-t p-3">
          <UserMenu session={session} />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/75 sm:px-6">
          <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Open menu">
                <Menu className="h-4 w-4" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-[17rem] p-0">
              <SheetTitle className="sr-only">Navigation</SheetTitle>
              <div className="border-b p-3">
                <div className="px-2 pb-3 pt-1">
                  <Brand />
                </div>
                <WorkspaceSwitcher session={session} />
              </div>
              <div className="flex-1 overflow-y-auto p-3">
                <NavLinks session={session} onNavigate={() => setMenuOpen(false)} />
              </div>
              <div className="border-t p-3">
                <UserMenu session={session} />
              </div>
            </SheetContent>
          </Sheet>

          <div className="lg:hidden">
            <Brand />
          </div>

          <button
            type="button"
            onClick={() => setPaletteOpen(true)}
            className="ml-auto hidden h-9 w-full max-w-sm items-center gap-2 rounded-lg border bg-muted/40 px-3 text-sm text-muted-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:ml-0 lg:flex"
          >
            <Search className="h-3.5 w-3.5" />
            <span className="flex-1 text-left">Search receipts…</span>
            <kbd className="rounded border bg-background px-1.5 py-0.5 font-mono text-[10px]">
              ⌘K
            </kbd>
          </button>

          <div className="ml-auto flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden"
              onClick={() => setPaletteOpen(true)}
              aria-label="Search"
            >
              <Search className="h-4 w-4" />
            </Button>
            <ThemeToggle />
            <NotificationsMenu unreadCount={session.unreadNotifications} />
            <CaptureButton className="ml-1 hidden sm:inline-flex" />
          </div>
        </header>

        <main
          id="main"
          className="flex-1 px-4 pb-28 pt-6 sm:px-6 lg:pb-10"
          key={pathname}
        >
          <div className="mx-auto w-full max-w-7xl">{children}</div>
        </main>
      </div>

      {/* Mobile bottom navigation */}
      <nav
        aria-label="Primary"
        className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur supports-[backdrop-filter]:bg-background/85 lg:hidden"
      >
        <ul className="grid grid-cols-5 items-center">
          {MOBILE_NAV.slice(0, 2).map((item) => (
            <MobileNavItem key={item.href} item={item} pathname={pathname} />
          ))}
          <li className="flex justify-center">
            <MobileCaptureFab />
          </li>
          {MOBILE_NAV.slice(2).map((item) => (
            <MobileNavItem key={item.href} item={item} pathname={pathname} />
          ))}
        </ul>
      </nav>

      <CommandPalette
        open={paletteOpen}
        onOpenChange={setPaletteOpen}
        capabilities={capabilities}
      />
    </div>
  )
}

function MobileNavItem({
  item,
  pathname,
}: {
  item: (typeof MOBILE_NAV)[number]
  pathname: string
}) {
  const active = isActivePath(pathname, item.href)

  return (
    <li>
      <Link
        href={item.href}
        aria-current={active ? "page" : undefined}
        className={cn(
          "flex flex-col items-center gap-0.5 py-2.5 text-[11px] transition-colors",
          active ? "text-primary" : "text-muted-foreground",
        )}
      >
        <item.icon className="h-5 w-5" />
        {item.label}
      </Link>
    </li>
  )
}

function ShellSkeleton() {
  return (
    <div className="flex min-h-dvh">
      <div className="hidden w-64 shrink-0 border-r p-3 lg:block">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="mt-4 h-12 w-full" />
        <div className="mt-6 space-y-2">
          {Array.from({ length: 9 }, (_, index) => (
            <Skeleton key={index} className="h-8 w-full" />
          ))}
        </div>
      </div>
      <div className="flex-1">
        <div className="h-14 border-b" />
        <div className="space-y-4 p-6">
          <Skeleton className="h-8 w-56" />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }, (_, index) => (
              <Skeleton key={index} className="h-28 rounded-xl" />
            ))}
          </div>
          <Skeleton className="h-72 rounded-xl" />
        </div>
      </div>
    </div>
  )
}

export function AppShell({ children }: { children: ReactNode }) {
  const session = useQuery(api.users.me)

  if (session === undefined) return <ShellSkeleton />

  if (session === null || !session.activeWorkspace) {
    // Middleware guards the route; this only shows during a sign-out transition.
    return <ShellSkeleton />
  }

  return (
    <AskProvider>
      <CaptureProvider>
        <ShellChrome session={session}>{children}</ShellChrome>
      </CaptureProvider>
    </AskProvider>
  )
}
