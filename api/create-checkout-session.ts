import { createClient } from '@supabase/supabase-js'
import Stripe from 'stripe'

type PlanKey = 'solo' | 'pro' | 'crew'

type SupabaseUserResponse = {
  id: string
  email?: string
}

const priceEnvByPlan: Record<PlanKey, string> = {
  solo: 'STRIPE_SOLO_PRICE_ID',
  pro: 'STRIPE_PRO_PRICE_ID',
  crew: 'STRIPE_CREW_PRICE_ID',
}

function getRequiredEnv(name: string) {
  const value = process.env[name]
  if (!value) {
    throw new Error(`${name} is not configured`)
  }

  return value
}

function getRequestOrigin(request: { headers: Record<string, string | string[] | undefined> }) {
  const origin = request.headers.origin
  if (typeof origin === 'string') {
    return origin
  }

  const host = request.headers.host
  return typeof host === 'string' ? `https://${host}` : 'https://bidpilot-neon.vercel.app'
}

function getBearerToken(headerValue: string | string[] | undefined) {
  const header = Array.isArray(headerValue) ? headerValue[0] : headerValue
  if (!header?.startsWith('Bearer ')) {
    return null
  }

  return header.slice('Bearer '.length)
}

async function readJsonBody(request: { body?: unknown }) {
  if (!request.body) {
    return {}
  }

  if (typeof request.body === 'string') {
    return JSON.parse(request.body) as Record<string, unknown>
  }

  return request.body as Record<string, unknown>
}

async function verifySupabaseUser(supabaseUrl: string, token: string) {
  const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: getRequiredEnv('VITE_SUPABASE_PUBLISHABLE_KEY'),
    },
  })

  if (!response.ok) {
    return null
  }

  return (await response.json()) as SupabaseUserResponse
}

export default async function handler(
  request: {
    method?: string
    headers: Record<string, string | string[] | undefined>
    body?: unknown
  },
  response: {
    status: (statusCode: number) => {
      json: (body: unknown) => void
      end: () => void
    }
  },
) {
  if (request.method !== 'POST') {
    response.status(405).json({ error: 'Method not allowed' })
    return
  }

  try {
    const stripeSecretKey = getRequiredEnv('STRIPE_SECRET_KEY')
    const supabaseUrl = getRequiredEnv('VITE_SUPABASE_URL')
    const supabaseServiceRoleKey = getRequiredEnv('SUPABASE_SERVICE_ROLE_KEY')
    const body = await readJsonBody(request)
    const plan = typeof body.plan === 'string' ? body.plan.toLowerCase() : 'pro'

    if (!['solo', 'pro', 'crew'].includes(plan)) {
      response.status(400).json({ error: 'Unknown plan' })
      return
    }

    const priceId = getRequiredEnv(priceEnvByPlan[plan as PlanKey])
    const token = getBearerToken(request.headers.authorization)
    if (!token) {
      response.status(401).json({ error: 'Sign in before starting checkout.' })
      return
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    })
    const user = await verifySupabaseUser(supabaseUrl, token)

    if (!user) {
      response.status(401).json({ error: 'Could not verify your session.' })
      return
    }

    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('business_name, business_slug, stripe_customer_id')
      .eq('id', user.id)
      .maybeSingle()

    const stripe = new Stripe(stripeSecretKey)
    const customerId =
      profile?.stripe_customer_id ??
      (
        await stripe.customers.create({
          email: user.email ?? undefined,
          name: profile?.business_name ?? undefined,
          metadata: {
            supabase_user_id: user.id,
            business_slug: profile?.business_slug ?? '',
          },
        })
      ).id

    if (!profile?.stripe_customer_id) {
      await supabaseAdmin
        .from('profiles')
        .update({ stripe_customer_id: customerId })
        .eq('id', user.id)
    }

    const origin = getRequestOrigin(request)
    const checkoutSession = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${origin}/?checkout=success`,
      cancel_url: `${origin}/?checkout=cancelled`,
      client_reference_id: user.id,
      metadata: {
        supabase_user_id: user.id,
        plan,
      },
      subscription_data: {
        metadata: {
          supabase_user_id: user.id,
          plan,
        },
      },
    })

    response.status(200).json({ url: checkoutSession.url })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Checkout is unavailable.'
    const statusCode = message.includes('not configured') ? 501 : 500
    response.status(statusCode).json({ error: message })
  }
}
