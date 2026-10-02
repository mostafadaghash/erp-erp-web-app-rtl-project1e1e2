import assert from "node:assert/strict";
import test from "node:test";
import { Pool } from "pg";

import { runMigrations } from "../../scripts/database/migrations.mjs";
import { BranchAccessDeniedError } from "../infrastructure/authorization/branch-scope-service.ts";
import { RoleCatalogService } from "../infrastructure/authorization/role-catalog-service.ts";
import { withTransaction } from "../infrastructure/database/transaction.ts";
import { FinancialMovementService } from "../infrastructure/finance/financial-movement-service.ts";
import {
  TreasuryTransferError,
  TreasuryTransferService,
} from "../infrastructure/finance/treasury-transfer-service.ts";
import { TREASURY_PERMISSIONS } from "../infrastructure/finance/treasury-service.ts";
import { IdempotencyConflictError } from "../infrastructure/idempotency/idempotency-service.ts";
import { PostingBatchService } from "../infrastructure/posting/posting-batch-service.ts";
import {
  cleanupDatabase,
  MIGRATIONS,
} from "./postgresql-schema-test-support.mjs";

const databaseUrl = process.env.ERP_TEST_DATABASE_URL;

const I = Object.freeze({
  company: "ca040000-0000-4000-8000-000000000001",
  branchA: "ca040000-0000-4000-8000-000000000002",
  branchB: "ca040000-0000-4000-8000-000000000003",
  admin: "ca040000-0000-4000-8000-000000000004",
  selected: "ca040000-0000-4000-8000-000000000005",
  permission: "ca040000-0000-4000-8000-000000000006",
  a1: "ca040000-0000-4000-8000-000000000011",
  a2: "ca040000-0000-4000-8000-000000000012",
  aOff: "ca040000-0000-4000-8000-000000000013",
  b1: "ca040000-0000-4000-8000-000000000014",
  openingA: "ca040000-0000-4000-8000-000000000021",
  openingA2: "ca040000-0000-4000-8000-000000000022",
  openingB: "ca040000-0000-4000-8000-000000000023",
  duplicateMovement: "ca040000-0000-4000-8000-000000000099",
});

function base(key, issuingBranchId, fromTreasuryId, toTreasuryId, amount = "10") {
  return {
    idempotencyKey: key,
    idempotencyExpiresAt: new Date("2030-01-01T00:00:00Z"),
    actorUserId: I.admin,
    issuingBranchId,
    fromTreasuryId,
    toTreasuryId,
    amount,
    occurredAt: new Date("2026-10-02T10:00:00Z"),
  };
}

test(
  "09.04 Treasury Transfer is atomic, cross-branch scoped, deterministically locked and ledger-exact on PostgreSQL 17",
  { skip: databaseUrl === undefined },
  async () => {
    assert.ok(databaseUrl);
    await cleanupDatabase(databaseUrl);

    const pool = new Pool({
      connectionString: databaseUrl,
      max: 20,
      application_name: "business-tech-erp-treasury-transfer-0904",
    });
    const db = {
      transaction(work, options) {
        return withTransaction(pool, work, options);
      },
    };
    const roles = new RoleCatalogService(db);
    const posting = new PostingBatchService();
    const financial = new FinancialMovementService(db);
    const transfers = new TreasuryTransferService(db);

    async function opening(branchId, treasuryId, sourceId, amount) {
      await withTransaction(pool, async (client) => {
        const batch = await posting.create(client, {
          branchId,
          sourceType: "OPENING_BALANCE",
          sourceId,
          operationType: "POST",
          documentVersion: 1,
          createdBy: I.admin,
        });
        await financial.appendWithinTransaction(client, {
          actorUserId: I.admin,
          postingBatchId: batch.id,
          treasuryId,
          direction: "IN",
          amount,
          occurredAt: new Date("2026-10-01T08:00:00Z"),
        });
      });
    }

    async function balance(treasuryId) {
      const r = await pool.query(
        "SELECT current_balance::text AS balance FROM treasury_balance_positions WHERE treasury_id=$1",
        [treasuryId],
      );
      return r.rows[0]?.balance ?? "0.0000";
    }

    try {
      assert.deepEqual((await runMigrations({ databaseUrl })).applied, MIGRATIONS);

      const role = (await roles.ensureDefaultRoles()).find((x) => x.roleKey === "ACCOUNTANT");
      assert.ok(role);
      await pool.query(
        "INSERT INTO companies(id,name,base_currency_code,default_language,timezone,is_active,created_at,updated_at) VALUES($1,'0904 Co','EGP','ar-EG','Africa/Cairo',true,now(),now())",
        [I.company],
      );
      await pool.query(
        "INSERT INTO branches(id,company_id,name,code,is_active,created_at,updated_at) VALUES($1,$3,'A','A',true,now(),now()),($2,$3,'B','B',true,now(),now())",
        [I.branchA, I.branchB, I.company],
      );
      await pool.query(
        "INSERT INTO permissions(id,permission_key,module,description_key) VALUES($1,$2,'finance','permissions.finance.accounts.manage')",
        [I.permission, TREASURY_PERMISSIONS.manage],
      );
      await pool.query(
        "INSERT INTO role_permissions(role_id,permission_id,is_allowed) VALUES($1,$2,true)",
        [role.id, I.permission],
      );
      await pool.query(
        `INSERT INTO users(id,name,username,email,password_hash,role_id,default_branch_id,branch_scope_mode,preferred_language,is_active,created_at,updated_at)
         VALUES
          ($1,'Admin','0904-admin','0904-admin@example.test','x',$3,$4,'ALL','ar-EG',true,now(),now()),
          ($2,'Selected','0904-selected','0904-selected@example.test','x',$3,$4,'SELECTED','ar-EG',true,now(),now())`,
        [I.admin, I.selected, role.id, I.branchA],
      );
      await pool.query(
        "INSERT INTO user_branch_access(user_id,branch_id) VALUES($1,$2)",
        [I.selected, I.branchA],
      );
      await pool.query(
        `INSERT INTO treasuries(id,branch_id,name,is_active,notes,created_at) VALUES
         ($1,$5,'A Main',true,NULL,now()),
         ($2,$5,'A Other',true,NULL,now()),
         ($3,$5,'A Disabled',false,NULL,now()),
         ($4,$6,'B Main',true,NULL,now())`,
        [I.a1, I.a2, I.aOff, I.b1, I.branchA, I.branchB],
      );

      await opening(I.branchA, I.a1, I.openingA, "200");
      await opening(I.branchA, I.a2, I.openingA2, "50");
      await opening(I.branchB, I.b1, I.openingB, "100");

      const same = await transfers.post(base("same-1", I.branchA, I.a1, I.a2, "20"));
      assert.equal(same.state, "EXECUTED");
      assert.equal(same.value.transfer.documentNumber, "1");
      assert.equal(same.value.out.movement.direction, "OUT");
      assert.equal(same.value.incoming.movement.direction, "IN");
      assert.equal(same.value.out.movement.postingBatchId, same.value.incoming.movement.postingBatchId);
      assert.equal(same.value.out.movement.sourceId, same.value.transfer.id);
      assert.equal(same.value.incoming.movement.sourceId, same.value.transfer.id);
      assert.equal(await balance(I.a1), "180.0000");
      assert.equal(await balance(I.a2), "70.0000");

      const replay = await transfers.post(base("same-1", I.branchA, I.a1, I.a2, "20"));
      assert.equal(replay.state, "REPLAYED");
      assert.equal(replay.resultReference, same.resultReference);
      await assert.rejects(
        () => transfers.post(base("same-1", I.branchA, I.a1, I.a2, "21")),
        IdempotencyConflictError,
      );

      const cross = await transfers.post(base("cross-1", I.branchA, I.a1, I.b1, "30"));
      assert.equal(cross.state, "EXECUTED");
      assert.equal(cross.value.out.movement.branchId, I.branchA);
      assert.equal(cross.value.incoming.movement.branchId, I.branchB);
      assert.equal(cross.value.out.movement.postingBatchId, cross.value.incoming.movement.postingBatchId);
      assert.equal(await balance(I.a1), "150.0000");
      assert.equal(await balance(I.b1), "130.0000");

      const beforeDenied = await pool.query(
        "SELECT (SELECT count(*)::int FROM treasury_transfers) transfers,(SELECT count(*)::int FROM financial_movements) movements",
      );
      await assert.rejects(
        () => transfers.post({
          ...base("scope-denied", I.branchA, I.a1, I.b1, "1"),
          actorUserId: I.selected,
        }),
        BranchAccessDeniedError,
      );
      const afterDenied = await pool.query(
        "SELECT (SELECT count(*)::int FROM treasury_transfers) transfers,(SELECT count(*)::int FROM financial_movements) movements",
      );
      assert.deepEqual(afterDenied.rows[0], beforeDenied.rows[0]);

      await assert.rejects(
        () => transfers.post(base("same-treasury", I.branchA, I.a1, I.a1, "1")),
        (error) => error instanceof TreasuryTransferError && error.reason === "SAME_TREASURY",
      );
      await assert.rejects(
        () => transfers.post(base("inactive", I.branchA, I.a1, I.aOff, "1")),
        (error) => error instanceof TreasuryTransferError && error.reason === "TREASURY_INACTIVE",
      );
      await assert.rejects(
        () => transfers.post(base("issuing-mismatch", I.branchB, I.a1, I.b1, "1")),
        (error) => error instanceof TreasuryTransferError && error.reason === "ISSUING_BRANCH_MISMATCH",
      );

      const concurrent = await Promise.all([
        transfers.post(base("opposite-a", I.branchA, I.a1, I.b1, "5")),
        transfers.post(base("opposite-b", I.branchB, I.b1, I.a1, "7")),
      ]);
      assert.equal(concurrent.every((x) => x.state === "EXECUTED"), true);
      assert.equal(await balance(I.a1), "152.0000");
      assert.equal(await balance(I.b1), "128.0000");

      const numbered = await Promise.all(
        Array.from({ length: 6 }, (_, n) =>
          transfers.post(base(`number-${n}`, I.branchA, I.a1, I.a2, "1")),
        ),
      );
      const numbers = numbered.map((x) => Number(x.value.transfer.documentNumber));
      assert.equal(new Set(numbers).size, 6);

      const reconciliation = await pool.query(
        `SELECT p.treasury_id,p.current_balance::text AS position,
                COALESCE(SUM(CASE WHEN fm.direction='IN' THEN fm.amount ELSE -fm.amount END),0)::numeric(18,4)::text AS ledger
           FROM treasury_balance_positions p
           LEFT JOIN financial_movements fm ON fm.treasury_id=p.treasury_id
          WHERE p.treasury_id = ANY($1::uuid[])
          GROUP BY p.treasury_id,p.current_balance
          ORDER BY p.treasury_id`,
        [[I.a1, I.a2, I.b1]],
      );
      for (const row of reconciliation.rows) assert.equal(row.position, row.ledger);

      const beforeFailure = {
        transfers: Number((await pool.query("SELECT count(*) AS c FROM treasury_transfers")).rows[0].c),
        movements: Number((await pool.query("SELECT count(*) AS c FROM financial_movements")).rows[0].c),
        batches: Number((await pool.query("SELECT count(*) AS c FROM posting_batches WHERE source_type='TREASURY_TRANSFER'")).rows[0].c),
        a1: await balance(I.a1),
        a2: await balance(I.a2),
      };
      await pool.query(`
        CREATE FUNCTION public.test_0904_fail_in_leg() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN
          IF NEW.source_type='TREASURY_TRANSFER' AND NEW.direction='IN' THEN
            RAISE EXCEPTION 'forced 09.04 second-leg failure';
          END IF;
          RETURN NEW;
        END;
        $$;
        CREATE TRIGGER test_0904_fail_in_leg
        BEFORE INSERT ON public.financial_movements
        FOR EACH ROW EXECUTE FUNCTION public.test_0904_fail_in_leg();
      `);
      await assert.rejects(
        () => transfers.post(base("forced-failure", I.branchA, I.a1, I.a2, "3")),
        /forced 09.04 second-leg failure/,
      );
      await pool.query("DROP TRIGGER test_0904_fail_in_leg ON public.financial_movements");
      await pool.query("DROP FUNCTION public.test_0904_fail_in_leg()");
      assert.equal(Number((await pool.query("SELECT count(*) AS c FROM treasury_transfers")).rows[0].c), beforeFailure.transfers);
      assert.equal(Number((await pool.query("SELECT count(*) AS c FROM financial_movements")).rows[0].c), beforeFailure.movements);
      assert.equal(Number((await pool.query("SELECT count(*) AS c FROM posting_batches WHERE source_type='TREASURY_TRANSFER'")).rows[0].c), beforeFailure.batches);
      assert.equal(await balance(I.a1), beforeFailure.a1);
      assert.equal(await balance(I.a2), beforeFailure.a2);

      await assert.rejects(
        () => pool.query("UPDATE treasury_transfers SET amount=amount+1 WHERE id=$1", [cross.resultReference]),
        /immutable/,
      );
      await assert.rejects(
        () => pool.query("DELETE FROM treasury_transfers WHERE id=$1", [cross.resultReference]),
        /immutable/,
      );

      const out = cross.value.out.movement;
      await assert.rejects(
        () => pool.query(
          `INSERT INTO financial_movements
            (id,treasury_id,branch_id,direction,amount,source_type,source_id,posting_batch_id,counterparty_id,occurred_at,created_by)
           VALUES($1,$2,$3,'OUT',$4,'TREASURY_TRANSFER',$5,$6,NULL,$7,$8)`,
          [
            I.duplicateMovement,
            out.treasuryId,
            out.branchId,
            out.amount,
            out.sourceId,
            out.postingBatchId,
            out.occurredAt,
            I.admin,
          ],
        ),
        (error) => error?.code === "23505",
      );

      const forbidden = await pool.query(`SELECT
        (SELECT count(*)::int FROM financial_allocations) allocations,
        (SELECT count(*)::int FROM customer_ledger_entries) customer_ledger,
        (SELECT count(*)::int FROM supplier_ledger_entries) supplier_ledger,
        (SELECT count(*)::int FROM receipts) receipts,
        (SELECT count(*)::int FROM disbursements) disbursements,
        (SELECT count(*)::int FROM cheques) cheques,
        (SELECT count(*)::int FROM installments) installments,
        (SELECT count(*)::int FROM customer_advances) advances,
        (SELECT count(*)::int FROM journal_entries) journals`);
      assert.deepEqual(forbidden.rows[0], {
        allocations: 0,
        customer_ledger: 0,
        supplier_ledger: 0,
        receipts: 0,
        disbursements: 0,
        cheques: 0,
        installments: 0,
        advances: 0,
        journals: 0,
      });

      const crossFk = await pool.query(
        "SELECT conname FROM pg_constraint WHERE conrelid='public.treasury_transfers'::regclass AND conname IN ('fk_treasury_transfers__to_treasury','fk_treasury_transfers__to_treasury_branch') ORDER BY conname",
      );
      assert.deepEqual(crossFk.rows.map((r) => r.conname), ["fk_treasury_transfers__to_treasury"]);

      const verify = await runMigrations({ databaseUrl, verifyOnly: true });
      assert.deepEqual(verify.applied, []);
      assert.deepEqual(verify.skipped, MIGRATIONS);
    } finally {
      await pool.end().catch(() => {});
      await cleanupDatabase(databaseUrl).catch(() => {});
    }
  },
);
