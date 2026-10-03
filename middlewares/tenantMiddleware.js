/**
 * Resolves which tenant (restaurant) a request belongs to, from the Host
 * header's subdomain, and binds it to the request-scoped AsyncLocalStorage
 * context so every downstream Mongoose query is auto-scoped by tenantId
 * (see plugins/tenantScopePlugin.js).
 *
 * Must run before every route (mounted in app.js right after body parsers).
 */
const jwt = require("jsonwebtoken");
const Tenant = require("../models/Tenant");
const { runWithTenant } = require("../utils/tenantContext");

const PLATFORM_DOMAIN = process.env.PLATFORM_DOMAIN || "localhost";
const CLIENT_HOST = (() => {
  try {
    return process.env.CLIENT_URL
      ? new URL(process.env.CLIENT_URL).hostname.toLowerCase()
      : null;
  } catch {
    return null;
  }
})();
const BACKEND_HOST = (() => {
  try {
    return process.env.BACKEND_URL
      ? new URL(process.env.BACKEND_URL).hostname.toLowerCase()
      : null;
  } catch {
    return null;
  }
})();
// Reserved subdomains are treated as platform-level (no tenant) rather than looked up.
const RESERVED_SUBDOMAINS = new Set(["www", "api", "admin", "app"]);

/**
 * Dev-only convenience: if there's no real subdomain and no explicit
 * X-Tenant-Subdomain override, fall back to whatever tenant the caller's own
 * JWT says they belong to. Without this, being logged in as a tenant's admin
 * isn't enough locally — every request would resolve to "no tenant" (since
 * there's no wildcard DNS) and get rejected as a cross-tenant session by
 * authMiddleware, even though the token is perfectly valid.
 * Verified (not just decoded) so a tampered/expired token can't be used to
 * probe another tenant's data this way; authMiddleware still independently
 * verifies the token for the actual request.
 */
function tenantIdFromToken(req) {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return null;
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    return decoded.tenantId || null;
  } catch {
    return null;
  }
}

function extractSubdomain(req) {
  const host = (req.headers.host || "").split(":")[0].toLowerCase();
  if (!host) return null;

  // Ignore platform-level hosts (frontend, backend, or apex platform domain).
  if (
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === PLATFORM_DOMAIN ||
    host === CLIENT_HOST ||
    host === BACKEND_HOST
  ) {
    return null;
  }

  // On Vercel, deployment hostnames such as <project>-<hash>.vercel.app are not
  // tenant subdomains; they are platform/backend hosts. Ignore them unless they
  // are explicitly configured as a real tenant domain.
  if (PLATFORM_DOMAIN === "vercel.app" && host.endsWith(".vercel.app")) {
    return null;
  }

  const platformParts = PLATFORM_DOMAIN.split(".").length;
  const hostParts = host.split(".");

  // host === platform domain (or bare "localhost") => no subdomain, apex/platform request
  if (hostParts.length <= platformParts) return null;

  // Only treat it as a real tenant subdomain if it's actually a suffix of the platform domain
  if (!host.endsWith(PLATFORM_DOMAIN)) return null;

  const subdomain = hostParts[0];
  if (RESERVED_SUBDOMAINS.has(subdomain)) return null;

  return subdomain;
}

module.exports = async function resolveTenant(req, res, next) {
  try {
    let subdomain = extractSubdomain(req);
    const isDev = process.env.NODE_ENV !== "production";

    // Local-dev fallback: no wildcard DNS available, so allow the client to
    // declare which tenant it's testing against via a header or query param.
    if (!subdomain && isDev) {
      subdomain = req.headers["x-tenant-subdomain"] || req.query.tenant || null;
    }

    let tenant = null;

    if (subdomain && !RESERVED_SUBDOMAINS.has(subdomain)) {
      tenant = await Tenant.findOne({ subdomain }).setOptions({
        skipTenantScope: true,
      });
      if (!tenant) {
        return res
          .status(404)
          .json({ success: false, message: "Unknown restaurant" });
      }
    } else if (isDev) {
      // Still nothing — fall back to whichever tenant the caller's own
      // token belongs to, so "logged in" is enough locally.
      const tokenTenantId = tenantIdFromToken(req);
      if (tokenTenantId) {
        tenant = await Tenant.findById(tokenTenantId).setOptions({
          skipTenantScope: true,
        });
      }
    }

    if (!tenant) {
      req.tenant = null;
      return runWithTenant(null, next);
    }
    if (tenant.status === "suspended") {
      return res.status(403).json({
        success: false,
        message: "This restaurant is currently suspended",
      });
    }

    req.tenant = tenant;
    return runWithTenant(tenant._id, next);
  } catch (error) {
    next(error);
  }
};

module.exports.PLATFORM_DOMAIN = PLATFORM_DOMAIN;
