"use client"

import { usePaginatedQuery, useMutation } from "convex/react"
import {
  AlertTriangle,
  Bell,
  CheckCheck,
  CircleCheck,
  MessageSquare,
  Receipt,
  Target,
  Trash2,
  UserPlus,
} from "lucide-react"
import Link from "next/link"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { ScrollArea } from "@/components/ui/scroll-area"
import { api } from "@/convex/_generated/api"
import { formatRelative } from "@/lib/format"
import { cn } from "@/lib/utils"

const ICONS: Record<string, typeof Bell> = {
  receipt_processed: Receipt,
  upload_failed: AlertTriangle,
  budget_exceeded: Target,
  approval: CircleCheck,
  comment: MessageSquare,
  member_joined: UserPlus,
  role_changed: UserPlus,
  ownership_transferred: UserPlus,
  tax_reminder: AlertTriangle,
}

export function NotificationsMenu({ unreadCount }: { unreadCount: number }) {
  const [isOpen, setIsOpen] = useState(false)
  const { results, status, loadMore } = usePaginatedQuery(
    api.notifications.list,
    {},
    { initialNumItems: 12 },
  )

  const markRead = useMutation(api.notifications.markRead)
  const markAllRead = useMutation(api.notifications.markAllRead)
  const remove = useMutation(api.notifications.remove)

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative"
          aria-label={
            unreadCount > 0 ? `Notifications, ${unreadCount} unread` : "Notifications"
          }
        >
          <Bell className="h-4 w-4" />
          {unreadCount > 0 ? (
            <span className="absolute right-1.5 top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold leading-none text-primary-foreground font-numeric">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          ) : null}
        </Button>
      </PopoverTrigger>

      <PopoverContent align="end" className="w-[min(22rem,calc(100vw-2rem))] p-0">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h2 className="text-sm font-semibold">Notifications</h2>
          {unreadCount > 0 ? (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              onClick={() => void markAllRead()}
            >
              <CheckCheck className="h-3.5 w-3.5" />
              Mark all read
            </Button>
          ) : null}
        </div>

        <ScrollArea className="max-h-[26rem]">
          {status === "LoadingFirstPage" ? (
            <p className="px-4 py-10 text-center text-sm text-muted-foreground">
              Loading…
            </p>
          ) : results.length === 0 ? (
            <div className="px-4 py-10 text-center">
              <Bell className="mx-auto h-6 w-6 text-muted-foreground" />
              <p className="mt-3 text-sm font-medium">You&rsquo;re all caught up</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Processing updates, budget alerts and approvals land here.
              </p>
            </div>
          ) : (
            <ul className="divide-y">
              {results.map((notification) => {
                const Icon = ICONS[notification.type] ?? Bell
                const unread = notification.readAt === undefined

                const body = (
                  <>
                    <span
                      className={cn(
                        "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
                        unread ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground",
                      )}
                    >
                      <Icon className="h-4 w-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-start justify-between gap-2">
                        <span
                          className={cn(
                            "text-sm leading-snug",
                            unread ? "font-semibold" : "font-medium",
                          )}
                        >
                          {notification.title}
                        </span>
                        <span className="shrink-0 text-[11px] text-muted-foreground">
                          {formatRelative(notification.createdAt)}
                        </span>
                      </span>
                      <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">
                        {notification.body}
                      </span>
                    </span>
                  </>
                )

                return (
                  <li key={notification._id} className="group relative">
                    {notification.link ? (
                      <Link
                        href={notification.link}
                        onClick={() => {
                          if (unread) void markRead({ notificationIds: [notification._id] })
                          setIsOpen(false)
                        }}
                        className="flex gap-3 px-4 py-3 transition-colors hover:bg-accent/60"
                      >
                        {body}
                      </Link>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          if (unread) void markRead({ notificationIds: [notification._id] })
                        }}
                        className="flex w-full gap-3 px-4 py-3 text-left transition-colors hover:bg-accent/60"
                      >
                        {body}
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => void remove({ notificationId: notification._id })}
                      className="absolute right-2 top-2 hidden rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring group-hover:block"
                      aria-label={`Dismiss "${notification.title}"`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </ScrollArea>

        {status === "CanLoadMore" ? (
          <div className="border-t p-2">
            <Button
              variant="ghost"
              size="sm"
              className="w-full text-xs"
              onClick={() => loadMore(12)}
            >
              Load older
            </Button>
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  )
}
