/* Saveurs des Rois — tableau de bord (onglet Accueil de l'administration) */

let C; // { api, st, render }
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const euro = c => ((c || 0) / 100).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' });
const euroRond = c => ((c || 0) / 100).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
const jour = (d = new Date()) => d.toLocaleDateString('sv-SE', { timeZone: 'Europe/Paris' });
const plusJours = (iso, n) => { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return jour(d); };
const MOIS_COURTS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const maj = t => t.charAt(0).toUpperCase() + t.slice(1);

export function initAccueil(ctx) {
  C = ctx;
  document.getElementById('panel').addEventListener('click', e => {
    const el = e.target.closest('[data-dgoto]');
    if (!el) return;
    const [tab, opt] = el.dataset.dgoto.split(':');
    if (tab === 'factures') { C.st.fVue = 'factures'; C.st.fFiltre = opt || 'toutes'; }
    if (tab === 'demandes' && opt) C.st.filter = opt;
    if (tab === 'pros' && opt) C.st.filtrePro = opt;
    if (tab === 'avis') C.st.avisFiltre = 'en attente';
    document.querySelector(`[data-tab="${tab}"]`)?.click();
    window.scrollTo({ top: 0 });
  });
}

const valides = () => (C.st.f?.invoices || []).filter(i => i.status === 'validée');
const net = i => i.total_cents - (i.deduct_cents || 0);
const reste = i => net(i) - (i.paid_cents || 0);
function quandTxt(iso, today) {
  if (iso === today) return 'Aujourd’hui';
  if (iso === plusJours(today, 1)) return 'Demain';
  return maj(new Date(iso + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' }));
}
function lignesCommande(r) {
  let q = r.quote;
  if (typeof q === 'string') { try { q = JSON.parse(q); } catch { q = null; } }
  if (q?.lignes?.length) return q.lignes.filter(l => l.s !== 'frais').map(l => ({ id: l.pid || l.label, nom: l.label, qty: l.qty, kg: l.kg }));
  return (r.items || []).map(i => ({ id: i.id, nom: i.name, qty: i.qty, kg: i.unit === 'kg' }));
}
const resume = lignes => lignes.map(l => `${l.kg ? `${String(l.qty).replace('.', ',')} kg` : l.qty} ${esc(l.nom)}`).join(' · ');

export function tAccueil() {
  const st = C.st, today = jour(), mois = today.slice(0, 7);
  const dPrec = new Date(today + 'T12:00:00'); dPrec.setDate(1); dPrec.setMonth(dPrec.getMonth() - 1);
  const moisPrec = jour(dPrec).slice(0, 7);
  const v = valides(), ids = new Set(v.map(i => i.id)), pays = (st.f?.payments || []).filter(p => ids.has(p.invoice_id));
  const encMois = pays.filter(p => p.date.startsWith(mois)).reduce((t, p) => t + p.amount_cents, 0);
  // Comparaison à date égale : du 1er au même jour du mois précédent
  const memeJour = `${moisPrec}-${today.slice(8)}`;
  const encPrec = pays.filter(p => p.date.startsWith(moisPrec) && p.date <= memeJour).reduce((t, p) => t + p.amount_cents, 0);
  const evol = encPrec ? Math.round((encMois - encPrec) / encPrec * 100) : null;
  const ouvertes = v.filter(i => i.type !== 'avoir' && reste(i) > 0);
  const retard = ouvertes.filter(i => i.state === 'en retard');
  const reqs = st.requests || [];
  const nouvellesPart = reqs.filter(r => r.status === 'nouveau' && !r.pro_id);
  const nouvellesPro = reqs.filter(r => r.status === 'nouveau' && r.pro_id);
  const accesPro = (st.pros || []).filter(p => p.status === 'en attente');

  // ---- À faire
  const factureDe = r => (st.f?.invoices || []).filter(i => (i.request_ids || []).includes(r.id));
  const aPreparer = reqs.filter(r => r.kind === 'devis' && ['nouveau', 'en cours'].includes(r.status) && !r.quote);
  const ilYa7 = plusJours(today, -7);
  const sansReponse = reqs.filter(r => r.status === 'devis envoyé' && (r.created_at || '').slice(0, 10) <= ilYa7);
  const aFacturer = reqs.filter(r => r.kind === 'devis' && r.status === 'confirmé' && (r.event_date || '') <= plusJours(today, 2)
    && !factureDe(r).some(i => ['facture', 'solde'].includes(i.type)));
  const brouillons = (st.f?.invoices || []).filter(i => i.status === 'brouillon');
  const acceptes = reqs.filter(r => r.accepted_at && !factureDe(r).some(i => i.status === 'validée'));
  const avis = (st.reviews || []).filter(r => r.status === 'en attente');
  let sauvegarde = null; try { sauvegarde = localStorage.getItem('sdr_derniere_sauvegarde'); } catch { }
  const vieilleSauvegarde = !sauvegarde || Date.now() - new Date(sauvegarde) > 30 * 86400000;
  const taches = [
    [acceptes.length, `devis accepté${acceptes.length > 1 ? 's' : ''} en ligne : facture d’acompte à valider`, 'factures:brouillon', 'Valider', true],
    [nouvellesPart.length, `nouvelle${nouvellesPart.length > 1 ? 's' : ''} demande${nouvellesPart.length > 1 ? 's' : ''} de particulier${nouvellesPart.length > 1 ? 's' : ''}`, 'demandes:nouveau', 'Répondre'],
    [nouvellesPro.length, `nouvelle${nouvellesPro.length > 1 ? 's' : ''} demande${nouvellesPro.length > 1 ? 's' : ''} de professionnel${nouvellesPro.length > 1 ? 's' : ''}`, 'pros:nouveau', 'Répondre'],
    [accesPro.length, `demande${accesPro.length > 1 ? 's' : ''} d’accès pro à valider`, 'pros', 'Valider'],
    [aPreparer.length, `devis à préparer`, 'demandes', 'Préparer'],
    [sansReponse.length, `devis envoyé${sansReponse.length > 1 ? 's' : ''} sans réponse depuis plus d’une semaine`, 'demandes:devis envoyé', 'Relancer'],
    [aFacturer.length, `commande${aFacturer.length > 1 ? 's' : ''} confirmée${aFacturer.length > 1 ? 's' : ''} à facturer`, 'demandes:confirmé', 'Facturer'],
    [retard.length, `facture${retard.length > 1 ? 's' : ''} en retard (${euro(retard.reduce((t, i) => t + reste(i), 0))})`, 'factures:en retard', 'Relancer', true],
    [brouillons.length, `brouillon${brouillons.length > 1 ? 's' : ''} de facture à valider`, 'factures:brouillon', 'Compléter'],
    [avis.length, `avis client${avis.length > 1 ? 's' : ''} à valider`, 'avis', 'Voir'],
    [vieilleSauvegarde ? 1 : 0, sauvegarde ? 'sauvegarde de plus d’un mois' : 'aucune sauvegarde depuis cet appareil', 'sauvegarde', 'Sauvegarder', false, true],
  ].filter(([n]) => n);

  // ---- Commandes à venir (14 jours) et production de la semaine
  const fin = plusJours(today, 14), fin7 = plusJours(today, 7);
  const aVenir = reqs.filter(r => r.kind === 'devis' && r.event_date && /^\d{4}-\d{2}-\d{2}$/.test(r.event_date) && r.event_date >= today && r.event_date <= fin && r.status !== 'archivé')
    .sort((a, b) => a.event_date.localeCompare(b.event_date));
  const prod = {};
  aVenir.filter(r => r.status === 'confirmé' && r.event_date <= fin7).forEach(r => lignesCommande(r).forEach(l => {
    const k = l.id || l.nom; const p = (prod[k] ||= { nom: l.nom, pc: 0, kg: 0, cmd: new Set() });
    if (l.kg) p.kg += Number(l.qty) || 0; else p.pc += Number(l.qty) || 0; p.cmd.add(r.id);
  }));
  const production = Object.values(prod).sort((a, b) => b.pc + b.kg * 50 - (a.pc + a.kg * 50));

  // ---- Encaissements sur 6 mois
  const six = [];
  for (let k = 5; k >= 0; k--) { const d = new Date(today + 'T12:00:00'); d.setDate(1); d.setMonth(d.getMonth() - k); const m = jour(d).slice(0, 7); six.push({ m, nom: MOIS_COURTS[+m.slice(5) - 1], v: pays.filter(p => p.date.startsWith(m)).reduce((t, p) => t + p.amount_cents, 0) }); }
  const max = Math.max(1, ...six.map(x => x.v));

  const etatFacture = r => {
    const fs = factureDe(r);
    if (!fs.length) return r.status === 'confirmé' ? '<span class="adm-fstat">à facturer</span>' : '';
    const dues = fs.filter(i => i.status === 'validée' && i.type !== 'avoir');
    const r2 = dues.reduce((t, i) => t + reste(i), 0);
    if (!dues.length) return '<span class="adm-fstat adm-fstat--brouillon">facture en brouillon</span>';
    const fini = fs.some(i => ['facture', 'solde'].includes(i.type));
    return r2 > 0 ? `<span class="adm-fstat">reste ${euro(r2)}</span>` : fini ? '<span class="adm-fstat adm-fstat--payee">payée</span>' : '<span class="adm-fstat adm-fstat--payee">acompte payé</span>';
  };

  return `<div class="adm-bar"><h1 style="margin:0">Tableau de bord</h1><span class="adm-meta adm-date">${maj(new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }))}</span></div>
  <div class="adm-kpis adm-kpis--accueil">
    <button type="button" class="adm-kpi adm-kpi--ok" data-dgoto="factures:toutes"><span>Encaissé en ${MOIS[+mois.slice(5) - 1]}</span><strong>${euroRond(encMois)}</strong><small>${evol === null ? 'premier mois comparé' : `${evol >= 0 ? '▲' : '▼'} ${Math.abs(evol)} % par rapport à ${MOIS[+moisPrec.slice(5) - 1]} à la même date`}</small></button>
    <button type="button" class="adm-kpi" data-dgoto="factures:à encaisser"><span>À encaisser</span><strong>${euroRond(ouvertes.filter(i => i.state !== 'en retard').reduce((t, i) => t + reste(i), 0))}</strong><small>${ouvertes.length - retard.length} facture${ouvertes.length - retard.length > 1 ? 's' : ''}</small></button>
    <button type="button" class="adm-kpi ${retard.length ? 'adm-kpi--err' : ''}" data-dgoto="factures:en retard"><span>En retard</span><strong>${euroRond(retard.reduce((t, i) => t + reste(i), 0))}</strong><small>${retard.length} facture${retard.length > 1 ? 's' : ''}</small></button>
    <button type="button" class="adm-kpi" data-dgoto="demandes:nouveau"><span>Nouvelles demandes</span><strong>${nouvellesPart.length + nouvellesPro.length}</strong><small>${nouvellesPro.length ? `dont ${nouvellesPro.length} pro` : 'particuliers et pros'}</small></button>
  </div>

  <div class="adm-accueil">
    <section class="adm-item adm-afaire">
      <h2>À faire</h2>
      ${taches.length ? `<ul>${taches.map(([n, txt, go, action, urgent, discret]) => `<li class="${urgent ? 'urgent' : ''} ${discret ? 'discret' : ''}">
        <span class="adm-afaire__n">${discret ? '💾' : n}</span><span class="adm-afaire__txt">${txt}</span><button type="button" class="btn btn--ligne btn--petit" data-dgoto="${esc(go)}">${action}</button></li>`).join('')}</ul>`
        : '<p class="adm-ok adm-afaire__rien">✓ Tout est à jour. Profitez-en !</p>'}
    </section>

    <section class="adm-item adm-avenir">
      <h2>Commandes des 14 prochains jours</h2>
      ${aVenir.length ? `<ul>${aVenir.map(r => `<li class="${r.status === 'confirmé' ? '' : 'provisoire'}">
        <div class="adm-avenir__date"><strong>${quandTxt(r.event_date, today)}</strong><small>${esc(r.delivery || '')}</small></div>
        <div class="adm-avenir__corps"><p><strong>${r.pro_id ? `<span class="adm-pro">PRO</span> ${esc((st.pros || []).find(p => p.id === r.pro_id)?.company || r.name)}` : esc(r.name)}</strong>${r.event_type ? ` · ${esc(r.event_type)}` : ''} ${r.status === 'confirmé' ? '' : `<span class="adm-fstat adm-fstat--brouillon">${esc(r.status)}</span>`} ${etatFacture(r)}</p>
          <p class="adm-meta">${resume(lignesCommande(r)) || '—'}</p></div>
        <button type="button" class="lien" data-dgoto="${r.pro_id ? 'pros' : 'demandes'}">Ouvrir</button></li>`).join('')}</ul>`
        : '<p class="vide">Aucune commande prévue dans les 14 prochains jours.</p>'}
    </section>

    <section class="adm-item">
      <h2>À préparer cette semaine</h2>
      <p class="adm-meta" style="margin-top:-.3rem">Commandes confirmées jusqu’au ${new Date(fin7 + 'T12:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}</p>
      ${production.length ? `<table class="adm-table"><thead><tr><th>Pâtisserie</th><th class="num">Pièces</th><th class="num">Kilos</th><th class="num">Commandes</th></tr></thead>
        <tbody>${production.map(p => `<tr><td>${esc(p.nom)}</td><td class="num">${p.pc || ''}</td><td class="num">${p.kg ? String(Math.round(p.kg * 100) / 100).replace('.', ',') : ''}</td><td class="num">${p.cmd.size}</td></tr>`).join('')}</tbody>
        <tfoot><tr><td><strong>Total</strong></td><td class="num"><strong>${production.reduce((t, p) => t + p.pc, 0)}</strong></td><td class="num"><strong>${production.some(p => p.kg) ? String(Math.round(production.reduce((t, p) => t + p.kg, 0) * 100) / 100).replace('.', ',') : ''}</strong></td><td></td></tr></tfoot></table>`
        : '<p class="vide">Rien à préparer pour l’instant (seules les commandes « confirmé » sont comptées).</p>'}
    </section>

    <section class="adm-item">
      <h2>Encaissements des 6 derniers mois</h2>
      <div class="adm-mini">${six.map(x => `<div class="adm-mini__col" title="${x.nom} : ${euro(x.v)}"><span class="adm-mini__val">${x.v ? euroRond(x.v) : ''}</span><div class="adm-mini__barre" style="height:${Math.round(x.v / max * 100)}%"></div><span class="adm-mini__nom">${x.nom}</span></div>`).join('')}</div>
      <div id="accueilVisites" class="adm-visites"><p class="adm-meta">Chargement des visites…</p></div>
    </section>
  </div>`;
}

// Visites : chargées après l'affichage (statistiques sur 14 jours)
export async function apresAccueil() {
  const z = document.getElementById('accueilVisites'); if (!z) return;
  try {
    const d = await C.api('/api/admin/stats?days=14');
    const today = jour(), debut = plusJours(today, -6);
    const somme = (kind, f) => d.rows.filter(r => r.kind === kind && f(r.day)).reduce((t, r) => t + r.n, 0);
    const cette = somme('visite', j => j >= debut), avant = somme('visite', j => j < debut);
    const top = Object.entries(d.rows.filter(r => r.kind === 'produit' && r.day >= debut).reduce((o, r) => (o[r.key] = (o[r.key] || 0) + r.n, o), {})).sort((a, b) => b[1] - a[1])[0];
    const nom = top ? (C.st.products || []).find(p => p.id === top[0])?.name || top[0] : '';
    const ev = avant ? Math.round((cette - avant) / avant * 100) : null;
    z.innerHTML = `<p><strong>${cette}</strong> visite${cette > 1 ? 's' : ''} sur le site ces 7 derniers jours${ev === null ? '' : ` <span class="${ev >= 0 ? 'adm-ok' : 'adm-ko'}">(${ev >= 0 ? '▲' : '▼'} ${Math.abs(ev)} %)</span>`}${nom ? ` · pâtisserie la plus consultée : <strong>${esc(nom)}</strong>` : ''}.</p>
      <button type="button" class="lien" data-dgoto="stats">Voir les statistiques</button>`;
  } catch { z.innerHTML = ''; }
}
