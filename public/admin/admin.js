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
  try { await api('/api/admin/login', { method: 'POST', body: { password: $('#pw').value } }); $('#pw').value = ''; start(); }
  catch (err) { msg.textContent = err.message; msg.hidden = false; }
});
$('#logout').addEventListener('click', async () => { await api('/api/admin/logout', { method: 'POST' }).catch(() => {}); showLogin(); });

async function start() {
  try {
    const [o, r, a] = await Promise.all([api('/api/admin/overview'), api('/api/admin/requests'), api('/api/admin/reviews')]);
    Object.assign(st, o, { requests: r.requests, reviews: a.reviews });
  } catch { return showLogin(); }
  $('#login').hidden = true; $('#dash').hidden = false; $('#logout').hidden = false;
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
  const fn = { alertes: tAlertes, demandes: tDemandes, produits: tProduits, galerie: tGalerie, avis: tAvis, stats: tStats, textes: tTextes, videos: tVideos, medias: tMedias }[st.tab];
  $('#panel').innerHTML = fn();
  if (st.tab === 'medias') loadMedia();
  if (st.tab === 'stats') loadStats().catch(e => { $('#statsZone').innerHTML = `<p class="message message--err">${esc(e.message)}</p>`; });
  if (st.tab === 'produits') refreshProdHelpers();
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
const ADMIN_VERSION = '2.4';
function alertBanner() {
  if (!st.version) return `<button class="adm-alerte adm-alerte--warn" data-goto="alertes">⚠️ Serveur du site pas à jour — voir l’onglet Alertes</button>`;
  const a = st.alerts || {};
  const on = [a.email && 'e-mail', a.whatsapp && 'WhatsApp'].filter(Boolean);
  return on.length
    ? `<button class="adm-alerte adm-alerte--on" data-goto="alertes">🔔 Alertes actives : ${on.join(' + ')}</button>`
    : `<button class="adm-alerte" data-goto="alertes">🔕 Alertes de devis désactivées — les activer</button>`;
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
    ${alertBanner()}
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
      ${r.items.length ? `<ul>${r.items.map(i => `<li>${i.qty} × ${esc(i.name)} (${euro(i.unit_cents)} ${esc(i.label || '')})</li>`).join('')}</ul><p><strong>Estimation : ${euro(r.estimate_cents)}</strong></p>` : ''}
      ${r.message ? `<p style="white-space:pre-wrap">${esc(r.message)}</p>` : ''}
      <div class="adm-actions">
        <select data-status="${r.id}" aria-label="Statut">${STATUSES.map(s => `<option ${s === r.status ? 'selected' : ''}>${s}</option>`).join('')}</select>
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
      ${st.products.map(x => `<button data-prod="${esc(x.id)}" aria-current="${x.id === st.current}" class="${x.visible ? '' : 'adm-off'}"><img src="${esc(x.image || '/assets/img/favicon.png')}" alt=""><span>${esc(x.name)}<br><small>${euro(x.price_cents)}${x.visible ? '' : ' · masqué'}</small></span>${x.featured ? '<small title="Mis en avant">★</small>' : ''}</button>`).join('')}
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
    for (const k of ['price_cents', 'price_label', 'threshold', 'ingredients', 'allergens', 'traces', 'energy_kcal', 'proteins', 'carbs', 'fats', 'salt']) base[k] = src[k];
    base.copiedFrom = src.name;
  }
  st.draft = base;
}

function checklist(p) {
  const has = v => v != null && String(v).trim() !== '';
  return [
    ['Nom', has(p.name), true], ['Prix', has(p.price_cents) && p.price_cents > 0, true], ['Photo principale', has(p.image), true],
    ['Description', has(p.description), true], ['Ingrédients', has(p.ingredients), true], ['Allergènes', has(p.allergens), true],
    ['Valeurs nutritionnelles', ['energy_kcal', 'proteins', 'carbs', 'fats', 'salt'].every(k => has(p[k])), false],
  ];
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
    <fieldset class="adm-fieldset"><legend>2. Prix</legend>
      <div class="trois">
        <div class="champ"><label for="p-price">Prix (€)</label><input id="p-price" name="price" inputmode="decimal" value="${prix}" placeholder="Ex : 0,80" required></div>
        ${f('price_label', 'Unité affichée', 'text', 'placeholder="la pièce"')}
        ${f('threshold', 'Prix dégressif à partir de (pièces)', 'number', 'min="0" placeholder="Ex : 12"')}
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
  return { ...d, price_cents: Number.isFinite(price) ? Math.round(price * 100) : null };
}
function refreshProdHelpers() {
  const form = $('#prodForm'); if (!form) return;
  const p = formSnapshot(form);
  $('#checklist').innerHTML = checklistHtml(p);
  $('#apercuCarte').innerHTML = `
    <div class="arche"><img src="${esc(p.image || '/assets/img/logo-transparent.webp')}" alt=""></div>
    <h3>${esc(p.name || 'Nom de la recette')}</h3>
    <p class="carte__ar" lang="ar" dir="rtl">${esc(p.arabic_name || '')}</p>
    <p class="carte__prix"><strong>${p.price_cents ? euro(p.price_cents) : '— €'}</strong> ${esc(p.price_label || 'la pièce')}</p>
    ${p.threshold ? `<p class="carte__seuil">Prix dégressif à partir de ${esc(p.threshold)} pièces</p>` : ''}`;
  checkKcal(form);
}
const galItem = src => `<figure data-g="${esc(src)}"><img src="${esc(src)}" alt=""><button type="button" class="x" aria-label="Retirer">×</button></figure>`;

function readProdForm(form) {
  const fd = new FormData(form);
  const d = Object.fromEntries(fd);
  const out = {
    name: d.name.trim(), arabic_name: d.arabic_name, tagline: d.tagline, description: d.description,
    price_cents: Math.round(parseFloat(String(d.price).replace(',', '.')) * 100),
    price_label: d.price_label || 'la pièce', threshold: d.threshold || null, position: d.position || 0,
    ingredients: d.ingredients, allergens: d.allergens, traces: d.traces,
    energy_kcal: d.energy_kcal, proteins: d.proteins, carbs: d.carbs, fats: d.fats, salt: d.salt,
    image: d.image, gallery: [...form.querySelectorAll('#gal figure')].map(f => f.dataset.g),
    visible: fd.has('visible') ? 1 : 0, featured: fd.has('featured') ? 1 : 0,
  };
  if (!Number.isFinite(out.price_cents)) throw new Error('Prix invalide (ex : 0,70).');
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

/* ---------------- Textes & contact */
const TEXT_FIELDS = [
  ['Accueil', [['hero_title', 'Titre (référencement Google)'], ['hero_text', 'Phrase d’accueil', 2], ['quote_note', 'Note sur les devis et prix dégressifs', 2]]],
  ['Notre histoire', [['story_title', 'Titre'], ['story_body', 'Votre histoire (une ligne vide = nouveau paragraphe)', 12], ['story_image', 'Photo', 0, 'pick']]],
  ['Contact', [['contact_phone', 'Téléphone'], ['contact_whatsapp', 'WhatsApp (numéro au format international, ex : 33612345678)'], ['contact_email', 'E-mail'], ['contact_instagram', 'Instagram (@compte ou lien)'], ['contact_tiktok', 'TikTok (@compte ou lien)'], ['contact_facebook', 'Facebook (page ou lien)'], ['contact_zone', 'Zone de retrait / livraison'], ['contact_hours', 'Disponibilités']]],
  ['Ambiance & mentions', [['music_url', 'Lien d’une musique d’ambiance (facultatif, libre de droits)'], ['legal_text', 'Mentions légales', 10]]],
];
function tTextes() {
  const s = st.settings;
  return `<h1>Textes &amp; contact</h1>
  <p class="note">Un champ de contact laissé vide n’apparaît pas sur le site.</p>
  <form id="textForm">
    ${TEXT_FIELDS.map(([leg, fields]) => `<fieldset class="adm-fieldset"><legend>${leg}</legend>
      ${fields.map(([k, label, rows, kind]) => kind === 'pick'
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
  if (e.target.id === 'mediaUpload') run(async () => {
    for (const f of e.target.files) await upload(f);
    await loadMedia();
  }, 'Photos importées.');
});
panel.addEventListener('input', e => { if (e.target.closest('#prodForm')) refreshProdHelpers(); });

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

start();
