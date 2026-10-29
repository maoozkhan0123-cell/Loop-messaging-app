'use client'

import { useEffect, useRef, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import {
  Accessibility, Bell, Check, CheckCircle2, ChevronDown, Clock3,
  Home, Languages, Lock, MessageSquare, Navigation, Palette,
  Settings2, Video, X,
  Plug, Sparkles,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useNotifications } from '@/hooks/useNotifications'
import { usePreferences } from '@/hooks/usePreferences'
import type { Preferences } from '@/contexts/PreferencesProvider'

const tabs = [
  ['availability', 'Availability', Clock3], ['notifications', 'Notifications', Bell],
  ['navigation', 'Navigation', Navigation], ['home', 'Home', Home],
  ['appearance', 'Appearance', Palette], ['messages', 'Messages & media', MessageSquare],
  ['language', 'Language & region', Languages], ['accessibility', 'Accessibility', Accessibility],
  ['read', 'Mark as read', CheckCircle2], ['audio', 'Audio & video', Video],
  ['connected', 'Connected accounts', Plug], ['privacy', 'Privacy & visibility', Lock],
  ['ai', 'BySync AI', Sparkles], ['advanced', 'Advanced', Settings2],
] as const

export function PreferencesModal({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [active, setActive] = useState<(typeof tabs)[number][0]>('notifications')
  const { preferences: prefs, setPreference: set, resetPreferences } = usePreferences()
  const { enabled, permission, toggle } = useNotifications()
  const title = tabs.find(([id]) => id === active)?.[1] ?? 'Preferences'
  const contentRef = useRef<HTMLElement>(null)

  useEffect(() => {
    if (contentRef.current) contentRef.current.scrollTop = 0
  }, [active])

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[80] bg-black/60 data-[state=open]:animate-in data-[state=closed]:animate-out" />
        <Dialog.Content aria-describedby={undefined} className="preferences-modal fixed z-[81] inset-2 sm:inset-5 lg:inset-auto lg:left-1/2 lg:top-1/2 lg:-translate-x-1/2 lg:-translate-y-1/2 lg:w-[min(1000px,calc(100vw-40px))] lg:h-[min(875px,calc(100vh-40px))] overflow-hidden rounded-[12px] bg-[var(--surface)] text-[var(--foreground)] shadow-[0_18px_70px_rgba(0,0,0,.35)] flex flex-col outline-none">
          <header className="h-[96px] px-6 sm:px-9 flex items-center border-b border-[var(--ui-border)] shrink-0">
            <Dialog.Title className="text-[28px] font-bold tracking-[-.5px] text-[var(--foreground)]">Preferences</Dialog.Title>
            <Dialog.Close className="ml-auto p-2 rounded-md text-[var(--muted-foreground)] hover:bg-[var(--surface-muted)] hover:text-[var(--foreground)] transition-colors" aria-label="Close preferences"><X size={28} strokeWidth={1.7} /></Dialog.Close>
          </header>
          <div className="flex flex-1 min-h-0">
            <nav aria-label="Preference sections" className="w-[280px] shrink-0 px-5 py-5 overflow-y-auto hidden sm:block">
              {tabs.map(([id, label, Icon]) => (
                <button key={id} type="button" aria-current={active === id ? 'page' : undefined} onClick={() => setActive(id)} className={cn('w-full min-h-[40px] px-3 flex items-center gap-3 rounded-[6px] text-[16px] text-left transition-colors focus-visible:outline-offset-[-2px]', active === id ? 'bg-[var(--primary)] text-white font-medium' : 'text-[var(--foreground)] hover:bg-[var(--surface-muted)]')}>
                  <Icon size={18} strokeWidth={1.8} /><span>{label}</span>
                </button>
              ))}
            </nav>
            <main ref={contentRef} className="flex-1 min-w-0 overflow-y-auto">
              <div className="sm:hidden sticky top-0 z-10 bg-[var(--surface)] border-b border-[var(--ui-border)] p-3">
                <label className="relative block"><span className="sr-only">Preference section</span><select value={active} onChange={(e) => setActive(e.target.value as typeof active)} className="w-full appearance-none border border-[var(--ui-border)] rounded-lg h-11 px-3 pr-10 font-semibold bg-[var(--surface)] text-[var(--foreground)]">{tabs.map(([id, label]) => <option value={id} key={id}>{label}</option>)}</select><ChevronDown className="absolute right-3 top-3 pointer-events-none" size={18} /></label>
              </div>
              <div className="max-w-[690px] px-5 sm:px-8 lg:px-9 py-7 sm:py-8">
                <h2 className="text-[22px] font-bold text-[var(--foreground)] mb-1">{title}</h2>
                <Section active={active} prefs={prefs} set={set} resetPreferences={resetPreferences} enabled={enabled} permission={permission} toggleNotifications={toggle} />
              </div>
            </main>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

function Section({ active, prefs, set, resetPreferences, enabled, permission, toggleNotifications }: { active: string; prefs: Preferences; set: <K extends keyof Preferences>(k: K, v: Preferences[K]) => void; resetPreferences: () => void; enabled: boolean; permission: NotificationPermission | 'unsupported'; toggleNotifications: () => void }) {
  if (active === 'availability') return <><Intro>Choose how teammates see your availability.</Intro><Group title="Your status"><Radio name="availability" value="online" checked={prefs.availability === 'online'} onChange={() => set('availability', 'online')} label="Active" hint="You’re available and notifications arrive normally." /><Radio name="availability" value="away" checked={prefs.availability === 'away'} onChange={() => set('availability', 'away')} label="Away" hint="Let teammates know you may be slow to respond." /><Radio name="availability" value="offline" checked={prefs.availability === 'offline'} onChange={() => set('availability', 'offline')} label="Appear offline" /></Group></>
  if (active === 'notifications') return <><Intro>Choose what you get notified about, when you get notified and how notifications look and sound.</Intro><Group title="Notify me about"><Radio name="notify" checked={prefs.notificationLevel === 'all'} onChange={() => set('notificationLevel','all')} label="All new messages" /><Radio name="notify" checked={prefs.notificationLevel === 'mentions'} onChange={() => set('notificationLevel','mentions')} label="Direct messages, mentions & keywords" /><Radio name="notify" checked={prefs.notificationLevel === 'nothing'} onChange={() => set('notificationLevel','nothing')} label="Nothing" /><CheckOption checked={enabled} onChange={toggleNotifications} label="Enable desktop notifications" hint={permission === 'denied' ? 'Notifications are blocked in your browser settings.' : undefined} /></Group><Group title="Sound & appearance"><CheckOption checked={prefs.previewNotifications} onChange={(v) => set('previewNotifications',v)} label="Include a preview of the message in each notification" /><CheckOption checked={prefs.sound} onChange={(v) => set('sound', v)} label="Play a sound when I receive a notification" /><CheckOption checked={prefs.emailSummaries} onChange={(v) => set('emailSummaries',v)} label="Email me a summary" hint="Saved as a preference; server email delivery is not configured for summaries." /></Group><Group title="Quiet hours"><CheckOption checked={prefs.quietHoursEnabled} onChange={(v) => set('quietHoursEnabled',v)} label="Pause notifications on a schedule" />{prefs.quietHoursEnabled && <div className="grid grid-cols-2 gap-3"><label className="text-sm font-semibold">From<input type="time" value={prefs.quietHoursStart} onChange={(e) => set('quietHoursStart',e.target.value)} className="mt-2 block h-10 w-full rounded-md border px-3" /></label><label className="text-sm font-semibold">Until<input type="time" value={prefs.quietHoursEnd} onChange={(e) => set('quietHoursEnd',e.target.value)} className="mt-2 block h-10 w-full rounded-md border px-3" /></label></div>}<p className="text-xs text-[#6B6A6B]">Uses your device timezone.</p></Group></>
  if (active === 'navigation') return <><Intro>Customize how you move around your workspace.</Intro><Group title="Navigation"><Toggle checked={prefs.compactNav} onChange={(v) => set('compactNav', v)} label="Compact navigation" hint="Show more destinations in less space." /><Toggle checked={prefs.openLinksNewTab} onChange={(v) => set('openLinksNewTab', v)} label="Open links in a new tab" /></Group></>
  if (active === 'home') return <><Intro>Choose what appears on your home screen.</Intro><Group title="Home"><Toggle checked={prefs.homeRecents} onChange={(v) => set('homeRecents', v)} label="Show recent conversations" /><Toggle checked={prefs.onlineStatus} onChange={(v) => set('onlineStatus', v)} label="Show teammate activity" /></Group></>
  if (active === 'appearance') return <><Intro>Make BySync look and feel right for you. Changes apply immediately.</Intro><Group title="Color theme"><Choice value={prefs.theme} onChange={(v) => set('theme', v as Preferences['theme'])} options={[['system','System'],['light','Light'],['dark','Dark']]} /></Group><Group title="Accent color"><Choice value={prefs.accent} onChange={(v) => set('accent', v as Preferences['accent'])} options={[['violet','BySync Violet'],['slate','Slate'],['midnight','Midnight Blue'],['emerald','Emerald']]} /></Group><Group title="Message density"><Choice value={prefs.density} onChange={(v) => set('density', v as Preferences['density'])} options={[['comfortable','Comfortable'],['compact','Compact']]} /></Group><CheckOption checked={prefs.reducedMotion} onChange={(v) => set('reducedMotion',v)} label="Reduce motion" /></>
  if (active === 'messages') return <><Intro>Set how conversations and shared media behave.</Intro><Group title="Writing messages"><Toggle checked={prefs.enterToSend} onChange={(v) => set('enterToSend', v)} label="Press Enter to send" hint="Use Shift + Enter to add a new line." /><Toggle checked={prefs.spellcheck} onChange={(v) => set('spellcheck', v)} label="Check spelling while typing" /><CheckOption checked={prefs.markdownHelp} onChange={(v) => set('markdownHelp',v)} label="Show formatting controls and Markdown help" /></Group><Group title="Media"><Toggle checked={prefs.mediaPreview} onChange={(v) => set('mediaPreview', v)} label="Show inline image previews" /><Toggle checked={prefs.attachmentPreview} onChange={(v) => set('attachmentPreview',v)} label="Show attachment previews" /></Group></>
  if (active === 'language') return <><Intro>Choose your regional date and time format. English is currently the only translated interface.</Intro><Group title="Language"><Select value={prefs.language} onChange={() => {}} options={['English (US)']} /></Group><Group title="Time format"><Choice value={prefs.clock} onChange={(v) => set('clock',v as Preferences['clock'])} options={[['12','12-hour'],['24','24-hour']]} /></Group></>
  if (active === 'accessibility') return <><Intro>Adjust the display and motion for easier use.</Intro><Group title="Display"><Toggle checked={prefs.reducedMotion} onChange={(v) => set('reducedMotion', v)} label="Reduce motion" /><Toggle checked={prefs.highContrast} onChange={(v) => set('highContrast', v)} label="Increase contrast" /><label className="block mt-5 text-sm font-semibold">Zoom<Select value={prefs.zoom} onChange={(v) => set('zoom', v)} options={['80','90','100','110','125','150']} suffix="%" /></label></Group></>
  if (active === 'read') return <><Intro>Choose when a conversation is marked as read.</Intro><Group title="When I view a conversation"><Radio name="markRead" value="left-off" checked={prefs.markRead === 'left-off'} onChange={() => set('markRead','left-off')} label="Start where I left off and mark it read" /><Radio name="markRead" value="newest" checked={prefs.markRead === 'newest'} onChange={() => set('markRead','newest')} label="Start at the newest message and mark it read" /><Radio name="markRead" value="unread" checked={prefs.markRead === 'unread'} onChange={() => set('markRead','unread')} label="Start at the oldest unread message" /></Group><Toggle checked={prefs.confirmRead} onChange={(v) => set('confirmRead', v)} label="Confirm before marking everything as read" /></>
  if (active === 'audio') return <AudioVideoSection prefs={prefs} set={set} />
  if (active === 'privacy') return <><Intro>Control visibility and review security capabilities available for this account.</Intro><Group title="Visibility"><CheckOption checked={prefs.onlineStatus} onChange={(v) => set('onlineStatus', v)} label="Show when I’m active" /><CheckOption checked={prefs.readReceipts} onChange={(v) => set('readReceipts', v)} label="Send read receipts" /></Group><Group title="Security"><SecurityRow title="Two-factor authentication" description="Not available: the current authentication backend has no MFA enrollment flow." /><SecurityRow title="Active sessions" description="Session management and remote revocation require an authenticated server endpoint." /><SecurityRow title="Data export" description="A secure export endpoint has not been configured." /></Group></>
  if (active === 'connected') return <><Intro>You can connect your BySync account with other apps and services for faster sign-in and richer link previews.</Intro><Group title="Signed in with BySync"><div className="bg-[var(--surface-muted)] rounded-md px-5 py-4 text-[15px] text-[var(--muted-foreground)]">Apps you sign in to with BySync will appear here.</div></Group><Group title="Links and content from other apps"><CheckOption checked={prefs.openLinksNewTab} onChange={(v) => set('openLinksNewTab',v)} label="Allow BySync to connect with other apps" /><div className="bg-[var(--surface-muted)] rounded-md px-5 py-4 text-[15px] text-[var(--muted-foreground)]">No apps connected yet.</div></Group></>
  if (active === 'ai') return <><Intro>Choose how BySync AI helps you work and communicate.</Intro><Group title="AI assistance"><CheckOption checked={prefs.aiSuggestions} onChange={(v) => set('aiSuggestions',v)} label="Show writing suggestions" hint="Get optional suggestions while composing messages." /><CheckOption checked={prefs.previewNotifications} onChange={(v) => set('previewNotifications',v)} label="Summarize unread conversations" /></Group></>
  return <><Intro>Fine-tune advanced app behavior.</Intro><Group title="System"><Toggle checked={prefs.openLinksNewTab} onChange={(v) => set('openLinksNewTab', v)} label="Open external links in browser" /><button type="button" onClick={resetPreferences} className="mt-5 px-4 h-10 border border-[var(--ui-border)] rounded-lg font-semibold hover:bg-[var(--surface-muted)]">Reset preferences</button></Group></>
}

function Intro({ children }: { children: React.ReactNode }) { return <p className="text-[15px] leading-6 text-[var(--muted-foreground)] mb-7">{children}</p> }
function Group({ title, children }: { title: string; children: React.ReactNode }) { return <section className="border-t border-[var(--ui-border)] pt-6 mb-7"><h3 className="font-bold text-[16px] mb-4">{title}</h3><div className="space-y-4">{children}</div></section> }
function Toggle({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) { return <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)} className="flex w-full gap-3 text-left cursor-pointer group rounded-md"><span aria-hidden="true" className={cn('mt-0.5 w-10 h-[22px] rounded-full relative shrink-0 transition-colors', checked ? 'bg-[var(--primary)]' : 'bg-[#8D929B]')}><span className={cn('absolute top-[3px] w-4 h-4 rounded-full bg-white shadow transition-all', checked ? 'left-[21px]' : 'left-[3px]')} /></span><span><span className="block text-[15px] font-medium group-hover:text-[var(--primary)]">{label}</span>{hint && <span className="block text-[13px] mt-0.5 text-[var(--muted-foreground)]">{hint}</span>}</span></button> }
function CheckOption({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) { return <label className="flex items-start gap-3 cursor-pointer text-[15px] rounded-md"><input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-[2px] w-[17px] h-[17px] accent-[var(--primary)]" /><span><span className="block">{label}</span>{hint && <span className="block text-[13px] mt-1 text-[var(--danger)]">{hint}</span>}</span></label> }
function SecurityRow({ title, description }: { title: string; description: string }) { return <div className="flex items-start justify-between gap-4 rounded-lg border border-[var(--ui-border)] p-4 bg-[var(--surface-raised)]"><div><p className="text-[15px] font-semibold">{title}</p><p className="mt-1 text-[13px] leading-5 text-[var(--muted-foreground)]">{description}</p></div><button type="button" disabled className="shrink-0 rounded-md border border-[var(--ui-border)] px-3 py-1.5 text-xs font-semibold opacity-60">Unavailable</button></div> }
function Radio(props: React.InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string }) { const { label, hint, ...rest } = props; return <label className="flex items-start gap-3 cursor-pointer rounded-md"><input {...rest} type="radio" className="mt-1 accent-[var(--primary)] w-4 h-4" /><span><span className="block text-[15px]">{label}</span>{hint && <span className="block text-[13px] text-[var(--muted-foreground)] mt-0.5">{hint}</span>}</span></label> }
function Select({ value, onChange, options, suffix = '' }: { value: string; onChange: (v: string) => void; options: string[]; suffix?: string }) { return <div className="relative mt-2"><select value={value} onChange={(e) => onChange(e.target.value)} className="appearance-none w-full h-11 px-3 pr-10 rounded-lg border border-[var(--ui-border)] bg-[var(--surface)] text-[var(--foreground)] text-[15px] outline-none focus:border-[var(--primary)]">{options.map((x) => <option key={x} value={x}>{x}{suffix}</option>)}</select><ChevronDown size={18} className="absolute right-3 top-3 pointer-events-none" /></div> }
function Choice({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: string[][] }) { return <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">{options.map(([v,l]) => <button type="button" aria-pressed={value === v} key={v} onClick={() => onChange(v)} className={cn('min-h-12 px-3 rounded-lg border font-semibold flex items-center justify-center gap-2 transition-colors', value === v ? 'border-[var(--primary)] bg-[var(--primary-soft)] text-[var(--primary)]' : 'border-[var(--ui-border)] hover:bg-[var(--surface-muted)]')}>{value === v && <Check size={16} />}{l}</button>)}</div> }
function AudioVideoSection({ prefs, set }: { prefs: Preferences; set: <K extends keyof Preferences>(k: K, v: Preferences[K]) => void }) {
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([])
  const [permissionError, setPermissionError] = useState<string | null>(null)
  const [checking, setChecking] = useState(false)

  const requestDevices = async () => {
    if (!navigator.mediaDevices?.getUserMedia) { setPermissionError('Media devices are not supported in this browser.'); return }
    setChecking(true); setPermissionError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true })
      stream.getTracks().forEach((track) => track.stop())
      setDevices(await navigator.mediaDevices.enumerateDevices())
    } catch (error) {
      setPermissionError(error instanceof DOMException && error.name === 'NotAllowedError' ? 'Camera or microphone access was denied. Update site permissions to test devices.' : 'Could not access media devices.')
    } finally { setChecking(false) }
  }

  return <><Intro>Select the devices BySync should use for calls. Permission is requested only when you choose to check devices.</Intro><Group title="Devices"><MediaDeviceSelect devices={devices} label="Camera" kind="videoinput" value={prefs.camera} onChange={(value) => set('camera',value)} /><MediaDeviceSelect devices={devices} label="Microphone" kind="audioinput" value={prefs.microphone} onChange={(value) => set('microphone',value)} /><MediaDeviceSelect devices={devices} label="Speaker" kind="audiooutput" value={prefs.speaker} onChange={(value) => set('speaker',value)} /><button type="button" disabled={checking} onClick={() => void requestDevices()} className="h-10 px-4 rounded-md bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-white font-semibold disabled:opacity-60">{checking ? 'Checking…' : 'Check camera & microphone'}</button></Group>{permissionError ? <div role="alert" className="rounded-lg border border-red-300/40 bg-red-500/10 p-4 text-sm text-[var(--danger)]">{permissionError}</div> : <div className="rounded-lg bg-[var(--surface-muted)] p-4 text-sm text-[var(--muted-foreground)] flex gap-3"><Video size={19} className="text-[var(--primary)] shrink-0" />Browser support for selecting a speaker output varies by platform.</div>}</>
}

function MediaDeviceSelect({ devices, label, kind, value, onChange }: { devices: MediaDeviceInfo[]; label: string; kind: MediaDeviceKind; value: string; onChange: (value: string) => void }) {
  const options = ['default', ...devices.filter((device) => device.kind === kind).map((device) => device.deviceId)]
  const labelFor = (id: string) => id === 'default' ? 'System default' : devices.find((device) => device.deviceId === id && device.kind === kind)?.label || 'Device'
  return <label className="block text-sm font-semibold">{label}<div className="relative mt-2"><select value={value} onChange={(event) => onChange(event.target.value)} className="appearance-none w-full h-11 px-3 pr-10 rounded-lg border border-[var(--ui-border)] bg-[var(--surface)] text-[var(--foreground)] text-[15px]">{options.map((id) => <option key={id} value={id}>{labelFor(id)}</option>)}</select><ChevronDown size={18} className="absolute right-3 top-3 pointer-events-none" /></div></label>
}
