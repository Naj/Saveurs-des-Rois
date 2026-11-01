/* Saveurs des Rois — facture (A4)
   Brouillon : tout est modifiable. « Valider et numéroter » attribue le numéro définitif : la facture ne change plus,
   une erreur se corrige par un avoir. « Télécharger en PDF » ouvre l'impression du navigateur. */

const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const euro = c => ((c || 0) / 100).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' });
const nb = v => { const n = parseFloat(String(v ?? '').replace(/\s/g, '').replace(',', '.')); return Number.isFinite(n) ? n : 0; };
const prixTxt = c => ((c || 0) / 100).toFixed(2).replace('.', ',');
const qteTxt = q => String(Math.round((q || 0) * 1000) / 1000).replace('.', ',');
const dateFr = iso => { if (!iso) return ''; const d = new Date(iso.slice(0, 10) + 'T12:00:00'); return isNaN(d) ? '' : d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }); };
const dateCourte = iso => (iso ? new Date(iso.slice(0, 10) + 'T12:00:00').toLocaleDateString('fr-FR') : '');
const aujourdhui = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Paris' });
const METHODES = ['Espèces', 'Virement', 'Carte', 'SumUp (en ligne)', 'Chèque', 'Paylib / Wero', 'Autre'];
const TITRES = { facture: 'Facture', acompte: 'Facture d’acompte', solde: 'Facture de solde', avoir: 'Avoir' };
const ETATS = { brouillon: 'Brouillon', 'payée': 'Payée', partiel: 'Partiellement payée', 'à payer': 'À payer', 'en retard': 'En retard', avoir: 'Avoir', 'remboursé': 'Remboursé' };
const PENALITES = 'En cas de retard de paiement : pénalités au taux de trois fois le taux d’intérêt légal, exigibles dès le lendemain de l’échéance, et indemnité forfaitaire pour frais de recouvrement de 40 € (art. L441-10 et D441-5 du Code de commerce). Pas d’escompte pour paiement anticipé.';

const id = new URLSearchParams(location.search).get('id');
let F, PAY, REL, S, LIEN, SUMUP, MAIL; // facture, paiements, factures liées, réglages, lien de paiement, envoi d'e-mails
let modifie = false, IMPR = false;

async function api(path, opts = {}) {
  const r = await fetch(path, { credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, ...opts });
  const d = await r.json().catch(() => ({}));
  if (r.status === 401) { location.href = '/admin/'; throw new Error('Session expirée'); }
  if (!r.ok) throw new Error(d.error || `Erreur ${r.status}`);
  return d;
}
function etat(t, ok = true) { const e = $('#etat'); e.textContent = t; e.className = 'barre__etat ' + (ok ? 'ok' : 'err'); }
const brouillon = () => F.status === 'brouillon';
const signe = () => (F.type === 'avoir' ? -1 : 1);

/* ---------- Calculs */
function totaux() {
  const brut = F.lines.reduce((t, l) => t + Math.round(l.qty * l.prix), 0);
  const total = signe() * Math.abs(brut);
  const net = total - (F.deduct_cents || 0);
  const paye = PAY.reduce((t, p) => t + p.amount_cents, 0);
  return { total, net, paye, reste: net - paye };
}

/* ---------- Rendu */
const ed = (path, val, cls = '', ph = '') => (!brouillon() || IMPR)
  ? (String(val ?? '').trim() ? `<span class="${cls}">${esc(val).replace(/\n/g, '<br>')}</span>` : '')
  : `<span class="ed ${cls}" contenteditable="true" data-path="${path}" data-ph="${esc(ph)}">${esc(val)}</span>`;
const champ = (path, val, label) => (!brouillon() || IMPR) ? `<span>${esc(val)}</span>` : `<input class="ed-num" data-path="${path}" value="${esc(val)}" inputmode="decimal" aria-label="${label}">`;
const champDate = (path, val) => (!brouillon() || IMPR) ? dateFr(val) : `<input type="date" class="ed-date" data-path="${path}" value="${esc(val || '')}">`;

function ligneHtml(l, i) {
  return `<tr>
    <td>${ed(`l.${i}.label`, l.label, 'fort', 'Désignation')}${l.detail || (brouillon() && !IMPR) ? `<br>${ed(`l.${i}.detail`, l.detail, 'detail', 'Précision (facultatif)')}` : ''}</td>
    <td class="num">${champ(`l.${i}.qty`, qteTxt(l.qty), 'Quantité')} <span class="unite">${l.unit === 'kg' ? 'kg' : l.unit === 'pc' ? 'pc' : ''}</span>
      ${brouillon() && !IMPR ? `<select class="ed-unite ecran" data-path="l.${i}.unit" aria-label="Unité">${[['pc', 'pièce'], ['kg', 'kg'], ['', '—']].map(([v, t]) => `<option value="${v}" ${l.unit === v ? 'selected' : ''}>${t}</option>`).join('')}</select>` : ''}</td>
    <td class="num">${champ(`l.${i}.prix`, prixTxt(l.prix), 'Prix unitaire')} €${l.unit === 'kg' ? '<span class="unite">/kg</span>' : ''}</td>
    <td class="num total-ligne">${euro(signe() * Math.round(l.qty * l.prix))}</td>
    ${brouillon() && !IMPR ? `<td class="ecran"><button class="suppr" data-suppr="${i}" title="Retirer la ligne" type="button">×</button></td>` : ''}
  </tr>`;
}

function qr(texte) {
  try { const q = window.qrcode(0, 'M'); q.addData(texte); q.make(); return q.createSvgTag({ cellSize: 3, margin: 0, scalable: true }); } catch { return ''; }
}

function rendu() {
  const t = totaux();
  const c = F.client || {};
  const tel = S.company_phone || S.contact_phone || '', mail = S.company_email || S.contact_email || '';
  const titre = TITRES[F.type] || 'Facture';
  const paiementEnLigne = LIEN && t.reste > 0 && F.type !== 'avoir' && (SUMUP.api || SUMUP.link || F.payment_link);
  const conditions = F.is_pro ? (S.invoice_terms_pro || 'Paiement à réception de facture, par virement ou espèces.') : (S.invoice_terms || S.quote_payment || 'Paiement à réception, par virement, espèces ou carte.');
  const parent = REL.find(r => r.id === F.parent_id);
  document.title = `${titre} ${F.number || '(brouillon)'} — ${c.societe || c.nom || 'client'}`;
  $('#doc').classList.toggle('feuille--brouillon', brouillon());
  $('#doc').innerHTML = `
  <header class="entete">
    <div class="marque">
      <img src="/assets/img/logo-transparent.webp" alt="Saveurs des Rois">
      <div>
        <p class="marque__nom">${esc(S.company_name || 'Saveurs des Rois')}</p>
        <p class="marque__info">Pâtisseries marocaines artisanales</p>
        <p class="marque__info">${[S.company_owner && `${S.company_owner}, EI`, S.company_siret && `SIRET ${S.company_siret}`].filter(Boolean).map(esc).join(' · ')}</p>
        <p class="marque__info">${esc(S.company_address || '').replace(/\n/g, '<br>')}</p>
        <p class="marque__info">${[tel, mail].filter(Boolean).map(esc).join(' · ')}</p>
      </div>
    </div>
    <div class="titre-devis">
      <h1 class="${F.type === 'facture' ? '' : 'h1--long'}">${titre}</h1>
      <p>N° <strong>${F.number ? esc(F.number) : '<span class="provisoire">attribué à la validation</span>'}</strong></p>
      <p>Date : ${champDate('issue_date', F.issue_date)}</p>
      ${F.type !== 'acompte' ? `<p>Date de la vente : ${champDate('sale_date', F.sale_date)}</p>` : ''}
      ${F.type !== 'avoir' && (F.is_pro || F.due_date !== F.issue_date || brouillon()) ? `<p>Échéance : ${champDate('due_date', F.due_date)}</p>` : ''}
      ${F.quote_ref || brouillon() ? `<p class="ref">Réf. devis ${ed('quote_ref', F.quote_ref, '', 'DEV-…')}</p>` : ''}
      ${F.type === 'avoir' && parent ? `<p class="ref">Annule / corrige ${esc(parent.number)}</p>` : ''}
    </div>
  </header>
  ${(!S.company_siret || !S.company_owner || !S.company_address) ? '<p class="alerte ecran">Complétez nom, SIRET et adresse dans Administration → Textes &amp; contact → « Devis PDF » : ils sont obligatoires sur une facture.</p>' : ''}

  <div class="parties">
    <section class="client">
      <h2>${F.type === 'avoir' ? 'Client' : 'Facturé à'}</h2>
      ${F.is_pro || c.societe ? `<p>${ed('client.societe', c.societe, 'fort', 'Société')}</p>` : ''}
      <p>${ed('client.nom', c.nom, F.is_pro ? '' : 'fort', 'Nom et prénom')}</p>
      ${F.is_pro ? `<p>${ed('client.siret', c.siret ? (IMPR || !brouillon() ? `SIRET ${c.siret}` : c.siret) : '', '', 'SIRET / SIREN du client')}</p>` : ''}
      <p>${ed('client.adresse', c.adresse, '', F.is_pro ? 'Adresse de facturation (obligatoire)' : 'Adresse (facultatif)')}</p>
      <p>${ed('client.tel', c.tel, '', 'Téléphone')} ${ed('client.email', c.email, '', 'E-mail')}</p>
    </section>
    <section class="client">
      <h2>Objet</h2>
      <p>${ed('object', F.object, '', 'Occasion, date, retrait ou livraison')}</p>
      ${F.is_pro ? '<p class="detail">Catégorie d’opération : livraison de biens</p>' : ''}
    </section>
  </div>

  <table class="lignes">
    <thead><tr><th>Désignation</th><th class="num">Quantité</th><th class="num">Prix unitaire</th><th class="num">Montant</th>${brouillon() && !IMPR ? '<th class="ecran"></th>' : ''}</tr></thead>
    <tbody>${F.lines.map(ligneHtml).join('')}</tbody>
  </table>
  ${brouillon() && !IMPR ? '<p class="ecran"><button type="button" class="b b--clair" id="ajoutLigne">+ Ajouter une ligne</button> <span class="detail">Remise : ajoutez une ligne avec un prix négatif.</span></p>' : ''}

  <section class="recap">
    <table>
      ${F.deduct_cents ? `<tr><td>Total de la commande</td><td class="num">${euro(t.total)}</td></tr>
        <tr><td>Acompte déjà facturé${parent?.number ? ` (${esc(parent.number)})` : ''}</td><td class="num">− ${euro(F.deduct_cents)}</td></tr>` : ''}
      <tr class="recap__total"><td>${F.type === 'avoir' ? 'Montant de l’avoir' : F.deduct_cents ? 'Solde à facturer' : 'Total'}</td><td class="num">${euro(t.net)}</td></tr>
      ${PAY.map(p => `<tr class="recap__pay"><td>${F.type === 'avoir' ? 'Remboursé' : 'Réglé'} le ${dateCourte(p.date)}${p.method ? ` (${esc(p.method)})` : ''}${p.note ? ` · ${esc(p.note)}` : ''}</td><td class="num">− ${euro(Math.abs(p.amount_cents))}</td></tr>`).join('')}
      ${PAY.length && F.type !== 'avoir' ? `<tr class="recap__reste"><td>Reste à payer</td><td class="num">${euro(Math.max(0, t.reste))}</td></tr>` : ''}
    </table>
    <p class="mention">${esc(S.quote_legal || 'TVA non applicable, art. 293 B du CGI.')}</p>
  </section>

  ${!brouillon() && F.type !== 'avoir' && t.reste <= 0 ? `<div class="tampon">Payée</div>` : ''}
  ${!brouillon() && F.type === 'avoir' && PAY.length && t.reste >= 0 ? `<div class="tampon">Remboursé</div>` : ''}

  <section class="conditions">
    ${F.type === 'avoir' ? '<p>Cet avoir annule ou réduit la facture indiquée ci-dessus. Il peut être remboursé ou déduit d’une prochaine commande.</p>' : `
    <p><strong>Conditions de règlement :</strong> ${esc(conditions)}${F.is_pro && F.due_date ? ` Échéance : ${dateFr(F.due_date)}.` : ''}</p>
    ${S.company_iban ? `<p><strong>Virement :</strong> IBAN ${esc(S.company_iban)}${S.company_bic ? ` · BIC ${esc(S.company_bic)}` : ''} · référence ${esc(F.number || 'du numéro de facture')}</p>` : ''}
    ${F.is_pro ? `<p class="petit">${esc(S.invoice_late_text || PENALITES)}</p>` : ''}`}
    ${F.notes || (brouillon() && !IMPR) ? `<p>${ed('notes', F.notes, '', 'Remarques (facultatif)')}</p>` : ''}
    ${S.invoice_footer || S.quote_footer ? `<p class="merci">${esc(S.invoice_footer || S.quote_footer)}</p>` : ''}
  </section>

  ${paiementEnLigne ? `<section class="payer">
    <div class="payer__qr">${qr(LIEN)}</div>
    <div><p class="payer__titre">Payer en ligne par carte</p><p>Scannez le code ou ouvrez le lien :<br><a href="${esc(LIEN)}">${esc(LIEN.replace(/^https:\/\//, ''))}</a></p><p class="petit">Paiement sécurisé par SumUp.</p></div>
  </section>` : ''}

  <footer class="pied">${esc(S.company_name || 'Saveurs des Rois')}${S.company_owner ? ` · ${esc(S.company_owner)}, EI` : ''}${S.company_siret ? ` · SIRET ${esc(S.company_siret)}` : ''} · ${titre} ${esc(F.number || 'brouillon')}</footer>`;
  barre();
}

/* ---------- Barre d'actions */
function barre() {
  const t = totaux();
  const a = $('#actions');
  if (brouillon()) {
    a.innerHTML = `
      <label class="b b--ligne b--case"><input type="checkbox" id="estPro" ${F.is_pro ? 'checked' : ''}> Client professionnel</label>
      <button class="b b--ligne" id="enregistrer" type="button">Enregistrer</button>
      <button class="b b--ligne" id="apercu" type="button">Aperçu PDF</button>
      <button class="b b--or" id="valider" type="button">Valider et numéroter</button>
      <button class="b b--danger" id="supprimer" type="button">Supprimer le brouillon</button>`;
    $('#aide').innerHTML = 'Brouillon : tout est modifiable (cliquez sur un texte, une quantité ou un prix). <strong>Valider</strong> attribue le numéro définitif ; la facture ne pourra plus être modifiée (une erreur se corrige par un avoir).';
  } else {
    a.innerHTML = `
      <button class="b b--or" id="pdf" type="button">Imprimer / PDF</button>
      ${F.type !== 'avoir' && t.reste > 0 ? '<button class="b b--ligne" id="paiement" type="button">Enregistrer un paiement</button>' : ''}
      ${F.type === 'avoir' && t.reste < 0 ? '<button class="b b--ligne" id="paiement" type="button">Enregistrer le remboursement</button>' : ''}
      ${F.sumup_checkout_id ? '<button class="b b--ligne" id="verifSumup" type="button">Vérifier le paiement SumUp</button>' : ''}
      ${F.type !== 'avoir' ? '<button class="b b--ligne" id="avoir" type="button">Créer un avoir</button>' : ''}`;
    $('#aide').innerHTML = `${ETATS[F.state] || ''} · facture validée le ${dateCourte(F.validated_at || F.issue_date)}${F.source === 'import' ? ' (importée)' : ''}. Elle ne peut plus être modifiée : pour corriger, créez un avoir.`;
  }
  suivi();
}

function texteClient(type) {
  const t = totaux(), c = F.client || {};
  const prenom = (c.nom || '').split(' ')[0] || '';
  const sign = S.company_name || 'Saveurs des Rois';
  const lien = LIEN && t.reste > 0 && (SUMUP.api || SUMUP.link || F.payment_link) ? `\n\nPaiement en ligne par carte : ${LIEN}` : '';
  if (type === 'relance') {
    return `Bonjour ${prenom},\n\nSauf erreur de notre part, la facture ${F.number} du ${dateFr(F.issue_date)} reste à régler : ${euro(t.reste)}${F.due_date ? ` (échéance le ${dateFr(F.due_date)})` : ''}.${lien}${S.company_iban ? `\n\nVirement : IBAN ${S.company_iban}, référence ${F.number}.` : ''}\n\nSi le règlement a été fait entre-temps, merci de ne pas tenir compte de ce message.\n\nBien cordialement,\n${sign}`;
  }
  return `Bonjour ${prenom},\n\nVeuillez trouver ci-joint votre ${(TITRES[F.type] || 'facture').toLowerCase()} ${F.number} d’un montant de ${euro(t.net)}${t.reste > 0 && t.reste !== t.net ? ` (reste à payer : ${euro(t.reste)})` : ''}.${t.reste <= 0 && F.type !== 'avoir' ? '\n\nElle est entièrement réglée : merci !' : lien}\n\nAvec nos remerciements,\n${sign}`;
}

const peutPartager = (() => { try { return Boolean(navigator.canShare?.({ files: [new File(['x'], 'x.pdf', { type: 'application/pdf' })] })); } catch { return false; } })();
const dateHeure = d => (d ? new Date(d.replace(' ', 'T') + 'Z').toLocaleString('fr-FR', { dateStyle: 'long', timeStyle: 'short' }) : '');
const nomFichier = () => `${F.number || 'facture'}-saveurs-des-rois.pdf`;

function suivi() {
  const z = $('#suivi');
  if (brouillon()) { z.hidden = true; return; }
  const t = totaux(), c = F.client || {};
  const tel = (c.tel || '').replace(/\D/g, '').replace(/^0/, '33');
  const sujet = `${TITRES[F.type]} ${F.number} — ${S.company_name || 'Saveurs des Rois'}`;
  const manuel = (type, libelle) => [
    c.email && `<a class="b b--ligne" data-relance="${type}" href="mailto:${esc(c.email)}?subject=${encodeURIComponent(type === 'relance' ? `Rappel : ${sujet}` : sujet)}&body=${encodeURIComponent(texteClient(type))}">${libelle} l’e-mail dans ma messagerie</a>`,
    tel && `<a class="b b--ligne" data-relance="${type}" href="https://wa.me/${tel}?text=${encodeURIComponent(texteClient(type))}" target="_blank" rel="noopener">${libelle} le message WhatsApp</a>`,
  ].filter(Boolean).join('');
  const direct = type => `<button class="b b--or" type="button" data-direct="${type}">${type === 'relance' ? 'Relancer par e-mail' : 'Envoyer la facture par e-mail'}</button>
    ${MAIL.actif ? `<span class="detail">depuis ${esc(MAIL.from)}, PDF joint automatiquement</span>` : '<span class="detail">à activer une seule fois : Factures → Réglages → « Envoi des factures par e-mail »</span>'}`;
  z.hidden = false;
  z.innerHTML = `
    <div class="suivi__bloc">
      <h2>Envoyer au client</h2>
      ${F.sent_at ? `<p class="suivi__ok">✉ Envoyée par e-mail le ${dateHeure(F.sent_at)} à ${esc(F.sent_to || '')}</p>` : ''}
      <p class="suivi__h3">1. Directement depuis le site</p>
      <div class="suivi__actions">${direct('envoi')}</div>
      <p class="suivi__h3">2. Depuis votre messagerie ou votre téléphone</p>
      <div class="suivi__actions">
        <button class="b b--ligne" type="button" data-fichier>Télécharger le fichier PDF</button>
        ${peutPartager ? '<button class="b b--ligne" type="button" data-partager>Partager le PDF (WhatsApp, SMS…)</button>' : ''}
        ${manuel('envoi', 'Préparer')}
      </div>
      <p class="detail">Avec votre messagerie ou WhatsApp : téléchargez d’abord le PDF, puis joignez-le au message préparé.</p>
      ${F.type !== 'avoir' && t.reste > 0 ? `<h2>Relancer</h2><p class="detail">${F.reminders ? `Déjà relancé ${F.reminders} fois, dernière relance le ${dateCourte(F.last_reminder_at)}.` : 'Aucune relance pour l’instant.'}</p>
        <div class="suivi__actions">${direct('relance')}</div><div class="suivi__actions">${manuel('relance', 'Préparer')}</div>` : ''}
    </div>
    ${F.type !== 'avoir' ? `<div class="suivi__bloc">
      <h2>Paiement en ligne (SumUp)</h2>
      ${SUMUP.api ? '<p class="detail">Paiement par carte actif : le lien imprimé sur la facture crée un paiement SumUp du reste à payer, enregistré automatiquement ici.</p>'
        : SUMUP.link || F.payment_link ? '<p class="detail">Le lien de la facture mène à votre lien de paiement SumUp. Pensez à enregistrer le paiement ici quand vous le recevez.</p>'
        : '<p class="detail">Aucun paiement en ligne configuré : collez ci-dessous un lien de paiement créé dans l’appli SumUp, ou voyez Factures → Réglages.</p>'}
      <div class="suivi__lien"><input id="lienSumup" value="${esc(F.payment_link || '')}" placeholder="Lien SumUp propre à cette facture (facultatif)"><button class="b b--ligne" id="lienSave" type="button">Enregistrer</button></div>
      ${LIEN && t.reste > 0 ? `<p class="detail">Lien à envoyer au client : <a href="${esc(LIEN)}" target="_blank" rel="noopener">${esc(LIEN)}</a> <button class="lien-mini" id="copierLien" type="button">Copier</button></p>` : ''}
    </div>` : ''}
    <div class="suivi__bloc">
      <h2>Paiements enregistrés</h2>
      ${PAY.length ? `<table class="suivi__table">${PAY.map(p => `<tr><td>${dateCourte(p.date)}</td><td>${esc(p.method || '')}${p.note ? ` · ${esc(p.note)}` : ''}</td><td class="num">${euro(p.amount_cents)}</td><td><button class="lien-mini" data-delpay="${p.id}" type="button">Retirer</button></td></tr>`).join('')}</table>` : '<p class="detail">Aucun paiement pour l’instant.</p>'}
      ${REL.length ? `<h2>Documents liés</h2><ul class="suivi__liste">${REL.map(r => `<li><a href="/admin/facture.html?id=${r.id}">${esc(r.number || 'brouillon')} · ${esc(TITRES[r.type] || r.type)} · ${euro(r.total_cents - (r.deduct_cents || 0))}</a></li>`).join('')}</ul>` : ''}
    </div>`;
}

/* ---------- Modifications (brouillon) */
function setPath(path, v) {
  const k = path.split('.');
  if (k[0] === 'l') {
    const l = F.lines[+k[1]];
    if (k[2] === 'qty') l.qty = Math.round(nb(v) * 1000) / 1000;
    else if (k[2] === 'prix') l.prix = Math.round(nb(v) * 100);
    else l[k[2]] = v;
  } else if (k[0] === 'client') F.client[k[1]] = k[1] === 'siret' ? v.replace(/^SIRET\s*/i, '') : v;
  else F[k[0]] = v;
  modifie = true; etat('Modifications non enregistrées', false);
}
const doc = $('#doc');
doc.addEventListener('input', e => { if (e.target.matches('.ed')) setPath(e.target.dataset.path, e.target.innerText.trim()); });
doc.addEventListener('change', e => {
  if (e.target.matches('.ed-num, .ed-date, .ed-unite')) { setPath(e.target.dataset.path, e.target.value); rendu(); }
});
doc.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.matches('.ed-num')) e.target.blur(); });
doc.addEventListener('click', e => {
  const b = e.target.closest('[data-suppr]');
  if (b) { F.lines.splice(+b.dataset.suppr, 1); modifie = true; etat('Modifications non enregistrées', false); rendu(); }
  if (e.target.id === 'ajoutLigne') {
    F.lines.push({ label: '', detail: '', qty: 1, unit: F.is_pro ? 'kg' : 'pc', prix: 0 }); modifie = true; rendu();
    doc.querySelector(`[data-path="l.${F.lines.length - 1}.label"]`)?.focus();
  }
});

async function enregistrer() {
  const r = await api(`/api/admin/invoices/${id}`, { method: 'PUT', body: JSON.stringify({
    client: F.client, lines: F.lines, issue_date: F.issue_date, sale_date: F.sale_date, due_date: F.due_date,
    object: F.object, notes: F.notes, is_pro: F.is_pro, quote_ref: F.quote_ref,
  }) });
  F.total_cents = r.total_cents; modifie = false; etat('Brouillon enregistré ✓');
}
async function imprimer() {
  document.activeElement?.blur();
  await document.fonts.ready;
  IMPR = true; rendu();
  await Promise.all([...doc.querySelectorAll('img')].map(i => i.complete ? 0 : new Promise(r => { i.onload = i.onerror = r; })));
  window.print();
}
window.addEventListener('afterprint', () => { if (IMPR) { IMPR = false; rendu(); } });
window.addEventListener('beforeunload', e => { if (modifie) { e.preventDefault(); e.returnValue = ''; } });

/* ---------- PDF en fichier (pièce jointe, partage) : la feuille est photographiée puis mise en page A4 */
function chargerLib(src, nom) {
  if (window[nom]) return Promise.resolve();
  return new Promise((ok, ko) => { const sc = document.createElement('script'); sc.src = src; sc.onload = ok; sc.onerror = () => ko(new Error('Module PDF indisponible : rechargez la page.')); document.head.append(sc); });
}
async function pdfBlob() {
  await chargerLib('/admin/vendor/html2canvas.min.js?v=3.7', 'html2canvas');
  await chargerLib('/admin/vendor/jspdf.umd.min.js?v=3.7', 'jspdf');
  document.activeElement?.blur();
  await document.fonts.ready;
  IMPR = true; rendu(); doc.classList.add('capture');
  let canvas;
  try {
    await Promise.all([...doc.querySelectorAll('img')].map(i => i.complete ? 0 : new Promise(r => { i.onload = i.onerror = r; })));
    canvas = await window.html2canvas(doc, { scale: 2, backgroundColor: '#ffffff', useCORS: true, windowWidth: 1100, logging: false });
  } finally { doc.classList.remove('capture'); IMPR = false; rendu(); }
  const pdf = new window.jspdf.jsPDF({ unit: 'mm', format: 'a4', compress: true });
  const pageH = Math.round(canvas.width * 297 / 210);
  for (let y = 0, n = 0; y < canvas.height - pageH * 0.02; y += pageH, n++) {
    const c = document.createElement('canvas'); c.width = canvas.width; c.height = pageH;
    const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
    g.drawImage(canvas, 0, y, canvas.width, Math.min(pageH, canvas.height - y), 0, 0, canvas.width, Math.min(pageH, canvas.height - y));
    if (n) pdf.addPage();
    pdf.addImage(c.toDataURL('image/jpeg', 0.9), 'JPEG', 0, 0, 210, 297);
  }
  pdf.setProperties({ title: document.title, author: S.company_name || 'Saveurs des Rois' });
  return pdf.output('blob');
}
const enBase64 = blob => new Promise((ok, ko) => { const r = new FileReader(); r.onload = () => ok(String(r.result).split(',')[1]); r.onerror = () => ko(new Error('Lecture du PDF impossible.')); r.readAsDataURL(blob); });

function dlgEnvoi(type) {
  const c = F.client || {};
  if (!MAIL.actif) {
    return dialogue(`<h2>Envoi direct par e-mail</h2>
      <p>L’envoi depuis le site n’est pas encore activé. C’est à faire une seule fois (5 minutes) :</p>
      <ol class="f-dlg__etapes"><li>Administration → <strong>Factures → Réglages</strong> → « Envoi des factures par e-mail ».</li><li>Suivez les étapes Gmail (mot de passe d’application), puis revenez ici.</li></ol>
      <p class="detail">En attendant, utilisez « Télécharger le fichier PDF » puis « Préparer l’e-mail dans ma messagerie ».</p>
      <div class="f-dlg__btns"><button class="b b--or" value="annuler" formnovalidate>Compris</button></div>`, async () => {});
  }
  const sujet = `${type === 'relance' ? 'Rappel : ' : ''}${TITRES[F.type]} ${F.number} — ${S.company_name || 'Saveurs des Rois'}`;
  dialogue(`<h2>${type === 'relance' ? 'Relancer par e-mail' : 'Envoyer la facture par e-mail'}</h2>
    <label>À<input name="to" required value="${esc(c.email || '')}" placeholder="adresse@client.fr"></label>
    <label>Objet<input name="subject" value="${esc(sujet)}"></label>
    <label>Message<textarea name="message" rows="10">${esc(texteClient(type))}</textarea></label>
    <label class="f-dlg__case"><input type="checkbox" name="copie" checked> M’envoyer une copie (${esc(MAIL.from)})</label>
    <p class="detail">📎 ${esc(nomFichier())} sera joint automatiquement.${MAIL.via === 'smtp' ? ' L’e-mail apparaîtra aussi dans vos « Messages envoyés ».' : ''}</p>
    <div class="f-dlg__btns"><button class="b b--ligne" value="annuler" formnovalidate>Annuler</button><button class="b b--or" type="submit">Envoyer</button></div>`,
  async fd => {
    const to = String(fd.get('to') || '').trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+/.test(to)) throw new Error('Indiquez l’adresse e-mail du client.');
    etat('Préparation du PDF…');
    const pdf = await enBase64(await pdfBlob());
    etat('Envoi en cours…');
    await api(`/api/admin/invoices/${id}/email`, { method: 'POST', body: JSON.stringify({
      to, subject: fd.get('subject'), message: fd.get('message'), copie: fd.has('copie'), relance: type === 'relance', pdf, filename: nomFichier(),
    }) });
    await charger(); etat(type === 'relance' ? `Relance envoyée à ${to} ✓` : `Facture envoyée à ${to} ✓`);
  });
}

/* ---------- Boîte de dialogue */
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

$('#actions').addEventListener('click', async e => {
  const b = e.target.closest('button'); if (!b) return;
  try {
    if (b.id === 'enregistrer') await enregistrer();
    if (b.id === 'apercu') { if (modifie) await enregistrer(); await imprimer(); }
    if (b.id === 'pdf') await imprimer();
    if (b.id === 'supprimer' && confirm('Supprimer ce brouillon ?')) { await api(`/api/admin/invoices/${id}`, { method: 'DELETE' }); modifie = false; location.href = '/admin/#factures'; }
    if (b.id === 'valider') {
      await enregistrer();
      const t = totaux();
      if (!confirm(`Valider cette ${TITRES[F.type].toLowerCase()} de ${euro(t.net)} pour ${F.client.societe || F.client.nom || 'ce client'} ?\n\nElle recevra son numéro définitif et ne pourra plus être modifiée (une erreur se corrigera par un avoir).`)) return;
      const r = await api(`/api/admin/invoices/${id}/valider`, { method: 'POST' });
      await charger(); etat(`Facture validée : ${r.number} ✓`);
    }
    if (b.id === 'paiement') {
      const t = totaux(), avoir = F.type === 'avoir';
      dialogue(`<h2>${avoir ? 'Remboursement' : 'Paiement reçu'}</h2>
        <label>Montant (€)<input name="montant" inputmode="decimal" required value="${prixTxt(Math.abs(t.reste))}"></label>
        <label>Date<input name="date" type="date" required value="${aujourdhui()}"></label>
        <label>Mode de paiement<select name="method">${METHODES.map(m => `<option>${m}</option>`).join('')}</select></label>
        <label>Note (facultatif)<input name="note" placeholder="Ex : solde au retrait"></label>
        <div class="f-dlg__btns"><button class="b b--ligne" value="annuler" formnovalidate>Annuler</button><button class="b b--or" type="submit">Enregistrer</button></div>`,
      async fd => {
        const montant = Math.round(nb(fd.get('montant')) * 100);
        if (!(montant > 0)) throw new Error('Indiquez le montant.');
        await api(`/api/admin/invoices/${id}/payments`, { method: 'POST', body: JSON.stringify({ amount_cents: montant, date: fd.get('date'), method: fd.get('method'), note: fd.get('note') }) });
        await charger(); etat('Paiement enregistré ✓');
      });
    }
    if (b.id === 'verifSumup') {
      const r = await api(`/api/admin/invoices/${id}/sumup`, { method: 'POST' });
      if (r.error) etat(r.error, false);
      else if (r.status === 'PAID') { await charger(); etat(r.nouveau ? 'Paiement SumUp reçu et enregistré ✓' : 'Paiement SumUp déjà enregistré ✓'); }
      else etat(`SumUp : paiement ${({ PENDING: 'en attente', FAILED: 'échoué', EXPIRED: 'expiré' })[r.status] || r.status.toLowerCase()}.`, false);
    }
    if (b.id === 'avoir' && confirm('Créer un avoir pour cette facture ?\n\nUn brouillon d’avoir du montant total s’ouvre : vous pourrez l’ajuster (avoir partiel) avant de le valider.')) {
      const r = await api('/api/admin/invoices', { method: 'POST', body: JSON.stringify({ mode: 'avoir', parent_id: +id }) });
      location.href = `/admin/facture.html?id=${r.id}`;
    }
  } catch (err) { etat(err.message, false); }
});
$('#actions').addEventListener('change', e => { if (e.target.id === 'estPro') { F.is_pro = e.target.checked ? 1 : 0; modifie = true; rendu(); } });

$('#suivi').addEventListener('click', async e => {
  const t = e.target;
  try {
    if (t.closest('[data-direct]')) return dlgEnvoi(t.closest('[data-direct]').dataset.direct);
    if (t.closest('[data-fichier]')) {
      etat('Préparation du PDF…');
      const a = document.createElement('a'); a.href = URL.createObjectURL(await pdfBlob()); a.download = nomFichier();
      document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); etat('PDF téléchargé ✓'); return;
    }
    if (t.closest('[data-partager]')) {
      etat('Préparation du PDF…');
      const f = new File([await pdfBlob()], nomFichier(), { type: 'application/pdf' });
      await navigator.share({ files: [f], title: document.title, text: texteClient('envoi') }).catch(e => { if (e.name !== 'AbortError') throw e; });
      etat(''); return;
    }
    if (t.closest('[data-relance="relance"]')) { api(`/api/admin/invoices/${id}`, { method: 'PUT', body: JSON.stringify({ relance: true }) }).then(charger).catch(() => {}); }
    if (t.id === 'lienSave') { await api(`/api/admin/invoices/${id}`, { method: 'PUT', body: JSON.stringify({ payment_link: $('#lienSumup').value.trim() }) }); await charger(); etat('Lien de paiement enregistré ✓'); }
    if (t.id === 'copierLien') { await navigator.clipboard.writeText(LIEN); etat('Lien copié ✓'); }
    if (t.dataset.delpay && confirm('Retirer ce paiement ?')) { await api(`/api/admin/payments/${t.dataset.delpay}`, { method: 'DELETE' }); await charger(); etat('Paiement retiré.'); }
  } catch (err) { etat(err.message, false); }
});

/* ---------- Démarrage */
async function charger() {
  const d = await api(`/api/admin/invoices/${id}`);
  F = d.invoice; PAY = d.payments; REL = d.related; S = d.settings; LIEN = d.paylink; SUMUP = d.sumup; MAIL = d.mail || { actif: false };
  rendu();
}
(async () => {
  if (!id) { doc.innerHTML = '<p class="chargement">Aucune facture indiquée. Ouvrez-la depuis l’onglet Factures.</p>'; return; }
  try { await charger(); etat(brouillon() ? 'Brouillon' : `${TITRES[F.type]} ${F.number}`); }
  catch (e) { doc.innerHTML = `<p class="chargement">${esc(e.message)}</p>`; }
})();
