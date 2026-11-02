'use client'

import { useEffect, useRef, useState } from 'react'
import { Check, Pencil, X } from 'lucide-react'

const MAX_TITLE_LENGTH = 180

export function TaskTitleEditor({ title, onSave, editSignal = 0, onDirtyChange }: { title: string; onSave: (title: string) => Promise<unknown> | void; editSignal?: number; onDirtyChange?: (dirty: boolean) => void }) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(title)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const savingRef = useRef(false)

  useEffect(() => { if (!editing) setValue(title) }, [title, editing])
  useEffect(() => { if (editing) { inputRef.current?.focus(); inputRef.current?.select() } }, [editing])
  useEffect(() => { if (editSignal > 0) setEditing(true) }, [editSignal])
  useEffect(() => { onDirtyChange?.(editing && value.trim() !== title) }, [editing, onDirtyChange, title, value])

  const cancel = () => { setValue(title); setError(null); setEditing(false) }
  const save = async () => {
    if (savingRef.current) return
    const next = value.trim()
    if (!next) { setError('Task title cannot be empty.'); return }
    if (next.length > MAX_TITLE_LENGTH) { setError(`Keep the title under ${MAX_TITLE_LENGTH} characters.`); return }
    if (next === title) { setEditing(false); setError(null); return }
    savingRef.current = true
    try { await onSave(next); setEditing(false); setError(null) } finally { savingRef.current = false }
  }

  if (!editing) return <button type="button" onClick={() => setEditing(true)} className="group flex max-w-full items-start gap-2 rounded-lg text-left focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]" aria-label="Edit task title"><h1 className="break-words text-2xl font-semibold leading-tight tracking-[-.025em] text-[var(--foreground)] sm:text-[26px]">{title}</h1><Pencil size={14} className="mt-2 shrink-0 text-[var(--muted-foreground)] opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100" /></button>

  return <div><div className="flex items-start gap-2"><textarea ref={inputRef} value={value} maxLength={MAX_TITLE_LENGTH + 1} rows={Math.max(1, Math.min(3, Math.ceil(value.length / 55)))} onChange={(event) => { setValue(event.target.value); setError(null) }} onBlur={() => void save()} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void save() } else if (event.key === 'Escape') { event.preventDefault(); cancel() } }} className="min-h-11 flex-1 resize-none rounded-lg border border-[var(--primary)] bg-[var(--surface)] px-3 py-2 text-2xl font-semibold leading-tight tracking-[-.025em] text-[var(--foreground)] outline-none ring-2 ring-[var(--focus-ring)]" aria-invalid={!!error}/><div className="flex gap-1 pt-1"><button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => void save()} className="grid h-8 w-8 place-items-center rounded-md bg-[var(--primary)] text-white" aria-label="Save title"><Check size={15}/></button><button type="button" onMouseDown={(event) => event.preventDefault()} onClick={cancel} className="grid h-8 w-8 place-items-center rounded-md text-[var(--muted-foreground)] hover:bg-[var(--surface-muted)]" aria-label="Cancel title editing"><X size={15}/></button></div></div>{error && <p role="alert" className="mt-1 text-xs text-[var(--danger)]">{error}</p>}</div>
}
