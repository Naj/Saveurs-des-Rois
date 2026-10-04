/* Saveurs des Rois — site public
   Routes : #/  #/collection  #/p/<id>  #/histoire  #/videos  #/contact  #/devis  #/mentions */

const main = document.getElementById('main');
const state = { products: [], videos: [], settings: {}, loaded: false };
const STORE_KEY = 'sdr_selection_v1';
const IS_FILE = location.protocol === 'file:';
/* Chemins d'images : absolus sur le serveur, relatifs si index.html est ouvert directement */
const asset = u => (IS_FILE && typeof u === 'string' && u.startsWith('/') ? u.slice(1) : u);

/* ---------------- utilitaires */
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const euro = c => (c / 100).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' });
const num = v => (v == null ? '' : String(v).replace('.', ','));
const paras = t => esc(t).split(/\n{2,}/).map(p => `<p>${p.replace(/\n/g, '<br>')}</p>`).join('');
const byId = id => state.products.find(p => p.id === id);
const set = (k, fallback = '') => (state.settings[k] ?? '').trim() || fallback;

function selection() { try { return JSON.parse(localStorage.getItem(STORE_KEY)) || {}; } catch { return {}; } }
function saveSelection(sel) {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(sel)); } catch { /* navigation privée */ }
  updateCount();
}
function updateCount() {
  const sel = selection();
  const n = Object.keys(sel).filter(id => byId(id)).length;
  document.getElementById('cartCount').textContent = n;
}

let toastTimer;
function toast(html) {
  const t = document.getElementById('toast');
  t.innerHTML = html;
  t.classList.add('is-on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('is-on'), 4200);
}

function seuilTexte(p) {
  return p.threshold ? `Prix dégressif à partir de ${p.threshold} pièces` : '';
}

/* ---------------- composants */
const arche = (src, alt, cls = '') => `<div class="arche ${cls}"><img src="${esc(asset(src))}" alt="${esc(alt)}" loading="lazy"></div>`;

function carte(p) {
  return `<a class="carte" href="#/p/${esc(p.id)}">
    ${arche(p.image, p.name)}
    <h3>${esc(p.name)}</h3>
    <p class="carte__ar" lang="ar" dir="rtl">${esc(p.arabic_name || '')}</p>
    <p class="carte__prix"><strong>${euro(p.price_cents)}</strong> ${esc(p.price_label || 'la pièce')}</p>
    ${p.threshold ? `<p class="carte__seuil">${seuilTexte(p)}</p>` : ''}
  </a>`;
}

function qteControl(id, value, min = 1) {
  return `<div class="qte" data-qte="${esc(id)}">
    <button type="button" data-step="-1" aria-label="Retirer une unité">−</button>
    <input type="number" inputmode="numeric" min="${min}" max="5000" value="${value}" aria-label="Quantité">
    <button type="button" data-step="1" aria-label="Ajouter une unité">+</button>
  </div>`;
}

function embedVideo(v) {
  const url = v.url || '';
  let m;
  if ((m = url.match(/(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/)|youtu\.be\/)([\w-]{6,})/))) {
    const portrait = /shorts\//.test(url);
    return `<div class="video__cadre ${portrait ? 'video__cadre--portrait' : ''}"><iframe src="https://www.youtube-nocookie.com/embed/${m[1]}?rel=0" title="${esc(v.title)}" loading="lazy" allow="accelerometer; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe></div>`;
  }
  if ((m = url.match(/vimeo\.com\/(?:video\/)?(\d+)/))) {
    return `<div class="video__cadre"><iframe src="https://player.vimeo.com/video/${m[1]}?dnt=1" title="${esc(v.title)}" loading="lazy" allow="fullscreen; picture-in-picture" allowfullscreen></iframe></div>`;
  }
  return `<div class="video__cadre"><video controls preload="metadata" playsinline ${v.poster ? `poster="${esc(v.poster)}"` : ''}><source src="${esc(url)}"></video></div>`;
}

const videoFigure = v => `<div class="video"><figure>${embedVideo(v)}<figcaption><strong>${esc(v.title)}</strong>${v.description ? esc(v.description) : ''}</figcaption></figure></div>`;

/* ---------------- pages */
function pageAccueil() {
  const signatures = state.products.filter(p => p.featured && p.id !== 'mix-box');
  const liste = (signatures.length ? signatures : state.products).slice(0, 3);
  const mix = byId('mix-box');
  const videos = state.videos.slice(0, 2);
  return `
  <section class="hero">
    <h1>${esc(set('hero_title', 'Saveurs des Rois'))}</h1>
    <div class="hero__logo"><img src="${asset('/assets/img/logo-transparent.webp')}" alt="Saveurs des Rois" width="658" height="1000"></div>
    <p class="hero__texte">${esc(set('hero_text'))}</p>
    <div class="hero__actions">
      <a class="btn btn--or" href="#/collection">Découvrir la collection</a>
      <a class="btn btn--ligne" href="#/devis">Demander un devis gratuit</a>
    </div>
    <p class="hero__note">Fait maison, avec passion et authenticité</p>
  </section>
  <div class="zellige" role="presentation"></div>

  <section class="section">
    <div class="wrap">
      <h2 class="titre">Nos signatures</h2>
      <p class="chapeau">Des recettes de tradition, des ingrédients nobles, une finition soignée pièce par pièce.</p>
      <div class="grille">${liste.map(carte).join('')}</div>
      <p class="centre" style="margin-top:2.75rem"><a class="btn btn--sombre" href="#/collection">Voir les ${state.products.length} pâtisseries</a></p>
    </div>
  </section>

  <section class="section section--sombre">
    <div class="wrap">
      <h2 class="titre">Commander en trois temps</h2>
      <p class="chapeau">Pour un mariage, une naissance, l’Aïd ou un simple plaisir.</p>
      <ol class="etapes">
        <li><h3>Choisissez</h3><p>Parcourez la collection et ajoutez vos pâtisseries préférées à votre sélection.</p></li>
        <li><h3>Composez</h3><p>Ajustez les quantités : le prix dégressif s’applique dès le nombre de pièces indiqué.</p></li>
        <li><h3>Recevez votre devis</h3><p>Envoyez votre demande, nous revenons vers vous avec un devis gratuit et personnalisé.</p></li>
      </ol>
    </div>
  </section>

  ${mix ? `
  <section class="section">
    <div class="wrap duo">
      <div class="medaillon"><img src="${esc(asset(mix.image))}" alt="La Mix Box Saveurs des Rois" loading="lazy"></div>
      <div>
        <h2 class="titre" style="text-align:left">${esc(mix.name)}</h2>
        <p class="produit__accroche">${esc(mix.tagline || '')}</p>
        <p class="prix-grand" style="color:var(--or-profond)">${euro(mix.price_cents)} <small style="font:italic 400 1.15rem var(--f-texte);color:var(--encre-douce)">${esc(mix.price_label)}</small></p>
        <p>${esc(mix.description || '')}</p>
        <a class="btn btn--sombre" href="#/p/mix-box">Composer ma box</a>
      </div>
    </div>
  </section>` : ''}

  ${videos.length ? `
  <section class="section section--sombre">
    <div class="wrap">
      <h2 class="titre">Dans notre atelier</h2>
      <div class="videos">${videos.map(videoFigure).join('')}</div>
      <p class="centre" style="margin-top:2rem"><a class="btn btn--ligne" href="#/videos">Toutes les vidéos</a></p>
    </div>
  </section>` : ''}

  <section class="section">
    <div class="wrap duo duo--inverse">
      ${arche(set('story_image', '/assets/img/cornes-de-gazelle-coffrets.webp'), 'Pâtisseries Saveurs des Rois')}
      <div>
        <h2 class="titre" style="text-align:left">${esc(set('story_title', 'Notre histoire'))}</h2>
        ${paras(set('story_body').split(/\n{2,}/)[0] || '')}
        <a class="btn btn--sombre" href="#/histoire">Lire notre histoire</a>
      </div>
    </div>
  </section>`;
}

function pageCollection() {
  return `
  <section class="page-titre wrap">
    <h1>La collection</h1>
    <p>${esc(set('quote_note'))}</p>
  </section>
  <section class="section" style="padding-top:1.5rem">
    <div class="wrap">
      <div class="grille">${state.products.map(carte).join('')}</div>
      <p class="centre note" style="margin-top:3rem">Envie de tout avoir sous la main ? <a href="${asset('/assets/docs/carte-saveurs-des-rois.pdf')}" download>Télécharger la carte (PDF)</a></p>
    </div>
  </section>`;
}

function pageProduit(id) {
  const p = byId(id);
  if (!p) return pageIntrouvable();
  const images = [p.image, ...(p.gallery || [])].filter(Boolean).map(asset);
  const hasNutri = [p.energy_kcal, p.proteins, p.carbs, p.fats, p.salt].some(v => v != null);
  const videos = state.videos.filter(v => v.product_id === p.id);
  const autres = state.products.filter(x => x.id !== p.id).slice(0, 3);
  const defaultQty = p.threshold || 1;
  const isBox = p.id === 'mix-box';

  return `
  <div class="wrap">
    <p class="fil"><a href="#/collection">La collection</a> / ${esc(p.name)}</p>
    <article class="produit">
      <div class="produit__visuel">
        <div class="arche"><img id="visuel" src="${esc(images[0])}" alt="${esc(p.name)}"></div>
        ${images.length > 1 ? `<div class="vignettes">${images.map((src, i) => `<button type="button" data-img="${esc(src)}" aria-pressed="${i === 0}" aria-label="Photo ${i + 1}"><img src="${esc(src)}" alt=""></button>`).join('')}</div>` : ''}
      </div>
      <div>
        <h1>${esc(p.name)}</h1>
        ${p.arabic_name ? `<p class="produit__ar" lang="ar" dir="rtl">${esc(p.arabic_name)}</p>` : ''}
        ${p.tagline ? `<p class="produit__accroche">${esc(p.tagline)}</p>` : ''}
        ${p.description ? `<div class="produit__desc">${paras(p.description)}</div>` : ''}
        <div class="tarif">
          <div class="tarif__prix">${euro(p.price_cents)}<small>${esc(p.price_label || 'la pièce')}</small></div>
          ${p.threshold ? `<p class="tarif__seuil">${seuilTexte(p)}</p>` : ''}
          <div class="ajout">
            ${qteControl(p.id, defaultQty)}
            <button class="btn btn--sombre" type="button" data-add="${esc(p.id)}">Ajouter à mon devis</button>
          </div>
          ${isBox ? '<p class="note" style="margin:0">Vous préciserez la composition de vos box dans votre demande de devis.</p>' : ''}
        </div>
        <div class="compo">
          ${p.ingredients || p.allergens ? `
          <details open>
            <summary>Ingrédients &amp; allergènes</summary>
            <div class="contenu">
              ${p.ingredients ? `<p>${esc(p.ingredients)}</p>` : ''}
              ${p.allergens ? `<p><span class="allergenes">Allergènes :</span> ${esc(p.allergens)}</p>` : ''}
              ${p.traces ? `<p class="note">${esc(p.traces)}</p>` : ''}
            </div>
          </details>` : ''}
          ${hasNutri ? `
          <details>
            <summary>Valeurs nutritionnelles</summary>
            <div class="contenu">
              <table class="nutri">
                <caption class="sr">Valeurs nutritionnelles pour 100 g</caption>
                <tbody>
                  <tr><th scope="row">Énergie</th><td>${num(p.energy_kcal)} kcal</td></tr>
                  <tr><th scope="row">Protéines</th><td>${num(p.proteins)} g</td></tr>
                  <tr><th scope="row">Glucides</th><td>${num(p.carbs)} g</td></tr>
                  <tr><th scope="row">Lipides</th><td>${num(p.fats)} g</td></tr>
                  <tr><th scope="row">Sel</th><td>${num(p.salt)} g</td></tr>
                </tbody>
              </table>
              <p class="note" style="margin-top:.6rem">Pour 100 g</p>
            </div>
          </details>` : ''}
          ${!p.ingredients && !p.allergens && !isBox ? `<p class="note">Liste des ingrédients et allergènes disponible sur simple demande.</p>` : ''}
        </div>
      </div>
    </article>
    ${videos.length ? `<section class="section" style="padding-top:0"><h2 class="titre">En vidéo</h2><div class="videos">${videos.map(videoFigure).join('')}</div></section>` : ''}
    <section class="section" style="padding-top:1rem">
      <h2 class="titre">Vous aimerez aussi</h2>
      <div class="grille" style="margin-top:2rem">${autres.map(carte).join('')}</div>
    </section>
  </div>`;
}

function pageHistoire() {
  return `
  <section class="page-titre wrap"><h1>${esc(set('story_title', 'Notre histoire'))}</h1></section>
  <section class="section" style="padding-top:1.5rem">
    <div class="wrap duo">
      ${arche(set('story_image', '/assets/img/cornes-de-gazelle-coffrets.webp'), 'Pâtisseries Saveurs des Rois')}
      <div class="texte-long">${paras(set('story_body'))}
        <p style="margin-top:2rem"><a class="btn btn--sombre" href="#/collection">Découvrir la collection</a></p>
      </div>
    </div>
  </section>`;
}

function pageVideos() {
  return `
  <section class="page-titre wrap"><h1>En vidéo</h1><p>Le geste, la patience et la tradition, en images.</p></section>
  <section class="section" style="padding-top:1.5rem">
    <div class="wrap">
      ${state.videos.length
        ? `<div class="videos">${state.videos.map(videoFigure).join('')}</div>`
        : `<div class="vide"><h2 style="font-size:1.3rem">Nos vidéos arrivent bientôt</h2><p>Nous préparons des images de notre atelier. En attendant, découvrez nos pâtisseries.</p><a class="btn btn--sombre" href="#/collection">Voir la collection</a></div>`}
    </div>
  </section>`;
}

function pageContact() {
  const s = state.settings;
  const tel = (s.contact_phone || '').trim();
  const wa = (s.contact_whatsapp || '').replace(/[^\d]/g, '');
  const items = [
    tel && `<a href="tel:${esc(tel.replace(/\s/g, ''))}"><span>Téléphone</span>${esc(tel)}</a>`,
    wa && `<a href="https://wa.me/${esc(wa)}" target="_blank" rel="noopener"><span>WhatsApp</span>Écrire sur WhatsApp</a>`,
    s.contact_email && `<a href="mailto:${esc(s.contact_email)}"><span>E-mail</span>${esc(s.contact_email)}</a>`,
    s.contact_instagram && `<a href="${esc(socialUrl(s.contact_instagram, 'instagram'))}" target="_blank" rel="noopener"><span>Instagram</span>${esc(handle(s.contact_instagram))}</a>`,
    s.contact_tiktok && `<a href="${esc(socialUrl(s.contact_tiktok, 'tiktok'))}" target="_blank" rel="noopener"><span>TikTok</span>${esc(handle(s.contact_tiktok))}</a>`,
    s.contact_facebook && `<a href="${esc(socialUrl(s.contact_facebook, 'facebook'))}" target="_blank" rel="noopener"><span>Facebook</span>Notre page</a>`,
    s.contact_zone && `<div><span>Zone de retrait / livraison</span>${esc(s.contact_zone)}</div>`,
    s.contact_hours && `<div><span>Disponibilités</span>${esc(s.contact_hours)}</div>`,
  ].filter(Boolean);

  return `
  <section class="page-titre wrap"><h1>Contact</h1><p>Une question, une commande spéciale, un événement à préparer ? Écrivez-nous.</p></section>
  <section class="section" style="padding-top:1.5rem">
    <div class="wrap">
      ${items.length ? `<div class="coord">${items.join('')}</div>` : ''}
      <div class="panneau" style="max-width:44rem;margin-inline:auto">
        <h2>Nous écrire</h2>
        ${formulaire('contact')}
      </div>
    </div>
  </section>`;
}

function pageDevis() {
  const sel = selection();
  const lignes = Object.entries(sel).map(([id, qty]) => ({ p: byId(id), qty })).filter(l => l.p);
  const total = lignes.reduce((t, l) => t + l.p.price_cents * l.qty, 0);
  return `
  <section class="page-titre wrap"><h1>Mon devis</h1><p>${esc(set('quote_note'))}</p></section>
  <div class="wrap devis">
    <section aria-labelledby="sel-titre">
      <h2 id="sel-titre" class="sr">Ma sélection</h2>
      ${lignes.length ? `
        <div id="lignes">${lignes.map(({ p, qty }) => `
          <div class="ligne" data-id="${esc(p.id)}">
            <img src="${esc(asset(p.image))}" alt="">
            <div>
              <h3>${esc(p.name)}</h3>
              <p>${euro(p.price_cents)} ${esc(p.price_label || 'la pièce')}</p>
              ${p.threshold ? `<p class="${qty >= p.threshold ? 'degressif' : ''}">${qty >= p.threshold ? 'Prix dégressif appliqué dans votre devis' : `Prix dégressif dès ${p.threshold} pièces`}</p>` : ''}
            </div>
            <div class="ligne__droite">
              ${qteControl(p.id, qty, 0)}
              <span class="ligne__total">${euro(p.price_cents * qty)}</span>
              <button class="lien" type="button" data-remove="${esc(p.id)}">Retirer</button>
            </div>
          </div>`).join('')}
        </div>
        <div class="total"><span>Estimation</span><span>${euro(total)}</span></div>
        <p class="note">Estimation au prix unitaire. Le prix final, avec dégressivité éventuelle, figure dans votre devis gratuit.</p>
        <p><a href="#/collection">Ajouter d’autres pâtisseries</a></p>`
      : `<div class="vide"><h3 style="font-size:1.25rem">Votre sélection est vide</h3><p>Ajoutez des pâtisseries depuis la collection, ou envoyez directement votre demande : nous vous conseillerons.</p><a class="btn btn--sombre" href="#/collection">Parcourir la collection</a></div>`}
    </section>
    <section class="panneau" aria-labelledby="form-titre">
      <h2 id="form-titre">Vos coordonnées</h2>
      ${formulaire('devis')}
    </section>
  </div>`;
}

function formulaire(kind) {
  const devis = kind === 'devis';
  return `
  <form id="form" data-kind="${kind}" novalidate>
    <div class="message" id="formMsg" hidden></div>
    <div class="champ"><label for="f-name">Nom et prénom</label><input id="f-name" name="name" autocomplete="name" required></div>
    <div class="deux">
      <div class="champ"><label for="f-phone">Téléphone</label><input id="f-phone" name="phone" type="tel" autocomplete="tel"></div>
      <div class="champ"><label for="f-email">E-mail</label><input id="f-email" name="email" type="email" autocomplete="email"></div>
    </div>
    <p class="note" style="margin-top:-.5rem">Un téléphone ou un e-mail suffit pour vous répondre.</p>
    ${devis ? `
    <div class="deux">
      <div class="champ"><label for="f-date">Date souhaitée</label><input id="f-date" name="event_date" type="date"></div>
      <div class="champ"><label for="f-type">Occasion</label>
        <select id="f-type" name="event_type">
          <option value="">Choisir…</option><option>Mariage</option><option>Fiançailles</option><option>Naissance</option>
          <option>Aïd / Ramadan</option><option>Anniversaire</option><option>Événement d’entreprise</option><option>Plaisir personnel</option><option>Autre</option>
        </select></div>
    </div>
    <div class="champ"><label for="f-deliv">Retrait ou livraison</label>
      <select id="f-deliv" name="delivery"><option value="">Choisir…</option><option>Retrait</option><option>Livraison (à préciser)</option></select></div>` : ''}
    <div class="champ"><label for="f-msg">${devis ? 'Précisions (nombre d’invités, présentation souhaitée…)' : 'Votre message'}</label><textarea id="f-msg" name="message" ${devis ? '' : 'required'}></textarea></div>
    <div class="piege" aria-hidden="true"><label>Site web <input name="website" tabindex="-1" autocomplete="off"></label></div>
    <label class="consent"><input type="checkbox" name="consent" required> <span>J’accepte que mes informations servent uniquement à répondre à ma demande.</span></label>
    <button class="btn btn--or" type="submit" style="width:100%">${devis ? 'Envoyer ma demande de devis' : 'Envoyer mon message'}</button>
  </form>`;
}

function pageMentions() {
  return `<section class="page-titre wrap"><h1>Mentions légales</h1></section>
  <section class="section" style="padding-top:1rem"><div class="wrap texte-long" style="margin-inline:auto">${paras(set('legal_text'))}</div></section>`;
}

function pageIntrouvable() {
  return `<section class="page-titre wrap"><h1>Page introuvable</h1><p>Cette page n’existe pas ou plus.</p><p><a class="btn btn--sombre" href="#/collection">Retour à la collection</a></p></section>`;
}

function socialUrl(v, net) {
  if (/^https?:\/\//.test(v)) return v;
  const h = v.replace(/^@/, '');
  return { instagram: `https://instagram.com/${h}`, tiktok: `https://www.tiktok.com/@${h}`, facebook: `https://facebook.com/${h}` }[net];
}
function handle(v) { return /^https?:/.test(v) ? v.replace(/^https?:\/\/(www\.)?/, '') : '@' + v.replace(/^@/, ''); }

/* ---------------- routeur */
function route() {
  if (!state.loaded) return;
  const hash = location.hash.replace(/^#\/?/, '');
  const [page, arg] = hash.split('/');
  const pages = {
    '': pageAccueil, collection: pageCollection, p: () => pageProduit(decodeURIComponent(arg || '')),
    histoire: pageHistoire, videos: pageVideos, contact: pageContact, devis: pageDevis, mentions: pageMentions,
  };
  main.innerHTML = (pages[page] || pageIntrouvable)();
  document.querySelectorAll('[data-nav]').forEach(a => a.toggleAttribute('aria-current', a.dataset.nav === (page === 'p' ? 'collection' : page)));
  document.querySelectorAll('[data-nav][aria-current]').forEach(a => a.setAttribute('aria-current', 'page'));
  const p = page === 'p' ? byId(arg) : null;
  document.title = p ? `${p.name} — Saveurs des Rois` : 'Saveurs des Rois — Pâtisseries orientales artisanales';
  closeNav();
  window.scrollTo(0, 0);
  if (page) main.focus({ preventScroll: true });
}

/* ---------------- interactions */
main.addEventListener('click', e => {
  const step = e.target.closest('[data-step]');
  if (step) {
    const box = step.closest('[data-qte]');
    const input = box.querySelector('input');
    const min = +input.min || 0;
    input.value = Math.max(min, Math.min(5000, (+input.value || 0) + +step.dataset.step));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    return;
  }
  const add = e.target.closest('[data-add]');
  if (add) {
    const id = add.dataset.add;
    const qty = Math.max(1, +main.querySelector(`[data-qte="${CSS.escape(id)}"] input`).value || 1);
    const sel = selection();
    sel[id] = (sel[id] || 0) + qty;
    saveSelection(sel);
    toast(`${esc(byId(id).name)} ajouté (${sel[id]}) <a href="#/devis">Voir mon devis</a>`);
    return;
  }
  const rm = e.target.closest('[data-remove]');
  if (rm) {
    const sel = selection(); delete sel[rm.dataset.remove]; saveSelection(sel); route();
    return;
  }
  const vign = e.target.closest('[data-img]');
  if (vign) {
    document.getElementById('visuel').src = vign.dataset.img;
    vign.parentElement.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', b === vign));
  }
});

main.addEventListener('change', e => {
  const box = e.target.closest('.ligne [data-qte]');
  if (!box) return;
  const sel = selection();
  const qty = Math.max(0, Math.min(5000, parseInt(e.target.value, 10) || 0));
  if (qty === 0) delete sel[box.dataset.qte]; else sel[box.dataset.qte] = qty;
  saveSelection(sel);
  const y = window.scrollY; route(); window.scrollTo(0, y);
});

main.addEventListener('submit', async e => {
  if (e.target.id !== 'form') return;
  e.preventDefault();
  const form = e.target;
  const msg = form.querySelector('#formMsg');
  const data = Object.fromEntries(new FormData(form));
  const show = (text, ok) => { msg.hidden = false; msg.className = `message message--${ok ? 'ok' : 'err'}`; msg.textContent = text; msg.scrollIntoView({ block: 'nearest' }); };
  if (!data.name?.trim()) return show('Indiquez votre nom.');
  if (!data.phone?.trim() && !data.email?.trim()) return show('Indiquez un téléphone ou un e-mail pour que nous puissions vous répondre.');
  if (form.dataset.kind === 'contact' && !data.message?.trim()) return show('Écrivez votre message.');
  if (!data.consent) return show('Cochez la case d’accord pour envoyer votre demande.');
  const items = form.dataset.kind === 'devis' ? Object.entries(selection()).map(([id, qty]) => ({ id, qty })) : [];
  const btn = form.querySelector('button[type="submit"]');
  btn.disabled = true;
  try {
    if (state.offline) throw new Error('Envoi indisponible pour le moment.');
    const r = await fetch('/api/requests', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...data, kind: form.dataset.kind, items }) });
    const res = await r.json();
    if (!r.ok) throw new Error(res.error || 'Envoi impossible.');
    form.reset();
    if (form.dataset.kind === 'devis') { saveSelection({}); }
    form.innerHTML = `<div class="message message--ok"><strong>Demande envoyée.</strong> Merci ! Nous revenons vers vous très vite avec votre devis gratuit.</div><a class="btn btn--sombre" href="#/collection">Retour à la collection</a>`;
  } catch (err) {
    show(`${err.message} Vous pouvez aussi nous contacter directement depuis la page Contact.`);
    btn.disabled = false;
  }
});

/* navigation mobile */
const burger = document.querySelector('.burger');
const nav = document.getElementById('nav');
function closeNav() { nav.classList.remove('is-open'); burger.setAttribute('aria-expanded', 'false'); }
burger.addEventListener('click', () => {
  const open = !nav.classList.contains('is-open');
  nav.classList.toggle('is-open', open);
  burger.setAttribute('aria-expanded', String(open));
});

/* musique d'ambiance (désactivée par défaut, jamais en lecture automatique) */
function setupMusic() {
  const url = set('music_url');
  const btn = document.getElementById('musicBtn');
  if (!url) return;
  const audio = new Audio(url);
  audio.loop = true; audio.volume = 0.35;
  btn.hidden = false;
  btn.addEventListener('click', () => {
    const on = audio.paused;
    on ? audio.play().catch(() => {}) : audio.pause();
    btn.setAttribute('aria-pressed', String(on));
  });
}

function footer() {
  document.getElementById('year').textContent = new Date().getFullYear();
  const s = state.settings;
  const links = [
    s.contact_instagram && `<a href="${esc(socialUrl(s.contact_instagram, 'instagram'))}" target="_blank" rel="noopener">Instagram</a>`,
    s.contact_tiktok && `<a href="${esc(socialUrl(s.contact_tiktok, 'tiktok'))}" target="_blank" rel="noopener">TikTok</a>`,
    s.contact_facebook && `<a href="${esc(socialUrl(s.contact_facebook, 'facebook'))}" target="_blank" rel="noopener">Facebook</a>`,
  ].filter(Boolean);
  if (links.length) document.getElementById('footSocial').innerHTML = `<h2>Nous suivre</h2>${links.join('')}`;
}

/* ---------------- démarrage */
async function init() {
  try {
    if (IS_FILE) throw new Error('fichier local');
    const r = await fetch('/api/catalogue');
    if (!r.ok) throw new Error(`API ${r.status}`);
    const data = await r.json();
    if (!data.products?.length) throw new Error('base vide');
    Object.assign(state, data, { loaded: true });
  } catch (err) {
    // Repli sur la copie embarquée du catalogue (js/catalogue-data.js)
    if (!window.SDR_FALLBACK) {
      main.innerHTML = `<section class="page-titre wrap"><h1>Chargement impossible</h1><p>La collection n’a pas pu être chargée. Rechargez la page.</p><p><button class="btn btn--sombre" onclick="location.reload()">Recharger</button></p></section>`;
      return;
    }
    console.warn('Catalogue embarqué utilisé :', err.message);
    Object.assign(state, structuredClone(window.SDR_FALLBACK), { loaded: true, offline: true });
    const why = IS_FILE ? 'Page ouverte directement depuis le disque.' : 'La base de données ne répond pas.';
    document.querySelector('.top').insertAdjacentHTML('afterend',
      `<div class="apercu" role="note">Aperçu hors ligne — ${why} La collection s’affiche, mais l’envoi de devis est indisponible.</div>`);
  }
  updateCount();
  footer();
  setupMusic();
  route();
}
window.addEventListener('hashchange', route);
init();
