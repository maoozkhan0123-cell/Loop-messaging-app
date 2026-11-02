import { Hash, MessageSquareText, UsersRound } from 'lucide-react'

export default function MessagesPage() {
  return (
    <main className="flex h-full w-full items-center justify-center overflow-y-auto bg-[var(--app-bg)] p-6">
      <section className="w-full max-w-xl rounded-3xl border border-[var(--ui-border)] bg-[var(--surface-raised)] p-6 text-center shadow-sm sm:p-10">
        <span className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-[var(--primary-soft)] text-[var(--primary)]">
          <MessageSquareText size={30} aria-hidden="true" />
        </span>
        <h1 className="mt-5 text-2xl font-bold text-[var(--foreground)]">Messages</h1>
        <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[var(--muted-foreground)]">
          Select a teammate or channel from the workspace sidebar to open a conversation.
        </p>

        <div className="mt-7 grid gap-3 text-left sm:grid-cols-2">
          <div className="rounded-2xl border border-[var(--ui-border)] bg-[var(--surface-muted)] p-4">
            <UsersRound size={19} className="text-[var(--primary)]" aria-hidden="true" />
            <h2 className="mt-3 text-sm font-semibold text-[var(--foreground)]">Direct messages</h2>
            <p className="mt-1 text-xs leading-5 text-[var(--muted-foreground)]">
              Choose a teammate under Direct messages for a private conversation.
            </p>
          </div>
          <div className="rounded-2xl border border-[var(--ui-border)] bg-[var(--surface-muted)] p-4">
            <Hash size={19} className="text-[var(--primary)]" aria-hidden="true" />
            <h2 className="mt-3 text-sm font-semibold text-[var(--foreground)]">Channels</h2>
            <p className="mt-1 text-xs leading-5 text-[var(--muted-foreground)]">
              Open a channel to continue a shared team discussion.
            </p>
          </div>
        </div>
      </section>
    </main>
  )
}
