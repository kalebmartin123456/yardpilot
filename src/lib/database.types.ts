export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type LeadStatus = 'New' | 'Quoted' | 'Followed up' | 'Won' | 'Lost'

export type Database = {
  public: {
    Tables: {
      leads: {
        Row: {
          id: string
          user_id: string
          customer_name: string
          service: string
          property_details: string
          timeline: string
          budget: string | null
          notes: string | null
          quoted_price: number | null
          status: LeadStatus
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          customer_name: string
          service: string
          property_details: string
          timeline?: string
          budget?: string | null
          notes?: string | null
          quoted_price?: number | null
          status?: LeadStatus
          created_at?: string
        }
        Update: {
          customer_name?: string
          service?: string
          property_details?: string
          timeline?: string
          budget?: string | null
          notes?: string | null
          quoted_price?: number | null
          status?: LeadStatus
        }
      }
      profiles: {
        Row: {
          id: string
          business_name: string | null
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          subscription_status: string
          created_at: string
        }
        Insert: {
          id: string
          business_name?: string | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          subscription_status?: string
          created_at?: string
        }
        Update: {
          business_name?: string | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          subscription_status?: string
        }
      }
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}
