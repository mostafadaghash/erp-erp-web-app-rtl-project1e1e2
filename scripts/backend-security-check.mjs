import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const serverRoot = join(root, 'server')

function filesUnder(directory) {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name)
    return statSync(path).isDirectory() ? filesUnder(path) : [path]
  })
}

const secretChecks = [
  {
    label: 'private key material',
    pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  },
  {
    label: 'GitHub token',
    pattern: /(?:github_pat_[A-Za-z0-9_]{20,}|gh[pousr]_[A-Za-z0-9]{20,})/,
  },
  {
    label: 'AWS access key',
    pattern: /AKIA[0-9A-Z]{16}/,
  },
  {
    label: 'hard-coded bearer token',
    pattern: /Bearer\s+[A-Za-z0-9._~+\/-]{20,}/,
  },
  {
    label: 'hard-coded secret assignment',
    pattern: /\b(?:password|secret|api[_-]?key|access[_-]?token)\b\s*[:=]\s*['"`][^'"`\r\n]{8,}['"`]/i,
  },
  {
    label: 'hard-coded PostgreSQL connection string',
    pattern: /connectionString\s*:\s*['"`]postgres(?:ql)?:\/\//i,
  },
]

const failures = []
for (const file of filesUnder(serverRoot)) {
  if (!/\.(?:ts|js|mjs|json)$/.test(file)) continue
  const source = readFileSync(file, 'utf8')
  for (const check of secretChecks) {
    if (check.pattern.test(source)) {
      failures.push(`${relative(root, file)}: ${check.label}`)
    }
  }
}

const config = readFileSync(
  join(root, 'server/infrastructure/config/config.ts'),
  'utf8',
)
if (!/ERP_DATABASE_URL/.test(config)) {
  failures.push('server config: ERP_DATABASE_URL must be environment-backed')
}
if (!/ERP_AUTH_ACCESS_TOKEN_SECRET/.test(config)) {
  failures.push(
    'server config: ERP_AUTH_ACCESS_TOKEN_SECRET must be environment-backed',
  )
}

const logger = readFileSync(
  join(root, 'server/infrastructure/logging/logger.ts'),
  'utf8',
)
for (const requiredRedaction of [
  'req.headers.authorization',
  'req.headers.cookie',
  'config.ERP_DATABASE_URL',
  'ERP_DATABASE_URL',
  'config.ERP_AUTH_ACCESS_TOKEN_SECRET',
  'ERP_AUTH_ACCESS_TOKEN_SECRET',
]) {
  if (!logger.includes(requiredRedaction)) {
    failures.push(`backend logger: missing redaction for ${requiredRedaction}`)
  }
}

if (failures.length > 0) {
  console.error(
    'Backend security checks failed:\n' +
      failures.map((failure) => `- ${failure}`).join('\n'),
  )
  process.exit(1)
}

console.log('Backend secret/security checks passed.')
