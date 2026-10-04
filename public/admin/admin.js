/* Saveurs des Rois — espace administrateur */

const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const euro = c => ((c || 0) / 100).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' });
const STATUSES = ['nouveau', 'en cours', 'devis envoyé', 'confirmé', 'archivé'];
const STATIC_IMAGES = ['sable-royal', 'cornes-de-gazelle', 'cornes-de-gazelle-coffrets', 'chbakia', 'haloua-sesame', 'makrout'].map(n => `/assets/img/${n}.webp`);

const st = { products: [], videos: [], settings: {}, requests: [], media: [], tab: 'demandes', current: null, filter: 'actives' };

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
    const [o, r] = await Promise.all([api('/api/admin/overview'), api('/api/admin/requests')]);
    Object.assign(st, o, { requests: r.requests });
  } catch { return showLogin(); }
  $('#login').hidden = true; $('#dash').hidden = false; $('#logout').hidden = false;
  countNew(); render();
}
function countNew() { const n = st.requests.filter(r => r.status === 'nouveau').length; const b = $('#newCount'); b.textContent = n; b.hidden = !n; }

document.querySelectorAll('[data-tab]').forEach(b => b.addEventListener('click', () => {
  st.tab = b.dataset.tab;
  document.querySelectorAll('[data-tab]').forEach(x => x.setAttribute('aria-selected', x === b));
  render();
}));

function render() {
  const fn = { demandes: tDemandes, produits: tProduits, textes: tTextes, videos: tVideos, medias: tMedias }[st.tab];
  $('#panel').innerHTML = fn();
  if (st.tab === 'medias') loadMedia();
  if (st.tab === 'produits') checkKcal($('#prodForm'));
}

/* ---------------- Demandes */
function tDemandes() {
  const list = st.requests.filter(r => st.filter === 'toutes' || (st.filter === 'actives' ? r.status !== 'archivé' : r.status === st.filter));
  return `
  <div class="adm-bar">
    <h1 style="margin:0">Demandes de devis et messages</h1>
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
        <button class="lien" data-delreq="${r.id}" style="color:var(--err)">Supprimer</button>
      </div>
    </article>`).join('') : '<div class="vide">Aucune demande dans cette catégorie.</div>'}
  </div>`;
}

/* ---------------- Produits */
function tProduits() {
  if (!st.current && st.products.length) st.current = st.products[0].id;
  const p = st.current === '__new' ? { id: '', name: '', price_cents: 0, price_label: 'la pièce', visible: 1, featured: 0, gallery: [], position: (st.products.length + 1) * 10 } : st.products.find(x => x.id === st.current);
  return `
  <div class="adm-bar"><h1 style="margin:0">Produits</h1><button class="btn btn--sombre btn--petit" id="newProd">Ajouter un produit</button></div>
  <div class="adm-prods">
    <div class="adm-plist">
      ${st.products.map(x => `<button data-prod="${esc(x.id)}" aria-current="${x.id === st.current}" class="${x.visible ? '' : 'adm-off'}"><img src="${esc(x.image || '/assets/img/favicon.png')}" alt=""><span>${esc(x.name)}<br><small>${euro(x.price_cents)}${x.visible ? '' : ' · masqué'}</small></span>${x.featured ? '<small title="Mis en avant">★</small>' : ''}</button>`).join('')}
    </div>
    ${p ? formProduit(p) : '<div class="vide">Aucun produit.</div>'}
  </div>`;
}

function formProduit(p) {
  const isNew = !p.id;
  const f = (name, label, type = 'text', extra = '') => `<div class="champ"><label for="p-${name}">${label}</label><input id="p-${name}" name="${name}" type="${type}" value="${esc(p[name] ?? '')}" ${extra}></div>`;
  const ta = (name, label, rows = 4, help = '') => `<div class="champ"><label for="p-${name}">${label}</label>${help ? `<span class="aide">${help}</span>` : ''}<textarea id="p-${name}" name="${name}" rows="${rows}">${esc(p[name] ?? '')}</textarea></div>`;
  return `
  <form id="prodForm" data-new="${isNew}">
    <fieldset class="adm-fieldset"><legend>Présentation</legend>
      <div class="deux">${f('name', 'Nom', 'text', 'required')}${f('arabic_name', 'Nom en arabe (facultatif)', 'text', 'dir="rtl" lang="ar"')}</div>
      ${f('tagline', 'Accroche (ex : L’élégance en une bouchée)')}
      ${ta('description', 'Description', 5, 'Laissez une ligne vide pour créer un nouveau paragraphe.')}
      <div class="adm-check-row" style="display:flex;flex-wrap:wrap">
        <label class="adm-check"><input type="checkbox" name="visible" ${p.visible ? 'checked' : ''}> Visible sur le site</label>
        <label class="adm-check"><input type="checkbox" name="featured" ${p.featured ? 'checked' : ''}> Mis en avant sur l’accueil</label>
      </div>
    </fieldset>
    <fieldset class="adm-fieldset"><legend>Prix</legend>
      <div class="trois">
        <div class="champ"><label for="p-price">Prix (€)</label><input id="p-price" name="price" inputmode="decimal" value="${((p.price_cents || 0) / 100).toFixed(2).replace('.', ',')}" required></div>
        ${f('price_label', 'Unité affichée')}
        ${f('threshold', 'Prix dégressif à partir de (pièces)', 'number', 'min="0"')}
      </div>
      ${f('position', 'Ordre d’affichage (plus petit = en premier)', 'number')}
    </fieldset>
    <fieldset class="adm-fieldset"><legend>Photos</legend>
      <div class="champ"><span>Photo principale</span>
        <div class="adm-img"><img id="p-img-prev" src="${esc(p.image || '')}" alt=""><input type="hidden" name="image" value="${esc(p.image || '')}"><button type="button" class="btn btn--ligne btn--petit" data-pick="image">Changer la photo</button></div>
      </div>
      <div class="champ"><span>Photos supplémentaires</span>
        <div class="adm-gallery" id="gal">${(p.gallery || []).map(g => galItem(g)).join('')}<button type="button" class="btn btn--ligne btn--petit" data-pick="gallery">Ajouter</button></div>
      </div>
    </fieldset>
    <fieldset class="adm-fieldset"><legend>Ingrédients, allergènes, valeurs nutritionnelles</legend>
      ${ta('ingredients', 'Ingrédients', 3)}
      ${ta('allergens', 'Allergènes', 2)}
      ${f('traces', 'Traces éventuelles (ex : Peut contenir des traces de fruits à coque.)')}
      <p class="aide note">Pour 100 g</p>
      <div class="cinq">${f('energy_kcal', 'Énergie (kcal)', 'text', 'inputmode="decimal"')}${f('proteins', 'Protéines (g)', 'text', 'inputmode="decimal"')}${f('carbs', 'Glucides (g)', 'text', 'inputmode="decimal"')}${f('fats', 'Lipides (g)', 'text', 'inputmode="decimal"')}${f('salt', 'Sel (g)', 'text', 'inputmode="decimal"')}</div>
      <p class="note" id="kcalCheck"></p>
    </fieldset>
    <div class="adm-sticky">
      <button class="btn btn--or" type="submit">${isNew ? 'Créer le produit' : 'Enregistrer'}</button>
      ${isNew ? '' : `<span style="display:flex;gap:.8rem;align-items:center"><a href="/#/p/${esc(p.id)}" target="_blank" rel="noopener">Voir sur le site</a><button type="button" class="btn btn--danger btn--petit" id="delProd">Supprimer</button></span>`}
    </div>
  </form>`;
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
panel.addEventListener('input', e => { if (e.target.closest('#prodForm') && ['energy_kcal', 'proteins', 'carbs', 'fats'].includes(e.target.name)) checkKcal(e.target.form); });

panel.addEventListener('click', e => {
  const t = e.target;
  if (t.closest('[data-prod]')) { st.current = t.closest('[data-prod]').dataset.prod; render(); checkKcal($('#prodForm')); return; }
  if (t.id === 'newProd') { st.current = '__new'; render(); return; }
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
    if (form.dataset.new === 'true') {
      const r = await api('/api/admin/products', { method: 'POST', body: data });
      st.current = r.id;
    } else {
      await api(`/api/admin/products/${st.current}`, { method: 'PUT', body: data });
    }
    st.products = (await api('/api/admin/overview')).products; render(); checkKcal($('#prodForm'));
  }, 'Produit enregistré.');
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
