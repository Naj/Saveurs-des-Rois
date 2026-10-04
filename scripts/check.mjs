// Vérifications avant déploiement : syntaxe JS, configuration D1, fichiers indispensables.
import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

let errors = 0;
const fail = msg => { console.error('✖ ' + msg); errors++; };
const ok = msg => console.log('✔ ' + msg);

for (const f of ['src/db-init.js', 'src/worker.js', 'public/js/app.js', 'public/js/catalogue-data.js', 'public/admin/admin.js']) {
  try { execFileSync(process.execPath, ['--check', f], { stdio: 'pipe' }); ok(`syntaxe ${f}`); }
  catch (e) {
    // admin.js est un module ES : on le vérifie comme tel
    try { execFileSync(process.execPath, ['--input-type=module', '--check'], { input: readFileSync(f), stdio: 'pipe' }); ok(`syntaxe ${f}`); }
    catch (e2) { fail(`erreur de syntaxe dans ${f}\n${e2.stderr || e.stderr}`); }
  }
}
for (const f of ['public/index.html', 'public/404.html', 'public/admin/index.html', 'src/db-init.js']) {
  existsSync(f) ? ok(`présent ${f}`) : fail(`fichier manquant : ${f}`);
}
const conf = readFileSync('wrangler.jsonc', 'utf8');
if (conf.includes('REMPLACER-PAR-VOTRE-ID-D1')) {
  fail('database_id non renseigné dans wrangler.jsonc : créez la base dans Cloudflare (Storage & Databases → D1), puis collez son identifiant dans wrangler.jsonc depuis GitHub.');
} else ok('database_id renseigné');

if (errors) { console.error(`\n${errors} problème(s) à corriger avant de déployer.`); process.exit(1); }
console.log('\nTout est prêt.');
