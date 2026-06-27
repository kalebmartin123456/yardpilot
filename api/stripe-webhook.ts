import { createClient } from '@supabase/supabase-js'
import Stripe from 'stripe'

export const config = {
  api: {
    bodyParser: false,
  },
}

function getRequiredEnv(name: string) {
  const value = process.env[name]
  if (!value) {
    throw new Error(`${name} is not configured`)
  }

  return value
}

async function readRawBody(request: {
  body?: unknown
  on?: (event: string, callback: (chunk?: Buffer) => void) => void
}) {
  if (Buffer.isBuffer(request.body)) {
    return request.body
  }

  if (typeof request.body === 'string') {
    return Buffer.from(request.body)
  }

  return await new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = []

    request.on?.('data', (chunk?: Buffer) => {
      if (chunk) {
        chunks.push(Buffer.from(chunk))
      }
    })

    request.on?.('end', () => {
      resolve(Buffer.concat(chunks))
    })

    request.on?.('error', () => {
      reject(new Error('Could not read webhook body.'))
    })
  })
}

function getSubscriptionStatus(subscription: Stripe.Subscription) {
  if (subscription.status === 'active' || subscription.status === 'trialing') {
    return 'pro_active'
  }

  if (subscription.status === 'past_due') {
    return 'past_due'
  }

  if (subscription.status === 'canceled' || subscription.status === 'unpaid') {
    return 'inactive'
  }

  return subscription.status
}

async function updateProfileFromSubscription(
  subscription: Stripe.Subscription,
  checkoutUserId?: string | null,
) {
  const supabaseUrl = getRequiredEnv('VITE_SUPABASE_URL')
  const supabaseServiceRoleKey = getRequiredEnv('SUPABASE_SERVICE_ROLE_KEY')
  const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
  const userId = subscription.metadata.supabase_user_id || checkoutUserId

  if (!userId) {
    return
  }

  await supabaseAdmin
    .from('profiles')
    .update({
      stripe_customer_id:
        typeof subscription.customer === 'string' ? subscription.customer : subscription.customer.id,
      stripe_subscription_id: subscription.id,
      subscription_status: getSubscriptionStatus(subscription),
    })
    .eq('id', userId)
}

export default async function handler(
  request: {
    method?: string
    headers: Record<string, string | string[] | undefined>
    body?: unknown
    on?: (event: string, callback: (chunk?: Buffer) => void) => void
  },
  response: {
    status: (statusCode: number) => {
      json: (body: unknown) => void
      send: (body: unknown) => void
      end: () => void
    }
  },
) {
  if (request.method !== 'POST') {
    response.status(405).json({ error: 'Method not allowed' })
    return
  }

  try {
    const stripe = new Stripe(getRequiredEnv('STRIPE_SECRET_KEY'))
    const signatureHeader = request.headers['stripe-signature']
    const signature = Array.isArray(signatureHeader) ? signatureHeader[0] : signatureHeader

    if (!signature) {
      response.status(400).send('Missing Stripe signature.')
      return
    }

    const rawBody = await readRawBody(request)
    const event = stripe.webhooks.constructEvent(
      rawBody,
      signature,
      getRequiredEnv('STRIPE_WEBHOOK_SECRET'),
    )

    if (event.type === 'checkout.session.completed') {
      const checkoutSession = event.data.object
      if (typeof checkoutSession.subscription === 'string') {
        const subscription = await stripe.subscriptions.retrieve(checkoutSession.subscription)
        await updateProfileFromSubscription(
          subscription,
          checkoutSession.metadata?.supabase_user_id,
        )
      }
    }

    if (
      event.type === 'customer.subscription.updated' ||
      event.type === 'customer.subscription.deleted'
    ) {
      await updateProfileFromSubscription(event.data.object)
    }

    response.status(200).json({ received: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Webhook failed.'
    response.status(400).send(message)
  }
}
