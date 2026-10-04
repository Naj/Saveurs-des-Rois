// Vérifications automatiques avant publication (exécutées par Cloudflare).
import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

let errors = 0;
const fail = msg => { console.error('✖ ' + msg); errors++; };
const ok = msg => console.log('✔ ' + msg);
const forWorkers = process.argv.includes('--workers');

for (const f of ['public/_worker.js', 'public/js/app.js', 'public/js/catalogue-data.js', 'public/admin/admin.js']) {
  try { execFileSync(process.execPath, ['--input-type=module', '--check'], { input: readFileSync(f), stdio: 'pipe' }); ok(`syntaxe ${f}`); }
  catch (e) { fail(`erreur de syntaxe dans ${f}\n${e.stderr}`); }
}
for (const f of ['public/index.html', 'public/404.html', 'public/admin/index.html', 'public/_routes.json']) {
  existsSync(f) ? ok(`présent ${f}`) : fail(`fichier manquant : ${f}`);
}
if (forWorkers) {
  readFileSync('wrangler.jsonc', 'utf8').includes('REMPLACER-PAR-VOTRE-ID-D1')
    ? fail('database_id non renseigné dans wrangler.jsonc (identifiant de la base D1).')
    : ok('database_id renseigné');
}
if (errors) { console.error(`\n${errors} problème(s) à corriger.`); process.exit(1); }
console.log('\nTout est prêt.');
