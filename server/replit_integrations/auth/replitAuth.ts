import * as client from "openid-client";
import { Strategy, type VerifyFunction } from "openid-client/passport";

import passport from "passport";
import session from "express-session";
import type { Express, RequestHandler } from "express";
import memoize from "memoizee";
import connectPg from "connect-pg-simple";
import { getDbUrl } from "@shared/db-url";
import { storage } from "../../storage";
import type { User } from "@shared/schema";

const getOidcConfig = memoize(
  async () => {
    return await client.discovery(
      new URL(process.env.ISSUER_URL ?? "https://replit.com/oidc"),
      process.env.REPL_ID!
    );
  },
  { maxAge: 3600 * 1000 }
);

/**
 * Creates Express session middleware configured with a PostgreSQL-backed session store and a 7-day TTL.
 * @returns {RequestHandler} Express session middleware instance
 */
export function getSession() {
  const sessionTtl = 7 * 24 * 60 * 60 * 1000; // 1 week
  const pgStore = connectPg(session);
  const sessionStore = new pgStore({
    conString: getDbUrl(),
    createTableIfMissing: false,
    ttl: sessionTtl,
    // `user_sessions`, NOT `sessions`. The `sessions` table is owned by our
    // custom cookie-based auth (id/user_id/expires_at), which is a different
    // shape than connect-pg-simple's required (sid/sess/expire). Pointing
    // connect-pg-simple at `sessions` was the original bug behind task #561.
    tableName: "user_sessions",
  });
  return session({
    secret: process.env.SESSION_SECRET!,
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: true,
      maxAge: sessionTtl,
    },
  });
}

/**
 * Updates the user session object with OIDC claims and token data from the token endpoint response.
 * @param {any} user - The user session object to update
 * @param {client.TokenEndpointResponse & client.TokenEndpointResponseHelpers} tokens - The OIDC token endpoint response containing claims, access token, and refresh token
 * @returns {void}
 */
function updateUserSession(
  user: any,
  tokens: client.TokenEndpointResponse & client.TokenEndpointResponseHelpers
) {
  user.claims = tokens.claims();
  user.access_token = tokens.access_token;
  user.refresh_token = tokens.refresh_token;
  user.expires_at = user.claims?.exp;
}

/**
 * Upserts a user record in the database from OIDC claims and returns the
 * full row.
 *
 * The real `users` table uses an integer auto-generated primary key (and has
 * no `profile_image_url` column), so we cannot insert with the OIDC `sub` as
 * the id like the original Replit Auth blueprint did. Instead, we look up by
 * email — the same key our admin seed uses — and either refresh the name
 * fields or create a new `user` row. The full row (including the seeded
 * `role`) is what callers layer onto the Passport session user so that
 * `requireAdmin` / `requireAuth` and any handler that reads `req.user.id` /
 * `req.user.role` see the same shape they'd see for a cookie-auth user.
 *
 * @param {Record<string, unknown>} claims - The OIDC claims object containing
 *   at minimum `email`, plus optional `first_name` / `last_name`.
 * @returns {Promise<User>} The internal users row for the OIDC subject.
 */
export async function upsertUser(claims: Record<string, unknown>): Promise<User> {
  const rawEmail = typeof claims["email"] === "string" ? (claims["email"] as string) : null;
  if (!rawEmail) {
    throw new Error("OIDC claims missing required `email` field");
  }
  const email = rawEmail.toLowerCase().trim();
  const firstName = typeof claims["first_name"] === "string" ? (claims["first_name"] as string) : null;
  const lastName = typeof claims["last_name"] === "string" ? (claims["last_name"] as string) : null;

  const existing = await storage.getUserByEmail(email);
  if (existing) {
    if (firstName !== null || lastName !== null) {
      return await storage.updateUserProfile(existing.id, {
        firstName: firstName ?? existing.firstName ?? undefined,
        lastName: lastName ?? existing.lastName ?? undefined,
      });
    }
    return existing;
  }

  return await storage.createUser({
    email,
    role: "user",
    firstName,
    lastName,
    // OIDC users authenticate via Replit's identity provider, not via a
    // password. The DB column is NOT NULL, so we store an empty string —
    // `bcrypt.compare(anything, "")` returns false, which means the
    // password-login path can never accept a credential for this row.
    passwordHash: "",
  });
}

/**
 * Configures Passport.js with OpenID Connect strategy for Replit Auth, registers login/callback/logout routes, and initializes session handling.
 * @param {Express} app - The Express application instance to configure authentication on
 * @returns {Promise<void>}
 */
export async function setupAuth(app: Express) {
  app.set("trust proxy", 1);
  app.use(getSession());
  app.use(passport.initialize());
  app.use(passport.session());

  const config = await getOidcConfig();

  const verify: VerifyFunction = async (
    tokens: client.TokenEndpointResponse & client.TokenEndpointResponseHelpers,
    verified: passport.AuthenticateCallback
  ) => {
    const claims = tokens.claims();
    if (!claims) {
      verified(new Error("OIDC token response is missing id_token claims"));
      return;
    }
    try {
      // Layer the full DB user (id, role, email, firstName, lastName, …)
      // onto the Passport session user, then attach OIDC tokens for the
      // refresh path in `isAuthenticated`. Without the DB fields,
      // `requireAdmin` / handlers that read `req.user.role` or `req.user.id`
      // would silently treat OIDC-authed admins as unknown users.
      const dbUser = await upsertUser(claims as Record<string, unknown>);
      const user = { ...dbUser } as Express.User;
      updateUserSession(user, tokens);
      verified(null, user);
    } catch (err) {
      verified(err as Error);
    }
  };

  // Keep track of registered strategies
  const registeredStrategies = new Set<string>();

  // Helper function to ensure strategy exists for a domain
  const ensureStrategy = (domain: string) => {
    const strategyName = `replitauth:${domain}`;
    if (!registeredStrategies.has(strategyName)) {
      const strategy = new Strategy(
        {
          name: strategyName,
          config,
          scope: "openid email profile offline_access",
          callbackURL: `https://${domain}/api/callback`,
        },
        verify
      );
      passport.use(strategy);
      registeredStrategies.add(strategyName);
    }
  };

  passport.serializeUser((user: Express.User, cb) => cb(null, user));
  passport.deserializeUser((user: Express.User, cb) => cb(null, user));

  app.get("/api/login", (req, res, next) => {
    ensureStrategy(req.hostname);
    passport.authenticate(`replitauth:${req.hostname}`, {
      prompt: "login consent",
      scope: ["openid", "email", "profile", "offline_access"],
    })(req, res, next);
  });

  app.get("/api/callback", (req, res, next) => {
    ensureStrategy(req.hostname);
    passport.authenticate(`replitauth:${req.hostname}`, {
      successReturnToOrRedirect: "/",
      failureRedirect: "/api/login",
    })(req, res, next);
  });

  app.get("/api/logout", (req, res) => {
    req.logout(() => {
      res.redirect(
        client.buildEndSessionUrl(config, {
          client_id: process.env.REPL_ID!,
          post_logout_redirect_uri: `${req.protocol}://${req.hostname}`,
        }).href
      );
    });
  });
}

/**
 * Express middleware that checks if the request is authenticated and automatically refreshes expired tokens using the refresh token grant.
 * @param {Request} req - The Express request object
 * @param {Response} res - The Express response object
 * @param {NextFunction} next - The Express next function
 * @returns {Promise<void>} Calls next() if authenticated, or responds with 401 Unauthorized
 */
export const isAuthenticated: RequestHandler = async (req, res, next) => {
  const user = req.user as { expires_at?: number; refresh_token?: string } | undefined;

  if (!req.isAuthenticated() || !user?.expires_at) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  const now = Math.floor(Date.now() / 1000);
  if (now <= user.expires_at) {
    return next();
  }

  const refreshToken = user.refresh_token;
  if (!refreshToken) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }

  try {
    const config = await getOidcConfig();
    const tokenResponse = await client.refreshTokenGrant(config, refreshToken);
    updateUserSession(user, tokenResponse);
    return next();
  } catch (_error: unknown) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }
};
