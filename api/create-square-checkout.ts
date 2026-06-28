/// <reference types="node" />

import { createClient } from '@supabase/supabase-js'

type PlanKey = 'solo' | 'pro' | 'crew'

type SupabaseUserResponse = {
  id: string
  email?: string
}

type SquarePaymentLinkResponse = {
  payment_link?: {
    url?: string
  }
  errors?: Array<{
    detail?: string
  }>
}

const planConfig: Record<PlanKey, { amount: number; label: string }> = {
  solo: {
    amount: 1900,
    label: 'YardPilot Solo',
  },
  pro: {
    amount: 4900,
    label: 'YardPilot Pro',
  },
  crew: {
    amount: 9900,
    label: 'YardPilot Crew',
  },
}

function getRequiredEnv(name: string) {
  const value = process.env[name]
  if (!value) {
    throw new Error(`${name} is not configured`)
  }

  return value
}

function getSquareBaseUrl() {
  return process.env.SQUARE_ENVIRONMENT === 'production'
    ? 'https://connect.squareup.com'
    : 'https://connect.squareupsandbox.com'
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

async function createSquarePaymentLink({
  origin,
  plan,
  userId,
}: {
  origin: string
  plan: PlanKey
  userId: string
}) {
  const accessToken = getRequiredEnv('SQUARE_ACCESS_TOKEN')
  const locationId = getRequiredEnv('SQUARE_LOCATION_ID')
  const planDetails = planConfig[plan]
  const response = await fetch(`${getSquareBaseUrl()}/v2/online-checkout/payment-links`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'Square-Version': process.env.SQUARE_VERSION ?? '2026-06-18',
    },
    body: JSON.stringify({
      idempotency_key: `${userId}-${plan}-${Date.now()}`,
      order: {
        location_id: locationId,
        reference_id: userId,
        line_items: [
          {
            name: planDetails.label,
            quantity: '1',
            base_price_money: {
              amount: planDetails.amount,
              currency: 'USD',
            },
          },
        ],
        metadata: {
          supabase_user_id: userId,
          plan,
        },
      },
      checkout_options: {
        redirect_url: `${origin}/?checkout=square-success`,
      },
    }),
  })
  const data = (await response.json()) as SquarePaymentLinkResponse

  if (!response.ok || !data.payment_link?.url) {
    throw new Error(data.errors?.[0]?.detail ?? 'Square checkout is unavailable.')
  }

  return data.payment_link.url
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
    }
  },
) {
  if (request.method !== 'POST') {
    response.status(405).json({ error: 'Method not allowed' })
    return
  }

  try {
    const supabaseUrl = getRequiredEnv('VITE_SUPABASE_URL')
    const supabaseServiceRoleKey = getRequiredEnv('SUPABASE_SERVICE_ROLE_KEY')
    const body = await readJsonBody(request)
    const plan = typeof body.plan === 'string' ? body.plan.toLowerCase() : 'pro'

    if (!['solo', 'pro', 'crew'].includes(plan)) {
      response.status(400).json({ error: 'Unknown plan' })
      return
    }

    const token = getBearerToken(request.headers.authorization)
    if (!token) {
      response.status(401).json({ error: 'Sign in before starting checkout.' })
      return
    }

    const user = await verifySupabaseUser(supabaseUrl, token)
    if (!user) {
      response.status(401).json({ error: 'Could not verify your session.' })
      return
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    })
    const url = await createSquarePaymentLink({
      origin: getRequestOrigin(request),
      plan: plan as PlanKey,
      userId: user.id,
    })

    await supabaseAdmin
      .from('profiles')
      .update({ subscription_status: 'checkout_started' })
      .eq('id', user.id)

    response.status(200).json({ url })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Square checkout is unavailable.'
    const statusCode = message.includes('not configured') ? 501 : 500
    response.status(statusCode).json({ error: message })
  }
}
