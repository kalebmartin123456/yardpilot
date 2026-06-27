import {
  ArrowRight,
  CalendarPlus,
  CalendarClock,
  Check,
  ClipboardList,
  CreditCard,
  Database,
  DollarSign,
  Link2,
  Mail,
  MessageSquareText,
  Send,
  Sparkles,
  UserRound,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import './App.css'
import { hasSupabaseConfig } from './lib/supabase'

type LeadStatus = 'New' | 'Quoted' | 'Followed up' | 'Won'

type Lead = {
  id: number
  name: string
  service: string
  property: string
  timeline: string
  budget: string
  notes: string
  status: LeadStatus
}

const starterLeads: Lead[] = [
  {
    id: 1,
    name: 'Maya Chen',
    service: 'Spring cleanup',
    property: '0.25 acre corner lot',
    timeline: 'This weekend',
    budget: '$450',
    notes: 'Leaf cleanup, bed edging, first mow, and haul-away after winter.',
    status: 'Quoted',
  },
  {
    id: 2,
    name: 'Jordan Price',
    service: 'Weekly mowing',
    property: 'Small front and back yard',
    timeline: 'Friday afternoon',
    budget: '$55/visit',
    notes: 'Wants recurring mowing, trimming, and cleanup around fence line.',
    status: 'New',
  },
  {
    id: 3,
    name: 'Ari Lopez',
    service: 'Mulch install',
    property: 'Six front-yard beds',
    timeline: 'Next week',
    budget: '$900',
    notes: 'Needs weed barrier refresh, dark brown mulch, and clean bed edges.',
    status: 'Followed up',
  },
]

const servicePrices: Record<string, number> = {
  'Weekly mowing': 55,
  'Spring cleanup': 375,
  'Mulch install': 780,
  'Aeration and overseeding': 240,
  'Small landscape install': 1250,
}

function App() {
  const [leads, setLeads] = useState<Lead[]>(starterLeads)
  const [selectedId, setSelectedId] = useState(1)
  const [subscriptionStatus, setSubscriptionStatus] = useState<'Trial' | 'Pro active'>('Trial')
  const [calendarConnected, setCalendarConnected] = useState(false)
  const [bookingStatus, setBookingStatus] = useState('Ready to book once the customer accepts.')
  const [form, setForm] = useState({
    name: '',
    service: 'Spring cleanup',
    property: '',
    timeline: '',
    budget: '',
    notes: '',
  })

  const selectedLead = leads.find((lead) => lead.id === selectedId) ?? leads[0]
  const estimatedPrice = useMemo(() => {
    const base = servicePrices[selectedLead.service] ?? 225
    const largerProperty = /acre|corner|large|six|beds|slope|back yard|backyard/i.test(selectedLead.property)
    const complexityFee = /haul|leaf|weed|barrier|overgrown|edging|fence|cleanup/i.test(selectedLead.notes)
    return base + (largerProperty ? 125 : 0) + (complexityFee ? 95 : 0)
  }, [selectedLead])

  const closeRate = Math.round(
    (leads.filter((lead) => lead.status === 'Won').length / leads.length) * 100,
  )

  function createLead() {
    if (!form.name.trim() || !form.property.trim()) {
      return
    }

    const nextLead: Lead = {
      id: Date.now(),
      name: form.name,
      service: form.service,
      property: form.property,
      timeline: form.timeline || 'Flexible',
      budget: form.budget || 'Not provided',
      notes: form.notes || 'No extra notes yet.',
      status: 'New',
    }

    setLeads((current) => [nextLead, ...current])
    setSelectedId(nextLead.id)
    setForm({
      name: '',
      service: 'Spring cleanup',
      property: '',
      timeline: '',
      budget: '',
      notes: '',
    })
  }

  function markQuoted() {
    setLeads((current) =>
      current.map((lead) =>
        lead.id === selectedLead.id ? { ...lead, status: 'Quoted' } : lead,
      ),
    )
  }

  function startCheckout() {
    setSubscriptionStatus('Pro active')
  }

  function connectCalendar() {
    setCalendarConnected(true)
  }

  function bookLead() {
    if (!calendarConnected) {
      setBookingStatus('Connect Google Calendar before creating a booking event.')
      return
    }

    setLeads((current) =>
      current.map((lead) =>
        lead.id === selectedLead.id ? { ...lead, status: 'Won' } : lead,
      ),
    )
    setBookingStatus(
      `${selectedLead.name} is booked for ${selectedLead.timeline.toLowerCase()} on Google Calendar.`,
    )
  }

  const proposal = `Hi ${selectedLead.name}, thanks for reaching out. Based on your ${selectedLead.property} and the requested ${selectedLead.service.toLowerCase()}, I recommend starting at $${estimatedPrice}. This includes site prep, the core yard work, cleanup, and a final walkthrough. I can target ${selectedLead.timeline.toLowerCase()} if the slot is still open.`

  const followUp = `Hi ${selectedLead.name}, just checking in on the ${selectedLead.service.toLowerCase()} quote for your property. I still have a couple of openings around ${selectedLead.timeline.toLowerCase()}, and I can get you on the schedule today if the $${estimatedPrice} estimate works for you.`

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
        </div>
        <button className="icon-button" type="button" aria-label="Send proposal">
          <Send size={18} />
        </button>
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
            <a className="primary-action" href="#workspace">
              Try the workflow
              <ArrowRight size={18} />
            </a>
            <a className="secondary-action" href="#pricing">
              See pricing
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

        <div className="app-grid">
          <section className="panel intake-panel" aria-labelledby="intake-title">
            <div className="panel-title">
              <UserRound size={18} />
              <h3 id="intake-title">Lead intake</h3>
            </div>
            <div className="form-grid">
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
                  placeholder="$250"
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
              {leads.map((lead) => (
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
              ))}
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
              <button className="secondary-action button" type="button">
                <Mail size={17} />
                Email
              </button>
              <button className="primary-action button" type="button" onClick={markQuoted}>
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
            <strong>{hasSupabaseConfig ? 'Configured' : 'Needs env vars'}</strong>
            <button className="secondary-action full" type="button">
              Persist leads
            </button>
          </article>

          <article className="integration-card">
            <div className="integration-icon">
              <CreditCard size={20} />
            </div>
            <div>
              <h3>Stripe subscription</h3>
              <p>
                Use Checkout for Solo, Pro, and Crew plans. Stripe hosts the payment page
                and sends a webhook when the subscription becomes active.
              </p>
            </div>
            <strong>{subscriptionStatus}</strong>
            <button className="primary-action full" type="button" onClick={startCheckout}>
              Simulate checkout
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
        <div className="pricing-grid">
          <PricingCard name="Solo" price="$19" items={['25 leads/month', 'AI proposal drafts', 'SMS/email copy']} />
          <PricingCard name="Pro" price="$49" featured items={['Unlimited leads', 'Custom pricing rules', 'Follow-up sequences']} />
          <PricingCard name="Crew" price="$99" items={['Team inbox', 'Saved templates', 'Revenue reporting']} />
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
          <li>Record a 60-second demo using this workflow.</li>
          <li>DM 100 local landscapers with a direct quote-page offer.</li>
          <li>Charge the first users after setup, not after perfection.</li>
        </ol>
      </section>
    </main>
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
  price,
  items,
  featured = false,
}: {
  name: string
  price: string
  items: string[]
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
      <button className={featured ? 'primary-action full' : 'secondary-action full'} type="button">
        Start
      </button>
    </article>
  )
}

export default App
