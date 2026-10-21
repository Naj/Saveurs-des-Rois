/* Saveurs des Rois — carte générée depuis les fiches produits (A4, prête à imprimer ou enregistrer en PDF) */
(() => {
  const $ = s => document.querySelector(s);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const euro = c => ((c || 0) / 100).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' });
  const num = v => (v == null || v === '' ? '—' : String(v).replace('.', ','));
  const paras = t => esc(t).split(/\n{2,}/).map(p => `<p>${p.replace(/\n/g, '<br>')}</p>`).join('');
  const mode = p => p.price_mode || 'piece';
  const paliers = p => (Array.isArray(p.tiers) ? p.tiers : []).filter(t => t.min >= 2 && t.price_cents > 0 && t.price_cents < p.price_cents).sort((a, b) => a.min - b.min);
  // Public visé : tous, particuliers (à la pièce) ou professionnels (au kilo et aux 100 g). Lien direct : /carte.html?tarifs=pro
  const demande = new URLSearchParams(location.search).get('tarifs');
  const opts = { couverture: true, tarifs: true, fiches: true, public: ['part', 'pro'].includes(demande) ? demande : 'tous' };
  const proSeul = () => opts.public === 'pro';
  const avecPro = () => opts.public !== 'part';
  const aKg = p => ['kg', 'both'].includes(mode(p)) && p.price_kg_cents > 0;
  const cent = p => Math.round(p.price_kg_cents / 10); // prix pour 100 g
  let D;

  function prixPiece(p) {
    if (mode(p) === 'devis') return 'Sur devis';
    if (mode(p) === 'kg') return '—';
    return `${euro(p.price_cents)} <small>${esc(p.price_label || 'la pièce')}</small>`;
  }
  function degressif(p) {
    if (!['piece', 'both'].includes(mode(p))) return '';
    const t = paliers(p);
    if (t.length) return t.map(x => `dès ${x.min} : ${euro(x.price_cents)}`).join('<br>');
    return p.threshold ? `dès ${p.threshold} pièces` : '';
  }
  const prixPro = p => (['kg', 'both'].includes(mode(p)) && p.price_kg_cents ? `${euro(p.price_kg_cents)} <small>le kg</small>` : '');

  function couverture(s, date) {
    const contacts = [s.contact_phone, s.contact_email, s.contact_instagram && '@' + s.contact_instagram.replace(/^@/, '').replace(/^https?:\/\/(www\.)?instagram\.com\//, '').replace(/\/$/, '')].filter(Boolean);
    return `<section class="page page--couv">
      <img src="/assets/img/logo-transparent.webp" alt="Saveurs des Rois" class="couv__logo">
      <h1>La Carte</h1>
      <p class="couv__sous">Pâtisseries marocaines artisanales<br>Faites maison, avec passion et authenticité</p>
      ${proSeul() ? '<p class="couv__pro">Tarifs professionnels · vente au poids</p>' : ''}
      <p class="couv__date">Tarifs en vigueur au ${date}</p>
      ${contacts.length ? `<p class="couv__contact">${contacts.map(esc).join(' · ')}</p>` : ''}
    </section>`;
  }

  function tableauPro(produits, s) {
    return `<section class="page">
      <header class="entete"><img src="/assets/img/logo-mark.webp" alt=""><span>Saveurs des Rois</span></header>
      <h2 class="titre-page">Tarifs professionnels</h2>
      <table class="tarifs">
        <thead><tr><th>Pâtisserie</th><th class="num">Prix au kilo</th><th class="num">Prix pour 100 g</th></tr></thead>
        <tbody>${produits.map(p => `<tr>
          <td><strong>${esc(p.name)}</strong>${p.arabic_name ? ` <span class="ar" lang="ar" dir="rtl">${esc(p.arabic_name)}</span>` : ''}${p.tagline ? `<br><em>${esc(p.tagline)}</em>` : ''}</td>
          <td class="num"><strong>${euro(p.price_kg_cents)}</strong> <small>le kg</small></td>
          <td class="num">${euro(cent(p))} <small>les 100 g</small></td>
        </tr>`).join('')}</tbody>
      </table>
      <p class="note">Vente au poids réservée aux professionnels, par tranche de 100 g. Prix fixes, sans tarif dégressif. Devis gratuit.</p>
      ${pied(s)}
    </section>`;
  }

  function tableauTarifs(produits, s) {
    if (proSeul()) return tableauPro(produits, s);
    const pro = avecPro() && produits.some(p => prixPro(p));
    const deg = produits.some(p => degressif(p));
    return `<section class="page">
      <header class="entete"><img src="/assets/img/logo-mark.webp" alt=""><span>Saveurs des Rois</span></header>
      <h2 class="titre-page">Nos tarifs</h2>
      <table class="tarifs">
        <thead><tr><th>Pâtisserie</th><th class="num">À la pièce</th>${deg ? '<th class="num">Tarif dégressif</th>' : ''}${pro ? '<th class="num">Professionnels</th>' : ''}</tr></thead>
        <tbody>${produits.map(p => `<tr>
          <td><strong>${esc(p.name)}</strong>${p.arabic_name ? ` <span class="ar" lang="ar" dir="rtl">${esc(p.arabic_name)}</span>` : ''}${p.tagline ? `<br><em>${esc(p.tagline)}</em>` : ''}</td>
          <td class="num">${prixPiece(p)}</td>
          ${deg ? `<td class="num deg">${degressif(p) || '—'}</td>` : ''}
          ${pro ? `<td class="num">${prixPro(p) || '—'}</td>` : ''}
        </tr>`).join('')}</tbody>
      </table>
      <p class="note">${esc(s.quote_note || 'Devis gratuit.')}${pro ? ' Vente au poids réservée aux professionnels, prix fixe sans tarif dégressif.' : ''}</p>
      ${pied(s)}
    </section>`;
  }

  function fiche(p, s) {
    const nutri = [p.energy_kcal, p.proteins, p.carbs, p.fats, p.salt].some(v => v != null && v !== '');
    const t = mode(p) === 'devis' ? [] : paliers(p);
    return `<section class="page page--fiche">
      <header class="entete"><img src="/assets/img/logo-mark.webp" alt=""><span>Saveurs des Rois</span></header>
      <div class="fiche">
        <div class="fiche__photo"><div class="arche"><img src="${esc(p.image)}" alt="${esc(p.name)}"></div></div>
        <div class="fiche__texte">
          <h2>${esc(p.name)}</h2>
          ${p.arabic_name ? `<p class="ar grand" lang="ar" dir="rtl">${esc(p.arabic_name)}</p>` : ''}
          ${p.tagline ? `<p class="accroche">${esc(p.tagline)}</p>` : ''}
          ${p.description ? `<div class="desc">${paras(p.description)}</div>` : ''}
          ${proSeul() ? `<div class="prix">
            <p class="prix__pro"><span>Professionnels</span> vente au poids</p>
            <p class="prix__grand">${euro(p.price_kg_cents)} <small>le kg</small></p>
            <p class="prix__cent">soit <strong>${euro(cent(p))}</strong> les 100 g</p>
            <p class="petit">Par tranche de 100 g · prix fixe, sans tarif dégressif</p>
          </div>` : `<div class="prix">
            ${mode(p) === 'devis' ? '<p class="prix__grand">Prix sur devis</p>' : ''}
            ${['piece', 'both'].includes(mode(p)) ? `<p class="prix__grand">${euro(p.price_cents)} <small>${esc(p.price_label || 'la pièce')}</small></p>
              ${t.length ? `<table class="grille"><tbody>${t.map(x => `<tr><td>Dès ${x.min} pièces</td><td class="num">${euro(x.price_cents)}</td></tr>`).join('')}</tbody></table>` : p.threshold ? `<p class="petit">Prix dégressif à partir de ${p.threshold} pièces</p>` : ''}` : ''}
            ${avecPro() && prixPro(p) ? `<p class="prix__pro"><span>Professionnels</span> ${prixPro(p)} · ${euro(cent(p))} les 100 g</p>` : ''}
          </div>`}
        </div>
      </div>
      ${p.ingredients || p.allergens ? `<table class="compo">
        <thead><tr><th>Ingrédients</th><th>Allergènes</th></tr></thead>
        <tbody><tr><td>${esc(p.ingredients || '—')}</td><td>${esc(p.allergens || '—')}${p.traces ? `<br><em>${esc(p.traces)}</em>` : ''}</td></tr></tbody>
      </table>` : ''}
      ${nutri ? `<table class="nutri">
        <caption>Valeurs nutritionnelles pour 100 g</caption>
        <thead><tr><th>Énergie</th><th>Protéines</th><th>Glucides</th><th>Lipides</th><th>Sel</th></tr></thead>
        <tbody><tr><td>${num(p.energy_kcal)} kcal</td><td>${num(p.proteins)} g</td><td>${num(p.carbs)} g</td><td>${num(p.fats)} g</td><td>${num(p.salt)} g</td></tr></tbody>
      </table>` : ''}
      ${pied(s)}
    </section>`;
  }

  function pied(s) {
    const c = [s.contact_phone, s.contact_email, location.host].filter(Boolean);
    return `<footer class="pied">Saveurs des Rois · Pâtisseries marocaines artisanales${c.length ? ' · ' + c.map(esc).join(' · ') : ''} · Devis gratuit</footer>`;
  }

  function rendu() {
    const s = D.settings || {};
    const produits = (D.products || []).filter(p => p.visible !== 0)
      .filter(p => proSeul() ? aKg(p) : opts.public === 'part' ? mode(p) !== 'kg' : true);
    const date = new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
    $('#carte').innerHTML = [
      opts.couverture && couverture(s, date),
      opts.tarifs && tableauTarifs(produits, s),
      ...(opts.fiches ? produits.map(p => fiche(p, s)) : []),
    ].filter(Boolean).join('') || '<p class="chargement">Cochez au moins un élément à inclure.</p>';
    if (proSeul() && !produits.length) $('#carte').innerHTML = '<p class="chargement">Aucune pâtisserie n’a de prix au kilo. Renseignez-le dans l’admin (Produits → Prix → « Au kilo » ou « Les deux »).</p>';
    document.title = `${proSeul() ? 'Tarifs professionnels' : 'La carte'} — Saveurs des Rois (${new Date().toLocaleDateString('fr-FR')})`;
  }

  $('#public').value = opts.public;
  $('#public').addEventListener('change', e => {
    opts.public = e.target.value;
    const u = new URL(location.href);
    opts.public === 'tous' ? u.searchParams.delete('tarifs') : u.searchParams.set('tarifs', opts.public);
    history.replaceState(null, '', u);
    rendu();
  });
  document.getElementById('choix').addEventListener('change', e => {
    const k = e.target.dataset.opt; if (!k) return;
    opts[k] = e.target.checked; rendu();
  });
  $('#imprimer').addEventListener('click', async () => {
    await document.fonts.ready;
    await Promise.all([...document.images].map(i => i.complete ? 0 : new Promise(r => { i.onload = i.onerror = r; })));
    window.print();
  });

  (async () => {
    try {
      const r = await fetch('/api/catalogue');
      if (!r.ok) throw new Error();
      D = await r.json();
      if (!D.products?.length) throw new Error();
    } catch {
      D = window.SDR_FALLBACK || { products: [], settings: {} };
    }
    rendu();
  })();
})();
