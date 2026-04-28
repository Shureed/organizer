import { useState, useEffect, useRef } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { setCacheUserScope, clearSupabaseRestCache } from '../lib/pwa'
import { destroy as destroySQLite } from '../sync/client'

export interface UseAuthReturn {
  session: Session | null
  loading: boolean
  pendingEmail: string | null
  signIn: (email: string) => Promise<void>
  verifyOtp: (email: string, token: string) => Promise<void>
  signOut: () => Promise<void>
}

export function useAuth(): UseAuthReturn {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [pendingEmail, setPendingEmail] = useState<string | null>(null)
  const previousUidRef = useRef<string | null>(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      // Partition the Supabase REST cache by the current user's id so that
      // cached rows from one account are never served to another.
      const uid = session?.user.id ?? null
      setCacheUserScope(uid)
      previousUidRef.current = uid
      setSession(session)
      setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (event === 'SIGNED_OUT') {
          // Wipe the (now-retired) supabase-rest cache and destroy the local
          // SQLite DB so the next user starts with a clean OPFS slate.
          await clearSupabaseRestCache()
          await destroySQLite()
          setCacheUserScope(null)
          previousUidRef.current = null
        } else if (session) {
          // On sign-in or token refresh, update the scope. If the user id
          // differs from the previous scope (account switch), also destroy
          // the local SQLite mirror first — otherwise the previous user's
          // rows persist in OPFS and surface in this user's views (no
          // user_id filter at read time means the leak is immediate).
          const newUid = session.user.id
          if (previousUidRef.current !== null && previousUidRef.current !== newUid) {
            await destroySQLite()
          }
          await clearSupabaseRestCache()
          setCacheUserScope(newUid)
          previousUidRef.current = newUid
        }
        setSession(session)
        setLoading(false)
      }
    )

    return () => subscription.unsubscribe()
  }, [])

  const signIn = async (email: string): Promise<void> => {
    const { error } = await supabase.auth.signInWithOtp({ email })
    if (error) throw error
    setPendingEmail(email)
  }

  const verifyOtp = async (email: string, token: string): Promise<void> => {
    const { error } = await supabase.auth.verifyOtp({ email, token, type: 'email' })
    if (error) throw error
    setPendingEmail(null)
  }

  const signOut = async (): Promise<void> => {
    const { error } = await supabase.auth.signOut()
    if (error) throw error
  }

  return { session, loading, pendingEmail, signIn, verifyOtp, signOut }
}
