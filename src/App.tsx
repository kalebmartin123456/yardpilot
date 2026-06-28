import type { Session } from '@supabase/supabase-js'
import {
  ArrowRight,
  CalendarClock,
  CalendarPlus,
  Check,
  ClipboardList,
  Copy,
  CreditCard,
  Database,
  DollarSign,
  Link2,
  LockKeyhole,
  LogOut,
  Mail,
  MessageSquareText,
  Send,
  Sparkles,
  UserRound,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import './App.css'
import type { Database as SupabaseDatabase } from './lib/database.types'
import { hasSupabaseConfig, supabase } from './lib/supabase'

type LeadStatus = 'New' | 'Quoted' | 'Followed up' | 'Won'
type PlanKey = 'solo' | 'pro' | 'crew'
type PersistenceMode = 'Browser demo' | 'Supabase live' | 'Supabase unavailable'
type QuoteLeadRow = SupabaseDatabase['public']['Tables']['public_quote_leads']['Row']
type ProfileRow = SupabaseDatabase['public']['Tables']['profiles']['Row']

type Lead = {
  id: string
  name: string
  service: string
  property: string
  timeline: string
  budget: string
  notes: string
  status: LeadStatus
}

type LeadForm = {
  name: string
  service: string
  property: string
  timeline: string
  budget: string
  notes: string
}

type ProfileForm = {
  businessName: string
  businessSlug: string
}

const storageKey = 'yardpilot-leads'
const fallbackBusinessSlug = 'greenstack'

const servicePrices: Record<string, number> = {
  'Weekly mowing': 55,
  'Spring cleanup': 375,
  'Mulch install': 780,
  'Aeration and overseeding': 240,
  'Small landscape install': 1250,
}

const emptyLeadForm: LeadForm = {
  name: '',
  service: 'Spring cleanup',
  property: '',
  timeline: '',
  budget: '',
  notes: '',
}

const starterLeads: Lead[] = [
  {
    id: 'starter-1',
    name: 'Maya Chen',
    service: 'Spring cleanup',
    property: '0.25 acre corner lot',
    timeline: 'This weekend',
    budget: '$450',
    notes: 'Leaf cleanup, bed edging, first mow, and haul-away after winter.',
    status: 'Quoted',
  },
  {
    id: 'starter-2',
    name: 'Jordan Price',
    service: 'Weekly mowing',
    property: 'Small front and back yard',
    timeline: 'Friday afternoon',
    budget: '$55/visit',
    notes: 'Wants recurring mowing, trimming, and cleanup around fence line.',
    status: 'New',
  },
  {
    id: 'starter-3',
    name: 'Ari Lopez',
    service: 'Mulch install',
    property: 'Six front-yard beds',
    timeline: 'Next week',
    budget: '$900',
    notes: 'Needs weed barrier refresh, dark brown mulch, and clean bed edges.',
    status: 'Followed up',
  },
]

const emptySelectedLead: Lead = {
  id: 'empty',
  name: 'New lead',
  service: 'Spring cleanup',
  property: 'No property selected yet',
  timeline: 'Flexible',
  budget: 'Not provided',
  notes: 'Share your quote page or add a lead to start.',
  status: 'New',
}

function estimateLead(lead: Pick<Lead, 'service' | 'property' | 'notes'>) {
  const base = servicePrices[lead.service] ?? 225
  const largerProperty = /acre|corner|large|six|beds|slope|back yard|backyard/i.test(
    lead.property,
  )
  const complexityFee = /haul|leaf|weed|barrier|overgrown|edging|fence|cleanup/i.test(
    lead.notes,
  )

  return base + (largerProperty ? 125 : 0) + (complexityFee ? 95 : 0)
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 42)
}

function formatBusinessName(slug: string) {
  return `${slug
    .split('-')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ') || 'Greenstack'} Lawn Co.`
}

function getQuoteSlug() {
  const [, quotePath] = window.location.pathname.split('/quote/')
  return slugify(quotePath?.split('/')[0] ?? fallbackBusinessSlug) || fallbackBusinessSlug
}

function formatSubscriptionStatus(status?: string | null) {
  if (status === 'pro_active' || status === 'active' || status === 'trialing') {
    return 'Pro active'
  }

  if (status === 'past_due') {
    return 'Past due'
  }

  if (status === 'inactive' || status === 'canceled' || status === 'unpaid') {
    return 'Inactive'
  }

  return 'Trial'
}

function readStoredLeads() {
  if (typeof window === 'undefined') {
    return starterLeads
  }

  try {
    const saved = window.localStorage.getItem(storageKey)
    if (!saved) {
      return starterLeads
    }

    const parsed = JSON.parse(saved) as Lead[]
    const normalized = parsed.map((lead) => ({ ...lead, id: String(lead.id) }))
    return normalized.length > 0 ? normalized : starterLeads
  } catch {
    return starterLeads
  }
}

function saveStoredLeads(nextLeads: Lead[]) {
  window.localStorage.setItem(storageKey, JSON.stringify(nextLeads))
}

function mapQuoteLeadRow(row: QuoteLeadRow): Lead {
  return {
    id: row.id,
    name: row.customer_name,
    service: row.service,
    property: row.property_details,
    timeline: row.timeline,
    budget: row.budget ?? 'Not provided',
    notes: row.notes ?? 'No extra notes yet.',
    status: row.status === 'Lost' ? 'New' : row.status,
  }
}

async function loadSupabaseLeads(businessSlug: string) {
  if (!supabase) {
    return null
  }

  const { data, error } = await supabase
    .from('public_quote_leads')
    .select('*')
    .eq('business_slug', businessSlug)
    .order('created_at', { ascending: false })

  if (error) {
    throw error
  }

  return data.map(mapQuoteLeadRow)
}

async function createSupabaseLead(lead: Lead, businessSlug: string, returnSavedLead = false) {
  if (!supabase) {
    return null
  }

  const insertPayload = {
    business_slug: businessSlug,
    customer_name: lead.name,
    service: lead.service,
    property_details: lead.property,
    timeline: lead.timeline,
    budget: lead.budget,
    notes: lead.notes,
    quoted_price: estimateLead(lead),
    status: lead.status,
  }

  if (returnSavedLead) {
    const { data, error } = await supabase
      .from('public_quote_leads')
      .insert(insertPayload)
      .select()
      .single()

    if (error) {
      throw error
    }

    return mapQuoteLeadRow(data)
  }

  const { error } = await supabase.from('public_quote_leads').insert(insertPayload)

  if (error) {
    throw error
  }

  return lead
}

async function updateSupabaseLeadStatus(id: string, businessSlug: string, status: LeadStatus) {
  if (!supabase || id.startsWith('starter-') || id.startsWith('local-') || id === 'empty') {
    return
  }

  const { error } = await supabase
    .from('public_quote_leads')
    .update({ status })
    .eq('id', id)
    .eq('business_slug', businessSlug)

  if (error) {
    throw error
  }
}

async function loadOrCreateProfile(session: Session) {
  if (!supabase) {
    return null
  }

  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', session.user.id)
    .maybeSingle()

  if (error) {
    throw error
  }

  if (data) {
    return data
  }

  const emailName = session.user.email?.split('@')[0] ?? 'operator'
  const fallbackSlug = `${slugify(emailName) || 'operator'}-${session.user.id.slice(0, 6)}`
  const { data: createdProfile, error: createError } = await supabase
    .from('profiles')
    .insert({
      id: session.user.id,
      business_name: formatBusinessName(fallbackSlug),
      business_slug: fallbackSlug,
    })
    .select()
    .single()

  if (createError) {
    throw createError
  }

  return createdProfile
}

function App() {
  const isQuotePage = window.location.pathname.startsWith('/quote')

  if (isQuotePage) {
    return <QuoteRequestPage />
  }

  return <OperatorApp />
}

function OperatorApp() {
  const [session, setSession] = useState<Session | null | undefined>(
    hasSupabaseConfig ? undefined : null,
  )

  useEffect(() => {
    if (!supabase) {
      return
    }

    void supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
    })

    return () => {
      subscription.unsubscribe()
    }
  }, [])

  if (session === undefined) {
    return <LoadingScreen />
  }

  if (hasSupabaseConfig && !session) {
    return <AuthScreen />
  }

  return <OperatorDashboard session={session} />
}

function LoadingScreen() {
  return (
    <main className="auth-shell">
      <section className="auth-card compact">
        <span className="brand-mark">
          <Sparkles size={18} />
        </span>
        <p className="eyebrow">Loading workspace</p>
        <h1>Opening YardPilot.</h1>
      </section>
    </main>
  )
}

function AuthScreen() {
  const [mode, setMode] = useState<'signin' | 'signup'>('signup')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [businessName, setBusinessName] = useState('Greenstack Lawn Co.')
  const [message, setMessage] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function submitAuth() {
    if (!supabase || !email.trim() || password.length < 6) {
      setMessage('Use an email and a password with at least 6 characters.')
      return
    }

    setIsSubmitting(true)
    setMessage('')

    const slug = slugify(businessName) || slugify(email.split('@')[0]) || 'operator'
    const result =
      mode === 'signup'
        ? await supabase.auth.signUp({
            email,
            password,
            options: {
              data: {
                business_name: businessName,
                business_slug: slug,
              },
              emailRedirectTo: window.location.origin,
            },
          })
        : await supabase.auth.signInWithPassword({ email, password })

    setIsSubmitting(false)

    if (result.error) {
      setMessage(result.error.message)
      return
    }

    if (mode === 'signup' && !result.data.session) {
      setMessage('Account created. Check your email to confirm, then sign in here.')
      setMode('signin')
      return
    }

    setMessage('Signed in. Opening your workspace.')
  }

  return (
    <main className="auth-shell">
      <section className="auth-hero">
        <div className="brand">
          <span className="brand-mark">
            <Sparkles size={18} />
          </span>
          <span>YardPilot</span>
        </div>
        <p className="eyebrow">Operator login</p>
        <h1>One landscaper, one quote page, one private pipeline.</h1>
        <p>
          Create a workspace, share your quote link, and keep homeowner requests tied
          to your own business instead of a shared demo board.
        </p>
      </section>

      <section className="auth-card">
        <div className="auth-toggle" aria-label="Authentication mode">
          <button
            className={mode === 'signup' ? 'active' : ''}
            type="button"
            onClick={() => setMode('signup')}
          >
            Create account
          </button>
          <button
            className={mode === 'signin' ? 'active' : ''}
            type="button"
            onClick={() => setMode('signin')}
          >
            Sign in
          </button>
        </div>

        <div className="panel-title">
          <LockKeyhole size={18} />
          <h2>{mode === 'signup' ? 'Start your operator workspace' : 'Welcome back'}</h2>
        </div>

        <div className="form-grid single">
          {mode === 'signup' ? (
            <label>
              Business name
              <input
                value={businessName}
                onChange={(event) => setBusinessName(event.target.value)}
                placeholder="Greenstack Lawn Co."
              />
            </label>
          ) : null}
          <label>
            Email
            <input
              autoComplete="email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
            />
          </label>
          <label>
            Password
            <input
              autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="At least 6 characters"
            />
          </label>
        </div>

        {message ? <p className="auth-message">{message}</p> : null}

        <button
          className="primary-action full"
          type="button"
          onClick={submitAuth}
          disabled={isSubmitting}
        >
          {isSubmitting ? 'Working...' : mode === 'signup' ? 'Create workspace' : 'Sign in'}
          <ArrowRight size={18} />
        </button>
      </section>
    </main>
  )
}

function OperatorDashboard({ session }: { session: Session | null }) {
  const [leads, setLeads] = useState<Lead[]>(hasSupabaseConfig ? [] : readStoredLeads)
  const [selectedId, setSelectedId] = useState(() =>
    hasSupabaseConfig ? '' : readStoredLeads()[0]?.id ?? 'starter-1',
  )
  const [profile, setProfile] = useState<ProfileRow | null>(null)
  const [profileForm, setProfileForm] = useState<ProfileForm>({
    businessName: 'Greenstack Lawn Co.',
    businessSlug: fallbackBusinessSlug,
  })
  const [persistenceMode, setPersistenceMode] = useState<PersistenceMode>(
    hasSupabaseConfig ? 'Supabase live' : 'Browser demo',
  )
  const [subscriptionStatus, setSubscriptionStatus] = useState('Trial')
  const [calendarConnected, setCalendarConnected] = useState(false)
  const [bookingStatus, setBookingStatus] = useState('Ready to book once the customer accepts.')
  const [form, setForm] = useState<LeadForm>(emptyLeadForm)
  const [profileMessage, setProfileMessage] = useState('')
  const [checkoutMessage, setCheckoutMessage] = useState('')
  const [checkoutPlan, setCheckoutPlan] = useState<PlanKey | null>(null)

  const businessSlug = profile?.business_slug || profileForm.businessSlug || fallbackBusinessSlug
  const businessName = profile?.business_name || profileForm.businessName || formatBusinessName(businessSlug)
  const selectedLead = leads.find((lead) => lead.id === selectedId) ?? leads[0] ?? emptySelectedLead
  const estimatedPrice = useMemo(() => estimateLead(selectedLead), [selectedLead])
  const quotePageUrl = `${window.location.origin}/quote/${businessSlug}`
  const hasLeads = leads.length > 0

  const closeRate = leads.length
    ? Math.round((leads.filter((lead) => lead.status === 'Won').length / leads.length) * 100)
    : 0

  useEffect(() => {
    let ignore = false

    async function loadWorkspace() {
      if (!hasSupabaseConfig || !session) {
        return
      }

      try {
        const nextProfile = await loadOrCreateProfile(session)
        if (!nextProfile || ignore) {
          return
        }

        setProfile(nextProfile)
        setSubscriptionStatus(formatSubscriptionStatus(nextProfile.subscription_status))
        const loadedSlug = nextProfile.business_slug ?? fallbackBusinessSlug
        setProfileForm({
          businessName: nextProfile.business_name ?? formatBusinessName(loadedSlug),
          businessSlug: loadedSlug,
        })

        const remoteLeads = await loadSupabaseLeads(loadedSlug)
        if (!ignore && remoteLeads) {
          setLeads(remoteLeads)
          setSelectedId(remoteLeads[0]?.id ?? '')
          setPersistenceMode('Supabase live')
        }
      } catch {
        if (!ignore) {
          setPersistenceMode('Supabase unavailable')
        }
      }
    }

    void loadWorkspace()

    return () => {
      ignore = true
    }
  }, [session])

  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search)
    if (searchParams.get('checkout') === 'square-success') {
      setCheckoutMessage('Square checkout finished. The workspace will update after the webhook lands.')
      window.history.replaceState({}, '', window.location.pathname)
    }

    if (searchParams.get('checkout') === 'cancelled') {
      setCheckoutMessage('Checkout was cancelled. You can start again whenever you are ready.')
      window.history.replaceState({}, '', window.location.pathname)
    }
  }, [])

  function updateLeads(nextLeads: Lead[]) {
    setLeads(nextLeads)
    saveStoredLeads(nextLeads)
  }

  async function createLead() {
    if (!form.name.trim() || !form.property.trim()) {
      return
    }

    const nextLead: Lead = {
      id: `local-${Date.now()}`,
      name: form.name,
      service: form.service,
      property: form.property,
      timeline: form.timeline || 'Flexible',
      budget: form.budget || 'Not provided',
      notes: form.notes || 'No extra notes yet.',
      status: 'New',
    }

    try {
      const remoteLead = await createSupabaseLead(nextLead, businessSlug, true)
      const savedLead = remoteLead ?? nextLead
      updateLeads([savedLead, ...leads])
      setSelectedId(savedLead.id)
      setPersistenceMode(remoteLead ? 'Supabase live' : 'Browser demo')
    } catch {
      updateLeads([nextLead, ...leads])
      setSelectedId(nextLead.id)
      setPersistenceMode('Supabase unavailable')
    }

    setForm(emptyLeadForm)
  }

  async function saveProfile() {
    if (!supabase || !session) {
      return
    }

    const cleanSlug = slugify(profileForm.businessSlug || profileForm.businessName)
    if (!cleanSlug) {
      setProfileMessage('Pick a simple quote page slug first.')
      return
    }

    const { data, error } = await supabase
      .from('profiles')
      .update({
        business_name: profileForm.businessName || formatBusinessName(cleanSlug),
        business_slug: cleanSlug,
      })
      .eq('id', session.user.id)
      .select()
      .single()

    if (error) {
      setProfileMessage(error.message)
      return
    }

    setProfile(data)
    setSubscriptionStatus(formatSubscriptionStatus(data.subscription_status))
    const savedSlug = data.business_slug ?? cleanSlug
    setProfileForm({
      businessName: data.business_name ?? formatBusinessName(savedSlug),
      businessSlug: savedSlug,
    })
    setProfileMessage('Workspace saved.')
  }

  async function copyQuoteLink() {
    await navigator.clipboard.writeText(quotePageUrl)
    setProfileMessage('Quote link copied.')
  }

  async function markQuoted() {
    if (!hasLeads) {
      return
    }

    await updateSupabaseLeadStatus(selectedLead.id, businessSlug, 'Quoted').catch(() => {
      setPersistenceMode('Supabase unavailable')
    })
    updateLeads(
      leads.map((lead) =>
        lead.id === selectedLead.id ? { ...lead, status: 'Quoted' } : lead,
      ),
    )
  }

  async function startCheckout(plan: PlanKey) {
    if (!session) {
      setCheckoutMessage('Sign in before starting checkout.')
      return
    }

    setCheckoutPlan(plan)
    setCheckoutMessage('')

    try {
      const response = await fetch('/api/create-square-checkout', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ plan }),
      })
      const data = (await response.json()) as { url?: string; error?: string }

      if (!response.ok || !data.url) {
        throw new Error(data.error ?? 'Square checkout is unavailable.')
      }

      window.location.href = data.url
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Square checkout is unavailable.'
      setCheckoutMessage(message)
    } finally {
      setCheckoutPlan(null)
    }
  }

  function connectCalendar() {
    setCalendarConnected(true)
  }

  async function bookLead() {
    if (!hasLeads) {
      setBookingStatus('Add or receive a lead before booking.')
      return
    }

    if (!calendarConnected) {
      setBookingStatus('Connect Google Calendar before creating a booking event.')
      return
    }

    await updateSupabaseLeadStatus(selectedLead.id, businessSlug, 'Won').catch(() => {
      setPersistenceMode('Supabase unavailable')
    })
    updateLeads(
      leads.map((lead) =>
        lead.id === selectedLead.id ? { ...lead, status: 'Won' } : lead,
      ),
    )
    setBookingStatus(
      `${selectedLead.name} is booked for ${selectedLead.timeline.toLowerCase()} on Google Calendar.`,
    )
  }

  async function signOut() {
    await supabase?.auth.signOut()
  }

  const proposal = hasLeads
    ? `Hi ${selectedLead.name}, thanks for reaching out. Based on your ${selectedLead.property} and the requested ${selectedLead.service.toLowerCase()}, I recommend starting at $${estimatedPrice}. This includes site prep, the core yard work, cleanup, and a final walkthrough. I can target ${selectedLead.timeline.toLowerCase()} if the slot is still open.`
    : 'Share your quote page or add a lead manually. YardPilot will draft the estimate and follow-up once a homeowner request lands here.'

  const followUp = hasLeads
    ? `Hi ${selectedLead.name}, just checking in on the ${selectedLead.service.toLowerCase()} quote for your property. I still have a couple of openings around ${selectedLead.timeline.toLowerCase()}, and I can get you on the schedule today if the $${estimatedPrice} estimate works for you.`
    : 'No follow-up needed yet. New leads will appear in this private pipeline.'

  return (
    <main className="shell">
      <nav className="topbar" aria-label="Main navigation">
        <div className="brand">
          <span className="brand-mark">
            <Sparkles size={18} />
          </span>
          <span>YardPilot</span>
        </div>
        <div className="nav-links">
          <a href="#workspace">Workspace</a>
          <a href="#pricing">Pricing</a>
          <a href="#launch">Launch</a>
          <a href={quotePageUrl}>Quote page</a>
        </div>
        {session ? (
          <button className="icon-button" type="button" aria-label="Sign out" onClick={signOut}>
            <LogOut size={18} />
          </button>
        ) : (
          <button className="icon-button" type="button" aria-label="Send proposal">
            <Send size={18} />
          </button>
        )}
      </nav>

      <section className="hero-section">
        <div className="hero-copy">
          <p className="eyebrow">Quote-to-booking pages for landscapers</p>
          <h1>Turn yard requests into booked jobs.</h1>
          <p>
            YardPilot gives solo landscapers a self-serve quote page, instant
            estimate drafts, follow-up copy, payment status, and calendar booking
            without forcing them into a heavy CRM.
          </p>
          <div className="hero-actions">
            <a className="primary-action" href={quotePageUrl}>
              Open quote page
              <ArrowRight size={18} />
            </a>
            <a className="secondary-action" href="#workspace">
              Try operator view
            </a>
          </div>
        </div>
        <div className="hero-visual" aria-label="YardPilot quote preview">
          <div className="phone-frame">
            <div className="phone-header">
              <span></span>
              <strong>New lead</strong>
              <span></span>
            </div>
            <div className="message incoming">
              Hey, can you do a spring cleanup and mulch quote this weekend?
            </div>
            <div className="message outgoing">
              Absolutely. Based on your lot and beds, the estimate starts at
              $595. I can send a booking link now.
            </div>
            <div className="phone-metrics">
              <span>2 min reply</span>
              <span>Booking ready</span>
            </div>
          </div>
        </div>
      </section>

      <section className="workspace" id="workspace">
        <div className="section-heading">
          <p className="eyebrow">Operator dashboard</p>
          <h2>The fastest path from homeowner interest to a scheduled yard job.</h2>
        </div>

        <div className="metric-grid">
          <Metric icon={<ClipboardList size={18} />} label="Active leads" value={leads.length.toString()} />
          <Metric icon={<DollarSign size={18} />} label="Selected quote" value={`$${estimatedPrice}`} />
          <Metric icon={<CalendarClock size={18} />} label="Fastest slot" value="Today" />
          <Metric icon={<Check size={18} />} label="Close rate" value={`${closeRate}%`} />
        </div>

        <section className="quote-link-panel" aria-label="Shareable quote page">
          <div>
            <p className="eyebrow">Private workspace</p>
            <h3>{businessName}</h3>
            <p>
              Submissions to <strong>/quote/{businessSlug}</strong> are captured into
              this dashboard. Storage mode: <strong>{persistenceMode}</strong>.
            </p>
          </div>
          <div className="quote-actions">
            <a className="primary-action" href={quotePageUrl}>
              Open quote page
              <ArrowRight size={18} />
            </a>
            <button className="secondary-action button" type="button" onClick={copyQuoteLink}>
              <Copy size={17} />
              Copy link
            </button>
          </div>
        </section>

        <section className="panel profile-panel" aria-label="Workspace settings">
          <div className="panel-title">
            <UserRound size={18} />
            <h3>Workspace settings</h3>
          </div>
          <div className="form-grid profile-grid">
            <label>
              Business name
              <input
                value={profileForm.businessName}
                onChange={(event) =>
                  setProfileForm({
                    ...profileForm,
                    businessName: event.target.value,
                    businessSlug: slugify(event.target.value) || profileForm.businessSlug,
                  })
                }
                placeholder="Greenstack Lawn Co."
              />
            </label>
            <label>
              Quote page slug
              <input
                value={profileForm.businessSlug}
                onChange={(event) =>
                  setProfileForm({ ...profileForm, businessSlug: slugify(event.target.value) })
                }
                placeholder="greenstack"
              />
            </label>
            <button className="secondary-action button" type="button" onClick={saveProfile}>
              Save workspace
            </button>
          </div>
          {profileMessage ? <p className="profile-message">{profileMessage}</p> : null}
        </section>

        <div className="app-grid">
          <section className="panel intake-panel" aria-labelledby="intake-title">
            <div className="panel-title">
              <UserRound size={18} />
              <h3 id="intake-title">Lead intake</h3>
            </div>
            <div className="form-grid">
              <LeadFields form={form} setForm={setForm} />
            </div>
            <button className="primary-action full" type="button" onClick={createLead}>
              Add lead
              <ArrowRight size={18} />
            </button>
          </section>

          <section className="panel pipeline-panel" aria-labelledby="pipeline-title">
            <div className="panel-title">
              <ClipboardList size={18} />
              <h3 id="pipeline-title">Pipeline</h3>
            </div>
            <div className="lead-list">
              {leads.length ? (
                leads.map((lead) => (
                  <button
                    className={`lead-row ${lead.id === selectedLead.id ? 'active' : ''}`}
                    key={lead.id}
                    onClick={() => setSelectedId(lead.id)}
                    type="button"
                  >
                    <span>
                      <strong>{lead.name}</strong>
                      <small>{lead.service}</small>
                    </span>
                    <em>{lead.status}</em>
                  </button>
                ))
              ) : (
                <div className="empty-state">
                  <strong>No leads yet</strong>
                  <p>Share your quote page or add the first homeowner manually.</p>
                </div>
              )}
            </div>
          </section>

          <section className="panel output-panel" aria-labelledby="proposal-title">
            <div className="panel-title">
              <Sparkles size={18} />
              <h3 id="proposal-title">Generated proposal</h3>
            </div>
            <div className="quote-summary">
              <span>{selectedLead.property}</span>
              <strong>${estimatedPrice}</strong>
            </div>
            <p className="generated-copy">{proposal}</p>
            <div className="copy-block">
              <div>
                <MessageSquareText size={17} />
                <strong>SMS follow-up</strong>
              </div>
              <p>{followUp}</p>
            </div>
            <div className="button-row">
              <button className="secondary-action button" type="button" disabled={!hasLeads}>
                <Mail size={17} />
                Email
              </button>
              <button
                className="primary-action button"
                type="button"
                onClick={markQuoted}
                disabled={!hasLeads}
              >
                Mark quoted
                <Check size={17} />
              </button>
            </div>
          </section>
        </div>
      </section>

      <section className="pricing-section" id="pricing">
        <div className="section-heading">
          <p className="eyebrow">Connected systems</p>
          <h2>Payments and booking become part of the same close flow.</h2>
        </div>
        <div className="integration-grid">
          <article className="integration-card">
            <div className="integration-icon">
              <Database size={20} />
            </div>
            <div>
              <h3>Supabase database</h3>
              <p>
                Stores accounts, leads, subscription state, calendar connections,
                bookings, and pricing rules behind row-level security.
              </p>
            </div>
            <strong>{persistenceMode}</strong>
            <button className="secondary-action full" type="button">
              Persist leads
            </button>
          </article>

          <article className="integration-card">
            <div className="integration-icon">
              <CreditCard size={20} />
            </div>
            <div>
              <h3>Square subscription</h3>
              <p>
                Use Square-hosted checkout for Solo, Pro, and Crew plans. Square handles
                payment, then sends a webhook when the workspace should activate.
              </p>
            </div>
            <strong>{subscriptionStatus}</strong>
            <button
              className="primary-action full"
              type="button"
              onClick={() => void startCheckout('pro')}
              disabled={checkoutPlan !== null}
            >
              Start Checkout
              <ArrowRight size={18} />
            </button>
          </article>

          <article className="integration-card">
            <div className="integration-icon">
              <Link2 size={20} />
            </div>
            <div>
              <h3>Google Calendar OAuth</h3>
              <p>
                Each operator connects their own Google account so YardPilot can create
                accepted jobs on their calendar with the customer and service details.
              </p>
            </div>
            <strong>{calendarConnected ? 'Connected' : 'Not connected'}</strong>
            <button className="secondary-action full" type="button" onClick={connectCalendar}>
              Connect calendar
            </button>
          </article>

          <article className="integration-card action-card">
            <div className="integration-icon">
              <CalendarPlus size={20} />
            </div>
            <div>
              <h3>Book selected lead</h3>
              <p>{bookingStatus}</p>
            </div>
            <div className="booking-preview">
              <span>{selectedLead.name}</span>
              <strong>{selectedLead.timeline}</strong>
            </div>
            <button className="primary-action full" type="button" onClick={bookLead}>
              Add booking
              <CalendarPlus size={18} />
            </button>
          </article>
        </div>

        <div className="section-heading">
          <p className="eyebrow">Simple pricing</p>
          <h2>A plan a small operator can say yes to.</h2>
        </div>
        {checkoutMessage ? <p className="checkout-message">{checkoutMessage}</p> : null}
        <div className="pricing-grid">
          <PricingCard
            name="Solo"
            plan="solo"
            price="$19"
            items={['25 leads/month', 'AI proposal drafts', 'SMS/email copy']}
            onStart={startCheckout}
            isLoading={checkoutPlan === 'solo'}
            isDisabled={checkoutPlan !== null}
          />
          <PricingCard
            name="Pro"
            plan="pro"
            price="$49"
            featured
            items={['Unlimited leads', 'Custom pricing rules', 'Follow-up sequences']}
            onStart={startCheckout}
            isLoading={checkoutPlan === 'pro'}
            isDisabled={checkoutPlan !== null}
          />
          <PricingCard
            name="Crew"
            plan="crew"
            price="$99"
            items={['Team inbox', 'Saved templates', 'Revenue reporting']}
            onStart={startCheckout}
            isLoading={checkoutPlan === 'crew'}
            isDisabled={checkoutPlan !== null}
          />
        </div>
      </section>

      <section className="launch-section" id="launch">
        <div>
          <p className="eyebrow">Next move</p>
          <h2>Launch with one niche, then widen.</h2>
          <p>
            Start with spring cleanup and mulch quotes for local landscapers, get ten
            operators using the booking flow, then expand into mowing, aeration, and installs.
          </p>
        </div>
        <ol>
          <li>Send the live quote page to one test homeowner.</li>
          <li>DM 100 local landscapers with a direct quote-page offer.</li>
          <li>Charge the first users after setup, not after perfection.</li>
        </ol>
      </section>
    </main>
  )
}

function QuoteRequestPage() {
  const quoteSlug = getQuoteSlug()
  const businessName = formatBusinessName(quoteSlug)
  const [form, setForm] = useState<LeadForm>(emptyLeadForm)
  const [submittedLead, setSubmittedLead] = useState<Lead | null>(null)
  const [persistenceMode, setPersistenceMode] = useState<PersistenceMode>(
    hasSupabaseConfig ? 'Supabase live' : 'Browser demo',
  )

  const previewPrice = estimateLead({
    service: form.service,
    property: form.property,
    notes: form.notes,
  })

  async function submitQuoteRequest() {
    if (!form.name.trim() || !form.property.trim()) {
      return
    }

    const nextLead: Lead = {
      id: `local-${Date.now()}`,
      name: form.name,
      service: form.service,
      property: form.property,
      timeline: form.timeline || 'Flexible',
      budget: form.budget || 'Not provided',
      notes: form.notes || 'No extra notes yet.',
      status: 'New',
    }

    try {
      const remoteLead = await createSupabaseLead(nextLead, quoteSlug)
      const savedLead = remoteLead ?? nextLead
      const savedLeads = [savedLead, ...readStoredLeads()]
      saveStoredLeads(savedLeads)
      setSubmittedLead(savedLead)
      setPersistenceMode(remoteLead ? 'Supabase live' : 'Browser demo')
    } catch {
      const savedLeads = [nextLead, ...readStoredLeads()]
      saveStoredLeads(savedLeads)
      setSubmittedLead(nextLead)
      setPersistenceMode('Supabase unavailable')
    }
  }

  return (
    <main className="quote-page">
      <section className="quote-hero">
        <div className="quote-brand">
          <span className="brand-mark">
            <Sparkles size={18} />
          </span>
          <span>{businessName}</span>
        </div>
        <div>
          <p className="eyebrow">Fast landscaping quotes</p>
          <h1>Tell us about your yard. Get a clean estimate fast.</h1>
          <p>
            Request mowing, cleanup, mulch, aeration, or a small install. Your
            request goes straight into YardPilot so the operator can quote and book it.
          </p>
        </div>
      </section>

      <section className="quote-form-wrap">
        <div className="quote-form-card">
          {submittedLead ? (
            <div className="success-state">
              <div className="success-icon">
                <Check size={26} />
              </div>
              <p className="eyebrow">Request received</p>
              <h2>Thanks, {submittedLead.name}.</h2>
              <p>
                Your {submittedLead.service.toLowerCase()} request is ready for review.
                A realistic starting estimate is ${estimateLead(submittedLead)}.
              </p>
              <p className="storage-note">Storage mode: {persistenceMode}</p>
            </div>
          ) : (
            <>
              <div className="panel-title">
                <ClipboardList size={18} />
                <h2>Quote request</h2>
              </div>
              <div className="form-grid">
                <LeadFields form={form} setForm={setForm} />
              </div>
              <button className="primary-action full" type="button" onClick={submitQuoteRequest}>
                Request quote
                <ArrowRight size={18} />
              </button>
            </>
          )}
        </div>

        <aside className="quote-estimate-card">
          <p className="eyebrow">Estimate preview</p>
          <strong>${previewPrice}</strong>
          <span>Starting estimate</span>
          <p>
            Final pricing depends on property access, debris volume, material choices,
            and confirmed measurements.
          </p>
        </aside>
      </section>
    </main>
  )
}

function LeadFields({
  form,
  setForm,
}: {
  form: LeadForm
  setForm: (form: LeadForm) => void
}) {
  return (
    <>
      <label>
        Customer
        <input
          value={form.name}
          onChange={(event) => setForm({ ...form, name: event.target.value })}
          placeholder="Sam Rivera"
        />
      </label>
      <label>
        Property
        <input
          value={form.property}
          onChange={(event) => setForm({ ...form, property: event.target.value })}
          placeholder="0.25 acre lot with 4 beds"
        />
      </label>
      <label>
        Service
        <select
          value={form.service}
          onChange={(event) => setForm({ ...form, service: event.target.value })}
        >
          {Object.keys(servicePrices).map((service) => (
            <option key={service}>{service}</option>
          ))}
        </select>
      </label>
      <label>
        Timeline
        <input
          value={form.timeline}
          onChange={(event) => setForm({ ...form, timeline: event.target.value })}
          placeholder="Tomorrow morning"
        />
      </label>
      <label>
        Budget
        <input
          value={form.budget}
          onChange={(event) => setForm({ ...form, budget: event.target.value })}
          placeholder="$450"
        />
      </label>
      <label className="wide">
        Notes
        <textarea
          value={form.notes}
          onChange={(event) => setForm({ ...form, notes: event.target.value })}
          placeholder="Leaf cleanup, edging, mulch color, gate access..."
        />
      </label>
    </>
  )
}

function Metric({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode
  label: string
  value: string
}) {
  return (
    <div className="metric-card">
      <span>{icon}</span>
      <small>{label}</small>
      <strong>{value}</strong>
    </div>
  )
}

function PricingCard({
  name,
  plan,
  price,
  items,
  onStart,
  isLoading,
  isDisabled,
  featured = false,
}: {
  name: string
  plan: PlanKey
  price: string
  items: string[]
  onStart: (plan: PlanKey) => Promise<void>
  isLoading: boolean
  isDisabled: boolean
  featured?: boolean
}) {
  return (
    <article className={`pricing-card ${featured ? 'featured' : ''}`}>
      <div>
        <h3>{name}</h3>
        <p>
          <strong>{price}</strong>
          <span>/mo</span>
        </p>
      </div>
      <ul>
        {items.map((item) => (
          <li key={item}>
            <Check size={16} />
            {item}
          </li>
        ))}
      </ul>
      <button
        className={featured ? 'primary-action full' : 'secondary-action full'}
        type="button"
        onClick={() => void onStart(plan)}
        disabled={isDisabled}
      >
        {isLoading ? 'Opening Checkout...' : 'Start'}
      </button>
    </article>
  )
}

export default App
