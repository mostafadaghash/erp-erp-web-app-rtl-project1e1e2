import assert from "node:assert/strict";
import { mkdtemp, cp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import pg from "pg";

import { DEFAULT_MIGRATIONS_DIR, runMigrations } from "../../scripts/database/migrations.mjs";
import { cleanupDatabase, withClient } from "./postgresql-schema-test-support.mjs";

const { Client } = pg;
const databaseUrl = process.env.ERP_TEST_DATABASE_URL;
const id = (n) => "79000000-0000-4000-8000-" + String(n).padStart(12, "0");

async function expectError(action, code="23514", constraint) {
  await assert.rejects(action,
    (error) => error?.code === code && (!constraint || error.constraint === constraint),
    "Expected " + code + (constraint ? " / " + constraint : ""));
}
async function withTransaction(client, action) {
  await client.query("BEGIN");
  try { const result = await action(); await client.query("COMMIT"); return result; }
  catch (error) { await client.query("ROLLBACK").catch(() => {}); throw error; }
}
async function fixture(client) {
  const v = {
    company:id(1), otherCompany:id(2), branch:id(3), otherBranch:id(4),
    role:id(5), user:id(6), counterparty:id(7),
    asset:id(8), revenue:id(9), foreignAccount:id(10),
    parent:id(11), child:id(12), disabled:id(13),
    source:id(14),
  };
  await client.query(`INSERT INTO companies
    (id,name,base_currency_code,default_language,timezone,is_active,created_at,updated_at)
    VALUES ($1,'0035 Main','EGP','ar-EG','Africa/Cairo',true,now(),now()),
           ($2,'0035 Other','EGP','ar-EG','Africa/Cairo',true,now(),now())`,[v.company,v.otherCompany]);
  await client.query(`INSERT INTO branches
    (id,company_id,name,code,is_active,created_at,updated_at)
    VALUES ($1,$3,'0035 Branch','MAIN35',true,now(),now()),
           ($2,$4,'0035 Foreign','OTHER35',true,now(),now())`,
    [v.branch,v.otherBranch,v.company,v.otherCompany]);
  await client.query("INSERT INTO roles (id,role_key,display_name_key,is_system) VALUES ($1,'JOURNAL_0035','roles.journal0035',true)",[v.role]);
  await client.query(`INSERT INTO users
    (id,name,username,email,password_hash,role_id,default_branch_id,branch_scope_mode,
     preferred_language,is_active,created_at,updated_at)
    VALUES ($1,'Journal Test','journal0035',NULL,'hash',$2,$3,'ALL','ar-EG',true,now(),now())`,[v.user,v.role,v.branch]);
  await client.query(`INSERT INTO counterparties
    (id,name,phone,normalized_phone,address,notes,is_active,created_at,updated_at)
    VALUES ($1,'0035 Counterparty',NULL,NULL,NULL,NULL,true,now(),now())`,[v.counterparty]);
  await client.query(`INSERT INTO gl_accounts
    (id,company_id,code,name,account_type,parent_id,is_system,is_active)
    VALUES ($1,$6,'1000','Cash','ASSET',NULL,true,true),
           ($2,$6,'4000','Revenue','INCOME',NULL,true,true),
           ($3,$7,'9999','Foreign','ASSET',NULL,true,true),
           ($4,$6,'1100','Parent','ASSET',NULL,false,true),
           ($5,$6,'1101','Child','ASSET',$4,false,true)`,
    [v.asset,v.revenue,v.foreignAccount,v.parent,v.child,v.company,v.otherCompany]);
  await client.query(`INSERT INTO gl_accounts
    (id,company_id,code,name,account_type,parent_id,is_system,is_active)
    VALUES ($1,$2,'9000','Disabled','ASSET',NULL,false,false)`,[v.disabled,v.company]);
  return v;
}
async function batch(client,v,n,{operation="POST",reverses=null,
  source=v.source,branch=v.branch,author=v.user}={}) {
  const b=id(n);
  const result=await client.query(`INSERT INTO posting_batches
    (id,branch_id,source_type,source_id,operation_type,document_version,
     reverses_posting_batch_id,posted_at,created_by)
    VALUES ($1,$2,'JOURNAL_0035',$3,$4,1,$5,clock_timestamp(),$6)
    RETURNING posted_at`,[b,branch,source,operation,reverses,author]);
  return {id:b,postedAt:result.rows[0].posted_at};
}
async function header(client,v,n,b,{branch=v.branch,source=v.source,author=v.user,
    reversal=null,postedAt=null}={}){
  const e=id(n);
  await client.query(`INSERT INTO journal_entries
    (id,branch_id,source_type,source_id,posting_batch_id,reversal_of_entry_id,
     posted_at,created_by,description)
    VALUES ($1,$2,'JOURNAL_0035',$3,$4,$5,COALESCE($6::timestamptz,(SELECT posted_at FROM public.posting_batches WHERE id=$4)),$7,'0035 guard test')`,
    [e,branch,source,b.id,reversal,postedAt,author]);
  return e;
}
async function lines(client,entry,defs) {
  for(const x of defs) {
    await client.query(`INSERT INTO journal_lines
      (id,journal_entry_id,gl_account_id,debit,credit,counterparty_id)
      VALUES ($1,$2,$3,$4,$5,$6)`,
      [id(x.id),entry,x.account,x.debit,x.credit,x.counterparty??null]);
  }
}
const normal=(v,n=100)=>[
  {id:n,account:v.asset,debit:"10.0001",credit:"0.0000",counterparty:v.counterparty},
  {id:n+1,account:v.asset,debit:"10.0001",credit:"0.0000",counterparty:v.counterparty},
  {id:n+2,account:v.revenue,debit:"0.0000",credit:"20.0002"},
  {id:n+3,account:v.asset,debit:"0.0000",credit:"0.0000"},
];
const reversed=(v,n=200)=>[
  {id:n,account:v.asset,debit:"0.0000",credit:"10.0001",counterparty:v.counterparty},
  {id:n+1,account:v.asset,debit:"0.0000",credit:"10.0001",counterparty:v.counterparty},
  {id:n+2,account:v.revenue,debit:"20.0002",credit:"0.0000"},
  {id:n+3,account:v.asset,debit:"0.0000",credit:"0.0000"},
];
async function post(client,v,batchN,entryN,defs=normal(v)) {
  return withTransaction(client,async()=>{
    const b=await batch(client,v,batchN);
    const e=await header(client,v,entryN,b);
    await lines(client,e,defs);
    return {batch:b.id,entry:e,postedAt:b.postedAt};
  });
}
async function setup(t) {
  if (!databaseUrl) { t.skip("ERP_TEST_DATABASE_URL is absent"); return false; }
  await cleanupDatabase(databaseUrl);
  const migrations=await runMigrations({databaseUrl});
  assert.equal(migrations.applied.at(-1),"0035");
  return true;
}

test("0035 sealed Journal is immutable, precise, nonempty and app-role protected", async(t)=>{
  if(!await setup(t))return;
  try {
    await withClient(databaseUrl,async(client)=>{
      const v=await fixture(client);
      const posted=await post(client,v,20,21);
      const seal=await client.query("SELECT line_count,line_snapshot,sealed_at FROM journal_entry_seals WHERE entry_id=$1",[posted.entry]);
      assert.equal(seal.rowCount,1);
      assert.equal(seal.rows[0].line_count,4);
      assert.equal(seal.rows[0].line_snapshot[0][2],"10.0001");
      assert.ok(seal.rows[0].sealed_at);

      await expectError(lines(client,posted.entry,[{id:205,account:v.asset,debit:"0",credit:"0"}]),
        "23514","ct_journal_lines__sealed_entry");
      await expectError(client.query("UPDATE journal_lines SET debit=debit WHERE journal_entry_id=$1",[posted.entry]),
        "23514","ct_journal_history__immutable");
      await expectError(client.query("DELETE FROM journal_lines WHERE journal_entry_id=$1",[posted.entry]),
        "23514","ct_journal_history__immutable");
      await expectError(client.query("UPDATE journal_entries SET description=description WHERE id=$1",[posted.entry]),
        "23514","ct_journal_history__immutable");
      await expectError(client.query("DELETE FROM journal_entries WHERE id=$1",[posted.entry]),
        "23514","ct_journal_history__immutable");
      await expectError(client.query("UPDATE posting_batches SET document_version=2 WHERE id=$1",[posted.batch]),
        "23514","ct_posting_batches__journal_immutable");
      await expectError(client.query("DELETE FROM posting_batches WHERE id=$1",[posted.batch]),
        "23514","ct_posting_batches__journal_immutable");
      // TRUNCATE bypasses row-level UPDATE/DELETE triggers; the 0035 DDL
      // explicitly blocks it on every historical table.
      for(const table of ["journal_lines","journal_entries","posting_batches","journal_entry_seals"]) {
        await expectError(client.query("TRUNCATE public."+table),
          "23514","ct_journal_history__immutable");
      }
      await expectError(client.query("UPDATE journal_entry_seals SET line_count=4 WHERE entry_id=$1",[posted.entry]),
        "23514","ct_journal_entry_seals__write_protected");
      await expectError(client.query("DELETE FROM journal_entry_seals WHERE entry_id=$1",[posted.entry]),
        "23514","ct_journal_entry_seals__write_protected");

      // The migration owner is trusted; ordinary app roles cannot write seals,
      // including when a future accidental GRANT gives direct INSERT.
      await client.query("BEGIN");
      try {
        await client.query("CREATE ROLE erp_0035_seal_probe NOLOGIN");
        await client.query("GRANT USAGE ON SCHEMA public TO erp_0035_seal_probe");
        await client.query("SET LOCAL ROLE erp_0035_seal_probe");
        await client.query("SAVEPOINT limited");
        await expectError(client.query(`INSERT INTO journal_entry_seals
          (entry_id,line_count,line_snapshot) VALUES ($1,4,'[]'::jsonb)`,
          [posted.entry]),"42501");
        await client.query("ROLLBACK TO SAVEPOINT limited");
        await client.query("RESET ROLE");
        await client.query("GRANT INSERT ON journal_entry_seals TO erp_0035_seal_probe");
        await client.query("SET LOCAL ROLE erp_0035_seal_probe");
        await client.query("SAVEPOINT granted");
        await expectError(client.query(`INSERT INTO journal_entry_seals
          (entry_id,line_count,line_snapshot) VALUES ($1,4,'[]'::jsonb)`,
          [posted.entry]),"23514","ct_journal_entry_seals__write_protected");
        await client.query("ROLLBACK TO SAVEPOINT granted");
      } finally {await client.query("ROLLBACK");}

      const audit=await client.query(`SELECT
        (SELECT count(*)::int FROM pg_index WHERE indrelid='public.journal_entry_seals'::regclass) seal_indexes,
        (SELECT count(*)::int FROM pg_trigger WHERE tgname='ct_journal_entries__balanced_at_commit'
           AND tgdeferrable AND tginitdeferred) legacy_balance`);
      assert.deepEqual(audit.rows[0],{seal_indexes:1,legacy_balance:1});
    });
    const recheck=await runMigrations({databaseUrl,verifyOnly:true});
    assert.equal(recheck.skipped.at(-1),"0035");
  } finally {await cleanupDatabase(databaseUrl);}
});

test("0035 rejects inconsistent context, empty/unbalanced entries and illegal GL accounts",async(t)=>{
  if(!await setup(t))return;
  try {
    await withClient(databaseUrl,async(client)=>{
      const v=await fixture(client);
      let b=await batch(client,v,30);
      await client.query("BEGIN");
      await header(client,v,31,b);
      await expectError(client.query("COMMIT"),"23514","ct_journal_entries__nonempty");
      await client.query("ROLLBACK").catch(()=>{});
      assert.equal((await client.query("SELECT count(*)::int n FROM journal_entry_seals")).rows[0].n,0);

      b=await batch(client,v,32);
      await client.query("BEGIN");
      const e=await header(client,v,33,b);
      await lines(client,e,[{id:300,account:v.asset,debit:10,credit:0}]);
      await expectError(client.query("COMMIT"),"23514","ct_journal_entries__commit_balance");
      await client.query("ROLLBACK").catch(()=>{});

      b=await batch(client,v,34);
      await expectError(header(client,v,35,b,{source:id(999)}),"23514","ct_journal_entries__batch_context");
      await expectError(header(client,v,36,b,{branch:v.otherBranch}),"23514","ct_journal_entries__batch_context");
      await expectError(header(client,v,37,b,{author:id(999)}),"23514","ct_journal_entries__batch_context");
      await expectError(header(client,v,38,b,{postedAt:new Date(2000,0,1)}),"23514","ct_journal_entries__batch_context");

      await client.query("BEGIN");
      const e2=await header(client,v,39,b);
      await expectError(lines(client,e2,[{id:301,account:v.foreignAccount,debit:1,credit:0}]),
        "23514","ct_journal_lines__account_context");
      await client.query("ROLLBACK");
      await client.query("BEGIN");
      const e3=await header(client,v,40,b);
      await expectError(lines(client,e3,[{id:302,account:v.parent,debit:1,credit:0}]),
        "23514","ct_journal_lines__posting_leaf");
      await client.query("ROLLBACK");
      await client.query("BEGIN");
      const e4=await header(client,v,41,b);
      await expectError(lines(client,e4,[{id:303,account:v.disabled,debit:1,credit:0}]),
        "23514","ct_journal_lines__account_context");
      await client.query("ROLLBACK");

      // Early deferred-trigger evaluation must either seal the exact lines or
      // reject later additions. Savepoint rollback must not leak seal state.
      b=await batch(client,v,42);
      await client.query("BEGIN");
      const e5=await header(client,v,43,b);
      await lines(client,e5,normal(v,320).slice(0,3));
      await client.query("SET CONSTRAINTS ALL IMMEDIATE");
      await client.query("SAVEPOINT after_seal");
      await expectError(lines(client,e5,[{id:325,account:v.asset,debit:0,credit:0}]),
        "23514","ct_journal_lines__sealed_entry");
      await client.query("ROLLBACK TO SAVEPOINT after_seal");
      await client.query("COMMIT");
      assert.equal((await client.query("SELECT line_count FROM journal_entry_seals WHERE entry_id=$1",[e5])).rows[0].line_count,3);
    });
  } finally {await cleanupDatabase(databaseUrl);}
});

test("0035 exact reversal multiset rejects missing duplicates and prevents double reversal",async(t)=>{
  if(!await setup(t))return;
  try {
    await withClient(databaseUrl,async(client)=>{
      const v=await fixture(client);
      const original=await post(client,v,50,51);

      await client.query("BEGIN");
      let b=await batch(client,v,52,{operation:"REVERSAL",reverses:original.batch});
      let e=await header(client,v,53,b,{reversal:original.entry});
      await lines(client,e,[
        {id:410,account:v.asset,debit:0,credit:"20.0002",counterparty:v.counterparty},
        {id:411,account:v.revenue,debit:"20.0002",credit:0},
        {id:412,account:v.asset,debit:0,credit:0},
      ]);
      await expectError(client.query("COMMIT"),"23514","ct_journal_entries__reversal_exact");
      await client.query("ROLLBACK").catch(()=>{});

      b=await batch(client,v,54,{operation:"POST"});
      await expectError(header(client,v,55,b,{reversal:original.entry}),
        "23514","ct_journal_entries__reversal_context");

      b=await batch(client,v,56,{operation:"REVERSAL",reverses:id(999)});
      await expectError(header(client,v,57,b,{reversal:original.entry}),
        "23514","ct_journal_entries__reversal_context");

      const corrected=await withTransaction(client,async()=>{
        const rb=await batch(client,v,58,{operation:"REVERSAL",reverses:original.batch});
        const re=await header(client,v,59,rb,{reversal:original.entry});
        await lines(client,re,reversed(v,420));
        return re;
      });
      assert.equal((await client.query("SELECT count(*)::int n FROM journal_entry_seals WHERE entry_id=$1",[corrected])).rows[0].n,1);
      const duplicateBatch=await batch(client,v,60,{operation:"DELETE_REVERSAL",reverses:original.batch});
      await expectError(header(client,v,61,duplicateBatch,{reversal:original.entry}),
        "23514","ct_journal_entries__already_reversed");
    });
  } finally {await cleanupDatabase(databaseUrl);}
});

test("0035 READ COMMITTED locks serialize competing reversals and stale line appenders",async(t)=>{
  if(!await setup(t))return;
  const a=new Client({connectionString:databaseUrl});
  const b=new Client({connectionString:databaseUrl});
  try {
    await a.connect();await b.connect();
    const v=await fixture(a);
    const original=await post(a,v,70,71);
    await a.query("BEGIN");
    const ba=await batch(a,v,72,{operation:"REVERSAL",reverses:original.batch});
    const rev=await header(a,v,73,ba,{reversal:original.entry});
    await lines(a,rev,reversed(v,500));
    await b.query("BEGIN");
    await b.query("SET LOCAL lock_timeout='5s'");
    const bb=await batch(b,v,74,{operation:"REVERSAL",reverses:original.batch});
    const second=header(b,v,75,bb,{reversal:original.entry});
    await new Promise(resolve=>setTimeout(resolve,80));
    await a.query("COMMIT");
    await expectError(second,"23514","ct_journal_entries__already_reversed");
    await b.query("ROLLBACK");

    await a.query("BEGIN");
    await a.query("SELECT id FROM journal_entries WHERE id=$1 FOR UPDATE",[original.entry]);
    await b.query("BEGIN");
    await b.query("SET LOCAL lock_timeout='5s'");
    const append=lines(b,original.entry,[{id:530,account:v.asset,debit:0,credit:0}]);
    await new Promise(resolve=>setTimeout(resolve,80));
    await a.query("COMMIT");
    await expectError(append,"23514","ct_journal_lines__sealed_entry");
    await b.query("ROLLBACK");
    assert.equal((await a.query("SELECT line_count FROM journal_entry_seals WHERE entry_id=$1",[original.entry])).rows[0].line_count,4);
  } finally {
    await a.query("ROLLBACK").catch(()=>{});
    await b.query("ROLLBACK").catch(()=>{});
    await a.end().catch(()=>{});await b.end().catch(()=>{});
    await cleanupDatabase(databaseUrl);
  }
});

test("0035 refuses old unsealed Journals atomically; it never backfills history",async(t)=>{
  if(!databaseUrl)return t.skip("ERP_TEST_DATABASE_URL absent");
  await cleanupDatabase(databaseUrl);
  const tmp=await mkdtemp(join(tmpdir(),"erp-pre-0035-"));
  try {
    const all=await readdir(DEFAULT_MIGRATIONS_DIR);
    for(const file of all.filter(x=>/^003[0-4]_/.test(x)||/^00[0-2][0-9]_/.test(x))) {
      await cp(join(DEFAULT_MIGRATIONS_DIR,file),join(tmp,file));
    }
    const baseline=await runMigrations({databaseUrl,migrationsDir:tmp});
    assert.equal(baseline.applied.at(-1),"0034");
    await withClient(databaseUrl,async(client)=>{
      const v=await fixture(client);
      const b=await batch(client,v,80);
      const e=id(81);
      await client.query(`INSERT INTO journal_entries
        (id,branch_id,source_type,source_id,posting_batch_id,reversal_of_entry_id,
         posted_at,created_by,description)
        VALUES ($1,$2,'JOURNAL_0035',$3,$4,NULL,$5,$6,'pre-0035')`,
        [e,v.branch,v.source,b.id,b.postedAt,v.user]);
      await lines(client,e,normal(v,600));
    });
    await assert.rejects(runMigrations({databaseUrl}),
      /0035_journal_context_immutability_reversal_integrity precondition failed/);
    await withClient(databaseUrl,async(client)=>{
      const row=await client.query(`SELECT
         to_regclass('public.journal_entry_seals') AS seal,
         (SELECT version FROM schema_migrations ORDER BY version DESC LIMIT 1) AS latest`);
      assert.equal(row.rows[0].seal,null);
      assert.equal(row.rows[0].latest,"0034");
    });
  } finally {
    await cleanupDatabase(databaseUrl);
    await rm(tmp,{recursive:true,force:true});
  }
});