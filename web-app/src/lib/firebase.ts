// Firebase & Real Google OAuth Authentication for Dactor Web App
// Authenticates exclusively through official Google OAuth dialogs (Firebase Auth & Google Identity)
import { supabase } from './supabase'

export const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyCc1ho812HhFLO3-XeNcDT_1Y68BdpzObU',
  authDomain: 'dactor-ea1e1.firebaseapp.com',
  projectId: 'dactor-ea1e1',
  storageBucket: 'dactor-ea1e1.firebasestorage.app',
  messagingSenderId: '429529188002',
  appId: '1:429529188002:web:cd7cf4e561779910ab79fb',
  measurementId: 'G-9SK7JVV6XM',
}

export interface FirebaseAuthUser {
  uid: string
  email: string
  displayName?: string
  photoURL?: string
  idToken?: string
  refreshToken?: string
}

/**
 * Check if current client is a mobile device or touch browser
 */
export function isMobileBrowser(): boolean {
  if (typeof window === 'undefined') return false
  const ua = navigator.userAgent || ''
  const isTouch = (typeof navigator.maxTouchPoints === 'number' && navigator.maxTouchPoints > 1)
  return (
    /android|iphone|ipad|ipod|mobile|touch|blackberry|iemobile|opera mini/i.test(ua) ||
    (isTouch && /macintosh/i.test(ua))
  )
}

/**
 * Check if the browser just returned from a Firebase signInWithRedirect
 * or if there is already an active authenticated session
 */
export async function checkRedirectGoogleUser(options?: { requireRedirectOnly?: boolean }): Promise<FirebaseAuthUser | null> {
  // 1. Check Firebase getRedirectResult (genuine redirect return)
  try {
    if (typeof window !== 'undefined' && (window as any).dactorFirebase?.getRedirectResult) {
      const result = await (window as any).dactorFirebase.getRedirectResult()
      if (result && result.user && result.user.email) {
        const u = result.user
        const userObj: FirebaseAuthUser = {
          uid: u.uid,
          email: u.email.toLowerCase().trim(),
          displayName: u.displayName || undefined,
          photoURL: u.photoURL || undefined,
        }
        localStorage.setItem('dactor_google_user', JSON.stringify(userObj))
        return userObj
      }
    }
  } catch (err) {
    console.warn('Firebase getRedirectResult notice:', err)
  }

  // If caller specifically requested redirect results only, do not probe ambient cache
  if (options?.requireRedirectOnly) {
    return null
  }

  // 2. Check active Firebase currentUser
  try {
    if (typeof window !== 'undefined' && (window as any).dactorFirebase?.auth?.currentUser) {
      const u = (window as any).dactorFirebase.auth.currentUser
      if (u && u.email) {
        const userObj: FirebaseAuthUser = {
          uid: u.uid,
          email: u.email.toLowerCase().trim(),
          displayName: u.displayName || undefined,
          photoURL: u.photoURL || undefined,
        }
        localStorage.setItem('dactor_google_user', JSON.stringify(userObj))
        return userObj
      }
    }
  } catch (err) {
    console.warn('Firebase currentUser check notice:', err)
  }

  // 3. Fallback: check Supabase OAuth session
  try {
    const { data: { session } } = await supabase.auth.getSession()
    if (session?.user?.email) {
      const u = session.user
      const userObj: FirebaseAuthUser = {
        uid: u.id,
        email: u.email.toLowerCase().trim(),
        displayName: u.user_metadata?.full_name || undefined,
        photoURL: u.user_metadata?.avatar_url || undefined,
      }
      localStorage.setItem('dactor_google_user', JSON.stringify(userObj))
      return userObj
    }
  } catch (err) {
    console.warn('Supabase getSession check notice:', err)
  }

  // 4. Cached user from localStorage
  try {
    const raw = localStorage.getItem('dactor_google_user')
    if (raw) {
      const parsed = JSON.parse(raw)
      if (parsed && parsed.email) return parsed
    }
  } catch {}

  return null
}

/**
 * Subscribe to Firebase Auth state changes
 */
export function onFirebaseAuthStateChanged(callback: (user: FirebaseAuthUser | null) => void): () => void {
  try {
    if (typeof window !== 'undefined' && (window as any).dactorFirebase?.onAuthStateChanged) {
      return (window as any).dactorFirebase.onAuthStateChanged((u: any) => {
        if (u && u.email) {
          const userObj: FirebaseAuthUser = {
            uid: u.uid,
            email: u.email.toLowerCase().trim(),
            displayName: u.displayName || undefined,
            photoURL: u.photoURL || undefined,
          }
          localStorage.setItem('dactor_google_user', JSON.stringify(userObj))
          callback(userObj)
        } else {
          callback(null)
        }
      })
    }
  } catch (err) {
    console.warn('onFirebaseAuthStateChanged subscription error:', err)
  }
  return () => {}
}

/**
 * Real Google Sign-In with official Google Account Chooser (prompt: 'select_account')
 * Strictly calls official Google OAuth. No mock accounts, no editable email inputs.
 */
export async function signInWithFirebaseGoogle(
  portalHint: 'clinic' | 'doctor' | 'patient' | 'account' | 'records' | 'patient-portal' = 'patient'
): Promise<FirebaseAuthUser> {
  // Save intended destination so portal navigation persists
  try {
    sessionStorage.setItem('dactor_oauth_target_portal', portalHint)
    localStorage.setItem('dactor_oauth_target_portal', portalHint)
  } catch {}

  // Trigger official Google popup (works consistently across desktop & mobile without third-party cookie blocking)
  if (typeof window !== 'undefined' && (window as any).dactorFirebase?.signInWithGoogle) {
    try {
      const result = await (window as any).dactorFirebase.signInWithGoogle()
      if (result && result.user && result.user.email) {
        const u = result.user
        const userObj: FirebaseAuthUser = {
          uid: u.uid,
          email: u.email.toLowerCase().trim(),
          displayName: u.displayName || undefined,
          photoURL: u.photoURL || undefined,
        }
        localStorage.setItem('dactor_google_user', JSON.stringify(userObj))
        return userObj
      }
    } catch (fbErr: any) {
      console.warn('Firebase Google Sign-In notice:', fbErr)
      const code = fbErr?.code || ''
      const msg = fbErr?.message || ''

      if (code === 'auth/popup-blocked' || msg.includes('popup-blocked')) {
        throw new Error('Google Sign-In popup was blocked by your browser. Please tap "Sign in with Google" again and allow popups.')
      }

      if (code === 'auth/popup-closed-by-user' || msg.includes('popup-closed-by-user') || msg.includes('cancelled')) {
        throw new Error('Google Sign-In was closed before completing. Please tap to try again.')
      }

      if (code === 'auth/unauthorized-domain' || msg.includes('unauthorized-domain')) {
        throw new Error(
          `Google OAuth Domain Authorization: Please ensure "${window.location.hostname}" is added in Firebase Console -> Authentication -> Settings -> Authorized Domains.`
        )
      }

      throw new Error(fbErr.message || 'Google Sign-In failed. Please try again.')
    }
  }

  throw new Error('Google Sign-In service is initializing. Please tap again in a moment.')
}

export async function signOutFirebase(): Promise<void> {
  firebaseSignOut()
}

export function firebaseSignOut(): void {
  try {
    if (typeof window !== 'undefined' && (window as any).dactorFirebase?.signOut) {
      ;(window as any).dactorFirebase.signOut().catch(() => {})
    }
    localStorage.removeItem('dactor_google_user')
  } catch {}
}

/**
 * Real Firebase Authentication Account Deletion Rule
 * Permanently deletes the current authenticated Firebase user.
 */
export async function deleteFirebaseUserAccount(): Promise<boolean> {
  try {
    if (typeof window !== 'undefined' && (window as any).dactorFirebase?.auth?.currentUser) {
      await (window as any).dactorFirebase.auth.currentUser.delete()
      firebaseSignOut()
      return true
    }
    return false
  } catch (err) {
    console.warn('Firebase user deletion notice:', err)
    firebaseSignOut()
    return false
  }
}
