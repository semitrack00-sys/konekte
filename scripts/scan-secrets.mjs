import { execFileSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
const files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean);
const patterns = [
  /\b(?:sk|rk)_live_[A-Za-z0-9]{12,}/,
  /\bsk_test_[A-Za-z0-9]{20,}/,
  /\bwhsec_[A-Za-z0-9]{20,}/,
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /\bAKIA[0-9A-Z]{16}\b/,
  /\bgh[pousr]_[A-Za-z0-9]{30,}/,
  /\+509[\s-]*\d{2}[\s-]*\d{2}[\s-]*\d{4}/
];
let failed = false;
for (const file of new Set(files)) {
  if (!statSync(file).isFile() || file === 'pnpm-lock.yaml') continue;
  if (/(^|\/)\.env(?:\..+)?$/.test(file) && !file.endsWith('.example')) { console.error(`Environment file included: ${file}`); failed = true; continue; }
  const content = readFileSync(file, 'utf8');
  if (patterns.some(pattern => pattern.test(content))) { console.error(`Potential secret or phone number: ${file}`); failed = true; }
}
if (failed) process.exit(1);
console.log(`Secret/phone scan passed for ${new Set(files).size} repository files. No matched credentials or +509 numbers.`);
