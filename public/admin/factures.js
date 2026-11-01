/* Saveurs des Rois — onglet Factures de l'administration
   Factures (depuis un devis, sans devis, récapitulatives pros), encaissements (livre des recettes), registre des achats,
   résultats d'exploitation, import de l'historique et exports comptables. */

let C; // contexte fourni par admin.js : { api, toast, run, st, render, esc, euro }
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const euro = c => ((c || 0) / 100).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' });
const nb = v => { const n = parseFloat(String(v ?? '').replace(/[\s  €]/g, '').replace(',', '.')); return Number.isFinite(n) ? n : 0; };
const prixTxt = c => ((c || 0) / 100).toFixed(2).replace('.', ',');
const dateCourte = iso => (iso ? new Date(iso.slice(0, 10) + 'T12:00:00').toLocaleDateString('fr-FR') : '');
const aujourdhui = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Paris' });
const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const METHODES = ['Espèces', 'Virement', 'Carte', 'SumUp (en ligne)', 'Chèque', 'Paylib / Wero', 'Autre'];
const CATEGORIES = ['Matières premières', 'Emballages et coffrets', 'Petit matériel', 'Livraison et transport', 'Communication', 'Autre'];
const TYPES = { facture: 'Facture', acompte: 'Acompte', solde: 'Solde', avoir: 'Avoir' };
const ETATS = { brouillon: 'Brouillon', 'payée': 'Payée', partiel: 'Partiel', 'à payer': 'À payer', 'en retard': 'En retard', avoir: 'Avoir', 'remboursé': 'Remboursé' };
const PENALITES = 'En cas de retard de paiement : pénalités au taux de trois fois le taux d’intérêt légal, exigibles dès le lendemain de l’échéance, et indemnité forfaitaire pour frais de recouvrement de 40 € (art. L441-10 et D441-5 du Code de commerce). Pas d’escompte pour paiement anticipé.';

const D = () => C.st.f || { invoices: [], payments: [], expenses: [], today: aujourdhui() };
const valides = () => D().invoices.filter(i => i.status === 'validée');
const net = i => i.total_cents - (i.deduct_cents || 0);
const reste = i => net(i) - (i.paid_cents || 0);
const annee = () => C.st.fAnnee || new Date().getFullYear();
const reglage = (k, def) => (C.st.settings?.[k] ?? '') !== '' ? C.st.settings[k] : def;
const taux = () => nb(reglage('social_rate', '12,4'));

export function initFactures(ctx) { C = ctx; lier(); }
export async function chargerFactures() { C.st.f = await C.api('/api/admin/invoices'); }

/* ================================================================ Liens avec les demandes */
function devisDe(r) {
  let q = r.quote;
  if (typeof q === 'string') { try { q = JSON.parse(q); } catch { q = null; } }
  if (q?.lignes?.length) {
    const brut = q.lignes.reduce((t, l) => t + Math.round(l.qty * l.prix), 0);
    const part = q.lignes.filter(l => l.s === 'part').reduce((t, l) => t + Math.round(l.qty * l.prix), 0);
    return { total: brut - Math.round(part * (q.remise || 0) / 100), acompte: nb(q.acompte), numero: q.numero, enregistre: true };
  }
  return { total: r.estimate_cents || 0, acompte: 0, numero: `DEV-${(r.created_at || '').slice(0, 4)}-${String(r.id).padStart(4, '0')}`, enregistre: false };
}
const facturesDe = r => D().invoices.filter(i => (i.request_ids || []).includes(r.id));

export function facturesDemande(r) {
  if (r.kind !== 'devis') return '';
  const fs = facturesDe(r);
  const chips = fs.map(i => `<a class="adm-fchip adm-fchip--${esc((i.state || '').replace(/\s/g, '-').replace('é', 'e'))}" href="/admin/facture.html?id=${i.id}">${esc(i.number || 'Brouillon')} · ${TYPES[i.type]} · ${euro(net(i))}${i.status === 'brouillon' ? '' : ` · ${ETATS[i.state] || ''}`}</a>`).join('');
  const solde = fs.some(i => i.type === 'acompte' && i.status === 'validée') && !fs.some(i => ['solde', 'facture'].includes(i.type));
  const fini = fs.some(i => ['solde', 'facture'].includes(i.type));
  return `<div class="adm-factures-demande">${chips}
    ${!fini ? `<button type="button" class="btn ${solde ? 'btn--or' : 'btn--sombre'} btn--petit" data-facturer="${r.id}">${solde ? 'Facturer le solde' : fs.length ? 'Facturer' : '✓ Devis accepté → facturer'}</button>` : ''}</div>`;
}

/* ================================================================ Onglet */
export function tFactures() {
  const vue = C.st.fVue || 'factures';
  const onglets = [['factures', 'Factures'], ['encaissements', 'Encaissements'], ['achats', 'Achats'], ['resultats', 'Résultats'], ['import', 'Import / export'], ['reglages', 'Réglages']];
  const corps = { factures: vFactures, encaissements: vEncaissements, achats: vAchats, resultats: vResultats, import: vImport, reglages: vReglages }[vue]();
  return `<div class="adm-bar"><h1 style="margin:0">Facturation</h1>
    <div class="adm-actions" style="margin:0">
      <button type="button" class="btn btn--ligne btn--petit" data-fnouvelle="manuelle">+ Facture sans devis</button>
      <button type="button" class="btn btn--ligne btn--petit" data-fnouvelle="mensuelle">Facture mensuelle pro</button>
    </div></div>
  ${!C.st.settings?.company_siret ? '<button class="adm-alerte adm-alerte--warn" data-fvue="reglages">⚠️ Complétez votre SIRET et votre adresse (Textes &amp; contact → Devis PDF) : obligatoires sur les factures</button>' : ''}
  <nav class="adm-sous-onglets">${onglets.map(([k, l]) => `<button type="button" data-fvue="${k}" aria-current="${k === vue}">${l}</button>`).join('')}</nav>
  <div id="fZone">${corps}</div>`;
}

const selectAnnee = () => {
  const ans = new Set([new Date().getFullYear()]);
  D().invoices.forEach(i => i.issue_date && ans.add(+i.issue_date.slice(0, 4)));
  D().payments.forEach(p => ans.add(+p.date.slice(0, 4)));
  D().expenses.forEach(e => ans.add(+e.date.slice(0, 4)));
  return `<select id="fAnnee" aria-label="Année">${[...ans].sort((a, b) => b - a).map(a => `<option ${a === annee() ? 'selected' : ''}>${a}</option>`).join('')}</select>`;
};
const kpi = (label, val, sous = '', cls = '') => `<div class="adm-kpi ${cls}"><span>${label}</span><strong>${val}</strong>${sous ? `<small>${sous}</small>` : ''}</div>`;

/* ---------------- Factures */
function vFactures() {
  const today = D().today || aujourdhui(), mois = today.slice(0, 7);
  const v = valides();
  const factureMois = v.filter(i => i.issue_date?.startsWith(mois)).reduce((t, i) => t + net(i), 0);
  const ids = new Set(v.map(i => i.id));
  const encMois = D().payments.filter(p => ids.has(p.invoice_id) && p.date.startsWith(mois)).reduce((t, p) => t + p.amount_cents, 0);
  const ouvertes = v.filter(i => i.type !== 'avoir' && reste(i) > 0);
  const retard = ouvertes.filter(i => i.state === 'en retard');
  const filtre = C.st.fFiltre || 'toutes', q = (C.st.fCherche || '').toLowerCase();
  const liste = D().invoices.filter(i => filtre === 'toutes' || (filtre === 'importées' ? i.source === 'import' : filtre === 'à encaisser' ? i.status === 'validée' && i.type !== 'avoir' && reste(i) > 0 : i.state === filtre))
    .filter(i => !q || [i.number, i.client?.nom, i.client?.societe, i.quote_ref].join(' ').toLowerCase().includes(q));
  const brouillons = D().invoices.filter(i => i.status === 'brouillon').length;
  return `
  <div class="adm-kpis">
    ${kpi(`Facturé en ${MOIS[+mois.slice(5) - 1]}`, euro(factureMois))}
    ${kpi(`Encaissé en ${MOIS[+mois.slice(5) - 1]}`, euro(encMois), '', 'adm-kpi--ok')}
    ${kpi('À encaisser', euro(ouvertes.filter(i => i.state !== 'en retard').reduce((t, i) => t + reste(i), 0)), `${ouvertes.length - retard.length} facture${ouvertes.length - retard.length > 1 ? 's' : ''}`)}
    ${kpi('En retard', euro(retard.reduce((t, i) => t + reste(i), 0)), `${retard.length} facture${retard.length > 1 ? 's' : ''}`, retard.length ? 'adm-kpi--err' : '')}
  </div>
  <div class="adm-bar">
    <input type="search" id="fCherche" placeholder="Rechercher un client, un numéro…" value="${esc(C.st.fCherche || '')}" aria-label="Rechercher">
    <select id="fFiltre" aria-label="Filtrer">${['toutes', 'à encaisser', 'en retard', 'payée', 'brouillon', 'avoir', 'importées'].map(s => `<option value="${s}" ${s === filtre ? 'selected' : ''}>${s === 'brouillon' ? `brouillons (${brouillons})` : s}</option>`).join('')}</select>
  </div>
  ${liste.length ? `<div class="adm-table-scroll"><table class="adm-table adm-ftable">
    <thead><tr><th>N°</th><th>Date</th><th>Client</th><th>Type</th><th class="num">Montant</th><th class="num">Reste</th><th>Statut</th><th></th></tr></thead>
    <tbody>${liste.map(i => `<tr>
      <td><a href="/admin/facture.html?id=${i.id}"><strong>${esc(i.number || 'Brouillon')}</strong></a></td>
      <td>${dateCourte(i.issue_date)}</td>
      <td>${esc(i.client?.societe || i.client?.nom || '—')}${i.is_pro ? ' <span class="adm-pro">PRO</span>' : ''}</td>
      <td>${TYPES[i.type] || i.type}${i.quote_ref ? `<br><small class="adm-meta">${esc(i.quote_ref.length > 30 ? i.quote_ref.slice(0, 30) + '…' : i.quote_ref)}</small>` : ''}</td>
      <td class="num">${euro(net(i))}</td>
      <td class="num">${i.status === 'validée' && i.type !== 'avoir' && reste(i) > 0 ? euro(reste(i)) : ''}</td>
      <td><span class="adm-fstat adm-fstat--${esc((i.state || '').replace(/\s/g, '-').replace('é', 'e'))}">${ETATS[i.state] || i.state}</span>${i.sent_at ? ' <span title="Envoyée par e-mail" aria-label="Envoyée par e-mail">✉</span>' : ''}${i.state === 'en retard' ? `<br><small class="adm-meta">échue le ${dateCourte(i.due_date)}</small>` : ''}</td>
      <td class="adm-factions"><a class="btn btn--ligne btn--petit" href="/admin/facture.html?id=${i.id}">${i.status === 'brouillon' ? 'Compléter' : 'Ouvrir'}</a>
        ${i.status === 'validée' && i.type !== 'avoir' && reste(i) > 0 ? `<button type="button" class="btn btn--or btn--petit" data-fencaisser="${i.id}">Encaisser</button>` : ''}</td>
    </tr>`).join('')}</tbody></table></div>`
    : `<div class="vide">${D().invoices.length ? 'Aucune facture dans cette catégorie.' : 'Aucune facture pour l’instant. Depuis l’onglet Particuliers ou Professionnels, cliquez sur « ✓ Devis accepté → facturer » sous une demande, ou importez vos factures passées (Import / export).'}</div>`}
  <p class="note">Numérotation continue et chronologique (FA-année-0001, AV- pour les avoirs). Une facture validée ne se modifie plus : une erreur se corrige par un avoir. Les factures sont conservées dans la base et dans la sauvegarde (à garder 10 ans).</p>`;
}

/* ---------------- Encaissements (livre des recettes) */
function recettes(an) {
  const inv = Object.fromEntries(valides().map(i => [i.id, i]));
  return D().payments.filter(p => inv[p.invoice_id] && p.date.startsWith(String(an)))
    .map(p => ({ ...p, inv: inv[p.invoice_id] })).sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id);
}
const nature = i => (i.type === 'acompte' ? 'Acompte sur vente de marchandises' : i.type === 'avoir' ? 'Remboursement (avoir)' : 'Vente de marchandises');
function vEncaissements() {
  const r = recettes(annee());
  const total = r.reduce((t, p) => t + p.amount_cents, 0);
  return `<div class="adm-bar"><h2 class="adm-h2" style="margin:0">Livre des recettes ${selectAnnee()}</h2>
    <button type="button" class="btn btn--ligne btn--petit" data-fexport="recettes">Exporter (Excel)</button></div>
  <p class="note">Toutes les sommes encaissées, dans l’ordre chronologique : c’est sur ces montants que se calcule votre déclaration de chiffre d’affaires à l’URSSAF. Les paiements s’enregistrent depuis chaque facture.</p>
  ${r.length ? `<div class="adm-table-scroll"><table class="adm-table">
    <thead><tr><th>Date</th><th>Facture</th><th>Client</th><th>Nature</th><th>Mode</th><th class="num">Montant</th></tr></thead>
    <tbody>${r.map(p => `<tr><td>${dateCourte(p.date)}</td><td><a href="/admin/facture.html?id=${p.inv.id}">${esc(p.inv.number)}</a></td><td>${esc(p.inv.client?.societe || p.inv.client?.nom || '')}</td><td>${nature(p.inv)}</td><td>${esc(p.method || '')}</td><td class="num">${euro(p.amount_cents)}</td></tr>`).join('')}</tbody>
    <tfoot><tr><td colspan="5"><strong>Total ${annee()}</strong></td><td class="num"><strong>${euro(total)}</strong></td></tr></tfoot></table></div>`
    : `<div class="vide">Aucun encaissement enregistré en ${annee()}.</div>`}`;
}

/* ---------------- Achats (registre des achats) */
function vAchats() {
  const an = String(annee());
  const liste = D().expenses.filter(e => e.date.startsWith(an));
  const parCat = CATEGORIES.map(c => [c, liste.filter(e => (e.category || 'Autre') === c).reduce((t, e) => t + e.amount_cents, 0)]).filter(([, v]) => v);
  const e = C.st.fEditAchat ? D().expenses.find(x => x.id === C.st.fEditAchat) : null;
  return `<div class="adm-bar"><h2 class="adm-h2" style="margin:0">Registre des achats ${selectAnnee()}</h2>
    <button type="button" class="btn btn--ligne btn--petit" data-fexport="achats">Exporter (Excel)</button></div>
  <p class="note">Obligatoire pour la vente de marchandises : chaque achat (farine, amandes, miel, coffrets…) avec sa date, le fournisseur et le montant. Gardez les tickets et factures d’achat.</p>
  <form class="adm-item" id="fAchat" data-id="${e?.id || ''}">
    <h3 style="margin-top:0">${e ? 'Modifier l’achat' : 'Nouvel achat'}</h3>
    <div class="trois">
      <div class="champ"><label>Date</label><input name="date" type="date" required value="${esc(e?.date || aujourdhui())}"></div>
      <div class="champ"><label>Fournisseur</label><input name="supplier" value="${esc(e?.supplier || '')}" placeholder="Ex : Metro, épicerie…"></div>
      <div class="champ"><label>Catégorie</label><select name="category">${CATEGORIES.map(c => `<option ${c === (e?.category || 'Matières premières') ? 'selected' : ''}>${c}</option>`).join('')}</select></div>
    </div>
    <div class="trois">
      <div class="champ"><label>Désignation</label><input name="label" value="${esc(e?.label || '')}" placeholder="Ex : amandes 5 kg, miel"></div>
      <div class="champ"><label>Montant TTC (€)</label><input name="montant" inputmode="decimal" required value="${e ? prixTxt(e.amount_cents) : ''}" placeholder="Ex : 48,90"></div>
      <div class="champ"><label>Mode de paiement</label><select name="method">${['Carte', 'Espèces', 'Virement', 'Chèque', 'Autre'].map(m => `<option ${m === e?.method ? 'selected' : ''}>${m}</option>`).join('')}</select></div>
    </div>
    <div class="adm-actions"><button class="btn btn--sombre btn--petit" type="submit">${e ? 'Enregistrer' : 'Ajouter l’achat'}</button>${e ? '<button type="button" class="lien" data-fannuleachat>Annuler</button>' : ''}</div>
  </form>
  ${parCat.length ? `<div class="adm-kpis">${parCat.map(([c, v]) => kpi(c, euro(v))).join('')}${kpi(`Total ${an}`, euro(liste.reduce((t, x) => t + x.amount_cents, 0)), '', 'adm-kpi--ok')}</div>` : ''}
  ${liste.length ? `<div class="adm-table-scroll"><table class="adm-table">
    <thead><tr><th>Date</th><th>Fournisseur</th><th>Catégorie</th><th>Désignation</th><th>Mode</th><th class="num">Montant</th><th></th></tr></thead>
    <tbody>${liste.map(x => `<tr><td>${dateCourte(x.date)}</td><td>${esc(x.supplier || '')}</td><td>${esc(x.category || '')}</td><td>${esc(x.label || '')}</td><td>${esc(x.method || '')}</td><td class="num">${euro(x.amount_cents)}</td>
      <td class="adm-factions"><button type="button" class="lien" data-feditachat="${x.id}">Modifier</button><button type="button" class="lien" data-fdelachat="${x.id}" style="color:var(--err)">Supprimer</button></td></tr>`).join('')}</tbody></table></div>`
    : `<div class="vide">Aucun achat enregistré en ${an}.</div>`}`;
}

/* ---------------- Résultats d'exploitation */
function resultats(an) {
  const v = valides(), ids = new Set(v.map(i => i.id)), r = taux() / 100;
  const mois = MOIS.map((nom, k) => {
    const m = `${an}-${String(k + 1).padStart(2, '0')}`;
    const facture = v.filter(i => i.issue_date?.startsWith(m)).reduce((t, i) => t + net(i), 0);
    const encaisse = D().payments.filter(p => ids.has(p.invoice_id) && p.date.startsWith(m)).reduce((t, p) => t + p.amount_cents, 0);
    const achats = D().expenses.filter(e => e.date.startsWith(m)).reduce((t, e) => t + e.amount_cents, 0);
    const cotis = Math.round(Math.max(0, encaisse) * r);
    return { nom, facture, encaisse, achats, cotis, resultat: encaisse - achats - cotis };
  });
  const tot = k => mois.reduce((t, x) => t + x[k], 0);
  return { mois, total: { facture: tot('facture'), encaisse: tot('encaisse'), achats: tot('achats'), cotis: tot('cotis'), resultat: tot('resultat') } };
}
function vResultats() {
  const an = annee(), { mois, total } = resultats(an);
  const plafond = nb(reglage('ca_ceiling', '203100')) * 100, tva = nb(reglage('vat_threshold', '85000')) * 100;
  const barre = (val, max, label) => { const p = max ? Math.min(100, val / max * 100) : 0; return `<div class="adm-jauge"><div class="adm-jauge__txt"><span>${label}</span><strong>${euro(val)} / ${euro(max)}</strong></div><div class="adm-jauge__fond"><div style="width:${p.toFixed(1)}%" class="${p > 90 ? 'alerte' : p > 75 ? 'attention' : ''}"></div></div></div>`; };
  const max = Math.max(1, ...mois.map(m => Math.max(m.encaisse, m.achats)));
  const W = 720, H = 170, bw = W / 12;
  const svg = mois.map((m, k) => `
    <rect x="${(k * bw + bw * .14).toFixed(1)}" y="${(H - 18 - Math.max(0, m.encaisse) / max * (H - 30)).toFixed(1)}" width="${(bw * .34).toFixed(1)}" height="${(Math.max(0, m.encaisse) / max * (H - 30)).toFixed(1)}" rx="2" class="enc"><title>${m.nom} : ${euro(m.encaisse)} encaissés</title></rect>
    <rect x="${(k * bw + bw * .52).toFixed(1)}" y="${(H - 18 - m.achats / max * (H - 30)).toFixed(1)}" width="${(bw * .34).toFixed(1)}" height="${(m.achats / max * (H - 30)).toFixed(1)}" rx="2" class="ach"><title>${m.nom} : ${euro(m.achats)} d’achats</title></rect>
    <text x="${(k * bw + bw / 2).toFixed(1)}" y="${H - 4}" text-anchor="middle">${m.nom.slice(0, 3)}</text>`).join('');
  const trimestres = [0, 1, 2, 3].map(q => mois.slice(q * 3, q * 3 + 3).reduce((t, m) => t + m.encaisse, 0));
  return `<div class="adm-bar"><h2 class="adm-h2" style="margin:0">Résultats d’exploitation ${selectAnnee()}</h2>
    <button type="button" class="btn btn--ligne btn--petit" data-fexport="tout">Exporter le classeur complet (Excel)</button></div>
  <div class="adm-kpis">
    ${kpi('Chiffre d’affaires encaissé', euro(total.encaisse), `facturé : ${euro(total.facture)}`, 'adm-kpi--ok')}
    ${kpi('Achats', euro(total.achats))}
    ${kpi('Cotisations estimées', euro(total.cotis), `${String(taux()).replace('.', ',')} % de l’encaissé`)}
    ${kpi('Résultat estimé', euro(total.resultat), 'encaissé − achats − cotisations', total.resultat < 0 ? 'adm-kpi--err' : '')}
  </div>
  <section class="adm-item"><h3 style="margin-top:0">Encaissements et achats par mois</h3>
    <svg class="adm-chart adm-chart--res" viewBox="0 0 ${W} ${H}" role="img" aria-label="Encaissements et achats par mois">${svg}</svg>
    <p class="adm-legende"><span class="enc"></span> Encaissé <span class="ach"></span> Achats</p></section>
  <div class="adm-table-scroll"><table class="adm-table">
    <thead><tr><th>Mois</th><th class="num">Facturé</th><th class="num">Encaissé (à déclarer)</th><th class="num">Achats</th><th class="num">Cotisations estimées</th><th class="num">Résultat</th></tr></thead>
    <tbody>${mois.map(m => `<tr><td>${m.nom}</td><td class="num">${euro(m.facture)}</td><td class="num"><strong>${euro(m.encaisse)}</strong></td><td class="num">${euro(m.achats)}</td><td class="num">${euro(m.cotis)}</td><td class="num ${m.resultat < 0 ? 'adm-ko' : ''}">${euro(m.resultat)}</td></tr>`).join('')}</tbody>
    <tfoot><tr><td><strong>Total ${an}</strong></td><td class="num">${euro(total.facture)}</td><td class="num"><strong>${euro(total.encaisse)}</strong></td><td class="num">${euro(total.achats)}</td><td class="num">${euro(total.cotis)}</td><td class="num"><strong>${euro(total.resultat)}</strong></td></tr></tfoot>
  </table></div>
  <div class="adm-stats-grid">
    <section class="adm-item"><h3 style="margin-top:0">Déclaration URSSAF</h3>
      <p class="note">Montant à déclarer = chiffre d’affaires <strong>encaissé</strong> sur la période.</p>
      <table class="adm-table"><tbody>${trimestres.map((v, q) => `<tr><td>${['1<sup>er</sup>', '2<sup>e</sup>', '3<sup>e</sup>', '4<sup>e</sup>'][q]} trimestre</td><td class="num">${euro(v)}</td></tr>`).join('')}</tbody></table>
    </section>
    <section class="adm-item"><h3 style="margin-top:0">Seuils ${an}</h3>
      ${barre(total.encaisse, plafond, 'Plafond micro-entreprise')}
      ${barre(total.encaisse, tva, 'Franchise de TVA')}
      <p class="note">Montants modifiables dans Réglages. Estimation indicative : vérifiez vos taux et seuils sur autoentrepreneur.urssaf.fr ou avec votre comptable.</p>
    </section>
  </div>`;
}

/* ---------------- Import / export */
function lotsImport() {
  const lots = {};
  D().invoices.filter(i => i.import_batch).forEach(i => { (lots[i.import_batch] ||= { f: 0, a: 0, total: 0 }).f++; lots[i.import_batch].total += net(i); });
  D().expenses.filter(e => e.import_batch).forEach(e => { (lots[e.import_batch] ||= { f: 0, a: 0, total: 0 }).a++; lots[e.import_batch].total += e.amount_cents; });
  return Object.entries(lots).map(([k, v]) => ({ lot: k, ...v, date: new Date(parseInt(k.slice(4), 36)) })).sort((a, b) => b.date - a.date);
}
function vImport() {
  const lots = lotsImport();
  return `<section class="adm-item">
    <h2 style="font-size:1.15rem;margin-top:0">Exporter pour votre comptabilité ${selectAnnee()}</h2>
    <p class="note">Le classeur complet contient : factures, détail des lignes, livre des recettes, registre des achats et résultats mensuels. Le journal CSV s’importe dans la plupart des logiciels comptables (Contodéo, Indy, tableur…).</p>
    <div class="adm-actions">
      <button type="button" class="btn btn--or btn--petit" data-fexport="tout">Classeur complet (Excel)</button>
      <button type="button" class="btn btn--ligne btn--petit" data-fexport="journal-csv">Journal des factures (CSV)</button>
      <button type="button" class="btn btn--ligne btn--petit" data-fexport="recettes-csv">Livre des recettes (CSV)</button>
    </div>
  </section>
  <div class="adm-stats-grid">
    <section class="adm-item">
      <h2 style="font-size:1.15rem;margin-top:0">Importer vos factures passées</h2>
      <p class="note">Depuis Excel, un fichier CSV ou un export d’un autre logiciel. Une ligne par facture : numéro, date, client, montant, et si possible la date de paiement. Les numéros déjà présents sont ignorés (pas de doublon).</p>
      <div class="adm-actions">
        <label class="btn btn--sombre btn--petit adm-upload">Choisir le fichier…<input type="file" accept=".xlsx,.xls,.csv,.txt" data-fimport="factures" hidden></label>
        <button type="button" class="lien" data-fmodele="factures">Télécharger le modèle Excel</button>
      </div>
    </section>
    <section class="adm-item">
      <h2 style="font-size:1.15rem;margin-top:0">Importer vos achats passés</h2>
      <p class="note">Une ligne par achat : date, fournisseur, désignation, montant (catégorie et mode de paiement facultatifs).</p>
      <div class="adm-actions">
        <label class="btn btn--sombre btn--petit adm-upload">Choisir le fichier…<input type="file" accept=".xlsx,.xls,.csv,.txt" data-fimport="achats" hidden></label>
        <button type="button" class="lien" data-fmodele="achats">Télécharger le modèle Excel</button>
      </div>
    </section>
  </div>
  <div id="fApercu"></div>
  ${lots.length ? `<section class="adm-item"><h2 style="font-size:1.1rem;margin-top:0">Imports réalisés</h2>
    <table class="adm-table"><tbody>${lots.map(l => `<tr><td>${l.date.toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' })}</td><td>${l.f ? `${l.f} facture${l.f > 1 ? 's' : ''}` : ''}${l.a ? `${l.a} achat${l.a > 1 ? 's' : ''}` : ''}</td><td class="num">${euro(l.total)}</td>
      <td><button type="button" class="lien" data-fannulerimport="${esc(l.lot)}" style="color:var(--err)">Annuler cet import</button></td></tr>`).join('')}</tbody></table></section>` : ''}`;
}

/* ---------------- Réglages */
const REGLAGES = [
  ['Conditions', [
    ['invoice_terms', 'Conditions de règlement : particuliers', 'Paiement à réception, par virement, espèces ou carte.', 2],
    ['invoice_terms_pro', 'Conditions de règlement : professionnels', 'Paiement par virement à réception de facture.', 2],
    ['invoice_due_days_pro', 'Délai de paiement des professionnels (jours ; 60 au maximum)', '30'],
    ['invoice_late_text', 'Mention des pénalités de retard (factures aux professionnels)', PENALITES, 3],
    ['invoice_footer', 'Message de fin de facture (facultatif)', 'Merci pour votre confiance !'],
    ['invoice_next', 'Prochain numéro de facture, si vous avez déjà facturé ailleurs cette année (ex : 2026-0024)', ''],
  ]],
  ['Paiement', [
    ['company_iban', 'IBAN affiché sur les factures (facultatif)', ''],
    ['company_bic', 'BIC', ''],
    ['sumup_link', 'Lien de paiement SumUp (facultatif, utilisé si la connexion SumUp ci-dessous n’est pas activée)', ''],
  ]],
  ['Résultats (estimations)', [
    ['social_rate', 'Taux de cotisations sociales + formation (%)', '12,4'],
    ['ca_ceiling', 'Plafond de chiffre d’affaires micro-entreprise (€)', '203100'],
    ['vat_threshold', 'Seuil de franchise de TVA (€)', '85000'],
  ]],
];
function vReglages() {
  const s = C.st.settings || {}, api = C.st.sumup?.api;
  return `<form id="fReglages">
    ${REGLAGES.map(([leg, champs]) => `<fieldset class="adm-fieldset"><legend>${leg}</legend>
      ${champs.map(([k, l, def, rows]) => `<div class="champ"><label for="fs-${k}">${l}</label>${rows ? `<textarea id="fs-${k}" name="${k}" rows="${rows}" placeholder="${esc(def)}">${esc(s[k] || '')}</textarea>` : `<input id="fs-${k}" name="${k}" value="${esc(s[k] || '')}" placeholder="${esc(def)}">`}</div>`).join('')}
      ${leg === 'Résultats (estimations)' ? '<p class="note">Valeurs 2026 pour la vente de marchandises : cotisations 12,3 % + 0,1 % de formation professionnelle (ajoutez 1 % si vous avez choisi le versement libératoire de l’impôt), plafond 203 100 €, franchise de TVA 85 000 €. À vérifier chaque année sur autoentrepreneur.urssaf.fr.</p>' : ''}
    </fieldset>`).join('')}
    <div class="adm-sticky"><button class="btn btn--or" type="submit">Enregistrer les réglages</button></div>
  </form>
  <section class="adm-item adm-canal ${api ? 'adm-canal--on' : ''}">
    <header><h2 style="font-size:1.15rem;margin:0">💳 Paiement par carte SumUp sur les factures</h2><span class="adm-pastille">${api ? '● Connecté' : '○ Non connecté'}</span></header>
    <p>Chaque facture porte un lien et un QR code « Payer en ligne ». ${api ? 'Le client paie le reste à payer par carte ; le paiement est <strong>enregistré automatiquement</strong> sur la facture et vous recevez une alerte.' : 'Une fois SumUp connecté, le paiement est enregistré automatiquement sur la facture.'}</p>
    ${api ? '' : `<ol class="adm-etapes">
      <li>Connectez-vous sur <a href="https://me.sumup.com" target="_blank" rel="noopener">me.sumup.com</a> → <strong>Paramètres → Développeurs → Clés API</strong> et créez une clé (elle commence par <code>sup_sk_</code>). Notez aussi votre <strong>code marchand</strong> (Paramètres → Profil, il commence souvent par M).</li>
      <li>Cloudflare → <strong>Workers et Pages → saveurs-des-rois → Paramètres → Variables et secrets → + Ajouter</strong>, type <strong>Secret</strong> :<br><code>SUMUP_API_KEY</code> = la clé — <code>SUMUP_MERCHANT_CODE</code> = le code marchand.</li>
      <li><strong>Deployments → ⋯ → Retry deployment</strong>, puis rechargez cette page.</li>
      <li>En attendant (ou si SumUp refuse l’accès à l’API pour votre compte) : créez un lien de paiement dans l’appli SumUp et collez-le dans « Lien de paiement SumUp » ci-dessus ou sur une facture.</li></ol>`}
  </section>
  ${blocMail()}`;
}

function blocMail() {
  const m = C.st.mail || {};
  return `<section class="adm-item adm-canal ${m.actif ? 'adm-canal--on' : ''}">
    <header><h2 style="font-size:1.15rem;margin:0">✉️ Envoi des factures par e-mail depuis le site</h2><span class="adm-pastille">${m.actif ? `● Actif (${m.via === 'smtp' ? 'Gmail' : 'Resend'})` : '○ Non configuré'}</span></header>
    <p>Depuis chaque facture : « Envoyer la facture par e-mail » envoie le message <strong>avec le PDF joint</strong>, sans passer par votre messagerie. Les autres solutions (télécharger le PDF, préparer l’e-mail dans votre messagerie, WhatsApp) restent disponibles.</p>
    ${m.actif ? `<p class="adm-meta">Les e-mails partent de <strong>${esc(m.from)}</strong>.</p>
      <div class="adm-actions"><button type="button" class="btn btn--ligne btn--petit" data-fmailtest>M’envoyer un e-mail de test</button></div>`
    : `<p class="adm-sous">Avec votre Gmail (gratuit, sans nom de domaine)</p>
    <ol class="adm-etapes">
      <li>Sur <a href="https://myaccount.google.com/security" target="_blank" rel="noopener">myaccount.google.com → Sécurité</a>, activez la <strong>Validation en deux étapes</strong> (si ce n’est pas déjà fait).</li>
      <li>Ouvrez <a href="https://myaccount.google.com/apppasswords" target="_blank" rel="noopener">Mots de passe des applications</a>, nommez-le « Saveurs des Rois » et cliquez sur <strong>Créer</strong> : notez les 16 lettres affichées.</li>
      <li>Cloudflare → <strong>Workers et Pages → saveurs-des-rois → Paramètres → Variables et secrets → + Ajouter</strong>, type <strong>Secret</strong> :<br><code>SMTP_USER</code> = votre adresse Gmail — <code>SMTP_PASS</code> = les 16 lettres.</li>
      <li><strong>Deployments → ⋯ → Retry deployment</strong>, puis rechargez cette page et envoyez-vous un e-mail de test.</li>
    </ol>
    <p class="note">Les factures partent alors de votre adresse Gmail et apparaissent dans vos « Messages envoyés ». Autre messagerie : ajoutez aussi <code>SMTP_HOST</code> (et <code>SMTP_PORT</code> si différent de 465). Avec un nom de domaine vérifié chez Resend : <code>INVOICE_FROM</code> = factures@votre-domaine.fr suffit (la clé Resend des alertes est réutilisée).</p>
    ${m.resendSansDomaine ? '<p class="note">Votre clé Resend (alertes) ne suffit pas pour écrire à vos clients : sans nom de domaine vérifié, Resend n’envoie qu’à votre propre adresse. Utilisez Gmail ci-dessus.</p>' : ''}`}
  </section>`;
}

/* ================================================================ Boîtes de dialogue */
function dialogue(html, onSubmit) {
  let d = document.getElementById('fDlg');
  if (!d) { d = document.createElement('dialog'); d.id = 'fDlg'; d.className = 'adm-dialog adm-fdlg'; document.body.append(d); }
  d.innerHTML = `<form method="dialog">${html}<p class="message message--err" hidden></p></form>`;
  const form = d.querySelector('form');
  form.addEventListener('submit', async e => {
    if (e.submitter?.value === 'annuler') return;
    e.preventDefault();
    const btn = e.submitter; if (btn) btn.disabled = true;
    try { await onSubmit(new FormData(form), form); d.close(); }
    catch (err) { const p = form.querySelector('.message--err'); p.textContent = err.message; p.hidden = false; }
    finally { if (btn) btn.disabled = false; }
  });
  d.showModal();
  return form;
}
const boutons = ok => `<div class="adm-actions adm-fdlg__btns"><button class="btn btn--ligne btn--petit" value="annuler" formnovalidate>Annuler</button><button class="btn btn--or btn--petit" type="submit">${ok}</button></div>`;
const ouvrir = id => { location.href = `/admin/facture.html?id=${id}`; };

function dlgFacturer(r) {
  const dv = devisDe(r), fs = facturesDe(r);
  const acompteFait = fs.filter(i => i.type === 'acompte' && i.status === 'validée');
  const pct = dv.acompte || 30;
  const montant = Math.round(dv.total * pct / 100);
  const def = acompteFait.length ? 'solde' : dv.acompte ? 'acompte' : 'facture';
  const form = dialogue(`
    <h2>Le client accepte le devis</h2>
    <p class="adm-meta">${esc(dv.numero)} · ${esc(r.name)} · <strong>${euro(dv.total)}</strong>${dv.enregistre ? '' : ' (estimation : préparez d’abord le devis PDF pour reprendre vos prix exacts)'}</p>
    <fieldset class="adm-fdlg__choix">
      <legend>Que voulez-vous créer ?</legend>
      <label><input type="radio" name="type" value="acompte" ${def === 'acompte' ? 'checked' : ''}> <span><strong>Facture d’acompte</strong>, puis la facture de solde au retrait<br><small>Conseillé quand un acompte est versé à la commande.</small></span></label>
      <label><input type="radio" name="type" value="facture" ${def === 'facture' ? 'checked' : ''}> <span><strong>Facture complète</strong>${dv.total ? ` (${euro(dv.total)})` : ''}<br><small>Commande payée en une fois, ou acompte déduit du reste à payer.</small></span></label>
      ${acompteFait.length ? `<label><input type="radio" name="type" value="solde" ${def === 'solde' ? 'checked' : ''}> <span><strong>Facture de solde</strong> : ${euro(dv.total)} − acompte ${acompteFait.map(a => esc(a.number)).join(', ')} = ${euro(dv.total - acompteFait.reduce((t, a) => t + a.total_cents, 0))}</span></label>` : ''}
    </fieldset>
    <div class="adm-fdlg__acompte">
      <div class="deux">
        <div class="champ"><label>Montant de l’acompte (€)</label><input name="acompte" inputmode="decimal" value="${prixTxt(montant)}"><small class="adm-meta">${pct} % du devis</small></div>
        <label class="adm-check" style="align-self:center"><input type="checkbox" name="recu" ${dv.acompte || def === 'acompte' ? 'checked' : ''}> Acompte déjà reçu</label>
      </div>
      <div class="deux adm-fdlg__recu">
        <div class="champ"><label>Reçu le</label><input type="date" name="date" value="${aujourdhui()}"></div>
        <div class="champ"><label>Mode de paiement</label><select name="method">${METHODES.map(m => `<option>${m}</option>`).join('')}</select></div>
      </div>
    </div>
    <p class="note">Un brouillon s’ouvre : vérifiez-le, puis cliquez sur « Valider et numéroter » pour lui donner son numéro définitif.</p>
    ${boutons('Créer la facture')}`,
  async fd => {
    const type = fd.get('type');
    const acompte = Math.round(nb(fd.get('acompte')) * 100);
    const recu = fd.has('recu') && type !== 'solde';
    if (type === 'acompte' && !(acompte > 0)) throw new Error('Indiquez le montant de l’acompte.');
    const res = await C.api('/api/admin/invoices', { method: 'POST', body: {
      mode: 'demande', request_id: r.id, type, deposit_cents: type === 'solde' ? 0 : recu || type === 'acompte' ? acompte : 0,
      paid: recu && acompte > 0 ? { date: fd.get('date'), method: fd.get('method') } : null,
    } });
    ouvrir(res.id);
  });
  const maj = () => {
    const t = form.elements.type.value;
    form.querySelector('.adm-fdlg__acompte').hidden = t === 'solde';
    form.querySelector('.adm-fdlg__recu').hidden = !form.elements.recu.checked;
    form.querySelector('.adm-fdlg__acompte .adm-check').lastChild.textContent = t === 'facture' ? ' Acompte déjà reçu (déduit du reste à payer)' : ' Acompte déjà reçu';
  };
  form.addEventListener('change', maj); maj();
}

function dlgEncaisser(i) {
  dialogue(`<h2>Paiement reçu</h2>
    <p class="adm-meta">${esc(i.number)} · ${esc(i.client?.societe || i.client?.nom || '')} · reste ${euro(reste(i))}</p>
    <div class="deux"><div class="champ"><label>Montant (€)</label><input name="montant" inputmode="decimal" required value="${prixTxt(reste(i))}"></div>
    <div class="champ"><label>Date</label><input name="date" type="date" required value="${aujourdhui()}"></div></div>
    <div class="champ"><label>Mode de paiement</label><select name="method">${METHODES.map(m => `<option>${m}</option>`).join('')}</select></div>
    ${boutons('Enregistrer le paiement')}`,
  async fd => {
    const montant = Math.round(nb(fd.get('montant')) * 100);
    if (!(montant > 0)) throw new Error('Indiquez le montant.');
    await C.api(`/api/admin/invoices/${i.id}/payments`, { method: 'POST', body: { amount_cents: montant, date: fd.get('date'), method: fd.get('method') } });
    await chargerFactures(); C.render(); C.toast('Paiement enregistré.');
  });
}

function dlgManuelle() {
  const pros = (C.st.pros || []).filter(p => p.status === 'actif');
  dialogue(`<h2>Facture sans devis</h2>
    <fieldset class="adm-fdlg__choix"><legend>Client</legend>
      <label><input type="radio" name="qui" value="part" checked> <span><strong>Particulier</strong> (vente directe, marché, commande par téléphone…)</span></label>
      <label><input type="radio" name="qui" value="pro"> <span><strong>Professionnel</strong></span></label>
    </fieldset>
    <div class="champ adm-fdlg__pro" hidden><label>Client professionnel</label><select name="pro_id"><option value="">Autre (à saisir sur la facture)</option>${pros.map(p => `<option value="${p.id}">${esc(p.company)}</option>`).join('')}</select></div>
    ${boutons('Créer le brouillon')}`,
  async fd => {
    const pro = fd.get('qui') === 'pro';
    const r = await C.api('/api/admin/invoices', { method: 'POST', body: { mode: 'manuel', is_pro: pro, pro_id: pro ? +fd.get('pro_id') || null : null } });
    ouvrir(r.id);
  }).addEventListener('change', e => { if (e.target.name === 'qui') document.querySelector('.adm-fdlg__pro').hidden = e.target.value !== 'pro'; });
}

function dlgMensuelle() {
  const pros = (C.st.pros || []).filter(p => p.status === 'actif' || (C.st.requests || []).some(r => r.pro_id === p.id));
  if (!pros.length) return C.toast('Aucun client professionnel pour l’instant.');
  const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 1);
  const moisDef = d.toISOString().slice(0, 7);
  const deja = new Set(D().invoices.filter(i => i.type !== 'avoir').flatMap(i => i.request_ids || []));
  const form = dialogue(`<h2>Facture mensuelle d’un professionnel</h2>
    <p class="note" style="margin-top:0">Regroupe toutes les commandes d’un client pro sur un mois en une seule facture.</p>
    <div class="deux">
      <div class="champ"><label>Client</label><select name="pro">${pros.map(p => `<option value="${p.id}">${esc(p.company)}</option>`).join('')}</select></div>
      <div class="champ"><label>Mois</label><input type="month" name="mois" value="${moisDef}"></div>
    </div>
    <div id="fCommandes"></div>
    ${boutons('Créer la facture')}`,
  async (fd, f) => {
    const ids = [...f.querySelectorAll('[name=cmd]:checked')].map(x => +x.value);
    if (!ids.length) throw new Error('Cochez au moins une commande.');
    const [a, m] = fd.get('mois').split('-');
    const r = await C.api('/api/admin/invoices', { method: 'POST', body: { mode: 'groupe', request_ids: ids, label: `Commandes de ${MOIS[+m - 1]} ${a}` } });
    ouvrir(r.id);
  });
  const lister = () => {
    const pro = +form.elements.pro.value, mois = form.elements.mois.value;
    const cmds = (C.st.requests || []).filter(r => r.pro_id === pro && r.kind === 'devis' && !deja.has(r.id)
      && ((r.event_date && /^\d{4}-\d{2}/.test(r.event_date) ? r.event_date : r.created_at) || '').startsWith(mois));
    form.querySelector('#fCommandes').innerHTML = cmds.length
      ? `<p class="adm-sous">Commandes non encore facturées</p>${cmds.map(r => { const dv = devisDe(r); return `<label class="adm-check"><input type="checkbox" name="cmd" value="${r.id}" ${['confirmé', 'devis envoyé', 'archivé'].includes(r.status) ? 'checked' : ''}> ${dateCourte(r.event_date || r.created_at)} · ${esc(dv.numero)} · ${euro(dv.total)} <small class="adm-meta">(${esc(r.status)})</small></label>`; }).join('')}`
      : '<p class="vide">Aucune commande non facturée pour ce client sur ce mois.</p>';
  };
  form.addEventListener('change', e => { if (['pro', 'mois'].includes(e.target.name)) lister(); });
  lister();
}

function dlgAchat(e) { C.st.fEditAchat = e.id; C.render(); document.getElementById('fAchat')?.scrollIntoView({ behavior: 'smooth' }); }

/* ================================================================ Excel (SheetJS, chargé à la demande) */
async function xlsx() {
  if (window.XLSX) return window.XLSX;
  await new Promise((ok, ko) => { const s = document.createElement('script'); s.src = '/admin/vendor/xlsx.mini.min.js?v=3.7'; s.onload = ok; s.onerror = () => ko(new Error('Module Excel indisponible : rechargez la page.')); document.head.append(s); });
  return window.XLSX;
}
const jourDate = iso => (iso ? new Date(iso.slice(0, 10) + 'T12:00:00') : '');
const eurNb = c => Math.round(c) / 100;
function feuille(X, lignes, largeurs, colsMontant = [], colsDate = []) {
  // Dates converties en numéros de série Excel (jour seul, sans heure ni décalage horaire)
  const serie = d => (Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - Date.UTC(1899, 11, 30)) / 86400000;
  const ws = X.utils.aoa_to_sheet(lignes.map(l => l.map(v => (v instanceof Date ? serie(v) : v))));
  ws['!cols'] = largeurs.map(w => ({ wch: w }));
  const plage = X.utils.decode_range(ws['!ref'] || 'A1');
  for (let r = 1; r <= plage.e.r; r++) {
    colsMontant.forEach(c => { const cell = ws[X.utils.encode_cell({ r, c })]; if (cell && cell.t === 'n') cell.z = '#,##0.00 "€"'; });
    colsDate.forEach(c => { const cell = ws[X.utils.encode_cell({ r, c })]; if (cell && (cell.t === 'd' || cell.t === 'n')) cell.z = 'dd/mm/yyyy'; });
  }
  return ws;
}
function donneesExport(an) {
  const a = String(an);
  const fact = valides().filter(i => i.issue_date?.startsWith(a)).sort((x, y) => x.issue_date.localeCompare(y.issue_date) || String(x.number).localeCompare(String(y.number)));
  const journal = [['Date', 'Numéro', 'Type', 'Client', 'Société', 'SIRET client', 'Client pro', 'Total', 'Acompte déduit', 'Net facturé', 'Encaissé', 'Reste à payer', 'Statut', 'Échéance', 'Réf. devis', 'Origine'],
    ...fact.map(i => [jourDate(i.issue_date), i.number, TYPES[i.type], i.client?.nom || '', i.client?.societe || '', i.client?.siret || '', i.is_pro ? 'oui' : 'non',
      eurNb(i.total_cents), eurNb(i.deduct_cents || 0), eurNb(net(i)), eurNb(i.paid_cents || 0), eurNb(i.type === 'avoir' ? 0 : Math.max(0, reste(i))), ETATS[i.state] || i.state,
      jourDate(i.due_date), i.quote_ref || '', i.source === 'import' ? 'importée' : 'site'])];
  const lignes = [['Numéro', 'Date', 'Client', 'Désignation', 'Précision', 'Quantité', 'Unité', 'Prix unitaire', 'Montant'],
    ...fact.flatMap(i => (i.lines || []).map(l => [i.number, jourDate(i.issue_date), i.client?.societe || i.client?.nom || '', l.label, l.detail || '', l.qty, l.unit === 'pc' ? 'pièce' : l.unit,
      eurNb(l.prix), eurNb((i.type === 'avoir' ? -1 : 1) * Math.round(l.qty * l.prix))]))];
  const rec = recettes(an);
  const recLignes = [['Date d’encaissement', 'Référence de la facture', 'Client', 'Nature de la recette', 'Mode de règlement', 'Montant'],
    ...rec.map(p => [jourDate(p.date), p.inv.number, p.inv.client?.societe || p.inv.client?.nom || '', nature(p.inv), p.method || '', eurNb(p.amount_cents)]),
    ['', '', '', '', 'Total', eurNb(rec.reduce((t, p) => t + p.amount_cents, 0))]];
  const ach = D().expenses.filter(e => e.date.startsWith(a)).sort((x, y) => x.date.localeCompare(y.date));
  const achLignes = [['Date', 'Fournisseur', 'Catégorie', 'Désignation', 'Mode de paiement', 'Montant'],
    ...ach.map(e => [jourDate(e.date), e.supplier || '', e.category || '', e.label || '', e.method || '', eurNb(e.amount_cents)]),
    ['', '', '', '', 'Total', eurNb(ach.reduce((t, e) => t + e.amount_cents, 0))]];
  const { mois, total } = resultats(an);
  const resLignes = [['Mois', 'Facturé', 'Encaissé (à déclarer)', 'Achats', `Cotisations estimées (${String(taux()).replace('.', ',')} %)`, 'Résultat estimé'],
    ...mois.map(m => [`${m.nom} ${an}`, eurNb(m.facture), eurNb(m.encaisse), eurNb(m.achats), eurNb(m.cotis), eurNb(m.resultat)]),
    [`Total ${an}`, eurNb(total.facture), eurNb(total.encaisse), eurNb(total.achats), eurNb(total.cotis), eurNb(total.resultat)]];
  return { journal, lignes, recLignes, achLignes, resLignes };
}
function telecharger(nom, contenu, type) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([contenu], { type }));
  a.download = nom; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 3000);
}
function csv(lignes) {
  const cel = v => { if (v instanceof Date) v = v.toLocaleDateString('fr-FR'); else if (typeof v === 'number') v = String(v).replace('.', ','); const t = String(v ?? ''); return /[;"\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
  return '﻿' + lignes.map(l => l.map(cel).join(';')).join('\r\n');
}
async function exporter(quoi) {
  const an = annee(), d = donneesExport(an);
  if (quoi === 'journal-csv') return telecharger(`journal-factures-${an}.csv`, csv(d.journal), 'text/csv;charset=utf-8');
  if (quoi === 'recettes-csv') return telecharger(`livre-des-recettes-${an}.csv`, csv(d.recLignes), 'text/csv;charset=utf-8');
  const X = await xlsx(), wb = X.utils.book_new();
  if (quoi === 'tout' || quoi === 'recettes') X.utils.book_append_sheet(wb, feuille(X, d.recLignes, [14, 16, 26, 30, 18, 12], [5], [0]), `Livre des recettes ${an}`);
  if (quoi === 'tout' || quoi === 'achats') X.utils.book_append_sheet(wb, feuille(X, d.achLignes, [12, 22, 22, 32, 16, 12], [5], [0]), `Registre des achats ${an}`);
  if (quoi === 'tout') {
    X.utils.book_append_sheet(wb, feuille(X, d.journal, [12, 14, 9, 22, 22, 16, 9, 11, 11, 11, 11, 11, 11, 12, 18, 10], [7, 8, 9, 10, 11], [0, 13]), `Factures ${an}`);
    X.utils.book_append_sheet(wb, feuille(X, d.lignes, [14, 12, 22, 30, 30, 9, 7, 11, 11], [7, 8], [1]), 'Lignes');
    X.utils.book_append_sheet(wb, feuille(X, d.resLignes, [18, 12, 18, 12, 22, 14], [1, 2, 3, 4, 5]), `Résultats ${an}`);
  }
  const noms = { tout: `comptabilite-saveurs-des-rois-${an}.xlsx`, recettes: `livre-des-recettes-${an}.xlsx`, achats: `registre-des-achats-${an}.xlsx` };
  X.writeFile(wb, noms[quoi]);
}

/* ================================================================ Import */
const CHAMPS = {
  factures: [
    ['number', 'Numéro de facture', true, ['numero', 'n', 'no', 'num', 'facture', 'n facture', 'numero facture', 'reference', 'ref', 'piece', 'numero de facture']],
    ['issue_date', 'Date de la facture', true, ['date', 'date facture', 'date d emission', 'emise le', 'date de facture', 'date de la facture']],
    ['client', 'Client', false, ['client', 'nom', 'nom client', 'destinataire', 'nom du client']],
    ['societe', 'Société', false, ['societe', 'entreprise', 'raison sociale']],
    ['amount', 'Montant', true, ['montant', 'total', 'total ttc', 'ttc', 'montant ttc', 'net a payer', 'prix', 'total facture', 'montant total']],
    ['paid_date', 'Date de paiement', false, ['date paiement', 'date de paiement', 'payee le', 'paye le', 'encaissement', 'date encaissement', 'date d encaissement', 'reglee le', 'date de reglement']],
    ['paid', 'Payée (oui / non)', false, ['payee', 'paye', 'statut', 'etat', 'regle', 'reglee', 'encaisse', 'paiement']],
    ['method', 'Mode de paiement', false, ['mode', 'mode de paiement', 'reglement', 'moyen de paiement', 'mode de reglement']],
    ['label', 'Désignation', false, ['designation', 'description', 'objet', 'libelle', 'detail', 'produits', 'commande']],
    ['type', 'Type (facture / avoir)', false, ['type', 'nature', 'type de document']],
    ['is_pro', 'Client professionnel (oui / non)', false, ['pro', 'professionnel', 'client pro', 'b2b']],
    ['siret', 'SIRET du client', false, ['siret', 'siren']],
  ],
  achats: [
    ['date', 'Date', true, ['date', 'date achat', 'date d achat', 'jour']],
    ['supplier', 'Fournisseur', false, ['fournisseur', 'magasin', 'enseigne', 'vendeur', 'commercant']],
    ['label', 'Désignation', false, ['designation', 'libelle', 'description', 'objet', 'article', 'produit', 'detail']],
    ['category', 'Catégorie', false, ['categorie', 'nature', 'type', 'poste']],
    ['amount', 'Montant', true, ['montant', 'total', 'ttc', 'prix', 'montant ttc', 'total ttc', 'cout']],
    ['method', 'Mode de paiement', false, ['mode', 'mode de paiement', 'reglement', 'moyen de paiement']],
    ['note', 'Note', false, ['note', 'remarque', 'commentaire']],
  ],
};
const normal = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

function lireCsv(texte) {
  const premiere = texte.split(/\r?\n/).find(l => l.trim()) || '';
  const sep = [';', '\t', ','].map(s => [s, premiere.split(s).length]).sort((a, b) => b[1] - a[1])[0][0];
  const lignes = []; let ligne = [], cel = '', guill = false;
  for (let i = 0; i < texte.length; i++) {
    const c = texte[i];
    if (guill) { if (c === '"' && texte[i + 1] === '"') { cel += '"'; i++; } else if (c === '"') guill = false; else cel += c; }
    else if (c === '"') guill = true;
    else if (c === sep) { ligne.push(cel); cel = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && texte[i + 1] === '\n') i++; ligne.push(cel); lignes.push(ligne); ligne = []; cel = ''; }
    else cel += c;
  }
  if (cel || ligne.length) { ligne.push(cel); lignes.push(ligne); }
  return lignes;
}
async function lireFichier(file) {
  if (/\.(csv|txt)$/i.test(file.name)) {
    const buf = await file.arrayBuffer();
    let texte = new TextDecoder('utf-8').decode(buf);
    if (texte.includes('�')) texte = new TextDecoder('windows-1252').decode(buf); // CSV Excel « Windows »
    return lireCsv(texte.replace(/^﻿/, ''));
  }
  const X = await xlsx();
  const wb = X.read(await file.arrayBuffer(), { cellDates: true });
  return X.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true, defval: '' });
}
function versDate(v) {
  if (v instanceof Date && !isNaN(v)) return new Date(v.getTime() + 12 * 3600_000).toISOString().slice(0, 10);
  if (typeof v === 'number' && v > 20000 && v < 80000) return new Date(Date.UTC(1899, 11, 30) + v * 86400_000).toISOString().slice(0, 10);
  const s = String(v ?? '').trim();
  let m;
  if ((m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/))) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  if ((m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/))) { const a = m[3].length === 2 ? '20' + m[3] : m[3]; return `${a}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`; }
  return null;
}
function versCentimes(v) {
  if (typeof v === 'number') return Math.round(v * 100);
  let s = String(v ?? '').replace(/[\s  €]|EUR/gi, '');
  if (!s) return null;
  const neg = /^\(.*\)$/.test(s) || s.startsWith('-');
  s = s.replace(/[()\-+]/g, '');
  const dv = Math.max(s.lastIndexOf(','), s.lastIndexOf('.'));
  if (dv >= 0 && s.length - dv - 1 <= 2) s = s.slice(0, dv).replace(/[.,]/g, '') + '.' + s.slice(dv + 1);
  else s = s.replace(/[.,]/g, '');
  const n = parseFloat(s);
  return Number.isFinite(n) ? Math.round(n * 100) * (neg ? -1 : 1) : null;
}
const oui = v => /^(oui|o|yes|y|x|1|true|vrai|payee?|reglee?|encaissee?|soldee?)$/i.test(normal(v).replace(/\s/g, ''));

let IMPORT = null; // { kind, entetes, lignes, map }
async function preparerImport(kind, file) {
  const brut = (await lireFichier(file)).filter(l => l.some(c => String(c ?? '').trim() !== ''));
  if (brut.length < 2) throw new Error('Le fichier semble vide (il faut une ligne de titres puis une ligne par élément).');
  const entetes = brut[0].map(h => String(h ?? '').trim());
  const map = {};
  for (const [k, , , syn] of CHAMPS[kind]) {
    const idx = entetes.findIndex(h => syn.includes(normal(h)));
    const idx2 = idx >= 0 ? idx : entetes.findIndex(h => syn.some(s => s.length > 3 && normal(h).includes(s)));
    if (idx2 >= 0 && !Object.values(map).includes(idx2)) map[k] = idx2;
  }
  IMPORT = { kind, entetes, lignes: brut.slice(1), map, nom: file.name };
  afficherApercu();
}
function convertir() {
  const { kind, lignes, map } = IMPORT;
  const val = (l, k) => (map[k] >= 0 ? l[map[k]] : '');
  return lignes.map(l => {
    if (kind === 'achats') {
      const montant = versCentimes(val(l, 'amount'));
      const cat = String(val(l, 'category') || '').trim();
      return { date: versDate(val(l, 'date')), supplier: String(val(l, 'supplier') || '').trim(), label: String(val(l, 'label') || '').trim(),
        category: CATEGORIES.find(c => normal(c) === normal(cat)) || cat || 'Matières premières', amount_cents: montant == null ? null : Math.abs(montant),
        method: String(val(l, 'method') || '').trim(), note: String(val(l, 'note') || '').trim() };
    }
    const montant = versCentimes(val(l, 'amount'));
    const datePay = versDate(val(l, 'paid_date'));
    const typ = normal(val(l, 'type'));
    const avoir = /avoir|credit/.test(typ) || (montant ?? 0) < 0;
    return { number: String(val(l, 'number') ?? '').trim(), issue_date: versDate(val(l, 'issue_date')), client: String(val(l, 'client') || '').trim(),
      societe: String(val(l, 'societe') || '').trim(), siret: String(val(l, 'siret') || '').trim(), amount_cents: montant == null ? null : avoir ? -Math.abs(montant) : Math.abs(montant),
      type: avoir ? 'avoir' : 'facture', paid_date: datePay, paid: Boolean(datePay) || (map.paid >= 0 && oui(val(l, 'paid'))),
      method: String(val(l, 'method') || '').trim(), label: String(val(l, 'label') || '').trim(), is_pro: map.is_pro >= 0 && oui(val(l, 'is_pro')) };
  });
}
function afficherApercu() {
  const z = document.getElementById('fApercu'); if (!z || !IMPORT) return;
  const { kind, entetes, map } = IMPORT;
  const rows = convertir();
  const valide = r => kind === 'achats' ? r.date && r.amount_cents : r.number && r.issue_date && r.amount_cents;
  const existants = new Set(D().invoices.map(i => i.number).filter(Boolean));
  const ok = rows.filter(valide), doublons = kind === 'factures' ? ok.filter(r => existants.has(r.number)).length : 0;
  const total = ok.reduce((t, r) => t + (r.amount_cents || 0), 0);
  const manque = CHAMPS[kind].filter(([k, , req]) => req && !(map[k] >= 0)).map(([, l]) => l);
  const cols = kind === 'achats' ? [['date', 'Date', r => dateCourte(r.date)], ['supplier', 'Fournisseur', r => esc(r.supplier)], ['label', 'Désignation', r => esc(r.label)], ['category', 'Catégorie', r => esc(r.category)], ['amount', 'Montant', r => euro(r.amount_cents)]]
    : [['number', 'N°', r => esc(r.number)], ['date', 'Date', r => dateCourte(r.issue_date)], ['client', 'Client', r => esc(r.societe || r.client)], ['amount', 'Montant', r => euro(r.amount_cents)], ['paid', 'Payée', r => r.paid ? `oui${r.paid_date ? ' le ' + dateCourte(r.paid_date) : ''}` : 'non']];
  z.innerHTML = `<section class="adm-item adm-import">
    <h2 style="font-size:1.15rem;margin-top:0">Vérification : ${esc(IMPORT.nom)}</h2>
    <p class="note">Indiquez quelle colonne de votre fichier correspond à chaque information (détecté automatiquement quand c’est possible).</p>
    <div class="adm-import__map">${CHAMPS[kind].map(([k, l, req]) => `<div class="champ"><label>${l}${req ? ' *' : ''}</label><select data-fmap="${k}"><option value="-1">— aucune —</option>${entetes.map((h, i) => `<option value="${i}" ${map[k] === i ? 'selected' : ''}>${esc(h || `Colonne ${i + 1}`)}</option>`).join('')}</select></div>`).join('')}</div>
    ${manque.length ? `<p class="message message--err">Colonne obligatoire à choisir : ${manque.join(', ')}.</p>` : ''}
    <p><strong>${ok.length}</strong> ligne${ok.length > 1 ? 's' : ''} prête${ok.length > 1 ? 's' : ''} à importer (${euro(total)})${rows.length - ok.length ? ` · ${rows.length - ok.length} incomplète${rows.length - ok.length > 1 ? 's' : ''} ignorée${rows.length - ok.length > 1 ? 's' : ''}` : ''}${doublons ? ` · ${doublons} déjà présente${doublons > 1 ? 's' : ''} (ignorée${doublons > 1 ? 's' : ''})` : ''}.</p>
    <div class="adm-table-scroll"><table class="adm-table"><thead><tr>${cols.map(c => `<th>${c[1]}</th>`).join('')}</tr></thead>
      <tbody>${rows.slice(0, 8).map(r => `<tr class="${valide(r) ? '' : 'adm-ko'}">${cols.map(c => `<td>${c[2](r) || '—'}</td>`).join('')}</tr>`).join('')}</tbody></table></div>
    ${rows.length > 8 ? `<p class="note">… et ${rows.length - 8} autres lignes.</p>` : ''}
    <div class="adm-actions"><button type="button" class="btn btn--or" data-fimporter ${ok.length && !manque.length ? '' : 'disabled'}>Importer ${ok.length - doublons} ${kind === 'achats' ? 'achat' : 'facture'}${ok.length - doublons > 1 ? 's' : ''}</button><button type="button" class="lien" data-fannulerapercu>Annuler</button></div>
    ${kind === 'factures' ? '<p class="note">Les factures importées sont enregistrées telles quelles (numéro d’origine, déjà émises) et comptent dans vos encaissements et résultats. Un import peut être annulé en entier.</p>' : ''}
  </section>`;
  z.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
async function modele(kind) {
  const X = await xlsx(), wb = X.utils.book_new();
  const data = kind === 'achats'
    ? [['Date', 'Fournisseur', 'Désignation', 'Catégorie', 'Montant', 'Mode de paiement'], [jourDate('2026-01-08'), 'Metro', 'Amandes 5 kg', 'Matières premières', 54.9, 'Carte'], [jourDate('2026-01-12'), 'Emballages Pro', 'Coffrets dorés x50', 'Emballages et coffrets', 37.5, 'Virement']]
    : [['Numéro', 'Date', 'Client', 'Société', 'Montant', 'Date de paiement', 'Mode de paiement', 'Désignation'], ['FA-2026-0001', jourDate('2026-01-15'), 'Nadia R.', '', 120, jourDate('2026-01-15'), 'Espèces', 'Plateau 150 pièces'], ['FA-2026-0002', jourDate('2026-02-03'), 'Karim B.', 'Salon de thé Atlas', 86.4, '', '', 'Cornes de gazelle 3 kg']];
  X.utils.book_append_sheet(wb, feuille(X, data, kind === 'achats' ? [12, 18, 26, 22, 10, 16] : [14, 12, 18, 20, 10, 16, 16, 28], [4], kind === 'achats' ? [0] : [1, 5]), kind === 'achats' ? 'Achats' : 'Factures');
  X.writeFile(wb, kind === 'achats' ? 'modele-import-achats.xlsx' : 'modele-import-factures.xlsx');
}

/* ================================================================ Événements */
function lier() {
  const panel = document.getElementById('panel');
  panel.addEventListener('click', e => {
    const t = e.target, q = s => t.closest(s);
    let el;
    if ((el = q('[data-facturer]'))) { const r = C.st.requests.find(x => x.id === +el.dataset.facturer); if (r) dlgFacturer(r); return; }
    if ((el = q('[data-fvue]'))) { C.st.fVue = el.dataset.fvue; C.st.fEditAchat = null; if (C.st.tab !== 'factures') document.querySelector('[data-tab="factures"]').click(); else C.render(); return; }
    if ((el = q('[data-fnouvelle]'))) return el.dataset.fnouvelle === 'manuelle' ? dlgManuelle() : dlgMensuelle();
    if ((el = q('[data-fencaisser]'))) { const i = D().invoices.find(x => x.id === +el.dataset.fencaisser); if (i) dlgEncaisser(i); return; }
    if ((el = q('[data-fexport]'))) return C.run(() => exporter(el.dataset.fexport));
    if ((el = q('[data-fmodele]'))) return C.run(() => modele(el.dataset.fmodele));
    if ((el = q('[data-feditachat]'))) { const x = D().expenses.find(y => y.id === +el.dataset.feditachat); if (x) dlgAchat(x); return; }
    if (q('[data-fannuleachat]')) { C.st.fEditAchat = null; C.render(); return; }
    if ((el = q('[data-fdelachat]')) && confirm('Supprimer cet achat du registre ?')) return C.run(async () => { await C.api(`/api/admin/expenses/${el.dataset.fdelachat}`, { method: 'DELETE' }); await chargerFactures(); C.render(); }, 'Achat supprimé.');
    if (q('[data-fmailtest]')) return C.run(async () => { const r = await C.api('/api/admin/mail-test', { method: 'POST', body: {} }); C.toast(`E-mail de test envoyé à ${r.to} : vérifiez votre boîte de réception.`); });
    if (q('[data-fannulerapercu]')) { IMPORT = null; document.getElementById('fApercu').innerHTML = ''; return; }
    if (q('[data-fimporter]')) return C.run(async () => {
      const rows = convertir();
      const r = await C.api('/api/admin/import', { method: 'POST', body: { kind: IMPORT.kind, rows } });
      IMPORT = null; await chargerFactures(); C.render();
      C.toast(`Import terminé : ${r.importees} ${r.importees > 1 ? 'éléments importés' : 'élément importé'}${r.doublons ? `, ${r.doublons} déjà présent${r.doublons > 1 ? 's' : ''}` : ''}.`);
    });
    if ((el = q('[data-fannulerimport]')) && confirm('Annuler cet import ? Toutes les factures (et leurs paiements) ou tous les achats de cet import seront supprimés.')) return C.run(async () => {
      await C.api(`/api/admin/import/${el.dataset.fannulerimport}`, { method: 'DELETE' }); await chargerFactures(); C.render();
    }, 'Import annulé.');
  });
  panel.addEventListener('change', e => {
    const t = e.target;
    if (t.id === 'fAnnee') { C.st.fAnnee = +t.value; C.render(); }
    if (t.id === 'fFiltre') { C.st.fFiltre = t.value; C.render(); }
    if (t.dataset.fmap && IMPORT) { const v = +t.value; for (const k in IMPORT.map) if (IMPORT.map[k] === v && k !== t.dataset.fmap) delete IMPORT.map[k]; if (v >= 0) IMPORT.map[t.dataset.fmap] = v; else delete IMPORT.map[t.dataset.fmap]; afficherApercu(); }
    if (t.dataset.fimport && t.files[0]) { const f = t.files[0]; t.value = ''; C.run(() => preparerImport(t.dataset.fimport, f)); }
  });
  panel.addEventListener('input', e => {
    if (e.target.id === 'fCherche') {
      C.st.fCherche = e.target.value;
      clearTimeout(lier.t); lier.t = setTimeout(() => { const pos = e.target.selectionStart; C.render(); const s = document.getElementById('fCherche'); s.focus(); s.setSelectionRange(pos, pos); }, 250);
    }
  });
  panel.addEventListener('submit', e => {
    const form = e.target;
    if (form.id === 'fAchat') {
      e.preventDefault();
      const fd = Object.fromEntries(new FormData(form));
      return C.run(async () => {
        const body = { ...fd, amount_cents: Math.round(nb(fd.montant) * 100) };
        if (!(body.amount_cents > 0)) throw new Error('Indiquez le montant.');
        const id = form.dataset.id;
        await C.api(id ? `/api/admin/expenses/${id}` : '/api/admin/expenses', { method: id ? 'PUT' : 'POST', body });
        C.st.fEditAchat = null; await chargerFactures(); C.render();
      }, 'Achat enregistré.');
    }
    if (form.id === 'fReglages') {
      e.preventDefault();
      const data = Object.fromEntries(new FormData(form));
      const j = parseInt(data.invoice_due_days_pro, 10);
      if (data.invoice_due_days_pro && !(j >= 0 && j <= 60)) return C.toast('Le délai de paiement entre professionnels est de 60 jours au maximum.');
      return C.run(async () => { await C.api('/api/admin/settings', { method: 'PUT', body: data }); Object.assign(C.st.settings, data); C.render(); }, 'Réglages enregistrés.');
    }
  });
}
