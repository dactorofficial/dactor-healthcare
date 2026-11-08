import { createClient } from "npm:@supabase/supabase-js@2";

const DEFAULT_ALLOWED_ORIGINS = [
  "https://dactorofficial.github.io",
  "https://rajanpurbe.github.io",
  "http://localhost:5173",
  "http://localhost:5174",
  "http://localhost:3000",
  "http://127.0.0.1:5173",
  "http://127.0.0.1:5174",
  "http://127.0.0.1:3000",
];

function getAllowedOrigins(): Set<string> {
  const envOrigins = (Deno.env.get("ALLOWED_ORIGINS") || "")
    .split(",")
    .map((s) => s.trim().replace(/\/+$/, ""))
    .filter(Boolean);
  return new Set([...DEFAULT_ALLOWED_ORIGINS.map((s) => s.replace(/\/+$/, "")), ...envOrigins]);
}

function isOriginAllowed(origin: string, allowedSet: Set<string>): boolean {
  if (!origin || typeof origin !== "string") return false;
  const clean = origin.trim().replace(/\/+$/, "");
  if (clean === "*" || clean === "null" || !/^https?:\/\//i.test(clean)) return false;
  try {
    const parsed = new URL(clean);
    if (parsed.username || parsed.password || parsed.search || parsed.hash) return false;
    if (allowedSet.has(clean)) return true;
    if (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1") {
      const port = parseInt(parsed.port, 10);
      if (port >= 1024 && port <= 65535) return true;
    }
    return false;
  } catch {
    return false;
  }
}

function getCorsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("Origin") ?? "";
  const allowedSet = getAllowedOrigins();
  const allowed = isOriginAllowed(origin, allowedSet);
  return {
    "Access-Control-Allow-Origin": allowed ? origin : "",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Credentials": "true",
    "Vary": "Origin",
    "Cache-Control": "no-store",
  };
}

function json(body: unknown, status = 200, corsHeaders: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" },
  });
}

// -----------------------------------------------------------------------------
// Google OAuth 2.0 WebCrypto Service Account Token Minting (Zero-Expiry)
// -----------------------------------------------------------------------------

function base64UrlEncode(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function pemToBinary(pem: string): Uint8Array {
  const cleanPem = pem
    .replace(/-----BEGIN[ A-Z_-]+-----/g, "")
    .replace(/-----END[ A-Z_-]+-----/g, "")
    .replace(/\s+/g, "");
  const binary = atob(cleanPem);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

let cachedAccessToken = "";
let cachedTokenExpiryEpochMs = 0;

async function mintServiceAccountToken(serviceAccount: {
  client_email: string;
  private_key: string;
}): Promise<{ token: string; expiresIn: number }> {
  const keyBytes = pemToBinary(serviceAccount.private_key);
  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8",
    keyBytes,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const payload = {
    iss: serviceAccount.client_email,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: "https://oauth2.googleapis.com/token",
    exp: now + 3600,
    iat: now,
  };

  const enc = new TextEncoder();
  const unsignedToken = `${base64UrlEncode(enc.encode(JSON.stringify(header)))}.${base64UrlEncode(enc.encode(JSON.stringify(payload)))}`;
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    cryptoKey,
    enc.encode(unsignedToken)
  );
  const jwt = `${unsignedToken}.${base64UrlEncode(signature)}`;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Google OAuth2 exchange failed: ${res.status} ${errText}`);
  }

  const data = await res.json();
  return {
    token: data.access_token,
    expiresIn: data.expires_in ?? 3600,
  };
}

async function getFirebaseAccessToken(): Promise<string> {
  if (cachedAccessToken && Date.now() < cachedTokenExpiryEpochMs) {
    return cachedAccessToken;
  }

  const serviceAccountJson = Deno.env.get("FIREBASE_SERVICE_ACCOUNT");
  if (serviceAccountJson) {
    try {
      const sa = typeof serviceAccountJson === "string" && serviceAccountJson.trim().startsWith("{")
        ? JSON.parse(serviceAccountJson)
        : JSON.parse(atob(serviceAccountJson.trim()));
      if (sa.client_email && sa.private_key) {
        const { token, expiresIn } = await mintServiceAccountToken(sa);
        cachedAccessToken = token;
        cachedTokenExpiryEpochMs = Date.now() + (expiresIn - 300) * 1000;
        return cachedAccessToken;
      }
    } catch (e) {
      console.error("Failed to mint service account token, falling back to static token if available:", e);
    }
  }

  const staticToken = Deno.env.get("FIREBASE_ACCESS_TOKEN");
  if (staticToken) {
    return staticToken.trim();
  }

  throw new Error("Neither FIREBASE_SERVICE_ACCOUNT nor FIREBASE_ACCESS_TOKEN is configured");
}

async function sendFcmMessage(
  endpoint: string,
  accessToken: string,
  target: { token?: string; topic?: string },
  title: string,
  body: string,
  dataPayload: Record<string, string>,
  channelId: string = "dactor_medical_alerts"
): Promise<boolean> {
  try {
    const stringDataPayload: Record<string, string> = {};
    for (const [k, v] of Object.entries(dataPayload || {})) {
      if (v !== null && v !== undefined) {
        stringDataPayload[k] = String(v);
      }
    }
    stringDataPayload["title"] = title;
    stringDataPayload["message"] = body;
    stringDataPayload["body"] = body;

    const messageObj: Record<string, unknown> = {
      notification: { title, body },
      data: stringDataPayload,
      android: {
        priority: "high",
        notification: {
          channel_id: channelId,
          sound: "default",
          default_vibrate_timings: true,
          default_light_settings: true,
          priority: "high",
          notification_priority: "PRIORITY_MAX",
        },
      },
    };
    if (target.token) {
      messageObj.token = target.token;
    } else if (target.topic) {
      messageObj.topic = target.topic;
    }

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ message: messageObj }),
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.warn("FCM v1 send failed:", response.status, errText);
      return false;
    }
    return true;
  } catch (err) {
    console.error("FCM dispatch error:", err);
    return false;
  }
}

// -----------------------------------------------------------------------------
// Main Edge Function Handler
// -----------------------------------------------------------------------------

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405, corsHeaders);

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!supabaseUrl || !anonKey || !serviceKey) {
    return json({ error: "Notification service unavailable" }, 503, corsHeaders);
  }

  try {
    const authorization = req.headers.get("Authorization") ?? "";
    if (!/^Bearer\s+\S+$/i.test(authorization)) {
      return json({ error: "Sign-in required" }, 401, corsHeaders);
    }

    const tokenPart = authorization.replace(/^Bearer\s+/i, "").trim();
    const isServiceRole = (tokenPart === serviceKey);
    const isAnonToken = (tokenPart === anonKey);

    const user = createClient(supabaseUrl, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: authorization } },
    });
    const service = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    let isTrustedUser = false;
    let isAdminUser = isServiceRole;

    if (!isServiceRole && !isAnonToken) {
      try {
        const { data: trusted } = await user.rpc("is_trusted_application_identity");
        if (trusted === true) isTrustedUser = true;
        const { data: admin } = await user.rpc("is_admin_portal_user");
        if (admin === true) isAdminUser = true;
      } catch (_) {}
    }

    const body = await req.json();
    const appointmentId = typeof body?.appointmentId === "string" ? body.appointmentId.trim() : "";
    const clinicId = typeof body?.clinicId === "string" ? body.clinicId.trim() : "";
    const title = typeof body?.title === "string" ? body.title.trim().slice(0, 120) : "";
    const message = typeof body?.message === "string" ? body.message.trim().slice(0, 1000) : "";
    const type = typeof body?.type === "string" && /^[a-z0-9_-]{1,40}$/i.test(body.type)
      ? body.type
      : "queue_alert";

    if (!title || !message) {
      return json({ error: "Title and message are required" }, 400, corsHeaders);
    }

    const projectId = Deno.env.get("FIREBASE_PROJECT_ID") || "dactor-ea1e1";
    let accessToken = "";
    try {
      accessToken = await getFirebaseAccessToken();
    } catch (eToken) {
      console.error("Token resolution error:", eToken);
      return json({ error: "Notification provider is not configured" }, 503, corsHeaders);
    }

    const endpoint = `https://fcm.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/messages:send`;
    let sentCount = 0;

    const broadcastAll = body?.broadcastAll === true || body?.targetAudience === "all_users" || (!clinicId && !appointmentId);

    // -------------------------------------------------------------------------
    // Scenario 0: Global / All-Users Broadcast Alert (Super Admin / Broadcast Desk)
    // -------------------------------------------------------------------------
    if (broadcastAll && !appointmentId) {
      let authorized = isAdminUser;

      if (!authorized && clinicId && isTrustedUser) {
        const { data: staff, error: staffError } = await user.rpc("is_authorized_clinic_staff", {
          p_clinic_id: clinicId,
        });
        if (staff === true && !staffError) authorized = true;
      }

      if (!authorized && clinicId) {
        const callerEmail = typeof body?.clinicEmail === "string" ? body.clinicEmail.trim().toLowerCase() : "";
        if (callerEmail) {
          const { data: clinicRow } = await service
            .from("clinics")
            .select("id")
            .eq("id", clinicId)
            .ilike("email", callerEmail)
            .maybeSingle();
          if (clinicRow) authorized = true;
        } else {
          const { data: clinicRow } = await service
            .from("clinics")
            .select("id")
            .eq("id", clinicId)
            .maybeSingle();
          if (clinicRow) authorized = true;
        }
      }

      if (!authorized) {
        return json({ error: "Not authorized for broadcast" }, 403, corsHeaders);
      }

      const rateLimitKey = clinicId ? `fcm:broadcast:${clinicId}` : "fcm:broadcast:all_users";
      const { data: allowed, error: rateError } = await service.rpc("consume_security_rate_limit", {
        p_key: rateLimitKey,
        p_limit: 20,
        p_window_seconds: 300,
      });
      // Fail-open: only block if rate limit explicitly evaluated to false without error
      if (!rateError && allowed === false) {
        return json({ error: "Notification rate limit exceeded" }, 429, corsHeaders);
      }

      // 0a. Dispatch to "all_users" topic (all patient devices subscribe to this)
      const okAll = await sendFcmMessage(
        endpoint,
        accessToken,
        { topic: "all_users" },
        title,
        message,
        { type, clinic_id: clinicId || "", title, message }
      );
      if (okAll) sentCount += 1;

      // 0b. Dispatch to "patients" topic
      const okPatients = await sendFcmMessage(
        endpoint,
        accessToken,
        { topic: "patients" },
        title,
        message,
        { type, clinic_id: clinicId || "", title, message }
      );
      if (okPatients) sentCount += 1;

      // 0c. If clinicId is provided, also dispatch to clinic topic
      if (clinicId) {
        const okClinic = await sendFcmMessage(
          endpoint,
          accessToken,
          { topic: `clinic_${clinicId}` },
          title,
          message,
          { type, clinic_id: clinicId, title, message }
        );
        if (okClinic) sentCount += 1;
      }

      // 0d. Direct token sweep for registered devices
      try {
        const { data: tokens } = await service
          .from("fcm_tokens")
          .select("token")
          .order("updated_at", { ascending: false })
          .limit(100);

        if (tokens && tokens.length > 0) {
          const uniqueTokens = [...new Set(tokens.map((r) => r.token).filter((t): t is string => typeof t === "string" && t.length > 20))];
          for (const tok of uniqueTokens) {
            const ok = await sendFcmMessage(
              endpoint,
              accessToken,
              { token: tok },
              title,
              message,
              { type, clinic_id: clinicId || "", title, message }
            );
            if (ok) sentCount += 1;
          }
        }
      } catch (eSweep) {
        console.warn("Direct token sweep error in global broadcast:", eSweep);
      }

      return json({ sentCount, mode: "all_users_broadcast" }, 200, corsHeaders);
    }

    // -------------------------------------------------------------------------
    // Scenario 1: Clinic Broadcast Alert (to entire clinic)
    // -------------------------------------------------------------------------
    if (clinicId && !appointmentId) {
      let authorized = isAdminUser;
      if (!authorized && isTrustedUser) {
        const { data: authStaff } = await user.rpc("is_authorized_clinic_staff", {
          p_clinic_id: clinicId,
        });
        if (authStaff === true) authorized = true;
      }
      if (!authorized) {
        const callerEmail = typeof body?.clinicEmail === "string" ? body.clinicEmail.trim().toLowerCase() : "";
        if (callerEmail) {
          const { data: clinicRow } = await service
            .from("clinics")
            .select("id")
            .eq("id", clinicId)
            .ilike("email", callerEmail)
            .maybeSingle();
          if (clinicRow) authorized = true;
        } else {
          const { data: clinicRow } = await service
            .from("clinics")
            .select("id")
            .eq("id", clinicId)
            .maybeSingle();
          if (clinicRow) authorized = true;
        }
      }

      if (!authorized) {
        return json({ error: "Not authorized to broadcast for this clinic" }, 403, corsHeaders);
      }

      const { data: allowed, error: rateError } = await service.rpc("consume_security_rate_limit", {
        p_key: `fcm:broadcast:${clinicId}`,
        p_limit: 20,
        p_window_seconds: 300,
      });
      // Fail-open: only block if rate limit explicitly evaluated to false without error
      if (!rateError && allowed === false) {
        return json({ error: "Notification rate limit exceeded" }, 429, corsHeaders);
      }

      // 1a. Dispatch to clinic FCM topic (instant broadcast to all subscribed devices)
      const topicSuccess = await sendFcmMessage(
        endpoint,
        accessToken,
        { topic: `clinic_${clinicId}` },
        title,
        message,
        {
          type,
          clinic_id: clinicId,
          title,
          message,
        },
        "dactor_clinic_alerts"
      );
      if (topicSuccess) sentCount += 1;

      // 1b. Additionally, find today's active appointments for this clinic and push to their device tokens
      try {
        const todayStr = new Date().toISOString().slice(0, 10);
        const { data: todayAppts } = await service
          .from("appointments")
          .select("id, tracking_code_10_digit, user_id, patient_mobile")
          .eq("clinic_id", clinicId)
          .eq("appointment_date", todayStr)
          .limit(100);

        if (todayAppts && todayAppts.length > 0) {
          const codes = todayAppts.map((a) => a.tracking_code_10_digit).filter(Boolean);
          const uids = todayAppts.map((a) => a.user_id).filter(Boolean);
          const phones = todayAppts.map((a) => a.patient_mobile).filter(Boolean);

          const { data: directTokens } = await service
            .from("fcm_tokens")
            .select("token")
            .or(`tracking_code.in.(${codes.join(",")}),user_id.in.(${uids.join(",")}),patient_mobile.in.(${phones.join(",")})`)
            .limit(50);

          if (directTokens) {
            const uniqueTokens = [...new Set(directTokens.map((r) => r.token).filter((t): t is string => typeof t === "string" && t.length > 20))];
            for (const tok of uniqueTokens) {
              const ok = await sendFcmMessage(
                endpoint,
                accessToken,
                { token: tok },
                title,
                message,
                { type, clinic_id: clinicId, title, message }
              );
              if (ok) sentCount += 1;
            }
          }
        }
      } catch (eActive) {
        console.warn("Direct token sweep error in broadcast:", eActive);
      }

      return json({ sentCount, mode: "clinic_broadcast" }, 200, corsHeaders);
    }

    // -------------------------------------------------------------------------
    // Scenario 2: Targeted Appointment Notification
    // -------------------------------------------------------------------------
    if (!appointmentId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(appointmentId)) {
      return json({ error: "A valid appointmentId or clinicId is required" }, 400, corsHeaders);
    }

    const { data: appointment, error: appointmentError } = await service
      .from("appointments")
      .select("id, clinic_id, tracking_code_10_digit, user_id, patient_mobile")
      .eq("id", appointmentId)
      .maybeSingle();

    if (appointmentError || !appointment) {
      return json({ error: "Appointment unavailable" }, 404, corsHeaders);
    }

    let authorized = isAdminUser;
    if (!authorized && isTrustedUser) {
      const { data: authStaff } = await user.rpc("is_authorized_clinic_staff", {
        p_clinic_id: appointment.clinic_id,
      });
      if (authStaff === true) authorized = true;
    }
    if (!authorized) {
      const { data: clinicRow } = await service
        .from("clinics")
        .select("id")
        .eq("id", appointment.clinic_id)
        .maybeSingle();
      if (clinicRow) authorized = true;
    }

    if (!authorized) {
      return json({ error: "Not authorized to notify this appointment" }, 403, corsHeaders);
    }

    const code = String(appointment.tracking_code_10_digit ?? "");
    const uid = appointment.user_id ? String(appointment.user_id) : "";
    const phone = appointment.patient_mobile ? String(appointment.patient_mobile) : "";

    const { data: allowed, error: rateError } = await service.rpc("consume_security_rate_limit", {
      p_key: `fcm:${appointment.clinic_id}:${appointment.id}`,
      p_limit: 15,
      p_window_seconds: 300,
    });
    // Fail-open: only block if rate limit explicitly evaluated to false without error
    if (!rateError && allowed === false) {
      return json({ error: "Notification rate limit exceeded" }, 429, corsHeaders);
    }

    // Multi-criteria device token resolution: tracking_code OR user_id OR patient_mobile
    const conditions: string[] = [];
    if (/^\d{10}$/.test(code)) conditions.push(`tracking_code.eq.${code}`);
    const bodyTrackingCode = typeof body?.trackingCode === "string" ? body.trackingCode.trim() : "";
    if (/^\d{10}$/.test(bodyTrackingCode) && !conditions.includes(`tracking_code.eq.${bodyTrackingCode}`)) {
      conditions.push(`tracking_code.eq.${bodyTrackingCode}`);
    }
    if (uid && /^[0-9a-f-]{36}$/i.test(uid)) conditions.push(`user_id.eq.${uid}`);
    if (phone && phone.length >= 8) conditions.push(`patient_mobile.eq.${phone}`);

    if (conditions.length === 0) {
      return json({ sentCount: 0, reason: "No identifier for appointment" }, 200, corsHeaders);
    }

    const { data: tokenRows, error: tokenError } = await service
      .from("fcm_tokens")
      .select("token")
      .or(conditions.join(","))
      .limit(10);

    if (tokenError) {
      console.error("Token lookup error:", tokenError);
      return json({ error: "Notification service unavailable" }, 503, corsHeaders);
    }

    const tokens = [
      ...new Set(
        (tokenRows ?? [])
          .map((row) => row.token)
          .filter((token): token is string => typeof token === "string" && token.length > 20)
      ),
    ];

    const directTargetToken = typeof body?.targetToken === "string" && body.targetToken.trim().length > 20
      ? body.targetToken.trim()
      : "";
    if (directTargetToken && !tokens.includes(directTargetToken)) {
      tokens.push(directTargetToken);
    }

    if (!tokens.length) {
      return json({ sentCount: 0, reason: "No registered device token found" }, 200, corsHeaders);
    }

    const dataPayload: Record<string, string> = {
      type,
      tracking_code: code,
      appointment_id: appointment.id,
      title,
      message,
    };

    for (const token of tokens) {
      const ok = await sendFcmMessage(endpoint, accessToken, { token }, title, message, dataPayload, "dactor_medical_alerts");
      if (ok) sentCount += 1;
    }

    // Never return device tokens or upstream provider bodies to caller
    return json({ sentCount, mode: "targeted_appointment" }, 200, corsHeaders);
  } catch (error) {
    console.error("send-fcm-alert failed", error);
    return json({ error: "Notification service could not complete this request" }, 500, corsHeaders);
  }
});
