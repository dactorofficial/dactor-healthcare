import { createClient } from "npm:@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

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
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Credentials": "true",
    "Vary": "Origin",
    "Cache-Control": "no-store",
  };
}

type DocumentType = "lab_report" | "doctor_kyc" | "clinic_doc";

function json(body: unknown, status = 200, corsHeaders: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" },
  });
}

function getSafeStoragePath(raw: unknown, bucket: string): string | null {
  if (typeof raw !== "string" || raw.trim().length === 0 || raw.length > 4096) return null;
  let path = raw.trim();

  if (/^https?:\/\//i.test(path)) {
    try {
      const parsed = new URL(path);
      const expected = new URL(supabaseUrl);
      if (parsed.origin !== expected.origin) return null;
      const match = parsed.pathname.match(/^\/storage\/v1\/object\/(?:public|sign|authenticated)\/([^/]+)\/(.+)$/);
      if (!match || match[1] !== bucket) return null;
      path = match[2];
    } catch {
      return null;
    }
  }

  try {
    path = decodeURIComponent(path.split("?", 1)[0]);
  } catch {
    return null;
  }
  path = path.replace(/^\/+/, "");
  if (path.startsWith(`${bucket}/`)) path = path.slice(bucket.length + 1);
  if (!path || path.length > 1024 || path.includes("\\") || /[\u0000-\u001f]/.test(path)) return null;
  const segments = path.split("/");
  if (segments.some((segment) => !segment || segment === "." || segment === "..")) return null;
  return path;
}

async function rpcBoolean(client: ReturnType<typeof createClient>, fn: string, args: Record<string, unknown> = {}) {
  const { data, error } = await client.rpc(fn, args);
  return !error && data === true;
}

Deno.serve(async (req: Request) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ authorized: false, error: "Method not allowed" }, 405, corsHeaders);
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    console.error("document-access missing required Supabase environment configuration");
    return json({ authorized: false, error: "Document service unavailable" }, 503, corsHeaders);
  }

  try {
    const body = await req.json();
    const action = typeof body?.action === "string" ? body.action.trim() : "";

    // -------------------------------------------------------------------------
    // ACTION: authorize_upload
    // -------------------------------------------------------------------------
    if (action === "authorize_upload") {
      const documentType = body?.documentType as DocumentType;
      const entityId = typeof body?.entityId === "string" ? body.entityId.trim() : "";
      const rawFileName = typeof body?.fileName === "string" ? body.fileName.trim() : "";
      const rawMime = typeof body?.mimeType === "string" ? body.mimeType.trim().toLowerCase() : "";
      const fileSize = body?.fileSize;

      if (!["lab_report", "doctor_kyc", "clinic_doc"].includes(documentType)) {
        return json({ authorized: false, error: "Invalid document type" }, 400, corsHeaders);
      }
      if (!entityId) {
        return json({ authorized: false, error: "A valid entityId is required" }, 400, corsHeaders);
      }

      // Caller authentication: verify JWT and check is_trusted_application_identity
      const authHeader = req.headers.get("Authorization") ?? "";
      if (!/^Bearer\s+\S+$/i.test(authHeader)) {
        return json({ authorized: false, error: "Sign-in required" }, 401, corsHeaders);
      }
      const service = createClient(supabaseUrl, serviceRoleKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const user = createClient(supabaseUrl, anonKey, {
        auth: { persistSession: false, autoRefreshToken: false },
        global: { headers: { Authorization: authHeader } },
      });
      const trustedIdentity = await rpcBoolean(user, "is_trusted_application_identity");
      if (!trustedIdentity) {
        return json({ authorized: false, error: "Sign-in required" }, 401, corsHeaders);
      }
      const isAdmin = await rpcBoolean(user, "is_admin_portal_user");

      // Entity ownership checks
      let isAuthorized = isAdmin;
      if (!isAuthorized) {
        if (documentType === "lab_report") {
          isAuthorized = await rpcBoolean(user, "is_authorized_clinic_staff", { p_clinic_id: entityId });
          if (!isAuthorized) {
            return json({ authorized: false, error: "Not authorized for this clinic" }, 403, corsHeaders);
          }
        } else if (documentType === "doctor_kyc") {
          const isDoc = await rpcBoolean(user, "is_authorized_doctor", { p_doctor_id: entityId });
          let isClinicStaff = false;
          const { data: doc } = await service.from("doctors").select("clinic_id").eq("id", entityId).maybeSingle();
          if (doc?.clinic_id) {
            isClinicStaff = await rpcBoolean(user, "is_authorized_clinic_staff", { p_clinic_id: doc.clinic_id });
          }
          isAuthorized = isDoc || isClinicStaff;
          if (!isAuthorized) {
            return json({ authorized: false, error: "Not authorized for this doctor KYC" }, 403, corsHeaders);
          }
        } else if (documentType === "clinic_doc") {
          isAuthorized = await rpcBoolean(user, "is_authorized_clinic_staff", { p_clinic_id: entityId });
          if (!isAuthorized) {
            return json({ authorized: false, error: "Not authorized for this clinic document" }, 403, corsHeaders);
          }
        }
      }

      // MIME allowlist check
      const ALLOWED_MIME_TYPES = new Map<string, string>([
        ["application/pdf", "pdf"],
        ["image/jpeg", "jpg"],
        ["image/png", "png"],
        ["image/webp", "webp"],
      ]);
      const ext = ALLOWED_MIME_TYPES.get(rawMime);
      if (!ext) {
        return json({ authorized: false, error: "Unsupported file type. Only PDF, JPG, PNG, and WebP are accepted." }, 400, corsHeaders);
      }

      // Prohibit executable and dangerous script file extensions
      const extMatch = rawFileName.match(/\.([a-zA-Z0-9]+)$/);
      const fileExt = extMatch ? extMatch[1].toLowerCase() : "";
      if (fileExt && ["exe", "bat", "sh", "js", "html", "svg", "cmd", "msi"].includes(fileExt)) {
        return json({ authorized: false, error: "Executable and script file extensions are prohibited" }, 400, corsHeaders);
      }

      // File size check: strictly positive integer <= 10MB (10485760 bytes)
      const MAX_FILE_SIZE = 10485760;
      if (typeof fileSize !== "number" || !Number.isInteger(fileSize) || fileSize <= 0 || fileSize > MAX_FILE_SIZE) {
        return json({ authorized: false, error: "File size exceeds the 10MB limit or is invalid." }, 400, corsHeaders);
      }

      // Bucket mapping
      const bucketMap: Record<DocumentType, string> = {
        lab_report: "lab-reports-private",
        doctor_kyc: "doctor-kyc-private",
        clinic_doc: "clinic-docs-private",
      };
      const bucket = bucketMap[documentType];

      // Non-guessable storage path generation: ${cleanEntity}/${uuid}.${ext}
      const cleanEntity = entityId.replace(/[^a-zA-Z0-9_-]/g, "");
      if (!cleanEntity) {
        return json({ authorized: false, error: "Invalid entity identifier" }, 400, corsHeaders);
      }
      const storagePath = `${cleanEntity}/${crypto.randomUUID()}.${ext}`;

      // Generate signed upload URL via Supabase Storage admin client
      const { data: uploadData, error: uploadError } = await service.storage
        .from(bucket)
        .createSignedUploadUrl(storagePath);
      if (uploadError || !uploadData?.signedUrl) {
        console.error("Storage upload signing failed", { bucket, storagePath, error: uploadError?.message });
        return json({ authorized: false, error: "Failed to generate upload authorization" }, 503, corsHeaders);
      }

      return json({
        authorized: true,
        bucket,
        path: storagePath,
        token: uploadData.token,
        signedUrl: uploadData.signedUrl,
      }, 200, corsHeaders);
    }

    // -------------------------------------------------------------------------
    // ACTION: authorize_access (Default Document Download / View Flow)
    // -------------------------------------------------------------------------
    const documentType = body?.documentType as DocumentType;
    const documentId = typeof body?.documentId === "string" ? body.documentId.trim() : "";
    const trackingCode = typeof body?.trackingCode === "string" ? body.trackingCode.trim() : "";
    const patientPhone = typeof body?.patientPhone === "string" ? body.patientPhone.trim() : "";
    const fileField = body?.fileField === "certificates_doc" ? "certificates_doc_url" : "license_doc_url";
    const expiry = Number(body?.expiresIn);
    const expiresIn = Number.isFinite(expiry) ? Math.max(60, Math.min(900, Math.floor(expiry))) : 900;

    if (!["lab_report", "doctor_kyc", "clinic_doc"].includes(documentType)) {
      return json({ authorized: false, error: "Invalid document type" }, 400, corsHeaders);
    }
    // File paths supplied by browsers are never used to choose the object to sign.
    if (body?.filePath) return json({ authorized: false, error: "Caller supplied file paths are not accepted" }, 400, corsHeaders);

    const authHeader = req.headers.get("Authorization") ?? "";
    const hasBearer = /^Bearer\s+\S+$/i.test(authHeader);
    const service = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const user = hasBearer
      ? createClient(supabaseUrl, anonKey, {
          auth: { persistSession: false, autoRefreshToken: false },
          global: { headers: { Authorization: authHeader } },
        })
      : null;
    const trustedIdentity = user ? await rpcBoolean(user, "is_trusted_application_identity") : false;
    const isAdmin = trustedIdentity && user ? await rpcBoolean(user, "is_admin_portal_user") : false;

    let bucket = "";
    let storagePath: string | null = null;
    let authorized = false;

    if (documentType === "lab_report") {
      bucket = "lab-reports-private";
      if (!documentId && !/^\d{10}$/.test(trackingCode)) {
        return json({ authorized: false, error: "A report ID or 10-digit tracking code is required" }, 400, corsHeaders);
      }
      if (trackingCode && !/^\d{10}$/.test(trackingCode)) {
        return json({ authorized: false, error: "Invalid tracking code" }, 400, corsHeaders);
      }

      let reportQuery = service.from("lab_reports")
        .select("id,file_url,clinic_id,appointment_id,appointments!inner(id,user_id,patient_email,tracking_code_10_digit)");
      if (documentId) reportQuery = reportQuery.eq("id", documentId);
      if (trackingCode) reportQuery = reportQuery.eq("appointments.tracking_code_10_digit", trackingCode);
      const { data: report, error } = await reportQuery.limit(1).maybeSingle();
      if (error || !report) return json({ authorized: false, error: "Document unavailable" }, 404, corsHeaders);

      const appt = Array.isArray(report.appointments) ? report.appointments[0] : report.appointments;
      if (!appt) return json({ authorized: false, error: "Document unavailable" }, 404, corsHeaders);
      storagePath = getSafeStoragePath(report.file_url, bucket);

      if (isAdmin) authorized = true;
      if (!authorized && trustedIdentity && user) {
        authorized = await rpcBoolean(user, "is_authorized_clinic_staff", { p_clinic_id: report.clinic_id })
          || await rpcBoolean(user, "is_current_patient_for_appointment", { p_appointment_id: appt.id });
      }
      if (!authorized && !trustedIdentity && trackingCode && patientPhone && user) {
        authorized = await rpcBoolean(user, "verify_guest_appointment_identity", {
          p_tracking_code: trackingCode,
          p_patient_phone: patientPhone,
        });
      }
      if (!authorized && !trustedIdentity && trackingCode && patientPhone && !user) {
        const guest = createClient(supabaseUrl, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
        authorized = await rpcBoolean(guest, "verify_guest_appointment_identity", {
          p_tracking_code: trackingCode,
          p_patient_phone: patientPhone,
        });
      }
    } else if (documentType === "doctor_kyc") {
      bucket = "doctor-kyc-private";
      if (!documentId || !user || !trustedIdentity) return json({ authorized: false, error: "Unauthorized" }, 403, corsHeaders);
      const { data: doctor, error } = await service.from("doctors")
        .select(`id,${fileField}`).eq("id", documentId).maybeSingle();
      if (error || !doctor) return json({ authorized: false, error: "Document unavailable" }, 404, corsHeaders);
      storagePath = getSafeStoragePath(doctor[fileField], bucket);
      authorized = isAdmin || await rpcBoolean(user, "is_authorized_doctor", { p_doctor_id: documentId });
    } else {
      bucket = "clinic-docs-private";
      if (!documentId || !user || !trustedIdentity) return json({ authorized: false, error: "Unauthorized" }, 403, corsHeaders);
      const { data: clinic, error } = await service.from("clinics")
        .select("id,registration_doc_url").eq("id", documentId).maybeSingle();
      if (error || !clinic) return json({ authorized: false, error: "Document unavailable" }, 404, corsHeaders);
      storagePath = getSafeStoragePath(clinic.registration_doc_url, bucket);
      authorized = isAdmin || await rpcBoolean(user, "is_authorized_clinic_staff", { p_clinic_id: documentId });
    }

    if (!authorized) return json({ authorized: false, error: "Unauthorized" }, 403, corsHeaders);
    if (!storagePath) return json({ authorized: false, error: "Document unavailable" }, 404, corsHeaders);

    const { data, error } = await service.storage.from(bucket).createSignedUrl(storagePath, expiresIn);
    if (error || !data?.signedUrl) {
      console.error("Storage refused document signing", { bucket, message: error?.message });
      return json({ authorized: false, error: "Document service unavailable" }, 503, corsHeaders);
    }
    return json({ authorized: true, signed_url: data.signedUrl, expires_at: new Date(Date.now() + expiresIn * 1000).toISOString() }, 200, corsHeaders);
  } catch (error) {
    console.error("document-access request failed", error);
    return json({ authorized: false, error: "Document service unavailable" }, 500, corsHeaders);
  }
});
