import assert from "node:assert/strict";
import test from "node:test";
import pg from "pg";

import { runMigrations } from "../../scripts/database/migrations.mjs";
import { cleanupDatabase, MIGRATIONS } from "./postgresql-schema-test-support.mjs";

const { Client } = pg;
const databaseUrl = process.env.ERP_TEST_DATABASE_URL;
const FINANCE_TABLES = [
  "treasuries","receipts","disbursements","finance_categories","treasury_transfers",
  "financial_movements","treasury_balance_positions","financial_allocations","customer_advances",
  "advance_applications","cheques","installment_plans","installments",
];

async function withClient(fn) {
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try { return await fn(client); } finally { await client.end(); }
}

async function expectConstraint(promise, code, constraint) {
  await assert.rejects(promise, (error) => error?.code === code && error?.constraint === constraint);
}

async function seedFixture(client) {
  const ids = {
    company: "60000000-0000-4000-8000-000000000001",
    branch1: "60000000-0000-4000-8000-000000000002",
    branch2: "60000000-0000-4000-8000-000000000003",
    warehouse1: "60000000-0000-4000-8000-000000000004",
    warehouse2: "60000000-0000-4000-8000-000000000005",
    role: "60000000-0000-4000-8000-000000000006",
    user: "60000000-0000-4000-8000-000000000007",
    counterparty: "60000000-0000-4000-8000-000000000008",
    priceList: "60000000-0000-4000-8000-000000000009",
    treasury1: "60000000-0000-4000-8000-000000000010",
    treasury2: "60000000-0000-4000-8000-000000000011",
    treasuryRemote: "60000000-0000-4000-8000-000000000012",
    category: "60000000-0000-4000-8000-000000000013",
    glAccountPlaceholder: "60000000-0000-4000-8000-000000000014",
    salesOrder: "60000000-0000-4000-8000-000000000015",
    salesInvoice: "60000000-0000-4000-8000-000000000016",
    postingBatch1: "60000000-0000-4000-8000-000000000017",
    postingBatch2: "60000000-0000-4000-8000-000000000018",
    source1: "60000000-0000-4000-8000-000000000019",
    source2: "60000000-0000-4000-8000-000000000020",
    receipt: "60000000-0000-4000-8000-000000000021",
    movement1: "60000000-0000-4000-8000-000000000022",
    movementRemote: "60000000-0000-4000-8000-000000000023",
    advance: "60000000-0000-4000-8000-000000000024",
    plan: "60000000-0000-4000-8000-000000000025",
  };

  await client.query(`INSERT INTO companies
    (id,name,base_currency_code,default_language,timezone,is_active,created_at,updated_at)
    VALUES ($1,'Finance Test Co','EGP','ar-EG','Africa/Cairo',true,now(),now())`, [ids.company]);
  await client.query(`INSERT INTO branches
    (id,company_id,name,code,is_active,created_at,updated_at)
    VALUES ($1,$3,'Main','MAIN',true,now(),now()),($2,$3,'Remote','REMOTE',true,now(),now())`,
    [ids.branch1, ids.branch2, ids.company]);
  await client.query(`INSERT INTO warehouses
    (id,branch_id,name,code,is_active,created_at,updated_at)
    VALUES ($1,$3,'Main WH','MAIN-WH',true,now(),now()),($2,$4,'Remote WH','REMOTE-WH',true,now(),now())`,
    [ids.warehouse1, ids.warehouse2, ids.branch1, ids.branch2]);
  await client.query(`INSERT INTO roles (id,role_key,display_name_key,is_system)
    VALUES ($1,'FINANCE_TEST','roles.financeTest',true)`, [ids.role]);
  await client.query(`INSERT INTO users
    (id,name,username,email,password_hash,role_id,default_branch_id,branch_scope_mode,preferred_language,is_active,created_at,updated_at)
    VALUES ($1,'Finance User','finance-test',NULL,'hash',$2,$3,'ALL','ar-EG',true,now(),now())`,
    [ids.user, ids.role, ids.branch1]);
  await client.query(`INSERT INTO counterparties
    (id,name,phone,normalized_phone,address,notes,is_active,created_at,updated_at)
    VALUES ($1,'Finance Counterparty',NULL,NULL,NULL,NULL,true,now(),now())`, [ids.counterparty]);
  await client.query(`INSERT INTO counterparty_roles (counterparty_id,role) VALUES ($1,'CUSTOMER')`, [ids.counterparty]);
  await client.query(`INSERT INTO price_lists (id,name,is_active,created_at,updated_at)
    VALUES ($1,'Finance Retail',true,now(),now())`, [ids.priceList]);

  await client.query(`INSERT INTO treasuries (id,branch_id,name,is_active,notes,created_at)
    VALUES ($1,$4,'Cash',true,NULL,now()),($2,$4,'Bank',true,NULL,now()),($3,$5,'Remote Cash',true,NULL,now())`,
    [ids.treasury1, ids.treasury2, ids.treasuryRemote, ids.branch1, ids.branch2]);
  await client.query(`INSERT INTO finance_categories (id,name,category_type,gl_account_id,is_active)
    VALUES ($1,'Service Income','INCOME',$2,true)`, [ids.category, ids.glAccountPlaceholder]);

  await client.query(`INSERT INTO sales_orders
    (id,branch_id,document_number,counterparty_id,warehouse_id,price_list_id,status,delivery_method,sales_user_id,customer_service_user_id,customer_notes,internal_notes,source_quote_id,version,created_at,updated_at)
    VALUES ($1,$2,1,$3,$4,$5,'PENDING','PICKUP',$6,$6,NULL,NULL,NULL,0,now(),now())`,
    [ids.salesOrder, ids.branch1, ids.counterparty, ids.warehouse1, ids.priceList, ids.user]);
  await client.query(`INSERT INTO sales_invoices
    (id,branch_id,document_number,document_date,document_version,counterparty_id,warehouse_id,price_list_id,
     source_sales_order_id,source_delivery_id,subtotal,discount_total,tax_total,grand_total,paid_total,due_total,
     payment_status,seller_user_id,customer_notes,internal_notes,posted_at,created_by,updated_at,deleted_at,deleted_by,delete_reason)
    VALUES ($1,$2,1,CURRENT_DATE,1,$3,$4,$5,NULL,NULL,100,0,0,100,100,0,'PAID',$6,NULL,NULL,now(),$6,now(),NULL,NULL,NULL)`,
    [ids.salesInvoice, ids.branch1, ids.counterparty, ids.warehouse1, ids.priceList, ids.user]);

  await client.query(`INSERT INTO posting_batches
    (id,branch_id,source_type,source_id,operation_type,document_version,reverses_posting_batch_id,posted_at,created_by)
    VALUES ($1,$3,'FINANCE_TEST',$4,'POST',1,NULL,now(),$5),($2,$6,'FINANCE_TEST',$7,'POST',1,NULL,now(),$5)`,
    [ids.postingBatch1, ids.postingBatch2, ids.branch1, ids.source1, ids.user, ids.branch2, ids.source2]);

  await client.query(`INSERT INTO receipts
    (id,branch_id,document_number,treasury_id,counterparty_id,amount,category_id,reference,notes,occurred_at,posted_at,created_by)
    VALUES ($1,$2,1,$3,$4,500.0000,$5,'ADV-TEST',NULL,now(),now(),$6)`,
    [ids.receipt, ids.branch1, ids.treasury1, ids.counterparty, ids.category, ids.user]);

  await client.query(`INSERT INTO financial_movements
    (id,treasury_id,branch_id,direction,amount,source_type,source_id,posting_batch_id,counterparty_id,occurred_at,created_by)
    VALUES ($1,$2,$3,'IN',500.0000,'RECEIPT',$4,$5,$6,now(),$7),
           ($8,$9,$10,'IN',100.0000,'RECEIPT',$11,$12,NULL,now(),$7)`,
    [ids.movement1, ids.treasury1, ids.branch1, ids.receipt, ids.postingBatch1, ids.counterparty, ids.user,
      ids.movementRemote, ids.treasuryRemote, ids.branch2, ids.source2, ids.postingBatch2]);

  await client.query(`INSERT INTO customer_advances
    (id,counterparty_id,sales_order_id,receipt_id,original_amount,remaining_amount_projection,created_at)
    VALUES ($1,$2,$3,$4,500.0000,500.0000,now())`,
    [ids.advance, ids.counterparty, ids.salesOrder, ids.receipt]);

  await client.query(`INSERT INTO installment_plans (id,counterparty_id,source_type,source_id,total_amount,created_at)
    VALUES ($1,$2,'SALES_INVOICE',$3,500.0000,now())`, [ids.plan, ids.counterparty, ids.salesInvoice]);

  return ids;
}

test("03.06 Finance / Settlement constraints enforce canonical integrity on PostgreSQL 17", async (t) => {
  if (!databaseUrl) return t.skip("ERP_TEST_DATABASE_URL is not configured");
  await cleanupDatabase(databaseUrl);
  try {
    const first = await runMigrations({ databaseUrl });
    assert.deepEqual(first.applied, MIGRATIONS);
    assert.deepEqual(first.skipped, []);

    await withClient(async (client) => {
      const expectedConstraints = [
        "pk_treasuries","uq_treasuries__id_branch","pk_receipts","uq_receipts__branch_document",
        "pk_disbursements","uq_disbursements__branch_document","pk_finance_categories",
        "pk_treasury_transfers","uq_treasury_transfers__branch_document","pk_financial_movements",
        "pk_treasury_balance_positions","pk_financial_allocations","uq_financial_allocations__source_target",
        "pk_customer_advances","uq_customer_advances__receipt","pk_advance_applications","pk_cheques",
        "pk_installment_plans","pk_installments","fk_receipts__treasury_branch",
        "fk_disbursements__treasury_branch","fk_treasury_transfers__from_treasury_branch",
        "fk_treasury_transfers__to_treasury_branch","fk_financial_movements__treasury_branch",
        "fk_cheques__settlement_movement_branch","ck_financial_movements__direction",
        "ck_finance_categories__category_type","ck_cheques__direction","ck_cheques__status",
        "ck_installments__status","ck_customer_advances__remaining_projection_range",
      ];
      const constraints = await client.query(`SELECT conname,contype FROM pg_catalog.pg_constraint
        WHERE conname = ANY($1::text[]) ORDER BY conname`, [expectedConstraints]);
      assert.equal(constraints.rowCount, expectedConstraints.length);

      const forbiddenAccountingFk = await client.query(`SELECT count(*)::int AS count FROM pg_catalog.pg_constraint
        WHERE conname='fk_finance_categories__gl_account'`);
      assert.equal(forbiddenAccountingFk.rows[0].count, 0, "Accounting target FK must remain deferred to the Accounting constraint slice");

      const independentIndexes = await client.query(`
        SELECT idx.relname AS index_name
        FROM pg_catalog.pg_index i
        JOIN pg_catalog.pg_class tbl ON tbl.oid=i.indrelid
        JOIN pg_catalog.pg_namespace n ON n.oid=tbl.relnamespace
        JOIN pg_catalog.pg_class idx ON idx.oid=i.indexrelid
        LEFT JOIN pg_catalog.pg_constraint con ON con.conindid=i.indexrelid
        WHERE n.nspname='public' AND tbl.relname=ANY($1::text[]) AND con.oid IS NULL
        ORDER BY idx.relname`, [FINANCE_TABLES]);
      assert.deepEqual(independentIndexes.rows, [], "03.07 independent/partial/expression Finance indexes must remain deferred");

      const ids = await seedFixture(client);

      await expectConstraint(client.query(`INSERT INTO receipts
        (id,branch_id,document_number,treasury_id,counterparty_id,amount,category_id,reference,notes,occurred_at,posted_at,created_by)
        VALUES ('60000000-0000-4000-8000-000000000030',$1,1,$2,NULL,1,NULL,NULL,NULL,now(),now(),$3)`,
        [ids.branch1, ids.treasury1, ids.user]), "23505", "uq_receipts__branch_document");
      await expectConstraint(client.query(`INSERT INTO receipts
        (id,branch_id,document_number,treasury_id,counterparty_id,amount,category_id,reference,notes,occurred_at,posted_at,created_by)
        VALUES ('60000000-0000-4000-8000-000000000031',$1,2,$2,NULL,1,NULL,NULL,NULL,now(),now(),$3)`,
        [ids.branch1, ids.treasuryRemote, ids.user]), "23503", "fk_receipts__treasury_branch");
      await expectConstraint(client.query(`INSERT INTO disbursements
        (id,branch_id,document_number,treasury_id,counterparty_id,amount,category_id,reference,notes,occurred_at,posted_at,created_by)
        VALUES ('60000000-0000-4000-8000-000000000032',$1,1,$2,NULL,0,NULL,NULL,NULL,now(),now(),$3)`,
        [ids.branch1, ids.treasury1, ids.user]), "23514", "ck_disbursements__amount_positive");
      await expectConstraint(client.query(`INSERT INTO finance_categories
        (id,name,category_type,gl_account_id,is_active)
        VALUES ('60000000-0000-4000-8000-000000000033','Bad','OTHER','60000000-0000-4000-8000-000000000099',true)`),
        "23514", "ck_finance_categories__category_type");

      await expectConstraint(client.query(`INSERT INTO treasury_transfers
        (id,issuing_branch_id,document_number,from_treasury_id,to_treasury_id,amount,reference,notes,occurred_at,posted_at,created_by)
        VALUES ('60000000-0000-4000-8000-000000000034',$1,1,$2,$2,10,NULL,NULL,now(),now(),$3)`,
        [ids.branch1, ids.treasury1, ids.user]), "23514", "ck_treasury_transfers__different_treasuries");
      await expectConstraint(client.query(`INSERT INTO treasury_transfers
        (id,issuing_branch_id,document_number,from_treasury_id,to_treasury_id,amount,reference,notes,occurred_at,posted_at,created_by)
        VALUES ('60000000-0000-4000-8000-000000000035',$1,2,$2,$3,10,NULL,NULL,now(),now(),$4)`,
        [ids.branch1, ids.treasury1, ids.treasuryRemote, ids.user]), "23503", "fk_treasury_transfers__to_treasury_branch");
      await client.query(`INSERT INTO treasury_transfers
        (id,issuing_branch_id,document_number,from_treasury_id,to_treasury_id,amount,reference,notes,occurred_at,posted_at,created_by)
        VALUES ('60000000-0000-4000-8000-000000000036',$1,3,$2,$3,10,NULL,NULL,now(),now(),$4)`,
        [ids.branch1, ids.treasury1, ids.treasury2, ids.user]);
      await expectConstraint(client.query(`INSERT INTO treasury_transfers
        (id,issuing_branch_id,document_number,from_treasury_id,to_treasury_id,amount,reference,notes,occurred_at,posted_at,created_by)
        VALUES ('60000000-0000-4000-8000-000000000037',$1,3,$2,$3,20,NULL,NULL,now(),now(),$4)`,
        [ids.branch1, ids.treasury2, ids.treasury1, ids.user]), "23505", "uq_treasury_transfers__branch_document");

      await expectConstraint(client.query(`INSERT INTO financial_movements
        (id,treasury_id,branch_id,direction,amount,source_type,source_id,posting_batch_id,counterparty_id,occurred_at,created_by)
        VALUES ('60000000-0000-4000-8000-000000000038',$1,$2,'SIDEWAYS',1,'TEST',$3,$4,NULL,now(),$5)`,
        [ids.treasury1, ids.branch1, ids.source1, ids.postingBatch1, ids.user]), "23514", "ck_financial_movements__direction");
      await expectConstraint(client.query(`INSERT INTO financial_movements
        (id,treasury_id,branch_id,direction,amount,source_type,source_id,posting_batch_id,counterparty_id,occurred_at,created_by)
        VALUES ('60000000-0000-4000-8000-000000000039',$1,$2,'IN',1,'TEST',$3,$4,NULL,now(),$5)`,
        [ids.treasuryRemote, ids.branch1, ids.source1, ids.postingBatch1, ids.user]), "23503", "fk_financial_movements__treasury_branch");

      await client.query(`INSERT INTO treasury_balance_positions (treasury_id,current_balance,version,updated_at)
        VALUES ($1,-25.0000,0,now())`, [ids.treasury1]);
      const signedBalance = await client.query(`SELECT current_balance::text FROM treasury_balance_positions WHERE treasury_id=$1`, [ids.treasury1]);
      assert.equal(signedBalance.rows[0].current_balance, "-25.0000", "negative Treasury balance policy must not be encoded as a universal CHECK");
      await expectConstraint(client.query(`UPDATE treasury_balance_positions SET version=-1 WHERE treasury_id=$1`, [ids.treasury1]),
        "23514", "ck_treasury_balance_positions__version_nonnegative");

      const sourceId = "60000000-0000-4000-8000-000000000040";
      const targetId = "60000000-0000-4000-8000-000000000041";
      await client.query(`INSERT INTO financial_allocations
        (id,financial_source_type,financial_source_id,target_type,target_id,amount,created_at)
        VALUES ('60000000-0000-4000-8000-000000000042','RECEIPT',$1,'SALES_INVOICE',$2,50,now())`, [sourceId, targetId]);
      await expectConstraint(client.query(`INSERT INTO financial_allocations
        (id,financial_source_type,financial_source_id,target_type,target_id,amount,created_at)
        VALUES ('60000000-0000-4000-8000-000000000043','RECEIPT',$1,'SALES_INVOICE',$2,20,now())`, [sourceId, targetId]),
        "23505", "uq_financial_allocations__source_target");
      await expectConstraint(client.query(`INSERT INTO financial_allocations
        (id,financial_source_type,financial_source_id,target_type,target_id,amount,created_at)
        VALUES ('60000000-0000-4000-8000-000000000044','RECEIPT','60000000-0000-4000-8000-000000000098','INSTALLMENT','60000000-0000-4000-8000-000000000097',0,now())`),
        "23514", "ck_financial_allocations__amount_positive");
      await client.query(`INSERT INTO financial_allocations
        (id,financial_source_type,financial_source_id,target_type,target_id,amount,created_at)
        VALUES ('60000000-0000-4000-8000-000000000045','CUSTOM_SOURCE','60000000-0000-4000-8000-000000000096','CUSTOM_TARGET','60000000-0000-4000-8000-000000000095',1,now())`);

      await expectConstraint(client.query(`INSERT INTO customer_advances
        (id,counterparty_id,sales_order_id,receipt_id,original_amount,remaining_amount_projection,created_at)
        VALUES ('60000000-0000-4000-8000-000000000046',$1,$2,$3,500,500,now())`,
        [ids.counterparty, ids.salesOrder, ids.receipt]), "23505", "uq_customer_advances__receipt");
      await expectConstraint(client.query(`UPDATE customer_advances SET remaining_amount_projection=501 WHERE id=$1`, [ids.advance]),
        "23514", "ck_customer_advances__remaining_projection_range");

      await client.query(`INSERT INTO advance_applications (id,advance_id,sales_invoice_id,amount,applied_at)
        VALUES ('60000000-0000-4000-8000-000000000047',$1,$2,100,now()),
               ('60000000-0000-4000-8000-000000000048',$1,$2,50,now())`, [ids.advance, ids.salesInvoice]);
      await expectConstraint(client.query(`INSERT INTO advance_applications (id,advance_id,sales_invoice_id,amount,applied_at)
        VALUES ('60000000-0000-4000-8000-000000000049',$1,$2,0,now())`, [ids.advance, ids.salesInvoice]),
        "23514", "ck_advance_applications__amount_positive");

      await expectConstraint(client.query(`INSERT INTO cheques
        (id,branch_id,counterparty_id,direction,cheque_number,bank_name,amount,due_date,status,source_type,source_id,settlement_financial_movement_id,notes,created_at)
        VALUES ('60000000-0000-4000-8000-000000000050',$1,$2,'OTHER','CHK-X','Bank',100,CURRENT_DATE,'PENDING','TEST',$3,NULL,NULL,now())`,
        [ids.branch1, ids.counterparty, ids.source1]), "23514", "ck_cheques__direction");
      await expectConstraint(client.query(`INSERT INTO cheques
        (id,branch_id,counterparty_id,direction,cheque_number,bank_name,amount,due_date,status,source_type,source_id,settlement_financial_movement_id,notes,created_at)
        VALUES ('60000000-0000-4000-8000-000000000051',$1,$2,'RECEIVABLE','CHK-Y','Bank',100,CURRENT_DATE,'UNKNOWN','TEST',$3,NULL,NULL,now())`,
        [ids.branch1, ids.counterparty, ids.source1]), "23514", "ck_cheques__status");
      await expectConstraint(client.query(`INSERT INTO cheques
        (id,branch_id,counterparty_id,direction,cheque_number,bank_name,amount,due_date,status,source_type,source_id,settlement_financial_movement_id,notes,created_at)
        VALUES ('60000000-0000-4000-8000-000000000052',$1,$2,'RECEIVABLE','CHK-Z','Bank',100,CURRENT_DATE,'CLEARED','TEST',$3,$4,NULL,now())`,
        [ids.branch1, ids.counterparty, ids.source1, ids.movementRemote]), "23503", "fk_cheques__settlement_movement_branch");
      await client.query(`INSERT INTO cheques
        (id,branch_id,counterparty_id,direction,cheque_number,bank_name,amount,due_date,status,source_type,source_id,settlement_financial_movement_id,notes,created_at)
        VALUES ('60000000-0000-4000-8000-000000000053',$1,$2,'RECEIVABLE','CHK-P','Bank',100,CURRENT_DATE,'PENDING','TEST',$3,NULL,NULL,now())`,
        [ids.branch1, ids.counterparty, ids.source1]);

      const canonicalStatuses = ["UPCOMING","DUE","PARTIAL","PAID","OVERDUE"];
      for (let i = 0; i < canonicalStatuses.length; i += 1) {
        await client.query(`INSERT INTO installments (id,plan_id,due_date,amount,paid_amount_projection,status)
          VALUES ($1,$2,CURRENT_DATE + $3::int,100,$4,$5)`,
          [`60000000-0000-4000-8000-${String(60 + i).padStart(12,"0")}`, ids.plan, i,
            canonicalStatuses[i] === "PAID" ? 100 : canonicalStatuses[i] === "PARTIAL" ? 25 : 0,
            canonicalStatuses[i]]);
      }
      for (const invalidStatus of ["PENDING","PARTIALLY_PAID"]) {
        await expectConstraint(client.query(`INSERT INTO installments (id,plan_id,due_date,amount,paid_amount_projection,status)
          VALUES (gen_random_uuid(),$1,CURRENT_DATE,100,0,$2)`, [ids.plan, invalidStatus]), "23514", "ck_installments__status");
      }
      await expectConstraint(client.query(`INSERT INTO installments (id,plan_id,due_date,amount,paid_amount_projection,status)
        VALUES ('60000000-0000-4000-8000-000000000070',$1,CURRENT_DATE,100,101,'PAID')`, [ids.plan]),
        "23514", "ck_installments__paid_projection_range");

      await client.query(`INSERT INTO treasuries (id,branch_id,name,is_active,notes,created_at)
        VALUES ('60000000-0000-4000-8000-000000000071',$1,'cash',true,NULL,now())`, [ids.branch1]);

      const history = await client.query("SELECT version,name,checksum FROM schema_migrations ORDER BY version");
      assert.equal(history.rowCount, MIGRATIONS.length);
      const financeBase = history.rows.find((row) => row.version === "0008");
      assert.equal(financeBase?.name, "finance_settlement");
      const financeConstraints = history.rows.find((row) => row.version === "0018");
      assert.equal(financeConstraints?.name, "finance_settlement_constraints");
      assert.match(financeConstraints?.checksum ?? "", /^[0-9a-f]{64}$/);
      assert.equal(history.rows.at(-1)?.version, "0018");
    });

    const second = await runMigrations({ databaseUrl });
    assert.deepEqual(second.applied, []);
    assert.deepEqual(second.skipped, MIGRATIONS);
    const verification = await runMigrations({ databaseUrl, verifyOnly: true });
    assert.deepEqual(verification.applied, []);
    assert.deepEqual(verification.skipped, MIGRATIONS);
  } finally {
    await cleanupDatabase(databaseUrl);
  }
});
