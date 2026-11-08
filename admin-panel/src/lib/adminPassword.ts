import { supabase } from './supabase'

/**
 * Updates the password for the authenticated super admin.
 * Verifies the current password via Supabase Auth, then updates the user account to the new password.
 * Never stores passwords in localStorage, database profile columns, or plaintext client cache.
 */
export async function updateAdminPassword(
  email: string,
  currentPassword: string,
  newPassword: string
): Promise<{ success: boolean; error?: string }> {
  const normalized = email.trim().toLowerCase()

  if (!normalized) {
    return { success: false, error: 'Admin email not found in current session.' }
  }

  if (!currentPassword) {
    return { success: false, error: 'Please enter your current password.' }
  }

  if (!newPassword || newPassword.length < 6) {
    return { success: false, error: 'New password must be at least 6 characters long.' }
  }

  if (currentPassword === newPassword) {
    return { success: false, error: 'New password must be different from your current password.' }
  }

  // 1. Verify current credentials against Supabase Auth
  const { error: verifyError } = await supabase.auth.signInWithPassword({
    email: normalized,
    password: currentPassword,
  })

  if (verifyError) {
    return { success: false, error: 'Current password is incorrect: ' + verifyError.message }
  }

  // 2. Perform server-side password update via Supabase Auth
  const { error: updateError } = await supabase.auth.updateUser({
    password: newPassword,
  })

  if (updateError) {
    return { success: false, error: 'Failed to update password: ' + updateError.message }
  }

  // 3. Purge legacy browser storage artifacts if any exist
  try {
    localStorage.removeItem('dactor_admin_passwords')
    localStorage.removeItem('dactor_admin_session')
  } catch {
    // Ignore storage errors in restricted contexts
  }

  return { success: true }
}
