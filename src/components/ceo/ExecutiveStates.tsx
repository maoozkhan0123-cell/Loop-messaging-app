'use client'

import { AlertCircle, RefreshCw } from 'lucide-react'

export function ExecutiveLoading() { return <div className="grid gap-4 p-6 sm:grid-cols-2 xl:grid-cols-4">{Array.from({length:8},(_,i)=><div key={i} className="h-28 animate-pulse rounded-2xl bg-[var(--surface-muted)]"/>)}</div> }
export function ExecutiveError({ error, retry }: { error: Error; retry: () => void }) { return <div className="m-6 rounded-2xl border border-red-200 bg-red-50 p-8 text-center text-red-700"><AlertCircle className="mx-auto"/><h2 className="mt-3 font-bold">Executive data could not be loaded</h2><p className="mt-1 text-sm">{error.message}</p><button onClick={retry} className="mt-4 inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-bold text-white"><RefreshCw size={14}/>Retry</button></div> }
