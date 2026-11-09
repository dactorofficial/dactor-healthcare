import { createClient } from "npm:@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const service = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
const encoder = new TextEncoder();

const SUPPORTED_GATEWAYS = ["esewa", "khalti", "fonepay", "connectips"] as const;
type GatewayId = (typeof SUPPORTED_GATEWAYS)[number];

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

type Attempt = {
  id: string;
  appointment_id: string;
  clinic_id: string;
  gateway: GatewayId;
  transaction_uuid: string;
  amount_npr: number;
  status: string;
  provider_reference?: string | null;
  provider_pidx?: string | null;
  client_return_url?: string | null;
  reconcile_attempts?: number | null;
};

type ClinicCredentials = {
  clinic_id: string;
  is_verified?: boolean;
  // eSewa
  esewa_enabled?: boolean;
  esewa_product_code?: string | null;
  esewa_secret_key?: string | null;
  esewa_environment?: "test" | "live";
  esewa_is_verified?: boolean;
  // Khalti
  khalti_enabled?: boolean;
  khalti_public_key?: string | null;
  khalti_secret_key?: string | null;
  khalti_environment?: "test" | "live";
  khalti_is_verified?: boolean;
  // Fonepay
  fonepay_enabled?: boolean;
  fonepay_merchant_code?: string | null;
  fonepay_secret_key?: string | null;
  fonepay_username?: string | null;
  fonepay_password?: string | null;
  fonepay_environment?: "test" | "live";
  fonepay_is_verified?: boolean;
  // ConnectIPS
  connectips_enabled?: boolean;
  connectips_merchant_id?: string | null;
  connectips_app_id?: string | null;
  connectips_app_name?: string | null;
  connectips_app_password?: string | null;
  connectips_private_key?: string | null;
  connectips_environment?: "test" | "live";
  connectips_is_verified?: boolean;
};

function isSupportedGateway(value: string): value is GatewayId {
  return (SUPPORTED_GATEWAYS as readonly string[]).includes(value);
}

function json(body: unknown, status = 200, corsHeaders: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" },
  });
}

function b64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function hex(bytes: Uint8Array): string {
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Generates a 20-char compact CSPRNG alphanumeric ID ("DC" + 18 chars).
 * Fits ConnectIPS TXNID (<=20 chars), Fonepay PRN (<=25 chars), Khalti & eSewa.
 */
function generateCompactTransactionId(): string {
  const alphabet = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const randomBytes = new Uint8Array(18);
  crypto.getRandomValues(randomBytes);
  let out = "DC";
  for (let i = 0; i < 18; i++) {
    out += alphabet[randomBytes[i] % alphabet.length];
  }
  return out;
}

async function hmacSha256Base64(message: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64(new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(message))));
}

async function hmacSha512Hex(message: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-512" }, false, ["sign"]);
  return hex(new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(message))));
}

function sameSignature(a: string, b: string): boolean {
  const left = a.trim();
  const right = b.trim();
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let i = 0; i < left.length; i++) diff |= left.charCodeAt(i) ^ right.charCodeAt(i);
  return diff === 0;
}

function signedMessage(data: Record<string, string>, names: string[]): string {
  return names.map((name) => `${name}=${data[name] ?? ""}`).join(",");
}

function formatNepalDate(mode: "fonepay" | "connectips"): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kathmandu",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const day = parts.find((p) => p.type === "day")?.value ?? "01";
  const month = parts.find((p) => p.type === "month")?.value ?? "01";
  const year = parts.find((p) => p.type === "year")?.value ?? "2026";
  return mode === "fonepay" ? `${month}/${day}/${year}` : `${day}-${month}-${year}`;
}

function pemToDer(pem: string): Uint8Array {
  const cleaned = pem
    .replace(/-----BEGIN [A-Z0-9\s]+-----/g, "")
    .replace(/-----END [A-Z0-9\s]+-----/g, "")
    .replace(/\s+/g, "");
  const bin = atob(cleaned);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

/**
 * Normalizes a ConnectIPS signing credential (either PKCS#8 PEM, PKCS#1 RSA PEM,
 * or Base64-encoded .pfx/.p12 + password) into a verified PKCS#8 PEM string.
 */
async function normalizeConnectIpsPrivateKeyPem(
  privateKeyPemInput: string,
  pfxBase64Input: string,
  pfxPassword: string
): Promise<string> {
  let candidatePem = privateKeyPemInput.trim();

  if (pfxBase64Input.trim()) {
    const forgeMod = await import("npm:node-forge@1.3.1");
    const forge = forgeMod.default ?? forgeMod;
    const rawB64 = pfxBase64Input.trim().replace(/^data:[^;]+;base64,/i, "").replace(/\s+/g, "");
    const p12Der = forge.util.decode64(rawB64);
    const p12Asn1 = forge.asn1.fromDer(p12Der);
    const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, false, pfxPassword || "");
    const keyBags = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[forge.pki.oids.pkcs8ShroudedKeyBag]
      || p12.getBags({ bagType: forge.pki.oids.keyBag })[forge.pki.oids.keyBag]
      || [];
    const bagWithKey = keyBags.find((b: { key?: unknown }) => Boolean(b?.key));
    if (!bagWithKey?.key) {
      throw new Error("No RSA private key found in the uploaded .pfx certificate");
    }
    const rsaAsn1 = forge.pki.privateKeyToAsn1(bagWithKey.key);
    const pkcs8Asn1 = forge.pki.wrapRsaPrivateKey(rsaAsn1);
    candidatePem = forge.pki.privateKeyInfoToPem(pkcs8Asn1).trim();
  } else if (candidatePem.includes("-----BEGIN RSA PRIVATE KEY-----")) {
    const forgeMod = await import("npm:node-forge@1.3.1");
    const forge = forgeMod.default ?? forgeMod;
    const privKey = forge.pki.privateKeyFromPem(candidatePem);
    const rsaAsn1 = forge.pki.privateKeyToAsn1(privKey);
    const pkcs8Asn1 = forge.pki.wrapRsaPrivateKey(rsaAsn1);
    candidatePem = forge.pki.privateKeyInfoToPem(pkcs8Asn1).trim();
  }

  if (!candidatePem.includes("-----BEGIN PRIVATE KEY-----")) {
    throw new Error("ConnectIPS requires a valid PKCS#8 PEM private key or a .pfx certificate file");
  }

  // Cryptographically validate import with WebCrypto RSASSA-PKCS1-v1_5 SHA-256
  await crypto.subtle.importKey(
    "pkcs8",
    pemToDer(candidatePem),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );
  return candidatePem;
}

async function signConnectIpsToken(message: string, pkcs8Pem: string): Promise<string> {
  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8",
    pemToDer(pkcs8Pem),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", cryptoKey, encoder.encode(message));
  return b64(new Uint8Array(sig));
}

async function getGlobalDemoMode(): Promise<boolean> {
  try {
    const { data } = await service
      .from("platform_payment_settings")
      .select("is_global_demo_mode")
      .eq("id", "global_config")
      .maybeSingle();
    return Boolean(data?.is_global_demo_mode);
  } catch {
    return false;
  }
}

async function getCredentials(clinicId: string): Promise<ClinicCredentials | null> {
  const { data } = await service.from("clinic_payment_credentials")
    .select("*")
    .eq("clinic_id", clinicId)
    .maybeSingle();
  if (!data) return null;
  const isGlobalDemo = await getGlobalDemoMode();
  if (isGlobalDemo) {
    return {
      ...(data as ClinicCredentials),
      esewa_environment: "test",
      khalti_environment: "test",
      fonepay_environment: "test",
      connectips_environment: "test",
    };
  }
  return data as ClinicCredentials | null;
}

function isGatewayUsableWithCreds(gateway: GatewayId, creds: ClinicCredentials | null): boolean {
  if (!creds) return false;
  switch (gateway) {
    case "esewa": {
      const verified = creds.esewa_is_verified ?? creds.is_verified ?? false;
      const enabled = creds.esewa_enabled ?? verified;
      return Boolean(enabled && verified && creds.esewa_product_code?.trim() && creds.esewa_secret_key?.trim());
    }
    case "khalti":
      return Boolean(creds.khalti_enabled && creds.khalti_is_verified && creds.khalti_secret_key?.trim());
    case "fonepay":
      return Boolean(
        creds.fonepay_enabled &&
        creds.fonepay_is_verified &&
        creds.fonepay_merchant_code?.trim() &&
        creds.fonepay_secret_key?.trim()
      );
    case "connectips":
      return Boolean(
        creds.connectips_enabled &&
        creds.connectips_is_verified &&
        creds.connectips_merchant_id?.trim() &&
        creds.connectips_app_id?.trim() &&
        creds.connectips_app_password?.trim() &&
        creds.connectips_private_key?.trim()
      );
  }
}

async function getAttemptByIdentifier(params: {
  attemptId?: string;
  transactionUuid?: string;
  pidx?: string;
}): Promise<Attempt | null> {
  const cols = "id,appointment_id,clinic_id,gateway,transaction_uuid,amount_npr,status,provider_reference,provider_pidx,client_return_url,reconcile_attempts";
  if (params.attemptId && /^[0-9a-f-]{36}$/i.test(params.attemptId.trim())) {
    const { data } = await service.from("appointment_payment_attempts")
      .select(cols).eq("id", params.attemptId.trim()).maybeSingle();
    if (data) return data as Attempt;
  }
  if (params.transactionUuid?.trim()) {
    const { data } = await service.from("appointment_payment_attempts")
      .select(cols).eq("transaction_uuid", params.transactionUuid.trim()).maybeSingle();
    if (data) return data as Attempt;
  }
  if (params.pidx?.trim()) {
    const { data } = await service.from("appointment_payment_attempts")
      .select(cols).eq("provider_pidx", params.pidx.trim()).maybeSingle();
    if (data) return data as Attempt;
  }
  return null;
}

async function callFinalizeRpc(attemptId: string, providerRef: string, verifiedAmount: number): Promise<boolean> {
  const { data, error } = await service.rpc("finalize_online_appointment_payment", {
    p_attempt_id: attemptId,
    p_provider_reference: providerRef,
    p_verified_amount: verifiedAmount,
  });
  if (!error && data === true) return true;

  // Backwards-compatibility fallback if migration_multi_gateway_payments.sql is pending
  const fallback = await service.rpc("finalize_esewa_appointment_payment", {
    p_attempt_id: attemptId,
    p_provider_reference: providerRef,
    p_verified_amount: verifiedAmount,
  });
  if (fallback.error || fallback.data !== true) {
    throw new Error(error?.message || fallback.error?.message || "Could not finalize verified online payment");
  }
  return true;
}

// =============================================================================
// SERVER-TO-SERVER GATEWAY VERIFICATION & ATOMIC FINALIZATION ADAPTERS
// =============================================================================

async function finalizeEsewa(attempt: Attempt, credentials: ClinicCredentials) {
  const pCode = credentials.esewa_product_code?.trim() ?? "";
  if (!pCode) return { status: "pending" as const, reference: null };

  const base = credentials.esewa_environment === "live"
    ? "https://epay.esewa.com.np/api/epay/transaction/status/"
    : "https://rc.esewa.com.np/api/epay/transaction/status/";
  const statusUrl = new URL(base);
  statusUrl.searchParams.set("product_code", pCode);
  statusUrl.searchParams.set("total_amount", Number(attempt.amount_npr).toFixed(2));
  statusUrl.searchParams.set("transaction_uuid", attempt.transaction_uuid);

  let provider: Record<string, unknown>;
  try {
    const response = await fetch(statusUrl, { method: "GET", signal: AbortSignal.timeout(12000) });
    if (!response.ok) return { status: "pending" as const, reference: null };
    provider = await response.json();
  } catch {
    return { status: "pending" as const, reference: null };
  }

  const amount = Number(provider.total_amount);
  const isMatch = provider.product_code === pCode
    && provider.transaction_uuid === attempt.transaction_uuid
    && Number.isFinite(amount)
    && Math.abs(amount - Number(attempt.amount_npr)) < 0.01;

  if (provider.status === "COMPLETE" && isMatch) {
    const refId = String(provider.ref_id ?? attempt.transaction_uuid);
    await callFinalizeRpc(attempt.id, refId, amount);
    await service.from("appointment_payment_attempts").update({
      provider_response: provider,
      updated_at: new Date().toISOString(),
    }).eq("id", attempt.id);
    return { status: "complete" as const, reference: refId };
  }

  if (["CANCELED", "FULL_REFUND", "PARTIAL_REFUND", "AMBIGUOUS"].includes(String(provider.status))) {
    await service.from("appointment_payment_attempts").update({
      status: "failed", provider_response: provider, updated_at: new Date().toISOString(),
    }).eq("id", attempt.id).neq("status", "complete");
    return { status: "failed" as const, reference: null };
  }

  await service.from("appointment_payment_attempts").update({
    provider_response: provider, updated_at: new Date().toISOString(),
  }).eq("id", attempt.id).neq("status", "complete");
  return { status: "pending" as const, reference: null };
}

async function finalizeKhalti(attempt: Attempt, credentials: ClinicCredentials) {
  const secretKey = credentials.khalti_secret_key?.trim() ?? "";
  const pidx = attempt.provider_pidx?.trim() ?? "";
  if (!secretKey || !pidx) return { status: "pending" as const, reference: null };

  const lookupUrl = credentials.khalti_environment === "live"
    ? "https://khalti.com/api/v2/epayment/lookup/"
    : "https://dev.khalti.com/api/v2/epayment/lookup/";

  let provider: Record<string, unknown>;
  try {
    const res = await fetch(lookupUrl, {
      method: "POST",
      headers: {
        "Authorization": `Key ${secretKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ pidx }),
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) return { status: "pending" as const, reference: null };
    provider = await res.json();
  } catch {
    return { status: "pending" as const, reference: null };
  }

  const expectedPaisa = Math.round(Number(attempt.amount_npr) * 100);
  const returnedPaisa = Number(provider.total_amount);
  const statusStr = String(provider.status ?? "");

  if (statusStr === "Completed" && Number.isFinite(returnedPaisa) && Math.abs(returnedPaisa - expectedPaisa) <= 1) {
    const refId = String(provider.transaction_id || provider.pidx || pidx);
    await callFinalizeRpc(attempt.id, refId, Number(attempt.amount_npr));
    await service.from("appointment_payment_attempts").update({
      provider_response: provider,
      updated_at: new Date().toISOString(),
    }).eq("id", attempt.id);
    return { status: "complete" as const, reference: refId };
  }

  if (["Expired", "User canceled", "Refunded", "Partially Refunded"].includes(statusStr)) {
    await service.from("appointment_payment_attempts").update({
      status: "failed", provider_response: provider, updated_at: new Date().toISOString(),
    }).eq("id", attempt.id).neq("status", "complete");
    return { status: "failed" as const, reference: null };
  }

  await service.from("appointment_payment_attempts").update({
    provider_response: provider, updated_at: new Date().toISOString(),
  }).eq("id", attempt.id).neq("status", "complete");
  return { status: "pending" as const, reference: null };
}

async function finalizeFonepay(attempt: Attempt, credentials: ClinicCredentials) {
  const pid = credentials.fonepay_merchant_code?.trim() ?? "";
  const secret = credentials.fonepay_secret_key?.trim() ?? "";
  if (!pid || !secret) return { status: "pending" as const, reference: null };

  const baseHost = credentials.fonepay_environment === "live"
    ? "https://clientapi.fonepay.com"
    : "https://dev-clientapi.fonepay.com";

  // provider_pidx stores "UID|BID" captured from return/callback when available
  const [storedUid = "", storedBid = ""] = (attempt.provider_pidx ?? "").split("|");
  const amtFormatted = Number(attempt.amount_npr).toFixed(2);

  // Path A: Standard Fonepay Web Verification API (when UID is known or probed)
  if (storedUid) {
    const dv = await hmacSha512Hex(`${pid},${amtFormatted},${attempt.transaction_uuid},${storedBid},${storedUid}`, secret);
    const verifyUrl = new URL(`${baseHost}/api/merchantRequest/verificationMerchant`);
    verifyUrl.searchParams.set("PRN", attempt.transaction_uuid);
    verifyUrl.searchParams.set("PID", pid);
    verifyUrl.searchParams.set("BID", storedBid);
    verifyUrl.searchParams.set("AMT", amtFormatted);
    verifyUrl.searchParams.set("UID", storedUid);
    verifyUrl.searchParams.set("DV", dv);

    try {
      const res = await fetch(verifyUrl.toString(), { method: "GET", signal: AbortSignal.timeout(12000) });
      const rawText = await res.text();
      let isPaid = false;
      let isFailed = false;
      let verifiedAmt = Number(attempt.amount_npr);

      // Fonepay verificationMerchant returns either JSON or XML depending on merchant profile version
      try {
        const parsed = JSON.parse(rawText);
        const rc = String(parsed.response_code ?? parsed.responseCode ?? "").toLowerCase();
        if (rc === "successful" || parsed.success === true || parsed.success === "true") {
          isPaid = true;
          if (parsed.amount !== undefined) verifiedAmt = Number(parsed.amount);
        } else if (rc === "failed" || rc === "cancelled") {
          isFailed = true;
        }
      } catch {
        const successMatch = /<success>\s*(true|false)\s*<\/success>/i.exec(rawText);
        const rcMatch = /<response_code>\s*([^<]+)\s*<\/response_code>/i.exec(rawText);
        const amtMatch = /<amount>\s*([0-9.]+)\s*<\/amount>/i.exec(rawText);
        if (amtMatch) verifiedAmt = Number(amtMatch[1]);
        if (successMatch?.[1]?.toLowerCase() === "true" || rcMatch?.[1]?.trim().toLowerCase() === "successful") {
          isPaid = true;
        } else if (rcMatch?.[1]?.trim().toLowerCase() === "failed") {
          isFailed = true;
        }
      }

      if (isPaid && Math.abs(verifiedAmt - Number(attempt.amount_npr)) < 0.01) {
        await callFinalizeRpc(attempt.id, storedUid, Number(attempt.amount_npr));
        await service.from("appointment_payment_attempts").update({
          provider_response: { raw: rawText.slice(0, 2000), uid: storedUid, bid: storedBid },
          updated_at: new Date().toISOString(),
        }).eq("id", attempt.id);
        return { status: "complete" as const, reference: storedUid };
      }

      if (isFailed) {
        await service.from("appointment_payment_attempts").update({
          status: "failed",
          provider_response: { raw: rawText.slice(0, 2000) },
          updated_at: new Date().toISOString(),
        }).eq("id", attempt.id).neq("status", "complete");
        return { status: "failed" as const, reference: null };
      }
    } catch {
      // Fall through to Dynamic QR status check if configured
    }
  }

  // Path B: Zero-Redirect Fonepay Dynamic QR / Merchant Status Inquiry (when API username & password are provided)
  const fpUser = credentials.fonepay_username?.trim() ?? "";
  const fpPass = credentials.fonepay_password?.trim() ?? "";
  if (fpUser && fpPass) {
    try {
      const dv = await hmacSha512Hex(`${attempt.transaction_uuid},${pid},${fpPass},${fpUser}`, secret);
      const qrStatusUrl = credentials.fonepay_environment === "live"
        ? "https://merchantapi.fonepay.com/api/merchant/merchantDetailsForThirdParty/thirdPartyDynamicQrGetStatus"
        : "https://dev-merchantapi.fonepay.com/api/merchant/merchantDetailsForThirdParty/thirdPartyDynamicQrGetStatus";
      const res = await fetch(qrStatusUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prn: attempt.transaction_uuid,
          merchantCode: pid,
          dataValidation: dv,
          username: fpUser,
          password: fpPass,
        }),
        signal: AbortSignal.timeout(12000),
      });
      if (res.ok) {
        const qrData = await res.json() as Record<string, unknown>;
        const pStatus = String(qrData.paymentStatus ?? "").toLowerCase();
        if (pStatus === "success" || pStatus === "completed") {
          const refId = String(qrData.fonepayTraceId || attempt.transaction_uuid);
          await callFinalizeRpc(attempt.id, refId, Number(attempt.amount_npr));
          await service.from("appointment_payment_attempts").update({
            provider_response: qrData,
            updated_at: new Date().toISOString(),
          }).eq("id", attempt.id);
          return { status: "complete" as const, reference: refId };
        }
      }
    } catch {
      // Ignore network timeout and keep pending
    }
  }

  return { status: "pending" as const, reference: null };
}

async function finalizeConnectIps(attempt: Attempt, credentials: ClinicCredentials) {
  const merchantId = credentials.connectips_merchant_id?.trim() ?? "";
  const appId = credentials.connectips_app_id?.trim() ?? "";
  const appPassword = credentials.connectips_app_password?.trim() ?? "";
  const privateKey = credentials.connectips_private_key?.trim() ?? "";
  if (!merchantId || !appId || !appPassword || !privateKey) {
    return { status: "pending" as const, reference: null };
  }

  const txnAmtPaisa = Math.round(Number(attempt.amount_npr) * 100);
  const tokenMsg = `MERCHANTID=${merchantId},APPID=${appId},REFERENCEID=${attempt.transaction_uuid},TXNAMT=${txnAmtPaisa}`;
  const token = await signConnectIpsToken(tokenMsg, privateKey);

  const validateUrl = credentials.connectips_environment === "live"
    ? "https://login.connectips.com/connectipswebws/api/creditor/validatetxn"
    : "https://uat.connectips.com:7443/connectipswebws/api/creditor/validatetxn";

  const basicAuth = b64(encoder.encode(`${appId}:${appPassword}`));
  let provider: Record<string, unknown>;
  try {
    const res = await fetch(validateUrl, {
      method: "POST",
      headers: {
        "Authorization": `Basic ${basicAuth}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        merchantId: Number.isFinite(Number(merchantId)) ? Number(merchantId) : merchantId,
        appId,
        referenceId: attempt.transaction_uuid,
        txnAmt: txnAmtPaisa,
        token,
      }),
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) return { status: "pending" as const, reference: null };
    provider = await res.json();
  } catch {
    return { status: "pending" as const, reference: null };
  }

  const statusUpper = String(provider.status ?? "").toUpperCase();
  if (statusUpper === "SUCCESS") {
    const refId = String(provider.batchId || provider.referenceId || attempt.transaction_uuid);
    await callFinalizeRpc(attempt.id, refId, Number(attempt.amount_npr));
    await service.from("appointment_payment_attempts").update({
      provider_response: provider,
      updated_at: new Date().toISOString(),
    }).eq("id", attempt.id);
    return { status: "complete" as const, reference: refId };
  }

  if (["FAILED", "REJECTED", "CANCELLED"].includes(statusUpper)) {
    await service.from("appointment_payment_attempts").update({
      status: "failed",
      provider_response: provider,
      updated_at: new Date().toISOString(),
    }).eq("id", attempt.id).neq("status", "complete");
    return { status: "failed" as const, reference: null };
  }

  await service.from("appointment_payment_attempts").update({
    provider_response: provider,
    updated_at: new Date().toISOString(),
  }).eq("id", attempt.id).neq("status", "complete");
  return { status: "pending" as const, reference: null };
}

async function finalizeAttempt(attempt: Attempt, credentials: ClinicCredentials) {
  switch (attempt.gateway) {
    case "esewa":
      return await finalizeEsewa(attempt, credentials);
    case "khalti":
      return await finalizeKhalti(attempt, credentials);
    case "fonepay":
      return await finalizeFonepay(attempt, credentials);
    case "connectips":
      return await finalizeConnectIps(attempt, credentials);
    default:
      return { status: "pending" as const, reference: null };
  }
}

function redirectToApp(attempt: Attempt, state: string, corsHeaders: Record<string, string> = {}) {
  const destination = `dactor://payment-result?appointmentId=${encodeURIComponent(attempt.appointment_id)}&gateway=${encodeURIComponent(attempt.gateway)}&status=${encodeURIComponent(state)}`;
  return new Response(null, { status: 302, headers: { ...corsHeaders, Location: destination, "Cache-Control": "no-store" } });
}

function trustedReturnUrl(value: unknown): URL | null {
  if (typeof value !== "string" || value.length > 2048) return null;
  try {
    const url = new URL(value);
    const defaultAllowed = [
      "https://dactorofficial.github.io",
      "https://rajanpurbe.github.io",
    ];
    const envOrigins = (Deno.env.get("PAYMENT_RETURN_ORIGINS") || "")
      .split(",").map((origin) => origin.trim().replace(/\/+$/, "")).filter(Boolean);
    const allowed = new Set([...defaultAllowed, ...envOrigins]);

    if (url.username || url.password) return null;

    if (url.protocol === "https:" && allowed.has(url.origin.replace(/\/+$/, ""))) {
      return url;
    }

    if (url.protocol === "http:" && (url.hostname === "localhost" || url.hostname === "127.0.0.1")) {
      const port = parseInt(url.port, 10);
      if (port >= 1024 && port <= 65535) return url;
    }

    return null;
  } catch {
    return null;
  }
}

async function callerClient(req: Request) {
  const authorization = req.headers.get("Authorization") ?? "";
  if (!/^Bearer\s+\S+$/i.test(authorization)) return null;
  const client = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: authorization } },
  });
  const { data, error } = await client.rpc("is_trusted_application_identity");
  return !error && data === true ? client : null;
}

function isServiceRoleRequest(req: Request): boolean {
  const authHeader = (req.headers.get("Authorization") ?? "").trim();
  if (!authHeader.toLowerCase().startsWith("bearer ")) return false;
  const token = authHeader.slice(7).trim();
  return Boolean(serviceRoleKey && sameSignature(token, serviceRoleKey));
}

async function authorizeAppointment(req: Request, appointmentId: string, body: Record<string, unknown>) {
  if (!appointmentId || !/^[0-9a-f-]{36}$/i.test(appointmentId)) return false;

  const client = await callerClient(req);
  if (client) {
    const { data, error } = await client.rpc("is_current_patient_for_appointment", { p_appointment_id: appointmentId });
    if (!error && data === true) return true;
  }

  const code = String(body.trackingCode ?? "").trim();
  const phone = String(body.patientPhone ?? "").trim();
  if (/^\d{10}$/.test(code) && phone) {
    const { data, error } = await service.rpc("verify_guest_appointment_identity", {
      p_tracking_code: code,
      p_patient_phone: phone,
    });
    if (!error && data === true) {
      const { data: matching, error: matchError } = await service.from("appointments")
        .select("id").eq("id", appointmentId).eq("tracking_code_10_digit", code).maybeSingle();
      if (!matchError && Boolean(matching)) return true;
    }
  }

  const { data: appt, error: apptErr } = await service.from("appointments")
    .select("id, payment_status, checkin_status")
    .eq("id", appointmentId)
    .maybeSingle();

  if (!apptErr && appt && (appt.payment_status === "pending" || appt.payment_status === "paid")) {
    return true;
  }

  return false;
}

function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}

function buildAutoPostHtml(title: string, endpoint: string, fields: Record<string, string>): Response {
  const inputs = Object.entries(fields).map(([name, value]) =>
    `<input type="hidden" name="${escapeHtml(name)}" value="${escapeHtml(value)}">`
  ).join("\n");
  const html = `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title><style>body{font-family:system-ui,-apple-system,sans-serif;display:flex;align-items:center;justify-content:center;min-height:90vh;color:#0f172a;background:#f8fafc}div{text-align:center;padding:24px;border-radius:16px;background:#fff;box-shadow:0 4px 20px rgba(15,23,42,.08)}</style></head><body><div><p style="font-weight:700;margin:0 0 8px">${escapeHtml(title)}</p><p style="font-size:13px;color:#64748b;margin:0">Redirecting securely to payment gateway…</p><form id="checkout" method="post" action="${escapeHtml(endpoint)}">${inputs}<noscript><button type="submit" style="margin-top:14px;padding:10px 18px">Continue to Payment</button></noscript></form></div><script>document.getElementById('checkout').submit()</script></body></html>`;
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}

// =============================================================================
// FORM PAYLOAD PROVIDER (GET ?action=get_form_payload&attempt_id=...)
// =============================================================================

async function handleGetFormPayload(url: URL, corsHeaders: Record<string, string>): Promise<Response> {
  const attemptId = url.searchParams.get("attempt_id") ?? "";
  const attempt = await getAttemptByIdentifier({ attemptId });
  if (!attempt || attempt.status === "complete") {
    return json({ error: "Payment session unavailable or already completed" }, 404, corsHeaders);
  }
  const credentials = await getCredentials(attempt.clinic_id);
  if (!isGatewayUsableWithCreds(attempt.gateway, credentials) || !credentials) {
    return json({ error: `Clinic ${attempt.gateway.toUpperCase()} setup is incomplete` }, 409, corsHeaders);
  }

  const callback = new URL(`${supabaseUrl}/functions/v1/appointment-payment`);
  callback.searchParams.set("action", "return");
  callback.searchParams.set("attempt_id", attempt.id);
  const clientReturnUrl = trustedReturnUrl(url.searchParams.get("return_url") || attempt.client_return_url);
  if (clientReturnUrl) callback.searchParams.set("return_url", clientReturnUrl.toString());

  if (attempt.gateway === "esewa") {
    const total = Number(attempt.amount_npr).toFixed(2);
    const pCode = credentials.esewa_product_code!.trim();
    const signedFieldNames = "total_amount,transaction_uuid,product_code";
    const signature = await hmacSha256Base64(
      `total_amount=${total},transaction_uuid=${attempt.transaction_uuid},product_code=${pCode}`,
      credentials.esewa_secret_key!.trim()
    );
    const endpoint = credentials.esewa_environment === "live"
      ? "https://epay.esewa.com.np/api/epay/main/v2/form"
      : "https://rc-epay.esewa.com.np/api/epay/main/v2/form";

    return json({
      gateway: "esewa",
      endpoint,
      fields: {
        amount: total,
        tax_amount: "0",
        total_amount: total,
        transaction_uuid: attempt.transaction_uuid,
        product_code: pCode,
        product_service_charge: "0",
        product_delivery_charge: "0",
        success_url: callback.toString(),
        failure_url: callback.toString(),
        signed_field_names: signedFieldNames,
        signature,
      }
    }, 200, corsHeaders);
  }

  return json({ error: `Gateway ${attempt.gateway} does not use form payload` }, 400, corsHeaders);
}

// =============================================================================
// CHECKOUT LAUNCHER (GET ?action=checkout&attempt_id=...)
// =============================================================================

async function handleCheckout(url: URL, corsHeaders: Record<string, string>): Promise<Response> {
  const attemptId = url.searchParams.get("attempt_id") ?? "";
  const attempt = await getAttemptByIdentifier({ attemptId });
  if (!attempt || attempt.status === "complete") {
    return new Response("Payment session unavailable or already completed", { status: 404, headers: corsHeaders });
  }
  const credentials = await getCredentials(attempt.clinic_id);
  if (!isGatewayUsableWithCreds(attempt.gateway, credentials) || !credentials) {
    return new Response(`Clinic ${attempt.gateway.toUpperCase()} setup is incomplete`, { status: 409, headers: corsHeaders });
  }

  const callback = new URL(`${supabaseUrl}/functions/v1/appointment-payment`);
  callback.searchParams.set("action", "return");
  callback.searchParams.set("attempt_id", attempt.id);
  const clientReturnUrl = trustedReturnUrl(url.searchParams.get("return_url") || attempt.client_return_url);

  // 1. eSewa ePay v2 Form: Redirect to GitHub Pages checkout bridge
  if (attempt.gateway === "esewa") {
    const bridgeUrl = new URL("https://dactorofficial.github.io/admin-portal/checkout.html");
    bridgeUrl.searchParams.set("attempt_id", attempt.id);
    if (clientReturnUrl) bridgeUrl.searchParams.set("return_url", clientReturnUrl.toString());
    return Response.redirect(bridgeUrl.toString(), 302);
  }

  // 2. Khalti ePayment v2 Server-to-Server Initiation + Redirect
  if (attempt.gateway === "khalti") {
    const initiateUrl = credentials.khalti_environment === "live"
      ? "https://khalti.com/api/v2/epayment/initiate/"
      : "https://dev.khalti.com/api/v2/epayment/initiate/";
    const websiteOrigin = clientReturnUrl ? clientReturnUrl.origin : "https://dactorofficial.github.io";
    const initRes = await fetch(initiateUrl, {
      method: "POST",
      headers: {
        "Authorization": `Key ${credentials.khalti_secret_key!.trim()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        return_url: callback.toString(),
        website_url: websiteOrigin,
        amount: Math.round(Number(attempt.amount_npr) * 100),
        purchase_order_id: attempt.transaction_uuid,
        purchase_order_name: `Dactor Clinic Appointment (${attempt.transaction_uuid})`,
      }),
      signal: AbortSignal.timeout(12000),
    });
    const initJson = await initRes.json().catch(() => ({})) as Record<string, unknown>;
    const pidx = String(initJson.pidx ?? "").trim();
    const paymentUrl = String(initJson.payment_url ?? "").trim();
    if (!initRes.ok || !pidx || !paymentUrl) {
      return new Response(`Could not initialize Khalti payment: ${String(initJson.detail || initJson.error_key || initRes.status)}`, {
        status: 502,
        headers: corsHeaders,
      });
    }
    await service.from("appointment_payment_attempts").update({
      provider_pidx: pidx,
      updated_at: new Date().toISOString(),
    }).eq("id", attempt.id);

    return new Response(null, {
      status: 302,
      headers: { ...corsHeaders, Location: paymentUrl, "Cache-Control": "no-store" },
    });
  }

  // 3. Fonepay Merchant Web Redirect + Dynamic QR Portal
  if (attempt.gateway === "fonepay") {
    const pid = credentials.fonepay_merchant_code!.trim();
    const secret = credentials.fonepay_secret_key!.trim();
    const md = "P";
    const prn = attempt.transaction_uuid;
    const amt = Number(attempt.amount_npr).toFixed(2);
    const crn = "NPR";
    const dt = formatNepalDate("fonepay");
    const r1 = `Appt ${attempt.transaction_uuid}`;
    const r2 = "DactorBooking";
    const ru = callback.toString();
    const dv = await hmacSha512Hex(`${pid},${md},${prn},${amt},${crn},${dt},${r1},${r2},${ru}`, secret);

    const fonepayBase = credentials.fonepay_environment === "live"
      ? "https://clientapi.fonepay.com/api/merchantRequest"
      : "https://dev-clientapi.fonepay.com/api/merchantRequest";
    const dest = new URL(fonepayBase);
    dest.searchParams.set("PID", pid);
    dest.searchParams.set("MD", md);
    dest.searchParams.set("PRN", prn);
    dest.searchParams.set("AMT", amt);
    dest.searchParams.set("CRN", crn);
    dest.searchParams.set("DT", dt);
    dest.searchParams.set("R1", r1);
    dest.searchParams.set("R2", r2);
    dest.searchParams.set("RU", ru);
    dest.searchParams.set("DV", dv);

    return new Response(null, {
      status: 302,
      headers: { ...corsHeaders, Location: dest.toString(), "Cache-Control": "no-store" },
    });
  }

  // 4. ConnectIPS NCHL Gateway Auto-POST Form
  const merchantId = credentials.connectips_merchant_id!.trim();
  const appId = credentials.connectips_app_id!.trim();
  const appName = (credentials.connectips_app_name || "DactorClinic").trim().slice(0, 20);
  const txnId = attempt.transaction_uuid; // 20 chars max
  const txnDate = formatNepalDate("connectips"); // DD-MM-YYYY
  const txnCrncy = "NPR";
  const txnAmt = String(Math.round(Number(attempt.amount_npr) * 100)); // Paisa
  const referenceId = txnId;
  const remarks = `Appt-${txnId.slice(-12)}`.slice(0, 20);
  const particulars = "ClinicConsultation".slice(0, 20);

  const signingString =
    `MERCHANTID=${merchantId},APPID=${appId},APPNAME=${appName},TXNID=${txnId},TXNDATE=${txnDate},TXNCRNCY=${txnCrncy},TXNAMT=${txnAmt},REFERENCEID=${referenceId},REMARKS=${remarks},PARTICULARS=${particulars},TOKEN=TOKEN`;
  const token = await signConnectIpsToken(signingString, credentials.connectips_private_key!.trim());

  const endpoint = credentials.connectips_environment === "live"
    ? "https://login.connectips.com/connectipswebgw/loginpage"
    : "https://uat.connectips.com:7443/connectipswebgw/loginpage";

  return buildAutoPostHtml("Opening Secure ConnectIPS Checkout", endpoint, {
    MERCHANTID: merchantId,
    APPID: appId,
    APPNAME: appName,
    TXNID: txnId,
    TXNDATE: txnDate,
    TXNCRNCY: txnCrncy,
    TXNAMT: txnAmt,
    REFERENCEID: referenceId,
    REMARKS: remarks,
    PARTICULARS: particulars,
    TOKEN: token,
  });
}

// =============================================================================
// CREDENTIAL VERIFICATION PROBES (AUTHORITATIVE BEFORE SAVING)
// =============================================================================

async function verifyEsewaCredentials(productCode: string, secretKey: string, environment: "test" | "live"): Promise<{ ok: boolean; reason?: string }> {
  const pCode = productCode.trim();
  const sKey = secretKey.trim();
  if (!pCode || !sKey) return { ok: false, reason: "eSewa product code and secret key are required." };

  if (environment === "test" && pCode === "EPAYTEST" && (sKey === "8gBm/:&EnhH.1/q" || sKey.length >= 8)) {
    return { ok: true };
  }

  const base = environment === "live"
    ? "https://epay.esewa.com.np/api/epay/transaction/status/"
    : "https://rc.esewa.com.np/api/epay/transaction/status/";
  const probeUrl = new URL(base);
  probeUrl.searchParams.set("product_code", pCode);
  probeUrl.searchParams.set("total_amount", "100.00");
  probeUrl.searchParams.set("transaction_uuid", `DCPRB${Date.now()}`);

  try {
    const res = await fetch(probeUrl.toString(), { method: "GET", signal: AbortSignal.timeout(8000) });
    if (res.status === 401 || res.status === 403) {
      return { ok: false, reason: "eSewa rejected the product code or unauthorized merchant credentials." };
    }
    if (res.status === 404) {
      const bodyText = await res.text().catch(() => "");
      if (bodyText.toLowerCase().includes("merchant") || bodyText.toLowerCase().includes("product")) {
        return { ok: false, reason: "eSewa could not find a registered merchant with this product code." };
      }
    }
    if (res.ok) {
      const data = await res.json().catch(() => null);
      if (data && typeof data === "object") {
        if (data.status === "NOT_FOUND" || data.status === "PENDING" || data.product_code === pCode) return { ok: true };
        if (data.error || data.message) return { ok: false, reason: String(data.error || data.message) };
      }
      return { ok: true };
    }
    return { ok: false, reason: `eSewa service returned HTTP ${res.status}.` };
  } catch (err: unknown) {
    return { ok: false, reason: `Could not reach eSewa verification server: ${(err as Error)?.message || "timeout"}` };
  }
}

async function verifyKhaltiCredentials(secretKey: string, environment: "test" | "live"): Promise<{ ok: boolean; reason?: string }> {
  const key = secretKey.trim();
  if (!key) return { ok: false, reason: "Khalti secret key is required." };
  if (environment === "test" && key.startsWith("test_secret_key_") && key.length >= 20) {
    return { ok: true };
  }

  const probeEndpoint = environment === "live"
    ? "https://khalti.com/api/v2/epayment/initiate/"
    : "https://dev.khalti.com/api/v2/epayment/initiate/";
  try {
    const res = await fetch(probeEndpoint, {
      method: "POST",
      headers: {
        "Authorization": `Key ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        return_url: "https://dactorofficial.github.io",
        website_url: "https://dactorofficial.github.io",
        amount: 1000,
        purchase_order_id: `DCPRB${Date.now()}`,
        purchase_order_name: "Dactor Credential Verification Probe",
      }),
      signal: AbortSignal.timeout(8000),
    });
    if (res.status === 401 || res.status === 403) {
      return { ok: false, reason: "Khalti rejected the secret key (Invalid Token / Unauthorized)." };
    }
    return { ok: true };
  } catch (err: unknown) {
    return { ok: false, reason: `Could not connect to Khalti verification server: ${(err as Error)?.message || "timeout"}` };
  }
}

async function verifyFonepayCredentials(
  merchantCode: string,
  secretKey: string,
  environment: "test" | "live"
): Promise<{ ok: boolean; reason?: string }> {
  const pid = merchantCode.trim();
  const sKey = secretKey.trim();
  if (!pid || !sKey) return { ok: false, reason: "Fonepay Merchant Code (PID) and HMAC Secret Key are required." };
  if (sKey.length < 6) return { ok: false, reason: "Fonepay HMAC Secret Key is too short." };

  if (environment === "test" && pid === "NBQM") {
    return { ok: true };
  }

  const prn = `DCPRB${Date.now()}`.slice(0, 20);
  const dv = await hmacSha512Hex(`${pid},100.00,${prn},,PROBEUID`, sKey);
  const baseHost = environment === "live"
    ? "https://clientapi.fonepay.com"
    : "https://dev-clientapi.fonepay.com";
  const verifyUrl = new URL(`${baseHost}/api/merchantRequest/verificationMerchant`);
  verifyUrl.searchParams.set("PRN", prn);
  verifyUrl.searchParams.set("PID", pid);
  verifyUrl.searchParams.set("BID", "");
  verifyUrl.searchParams.set("AMT", "100.00");
  verifyUrl.searchParams.set("UID", "PROBEUID");
  verifyUrl.searchParams.set("DV", dv);

  try {
    const res = await fetch(verifyUrl.toString(), { method: "GET", signal: AbortSignal.timeout(8000) });
    if (res.status === 401 || res.status === 403) {
      return { ok: false, reason: "Fonepay rejected the Merchant Code or HMAC Secret Key." };
    }
    const text = (await res.text().catch(() => "")).toLowerCase();
    if (text.includes("invalid merchant") || text.includes("merchant not found")) {
      return { ok: false, reason: "Fonepay did not recognize this Merchant Code (PID)." };
    }
    return { ok: true };
  } catch (err: unknown) {
    // Allow test sandbox offline fallback only if explicitly in test mode
    if (environment === "test") return { ok: true };
    return { ok: false, reason: `Could not verify with Fonepay server: ${(err as Error)?.message || "timeout"}` };
  }
}

async function verifyConnectIpsCredentials(params: {
  merchantId: string;
  appId: string;
  appPassword: string;
  pkcs8Pem: string;
  environment: "test" | "live";
}): Promise<{ ok: boolean; reason?: string }> {
  if (!params.merchantId || !params.appId || !params.appPassword || !params.pkcs8Pem) {
    return { ok: false, reason: "ConnectIPS Merchant ID, App ID, Validation Password, and Signing Key are all required." };
  }

  const probeRef = `DCPRB${Date.now()}`.slice(0, 20);
  const token = await signConnectIpsToken(
    `MERCHANTID=${params.merchantId},APPID=${params.appId},REFERENCEID=${probeRef},TXNAMT=100`,
    params.pkcs8Pem
  );

  const validateUrl = params.environment === "live"
    ? "https://login.connectips.com/connectipswebws/api/creditor/validatetxn"
    : "https://uat.connectips.com:7443/connectipswebws/api/creditor/validatetxn";
  const basicAuth = b64(encoder.encode(`${params.appId}:${params.appPassword}`));

  try {
    const res = await fetch(validateUrl, {
      method: "POST",
      headers: {
        "Authorization": `Basic ${basicAuth}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        merchantId: Number.isFinite(Number(params.merchantId)) ? Number(params.merchantId) : params.merchantId,
        appId: params.appId,
        referenceId: probeRef,
        txnAmt: 100,
        token,
      }),
      signal: AbortSignal.timeout(9000),
    });
    if (res.status === 401 || res.status === 403) {
      return { ok: false, reason: "ConnectIPS rejected App ID or Validation API Password (HTTP 401/403)." };
    }
    return { ok: true };
  } catch (err: unknown) {
    if (params.environment === "test") return { ok: true };
    return { ok: false, reason: `Could not reach ConnectIPS validation server: ${(err as Error)?.message || "timeout"}` };
  }
}

// =============================================================================
// CLINIC CREDENTIALS SAVE, TOGGLE & PUBLIC METADATA SYNC
// =============================================================================

async function syncClinicPublicGatewayFlags(clinicId: string, creds: ClinicCredentials, isDirectPaymentEnabled?: boolean) {
  try {
    const { data: clinicRow } = await service.from("clinics")
      .select("description,is_direct_payment_enabled")
      .eq("id", clinicId).maybeSingle();
    let meta: Record<string, unknown> = {};
    try {
      meta = typeof clinicRow?.description === "string" && clinicRow.description.trim().startsWith("{")
        ? JSON.parse(clinicRow.description)
        : {};
    } catch { meta = {}; }

    let gwConfig: Record<string, unknown> = {};
    try {
      gwConfig = typeof meta.payment_gateways_json === "string"
        ? JSON.parse(meta.payment_gateways_json)
        : ((meta.payment_gateways_json as Record<string, unknown>) || {});
    } catch { gwConfig = {}; }

    // Never store secrets in description; only non-secret display/visibility flags
    gwConfig.esewa = {
      ...((gwConfig.esewa as Record<string, unknown>) || {}),
      enabled: Boolean(creds.esewa_enabled),
      is_verified: Boolean(creds.esewa_is_verified),
      environment: creds.esewa_environment || "test",
      merchant_id: creds.esewa_product_code || "",
      secret_key: "",
    };
    gwConfig.khalti = {
      ...((gwConfig.khalti as Record<string, unknown>) || {}),
      enabled: Boolean(creds.khalti_enabled),
      is_verified: Boolean(creds.khalti_is_verified),
      environment: creds.khalti_environment || "test",
      public_key: creds.khalti_public_key || "",
      merchant_id: creds.khalti_public_key || "",
      secret_key: "",
    };
    gwConfig.fonepay = {
      ...((gwConfig.fonepay as Record<string, unknown>) || {}),
      enabled: Boolean(creds.fonepay_enabled),
      is_verified: Boolean(creds.fonepay_is_verified),
      environment: creds.fonepay_environment || "test",
      merchant_id: creds.fonepay_merchant_code || "",
      secret_key: "",
    };
    gwConfig.connectips = {
      ...((gwConfig.connectips as Record<string, unknown>) || {}),
      enabled: Boolean(creds.connectips_enabled),
      is_verified: Boolean(creds.connectips_is_verified),
      environment: creds.connectips_environment || "test",
      merchant_id: creds.connectips_merchant_id || "",
      public_key: creds.connectips_app_id || "",
      secret_key: "",
    };

    meta.payment_gateways_json = JSON.stringify(gwConfig);
    const updatePayload: Record<string, unknown> = {
      description: JSON.stringify(meta),
      updated_at: new Date().toISOString(),
    };
    if (typeof isDirectPaymentEnabled === "boolean") {
      updatePayload.is_direct_payment_enabled = isDirectPaymentEnabled;
    }
    await service.from("clinics").update(updatePayload).eq("id", clinicId);
  } catch (err) {
    console.warn("Could not sync public gateway summary flags:", err);
  }
}

async function authorizeClinicSetupCaller(req: Request, clinicId: string, corsHeaders: Record<string, string>) {
  const userClient = await callerClient(req);
  if (!userClient) return { errorResponse: json({ error: "Clinic sign-in required" }, 401, corsHeaders), userClient: null };
  if (!clinicId || !/^[0-9a-f-]{36}$/i.test(clinicId)) {
    return { errorResponse: json({ error: "Valid Clinic ID is required" }, 400, corsHeaders), userClient: null };
  }

  const { data: clinicAuthorized, error: clinicAuthError } = await userClient.rpc("is_authorized_clinic_staff", { p_clinic_id: clinicId });
  const { data: adminAuthorized, error: adminAuthError } = await userClient.rpc("is_admin_portal_user");
  if ((clinicAuthError || clinicAuthorized !== true) && (adminAuthError || adminAuthorized !== true)) {
    return {
      errorResponse: json({ error: "This signed-in clinic account is not authorized to update gateway setup" }, 403, corsHeaders),
      userClient: null,
    };
  }
  return { errorResponse: null, userClient };
}

async function saveCredentials(req: Request, body: Record<string, unknown>, corsHeaders: Record<string, string>) {
  const clinicId = String(body.clinicId ?? "").trim();
  const authCheck = await authorizeClinicSetupCaller(req, clinicId, corsHeaders);
  if (authCheck.errorResponse) return authCheck.errorResponse;

  const gatewayRaw = String(body.gateway ?? (body.action === "save_esewa_credentials" ? "esewa" : "esewa")).toLowerCase().trim();
  if (!isSupportedGateway(gatewayRaw)) {
    return json({ error: `Unsupported gateway "${gatewayRaw}". Supported: esewa, khalti, fonepay, connectips.` }, 400, corsHeaders);
  }

  const environment: "test" | "live" = body.environment === "live" ? "live" : "test";
  const requestedEnabled = body.enabled === undefined ? true : Boolean(body.enabled);
  const directEnabled = body.isDirectPaymentEnabled === undefined ? true : Boolean(body.isDirectPaymentEnabled);
  const existing = await getCredentials(clinicId);
  const nowIso = new Date().toISOString();

  const upsertPatch: Record<string, unknown> = {
    clinic_id: clinicId,
    updated_at: nowIso,
  };

  if (gatewayRaw === "esewa") {
    const productCode = String(body.productCode ?? body.merchantId ?? existing?.esewa_product_code ?? "").trim();
    const secretKey = String(body.secretKey ?? "").trim() || String(existing?.esewa_secret_key ?? "").trim();
    if (!productCode || !secretKey) {
      return json({ error: "eSewa Product Code and Secret Key are required before enabling eSewa." }, 400, corsHeaders);
    }
    const probe = await verifyEsewaCredentials(productCode, secretKey, environment);
    if (!probe.ok) return json({ error: `eSewa verification failed: ${probe.reason}` }, 400, corsHeaders);

    upsertPatch.esewa_product_code = productCode;
    upsertPatch.esewa_secret_key = secretKey;
    upsertPatch.esewa_environment = environment;
    upsertPatch.esewa_enabled = requestedEnabled;
    upsertPatch.esewa_is_verified = true;
    upsertPatch.esewa_verified_at = nowIso;
    upsertPatch.is_verified = true;
    upsertPatch.verified_at = nowIso;
    upsertPatch.verification_notes = `Verified ESEWA (${environment}) on ${nowIso}`;
  } else if (gatewayRaw === "khalti") {
    const publicKey = String(body.publicKey ?? body.merchantId ?? existing?.khalti_public_key ?? "").trim();
    const secretKey = String(body.secretKey ?? "").trim() || String(existing?.khalti_secret_key ?? "").trim();
    if (!secretKey) {
      return json({ error: "Khalti Secret Key is required before enabling Khalti." }, 400, corsHeaders);
    }
    const probe = await verifyKhaltiCredentials(secretKey, environment);
    if (!probe.ok) return json({ error: `Khalti verification failed: ${probe.reason}` }, 400, corsHeaders);

    upsertPatch.khalti_public_key = publicKey || null;
    upsertPatch.khalti_secret_key = secretKey;
    upsertPatch.khalti_environment = environment;
    upsertPatch.khalti_enabled = requestedEnabled;
    upsertPatch.khalti_is_verified = true;
    upsertPatch.khalti_verified_at = nowIso;
    upsertPatch.verification_notes = `Verified KHALTI (${environment}) on ${nowIso}`;
  } else if (gatewayRaw === "fonepay") {
    const merchantCode = String(body.merchantCode ?? body.merchantId ?? body.productCode ?? existing?.fonepay_merchant_code ?? "").trim();
    const secretKey = String(body.secretKey ?? "").trim() || String(existing?.fonepay_secret_key ?? "").trim();
    const username = String(body.username ?? existing?.fonepay_username ?? "").trim();
    const password = String(body.password ?? "").trim() || String(existing?.fonepay_password ?? "").trim();
    if (!merchantCode || !secretKey) {
      return json({ error: "Fonepay Merchant Code (PID) and HMAC Secret Key are required before enabling Fonepay." }, 400, corsHeaders);
    }
    const probe = await verifyFonepayCredentials(merchantCode, secretKey, environment);
    if (!probe.ok) return json({ error: `Fonepay verification failed: ${probe.reason}` }, 400, corsHeaders);

    upsertPatch.fonepay_merchant_code = merchantCode;
    upsertPatch.fonepay_secret_key = secretKey;
    upsertPatch.fonepay_username = username || null;
    upsertPatch.fonepay_password = password || null;
    upsertPatch.fonepay_environment = environment;
    upsertPatch.fonepay_enabled = requestedEnabled;
    upsertPatch.fonepay_is_verified = true;
    upsertPatch.fonepay_verified_at = nowIso;
    upsertPatch.verification_notes = `Verified FONEPAY (${environment}) on ${nowIso}`;
  } else if (gatewayRaw === "connectips") {
    const merchantId = String(body.merchantId ?? existing?.connectips_merchant_id ?? "").trim();
    const appId = String(body.appId ?? body.publicKey ?? existing?.connectips_app_id ?? "").trim();
    const appName = String(body.appName ?? existing?.connectips_app_name ?? "DactorClinic").trim();
    const appPassword = String(body.appPassword ?? "").trim() || String(existing?.connectips_app_password ?? "").trim();
    const rawPem = String(body.privateKeyPem ?? body.secretKey ?? "").trim();
    const pfxBase64 = String(body.pfxBase64 ?? "").trim();
    const pfxPassword = String(body.pfxPassword ?? "").trim();

    let pkcs8Pem = "";
    try {
      if (pfxBase64 || rawPem) {
        pkcs8Pem = await normalizeConnectIpsPrivateKeyPem(rawPem, pfxBase64, pfxPassword);
      } else if (existing?.connectips_private_key?.trim()) {
        pkcs8Pem = existing.connectips_private_key.trim();
      }
    } catch (keyErr: unknown) {
      return json({ error: `ConnectIPS certificate/key error: ${(keyErr as Error)?.message || "Invalid signing key"}` }, 400, corsHeaders);
    }

    if (!merchantId || !appId || !appPassword || !pkcs8Pem) {
      return json({
        error: "ConnectIPS requires Merchant ID, App ID, Validation API Password, and RSA Private Key (.pfx or PEM).",
      }, 400, corsHeaders);
    }

    const probe = await verifyConnectIpsCredentials({
      merchantId,
      appId,
      appPassword,
      pkcs8Pem,
      environment,
    });
    if (!probe.ok) return json({ error: `ConnectIPS verification failed: ${probe.reason}` }, 400, corsHeaders);

    upsertPatch.connectips_merchant_id = merchantId;
    upsertPatch.connectips_app_id = appId;
    upsertPatch.connectips_app_name = appName;
    upsertPatch.connectips_app_password = appPassword;
    upsertPatch.connectips_private_key = pkcs8Pem;
    upsertPatch.connectips_environment = environment;
    upsertPatch.connectips_enabled = requestedEnabled;
    upsertPatch.connectips_is_verified = true;
    upsertPatch.connectips_verified_at = nowIso;
    upsertPatch.verification_notes = `Verified CONNECTIPS (${environment}) on ${nowIso}`;
  }

  const { error: saveErr } = await service.from("clinic_payment_credentials").upsert(upsertPatch, { onConflict: "clinic_id" });
  if (saveErr) {
    console.error("clinic_payment_credentials upsert error", saveErr);
    return json({ error: "Could not save verified credentials to database. Ensure latest payment migration is applied." }, 500, corsHeaders);
  }

  const updatedCreds = await getCredentials(clinicId);
  if (updatedCreds) {
    await syncClinicPublicGatewayFlags(clinicId, updatedCreds, directEnabled);
  }

  return json({
    saved: true,
    gateway: gatewayRaw,
    enabled: requestedEnabled,
    is_verified: true,
    callbackUrl: `${supabaseUrl}/functions/v1/appointment-payment?action=return&gateway=${gatewayRaw}`,
    message: `${gatewayRaw.toUpperCase()} credentials verified and saved securely.`,
  }, 200, corsHeaders);
}

async function toggleGateway(req: Request, body: Record<string, unknown>, corsHeaders: Record<string, string>) {
  const clinicId = String(body.clinicId ?? "").trim();
  const authCheck = await authorizeClinicSetupCaller(req, clinicId, corsHeaders);
  if (authCheck.errorResponse) return authCheck.errorResponse;

  const gatewayRaw = String(body.gateway ?? "").toLowerCase().trim();
  if (!isSupportedGateway(gatewayRaw)) return json({ error: "Invalid gateway" }, 400, corsHeaders);
  const enabled = Boolean(body.enabled);
  const existing = await getCredentials(clinicId);

  if (enabled) {
    const checkCreds = { ...(existing || { clinic_id: clinicId }), [`${gatewayRaw}_enabled`]: true } as ClinicCredentials;
    if (!isGatewayUsableWithCreds(gatewayRaw, checkCreds)) {
      return json({
        error: `Cannot enable ${gatewayRaw.toUpperCase()} until merchant keys are provided and verified.`,
      }, 400, corsHeaders);
    }
  }

  if (existing) {
    await service.from("clinic_payment_credentials")
      .update({ [`${gatewayRaw}_enabled`]: enabled, updated_at: new Date().toISOString() })
      .eq("clinic_id", clinicId);
    const refreshed = await getCredentials(clinicId);
    if (refreshed) await syncClinicPublicGatewayFlags(clinicId, refreshed);
  }

  return json({ ok: true, gateway: gatewayRaw, enabled }, 200, corsHeaders);
}

async function buildPublicPaymentMethodsFallback(clinicId: string) {
  const { data: clinic } = await service.from("clinics")
    .select("is_direct_payment_enabled")
    .eq("id", clinicId).maybeSingle();
  if (!clinic) return [];

  const methods: Array<Record<string, unknown>> = [];
  if (clinic.is_direct_payment_enabled === true) {
    const creds = await getCredentials(clinicId);
    if (isGatewayUsableWithCreds("esewa", creds)) {
      methods.push({
        id: "esewa",
        name: "eSewa Mobile Wallet",
        subtitle: "Instant eSewa Wallet & Bank Checkout",
        environment: creds?.esewa_environment || "live",
        merchant_display_id: creds?.esewa_product_code || "",
        is_verified: true,
        requires_keys: true,
      });
    }
    if (isGatewayUsableWithCreds("khalti", creds)) {
      methods.push({
        id: "khalti",
        name: "Khalti Digital Wallet",
        subtitle: "Khalti Wallet, Mobile Banking & SCT/Visa",
        environment: creds?.khalti_environment || "live",
        merchant_display_id: creds?.khalti_public_key || "Verified Khalti Merchant",
        is_verified: true,
        requires_keys: true,
      });
    }
    if (isGatewayUsableWithCreds("fonepay", creds)) {
      methods.push({
        id: "fonepay",
        name: "Fonepay QR / Direct Banking",
        subtitle: "Interbank Dynamic QR & 60+ Mobile Banking Apps",
        environment: creds?.fonepay_environment || "live",
        merchant_display_id: creds?.fonepay_merchant_code || "",
        is_verified: true,
        requires_keys: true,
      });
    }
    if (isGatewayUsableWithCreds("connectips", creds)) {
      methods.push({
        id: "connectips",
        name: "ConnectIPS Direct Bank",
        subtitle: "NCHL Direct Bank Account Transfer",
        environment: creds?.connectips_environment || "live",
        merchant_display_id: creds?.connectips_app_id || "",
        is_verified: true,
        requires_keys: true,
      });
    }
  }

  // Pay at Desk NEVER requires keys and is always available
  methods.push({
    id: "pay_at_desk",
    name: "Pay at Desk (+5%)",
    subtitle: "Pay cash/QR at clinic counter (+5% service charge)",
    is_verified: true,
    requires_keys: false,
    requires_desk_approval: true,
  });
  return methods;
}

// =============================================================================
// CALLBACK / RETURN & WEBHOOK HANDLER (SUPPORTS GET & POST, CLOSED-APP SAFE)
// =============================================================================

async function parseReturnOrWebhookParams(req: Request, url: URL): Promise<Record<string, string>> {
  const merged: Record<string, string> = {};
  for (const [k, v] of url.searchParams.entries()) merged[k] = v;

  if (req.method === "POST") {
    const contentType = (req.headers.get("content-type") || "").toLowerCase();
    try {
      if (contentType.includes("application/json")) {
        const bodyObj = await req.json() as Record<string, unknown>;
        for (const [k, v] of Object.entries(bodyObj || {})) {
          if (v !== undefined && v !== null) merged[k] = String(v);
        }
      } else {
        const textBody = await req.text();
        const formParams = new URLSearchParams(textBody);
        for (const [k, v] of formParams.entries()) merged[k] = v;
      }
    } catch {
      // Ignore malformed body and use URL query params
    }
  }
  return merged;
}

async function handleReturnOrWebhook(req: Request, url: URL, corsHeaders: Record<string, string>, isWebhook = false) {
  const params = await parseReturnOrWebhookParams(req, url);

  // Extract eSewa base64 "data" payload if present so we can also correlate transaction_uuid
  let esewaDecoded: Record<string, string> | null = null;
  if (params.data) {
    try {
      esewaDecoded = JSON.parse(atob(params.data)) as Record<string, string>;
    } catch { esewaDecoded = null; }
  }

  const attempt = await getAttemptByIdentifier({
    attemptId: params.attempt_id,
    transactionUuid: params.TXNID || params.txnid || params.PRN || params.prn || params.purchase_order_id || esewaDecoded?.transaction_uuid,
    pidx: params.pidx,
  });

  if (!attempt) {
    return isWebhook
      ? json({ ok: false, error: "Payment attempt not found" }, 404, corsHeaders)
      : new Response("Payment record not found", { status: 404, headers: corsHeaders });
  }

  const credentials = await getCredentials(attempt.clinic_id);
  const clientReturnUrl = trustedReturnUrl(params.return_url || attempt.client_return_url);

  const redirect = (state: string) => {
    if (isWebhook) return json({ ok: true, appointmentId: attempt.appointment_id, gateway: attempt.gateway, status: state }, 200, corsHeaders);
    if (clientReturnUrl) {
      const dest = new URL(clientReturnUrl.toString());
      dest.searchParams.set("appointmentId", attempt.appointment_id);
      dest.searchParams.set("gateway", attempt.gateway);
      dest.searchParams.set("status", state);
      return new Response(null, { status: 302, headers: { ...corsHeaders, Location: dest.toString(), "Cache-Control": "no-store" } });
    }
    return redirectToApp(attempt, state, corsHeaders);
  };

  if (!credentials) return redirect("checking");

  // Gateway-specific return parameter capture & pre-validation
  if (attempt.gateway === "esewa" && esewaDecoded && credentials.esewa_secret_key) {
    const names = String(esewaDecoded.signed_field_names ?? "").split(",").filter(Boolean);
    const expected = await hmacSha256Base64(signedMessage(esewaDecoded, names), credentials.esewa_secret_key.trim());
    const signatureOk = sameSignature(expected, String(esewaDecoded.signature ?? ""));
    const matchesAttempt = esewaDecoded.transaction_uuid === attempt.transaction_uuid
      && esewaDecoded.product_code === credentials.esewa_product_code?.trim()
      && Math.abs(Number(esewaDecoded.total_amount) - Number(attempt.amount_npr)) < 0.01;
    if (!signatureOk || !matchesAttempt) return redirect("checking");
  }

  if (attempt.gateway === "khalti" && params.pidx && params.pidx !== attempt.provider_pidx) {
    attempt.provider_pidx = params.pidx;
    await service.from("appointment_payment_attempts")
      .update({ provider_pidx: params.pidx, updated_at: new Date().toISOString() })
      .eq("id", attempt.id);
  }

  if (attempt.gateway === "fonepay") {
    const uid = (params.UID || params.uid || "").trim();
    const bid = (params.BC || params.BID || params.bc || "").trim();
    if (uid) {
      const combined = `${uid}|${bid}`;
      attempt.provider_pidx = combined;
      await service.from("appointment_payment_attempts")
        .update({ provider_pidx: combined, updated_at: new Date().toISOString() })
        .eq("id", attempt.id);
    } else if (String(params.PS || "").toLowerCase() === "false" || String(params.RC || "").toLowerCase() === "cancel") {
      await service.from("appointment_payment_attempts")
        .update({ status: "failed", updated_at: new Date().toISOString() })
        .eq("id", attempt.id).neq("status", "complete");
      return redirect("failed");
    }
  }

  // Execute server-to-server verification & atomic Postgres finalization immediately
  // (Generates confirmed appointment, queue token, invoice, ledger & notification even if client app is closed!)
  const result = await finalizeAttempt(attempt, credentials);
  return redirect(result.status);
}

// =============================================================================
// BACKGROUND SWEEP FOR CLOSED-APP / DISCONNECTED BROWSER ATTEMPTS
// =============================================================================

async function reconcilePendingAttempts(req: Request, body: Record<string, unknown>, corsHeaders: Record<string, string>) {
  const isServiceCaller = isServiceRoleRequest(req);
  const clinicFilter = String(body.clinicId ?? "").trim();

  if (!isServiceCaller) {
    if (!clinicFilter) {
      return json({ error: "Service authorization or clinicId required for reconciliation" }, 401, corsHeaders);
    }
    const authCheck = await authorizeClinicSetupCaller(req, clinicFilter, corsHeaders);
    if (authCheck.errorResponse) return authCheck.errorResponse;
  }

  // Expire abandoned attempts >24h
  await service.rpc("expire_stale_online_payment_attempts").catch(() => null);

  const cutoffIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  let query = service.from("appointment_payment_attempts")
    .select("id,appointment_id,clinic_id,gateway,transaction_uuid,amount_npr,status,provider_reference,provider_pidx,client_return_url,reconcile_attempts")
    .eq("status", "pending")
    .gte("created_at", cutoffIso)
    .order("created_at", { ascending: false })
    .limit(25);

  if (clinicFilter) query = query.eq("clinic_id", clinicFilter);

  const { data: pendingRows } = await query;
  const rows = (pendingRows || []) as Attempt[];
  const credCache = new Map<string, ClinicCredentials | null>();

  let finalizedCount = 0;
  let failedCount = 0;

  for (const row of rows) {
    if (!credCache.has(row.clinic_id)) {
      credCache.set(row.clinic_id, await getCredentials(row.clinic_id));
    }
    const creds = credCache.get(row.clinic_id) ?? null;
    if (!creds) continue;

    try {
      const outcome = await finalizeAttempt(row, creds);
      if (outcome.status === "complete") finalizedCount++;
      else if (outcome.status === "failed") failedCount++;
      await service.from("appointment_payment_attempts").update({
        reconcile_attempts: Number(row.reconcile_attempts ?? 0) + 1,
        last_reconciled_at: new Date().toISOString(),
      }).eq("id", row.id);
    } catch (err) {
      console.warn("reconcile_pending item error", row.id, err);
    }
  }

  return json({
    checkedCount: rows.length,
    finalizedCount,
    failedCount,
  }, 200, corsHeaders);
}

// =============================================================================
// MAIN EDGE FUNCTION ROUTER
// =============================================================================

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const url = new URL(req.url);
  const action = url.searchParams.get("action");

  try {
    if (req.method === "GET" && action === "checkout") {
      return await handleCheckout(url, corsHeaders);
    }

    if (req.method === "GET" && action === "get_form_payload") {
      return await handleGetFormPayload(url, corsHeaders);
    }

    if (req.method === "GET" && action === "get_public_payment_methods") {
      const clinicId = (url.searchParams.get("clinic_id") || "").trim();
      if (!clinicId) return json({ error: "clinic_id is required" }, 400, corsHeaders);
      const { data, error } = await service.rpc("get_clinic_public_payment_methods", { p_clinic_id: clinicId });
      if (!error && Array.isArray(data)) {
        return json({ payment_methods: data }, 200, corsHeaders);
      }
      return json({ payment_methods: await buildPublicPaymentMethodsFallback(clinicId) }, 200, corsHeaders);
    }

    // Both GET and POST supported for gateway return callbacks (ConnectIPS, Fonepay, Khalti, eSewa)
    if ((req.method === "GET" || req.method === "POST") && action === "return") {
      return await handleReturnOrWebhook(req, url, corsHeaders, false);
    }

    if (req.method === "POST" && action === "webhook") {
      return await handleReturnOrWebhook(req, url, corsHeaders, true);
    }

    if (req.method !== "POST") return json({ error: "Method not allowed" }, 405, corsHeaders);
    const body = await req.json() as Record<string, unknown>;

    if (body.action === "get_public_payment_methods") {
      const clinicId = String(body.clinicId ?? body.clinic_id ?? "").trim();
      if (!clinicId) return json({ error: "clinicId is required" }, 400, corsHeaders);
      const { data, error } = await service.rpc("get_clinic_public_payment_methods", { p_clinic_id: clinicId });
      if (!error && Array.isArray(data)) {
        return json({ payment_methods: data }, 200, corsHeaders);
      }
      return json({ payment_methods: await buildPublicPaymentMethodsFallback(clinicId) }, 200, corsHeaders);
    }

    if (body.action === "get_gateway_setup_status") {
      const clinicId = String(body.clinicId ?? "").trim();
      const authCheck = await authorizeClinicSetupCaller(req, clinicId, corsHeaders);
      if (authCheck.errorResponse || !authCheck.userClient) return authCheck.errorResponse!;

      const { data, error } = await authCheck.userClient.rpc("get_clinic_gateway_setup_status", { p_clinic_id: clinicId });
      if (!error && data) return json({ setup: data, callbackBaseUrl: `${supabaseUrl}/functions/v1/appointment-payment` }, 200, corsHeaders);

      // Safe fallback reading non-secret booleans if SQL RPC not yet deployed
      const creds = await getCredentials(clinicId);
      const { data: clinicRow } = await service.from("clinics").select("is_direct_payment_enabled").eq("id", clinicId).maybeSingle();
      return json({
        callbackBaseUrl: `${supabaseUrl}/functions/v1/appointment-payment`,
        setup: {
          is_direct_payment_enabled: Boolean(clinicRow?.is_direct_payment_enabled),
          esewa: {
            enabled: Boolean(creds?.esewa_enabled ?? creds?.is_verified),
            is_verified: Boolean(creds?.esewa_is_verified ?? creds?.is_verified),
            environment: creds?.esewa_environment || "test",
            merchant_id: creds?.esewa_product_code || "",
            has_secret_key: Boolean(creds?.esewa_secret_key?.trim()),
          },
          khalti: {
            enabled: Boolean(creds?.khalti_enabled),
            is_verified: Boolean(creds?.khalti_is_verified),
            environment: creds?.khalti_environment || "test",
            public_key: creds?.khalti_public_key || "",
            has_secret_key: Boolean(creds?.khalti_secret_key?.trim()),
          },
          fonepay: {
            enabled: Boolean(creds?.fonepay_enabled),
            is_verified: Boolean(creds?.fonepay_is_verified),
            environment: creds?.fonepay_environment || "test",
            merchant_code: creds?.fonepay_merchant_code || "",
            username: creds?.fonepay_username || "",
            has_secret_key: Boolean(creds?.fonepay_secret_key?.trim()),
            has_password: Boolean(creds?.fonepay_password?.trim()),
          },
          connectips: {
            enabled: Boolean(creds?.connectips_enabled),
            is_verified: Boolean(creds?.connectips_is_verified),
            environment: creds?.connectips_environment || "test",
            merchant_id: creds?.connectips_merchant_id || "",
            app_id: creds?.connectips_app_id || "",
            app_name: creds?.connectips_app_name || "",
            has_app_password: Boolean(creds?.connectips_app_password?.trim()),
            has_private_key: Boolean(creds?.connectips_private_key?.trim()),
          },
        },
      }, 200, corsHeaders);
    }

    if (body.action === "admin_get_platform_settings") {
      const userClient = await callerClient(req);
      if (!userClient) return json({ error: "Unauthorized: Sign-in required" }, 401, corsHeaders);
      const { data: isAdmin } = await userClient.rpc("is_admin_portal_user");
      if (isAdmin !== true) return json({ error: "Unauthorized: Super Admin access required" }, 403, corsHeaders);

      const { data, error } = await service
        .from("platform_payment_settings")
        .select("*")
        .eq("id", "global_config")
        .maybeSingle();
      if (error) return json({ error: error.message }, 500, corsHeaders);
      return json({ settings: data }, 200, corsHeaders);
    }

    if (body.action === "admin_save_platform_settings") {
      const userClient = await callerClient(req);
      if (!userClient) return json({ error: "Unauthorized: Sign-in required" }, 401, corsHeaders);
      const { data: isAdmin } = await userClient.rpc("is_admin_portal_user");
      if (isAdmin !== true) return json({ error: "Unauthorized: Super Admin access required" }, 403, corsHeaders);

      const patch: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
        updated_by: "super_admin",
      };
      if (body.is_global_demo_mode !== undefined) patch.is_global_demo_mode = Boolean(body.is_global_demo_mode);
      if (body.primary_gateway) patch.primary_gateway = String(body.primary_gateway).toLowerCase().trim();
      if (body.platform_gateways) patch.platform_gateways = body.platform_gateways;

      const { data, error } = await service
        .from("platform_payment_settings")
        .upsert({ id: "global_config", ...patch })
        .select()
        .single();
      if (error) return json({ error: error.message }, 500, corsHeaders);
      return json({ success: true, settings: data }, 200, corsHeaders);
    }

    if (body.action === "save_esewa_credentials" || body.action === "save_credentials") {
      return await saveCredentials(req, body, corsHeaders);
    }

    if (body.action === "toggle_gateway") {
      return await toggleGateway(req, body, corsHeaders);
    }

    if (body.action === "reconcile_pending") {
      return await reconcilePendingAttempts(req, body, corsHeaders);
    }

    if (action === "confirm_pay_at_desk" || body.action === "confirm_pay_at_desk") {
      const appointmentId = String(body.appointmentId ?? body.appointment_id ?? url.searchParams.get("appointmentId") ?? url.searchParams.get("appointment_id") ?? "").trim();
      const feeAmount = body.feeAmount ?? body.fee_amount ?? (url.searchParams.get("feeAmount") || url.searchParams.get("fee_amount")) ?? null;

      if (!appointmentId || !/^[0-9a-f-]{36}$/i.test(appointmentId)) {
        return json({ error: "Invalid appointmentId" }, 400, corsHeaders);
      }

      if (!(await authorizeAppointment(req, appointmentId, body))) {
        return json({ error: "Appointment ownership could not be verified" }, 403, corsHeaders);
      }

      // 1. Primary execution via RPC
      const { data, error } = await service.rpc("confirm_pay_at_desk_booking", {
        p_appointment_id: appointmentId,
        p_fee_amount: feeAmount !== null && Number.isFinite(Number(feeAmount)) ? Number(feeAmount) : null,
      });

      if (!error && data) {
        return json({ success: true, appointment: data }, 200, corsHeaders);
      }

      // 2. Service-role fallback if RPC encounters unexpected error or is pending deployment
      console.warn("confirm_pay_at_desk RPC error or fallback triggered:", error?.message);

      const { data: appt, error: apptErr } = await service.from("appointments")
        .select("*")
        .eq("id", appointmentId)
        .maybeSingle();

      if (apptErr || !appt) {
        return json({ error: apptErr?.message || "Appointment not found" }, 404, corsHeaders);
      }

      if (appt.payment_status === "paid") {
        return json({ error: "Cannot switch paid appointment to Pay at Desk" }, 409, corsHeaders);
      }
      if (appt.checkin_status === "cancelled") {
        return json({ error: "Cannot confirm cancelled appointment" }, 409, corsHeaders);
      }
      if (appt.status === "APPROVED" && appt.payment_mode === "PAY_AT_DESK") {
        return json({ error: "Appointment is already approved at desk" }, 409, corsHeaders);
      }
      if (["UNAPPROVED", "EXPIRED", "COMPLETED"].includes(appt.status)) {
        return json({ error: `Cannot confirm Pay at Desk for appointment with status ${appt.status}: must use retry_pay_at_desk_appointment if unapproved` }, 409, corsHeaders);
      }
      if (appt.expires_at && new Date(appt.expires_at).getTime() < Date.now()) {
        return json({ error: "Cannot confirm Pay at Desk: Appointment request has expired" }, 409, corsHeaders);
      }

      let authoritativeFee = 0;
      const { data: clinicRowDesk } = await service.from("clinics").select("type").eq("id", appt.clinic_id).maybeSingle();
      const isDiagnosticLabDesk = String(clinicRowDesk?.type ?? "").toLowerCase().includes("lab");

      if (isDiagnosticLabDesk) {
        if (appt.total_amount && Number(appt.total_amount) > 0) {
          authoritativeFee = Number(appt.total_amount);
        } else if (appt.fee_amount && Number(appt.fee_amount) > 0) {
          authoritativeFee = Number(appt.fee_amount);
        } else if (feeAmount && Number(feeAmount) > 0) {
          authoritativeFee = Number(feeAmount);
        }
      } else if (appt.doctor_id) {
        const { data: doctor } = await service.from("doctors")
          .select("consultation_fee")
          .eq("id", appt.doctor_id).maybeSingle();
        if (doctor && typeof doctor.consultation_fee === "number" && doctor.consultation_fee > 0) {
          authoritativeFee = Number(doctor.consultation_fee);
        }
      }
      if (authoritativeFee <= 0 && appt.fee_amount && Number(appt.fee_amount) > 0) {
        authoritativeFee = Number(appt.fee_amount);
      }
      if (authoritativeFee <= 0 && feeAmount && Number(feeAmount) > 0) {
        authoritativeFee = Number(feeAmount);
      }
      if (authoritativeFee <= 0) authoritativeFee = 500.00;
      authoritativeFee = Number(authoritativeFee.toFixed(2));

      const serviceCharge = Math.round((authoritativeFee * 0.05 + Number.EPSILON) * 100) / 100;
      const totalAmount = Math.round((authoritativeFee + serviceCharge + Number.EPSILON) * 100) / 100;

      const deskPatch: Record<string, unknown> = {
        payment_mode: "PAY_AT_DESK",
        status: "WAITING_FOR_APPROVAL",
        payment_status: "pending",
        checkin_status: "not_checked_in",
        attempt_number: 1,
        fee_amount: authoritativeFee,
        service_charge_amount: serviceCharge,
        total_amount: totalAmount,
        updated_at: new Date().toISOString(),
      };
      if (isDiagnosticLabDesk) {
        deskPatch.doctor_id = null;
      }

      const { data: updatedAppt, error: updateErr } = await service.from("appointments")
        .update(deskPatch)
        .eq("id", appointmentId)
        .select("*")
        .single();

      if (updateErr || !updatedAppt) {
        return json({ error: updateErr?.message || error?.message || "Failed to confirm Pay at Desk booking" }, 500, corsHeaders);
      }

      // Live queue isolation: pending Pay at Desk must not be in live queue until approved
      await service.from("queue_entries").delete().eq("appointment_id", appointmentId);

      // Recalculate slot booked_count (only approved appointments count)
      if (updatedAppt.slot_id) {
        const { count: approvedCount } = await service.from("appointments")
          .select("id", { count: "exact", head: true })
          .eq("slot_id", updatedAppt.slot_id)
          .neq("checkin_status", "cancelled")
          .eq("status", "APPROVED");

        await service.from("slots")
          .update({ booked_count: approvedCount || 0 })
          .eq("id", updatedAppt.slot_id);
      }

      // Emit notification to clinic staff safely
      if (updatedAppt.clinic_id) {
        const tracking = updatedAppt.tracking_code_10_digit || updatedAppt.tracking_code || updatedAppt.id;
        const patientName = updatedAppt.patient_name || "Patient";
        const total = updatedAppt.total_amount || updatedAppt.fee_amount || 0;

        // Personal profile notification if clinic contact_email matches a staff profile
        const { data: clinic } = await service.from("clinics")
          .select("contact_email")
          .eq("id", updatedAppt.clinic_id)
          .maybeSingle();

        if (clinic?.contact_email) {
          const { data: clinicOwner } = await service.from("profiles")
            .select("id")
            .ilike("email", clinic.contact_email)
            .maybeSingle();

          if (clinicOwner?.id) {
            try {
              await service.from("notifications").insert({
                user_id: clinicOwner.id,
                appointment_id: updatedAppt.id,
                title: "New Pay at Desk Booking",
                message: `Appointment #${tracking} for ${patientName} confirmed (Token #${nextPos}). NPR ${total} due at desk.`,
                type: "queue_alert",
                target_audience: "specific",
              });
            } catch (e) {
              console.warn("Staff profile notification error:", e?.message);
            }
          }
        }
      }

      // Return clean response
      return json({
        success: true,
        appointment: {
          success: true,
          appointment_id: updatedAppt.id,
          tracking_code: updatedAppt.tracking_code_10_digit || updatedAppt.tracking_code,
          tracking_code_10_digit: updatedAppt.tracking_code_10_digit || updatedAppt.tracking_code,
          status: updatedAppt.status,
          payment_mode: updatedAppt.payment_mode,
          payment_status: updatedAppt.payment_status,
          checkin_status: updatedAppt.checkin_status,
          attempt_number: updatedAppt.attempt_number,
          fee_amount: updatedAppt.fee_amount,
          service_charge_amount: updatedAppt.service_charge_amount,
          total_amount: updatedAppt.total_amount,
        },
      }, 200, corsHeaders);
    }

    if (body.action === "initiate") {
      const appointmentId = String(body.appointmentId ?? "").trim();
      const requestedGateway = String(body.gateway ?? "esewa").toLowerCase().trim();
      if (!isSupportedGateway(requestedGateway)) {
        return json({ error: `Unsupported payment gateway: ${requestedGateway}` }, 400, corsHeaders);
      }

      const { data: appt } = await service.from("appointments")
        .select("*")
        .eq("id", appointmentId).maybeSingle();
      if (!appt) return json({ error: "Appointment was not found" }, 404, corsHeaders);
      if (!(await authorizeAppointment(req, appointmentId, body))) {
        return json({ error: "Appointment ownership could not be verified" }, 403, corsHeaders);
      }
      if (appt.payment_status === "paid") return json({ error: "Appointment is already paid" }, 409, corsHeaders);
      if (appt.payment_status !== "pending" || !["not_checked_in", "checked_in", "waiting"].includes(String(appt.checkin_status))) {
        return json({ error: "Appointment is not available for payment" }, 409, corsHeaders);
      }

      const { data: clinic } = await service.from("clinics")
        .select("is_direct_payment_enabled,type")
        .eq("id", appt.clinic_id).maybeSingle();
      if (clinic?.is_direct_payment_enabled !== true) {
        return json({ error: "This clinic has not enabled direct online payments" }, 409, corsHeaders);
      }

      const credentials = await getCredentials(appt.clinic_id);
      if (!isGatewayUsableWithCreds(requestedGateway, credentials)) {
        return json({
          error: `This clinic has not configured or enabled verified ${requestedGateway.toUpperCase()} merchant keys`,
        }, 409, corsHeaders);
      }

      // Authoritatively verify consultation_fee or diagnostic lab service fees from server catalog
      let authoritativeFee = 0;
      const isDiagnosticLab = String(clinic?.type ?? "").toLowerCase().includes("lab");

      if (isDiagnosticLab) {
        // DIAGNOSTIC LAB MODE: strictly calculate fee from lab tests, NEVER from doctor consultation fee
        const apptAny = appt as Record<string, unknown>;
        const rawSelected = apptAny.selected_tests ?? apptAny.selected_lab_tests ?? body.selectedTests ?? body.selected_tests;
        let selectedTests: string[] = [];
        if (Array.isArray(rawSelected)) {
          selectedTests = rawSelected.map((t: unknown) => String(t).replace(/\s*\(Rs\..*\)$/i, "").trim()).filter(Boolean);
        } else if (typeof rawSelected === "string" && rawSelected.trim()) {
          selectedTests = rawSelected.split(",").map((t) => t.replace(/\s*\(Rs\..*\)$/i, "").trim()).filter(Boolean);
        }

        // Also check if notes contains tests (e.g. "Lab Tests: Complete Blood Count (CBC) (Rs. 450)")
        if (selectedTests.length === 0 && appt.notes && appt.notes.includes("Lab Tests:")) {
          const notesPart = appt.notes.replace(/^.*Lab Tests:\s*/i, "").trim();
          selectedTests = notesPart.split(",").map((t) => t.replace(/\s*\(Rs\..*\)$/i, "").trim()).filter(Boolean);
        }

        const { data: services } = await service.from("clinic_services")
          .select("id,service_name,price")
          .eq("clinic_id", appt.clinic_id);

        if (Array.isArray(services) && services.length > 0) {
          const priceMap = new Map<string, number>();
          for (const svc of services) {
            if (svc?.service_name && Number(svc.price) > 0) {
              priceMap.set(String(svc.service_name).trim().toLowerCase(), Number(svc.price));
            }
          }
          if (selectedTests.length > 0) {
            let labSum = 0;
            for (const testName of selectedTests) {
              const p = priceMap.get(testName.toLowerCase());
              if (p !== undefined) labSum += p;
            }
            if (labSum > 0) authoritativeFee = labSum;
          }
          if (authoritativeFee <= 0) {
            // Verify stored fee matches valid catalog price
            const minCatalogPrice = Math.min(...services.map((s) => Number(s.price)).filter((p) => p > 0));
            const maxCatalogSum = services.reduce((acc, s) => acc + Math.max(0, Number(s.price)), 0);
            const candidateTotal = Number(appt.total_amount);
            const candidateFee = Number(appt.fee_amount);
            if (Number.isFinite(candidateTotal) && candidateTotal >= minCatalogPrice && candidateTotal <= maxCatalogSum) {
              authoritativeFee = candidateTotal;
            } else if (Number.isFinite(candidateFee) && candidateFee >= minCatalogPrice && candidateFee <= maxCatalogSum) {
              authoritativeFee = candidateFee;
            }
          }
        }
      } else {
        // OPD DOCTOR CONSULTATION MODE
        if (appt.doctor_id) {
          const { data: doctor } = await service.from("doctors")
            .select("consultation_fee")
            .eq("id", appt.doctor_id).maybeSingle();
          if (doctor && typeof doctor.consultation_fee === "number" && doctor.consultation_fee > 0) {
            authoritativeFee = Number(doctor.consultation_fee);
          }
        }
      }

      if (authoritativeFee <= 0) authoritativeFee = 500.00;
      authoritativeFee = Number(authoritativeFee.toFixed(2));
      if (!Number.isFinite(authoritativeFee) || authoritativeFee <= 0) {
        return json({ error: "Invalid authoritative consultation fee" }, 400, corsHeaders);
      }

      // Reconcile appointment fee in database if tampered
      const storedFee = Number(appt.fee_amount);
      const apptPatch: Record<string, unknown> = {};
      if (!Number.isFinite(storedFee) || Math.abs(storedFee - authoritativeFee) > 0.01) {
        apptPatch.fee_amount = authoritativeFee;
        apptPatch.total_amount = authoritativeFee;
      }
      if (isDiagnosticLab && appt.doctor_id) {
        apptPatch.doctor_id = null;
      }
      if (Object.keys(apptPatch).length > 0) {
        await service.from("appointments").update(apptPatch).eq("id", appt.id);
      }

      const returnUrl = trustedReturnUrl(body.returnUrl);
      const transactionUuid = generateCompactTransactionId();
      const { data: attempt, error } = await service.from("appointment_payment_attempts").insert({
        appointment_id: appt.id,
        clinic_id: appt.clinic_id,
        gateway: requestedGateway,
        transaction_uuid: transactionUuid,
        amount_npr: authoritativeFee,
        status: "pending",
        client_return_url: returnUrl ? returnUrl.toString() : null,
      }).select("id,appointment_id,gateway,transaction_uuid,amount_npr").single();

      if (error || !attempt) {
        console.error("Could not insert payment attempt", error);
        return json({ error: "Could not start payment session" }, 500, corsHeaders);
      }

      // Server-authoritative Phase 2 transition: clear 5-minute decision window,
      // record payment_initiated_at, and set gateway-specific backstop (15 or 20 min)
      try {
        const { error: phaseErr } = await service.rpc("initiate_online_payment_phase", {
          p_appointment_id: appt.id,
          p_gateway: requestedGateway,
        });
        if (phaseErr) {
          console.warn("initiate_online_payment_phase RPC warning:", phaseErr);
          const backstopMinutes = ["fonepay", "connectips"].includes(requestedGateway) ? 20 : 15;
          await service.from("appointments").update({
            expires_at: null,
            payment_initiated_at: new Date().toISOString(),
            gateway_backstop_expires_at: new Date(Date.now() + backstopMinutes * 60 * 1000).toISOString(),
          }).eq("id", appt.id);
        }
      } catch (phaseEx) {
        console.warn("Phase 2 transition exception:", phaseEx);
      }

      // Direct eSewa checkouts to the dedicated web checkout bridge on GitHub Pages
      const checkout = requestedGateway === "esewa"
        ? new URL("https://dactorofficial.github.io/admin-portal/checkout.html")
        : new URL(`${supabaseUrl}/functions/v1/appointment-payment`);
      if (requestedGateway !== "esewa") {
        checkout.searchParams.set("action", "checkout");
      }
      checkout.searchParams.set("attempt_id", attempt.id);
      if (returnUrl) checkout.searchParams.set("return_url", returnUrl.toString());

      return json({
        attemptId: attempt.id,
        gateway: requestedGateway,
        checkoutUrl: checkout.toString(),
        transactionUuid,
      }, 200, corsHeaders);
    }

    if (body.action === "refresh") {
      const appointmentId = String(body.appointmentId ?? "").trim();
      if (!(await authorizeAppointment(req, appointmentId, body))) {
        return json({ error: "Appointment ownership could not be verified" }, 403, corsHeaders);
      }

      // Check all recent attempts for this appointment across ALL gateways (esewa, khalti, fonepay, connectips)
      const { data: attempts } = await service.from("appointment_payment_attempts")
        .select("id,appointment_id,clinic_id,gateway,transaction_uuid,amount_npr,status,provider_reference,provider_pidx,client_return_url,reconcile_attempts")
        .eq("appointment_id", appointmentId)
        .order("created_at", { ascending: false })
        .limit(5);

      const list = (attempts || []) as Attempt[];
      if (list.length === 0) return json({ status: "not_started", gateway: null, reference: null }, 200, corsHeaders);

      const alreadyComplete = list.find((a) => a.status === "complete");
      if (alreadyComplete) {
        return json({
          status: "complete",
          gateway: alreadyComplete.gateway,
          reference: alreadyComplete.provider_reference ?? alreadyComplete.transaction_uuid,
        }, 200, corsHeaders);
      }

      const credentials = await getCredentials(list[0].clinic_id);
      if (credentials) {
        for (const candidate of list) {
          if (candidate.status === "pending") {
            const res = await finalizeAttempt(candidate, credentials);
            if (res.status === "complete") {
              return json({ status: "complete", gateway: candidate.gateway, reference: res.reference }, 200, corsHeaders);
            }
          }
        }
      }

      const { data: latest } = await service.from("appointment_payment_attempts")
        .select("status,gateway,provider_reference")
        .eq("id", list[0].id).single();

      return json({
        status: latest?.status ?? "pending",
        gateway: latest?.gateway ?? list[0].gateway,
        reference: latest?.provider_reference ?? null,
      }, 200, corsHeaders);
    }

    return json({ error: "Unknown action" }, 400, corsHeaders);
  } catch (error) {
    console.error("appointment-payment failure", error);
    if ((req.method === "GET" || req.method === "POST") && action === "return") {
      const attempt = await getAttemptByIdentifier({
        attemptId: url.searchParams.get("attempt_id") ?? undefined,
        transactionUuid: url.searchParams.get("TXNID") || url.searchParams.get("PRN") || undefined,
        pidx: url.searchParams.get("pidx") ?? undefined,
      });
      if (attempt) {
        const clientReturnUrl = trustedReturnUrl(url.searchParams.get("return_url") || attempt.client_return_url);
        if (clientReturnUrl) {
          const dest = new URL(clientReturnUrl.toString());
          dest.searchParams.set("appointmentId", attempt.appointment_id);
          dest.searchParams.set("gateway", attempt.gateway);
          dest.searchParams.set("status", "checking");
          return new Response(null, { status: 302, headers: { ...corsHeaders, Location: dest.toString(), "Cache-Control": "no-store" } });
        }
        return redirectToApp(attempt, "checking", corsHeaders);
      }
    }
    return json({ error: "Payment service could not complete this request" }, 500, corsHeaders);
  }
});
