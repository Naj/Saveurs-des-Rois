/* Saveurs des Rois — espace administrateur */

const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const euro = c => ((c || 0) / 100).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' });
const STATUSES = ['nouveau', 'en cours', 'devis envoyé', 'confirmé', 'archivé'];
const STATIC_IMAGES = ['sable-royal', 'cornes-de-gazelle', 'cornes-de-gazelle-coffrets', 'chbakia', 'haloua-sesame', 'makrout'].map(n => `/assets/img/${n}.webp`);

const st = { products: [], videos: [], settings: {}, requests: [], media: [], gallery: [], reviews: [], tab: 'demandes', current: null, filter: 'actives', avisFiltre: 'en attente', statsJours: 30 };

/* ---------------- API */
async function api(path, opts = {}) {
  const r = await fetch(path, {
    credentials: 'same-origin', ...opts,
    headers: opts.body instanceof FormData ? {} : { 'Content-Type': 'application/json' },
    body: opts.body && !(opts.body instanceof FormData) ? JSON.stringify(opts.body) : opts.body,
  });
  const data = await r.json().catch(() => ({}));
  if (r.status === 401 && !path.endsWith('/login')) { showLogin(); throw new Error(data.error || 'Session expirée.'); }
  if (!r.ok) throw new Error(data.error || `Erreur ${r.status}`);
  return data;
}

let tt;
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('is-on'); clearTimeout(tt); tt = setTimeout(() => t.classList.remove('is-on'), 3200); }
async function run(fn, okMsg) { try { await fn(); if (okMsg) toast(okMsg); } catch (e) { toast(e.message); } }

/* ---------------- Auth */
function showLogin() { $('#login').hidden = false; $('#dash').hidden = true; $('#logout').hidden = true; $('#pw').focus(); }
$('#loginForm').addEventListener('submit', async e => {
  e.preventDefault();
  const msg = $('#loginMsg'); msg.hidden = true;
  try { await api('/api/admin/login', { method: 'POST', body: { password: $('#pw').value, remember: $('#remember').checked } }); $('#pw').value = ''; start(); }
  catch (err) { msg.textContent = err.message; msg.hidden = false; }
});
$('#logout').addEventListener('click', async () => { await api('/api/admin/logout', { method: 'POST' }).catch(() => {}); showLogin(); });

async function start() {
  try {
    const [o, r, a] = await Promise.all([api('/api/admin/overview'), api('/api/admin/requests'), api('/api/admin/reviews')]);
    Object.assign(st, o, { requests: r.requests, reviews: a.reviews });
  } catch { return showLogin(); }
  $('#login').hidden = true; $('#dash').hidden = false; $('#logout').hidden = false;
  const onglet = location.hash.slice(1); // raccourcis de l'application : /admin/#produits…
  if (onglet && document.querySelector(`[data-tab="${CSS.escape(onglet)}"]`)) {
    st.tab = onglet; document.querySelectorAll('[data-tab]').forEach(x => x.setAttribute('aria-selected', x.dataset.tab === onglet));
  }
  countNew(); render();
}
function countNew() {
  const n = st.requests.filter(r => r.status === 'nouveau').length; const b = $('#newCount'); b.textContent = n; b.hidden = !n;
  const a = st.reviews.filter(r => r.status === 'en attente').length; const c = $('#avisCount'); c.textContent = a; c.hidden = !a;
  const al = st.alerts || {}; $('#alertDot').hidden = Boolean(st.version && (al.email || al.whatsapp));
}

document.querySelectorAll('[data-tab]').forEach(b => b.addEventListener('click', () => {
  st.tab = b.dataset.tab;
  document.querySelectorAll('[data-tab]').forEach(x => x.setAttribute('aria-selected', x === b));
  render();
}));

function render() {
  const fn = { carte: tCarte, sauvegarde: tSauvegarde, alertes: tAlertes, demandes: tDemandes, produits: tProduits, galerie: tGalerie, avis: tAvis, stats: tStats, textes: tTextes, videos: tVideos, medias: tMedias }[st.tab];
  $('#panel').innerHTML = fn();
  if (st.tab === 'medias') loadMedia();
  if (st.tab === 'textes') { majMusique(); if (!st.files) chargerFichiers().then(majMusique); }
  if (st.tab === 'carte' && !st.files) chargerFichiers().then(render);
  if (st.tab === 'stats') loadStats().catch(e => { $('#statsZone').innerHTML = `<p class="message message--err">${esc(e.message)}</p>`; });
  if (st.tab === 'produits') { refreshProdHelpers(); majGrille($('#prodForm')); }
}

/* ---------------- Demandes */
function demandeAvisLien(r) {
  const lien = `${location.origin}/#/avis`;
  const prenom = (r.name || '').split(' ')[0];
  const texte = `Bonjour ${prenom}, merci encore pour votre confiance ! Si nos pâtisseries vous ont plu, votre avis nous aiderait beaucoup : ${lien} — Saveurs des Rois`;
  const tel = (r.phone || '').replace(/\D/g, '').replace(/^0/, '33');
  return [tel && `<a href="https://wa.me/${tel}?text=${encodeURIComponent(texte)}" target="_blank" rel="noopener">Demander un avis (WhatsApp)</a>`,
    r.email && `<a href="mailto:${esc(r.email)}?subject=${encodeURIComponent('Votre avis compte pour nous')}&body=${encodeURIComponent(texte)}">Demander un avis (e-mail)</a>`].filter(Boolean).join('');
}
const ADMIN_VERSION = '3.0';
function alertBanner() {
  if (!st.version) return `<button class="adm-alerte adm-alerte--warn" data-goto="alertes">⚠️ Serveur du site pas à jour — voir l’onglet Alertes</button>`;
  const a = st.alerts || {};
  const on = [a.email && 'e-mail', a.whatsapp && 'WhatsApp'].filter(Boolean);
  return on.length
    ? `<button class="adm-alerte adm-alerte--on" data-goto="alertes">🔔 Alertes actives : ${on.join(' + ')}</button>`
    : `<button class="adm-alerte" data-goto="alertes">🔕 Alertes de devis désactivées — les activer</button>`;
}

/* ---------------- Sauvegarde */
const LAST_BACKUP = 'sdr_derniere_sauvegarde';
function derniereSauvegarde() { try { return localStorage.getItem(LAST_BACKUP); } catch { return null; } }
function tSauvegarde() {
  const d = derniereSauvegarde();
  return `<h1>Sauvegarde de vos données</h1>
  <div class="adm-item adm-rassure">
    <h2 style="font-size:1.1rem;margin-top:0">Vos fiches ne sont jamais effacées par une mise à jour</h2>
    <p>Produits, prix, grilles, textes, photos importées, avis, galerie et demandes sont stockés dans la base de données Cloudflare, <strong>pas dans les fichiers du site</strong>. Remplacer les fichiers sur GitHub ne les touche pas : la mise à jour ajoute seulement les nouveautés, sans rien écraser.</p>
    <p style="margin-bottom:0">La sauvegarde ci-dessous est une sécurité en plus : une copie complète sur votre ordinateur, à refaire de temps en temps (par exemple une fois par mois et avant chaque grosse modification).</p>
  </div>
  <section class="adm-item">
    <h2 style="font-size:1.1rem;margin-top:0">1. Télécharger une sauvegarde</h2>
    <p class="note">${d ? `Dernière sauvegarde depuis cet appareil : <strong>${new Date(d).toLocaleDateString('fr-FR', { dateStyle: 'long' })}</strong>.` : 'Aucune sauvegarde faite depuis cet appareil.'}</p>
    <div class="adm-actions">
      <a class="btn btn--or" href="/api/admin/backup" data-backup>Sauvegarder (fiches, textes, avis, devis)</a>
      <a class="btn btn--ligne" href="/api/admin/backup?media=1" data-backup>Sauvegarder avec les photos importées</a>
    </div>
    <p class="note">Un fichier <code>sauvegarde-saveurs-des-rois-AAAA-MM-JJ.json</code> est enregistré dans vos Téléchargements. Rangez-le dans un endroit sûr (Google Drive, clé USB…).</p>
  </section>
  <section class="adm-item">
    <h2 style="font-size:1.1rem;margin-top:0">2. Restaurer une sauvegarde</h2>
    <p class="note">Remet les éléments du fichier dans la base. Les éléments existants portant le même identifiant sont remplacés ; ce qui n’est pas dans le fichier est conservé.</p>
    <div class="adm-restore">
      ${[['products', 'Produits (fiches, prix, grilles)', true], ['settings', 'Textes, contact, réglages devis', true], ['gallery', 'Galerie', true], ['reviews', 'Avis', true], ['videos', 'Vidéos', true], ['requests', 'Demandes et devis', true], ['media', 'Photos importées', true]]
        .map(([k, l, c]) => `<label class="adm-check"><input type="checkbox" name="only" value="${k}" ${c ? 'checked' : ''}> ${l}</label>`).join('')}
    </div>
    <label class="btn btn--sombre adm-upload">Choisir le fichier de sauvegarde…<input type="file" accept=".json,application/json" id="restoreFile" hidden></label>
    <p id="restoreMsg" class="note"></p>
  </section>`;
}
function rappelSauvegarde() {
  const d = derniereSauvegarde();
  const vieux = !d || Date.now() - new Date(d) > 30 * 86400000;
  return vieux ? `<button class="adm-alerte adm-alerte--warn" data-goto="sauvegarde">💾 ${d ? 'Dernière sauvegarde il y a plus d’un mois' : 'Pensez à sauvegarder vos fiches'}</button>` : '';
}

/* ---------------- Alertes de devis */
function tAlertes() {
  const a = st.alerts || {}, t = st.alertTargets || {};
  const aucun = !a.email && !a.whatsapp;
  const carte = (titre, actif, cible, etapes) => `
    <section class="adm-item adm-canal ${actif ? 'adm-canal--on' : ''}">
      <header><h2 style="font-size:1.15rem;margin:0">${titre}</h2><span class="adm-pastille">${actif ? '● Actif' : '○ Non configuré'}</span></header>
      ${actif ? `<p class="adm-meta" style="margin:.4rem 0 0">Destinataire : <strong>${esc(cible)}</strong></p>` : `<ol class="adm-etapes">${etapes}</ol>`}
    </section>`;
  return `
  <h1>Alertes de devis</h1>
  ${!st.version ? `<div class="message message--err"><strong>Le serveur du site n’est pas à jour.</strong> Vérifiez sur GitHub que le fichier <code>public/_worker.js</code> a bien été remplacé, attendez la fin du déploiement dans Cloudflare, puis rechargez cette page (Ctrl + F5).</div>` : ''}
  <p>À chaque demande de devis, message ou nouvel avis, le site peut vous prévenir par e-mail et/ou WhatsApp. Les réglages se font dans Cloudflare (secrets), pas ici : cette page vous indique l’état et permet d’envoyer un test.</p>
  <div class="adm-test">
    <button class="btn btn--or" id="testAlert" ${aucun ? 'disabled' : ''}>Envoyer une alerte de test</button>
    <span class="note">${aucun ? 'Activez d’abord au moins un canal ci-dessous.' : 'Vous devez la recevoir dans la minute.'}</span>
  </div>
  ${carte('📧 Par e-mail (Resend)', a.email, t.email, `
    <li>Créez un compte gratuit sur <a href="https://resend.com" target="_blank" rel="noopener">resend.com</a> avec l’adresse qui doit recevoir les alertes.</li>
    <li>Menu <strong>API Keys → Create API Key</strong> (permission <em>Sending access</em>) et copiez la clé <code>re_…</code>.</li>
    <li>Cloudflare → <strong>Workers et Pages → saveurs-des-rois → Paramètres → Variables et secrets → + Ajouter</strong>, type <strong>Secret</strong> :<br><code>RESEND_API_KEY</code> = la clé — <code>ALERT_EMAIL</code> = votre adresse.</li>
    <li>Onglet <strong>Deployments</strong> → dernier déploiement → <strong>⋯ → Retry deployment</strong>, puis rechargez cette page.</li>`)}
  ${carte('💬 Par WhatsApp (CallMeBot)', a.whatsapp, t.whatsapp, `
    <li>Sur <a href="https://www.callmebot.com/blog/free-api-whatsapp-messages/" target="_blank" rel="noopener">callmebot.com</a>, notez le numéro du bot et la phrase d’activation.</li>
    <li>Envoyez cette phrase depuis votre WhatsApp à ce numéro : vous recevez votre <strong>apikey</strong>.</li>
    <li>Cloudflare → <strong>Variables et secrets → + Ajouter</strong>, type <strong>Secret</strong> :<br><code>CALLMEBOT_PHONE</code> = votre numéro au format 33612345678 — <code>CALLMEBOT_APIKEY</code> = l’apikey.</li>
    <li><strong>Retry deployment</strong>, puis rechargez cette page.</li>`)}
  <p class="note">Version de l’administration : ${ADMIN_VERSION} · serveur : ${esc(st.version || 'ancien')}</p>`;
}
function tDemandes() {
  const list = st.requests.filter(r => st.filter === 'toutes' || (st.filter === 'actives' ? r.status !== 'archivé' : r.status === st.filter));
  return `
  <div class="adm-bar">
    <h1 style="margin:0">Demandes de devis et messages</h1>
    ${alertBanner()}${rappelSauvegarde()}
    <select id="filter" aria-label="Filtrer">
      ${['actives', 'toutes', ...STATUSES].map(s => `<option ${s === st.filter ? 'selected' : ''}>${s}</option>`).join('')}
    </select>
  </div>
  <div class="adm-list">
    ${list.length ? list.map(r => `
    <article class="adm-item ${r.status === 'nouveau' ? 'adm-item--nouveau' : ''}">
      <header>
        <h3>${esc(r.name)} <span class="adm-meta">— ${r.kind === 'contact' ? 'message' : 'devis'}</span></h3>
        <span class="adm-meta">${new Date(r.created_at + 'Z').toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' })}</span>
      </header>
      <p class="adm-meta">${[r.phone && `<a href="tel:${esc(r.phone)}">${esc(r.phone)}</a>`, r.email && `<a href="mailto:${esc(r.email)}">${esc(r.email)}</a>`, r.event_type, r.event_date && 'le ' + new Date(r.event_date).toLocaleDateString('fr-FR'), r.delivery].filter(Boolean).join(' · ')}</p>
      ${r.items.length ? `<ul>${r.items.map(i => `<li>${i.unit === 'kg' ? `${String(i.qty).replace('.', ',')} kg de` : `${i.qty} ×`} ${esc(i.name)} (${i.unit_cents ? euro(i.unit_cents) + ' ' : ''}${esc(i.label || '')})${i.unit === 'kg' ? ' <strong class="adm-pro">PRO</strong>' : ''}</li>`).join('')}</ul><p><strong>Estimation : ${euro(r.estimate_cents)}</strong></p>` : ''}
      ${r.message ? `<p style="white-space:pre-wrap">${esc(r.message)}</p>` : ''}
      <div class="adm-actions">
        <select data-status="${r.id}" aria-label="Statut">${STATUSES.map(s => `<option ${s === r.status ? 'selected' : ''}>${s}</option>`).join('')}</select>
        ${r.kind === 'devis' ? `<a class="btn btn--or btn--petit" href="/admin/devis.html?id=${r.id}" target="_blank" rel="noopener">${r.quote ? 'Ouvrir le devis PDF' : 'Préparer le devis PDF'}</a>` : ''}
        ${r.email ? `<a href="mailto:${esc(r.email)}?subject=${encodeURIComponent('Votre devis Saveurs des Rois')}">Répondre par e-mail</a>` : ''}
        ${r.phone ? `<a href="https://wa.me/${esc(r.phone.replace(/\D/g, '').replace(/^0/, '33'))}" target="_blank" rel="noopener">WhatsApp</a>` : ''}
        ${r.kind === 'devis' && ['confirmé', 'archivé'].includes(r.status) ? demandeAvisLien(r) : ''}
        <button class="lien" data-delreq="${r.id}" style="color:var(--err)">Supprimer</button>
      </div>
    </article>`).join('') : '<div class="vide">Aucune demande dans cette catégorie.</div>'}
  </div>`;
}

/* ---------------- Produits */
const ALLERGENES = ['Gluten', 'Crustacés', 'Œufs', 'Poissons', 'Arachides', 'Soja', 'Lait', 'Fruits à coque',
  'Céleri', 'Moutarde', 'Sésame', 'Sulfites', 'Lupin', 'Mollusques'];
const GUIDE = {
  name: 'Ex : Ghriba aux amandes',
  arabic_name: 'Ex : غريبة',
  tagline: 'Une phrase courte et évocatrice. Ex : L’élégance en une bouchée',
  description: 'Décrivez en 3 à 5 phrases : la texture (fondant, croustillant…), les parfums (fleur d’oranger, miel, cannelle…), le geste artisanal et la finition (dorée, enrobée de miel, feuille d’or…).',
  ingredients: 'Par ordre décroissant de quantité, séparés par des virgules. Ex : Farine, Beurre, Sucre glace, Amande, Œuf, Sel',
  allergens: 'Ex : Gluten (blé), Lait (beurre), Œufs, Fruits à coque (amande) — utilisez les boutons ci-dessous',
  traces: 'Ex : Peut contenir des traces de fruits à coque.',
};

function tProduits() {
  if (!st.current && st.products.length) st.current = st.products[0].id;
  let body;
  if (st.current === '__new' && !st.draft) body = choixModele();
  else {
    const p = st.current === '__new' ? st.draft : st.products.find(x => x.id === st.current);
    body = p ? formProduit(p) : '<div class="vide">Aucun produit.</div>';
  }
  return `
  <div class="adm-bar"><h1 style="margin:0">Produits</h1><button class="btn btn--sombre btn--petit" id="newProd">Ajouter une recette</button></div>
  <div class="adm-prods">
    <div class="adm-plist">
      ${st.current === '__new' ? `<button aria-current="true"><img src="/assets/img/favicon.png" alt=""><span>Nouvelle recette<br><small>brouillon</small></span></button>` : ''}
      ${st.products.map(x => `<button data-prod="${esc(x.id)}" aria-current="${x.id === st.current}" class="${x.visible ? '' : 'adm-off'}"><img src="${esc(x.image || '/assets/img/favicon.png')}" alt=""><span>${esc(x.name)}<br><small>${prixListe(x)}${x.visible ? '' : ' · masqué'}</small></span>${x.featured ? '<small title="Mis en avant">★</small>' : ''}</button>`).join('')}
    </div>
    ${body}
  </div>`;
}

function choixModele() {
  return `<div class="adm-fieldset adm-modele">
    <h2>Nouvelle recette</h2>
    <p>Choisissez votre point de départ. La recette est créée <strong>masquée</strong> : elle n’apparaît sur le site que lorsque vous cochez « Visible ».</p>
    <div class="adm-choix">
      <button type="button" class="adm-choix__btn" data-start="blank">
        <strong>Fiche guidée vierge</strong>
        <span>Chaque champ est accompagné d’un exemple, avec la liste des 14 allergènes réglementaires et le calcul automatique de l’énergie.</span>
      </button>
      <div class="adm-choix__btn">
        <strong>Partir d’une fiche existante</strong>
        <span>Reprend le prix, l’unité, le seuil, la composition et les valeurs nutritionnelles. Vous changez ensuite le nom, la photo et ce qui diffère.</span>
        <div style="display:flex;gap:.5rem;flex-wrap:wrap;margin-top:.6rem">
          <select id="copyFrom" aria-label="Fiche à copier">${st.products.map(p => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('')}</select>
          <button type="button" class="btn btn--sombre btn--petit" data-start="copy">Utiliser ce modèle</button>
        </div>
      </div>
    </div>
  </div>`;
}

function startDraft(mode) {
  const base = { id: '', name: '', arabic_name: '', tagline: '', description: '', price_cents: null, price_label: 'la pièce', threshold: null,
    ingredients: '', allergens: '', traces: '', image: '', gallery: [], visible: 0, featured: 0, position: (st.products.length + 1) * 10 };
  if (mode === 'copy') {
    const src = st.products.find(p => p.id === $('#copyFrom').value);
    for (const k of ['price_mode', 'price_cents', 'price_kg_cents', 'min_kg', 'price_label', 'threshold', 'tiers', 'ingredients', 'allergens', 'traces', 'energy_kcal', 'proteins', 'carbs', 'fats', 'salt']) base[k] = src[k];
    base.copiedFrom = src.name;
  }
  st.draft = base;
}

function checklist(p) {
  const has = v => v != null && String(v).trim() !== '';
  return [
    ['Nom', has(p.name), true], ['Prix', prixOk(p), true], ['Photo principale', has(p.image), true],
    ['Description', has(p.description), true], ['Ingrédients', has(p.ingredients), true], ['Allergènes', has(p.allergens), true],
    ['Valeurs nutritionnelles', ['energy_kcal', 'proteins', 'carbs', 'fats', 'salt'].every(k => has(p[k])), false],
  ];
}
const PALIERS_DEFAUT = [10, 20, 30];
function grilleLignes(p) {
  const t = Array.isArray(p.tiers) ? [...p.tiers] : [];
  PALIERS_DEFAUT.forEach((m, i) => { if (!t[i]) t[i] = { min: t.length ? (t[i - 1]?.min || 0) + 10 : m, price_cents: null }; });
  return t.slice(0, Math.max(3, t.length));
}
function lireGrille(form) {
  const out = [];
  for (let i = 0; form.elements[`tier_min_${i}`]; i++) {
    const min = parseInt(form.elements[`tier_min_${i}`].value, 10);
    const pr = parseFloat(String(form.elements[`tier_price_${i}`].value).replace(',', '.'));
    if (min >= 2 && Number.isFinite(pr) && pr > 0) out.push({ min, price_cents: Math.round(pr * 100) });
  }
  return out.sort((a, b) => a.min - b.min);
}
function majGrille(form) {
  if (!form?.elements.tier_min_0) return;
  const base = parseFloat(String(form.elements.price.value).replace(',', '.')) * 100;
  const msgs = [];
  let prec = base;
  for (let i = 0; form.elements[`tier_min_${i}`]; i++) {
    const cell = form.querySelector(`[data-remise="${i}"]`);
    const pr = parseFloat(String(form.elements[`tier_price_${i}`].value).replace(',', '.')) * 100;
    if (!Number.isFinite(pr) || !(base > 0)) { cell.textContent = ''; continue; }
    cell.textContent = pr < base ? `− ${Math.round((1 - pr / base) * 100)} %` : '';
    if (pr >= prec) msgs.push(`le palier ${form.elements[`tier_min_${i}`].value} pièces devrait être moins cher que le précédent`);
    prec = Math.min(prec, pr);
  }
  const el = form.querySelector('#grilleMsg');
  el.style.color = msgs.length ? 'var(--err)' : '';
  el.textContent = msgs.length ? 'Attention : ' + msgs.join(' ; ') + '.' : 'Exemple : 0,70 € de base, puis 0,65 € dès 10, 0,60 € dès 20, 0,55 € dès 30 pièces.';
}

function prixOk(p) {
  const m = p.price_mode || 'piece';
  const piece = p.price_cents > 0, kg = p.price_kg_cents > 0;
  return m === 'devis' || (m === 'piece' && piece) || (m === 'kg' && kg) || (m === 'both' && piece && kg);
}
function apercuPrix(p) {
  const m = p.price_mode || 'piece';
  const piece = `<p class="carte__prix"><strong>${p.price_cents ? euro(p.price_cents) : '— €'}</strong> ${esc(p.price_label || 'la pièce')}</p>${(p.tiers || []).length ? `<p class="carte__seuil">Dès ${p.tiers[0].min} pièces : ${euro(p.tiers[0].price_cents)}${p.tiers.length > 1 ? ` · jusqu’à ${euro(p.tiers.at(-1).price_cents)}` : ''}</p>` : ''}`;
  const kg = `<strong>${p.price_kg_cents ? euro(p.price_kg_cents) : '— €'}</strong> le kg`;
  if (m === 'devis') return '<p class="carte__prix"><strong>Prix sur devis</strong></p>';
  if (m === 'kg') return `<p class="carte__prix">${kg}</p><p class="carte__seuil">Professionnels · vente au poids</p>`;
  if (m === 'both') return `${piece}<p class="carte__seuil">Pros : ${kg}</p>`;
  return piece;
}
function prixListe(x) {
  const m = x.price_mode || 'piece';
  return m === 'devis' ? 'sur devis' : m === 'kg' ? `${euro(x.price_kg_cents)} /kg` : m === 'both' ? `${euro(x.price_cents)} · ${euro(x.price_kg_cents)} /kg` : euro(x.price_cents);
}
function checklistHtml(p) {
  return checklist(p).map(([label, ok, req]) => `<li class="${ok ? 'ok' : req ? 'manque' : 'conseil'}">${ok ? '✓' : req ? '✗' : '○'} ${label}${!ok && !req ? ' <small>(recommandé)</small>' : ''}</li>`).join('');
}

function formProduit(p) {
  const isNew = !p.id;
  const ph = k => (GUIDE[k] ? `placeholder="${esc(GUIDE[k])}"` : '');
  const f = (name, label, type = 'text', extra = '') => `<div class="champ"><label for="p-${name}">${label}</label><input id="p-${name}" name="${name}" type="${type}" value="${esc(p[name] ?? '')}" ${ph(name)} ${extra}></div>`;
  const ta = (name, label, rows = 4, help = '') => `<div class="champ"><label for="p-${name}">${label}</label>${help ? `<span class="aide">${help}</span>` : ''}<textarea id="p-${name}" name="${name}" rows="${rows}" ${ph(name)}>${esc(p[name] ?? '')}</textarea></div>`;
  const prix = p.price_cents == null ? '' : (p.price_cents / 100).toFixed(2).replace('.', ',');
  return `
  <form id="prodForm" data-new="${isNew}">
    ${isNew ? `<p class="message message--ok">Nouvelle recette${p.copiedFrom ? ` — modèle : <strong>${esc(p.copiedFrom)}</strong> (vérifiez la composition)` : ' — fiche guidée'}. Elle restera masquée tant que « Visible sur le site » n’est pas coché.</p>` : ''}
    <div class="adm-apercu">
      <div class="carte" id="apercuCarte"></div>
      <div><h2 style="font-size:1.05rem;margin:0 0 .4rem">Prêt à publier ?</h2><ul class="adm-checklist" id="checklist">${checklistHtml(p)}</ul></div>
    </div>
    <fieldset class="adm-fieldset"><legend>1. Présentation</legend>
      <div class="deux">${f('name', 'Nom', 'text', 'required')}${f('arabic_name', 'Nom en arabe (facultatif)', 'text', 'dir="rtl" lang="ar"')}</div>
      ${f('tagline', 'Accroche (facultatif)')}
      ${ta('description', 'Description', 5, 'Une ligne vide crée un nouveau paragraphe.')}
      <div class="adm-check-row" style="display:flex;flex-wrap:wrap">
        <label class="adm-check"><input type="checkbox" name="visible" ${p.visible ? 'checked' : ''}> Visible sur le site</label>
        <label class="adm-check"><input type="checkbox" name="featured" ${p.featured ? 'checked' : ''}> Mis en avant sur l’accueil</label>
      </div>
    </fieldset>
    <fieldset class="adm-fieldset" data-mode="${esc(p.price_mode || 'piece')}" id="prixBloc"><legend>2. Prix</legend>
      <p class="adm-sous">Affichage du prix sur le site</p>
      <div class="adm-modes" role="radiogroup">
        ${[['piece', 'À la pièce', 'Particuliers, avec prix dégressif possible'],
           ['kg', 'Au kilo', 'Professionnels, vente au poids sans dégressivité'],
           ['both', 'Les deux', 'Pièce pour les particuliers + kilo pour les pros'],
           ['devis', 'Sur devis', 'Aucun prix affiché']].map(([v, t, d]) => `
          <label class="adm-mode"><input type="radio" name="price_mode" value="${v}" ${(p.price_mode || 'piece') === v ? 'checked' : ''}><span><strong>${t}</strong><small>${d}</small></span></label>`).join('')}
      </div>
      <div class="si-piece">
        <p class="adm-sous">Particuliers · à la pièce</p>
        <div class="deux">
          <div class="champ"><label for="p-price">Prix de base à la pièce (€)</label><input id="p-price" name="price" inputmode="decimal" value="${prix}" placeholder="Ex : 0,80"></div>
          ${f('price_label', 'Unité affichée', 'text', 'placeholder="la pièce"')}
        </div>
        <div class="adm-grille">
          <p class="adm-sous" style="margin-bottom:.3rem">Grille dégressive <small>(prix unitaire appliqué automatiquement ; laissez un prix vide pour désactiver le palier)</small></p>
          <table>
            <thead><tr><th>À partir de</th><th>Prix à la pièce</th><th>Remise</th></tr></thead>
            <tbody>${grilleLignes(p).map((t, i) => `<tr>
              <td><input name="tier_min_${i}" type="number" min="2" value="${esc(t.min)}" aria-label="Palier ${i + 1} : quantité"> pièces</td>
              <td><input name="tier_price_${i}" inputmode="decimal" value="${t.price_cents ? (t.price_cents / 100).toFixed(2).replace('.', ',') : ''}" placeholder="—" aria-label="Palier ${i + 1} : prix"> €</td>
              <td class="adm-remise" data-remise="${i}"></td></tr>`).join('')}</tbody>
          </table>
          <p class="note" id="grilleMsg"></p>
        </div>
      </div>
      <div class="si-kg">
        <p class="adm-sous">Professionnels · au poids <small>(prix fixe, jamais de dégressivité)</small></p>
        <div class="deux">
          <div class="champ"><label for="p-pricekg">Prix au kilo (€)</label><input id="p-pricekg" name="price_kg" inputmode="decimal" value="${p.price_kg_cents == null ? '' : (p.price_kg_cents / 100).toFixed(2).replace('.', ',')}" placeholder="Ex : 32,00"></div>
        </div>
      </div>
      ${f('position', 'Ordre d’affichage (plus petit = en premier)', 'number')}
    </fieldset>
    <fieldset class="adm-fieldset"><legend>3. Photos</legend>
      <p class="note" style="margin-top:0">Conseil : photo nette, lumière du jour, fond clair ou plateau doré, pâtisseries cadrées au centre (la photo est découpée en forme d’arche).</p>
      <div class="champ"><span>Photo principale</span>
        <div class="adm-img"><img id="p-img-prev" src="${esc(p.image || '')}" alt=""><input type="hidden" name="image" value="${esc(p.image || '')}"><button type="button" class="btn btn--ligne btn--petit" data-pick="image">${p.image ? 'Changer la photo' : 'Choisir une photo'}</button></div>
      </div>
      <div class="champ"><span>Photos supplémentaires</span>
        <div class="adm-gallery" id="gal">${(p.gallery || []).map(g => galItem(g)).join('')}<button type="button" class="btn btn--ligne btn--petit" data-pick="gallery">Ajouter</button></div>
      </div>
    </fieldset>
    <fieldset class="adm-fieldset"><legend>4. Ingrédients, allergènes, valeurs nutritionnelles</legend>
      ${ta('ingredients', 'Ingrédients', 3)}
      ${ta('allergens', 'Allergènes', 2)}
      <div class="adm-chips" aria-label="Ajouter un allergène réglementaire">${ALLERGENES.map(a => `<button type="button" data-allergene="${esc(a)}">+ ${esc(a)}</button>`).join('')}</div>
      ${f('traces', 'Traces éventuelles (facultatif)')}
      <p class="aide note">Valeurs pour 100 g</p>
      <div class="cinq">${f('energy_kcal', 'Énergie (kcal)', 'text', 'inputmode="decimal"')}${f('proteins', 'Protéines (g)', 'text', 'inputmode="decimal"')}${f('carbs', 'Glucides (g)', 'text', 'inputmode="decimal"')}${f('fats', 'Lipides (g)', 'text', 'inputmode="decimal"')}${f('salt', 'Sel (g)', 'text', 'inputmode="decimal"')}</div>
      <p style="margin:.2rem 0 .6rem"><button type="button" class="btn btn--ligne btn--petit" id="calcKcal">Calculer l’énergie depuis protéines, glucides et lipides</button></p>
      <p class="note" id="kcalCheck"></p>
    </fieldset>
    <div class="adm-sticky">
      <button class="btn btn--or" type="submit">${isNew ? 'Créer la recette' : 'Enregistrer'}</button>
      ${isNew ? '<button type="button" class="lien" id="cancelNew">Annuler</button>' : `<span style="display:flex;gap:.8rem;align-items:center"><a href="/#/p/${esc(p.id)}" target="_blank" rel="noopener">Voir sur le site</a><button type="button" class="btn btn--danger btn--petit" id="delProd">Supprimer</button></span>`}
    </div>
  </form>`;
}

/* Aperçu de la carte et liste de contrôle, mis à jour pendant la saisie */
function formSnapshot(form) {
  const d = Object.fromEntries(new FormData(form));
  const price = parseFloat(String(d.price || '').replace(',', '.'));
  const pkg = parseFloat(String(d.price_kg || '').replace(',', '.'));
  return { ...d, price_cents: Number.isFinite(price) ? Math.round(price * 100) : null, price_kg_cents: Number.isFinite(pkg) ? Math.round(pkg * 100) : null, tiers: lireGrille(form) };
}
function refreshProdHelpers() {
  const form = $('#prodForm'); if (!form) return;
  const p = formSnapshot(form);
  $('#checklist').innerHTML = checklistHtml(p);
  $('#apercuCarte').innerHTML = `
    <div class="arche"><img src="${esc(p.image || '/assets/img/logo-transparent.webp')}" alt=""></div>
    <h3>${esc(p.name || 'Nom de la recette')}</h3>
    <p class="carte__ar" lang="ar" dir="rtl">${esc(p.arabic_name || '')}</p>
    ${apercuPrix(p)}`;
  checkKcal(form);
}
const galItem = src => `<figure data-g="${esc(src)}"><img src="${esc(src)}" alt=""><button type="button" class="x" aria-label="Retirer">×</button></figure>`;

function readProdForm(form) {
  const fd = new FormData(form);
  const d = Object.fromEntries(fd);
  const eur = v => { const n = parseFloat(String(v ?? '').replace(',', '.')); return Number.isFinite(n) ? Math.round(n * 100) : null; };
  const mode = d.price_mode || 'piece';
  const out = {
    name: d.name.trim(), arabic_name: d.arabic_name, tagline: d.tagline, description: d.description,
    price_mode: mode, price_cents: eur(d.price) ?? 0, price_kg_cents: eur(d.price_kg),
    min_kg: null, // pas de minimum affiché : à voir au cas par cas
    tiers: lireGrille(form),
    price_label: d.price_label || 'la pièce', threshold: null, position: d.position || 0,
    ingredients: d.ingredients, allergens: d.allergens, traces: d.traces,
    energy_kcal: d.energy_kcal, proteins: d.proteins, carbs: d.carbs, fats: d.fats, salt: d.salt,
    image: d.image, gallery: [...form.querySelectorAll('#gal figure')].map(f => f.dataset.g),
    visible: fd.has('visible') ? 1 : 0, featured: fd.has('featured') ? 1 : 0,
  };
  if (['piece', 'both'].includes(mode) && !(out.price_cents > 0)) throw new Error('Indiquez le prix à la pièce (ex : 0,70).');
  if (['kg', 'both'].includes(mode) && !(out.price_kg_cents > 0)) throw new Error('Indiquez le prix au kilo (ex : 32,00).');
  if (!out.name) throw new Error('Le nom est obligatoire.');
  return out;
}

/* Contrôle de cohérence : kcal ≈ 4×protéines + 4×glucides + 9×lipides */
function checkKcal(form) {
  if (!form) return;
  const v = n => parseFloat(String(form.elements[n]?.value || '').replace(',', '.'));
  const [e, p, g, l] = ['energy_kcal', 'proteins', 'carbs', 'fats'].map(v);
  const el = $('#kcalCheck'); if (!el) return;
  if ([e, p, g, l].some(Number.isNaN)) { el.textContent = ''; return; }
  const calc = Math.round(4 * p + 4 * g + 9 * l);
  const ecart = Math.abs(calc - e) / e;
  el.style.color = ecart > 0.1 ? 'var(--err)' : 'var(--ok)';
  el.textContent = ecart > 0.1
    ? `Attention : d’après protéines, glucides et lipides, l’énergie devrait être proche de ${calc} kcal (vous indiquez ${e}). Vérifiez ces valeurs.`
    : `Valeurs cohérentes (calcul : ${calc} kcal).`;
}

/* ---------------- Galerie « Vos événements » */
const OCCASIONS = ['Mariage', 'Fiançailles', 'Naissance', 'Aïd / Ramadan', 'Anniversaire', 'Événement d’entreprise', 'Autre'];
function tGalerie() {
  const form = (g = {}) => `
    <form class="adm-item adm-gal-item" data-galerie="${g.id || ''}">
      <div class="adm-img">
        <img id="g-prev-${g.id || 'new'}" src="${esc(g.image || '')}" alt="">
        <input type="hidden" name="image" value="${esc(g.image || '')}">
        <button type="button" class="btn btn--ligne btn--petit" data-pick="galerie:${g.id || 'new'}">${g.image ? 'Changer la photo' : 'Choisir une photo'}</button>
      </div>
      <div class="deux">
        <div class="champ"><label>Titre (facultatif)</label><input name="title" value="${esc(g.title || '')}" placeholder="Ex : Mariage de Sarah & Karim"></div>
        <div class="champ"><label>Occasion</label><select name="event_type"><option value="">—</option>${OCCASIONS.map(o => `<option ${o === g.event_type ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select></div>
      </div>
      <div class="champ"><label>Légende (facultatif)</label><input name="caption" value="${esc(g.caption || '')}" placeholder="Ex : Plateau de 150 pièces, Cornes de Gazelle et Sablés Royaux"></div>
      <div class="trois">
        <div class="champ"><label>Ordre</label><input name="position" type="number" value="${esc(g.position ?? 0)}"></div>
        <label class="adm-check" style="align-self:end"><input type="checkbox" name="visible" ${g.id == null || g.visible ? 'checked' : ''}> Visible</label>
      </div>
      <div class="adm-actions"><button class="btn btn--sombre btn--petit" type="submit">${g.id ? 'Enregistrer' : 'Ajouter à la galerie'}</button>${g.id ? `<button type="button" class="lien" data-delgalerie="${g.id}" style="color:var(--err)">Retirer</button>` : ''}</div>
    </form>`;
  return `<h1>Galerie « Vos événements »</h1>
  <p class="note">Photos de vos plateaux et tables chez vos clients. <strong>Demandez toujours leur accord</strong> avant de publier une photo où apparaissent des personnes ou un lieu privé.</p>
  <h2 style="margin-top:1.5rem">Nouvelle photo</h2>${form()}
  <h2 style="margin-top:2rem">Photos publiées (${st.gallery.length})</h2>
  <div class="adm-list">${st.gallery.map(form).join('') || '<div class="vide">Aucune photo pour l’instant.</div>'}</div>`;
}

/* ---------------- Avis clients */
const REVIEW_STATUSES = ['en attente', 'publié', 'refusé'];
const etoiles = n => '★'.repeat(n) + '☆'.repeat(5 - n);
function tAvis() {
  const list = (st.reviews || []).filter(r => st.avisFiltre === 'tous' || r.status === st.avisFiltre);
  return `
  <div class="adm-bar"><h1 style="margin:0">Avis clients</h1>
    <select id="avisFiltre" aria-label="Filtrer">${['en attente', 'publié', 'refusé', 'tous'].map(s => `<option ${s === st.avisFiltre ? 'selected' : ''}>${s}</option>`).join('')}</select>
  </div>
  <p class="note">Les avis déposés sur le site attendent votre validation. Pour rester transparent (et conforme à la loi), publiez aussi les avis moins flatteurs dès qu’ils sont authentiques : vous pouvez y répondre publiquement.</p>
  <div class="adm-list">
    ${list.length ? list.map(r => `
    <article class="adm-item ${r.status === 'en attente' ? 'adm-item--nouveau' : ''}">
      <header><h3><span style="color:var(--or-profond)">${etoiles(r.rating)}</span> ${esc(r.name)} <span class="adm-meta">${r.event_type ? '— ' + esc(r.event_type) : ''}</span></h3>
        <span class="adm-meta">${new Date(r.created_at.replace(' ', 'T') + 'Z').toLocaleDateString('fr-FR')} · ${r.source === 'message' ? 'reçu par message' : 'déposé sur le site'} · <strong>${esc(r.status)}</strong></span></header>
      <p style="white-space:pre-wrap;margin:.5rem 0">${esc(r.text)}</p>
      <details ${r.reply ? 'open' : ''}><summary class="lien" style="cursor:pointer">Réponse publique${r.reply ? '' : ' (facultatif)'}</summary>
        <div class="champ" style="margin-top:.5rem"><textarea data-reply="${r.id}" rows="2" placeholder="Ex : Merci Samira, ce fut un plaisir de participer à votre mariage !">${esc(r.reply || '')}</textarea></div>
        <button class="btn btn--ligne btn--petit" data-savereply="${r.id}">Enregistrer la réponse</button>
      </details>
      <div class="adm-actions">
        ${r.status !== 'publié' ? `<button class="btn btn--or btn--petit" data-avis="${r.id}" data-status="publié">Publier</button>` : ''}
        ${r.status !== 'refusé' ? `<button class="btn btn--ligne btn--petit" data-avis="${r.id}" data-status="refusé">${r.status === 'publié' ? 'Retirer du site' : 'Refuser'}</button>` : ''}
        <button class="lien" data-delavis="${r.id}" style="color:var(--err)">Supprimer</button>
      </div>
    </article>`).join('') : '<div class="vide">Aucun avis dans cette catégorie.</div>'}
  </div>
  <h2 style="margin-top:2.5rem">Ajouter un avis reçu par message</h2>
  <p class="note">Pour un avis authentique reçu par WhatsApp, e-mail ou SMS (avec l’accord du client). Il sera indiqué « avis reçu par message » sur le site.</p>
  <form class="adm-item" id="avisManuel">
    <div class="trois">
      <div class="champ"><label>Prénom</label><input name="name" required placeholder="Ex : Nadia K."></div>
      <div class="champ"><label>Occasion</label><select name="event_type"><option value="">—</option>${OCCASIONS.map(o => `<option>${esc(o)}</option>`).join('')}</select></div>
      <div class="champ"><label>Note</label><select name="rating">${[5, 4, 3, 2, 1].map(n => `<option value="${n}">${etoiles(n)}</option>`).join('')}</select></div>
    </div>
    <div class="champ"><label>Texte de l’avis (tel que reçu)</label><textarea name="text" rows="3" required></textarea></div>
    <button class="btn btn--sombre btn--petit" type="submit">Publier cet avis</button>
  </form>`;
}

/* ---------------- Statistiques */
function tStats() {
  return `<div class="adm-bar"><h1 style="margin:0">Statistiques de visites</h1>
    <select id="statsJours" aria-label="Période">${[[7, '7 derniers jours'], [30, '30 derniers jours'], [90, '3 derniers mois'], [365, '12 derniers mois']].map(([v, l]) => `<option value="${v}" ${v === st.statsJours ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
  <p class="note">Mesure anonyme réalisée par le site : aucun cookie, aucune adresse IP, aucune donnée personnelle — seulement des compteurs par jour. Les robots sont exclus.</p>
  <div id="statsZone"><p>Chargement…</p></div>`;
}
async function loadStats() {
  const z = $('#statsZone'); if (!z) return;
  const d = await api(`/api/admin/stats?days=${st.statsJours}`);
  const sum = (kind, key) => d.rows.filter(r => r.kind === kind && (key === undefined || r.key === key)).reduce((t, r) => t + r.n, 0);
  const top = kind => Object.entries(d.rows.filter(r => r.kind === kind).reduce((o, r) => (o[r.key] = (o[r.key] || 0) + r.n, o), {})).sort((a, b) => b[1] - a[1]);
  const visites = sum('visite'), vues = sum('page'), fiches = sum('produit'), ajouts = sum('ajout');
  const devis = d.requests.filter(r => r.kind === 'devis').reduce((t, r) => t + r.n, 0);
  const taux = visites ? (devis / visites * 100).toFixed(1).replace('.', ',') + ' %' : '—';
  // Série par jour
  const jours = [];
  for (let i = d.days - 1; i >= 0; i--) jours.push(new Date(Date.now() - i * 86400000).toLocaleDateString('sv-SE', { timeZone: 'Europe/Paris' }));
  const parJour = jours.map(j => d.rows.filter(r => r.day === j && r.kind === 'visite').reduce((t, r) => t + r.n, 0));
  const max = Math.max(1, ...parJour);
  const W = 720, H = 180, bw = W / jours.length;
  const barres = parJour.map((v, i) => `<rect x="${(i * bw + bw * .15).toFixed(1)}" y="${(H - v / max * (H - 20)).toFixed(1)}" width="${(bw * .7).toFixed(1)}" height="${(v / max * (H - 20)).toFixed(1)}" rx="2"><title>${new Date(jours[i]).toLocaleDateString('fr-FR')} : ${v} visite${v > 1 ? 's' : ''}</title></rect>`).join('');
  const noms = Object.fromEntries(st.products.map(p => [p.id, p.name]));
  const pagesNoms = { accueil: 'Accueil', collection: 'La collection', p: 'Fiches pâtisseries', histoire: 'Notre histoire', evenements: 'Vos événements', avis: 'Laisser un avis', videos: 'En vidéo', contact: 'Contact', devis: 'Mon devis', mentions: 'Mentions légales' };
  const ajoutsPar = Object.fromEntries(top('ajout'));
  const tableau = (titre, rows, cols) => `<section class="adm-item"><h2 style="font-size:1.1rem">${titre}</h2>${rows.length ? `<table class="adm-table"><thead><tr>${cols.map(c => `<th>${c}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr>${r.map((c, i) => `<td${i ? ' class="num"' : ''}>${c}</td>`).join('')}</tr>`).join('')}</tbody></table>` : '<p class="note">Pas encore de données.</p>'}</section>`;
  const pct = (n, t) => t ? Math.round(n / t * 100) + ' %' : '';
  z.innerHTML = `
    <div class="adm-kpis">
      ${[['Visites', visites], ['Pages vues', vues], ['Fiches consultées', fiches], ['Ajouts au devis', ajouts], ['Demandes de devis', devis], ['Visites → devis', taux]].map(([l, v]) => `<div class="adm-kpi"><span>${l}</span><strong>${v}</strong></div>`).join('')}
    </div>
    <section class="adm-item"><h2 style="font-size:1.1rem">Visites par jour</h2>
      <svg class="adm-chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Visites par jour">${barres}</svg>
      <div class="adm-chart-axe"><span>${new Date(jours[0]).toLocaleDateString('fr-FR')}</span><span>max : ${max} / jour</span><span>${new Date(jours.at(-1)).toLocaleDateString('fr-FR')}</span></div>
    </section>
    <div class="adm-stats-grid">
      ${tableau('Pâtisseries les plus consultées', top('produit').map(([k, n]) => [esc(noms[k] || k), n, ajoutsPar[k] || 0]), ['Pâtisserie', 'Vues', 'Ajouts au devis'])}
      ${tableau('D’où viennent vos visiteurs', top('source').map(([k, n]) => [esc(k === 'direct' ? 'Accès direct / lien partagé' : k), n, pct(n, visites)]), ['Source', 'Visites', 'Part'])}
      ${tableau('Pages les plus vues', top('page').map(([k, n]) => [esc(pagesNoms[k] || k), n]), ['Page', 'Vues'])}
      ${tableau('Appareils', top('appareil').map(([k, n]) => [esc(k[0].toUpperCase() + k.slice(1)), n, pct(n, visites)]), ['Appareil', 'Visites', 'Part'])}
    </div>
    <p class="note">Astuce : pour savoir quelles publications Instagram ou WhatsApp vous amènent des visiteurs, partagez le lien du site en ajoutant <code>?utm_source=instagram</code> (ou <code>whatsapp</code>, <code>facebook</code>…) à la fin de l’adresse.</p>`;
}

/* ---------------- Fichiers (musique, carte) */
async function envoyerFichier(id, file) {
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  const type = file.type || { mp3: 'audio/mpeg', m4a: 'audio/mp4', aac: 'audio/aac', ogg: 'audio/ogg', wav: 'audio/wav', pdf: 'application/pdf' }[ext] || 'application/octet-stream';
  const r = await fetch(`/api/admin/files/${id}`, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': type, 'X-Filename': encodeURIComponent(file.name) }, body: file });
  const d = await r.json().catch(() => ({}));
  if (r.status === 401) { showLogin(); throw new Error('Session expirée.'); }
  if (!r.ok) throw new Error(d.error || `Erreur ${r.status}`);
  return d;
}
const taille = n => n > 1e6 ? `${(n / 1e6).toFixed(1).replace('.', ',')} Mo` : `${Math.round(n / 1000)} ko`;
async function chargerFichiers() { try { st.files = (await api('/api/admin/files')).files; } catch { st.files = {}; } }

/* ---------------- Musique d'ambiance : diagnostic du lien */
function lienAudio(u) {
  u = String(u || '').trim();
  if (!u) return { url: '' };
  if (/youtu\.?be|youtube\.com/i.test(u)) return { url: '', err: 'Un lien YouTube ne peut pas servir de musique de fond : un site ne peut lire que des fichiers audio, et YouTube l’interdit. Importez plutôt le fichier MP3 ou M4A avec le bouton ci-dessus.' };
  if (/spotify\.com|deezer\.com|music\.apple\.com|soundcloud\.com|music\.amazon/i.test(u)) return { url: '', err: 'Un lien Spotify, Deezer, Apple Music ou SoundCloud n’est pas un fichier audio : il ne peut pas être lu par le site. Importez le fichier MP3 ou M4A avec le bouton ci-dessus.' };
  let m;
  if ((m = u.match(/drive\.google\.com\/(?:file\/d\/|open\?id=|uc\?(?:.*&)?id=)([\w-]{10,})/))) return { url: `https://drive.google.com/uc?export=download&id=${m[1]}`, info: 'Lien Google Drive converti en lien direct. Le fichier doit être partagé avec « Tous les utilisateurs disposant du lien ». Google bloque parfois la lecture : en cas d’échec, importez le fichier.' };
  if (/dropbox\.com/i.test(u)) { try { const x = new URL(u); x.searchParams.delete('dl'); x.searchParams.set('raw', '1'); return { url: x.toString(), info: 'Lien Dropbox converti en lien direct.' }; } catch { } }
  if (/^http:\/\//i.test(u)) return { url: '', err: 'Le lien doit commencer par https:// (les liens http ne sont pas lus sur un site sécurisé).' };
  if (u.startsWith('/media/fichier/musique')) { const f = st.files?.musique; return { url: u, info: f ? `Fichier importé : ${f.name} (${taille(f.size)}).` : 'Fichier importé.' }; }
  return { url: u, info: /\.(mp3|m4a|aac|ogg|wav)(\?|$)/i.test(u) ? '' : 'Ce lien ne se termine pas par .mp3 ou .m4a : vérifiez avec le lecteur qu’il s’agit bien d’un fichier audio.' };
}
function majMusique() {
  const input = $('#s-music_url'); if (!input) return;
  const l = lienAudio(input.value), diag = $('#musicDiag'), audio = $('#musicTest');
  diag.className = 'note ' + (l.err ? 'adm-ko' : '');
  diag.textContent = l.err || l.info || (l.url ? 'Testez la lecture avec le lecteur ci-dessous.' : 'Aucune musique : le bouton « Ambiance » n’apparaît pas sur le site.');
  audio.hidden = !l.url;
  if (l.url && audio.dataset.src !== l.url) {
    audio.dataset.src = l.url;
    audio.onerror = () => {
      diag.className = 'note adm-ko';
      diag.textContent = l.url.startsWith('/media/fichier/')
        ? 'Votre fichier est bien importé, mais ce navigateur ne parvient pas à le lire. Le format MP3 est lu par tous les navigateurs : convertissez le fichier en MP3 si besoin.'
        : 'Ce lien ne mène pas à un fichier audio lisible. Importez le fichier MP3 ou M4A avec le bouton ci-dessus.';
    };
    audio.onloadedmetadata = () => { if (!l.err) { diag.className = 'note adm-ok'; diag.textContent = `${l.info ? l.info + ' ' : ''}✓ Lecture possible (${Math.floor(audio.duration / 60)} min ${String(Math.round(audio.duration % 60)).padStart(2, '0')}). ${l.url.startsWith('/media/fichier/') ? 'La musique est active sur le site.' : 'Pensez à enregistrer les textes.'}`; } };
    audio.preload = 'metadata'; audio.src = l.url;
  }
  if (!l.url) { audio.removeAttribute('src'); audio.dataset.src = ''; }
}
function blocMusique(s) {
  return `<div class="champ adm-musique">
    <span>Musique d’ambiance (facultatif)</span>
    <div class="adm-actions" style="margin-top:0">
      <label class="btn btn--sombre btn--petit adm-upload">Importer un fichier audio (MP3, M4A)<input type="file" accept="audio/*,.mp3,.m4a,.aac,.ogg,.wav" id="musicUpload" hidden></label>
      <button type="button" class="lien" id="musicClear">Retirer la musique</button>
    </div>
    <label for="s-music_url" class="aide" style="margin-top:.4rem">…ou lien direct vers un fichier audio</label>
    <input id="s-music_url" name="music_url" value="${esc(s.music_url || '')}" placeholder="https://…/musique.mp3">
    <p id="musicDiag" class="note"></p>
    <audio id="musicTest" controls preload="metadata" hidden></audio>
    <p class="note" style="margin:0">Uniquement une musique libre de droits ou dont vous avez la licence (SACEM) : un site professionnel ne peut pas diffuser un titre du commerce sans autorisation.</p>
  </div>`;
}

/* ---------------- Carte PDF */
function tCarte() {
  const f = st.files?.carte, auto = st.settings.carte_mode === 'auto';
  return `<h1>Carte PDF</h1>
  <p>Le lien « Télécharger la carte » du site (pied de page et collection) mène à la carte choisie ci-dessous.</p>
  <section class="adm-item">
    <h2 style="font-size:1.1rem;margin-top:0">Carte proposée aux visiteurs</h2>
    <label class="adm-mode adm-mode--large"><input type="radio" name="carte_mode" value="auto" ${auto ? 'checked' : ''}><span><strong>Carte générée depuis vos fiches</strong><small>Toujours à jour : prix, grilles dégressives, ingrédients et allergènes sont repris des fiches Produits. Rien à refaire quand un prix change.</small></span></label>
    <label class="adm-mode adm-mode--large"><input type="radio" name="carte_mode" value="fichier" ${auto ? '' : 'checked'}><span><strong>Mon fichier PDF</strong><small>${f ? `Fichier importé : ${esc(f.name)} (${taille(f.size)}), le ${new Date(f.updated_at.replace(' ', 'T') + 'Z').toLocaleDateString('fr-FR')}.` : 'Actuellement : la carte d’origine fournie avec le site (vos fiches Canva).'}</small></span></label>
  </section>
  <div class="adm-stats-grid">
    <section class="adm-item">
      <h2 style="font-size:1.1rem;margin-top:0">Carte générée</h2>
      <p class="note">Couverture, tableau des tarifs et une page par pâtisserie, à vos couleurs. Vous pouvez aussi l’enregistrer en PDF pour l’envoyer ou l’imprimer.</p>
      <a class="btn btn--sombre btn--petit" href="/carte.html" target="_blank" rel="noopener">Ouvrir la carte générée</a>
    </section>
    <section class="adm-item">
      <h2 style="font-size:1.1rem;margin-top:0">Mon fichier PDF</h2>
      <p class="note">Créé avec Canva, Word… ou la carte générée enregistrée en PDF. 25 Mo maximum.</p>
      <div class="adm-actions">
        <label class="btn btn--sombre btn--petit adm-upload">${f ? 'Remplacer le PDF…' : 'Importer un PDF…'}<input type="file" accept="application/pdf,.pdf" id="carteUpload" hidden></label>
        <a href="/carte.pdf?t=${Date.now()}" target="_blank" rel="noopener">Voir le PDF actuel</a>
        ${f ? '<button type="button" class="lien" id="carteOrigine" style="color:var(--err)">Revenir à la carte d’origine</button>' : ''}
      </div>
      <p class="note" id="carteMsg"></p>
    </section>
  </div>`;
}

/* ---------------- Textes & contact */
const TEXT_FIELDS = [
  ['Accueil', [['hero_title', 'Titre (référencement Google)'], ['hero_text', 'Phrase d’accueil', 2], ['quote_note', 'Note sur les devis et prix dégressifs', 2]]],
  ['Notre histoire', [['story_title', 'Titre'], ['story_body', 'Votre histoire (une ligne vide = nouveau paragraphe)', 12], ['story_image', 'Photo', 0, 'pick']]],
  ['Contact', [['contact_phone', 'Téléphone'], ['contact_whatsapp', 'WhatsApp (numéro au format international, ex : 33612345678)'], ['contact_email', 'E-mail'], ['contact_instagram', 'Instagram (@compte ou lien)'], ['contact_tiktok', 'TikTok (@compte ou lien)'], ['contact_facebook', 'Facebook (page ou lien)'], ['contact_zone', 'Zone de retrait / livraison'], ['contact_hours', 'Disponibilités']]],
  ['Devis PDF (non affiché sur le site)', [['company_name', 'Nom commercial (ex : Saveurs des Rois)'], ['company_owner', 'Nom et prénom de l’entrepreneur'], ['company_siret', 'SIRET'], ['company_address', 'Adresse', 2], ['company_phone', 'Téléphone sur le devis (vide = celui du contact)'], ['company_email', 'E-mail sur le devis (vide = celui du contact)'], ['quote_validity', 'Validité du devis en jours (ex : 30)'], ['quote_payment', 'Conditions de règlement (ex : Acompte de 30 % à la commande, solde au retrait)', 2], ['quote_legal', 'Mention fiscale', 2], ['quote_footer', 'Message de fin (facultatif)', 2]]],
  ['Ambiance & mentions', [['music_url', '', 0, 'music'], ['legal_text', 'Mentions légales', 10]]],
];
function tTextes() {
  const s = st.settings;
  return `<h1>Textes &amp; contact</h1>
  <p class="note">Un champ de contact laissé vide n’apparaît pas sur le site.</p>
  <form id="textForm">
    ${TEXT_FIELDS.map(([leg, fields]) => `<fieldset class="adm-fieldset"><legend>${leg}</legend>
      ${fields.map(([k, label, rows, kind]) => kind === 'music' ? blocMusique(s) : kind === 'pick'
        ? `<div class="champ"><span>${label}</span><div class="adm-img"><img id="s-${k}-prev" src="${esc(s[k] || '')}" alt=""><input type="hidden" name="${k}" value="${esc(s[k] || '')}"><button type="button" class="btn btn--ligne btn--petit" data-pick="setting:${k}">Changer la photo</button></div></div>`
        : `<div class="champ"><label for="s-${k}">${label}</label>${rows ? `<textarea id="s-${k}" name="${k}" rows="${rows}">${esc(s[k] || '')}</textarea>` : `<input id="s-${k}" name="${k}" value="${esc(s[k] || '')}">`}</div>`).join('')}
    </fieldset>`).join('')}
    <div class="adm-sticky"><button class="btn btn--or" type="submit">Enregistrer les textes</button><a href="/" target="_blank" rel="noopener">Voir le site</a></div>
  </form>`;
}

/* ---------------- Vidéos */
function tVideos() {
  const opts = id => `<option value="">— Aucun produit —</option>${st.products.map(p => `<option value="${esc(p.id)}" ${p.id === id ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}`;
  const form = (v = {}) => `
    <form class="adm-item" data-video="${v.id || ''}">
      <div class="deux">
        <div class="champ"><label>Titre</label><input name="title" value="${esc(v.title || '')}" required></div>
        <div class="champ"><label>Lien de la vidéo</label><input name="url" value="${esc(v.url || '')}" placeholder="https://youtu.be/… ou lien .mp4" required></div>
      </div>
      <div class="champ"><label>Description (facultatif)</label><input name="description" value="${esc(v.description || '')}"></div>
      <div class="trois">
        <div class="champ"><label>Associer à un produit</label><select name="product_id">${opts(v.product_id)}</select></div>
        <div class="champ"><label>Ordre</label><input name="position" type="number" value="${esc(v.position ?? 0)}"></div>
        <label class="adm-check" style="align-self:end"><input type="checkbox" name="visible" ${v.id == null || v.visible ? 'checked' : ''}> Visible</label>
      </div>
      <div class="adm-actions"><button class="btn btn--sombre btn--petit" type="submit">${v.id ? 'Enregistrer' : 'Ajouter la vidéo'}</button>${v.id ? `<button type="button" class="lien" data-delvideo="${v.id}" style="color:var(--err)">Supprimer</button>` : ''}</div>
    </form>`;
  return `<h1>Vidéos</h1>
  <p class="note">Le plus simple : publiez la vidéo sur YouTube (en « non répertoriée » si vous voulez qu’elle ne soit visible que sur votre site) puis collez son lien ici. Les Shorts YouTube et Vimeo fonctionnent aussi.</p>
  <h2 style="margin-top:1.5rem">Nouvelle vidéo</h2>${form()}
  <h2 style="margin-top:2rem">Vidéos publiées (${st.videos.length})</h2>
  <div class="adm-list">${st.videos.map(form).join('') || '<div class="vide">Aucune vidéo pour l’instant. La page « En vidéo » affiche un message d’attente.</div>'}</div>`;
}

/* ---------------- Photos */
function tMedias() {
  return `<div class="adm-bar"><h1 style="margin:0">Photos</h1><label class="btn btn--sombre btn--petit adm-upload">Importer des photos<input type="file" accept="image/*" multiple id="mediaUpload" hidden></label></div>
  <p class="note">Les photos sont redimensionnées (1600 px max) et compressées avant l’envoi. Copiez un lien pour l’utiliser ailleurs, ou choisissez-les directement depuis la fiche produit.</p>
  <div class="adm-media" id="mediaGrid"><p>Chargement…</p></div>`;
}
async function loadMedia() {
  const r = await api('/api/admin/media'); st.media = r.media;
  const g = $('#mediaGrid'); if (!g) return;
  g.innerHTML = st.media.length ? st.media.map(m => `<figure><img src="${m.url}" alt="" loading="lazy"><figcaption>${esc(m.name)}<input readonly value="${m.url}" onclick="this.select()"><button class="lien" data-delmedia="${m.id}" style="color:var(--err)">Supprimer</button></figcaption></figure>`).join('') : '<div class="vide">Aucune photo importée.</div>';
}

/* Compression côté navigateur → WebP */
async function compress(file, max = 1600, quality = 0.82) {
  const bmp = await createImageBitmap(file);
  const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  const blob = await new Promise(res => c.toBlob(res, 'image/webp', quality));
  return new File([blob], file.name.replace(/\.\w+$/, '') + '.webp', { type: 'image/webp' });
}
async function upload(file) {
  const fd = new FormData();
  const small = await compress(file);
  fd.append('file', small); fd.append('name', file.name);
  return api('/api/admin/media', { method: 'POST', body: fd });
}

/* ---------------- Sélecteur de photo */
let pickTarget = null;
async function openPicker(target) {
  pickTarget = target;
  try { st.media = (await api('/api/admin/media')).media; } catch {}
  const all = [...st.media.map(m => m.url), ...STATIC_IMAGES];
  $('#pickerGrid').innerHTML = all.map(u => `<button type="button" data-choose="${esc(u)}"><img src="${esc(u)}" alt="" loading="lazy"></button>`).join('');
  $('#picker').showModal();
}
function applyPick(url) {
  if (pickTarget === 'image') { $('#prodForm [name=image]').value = url; $('#p-img-prev').src = url; }
  else if (pickTarget === 'gallery') { $('#gal').insertAdjacentHTML('afterbegin', galItem(url)); }
  else if (pickTarget?.startsWith('galerie:')) {
    const k = pickTarget.slice(8);
    const f = document.querySelector(`[data-galerie="${k === 'new' ? '' : k}"]`);
    f.querySelector('[name=image]').value = url; $(`#g-prev-${k}`).src = url;
  }
  else if (pickTarget?.startsWith('setting:')) { const k = pickTarget.slice(8); $(`#textForm [name=${k}]`).value = url; $(`#s-${k}-prev`).src = url; }
  $('#picker').close();
}
$('#pickerGrid').addEventListener('click', e => { const b = e.target.closest('[data-choose]'); if (b) applyPick(b.dataset.choose); });
$('#pickerUpload').addEventListener('change', e => run(async () => {
  const f = e.target.files[0]; if (!f) return;
  const r = await upload(f); e.target.value = ''; applyPick(r.url);
}, 'Photo importée.'));

/* ---------------- Événements du panneau */
const panel = $('#panel');
panel.addEventListener('change', e => {
  if (e.target.id === 'filter') { st.filter = e.target.value; render(); }
  if (e.target.id === 'avisFiltre') { st.avisFiltre = e.target.value; render(); }
  if (e.target.id === 'statsJours') { st.statsJours = +e.target.value; render(); }
  if (e.target.dataset.status) run(async () => {
    const id = +e.target.dataset.status;
    await api(`/api/admin/requests/${id}`, { method: 'PUT', body: { status: e.target.value } });
    st.requests.find(r => r.id === id).status = e.target.value; countNew(); render();
  }, 'Statut mis à jour.');
  if (e.target.name === 'carte_mode') run(async () => {
    await api('/api/admin/settings', { method: 'PUT', body: { carte_mode: e.target.value } });
    st.settings.carte_mode = e.target.value;
  }, e.target.value === 'auto' ? 'Le site propose maintenant la carte générée depuis vos fiches.' : 'Le site propose maintenant votre fichier PDF.');
  if (e.target.id === 'carteUpload' && e.target.files[0]) run(async () => {
    $('#carteMsg').textContent = 'Envoi en cours…';
    await envoyerFichier('carte', e.target.files[0]);
    st.settings.carte_mode = 'fichier'; await chargerFichiers(); render();
  }, 'Carte PDF importée : le site propose maintenant ce fichier.');
  if (e.target.id === 'musicUpload' && e.target.files[0]) run(async () => {
    $('#musicDiag').textContent = 'Envoi en cours…';
    const r = await envoyerFichier('musique', e.target.files[0]);
    st.settings.music_url = r.url; await chargerFichiers();
    $('#s-music_url').value = r.url; majMusique();
  }, 'Musique importée et enregistrée.');
  if (e.target.id === 'restoreFile') {
    const f = e.target.files[0]; if (!f) return;
    const only = [...panel.querySelectorAll('[name=only]:checked')].map(x => x.value);
    const msg = $('#restoreMsg');
    run(async () => {
      let data;
      try { data = JSON.parse(await f.text()); } catch { throw new Error('Ce fichier n’est pas lisible.'); }
      if (data?.format !== 'saveurs-des-rois-backup') throw new Error('Ce fichier n’est pas une sauvegarde Saveurs des Rois.');
      const n = Object.fromEntries(Object.entries(data.tables).map(([k, v]) => [k, (v || []).length]));
      const resume = `Sauvegarde du ${new Date(data.created_at).toLocaleString('fr-FR')} : ${n.products || 0} produits, ${n.reviews || 0} avis, ${n.gallery || 0} photos de galerie, ${n.requests || 0} demandes, ${n.media || 0} photos importées.`;
      if (!confirm(`${resume}\n\nRestaurer les éléments cochés ? Les fiches actuelles du même nom seront remplacées par celles de la sauvegarde.`)) { e.target.value = ''; return; }
      msg.textContent = 'Restauration en cours…';
      const r = await api('/api/admin/restore', { method: 'POST', body: { ...data, only } });
      e.target.value = '';
      msg.textContent = 'Restauration terminée : ' + Object.entries(r.counts).map(([k, v]) => `${v} ${k}`).join(', ') + '.';
      const o = await api('/api/admin/overview'); Object.assign(st, o);
      st.requests = (await api('/api/admin/requests')).requests; st.reviews = (await api('/api/admin/reviews')).reviews; countNew();
    }, 'Sauvegarde restaurée.');
  }
  if (e.target.id === 'mediaUpload') run(async () => {
    for (const f of e.target.files) await upload(f);
    await loadMedia();
  }, 'Photos importées.');
});
panel.addEventListener('input', e => {
  if (e.target.name === 'price_mode') $('#prixBloc').dataset.mode = e.target.value;
  if (e.target.id === 's-music_url') majMusique();
  if (e.target.closest('#prodForm')) { refreshProdHelpers(); majGrille(e.target.form); }
});

panel.addEventListener('click', e => {
  const t = e.target;
  if (t.closest('[data-prod]')) { st.current = t.closest('[data-prod]').dataset.prod; st.draft = null; render(); return; }
  if (t.id === 'newProd') { st.current = '__new'; st.draft = null; render(); return; }
  const start = t.closest('[data-start]');
  if (start) { startDraft(start.dataset.start); render(); return; }
  if (t.id === 'cancelNew') { st.current = null; st.draft = null; render(); return; }
  if (t.dataset.allergene) {
    const area = $('#p-allergens'); const a = t.dataset.allergene;
    if (!area.value.toLowerCase().includes(a.toLowerCase())) area.value = area.value.trim() ? `${area.value.trim().replace(/[,.]$/, '')}, ${a}` : a;
    refreshProdHelpers(); area.focus(); return;
  }
  if (t.id === 'calcKcal') {
    const form = $('#prodForm'); const v = n => parseFloat(String(form.elements[n].value).replace(',', '.'));
    const [pr, gl, li] = ['proteins', 'carbs', 'fats'].map(v);
    if ([pr, gl, li].some(Number.isNaN)) { toast('Renseignez d’abord protéines, glucides et lipides.'); return; }
    form.elements.energy_kcal.value = Math.round(4 * pr + 4 * gl + 9 * li);
    refreshProdHelpers(); return;
  }
  if (t.dataset.avis) return run(async () => {
    await api(`/api/admin/reviews/${t.dataset.avis}`, { method: 'PUT', body: { status: t.dataset.status } });
    st.reviews.find(r => r.id === +t.dataset.avis).status = t.dataset.status; countNew(); render();
  }, t.dataset.status === 'publié' ? 'Avis publié sur le site.' : 'Avis retiré du site.');
  if (t.dataset.savereply) return run(async () => {
    const reply = $(`[data-reply="${t.dataset.savereply}"]`).value;
    await api(`/api/admin/reviews/${t.dataset.savereply}`, { method: 'PUT', body: { reply } });
    st.reviews.find(r => r.id === +t.dataset.savereply).reply = reply;
  }, 'Réponse enregistrée.');
  if (t.dataset.delavis && confirm('Supprimer définitivement cet avis ?')) return run(async () => {
    await api(`/api/admin/reviews/${t.dataset.delavis}`, { method: 'DELETE' });
    st.reviews = st.reviews.filter(r => r.id !== +t.dataset.delavis); countNew(); render();
  }, 'Avis supprimé.');
  if (t.dataset.delgalerie && confirm('Retirer cette photo de la galerie ?')) return run(async () => {
    await api(`/api/admin/gallery/${t.dataset.delgalerie}`, { method: 'DELETE' });
    st.gallery = st.gallery.filter(g => g.id !== +t.dataset.delgalerie); render();
  }, 'Photo retirée.');
  if (t.id === 'musicClear') return run(async () => {
    if (st.files?.musique) await api('/api/admin/files/musique', { method: 'DELETE' });
    await api('/api/admin/settings', { method: 'PUT', body: { music_url: '' } });
    st.settings.music_url = ''; await chargerFichiers(); $('#s-music_url').value = ''; majMusique();
  }, 'Musique retirée du site.');
  if (t.id === 'carteOrigine' && confirm('Supprimer votre PDF importé et revenir à la carte d’origine ?')) return run(async () => {
    await api('/api/admin/files/carte', { method: 'DELETE' }); await chargerFichiers(); render();
  }, 'Carte d’origine rétablie.');
  if (t.closest('[data-backup]')) { try { localStorage.setItem(LAST_BACKUP, new Date().toISOString()); } catch { } setTimeout(render, 1500); }
  const go = t.closest('[data-goto]');
  if (go) { document.querySelector(`[data-tab="${go.dataset.goto}"]`).click(); return; }
  if (t.id === 'testAlert') return run(async () => { const r = await api('/api/admin/test-alert', { method: 'POST' }); toast(`Alerte de test envoyée (${r.sent.join(' + ')}).`); });
  if (t.dataset.pick) { openPicker(t.dataset.pick); return; }
  if (t.classList.contains('x')) { t.closest('figure').remove(); return; }
  if (t.id === 'delProd' && confirm('Supprimer définitivement ce produit ?')) return run(async () => {
    await api(`/api/admin/products/${st.current}`, { method: 'DELETE' });
    st.products = st.products.filter(p => p.id !== st.current); st.current = null; render();
  }, 'Produit supprimé.');
  if (t.dataset.delreq && confirm('Supprimer cette demande ?')) return run(async () => {
    await api(`/api/admin/requests/${t.dataset.delreq}`, { method: 'DELETE' });
    st.requests = st.requests.filter(r => r.id !== +t.dataset.delreq); countNew(); render();
  }, 'Demande supprimée.');
  if (t.dataset.delvideo && confirm('Supprimer cette vidéo ?')) return run(async () => {
    await api(`/api/admin/videos/${t.dataset.delvideo}`, { method: 'DELETE' });
    st.videos = st.videos.filter(v => v.id !== +t.dataset.delvideo); render();
  }, 'Vidéo supprimée.');
  if (t.dataset.delmedia && confirm('Supprimer cette photo ? Vérifiez qu’elle n’est plus utilisée sur une fiche.')) return run(async () => {
    await api(`/api/admin/media/${t.dataset.delmedia}`, { method: 'DELETE' }); await loadMedia();
  }, 'Photo supprimée.');
});

panel.addEventListener('submit', e => {
  e.preventDefault();
  const form = e.target;
  if (form.id === 'prodForm') return run(async () => {
    const data = readProdForm(form);
    const manque = checklist(data).filter(([, ok, req]) => req && !ok).map(([l]) => l);
    if (data.visible && manque.length && !confirm(`Il manque : ${manque.join(', ')}.\nPublier quand même cette recette sur le site ?`)) return;
    if (form.dataset.new === 'true') {
      const r = await api('/api/admin/products', { method: 'POST', body: data });
      st.current = r.id; st.draft = null;
    } else {
      await api(`/api/admin/products/${st.current}`, { method: 'PUT', body: data });
    }
    st.products = (await api('/api/admin/overview')).products; render();
    toast(data.visible ? 'Recette enregistrée et visible sur le site.' : 'Recette enregistrée (masquée).');
  });
  if (form.dataset.galerie !== undefined) return run(async () => {
    const fd = new FormData(form);
    const data = { ...Object.fromEntries(fd), visible: fd.has('visible') ? 1 : 0 };
    if (!data.image) throw new Error('Choisissez une photo.');
    const id = form.dataset.galerie;
    await api(id ? `/api/admin/gallery/${id}` : '/api/admin/gallery', { method: id ? 'PUT' : 'POST', body: data });
    st.gallery = (await api('/api/admin/overview')).gallery; render();
  }, 'Galerie mise à jour.');
  if (form.id === 'avisManuel') return run(async () => {
    await api('/api/admin/reviews', { method: 'POST', body: Object.fromEntries(new FormData(form)) });
    st.reviews = (await api('/api/admin/reviews')).reviews; st.avisFiltre = 'publié'; render();
  }, 'Avis publié.');
  if (form.id === 'textForm') return run(async () => {
    const data = Object.fromEntries(new FormData(form));
    await api('/api/admin/settings', { method: 'PUT', body: data });
    Object.assign(st.settings, data);
  }, 'Textes enregistrés.');
  if (form.dataset.video !== undefined) return run(async () => {
    const fd = new FormData(form);
    const data = { ...Object.fromEntries(fd), visible: fd.has('visible') ? 1 : 0 };
    if (!data.title || !data.url) throw new Error('Titre et lien obligatoires.');
    const id = form.dataset.video;
    await api(id ? `/api/admin/videos/${id}` : '/api/admin/videos', { method: id ? 'PUT' : 'POST', body: data });
    st.videos = (await api('/api/admin/overview')).videos; render();
  }, 'Vidéo enregistrée.');
});

/* ---------------- Application installable (administration) */
let inviteAdmin = null;
const estIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const estInstallee = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
if ('serviceWorker' in navigator) navigator.serviceWorker.register('/admin/sw.js', { scope: '/admin/' }).catch(() => {});
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); inviteAdmin = e; $('#installAdmin').hidden = false; });
window.addEventListener('appinstalled', () => { inviteAdmin = null; $('#installAdmin').hidden = true; toast('Administration installée ✓'); });
if (estIOS() && !estInstallee()) $('#installAdmin').hidden = false;
$('#installAdmin').addEventListener('click', () => {
  if (inviteAdmin) { inviteAdmin.prompt(); inviteAdmin = null; $('#installAdmin').hidden = true; return; }
  $('#installAide').showModal();
});

start();
