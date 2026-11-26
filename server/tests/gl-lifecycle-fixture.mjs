import assert from 'node:assert/strict'

const id=n=>'98080000-0000-4000-8000-'+String(n).padStart(12,'0')
export const v={
  company:id(1),branch:id(2),role:id(3),user:id(4),source:id(5),
  debit:id(6),credit:id(7),mapped:id(8),parent:id(9),
  categoryAccount:id(10),category:id(11),child:id(12),
  batch:id(13),entry:id(14),line1:id(15),line2:id(16),
}

export async function fixture(c) {
  await c.query("INSERT INTO companies (id,name,base_currency_code,default_language,timezone,is_active,created_at,updated_at) VALUES ($1,'09-C Company','EGP','ar-EG','Africa/Cairo',true,now(),now())",[v.company])
  await c.query("INSERT INTO branches (id,company_id,name,code,is_active,created_at,updated_at) VALUES ($1,$2,'09-C Branch','G09C',true,now(),now())",[v.branch,v.company])
  await c.query("INSERT INTO roles (id,role_key,display_name_key,is_system) VALUES ($1,'GL_C_PREFLIGHT','roles.glCPreflight',true)",[v.role])
  await c.query("INSERT INTO users (id,name,username,email,password_hash,role_id,default_branch_id,branch_scope_mode,preferred_language,is_active,created_at,updated_at) VALUES ($1,'GL Safety Probe','gl-c-preflight',NULL,'hash',$2,$3,'ALL','ar-EG',true,now(),now())",[v.user,v.role,v.branch])
  await c.query("INSERT INTO gl_accounts (id,company_id,code,name,account_type,parent_id,is_system,is_active) VALUES ($1,$6,'1000','Posted debit','ASSET',NULL,false,true),($2,$6,'4000','Posted credit','INCOME',NULL,false,true),($3,$6,'1100','Mapped GL','ASSET',NULL,false,true),($4,$6,'1200','Inactive parent','ASSET',NULL,false,false),($5,$6,'1300','Finance category GL','ASSET',NULL,false,true)",[v.debit,v.credit,v.mapped,v.parent,v.categoryAccount,v.company])
  await c.query("INSERT INTO system_account_mappings (company_id,scope_type,scope_id,role_key,gl_account_id,updated_by,updated_at) VALUES ($1,'COMPANY',$1,'CUSTOMER_RECEIVABLE_CONTROL',$2,$3,now())",[v.company,v.mapped,v.user])
  await c.query("INSERT INTO finance_categories (id,name,category_type,gl_account_id,is_active) VALUES ($1,'09-C Category','INCOME',$2,true)",[v.category,v.categoryAccount])
  await c.query('BEGIN ISOLATION LEVEL READ COMMITTED')
  try {
    await c.query("INSERT INTO posting_batches (id,branch_id,source_type,source_id,operation_type,document_version,reverses_posting_batch_id,posted_at,created_by) VALUES ($1,$2,'GL_C_PREFLIGHT',$3,'POST',1,NULL,clock_timestamp(),$4)",[v.batch,v.branch,v.source,v.user])
    await c.query("INSERT INTO journal_entries (id,branch_id,source_type,source_id,posting_batch_id,reversal_of_entry_id,posted_at,created_by,description) SELECT $1,branch_id,source_type,source_id,id,NULL,posted_at,created_by,'09.08-C preflight' FROM posting_batches WHERE id=$2",[v.entry,v.batch])
    await c.query("INSERT INTO journal_lines (id,journal_entry_id,gl_account_id,debit,credit,counterparty_id) VALUES ($1,$3,$4,10.0000,0.0000,NULL),($2,$3,$5,0.0000,10.0000,NULL)",[v.line1,v.line2,v.entry,v.debit,v.credit])
    await c.query('COMMIT')
  } catch(e) { await c.query('ROLLBACK').catch(()=>{});throw e }
  const seal=await c.query('SELECT line_count FROM journal_entry_seals WHERE entry_id=$1',[v.entry])
  assert.equal(seal.rows[0]?.line_count,2,'real sealed balanced historical Journal required')
}

