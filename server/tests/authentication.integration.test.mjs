import assert from "node:assert/strict";
import test from "node:test";
import { Pool } from "pg";

import { buildServer } from "../app.ts";
import { hashPassword } from "../infrastructure/auth/password.ts";
import { hashRefreshToken } from "../infrastructure/auth/tokens.ts";
import { runMigrations } from "../../scripts/database/migrations.mjs";
import {
  cleanupDatabase,
  MIGRATIONS,
} from "./postgresql-schema-test-support.mjs";

const databaseUrl = process.env.ERP_TEST_DATABASE_URL;

const IDS = Object.freeze({
  company: "9c000000-0000-4000-8000-000000000001",
  branch: "9c000000-0000-4000-8000-000000000002",
  role: "9c000000-0000-4000-8000-000000000003",
  user: "9c000000-0000-4000-8000-000000000004",
});

function authEnv() {
  return {
    NODE_ENV: "test",
    ERP_LOG_LEVEL: "silent",
    ERP_DATABASE_URL: databaseUrl,
    ERP_AUTH_TRANSPORT_MODE: "local-http",
    ERP_AUTH_ACCESS_TOKEN_SECRET: "integration-test-auth-signing-key-32-characters-minimum",
    ERP_AUTH_ACCESS_TOKEN_TTL_SECONDS: "900",
    ERP_AUTH_SESSION_TTL_SECONDS: "604800",
    ERP_AUTH_LOGIN_MAX_ATTEMPTS: "5",
    ERP_AUTH_LOGIN_WINDOW_SECONDS: "300",
  };
}

function refreshCookieValue(setCookie) {
  assert.equal(typeof setCookie, "string");
  const pair = setCookie.split(";")[0];
  assert.ok(pair?.startsWith("erp_refresh_token="));
  return decodeURIComponent(pair.slice("erp_refresh_token=".length));
}

async function seedIdentity(pool, passwordHash) {
  await pool.query(
    `INSERT INTO companies
      (id,name,base_currency_code,default_language,timezone,is_active,created_at,updated_at)
     VALUES ($1,'Phase 05 Auth Co','EGP','ar-EG','Africa/Cairo',true,now(),now())`,
    [IDS.company],
  );
  await pool.query(
    `INSERT INTO branches
      (id,company_id,name,code,is_active,created_at,updated_at)
     VALUES ($1,$2,'Main','MAIN',true,now(),now())`,
    [IDS.branch, IDS.company],
  );
  await pool.query(
    `INSERT INTO roles (id,role_key,display_name_key,is_system)
     VALUES ($1,'PHASE_05_AUTH_TEST','roles.phase05AuthTest',true)`,
    [IDS.role],
  );
  await pool.query(
    `INSERT INTO users
      (id,name,username,email,password_hash,role_id,default_branch_id,
       branch_scope_mode,preferred_language,is_active,last_login_at,created_at,updated_at)
     VALUES
      ($1,'Auth User','auth-user','auth@example.test',$2,$3,$4,
       'ALL','ar-EG',true,NULL,now(),now())`,
    [IDS.user, passwordHash, IDS.role, IDS.branch],
  );
}

test(
  "05.01 backend-owned Authentication uses hashed credentials, revocable rotating sessions, disabled-account enforcement, and login rate limiting on PostgreSQL 17",
  { skip: databaseUrl === undefined },
  async () => {
    assert.ok(databaseUrl);

    await cleanupDatabase(databaseUrl);
    const pool = new Pool({
      connectionString: databaseUrl,
      max: 8,
      application_name: "business-tech-erp-auth-test",
    });

    let app;
    try {
      const applied = await runMigrations({ databaseUrl });
      assert.deepEqual(applied.applied, MIGRATIONS);
      assert.deepEqual(applied.skipped, []);

      const version = await pool.query("SHOW server_version_num");
      const versionNumber = Number(version.rows[0]?.server_version_num);
      assert.ok(
        versionNumber >= 170000 && versionNumber < 180000,
        `05.01 requires PostgreSQL 17; received server_version_num=${version.rows[0]?.server_version_num}`,
      );

      const password = "Strong-Test-Password-2026!";
      const passwordHash = await hashPassword(password);
      await seedIdentity(pool, passwordHash);

      const storedPassword = await pool.query(
        "SELECT password_hash FROM users WHERE id=$1",
        [IDS.user],
      );
      assert.equal(storedPassword.rows[0]?.password_hash, passwordHash);
      assert.notEqual(storedPassword.rows[0]?.password_hash, password);
      assert.match(storedPassword.rows[0]?.password_hash, /^scrypt\$/);

      app = buildServer({ env: authEnv() });
      await app.ready();

      const login = await app.inject({
        method: "POST",
        url: "/auth/login",
        payload: {
          identifier: "AUTH-USER",
          password,
          deviceName: "Integration Test",
        },
      });
      assert.equal(login.statusCode, 200);
      assert.match(login.headers["cache-control"] ?? "", /no-store/);
      const loginBody = login.json();
      assert.equal(typeof loginBody.accessToken, "string");
      assert.equal("refreshToken" in loginBody, false);
      assert.equal(loginBody.user.id, IDS.user);

      const setCookie1 = login.headers["set-cookie"];
      assert.equal(typeof setCookie1, "string");
      assert.match(setCookie1, /HttpOnly/);
      assert.match(setCookie1, /SameSite=Strict/);
      assert.doesNotMatch(setCookie1, /Secure/);
      const refresh1 = refreshCookieValue(setCookie1);

      const session1 = await pool.query(
        `SELECT id,refresh_token_hash,revoked_at,expires_at
           FROM auth_sessions
          WHERE user_id=$1`,
        [IDS.user],
      );
      assert.equal(session1.rowCount, 1);
      assert.equal(session1.rows[0]?.refresh_token_hash, hashRefreshToken(refresh1));
      assert.notEqual(session1.rows[0]?.refresh_token_hash, refresh1);
      assert.equal(session1.rows[0]?.revoked_at, null);

      const me1 = await app.inject({
        method: "GET",
        url: "/auth/me",
        headers: { authorization: `Bearer ${loginBody.accessToken}` },
      });
      assert.equal(me1.statusCode, 200);
      assert.equal(me1.json().user.id, IDS.user);

      const refresh = await app.inject({
        method: "POST",
        url: "/auth/refresh",
        headers: { cookie: `erp_refresh_token=${encodeURIComponent(refresh1)}` },
      });
      assert.equal(refresh.statusCode, 200);
      const refreshBody = refresh.json();
      const setCookie2 = refresh.headers["set-cookie"];
      const refresh2 = refreshCookieValue(setCookie2);
      assert.notEqual(refresh2, refresh1);
      assert.equal("refreshToken" in refreshBody, false);

      const rotated = await pool.query(
        "SELECT refresh_token_hash FROM auth_sessions WHERE id=$1",
        [session1.rows[0]?.id],
      );
      assert.equal(rotated.rows[0]?.refresh_token_hash, hashRefreshToken(refresh2));
      assert.notEqual(rotated.rows[0]?.refresh_token_hash, hashRefreshToken(refresh1));

      const oldRefresh = await app.inject({
        method: "POST",
        url: "/auth/refresh",
        headers: { cookie: `erp_refresh_token=${encodeURIComponent(refresh1)}` },
      });
      assert.equal(oldRefresh.statusCode, 401);
      assert.equal(oldRefresh.json().errorCode, "AUTH_SESSION_INVALID");

      const oldAccess = await app.inject({
        method: "GET",
        url: "/auth/me",
        headers: { authorization: `Bearer ${loginBody.accessToken}` },
      });
      assert.equal(oldAccess.statusCode, 401);
      assert.equal(oldAccess.json().errorCode, "AUTH_SESSION_INVALID");

      const currentAccess = await app.inject({
        method: "GET",
        url: "/auth/me",
        headers: { authorization: `Bearer ${refreshBody.accessToken}` },
      });
      assert.equal(currentAccess.statusCode, 200);

      await pool.query("UPDATE users SET is_active=false WHERE id=$1", [IDS.user]);

      const disabledAccess = await app.inject({
        method: "GET",
        url: "/auth/me",
        headers: { authorization: `Bearer ${refreshBody.accessToken}` },
      });
      assert.equal(disabledAccess.statusCode, 403);
      assert.equal(disabledAccess.json().errorCode, "AUTH_ACCOUNT_DISABLED");

      const revokedAfterDisable = await pool.query(
        "SELECT revoked_at FROM auth_sessions WHERE id=$1",
        [session1.rows[0]?.id],
      );
      assert.ok(revokedAfterDisable.rows[0]?.revoked_at instanceof Date);

      const disabledLogin = await app.inject({
        method: "POST",
        url: "/auth/login",
        payload: { identifier: "auth-user", password },
      });
      assert.equal(disabledLogin.statusCode, 401);
      assert.equal(disabledLogin.json().errorCode, "AUTH_INVALID_CREDENTIALS");

      await pool.query("UPDATE users SET is_active=true WHERE id=$1", [IDS.user]);

      const login2 = await app.inject({
        method: "POST",
        url: "/auth/login",
        payload: { identifier: "auth@example.test", password },
      });
      assert.equal(login2.statusCode, 200);
      const login2Body = login2.json();
      const refresh3 = refreshCookieValue(login2.headers["set-cookie"]);

      const logout = await app.inject({
        method: "POST",
        url: "/auth/logout",
        headers: { cookie: `erp_refresh_token=${encodeURIComponent(refresh3)}` },
      });
      assert.equal(logout.statusCode, 200);
      assert.equal(logout.json().ok, true);
      assert.match(logout.headers["set-cookie"] ?? "", /Max-Age=0/);

      const afterLogout = await app.inject({
        method: "GET",
        url: "/auth/me",
        headers: { authorization: `Bearer ${login2Body.accessToken}` },
      });
      assert.equal(afterLogout.statusCode, 401);
      assert.equal(afterLogout.json().errorCode, "AUTH_SESSION_INVALID");

      for (let attempt = 0; attempt < 5; attempt += 1) {
        const wrong = await app.inject({
          method: "POST",
          url: "/auth/login",
          payload: {
            identifier: "auth-user",
            password: "wrong-password",
          },
        });
        assert.equal(wrong.statusCode, 401);
        assert.equal(wrong.json().errorCode, "AUTH_INVALID_CREDENTIALS");
      }

      const limited = await app.inject({
        method: "POST",
        url: "/auth/login",
        payload: {
          identifier: "auth-user",
          password,
        },
      });
      assert.equal(limited.statusCode, 429);
      assert.equal(limited.json().errorCode, "AUTH_RATE_LIMITED");
      assert.ok(limited.json().errorParams.retryAfterSeconds >= 1);

      const authIndexes = await pool.query(
        `SELECT indexname
           FROM pg_indexes
          WHERE schemaname='public'
            AND tablename='auth_sessions'
          ORDER BY indexname`,
      );
      assert.deepEqual(
        authIndexes.rows.map((row) => row.indexname),
        [
          "ix_auth_sessions__user_id_expires_at",
          "pk_auth_sessions",
          "uq_auth_sessions__refresh_token_hash",
        ],
      );

      const verification = await runMigrations({
        databaseUrl,
        verifyOnly: true,
      });
      assert.deepEqual(verification.applied, []);
      assert.deepEqual(verification.skipped, MIGRATIONS);
    } finally {
      if (app) await app.close().catch(() => {});
      await pool.end().catch(() => {});
      await cleanupDatabase(databaseUrl);
    }
  },
);
