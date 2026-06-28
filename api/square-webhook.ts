/// <reference types="node" />

import { createHmac, timingSafeEqual } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

export const config = {
  api: {
    bodyParser: false,
  },
}

type SquareWebhookEvent = {
  type?: string
  data?: {
    object?: {
      payment?: {
        order_id?: string
        status?: string
      }
      subscription?: {
        id?: string
        status?: string
      }
    }
  }
}

type SquareOrderResponse = {
  order?: {
    reference_id?: string
    metadata?: {
      supabase_user_id?: string
      plan?: string
    }
  }
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

function verifySquareSignature(rawBody: Buffer, signatureHeader?: string | string[]) {
  const signature = Array.isArray(signatureHeader) ? signatureHeader[0] : signatureHeader
  if (!signature) {
    return false
  }

  const notificationUrl = getRequiredEnv('SQUARE_WEBHOOK_NOTIFICATION_URL')
  const signatureKey = getRequiredEnv('SQUARE_WEBHOOK_SIGNATURE_KEY')
  const computedSignature = createHmac('sha256', signatureKey)
    .update(notificationUrl + rawBody.toString('utf8'))
    .digest('base64')
  const expected = Buffer.from(signature)
  const actual = Buffer.from(computedSignature)

  return expected.length === actual.length && timingSafeEqual(expected, actual)
}

async function retrieveOrder(orderId: string) {
  const response = await fetch(`${getSquareBaseUrl()}/v2/orders/${orderId}`, {
    headers: {
      Authorization: `Bearer ${getRequiredEnv('SQUARE_ACCESS_TOKEN')}`,
      'Square-Version': process.env.SQUARE_VERSION ?? '2026-06-18',
    },
  })

  if (!response.ok) {
    return null
  }

  return (await response.json()) as SquareOrderResponse
}

function getSubscriptionStatus(squareStatus?: string) {
  if (squareStatus === 'ACTIVE' || squareStatus === 'PAID') {
    return 'pro_active'
  }

  if (squareStatus === 'CANCELED') {
    return 'inactive'
  }

  return squareStatus?.toLowerCase() ?? 'pro_active'
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
    }
  },
) {
  if (request.method !== 'POST') {
    response.status(405).json({ error: 'Method not allowed' })
    return
  }

  try {
    const rawBody = await readRawBody(request)
    if (!verifySquareSignature(rawBody, request.headers['x-square-hmacsha256-signature'])) {
      response.status(400).send('Invalid Square signature.')
      return
    }

    const event = JSON.parse(rawBody.toString('utf8')) as SquareWebhookEvent
    const supabaseAdmin = createClient(
      getRequiredEnv('VITE_SUPABASE_URL'),
      getRequiredEnv('SUPABASE_SERVICE_ROLE_KEY'),
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      },
    )

    if (event.type?.startsWith('payment.') && event.data?.object?.payment?.order_id) {
      const order = await retrieveOrder(event.data.object.payment.order_id)
      const userId = order?.order?.metadata?.supabase_user_id ?? order?.order?.reference_id

      if (userId) {
        await supabaseAdmin
          .from('profiles')
          .update({ subscription_status: getSubscriptionStatus(event.data.object.payment.status) })
          .eq('id', userId)
      }
    }

    response.status(200).json({ received: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Square webhook failed.'
    response.status(400).send(message)
  }
}
