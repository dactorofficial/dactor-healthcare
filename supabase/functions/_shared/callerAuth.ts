import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";

const FIREBASE_PROJECT_ID = "dactor-ea1e1";
const FIREBASE_ISSUER = `https://securetoken.google.com/${FIREBASE_PROJECT_ID}`;
const FIREBASE_JWKS_URL =
  "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com";

export interface VerifiedCaller {
  provider: "supabase" | "firebase" | "service_role";
  uid: string;
  email: string | null;
  emailVerified: boolean;
  supabaseUserClient: SupabaseClient | null;
}

interface JwksCacheState {
  keys: Map<string, CryptoKey>;
  expiresAtMs: number;
  lastFetchAtMs: number;
}

const jwksCache: JwksCacheState = {
  keys: new Map(),
  expiresAtMs: 0,
  lastFetchAtMs: 0,
};

function constantTimeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const aBytes = enc.encode(a);
  const bBytes = enc.encode(b);
  if (aBytes.length !== bBytes.length) return false;
  let diff = 0;
  for (let i = 0; i < aBytes.length; i++) {
    diff |= aBytes[i] ^ bBytes[i];
  }
  return diff === 0;
}

function base64UrlToUint8Array(input: string): Uint8Array {
  let b64 = input.replace(/-/g, "+").replace(/_/g, "/");
  while (b64.length % 4 !== 0) b64 += "=";
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) {
    bytes[i] = bin.charCodeAt(i);
  }
  return bytes;
}

function decodeBase64UrlJson(input: string): Record<string, unknown> | null {
  try {
    const bytes = base64UrlToUint8Array(input);
    const text = new TextDecoder().decode(bytes);
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

async function getGoogleJwksKeys(forceRefresh = false): Promise<Map<string, CryptoKey>> {
  const now = Date.now();
  if (!forceRefresh && jwksCache.keys.size > 0 && now < jwksCache.expiresAtMs) {
    return jwksCache.keys;
  }
  if (forceRefresh && now - jwksCache.lastFetchAtMs < 10_000 && jwksCache.keys.size > 0) {
    return jwksCache.keys;
  }

  jwksCache.lastFetchAtMs = now;
  const res = await fetch(FIREBASE_JWKS_URL);
  if (!res.ok) {
    if (jwksCache.keys.size > 0) return jwksCache.keys;
    throw new Error(`Failed to fetch Google JWKS (${res.status})`);
  }

  const cacheControl = res.headers.get("cache-control") || "";
  const maxAgeMatch = cacheControl.match(/max-age=(\d+)/i);
  const maxAgeSec = maxAgeMatch ? Math.max(60, parseInt(maxAgeMatch[1], 10)) : 3600;

  const body = (await res.json()) as { keys?: Array<JsonWebKey & { kid?: string; alg?: string }> };
  const nextKeys = new Map<string, CryptoKey>();
  for (const jwk of body?.keys || []) {
    if (!jwk?.kid) continue;
    try {
      const key = await crypto.subtle.importKey(
        "jwk",
        jwk,
        { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
        false,
        ["verify"]
      );
      nextKeys.set(jwk.kid, key);
    } catch {
      // Skip unsupported JWK entries
    }
  }

  if (nextKeys.size > 0) {
    jwksCache.keys = nextKeys;
    jwksCache.expiresAtMs = now + maxAgeSec * 1000;
  }
  return jwksCache.keys;
}

export async function verifyFirebaseIdToken(token: string): Promise<VerifiedCaller | null> {
  const parts = token.split(".");
  if (parts.length !== 3) return null;

  const [headerB64, payloadB64, sigB64] = parts;
  const header = decodeBase64UrlJson(headerB64);
  const payload = decodeBase64UrlJson(payloadB64);
  if (!header || !payload) return null;

  // Strict algorithm and issuer/audience pinning before signature check
  if (header.alg !== "RS256") return null;
  const kid = typeof header.kid === "string" ? header.kid.trim() : "";
  if (!kid) return null;

  if (payload.iss !== FIREBASE_ISSUER || payload.aud !== FIREBASE_PROJECT_ID) {
    return null;
  }

  const sub = typeof payload.sub === "string" ? payload.sub.trim() : "";
  if (!sub) return null;

  const nowSec = Math.floor(Date.now() / 1000);
  const exp = Number(payload.exp ?? 0);
  const iat = Number(payload.iat ?? 0);
  const authTime = payload.auth_time !== undefined ? Number(payload.auth_time) : 0;

  if (!Number.isFinite(exp) || exp <= nowSec) return null;
  if (!Number.isFinite(iat) || iat > nowSec + 300) return null;
  if (payload.auth_time !== undefined && (!Number.isFinite(authTime) || authTime > nowSec + 300)) {
    return null;
  }

  let keys = await getGoogleJwksKeys(false);
  let key = keys.get(kid);
  if (!key) {
    keys = await getGoogleJwksKeys(true);
    key = keys.get(kid);
  }
  if (!key) return null;

  const signedBytes = new TextEncoder().encode(`${headerB64}.${payloadB64}`);
  const signatureBytes = base64UrlToUint8Array(sigB64);
  const valid = await crypto.subtle.verify(
    { name: "RSASSA-PKCS1-v1_5" },
    key,
    signatureBytes,
    signedBytes
  );
  if (!valid) return null;

  const email =
    typeof payload.email === "string" && payload.email.trim()
      ? payload.email.toLowerCase().trim()
      : null;

  return {
    provider: "firebase",
    uid: sub,
    email,
    emailVerified: payload.email_verified === true,
    supabaseUserClient: null,
  };
}

export async function resolveVerifiedCaller(
  req: Request,
  service: SupabaseClient,
  supabaseUrl: string,
  anonKey: string,
  serviceRoleKey: string
): Promise<VerifiedCaller | null> {
  const authorization = req.headers.get("Authorization") ?? "";
  if (!/^Bearer\s+\S+$/i.test(authorization)) return null;
  const token = authorization.slice(7).trim();
  if (!token || (anonKey && constantTimeEqual(token, anonKey))) return null;

  // Path 1: Service Role Key
  if (serviceRoleKey && constantTimeEqual(token, serviceRoleKey)) {
    return {
      provider: "service_role",
      uid: "service_role",
      email: null,
      emailVerified: true,
      supabaseUserClient: service,
    };
  }

  // Path 2: Firebase RS256 ID Token (dactor-ea1e1)
  const parts = token.split(".");
  if (parts.length === 3) {
    const untrustedPayload = decodeBase64UrlJson(parts[1]);
    if (
      untrustedPayload?.iss === FIREBASE_ISSUER &&
      untrustedPayload?.aud === FIREBASE_PROJECT_ID
    ) {
      try {
        return await verifyFirebaseIdToken(token);
      } catch {
        return null;
      }
    }
  }

  // Path 3: Supabase Auth JWT validated by GoTrue
  try {
    const { data, error } = await service.auth.getUser(token);
    if (error || !data?.user) return null;
    const supabaseUserClient = createClient(supabaseUrl, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: authorization } },
    });
    return {
      provider: "supabase",
      uid: data.user.id,
      email: data.user.email ? data.user.email.toLowerCase().trim() : null,
      emailVerified: Boolean(data.user.email_confirmed_at),
      supabaseUserClient,
    };
  } catch {
    return null;
  }
}

export async function isVerifiedAdmin(
  caller: VerifiedCaller,
  service: SupabaseClient
): Promise<boolean> {
  if (caller.provider === "service_role") return true;

  if (caller.provider === "supabase" && caller.supabaseUserClient) {
    const { data, error } = await caller.supabaseUserClient.rpc("is_admin_portal_user");
    if (!error && data === true) return true;
  }

  const adminRoles = new Set(["admin", "super_admin", "platform_admin"]);

  try {
    const uidCol = caller.provider === "firebase" ? "firebase_uid" : "auth_uid";
    const { data: byUid } = await service
      .from("profiles")
      .select("role")
      .eq(uidCol, caller.uid)
      .maybeSingle();
    if (byUid?.role && adminRoles.has(String(byUid.role).toLowerCase())) {
      return true;
    }
  } catch {
    // Non-fatal if firebase_uid column is absent
  }

  if (caller.emailVerified && caller.email) {
    const { data: byEmail } = await service
      .from("profiles")
      .select("role")
      .ilike("email", caller.email)
      .maybeSingle();
    if (byEmail?.role && adminRoles.has(String(byEmail.role).toLowerCase())) {
      return true;
    }
  }

  return false;
}

export async function isVerifiedClinicStaff(
  caller: VerifiedCaller,
  clinicId: string,
  service: SupabaseClient
): Promise<boolean> {
  if (caller.provider === "service_role") return true;
  if (!clinicId || !/^[0-9a-f-]{36}$/i.test(clinicId)) return false;

  if (caller.provider === "supabase" && caller.supabaseUserClient) {
    const [clinicRes, adminRes] = await Promise.all([
      caller.supabaseUserClient.rpc("is_authorized_clinic_staff", { p_clinic_id: clinicId }),
      caller.supabaseUserClient.rpc("is_admin_portal_user"),
    ]);
    if (
      (!clinicRes.error && clinicRes.data === true) ||
      (!adminRes.error && adminRes.data === true)
    ) {
      return true;
    }
  }

  if (await isVerifiedAdmin(caller, service)) return true;

  if (caller.emailVerified && caller.email) {
    // 1. Clinic primary contact_email
    const { data: clinicRow } = await service
      .from("clinics")
      .select("contact_email")
      .eq("id", clinicId)
      .maybeSingle();
    if (
      clinicRow?.contact_email &&
      clinicRow.contact_email.toLowerCase().trim() === caller.email
    ) {
      return true;
    }

    // 2. Accepted clinic_invitations
    const { data: inviteRow } = await service
      .from("clinic_invitations")
      .select("id")
      .eq("clinic_id", clinicId)
      .eq("status", "accepted")
      .ilike("email", caller.email)
      .maybeSingle();
    if (inviteRow?.id) return true;

    // 3. Affiliated doctors matching verified email
    const { data: docByEmail } = await service
      .from("doctors")
      .select("id")
      .or(
        `clinic_id.eq.${clinicId},active_clinic_id.eq.${clinicId},primary_clinic_id.eq.${clinicId}`
      )
      .ilike("email", caller.email)
      .limit(1)
      .maybeSingle();
    if (docByEmail?.id) return true;
  }

  // 4. Affiliated doctors matching profiles.firebase_uid / profiles.auth_uid
  try {
    const uidCol = caller.provider === "firebase" ? "firebase_uid" : "auth_uid";
    const { data: profileRow } = await service
      .from("profiles")
      .select("id")
      .eq(uidCol, caller.uid)
      .maybeSingle();
    if (profileRow?.id) {
      const { data: docByProfile } = await service
        .from("doctors")
        .select("id")
        .or(
          `clinic_id.eq.${clinicId},active_clinic_id.eq.${clinicId},primary_clinic_id.eq.${clinicId}`
        )
        .eq("user_id", profileRow.id)
        .limit(1)
        .maybeSingle();
      if (docByProfile?.id) return true;
    }
  } catch {
    // Non-fatal if firebase_uid column is absent
  }

  return false;
}

export async function isVerifiedDoctor(
  caller: VerifiedCaller,
  doctorId: string,
  service: SupabaseClient
): Promise<boolean> {
  if (caller.provider === "service_role") return true;
  if (!doctorId || !/^[0-9a-f-]{36}$/i.test(doctorId)) return false;

  if (caller.provider === "supabase" && caller.supabaseUserClient) {
    const { data, error } = await caller.supabaseUserClient.rpc("is_authorized_doctor", {
      p_doctor_id: doctorId,
    });
    if (!error && data === true) return true;
  }

  if (caller.emailVerified && caller.email) {
    const { data: docRow } = await service
      .from("doctors")
      .select("id")
      .eq("id", doctorId)
      .ilike("email", caller.email)
      .maybeSingle();
    if (docRow?.id) return true;
  }

  try {
    const uidCol = caller.provider === "firebase" ? "firebase_uid" : "auth_uid";
    const { data: profileRow } = await service
      .from("profiles")
      .select("id")
      .eq(uidCol, caller.uid)
      .maybeSingle();
    if (profileRow?.id) {
      const { data: docRow } = await service
        .from("doctors")
        .select("id")
        .eq("id", doctorId)
        .eq("user_id", profileRow.id)
        .maybeSingle();
      if (docRow?.id) return true;
    }
  } catch {
    // Non-fatal
  }

  return false;
}

export async function isVerifiedPatientForAppointment(
  caller: VerifiedCaller,
  appointmentId: string,
  service: SupabaseClient
): Promise<boolean> {
  if (caller.provider === "service_role") return true;
  if (!appointmentId || !/^[0-9a-f-]{36}$/i.test(appointmentId)) return false;

  if (caller.provider === "supabase" && caller.supabaseUserClient) {
    const { data, error } = await caller.supabaseUserClient.rpc(
      "is_current_patient_for_appointment",
      { p_appointment_id: appointmentId }
    );
    if (!error && data === true) return true;
  }

  const { data: apptRow } = await service
    .from("appointments")
    .select("user_id, patient_email")
    .eq("id", appointmentId)
    .maybeSingle();
  if (!apptRow) return false;

  if (
    caller.emailVerified &&
    caller.email &&
    apptRow.patient_email &&
    apptRow.patient_email.toLowerCase().trim() === caller.email
  ) {
    return true;
  }

  if (apptRow.user_id) {
    try {
      const uidCol = caller.provider === "firebase" ? "firebase_uid" : "auth_uid";
      const { data: profileRow } = await service
        .from("profiles")
        .select("id")
        .eq(uidCol, caller.uid)
        .maybeSingle();
      if (profileRow?.id && profileRow.id === apptRow.user_id) return true;
    } catch {
      // Non-fatal
    }
  }

  return false;
}
