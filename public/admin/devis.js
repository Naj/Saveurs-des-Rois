/* Saveurs des Rois — devis PDF à partir d'une demande
   La page est le devis : tout est modifiable, puis « Télécharger en PDF » ouvre l'impression du navigateur. */

import { pdfDepuis, enBase64, telechargerBlob, peutPartager } from './pdf.js?v=3.7';

const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const euro = c => ((c || 0) / 100).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' });
const nb = v => { const n = parseFloat(String(v ?? '').replace(/\s/g, '').replace(',', '.')); return Number.isFinite(n) ? n : 0; };
const prixTxt = c => ((c || 0) / 100).toFixed(2).replace('.', ',');
const qteTxt = (q, kg) => kg ? String(Math.round(q * 1000) / 1000).replace('.', ',') : String(q);
const dateFr = iso => { const d = new Date(iso + 'T12:00:00'); return isNaN(d) ? '' : d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }); };

const id = new URLSearchParams(location.search).get('id');
let R, P, S, Q, PRO, MAIL, LIEN; // demande, produits, réglages, devis, envoi d'e-mails, lien d'acceptation

const SECTIONS = {
  part: { titre: 'Particuliers — à la pièce', note: 'Prix unitaires, dégressivité appliquée selon les quantités.' },
  pro: { titre: 'Professionnels — vente au poids', note: 'Prix au kilogramme, fixe et sans tarif dégressif.' },
  frais: { titre: 'Livraison et frais', note: '' },
};

async function api(path, opts = {}) {
  const r = await fetch(path, { credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, ...opts });
  const d = await r.json().catch(() => ({}));
  if (r.status === 401) { location.href = '/admin/'; throw new Error('Session expirée'); }
  if (!r.ok) throw new Error(d.error || `Erreur ${r.status}`);
  return d;
}
function etat(t, ok = true) { const e = $('#etat'); e.textContent = t; e.className = 'barre__etat ' + (ok ? 'ok' : 'err'); }

/* ---------- Grille dégressive (identique au site) */
const paliers = p => (p?.tiers || []).filter(t => t.min >= 2 && t.price_cents > 0 && t.price_cents < p.price_cents).sort((a, b) => a.min - b.min);
function grille(p, qty) {
  let prix = p.price_cents, palier = null;
  for (const t of paliers(p)) if (qty >= t.min && t.price_cents < prix) { prix = t.price_cents; palier = t.min; }
  return { prix, palier };
}
const detailPalier = (p, qty) => { const g = grille(p, qty); return g.palier ? `Tarif dégressif — palier ${g.palier} pièces et +` : ''; };

/* ---------- Devis initial construit à partir de la demande */
function nouveauDevis() {
  const prod = Object.fromEntries(P.map(p => [p.id, p]));
  const lignes = R.items.map(i => {
    const kg = i.unit === 'kg', p = prod[i.id] || {};
    let prix = i.unit_cents, auto = false;
    if (!kg && p.price_cents && p.price_mode !== 'devis') { prix = grille(p, i.qty).prix; auto = true; } // grille actuelle
    if (!kg && !prix && p.price_cents) prix = p.price_cents; // pâtisserie « sur devis » : prix de base à ajuster
    return { s: kg ? 'pro' : 'part', pid: i.id, label: i.name, detail: kg ? '' : detailPalier(p, i.qty), qty: i.qty, kg, prix: prix || 0, auto };
  });
  const annee = (R.created_at || '').slice(0, 4) || new Date().getFullYear();
  return {
    numero: `DEV-${annee}-${String(R.id).padStart(4, '0')}`,
    date: new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Paris' }),
    validite: parseInt(S.quote_validity, 10) || 30,
    client: { nom: R.name || '', societe: PRO?.company || '', siret: PRO?.siret || '', adresse: PRO?.city || '', tel: R.phone || '', email: R.email || '' },
    evenement: [R.event_type, R.event_date && `le ${dateFr(R.event_date)}`, R.delivery].filter(Boolean).join(' · '),
    lignes,
    remise: 0,     // % sur la partie particuliers
    acompte: 0,    // % du total
    notes: '',
  };
}

/* ---------- Rendu */
let IMPR = false; // rendu « papier » : champs remplacés par du texte
const champ = (path, val, cls = '', label = '') => IMPR ? `<span>${esc(val)}</span>` : `<input class="ed-num ${cls}" data-path="${path}" value="${esc(val)}" inputmode="decimal" aria-label="${label}">`;
const ed = (path, val, cls = '', ph = '') => IMPR ? (String(val ?? '').trim() ? `<span class="${cls}">${esc(val)}</span>` : '') : `<span class="ed ${cls}" contenteditable="true" data-path="${path}" data-ph="${esc(ph)}">${esc(val)}</span>`;

function totaux() {
  const t = { part: 0, pro: 0, frais: 0 };
  Q.lignes.forEach(l => { t[l.s] += Math.round(l.qty * l.prix); });
  const remise = Math.round(t.part * (Q.remise || 0) / 100);
  const total = t.part - remise + t.pro + t.frais;
  return { ...t, remise, total, acompte: Math.round(total * (Q.acompte || 0) / 100) };
}

function ligneHtml(l, i) {
  const p = P.find(x => x.id === l.pid);
  const g = l.s === 'part' && p?.price_cents && paliers(p).length ? grille(p, l.qty) : null;
  const ecart = g && l.prix !== g.prix;
  return `<tr data-i="${i}">
    <td>${ed(`l.${i}.label`, l.label, 'fort', 'Désignation')}${l.detail || l.s !== 'frais' ? `<br>${ed(`l.${i}.detail`, l.detail, 'detail', 'Précision (facultatif)')}` : ''}
      ${ecart ? `<span class="indice ecran">Prix de la grille pour ${l.qty} pièces : ${euro(g.prix)} <button type="button" class="lien-mini" data-grille="${i}">Appliquer</button></span>` : ''}</td>
    <td class="num">${champ(`l.${i}.qty`, qteTxt(l.qty, l.kg), '', 'Quantité')} <span class="unite">${l.kg ? 'kg' : l.s === 'frais' ? '' : 'pc'}</span></td>
    <td class="num">${champ(`l.${i}.prix`, prixTxt(l.prix), '', 'Prix unitaire')} €<span class="unite">${l.kg ? '/kg' : ''}</span></td>
    <td class="num total-ligne">${euro(Math.round(l.qty * l.prix))}</td>
    <td class="ecran"><button class="suppr" data-suppr="${i}" title="Retirer la ligne" type="button">×</button></td>
  </tr>`;
}

function sectionHtml(s, t) {
  const lignes = Q.lignes.map((l, i) => [l, i]).filter(([l]) => l.s === s);
  if (!lignes.length) return '';
  const info = SECTIONS[s];
  return `<section class="bloc bloc--${s}">
    <h3>${info.titre}${s === 'pro' ? ' <span class="badge-pro">PRO</span>' : ''}</h3>
    ${info.note ? `<p class="bloc__note">${info.note}</p>` : ''}
    <table class="lignes">
      <thead><tr><th>Désignation</th><th class="num">Quantité</th><th class="num">Prix unitaire</th><th class="num">Montant</th><th class="ecran"></th></tr></thead>
      <tbody>${lignes.map(([l, i]) => ligneHtml(l, i)).join('')}</tbody>
      <tfoot><tr><td colspan="3">Sous-total ${s === 'part' ? 'particuliers' : s === 'pro' ? 'professionnels' : 'frais'}</td><td class="num">${euro(t[s])}</td><td class="ecran"></td></tr></tfoot>
    </table>
  </section>`;
}

function rendu() {
  const t = totaux();
  const tel = S.company_phone || S.contact_phone || '', mail = S.company_email || S.contact_email || '';
  const fin = new Date(Q.date + 'T12:00:00'); fin.setDate(fin.getDate() + (Q.validite || 30));
  document.title = `Devis ${Q.numero} — ${Q.client.nom || 'client'}`;
  $('#doc').innerHTML = `
  <header class="entete">
    <div class="marque">
      <img src="/assets/img/logo-transparent.webp" alt="Saveurs des Rois">
      <div>
        <p class="marque__nom">${esc(S.company_name || 'Saveurs des Rois')}</p>
        <p class="marque__info">Pâtisseries marocaines artisanales</p>
        <p class="marque__info">${[S.company_owner, S.company_siret && `SIRET ${S.company_siret}`].filter(Boolean).map(esc).join(' · ')}</p>
        <p class="marque__info">${esc(S.company_address || '').replace(/\n/g, '<br>')}</p>
        <p class="marque__info">${[tel, mail].filter(Boolean).map(esc).join(' · ')}</p>
      </div>
    </div>
    <div class="titre-devis">
      <h1>Devis</h1>
      <p>N° ${ed('numero', Q.numero, 'fort')}</p>
      <p>Date : ${IMPR ? dateFr(Q.date) : `<input type="date" class="ed-date" data-path="date" value="${Q.date}">`}</p>
      <p>Valable ${ed('validite', Q.validite, 'court')} jours, jusqu’au ${dateFr(fin.toLocaleDateString('sv-SE'))}</p>
    </div>
  </header>
  ${(!S.company_siret || !S.company_owner) ? '<p class="alerte ecran">Complétez nom, SIRET et adresse dans Administration → Textes &amp; contact → « Devis PDF » : ils sont obligatoires sur un devis.</p>' : ''}

  <div class="parties">
    <section class="client">
      <h2>Client</h2>
      <p>${ed('client.nom', Q.client.nom, 'fort', 'Nom et prénom')}</p>
      <p>${ed('client.societe', Q.client.societe, '', 'Société (clients professionnels)')}</p>
      <p>${ed('client.siret', Q.client.siret, '', 'SIRET du client (facultatif)')}</p>
      <p>${ed('client.adresse', Q.client.adresse, '', 'Adresse')}</p>
      <p>${ed('client.tel', Q.client.tel, '', 'Téléphone')} ${ed('client.email', Q.client.email, '', 'E-mail')}</p>
    </section>
    <section class="client">
      <h2>Objet</h2>
      <p>${ed('evenement', Q.evenement, '', 'Occasion, date, retrait ou livraison')}</p>
      ${R.message ? `<p class="ecran demande">Demande du client : « ${esc(R.message)} »</p>` : ''}
    </section>
  </div>

  ${sectionHtml('part', t)}${sectionHtml('pro', t)}${sectionHtml('frais', t)}
  ${!Q.lignes.length ? '<p class="alerte ecran">Aucune ligne : ajoutez-en avec les boutons en haut de page.</p>' : ''}

  <section class="recap">
    <table>
      ${t.part ? `<tr><td>Particuliers</td><td class="num">${euro(t.part)}</td></tr>` : ''}
      ${t.part || Q.remise ? `<tr class="${Q.remise ? '' : 'ecran'}"><td>Remise particuliers ${champ('remise', String(Q.remise || 0).replace('.', ','), 'ed-pct', 'Remise en %')} %</td><td class="num">${t.remise ? '− ' + euro(t.remise) : ''}</td></tr>` : ''}
      ${t.pro ? `<tr><td>Professionnels (au poids)</td><td class="num">${euro(t.pro)}</td></tr>` : ''}
      ${t.frais ? `<tr><td>Livraison et frais</td><td class="num">${euro(t.frais)}</td></tr>` : ''}
      <tr class="recap__total"><td>Total net à payer</td><td class="num">${euro(t.total)}</td></tr>
      <tr class="${Q.acompte ? '' : 'ecran'}"><td>Acompte à la commande ${champ('acompte', String(Q.acompte || 0).replace('.', ','), 'ed-pct', 'Acompte en %')} %</td><td class="num">${t.acompte ? euro(t.acompte) : ''}</td></tr>
    </table>
    <p class="mention">${esc(S.quote_legal || 'TVA non applicable, art. 293 B du CGI.')}</p>
  </section>

  <section class="conditions">
    ${S.quote_payment ? `<p><strong>Règlement :</strong> ${esc(S.quote_payment)}</p>` : ''}
    <p>${ed('notes', Q.notes, '', 'Remarques (allergènes, présentation, horaires de retrait…)')}</p>
    ${S.quote_footer ? `<p class="merci">${esc(S.quote_footer)}</p>` : ''}
  </section>

  <section class="accord">
    <div><p>Date et signature du client, précédées de la mention « Bon pour accord »</p><div class="cadre"></div></div>
  </section>
  <footer class="pied">${esc(S.company_name || 'Saveurs des Rois')} · Devis ${esc(Q.numero)} · ${esc(S.quote_legal || 'TVA non applicable, art. 293 B du CGI.')}</footer>`;
}

/* ---------- Modifications */
function setPath(path, v) {
  const k = path.split('.');
  if (k[0] === 'l') {
    const l = Q.lignes[+k[1]];
    if (k[2] === 'qty') {
      l.qty = Math.max(0, l.kg ? Math.round(nb(v) * 1000) / 1000 : nb(v));
      const p = P.find(x => x.id === l.pid);
      if (l.auto && p && !l.kg) { l.prix = grille(p, l.qty).prix; l.detail = detailPalier(p, l.qty); } // suit la grille tant que le prix n'a pas été modifié à la main
    }
    else if (k[2] === 'prix') { l.prix = Math.max(0, Math.round(nb(v) * 100)); l.auto = false; }
    else l[k[2]] = v;
  } else if (k[0] === 'client') Q.client[k[1]] = v;
  else if (['remise', 'acompte'].includes(k[0])) Q[k[0]] = Math.min(100, Math.max(0, nb(v)));
  else if (k[0] === 'validite') Q.validite = Math.max(1, parseInt(v, 10) || 30);
  else Q[k[0]] = v;
  modifie = true; etat('Modifications non enregistrées', false);
}
let modifie = false;
const doc = $('#doc');
doc.addEventListener('input', e => {
  const el = e.target;
  if (el.matches('.ed')) setPath(el.dataset.path, el.innerText.trim());
  if (el.matches('.ed-date')) { setPath('date', el.value); }
});
doc.addEventListener('change', e => { if (e.target.matches('.ed-num, .ed-date')) { setPath(e.target.dataset.path, e.target.value); rendu(); } });
doc.addEventListener('focusout', e => { if (e.target.matches('.ed') && ['validite'].includes(e.target.dataset.path)) rendu(); });
doc.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.matches('.ed-num')) e.target.blur(); });
doc.addEventListener('click', e => {
  const ga = e.target.closest('[data-grille]');
  if (ga) { const l = Q.lignes[+ga.dataset.grille], p = P.find(x => x.id === l.pid); l.prix = grille(p, l.qty).prix; l.detail = detailPalier(p, l.qty); l.auto = true; modifie = true; etat('Modifications non enregistrées', false); rendu(); return; }
  const b = e.target.closest('[data-suppr]');
  if (b) { Q.lignes.splice(+b.dataset.suppr, 1); modifie = true; etat('Modifications non enregistrées', false); rendu(); }
});
const ajout = (s, l) => { Q.lignes.push({ s, pid: '', label: '', detail: '', qty: 1, kg: s === 'pro', prix: 0, ...l }); modifie = true; rendu(); doc.querySelector(`[data-path="l.${Q.lignes.length - 1}.label"]`)?.focus(); };
$('#ajoutPart').onclick = () => ajout('part', {});
$('#ajoutPro').onclick = () => ajout('pro', {});
$('#ajoutFrais').onclick = () => ajout('frais', { label: 'Frais de livraison' });

async function enregistrer() {
  await api(`/api/admin/requests/${id}/quote`, { method: 'PUT', body: JSON.stringify(Q) });
  modifie = false; etat('Devis enregistré ✓');
  barreEnvoi();
}
$('#enregistrer').onclick = () => enregistrer().catch(e => etat(e.message, false));
$('#pdf').onclick = async () => {
  try { await enregistrer(); } catch (e) { etat(e.message, false); }
  document.activeElement?.blur();
  await document.fonts.ready;
  IMPR = true; rendu();
  await Promise.all([...doc.querySelectorAll('img')].map(i => i.complete ? 0 : new Promise(r => { i.onload = i.onerror = r; })));
  window.print();
};
window.addEventListener('afterprint', () => { if (IMPR) { IMPR = false; rendu(); } });
window.addEventListener('beforeunload', e => { if (modifie) { e.preventDefault(); e.returnValue = ''; } });

/* ---------- Envoi au client */
const dateHeure = d => (d ? new Date(d.replace(' ', 'T') + 'Z').toLocaleString('fr-FR', { dateStyle: 'long', timeStyle: 'short' }) : '');
const nomFichier = () => `${Q.numero || 'devis'}-saveurs-des-rois.pdf`;
function texteDevis() {
  const t = totaux();
  const prenom = (Q.client.nom || '').split(' ')[0];
  return `Bonjour ${prenom},\n\nVeuillez trouver ci-joint votre devis ${Q.numero} d’un montant de ${euro(t.total)}, valable ${Q.validite} jours.${t.acompte ? `\n\nUn acompte de ${euro(t.acompte)} vous sera demandé à la commande.` : ''}${LIEN ? `\n\nPour l’accepter, un clic suffit :\n${LIEN}` : ''}\n\nVous pouvez aussi nous le retourner signé avec la mention « Bon pour accord ».\n\nAvec nos remerciements,\n${S.company_name || 'Saveurs des Rois'}`;
}
const genererPdf = () => pdfDepuis(doc, { avant: () => { IMPR = true; rendu(); }, apres: () => { IMPR = false; rendu(); }, titre: document.title, auteur: S.company_name || 'Saveurs des Rois' });

function barreEnvoi() {
  const texte = texteDevis();
  const tel = (Q.client.tel || '').replace(/\D/g, '').replace(/^0/, '33');
  const b = $('#envoi');
  b.hidden = false;
  b.innerHTML = `
    ${R.accepted_at ? `<span class="envoi__ok">✓ Accepté en ligne le ${dateHeure(R.accepted_at)}${R.accepted_name ? ` par ${esc(R.accepted_name)}` : ''}</span>`
      : R.quote_sent_at ? `<span class="envoi__ok">✉ Envoyé par e-mail le ${dateHeure(R.quote_sent_at)} à ${esc(R.quote_sent_to || '')}</span>` : ''}
    <div class="envoi__ligne"><span class="envoi__titre">Depuis le site :</span>
      <button class="b b--or" id="envoiDirect" type="button">Envoyer le devis par e-mail</button>
      <span class="envoi__note">${MAIL.actif ? `PDF joint, depuis ${esc(MAIL.from)}` : 'à activer dans Factures → Réglages'}</span></div>
    <div class="envoi__ligne"><span class="envoi__titre">Vous-même :</span>
      <button class="b b--ligne" id="fichierPdf" type="button">Télécharger le fichier PDF</button>
      ${peutPartager ? '<button class="b b--ligne" id="partagerPdf" type="button">Partager le PDF</button>' : ''}
      ${Q.client.email ? `<a class="b b--ligne" href="mailto:${esc(Q.client.email)}?subject=${encodeURIComponent(`Votre devis ${Q.numero} — Saveurs des Rois`)}&body=${encodeURIComponent(texte)}">Préparer l’e-mail</a>` : ''}
      ${tel ? `<a class="b b--ligne" href="https://wa.me/${tel}?text=${encodeURIComponent(texte)}" target="_blank" rel="noopener">Préparer le message WhatsApp</a>` : ''}
      ${LIEN ? '<button class="b b--ligne" id="copierLien" type="button">Copier le lien d’acceptation</button>' : ''}
      <button class="b b--ligne" id="envoye" type="button">${['devis envoyé', 'confirmé'].includes(R.status) ? `Statut : ${R.status} ✓` : 'Marquer « devis envoyé »'}</button></div>`;
}

function dialogue(html, onSubmit) {
  const d = $('#dlg');
  d.innerHTML = `<form method="dialog" class="f-dlg__form">${html}<p class="f-dlg__err" hidden></p></form>`;
  const form = d.querySelector('form');
  form.addEventListener('submit', async e => {
    if (e.submitter?.value === 'annuler') return;
    e.preventDefault();
    const btn = e.submitter; if (btn) btn.disabled = true;
    try { await onSubmit(new FormData(form)); d.close(); }
    catch (err) { const p = form.querySelector('.f-dlg__err'); p.textContent = err.message; p.hidden = false; etat(err.message, false); }
    finally { if (btn) btn.disabled = false; }
  });
  d.showModal();
}
function dlgEnvoi() {
  if (!MAIL.actif) {
    return dialogue(`<h2>Envoi direct par e-mail</h2>
      <p>L’envoi depuis le site n’est pas encore activé. C’est à faire une seule fois (5 minutes) : Administration → <strong>Factures → Réglages</strong> → « Envoi des factures par e-mail » (le même réglage sert aux devis).</p>
      <p class="detail">En attendant : « Télécharger le fichier PDF » puis « Préparer l’e-mail ».</p>
      <div class="f-dlg__btns"><button class="b b--or" value="annuler" formnovalidate>Compris</button></div>`, async () => {});
  }
  dialogue(`<h2>Envoyer le devis par e-mail</h2>
    <label>À<input name="to" required value="${esc(Q.client.email || '')}" placeholder="adresse@client.fr"></label>
    <label>Objet<input name="subject" value="${esc(`Votre devis ${Q.numero} — ${S.company_name || 'Saveurs des Rois'}`)}"></label>
    <label>Message<textarea name="message" rows="11">${esc(texteDevis())}</textarea></label>
    <label class="f-dlg__case"><input type="checkbox" name="copie" checked> M’envoyer une copie (${esc(MAIL.from)})</label>
    <p class="detail">📎 ${esc(nomFichier())} sera joint automatiquement. Le client pourra accepter le devis en un clic grâce au lien du message.</p>
    <div class="f-dlg__btns"><button class="b b--ligne" value="annuler" formnovalidate>Annuler</button><button class="b b--or" type="submit">Envoyer</button></div>`,
  async fd => {
    const to = String(fd.get('to') || '').trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+/.test(to)) throw new Error('Indiquez l’adresse e-mail du client.');
    if (modifie) await enregistrer();
    etat('Préparation du PDF…');
    const pdf = await enBase64(await genererPdf());
    etat('Envoi en cours…');
    await api(`/api/admin/requests/${id}/quote-email`, { method: 'POST', body: JSON.stringify({ to, subject: fd.get('subject'), message: fd.get('message'), copie: fd.has('copie'), pdf, filename: nomFichier() }) });
    R.quote_sent_at = new Date().toISOString().slice(0, 19).replace('T', ' '); R.quote_sent_to = to;
    if (['nouveau', 'en cours'].includes(R.status)) R.status = 'devis envoyé';
    barreEnvoi(); etat(`Devis envoyé à ${to} ✓`);
  });
}

$('#envoi').addEventListener('click', async e => {
  const t = e.target.closest('button'); if (!t) return;
  try {
    if (t.id === 'envoiDirect') return dlgEnvoi();
    if (t.id === 'fichierPdf') { if (modifie) await enregistrer(); etat('Préparation du PDF…'); telechargerBlob(await genererPdf(), nomFichier()); etat('PDF téléchargé ✓'); }
    if (t.id === 'partagerPdf') {
      if (modifie) await enregistrer(); etat('Préparation du PDF…');
      const f = new File([await genererPdf()], nomFichier(), { type: 'application/pdf' });
      await navigator.share({ files: [f], title: document.title, text: texteDevis() }).catch(err => { if (err.name !== 'AbortError') throw err; });
      etat('');
    }
    if (t.id === 'copierLien') { await navigator.clipboard.writeText(LIEN); etat('Lien d’acceptation copié ✓'); }
    if (t.id === 'envoye') { await api(`/api/admin/requests/${id}`, { method: 'PUT', body: JSON.stringify({ status: 'devis envoyé' }) }); R.status = 'devis envoyé'; barreEnvoi(); }
  } catch (err) { etat(err.message, false); }
});

/* ---------- Démarrage */
(async () => {
  if (!id) { doc.innerHTML = '<p class="chargement">Aucune demande indiquée. Ouvrez le devis depuis l’onglet Demandes.</p>'; return; }
  try {
    const d = await api(`/api/admin/requests/${id}/quote`);
    R = d.request; P = d.products; S = d.settings; PRO = d.pro; MAIL = d.mail || { actif: false }; LIEN = d.acceptLink || '';
    Q = R.quote || nouveauDevis();
    rendu();
    etat(R.accepted_at ? `Devis accepté en ligne le ${dateHeure(R.accepted_at)}${R.accepted_name ? ` par ${R.accepted_name}` : ''} (la version acceptée est conservée)` : R.quote ? 'Devis enregistré — reprise de votre dernière version' : 'Nouveau devis, prérempli depuis la demande');
    if (R.quote) barreEnvoi();
  } catch (e) {
    doc.innerHTML = `<p class="chargement">${esc(e.message)}</p>`;
  }
})();
