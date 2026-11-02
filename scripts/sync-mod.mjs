// Hält den Plugin-Cache von Claude Code auf dem Stand des Repos (Cache = Kopie, kein Link).
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { execSync } from 'node:child_process'

const repoVersion = JSON.parse(readFileSync('mod/kayy-office/.claude-plugin/plugin.json', 'utf8')).version
let cached = null
try {
  const p = JSON.parse(readFileSync(join(homedir(), '.claude/plugins/installed_plugins.json'), 'utf8'))
  cached = p.plugins?.['kayy-office@kayy']?.[0]?.version ?? null
} catch {}

if (cached === repoVersion) {
  console.log(`Mod aktuell (${repoVersion}).`)
} else {
  console.log(`Mod-Cache ${cached ?? 'fehlt'} -> ${repoVersion}`)
  try {
    execSync('claude plugin marketplace update kayy', { stdio: 'inherit' })
    execSync(cached ? 'claude plugin update kayy-office@kayy' : 'claude plugin install kayy-office@kayy', { stdio: 'inherit' })
    console.log('Fertig. Claude neu starten, damit der Mod geladen wird.')
  } catch {
    console.warn('Sync fehlgeschlagen. Manuell: claude plugin marketplace update kayy && claude plugin update kayy-office@kayy')
  }
}
