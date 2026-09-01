"use client"

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

/**
 * Replaces `window.confirm` and `window.prompt`.
 *
 * The native dialogs sit outside the app's focus management, cannot be styled
 * or tested, and are suppressed outright in some browsers and PWA contexts —
 * which meant a "Permanently delete this receipt?" guard could silently not
 * appear. These are ordinary dialogs that resolve a promise, so call sites read
 * the same as before.
 */

type ConfirmOptions = {
  title: string
  description?: string
  confirmLabel?: string
  cancelLabel?: string
  destructive?: boolean
}

type PromptOptions = ConfirmOptions & {
  label: string
  placeholder?: string
  defaultValue?: string
  /** Return a message to block submission, or null when the value is fine. */
  validate?: (value: string) => string | null
}

type Request =
  | { kind: "confirm"; options: ConfirmOptions }
  | { kind: "prompt"; options: PromptOptions }

type AskContextValue = {
  confirm: (options: ConfirmOptions) => Promise<boolean>
  prompt: (options: PromptOptions) => Promise<string | null>
}

const AskContext = createContext<AskContextValue | null>(null)

export function useAsk() {
  const context = useContext(AskContext)
  if (!context) throw new Error("useAsk must be used inside AskProvider")
  return context
}

/**
 * Imperative handle to the mounted dialog host, so a click handler deep in a
 * screen can await a confirmation without every component in between growing a
 * hook. Same shape as the `toast` singleton this app already uses.
 */
let host: AskContextValue | null = null

/** Returns true when the user confirmed. Falls back to allowing nothing. */
export async function confirmDialog(options: ConfirmOptions): Promise<boolean> {
  if (!host) return false
  return host.confirm(options)
}

/** Returns the trimmed value, or null when cancelled. */
export async function promptDialog(options: PromptOptions): Promise<string | null> {
  if (!host) return null
  return host.prompt(options)
}

export function AskProvider({ children }: { children: ReactNode }) {
  const [request, setRequest] = useState<Request | null>(null)
  const [value, setValue] = useState("")
  const [error, setError] = useState<string | null>(null)
  const resolverRef = useRef<((result: never) => void) | null>(null)

  const settle = useCallback((result: boolean | string | null) => {
    const resolve = resolverRef.current
    resolverRef.current = null
    setRequest(null)
    setError(null)
    setValue("")
    resolve?.(result as never)
  }, [])

  const confirm = useCallback((options: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve as (result: never) => void
      setRequest({ kind: "confirm", options })
    })
  }, [])

  const prompt = useCallback((options: PromptOptions) => {
    return new Promise<string | null>((resolve) => {
      resolverRef.current = resolve as (result: never) => void
      setValue(options.defaultValue ?? "")
      setRequest({ kind: "prompt", options })
    })
  }, [])

  const api = useMemo<AskContextValue>(() => ({ confirm, prompt }), [confirm, prompt])

  // Publish the handle for the imperative helpers above. One host is mounted,
  // inside the dashboard shell.
  useEffect(() => {
    host = api
    return () => {
      if (host === api) host = null
    }
  }, [api])

  const options = request?.options
  const isPrompt = request?.kind === "prompt"

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!request) return

    if (request.kind === "prompt") {
      const trimmed = value.trim()
      const message = request.options.validate?.(trimmed) ?? null
      if (message) {
        setError(message)
        return
      }
      settle(trimmed)
      return
    }

    settle(true)
  }

  return (
    <AskContext.Provider value={api}>
      {children}

      <Dialog
        open={request !== null}
        onOpenChange={(next) => {
          // Dismissing by Escape or backdrop is a cancel, never a confirm.
          if (!next) settle(isPrompt ? null : false)
        }}
      >
        <DialogContent className="sm:max-w-md">
          <form onSubmit={handleSubmit}>
            <DialogHeader className="text-left">
              <DialogTitle>{options?.title}</DialogTitle>
              {options?.description ? (
                <DialogDescription>{options.description}</DialogDescription>
              ) : null}
            </DialogHeader>

            {isPrompt ? (
              <div className="space-y-2 py-4">
                <Label htmlFor="ask-value">{request.options.label}</Label>
                <Input
                  id="ask-value"
                  autoFocus
                  value={value}
                  placeholder={request.options.placeholder}
                  onChange={(event) => {
                    setValue(event.target.value)
                    if (error) setError(null)
                  }}
                  aria-invalid={error ? true : undefined}
                  aria-describedby={error ? "ask-error" : undefined}
                />
                {error ? (
                  <p id="ask-error" role="alert" className="text-sm text-destructive">
                    {error}
                  </p>
                ) : null}
              </div>
            ) : (
              <div className="py-2" />
            )}

            <DialogFooter className="gap-2 sm:gap-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => settle(isPrompt ? null : false)}
              >
                {options?.cancelLabel ?? "Cancel"}
              </Button>
              <Button
                type="submit"
                variant={options?.destructive ? "destructive" : "default"}
              >
                {options?.confirmLabel ?? (isPrompt ? "Save" : "Confirm")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </AskContext.Provider>
  )
}
