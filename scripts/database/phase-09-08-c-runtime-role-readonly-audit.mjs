/**
 * ADR-0030 / Phase 09.08-C: PostgreSQL 17 metadata-only runtime role audit.
 * The caller must connect using the ACTUAL authorized nonproduction-equivalent
 * ERP_DATABASE_URL. CI postgres SUPERUSER is not deployment-equivalent proof.
 * Never prints credentials and never reads customer/ledger records.
 */
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Client } from 'pg'

const TABLES = [
  'companies', 'branches', 'users', 'gl_accounts', 'finance_categories',
  'system_account_mappings', 'journal_entries', 'journal_lines',
  'journal_entry_seals', 'posting_batches', 'schema_migrations',
]
const COLUMNS = [
  ['gl_accounts', 'id'], ['gl_accounts', 'company_id'],
  ['gl_accounts', 'code'], ['gl_accounts', 'name'],
  ['gl_accounts', 'account_type'], ['gl_accounts', 'parent_id'],
  ['gl_accounts', 'is_system'], ['gl_accounts', 'is_active'],
  ['finance_categories', 'gl_account_id'], ['finance_categories', 'is_active'],
  ['system_account_mappings', 'gl_account_id'],
]
const FUNCTIONS = [
  'fn_gl_account_hierarchy_guard', 'fn_gl_system_account_mapping_validate',
  'fn_journal_line_insert_guard', 'fn_journal_entry_insert_guard',
  'fn_journal_seal_write_guard', 'fn_journal_entry_seal_at_commit',
  'fn_journal_history_immutable', 'fn_journal_batch_immutable',
]
const TRIGGER_TABLES = [
  'gl_accounts', 'finance_categories', 'system_account_mappings',
  'journal_entries', 'journal_lines', 'journal_entry_seals',
]

const SQL = Object.freeze({
  identity: [
    'SELECT current_database() AS database_name, current_user::text AS current_user,',
    'session_user::text AS session_user,',
    "current_setting('server_version_num')::int AS server_version_num,",
    "current_setting('transaction_read_only')::boolean AS transaction_read_only",
  ].join(' '),
  role: [
    'SELECT rolname, rolsuper, rolinherit, rolcreaterole, rolcreatedb,',
    'rolcanlogin, rolreplication, rolbypassrls',
    'FROM pg_catalog.pg_roles WHERE rolname=current_user',
  ].join(' '),
  sessionRole: [
    'SELECT rolname, rolsuper, rolinherit, rolcreaterole, rolcreatedb,',
    'rolcanlogin, rolreplication, rolbypassrls',
    'FROM pg_catalog.pg_roles WHERE rolname=session_user',
  ].join(' '),
  reachableRoles: [
    'SELECT r.rolname,r.rolsuper,r.rolcreaterole,r.rolcreatedb,',
    'r.rolreplication,r.rolbypassrls,r.rolcanlogin,',
    "pg_catalog.pg_has_role(session_user,r.oid,'MEMBER') AS session_member,",
    "pg_catalog.pg_has_role(session_user,r.oid,'USAGE') AS session_inherits,",
    "pg_catalog.pg_has_role(session_user,r.oid,'SET') AS session_can_set,",
    "pg_catalog.pg_has_role(session_user,r.oid,'MEMBER WITH ADMIN OPTION') AS session_can_admin",
    'FROM pg_catalog.pg_roles r',
    'WHERE r.rolname IN (session_user,current_user)',
    "OR pg_catalog.pg_has_role(session_user,r.oid,'MEMBER')",
    "OR pg_catalog.pg_has_role(session_user,r.oid,'SET')",
    'ORDER BY r.rolname',
  ].join(' '),
  membershipEdges: [
    'WITH RECURSIVE reachable(oid,path) AS (',
    'SELECT r.oid,ARRAY[r.oid] FROM pg_catalog.pg_roles r WHERE r.rolname=session_user',
    'UNION ALL',
    'SELECT am.roleid,reachable.path||am.roleid FROM reachable',
    'JOIN pg_catalog.pg_auth_members am ON am.member=reachable.oid',
    'WHERE NOT am.roleid=ANY(reachable.path))',
    'SELECT DISTINCT member.rolname AS member_role, granted.rolname AS granted_role,',
    'am.inherit_option,am.set_option,am.admin_option',
    'FROM reachable JOIN pg_catalog.pg_auth_members am ON am.member=reachable.oid',
    'JOIN pg_catalog.pg_roles member ON member.oid=am.member',
    'JOIN pg_catalog.pg_roles granted ON granted.oid=am.roleid',
    'ORDER BY member_role,granted_role,am.inherit_option,am.set_option,am.admin_option',
  ].join(' '),
  scope: [
    'SELECT n.nspname, pg_catalog.pg_get_userbyid(n.nspowner) AS owner,',
    "pg_catalog.has_schema_privilege(current_user,n.oid,'USAGE') AS schema_usage,",
    "pg_catalog.has_schema_privilege(current_user,n.oid,'CREATE') AS schema_create,",
    "pg_catalog.has_schema_privilege(session_user,n.oid,'CREATE') AS session_schema_create,",
    "pg_catalog.has_database_privilege(current_database(),'CREATE') AS database_create,",
    "pg_catalog.has_database_privilege(session_user,current_database(),'CREATE') AS session_database_create,",
    "pg_catalog.has_database_privilege(current_database(),'TEMPORARY') AS database_temporary,",
    "pg_catalog.pg_has_role(current_user,n.nspowner,'SET') AS can_assume_owner,",
    "pg_catalog.pg_has_role(session_user,n.nspowner,'SET') AS session_can_assume_owner,",
    "pg_catalog.pg_has_role(session_user,n.nspowner,'USAGE') AS session_inherits_owner",
    "FROM pg_catalog.pg_namespace n WHERE n.nspname='public'",
  ].join(' '),
  tables: [
    'WITH wanted AS (SELECT unnest($1::text[]) AS name)',
    'SELECT w.name, c.oid IS NOT NULL AS exists_in_public,',
    'pg_catalog.pg_get_userbyid(c.relowner) AS owner,',
    "CASE WHEN c.oid IS NULL THEN NULL ELSE pg_catalog.pg_has_role(current_user,c.relowner,'SET') END AS can_assume_owner,",
    "CASE WHEN c.oid IS NULL THEN NULL ELSE pg_catalog.pg_has_role(session_user,c.relowner,'SET') END AS session_can_assume_owner,",
    "CASE WHEN c.oid IS NULL THEN NULL ELSE pg_catalog.pg_has_role(session_user,c.relowner,'USAGE') END AS session_inherits_owner,",
    ...['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','TRIGGER','MAINTAIN'].map(p =>
      "CASE WHEN c.oid IS NULL THEN NULL ELSE pg_catalog.has_table_privilege(current_user,c.oid,'"+p+"') END AS can_"+p.toLowerCase()+","
    ).slice(0,-1),
    "CASE WHEN c.oid IS NULL THEN NULL ELSE pg_catalog.has_table_privilege(current_user,c.oid,'MAINTAIN') END AS can_maintain,",
    "CASE WHEN c.oid IS NULL THEN NULL ELSE pg_catalog.has_table_privilege(session_user,c.oid,'UPDATE') END AS session_can_update,",
    "CASE WHEN c.oid IS NULL THEN NULL ELSE pg_catalog.has_table_privilege(session_user,c.oid,'DELETE') END AS session_can_delete,",
    "CASE WHEN c.oid IS NULL THEN NULL ELSE pg_catalog.has_table_privilege(session_user,c.oid,'TRUNCATE') END AS session_can_truncate,",
    "CASE WHEN c.oid IS NULL THEN NULL ELSE pg_catalog.has_table_privilege(session_user,c.oid,'TRIGGER') END AS session_can_trigger",
    'FROM wanted w LEFT JOIN pg_catalog.pg_class c',
    "ON c.oid=pg_catalog.to_regclass(pg_catalog.format('public.%I',w.name))",
    'ORDER BY w.name',
  ].join(' '),
  columns: [
    'WITH wanted AS (SELECT c1.name AS table_name,c2.name AS column_name FROM pg_catalog.unnest($1::text[]) WITH ORDINALITY AS c1(name,ord) JOIN pg_catalog.unnest($2::text[]) WITH ORDINALITY AS c2(name,ord) USING (ord))',
    'SELECT w.table_name,w.column_name,a.attnum IS NOT NULL AS exists_in_public,',
    "CASE WHEN a.attnum IS NULL THEN NULL ELSE pg_catalog.has_column_privilege(current_user,a.attrelid,a.attname,'UPDATE') END AS can_update,",
    "CASE WHEN a.attnum IS NULL THEN NULL ELSE pg_catalog.has_column_privilege(current_user,a.attrelid,a.attname,'INSERT') END AS can_insert,",
    "CASE WHEN a.attnum IS NULL THEN NULL ELSE pg_catalog.has_column_privilege(session_user,a.attrelid,a.attname,'UPDATE') END AS session_can_update",
    'FROM wanted w LEFT JOIN pg_catalog.pg_class c',
    "ON c.oid=pg_catalog.to_regclass(pg_catalog.format('public.%I',w.table_name))",
    'LEFT JOIN pg_catalog.pg_attribute a ON a.attrelid=c.oid AND a.attname=w.column_name',
    'AND a.attnum>0 AND NOT a.attisdropped ORDER BY w.table_name,w.column_name',
  ].join(' '),
  functions: [
    'WITH wanted AS (SELECT unnest($1::text[]) AS name)',
    'SELECT w.name,p.oid IS NOT NULL AS exists_in_public,',
    'pg_catalog.pg_get_userbyid(p.proowner) AS owner,p.prosecdef AS security_definer,',
    'pg_catalog.pg_get_function_identity_arguments(p.oid) AS identity_arguments,',
    "CASE WHEN p.proconfig IS NULL THEN NULL ELSE (SELECT pg_catalog.substr(cfg,13) FROM pg_catalog.unnest(p.proconfig) cfg WHERE cfg LIKE 'search_path=%' LIMIT 1) END AS function_search_path,",
    "CASE WHEN p.oid IS NULL THEN NULL ELSE pg_catalog.has_function_privilege(current_user,p.oid,'EXECUTE') END AS can_execute,",
    "CASE WHEN p.oid IS NULL THEN NULL ELSE pg_catalog.has_function_privilege(session_user,p.oid,'EXECUTE') END AS session_can_execute,",
    "CASE WHEN p.oid IS NULL THEN NULL ELSE EXISTS (SELECT 1 FROM pg_catalog.aclexplode(COALESCE(p.proacl,pg_catalog.acldefault('f',p.proowner))) a WHERE a.grantee=0 AND a.privilege_type='EXECUTE') END AS public_execute",
    'FROM wanted w LEFT JOIN pg_catalog.pg_proc p ON p.proname=w.name',
    "AND p.pronamespace='public'::pg_catalog.regnamespace ORDER BY w.name",
  ].join(' '),
  triggers: [
    'SELECT c.relname AS table_name,t.tgname,t.tgenabled AS enabled_state,',
    'p.proname AS function_name,pg_catalog.pg_get_userbyid(p.proowner) AS function_owner',
    'FROM pg_catalog.pg_trigger t JOIN pg_catalog.pg_class c ON c.oid=t.tgrelid',
    'JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace',
    'JOIN pg_catalog.pg_proc p ON p.oid=t.tgfoid',
    "WHERE n.nspname='public' AND c.relname=ANY($1::text[]) AND NOT t.tgisinternal",
    'ORDER BY c.relname,t.tgname',
  ].join(' '),
  defaultAcl: [
    'SELECT pg_catalog.pg_get_userbyid(d.defaclrole) AS grant_owner,',
    'n.nspname AS schema_name,d.defaclobjtype AS object_type,d.defaclacl::text AS acl',
    'FROM pg_catalog.pg_default_acl d LEFT JOIN pg_catalog.pg_namespace n',
    'ON n.oid=d.defaclnamespace',
    "WHERE d.defaclnamespace=0 OR n.nspname='public'",
    'ORDER BY grant_owner,schema_name NULLS FIRST,object_type',
  ].join(' '),
})

/**
 * Risk signals are conservative warnings, not a successful real deployment
 * attestation. PostgreSQL checks SET ROLE against session_user (not merely
 * current_user). A privileged login may masquerade as a restricted current role.
 */
export function summarizeRuntimeRoleRisk({ identity, role, sessionRole, reachableRoles, membershipEdges, scope, tables }) {
  const privileged = r => r?.rolsuper===true || r?.rolcreaterole===true ||
    r?.rolcreatedb===true || r?.rolbypassrls===true || r?.rolreplication===true
  const assumablePrivilegedRoles = reachableRoles
    .filter(r=>r.session_can_set===true && privileged(r))
    .map(r=>r.rolname)
  const assumableObjectOwnerTables = tables
    .filter(t=>t.session_can_assume_owner===true)
    .map(t=>t.name)
  const adminMemberships = membershipEdges
    .filter(m=>m.admin_option===true)
    .map(m=>m.member_role+' -> '+m.granted_role)
  const highlySensitive = new Set(['gl_accounts','journal_entry_seals','journal_entries','journal_lines'])
  const dangerousSessionDml = tables
    .filter(t=>highlySensitive.has(t.name) && (
      t.session_can_update===true || t.session_can_delete===true ||
      t.session_can_truncate===true || t.session_can_trigger===true
    ))
    .map(t=>t.name)
  const reasons = []
  if(identity.session_user!==identity.current_user) reasons.push('CURRENT_ROLE_DIFFERS_FROM_SESSION_LOGIN')
  if(privileged(sessionRole)) reasons.push('SESSION_LOGIN_HAS_ELEVATED_ROLE_FLAGS')
  if(sessionRole?.rolcanlogin===false) reasons.push('SESSION_USER_ROLE_CANNOT_LOGIN')
  if(privileged(role)) reasons.push('CURRENT_ROLE_HAS_ELEVATED_ROLE_FLAGS')
  if(assumablePrivilegedRoles.length) reasons.push('SESSION_CAN_SET_ELEVATED_ROLE')
  if(scope?.session_can_assume_owner===true) reasons.push('SESSION_CAN_ASSUME_PUBLIC_SCHEMA_OWNER')
  if(scope?.session_inherits_owner===true) reasons.push('SESSION_INHERITS_PUBLIC_SCHEMA_OWNER')
  if(scope?.session_schema_create===true || scope?.session_database_create===true) {
    reasons.push('SESSION_CAN_CREATE_IN_SCHEMA_OR_DATABASE')
  }
  if(dangerousSessionDml.length) reasons.push('SESSION_HAS_SENSITIVE_TABLE_DML')
  if(assumableObjectOwnerTables.length) reasons.push('SESSION_CAN_ASSUME_AUDITED_TABLE_OWNER')
  if(adminMemberships.length) reasons.push('ROLE_ADMIN_OPTION_REQUIRES_REVIEW')
  return {
    runtime_principal_attested:false,
    verdict:'RUNTIME_FASTIFY_LOGIN_NOT_ATTESTED_BY_CATALOG_ALONE',
    reasons,
    assumable_privileged_roles:assumablePrivilegedRoles,
    assumable_audited_table_owners_for:assumableObjectOwnerTables,
    admin_membership_edges:adminMemberships,
    session_sensitive_table_dml:dangerousSessionDml,
  }
}

export async function auditRuntimeRoleReadOnly(client) {
  await client.query('BEGIN TRANSACTION READ ONLY')
  let open = true
  try {
    const identity = (await client.query(SQL.identity)).rows[0]
    if (!identity || identity.transaction_read_only !== true) {
      throw new Error('read-only mode not established')
    }
    if (identity.server_version_num < 170000 || identity.server_version_num >= 180000) {
      throw new Error('PostgreSQL 17 required')
    }
    const role = (await client.query(SQL.role)).rows[0] ?? null
    const sessionRole = (await client.query(SQL.sessionRole)).rows[0] ?? null
    if(!role || !sessionRole) throw new Error('Unable to resolve both role catalog identities')
    const reachableRoles = (await client.query(SQL.reachableRoles)).rows
    const membershipEdges = (await client.query(SQL.membershipEdges)).rows
    const scope = (await client.query(SQL.scope)).rows[0] ?? null
    const tables = (await client.query(SQL.tables,[TABLES])).rows
    const columns = (await client.query(SQL.columns,[COLUMNS.map(x=>x[0]),COLUMNS.map(x=>x[1])])).rows
    const functions = (await client.query(SQL.functions,[FUNCTIONS])).rows
    const triggers = (await client.query(SQL.triggers,[TRIGGER_TABLES])).rows
    const defaultAcl = (await client.query(SQL.defaultAcl)).rows
    const risk = summarizeRuntimeRoleRisk({ identity,role,sessionRole,reachableRoles,membershipEdges,scope,tables })
    await client.query('COMMIT')
    open = false
    return {
      kind:'PG17_METADATA_ONLY', identity,role,sessionRole,reachableRoles,membershipEdges,
      scope,tables,columns,functions,triggers,defaultAcl,risk,data_rows_read:false,
      evidence_limit:'This catalog-only report does NOT attest the actual Fastify login. Compare securely with authorized nonproduction Fastify pool configuration; never publish credentials.',
    }
  } catch(error) {
    if(open) await client.query('ROLLBACK').catch(()=>{})
    throw error
  }
}

async function main() {
  const url=process.env.ERP_DATABASE_URL
  if(!url) throw new Error('ERP_DATABASE_URL missing; no connection attempted')
  const client=new Client({connectionString:url,application_name:'erp-09-08c-role-readonly-audit',statement_timeout:10000})
  try {
    await client.connect()
    process.stdout.write(JSON.stringify(await auditRuntimeRoleReadOnly(client),null,2)+'\n')
  } finally {
    await client.end().catch(()=>{})
  }
}

if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  main().catch(e=>{
    // Never print a connection URI or password on error.
    process.stderr.write('Read-only PG17 audit failed [code='+String(e?.code??'UNKNOWN')+']; no DDL/DML attempted.\n')
    process.exitCode=1
  })
}
