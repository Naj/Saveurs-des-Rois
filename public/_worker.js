/**
 * Saveurs des Rois — serveur (fichier unique, compatible Cloudflare Pages ET Cloudflare Workers)
 *
 * • Cloudflare Pages : ce fichier « _worker.js » placé dans le dossier de sortie (public)
 *   est exécuté automatiquement (mode avancé). Liaison D1 « DB » et secret ADMIN_PASSWORD
 *   à régler dans Settings du projet Pages.
 * • Cloudflare Workers : wrangler.jsonc pointe sur ce fichier (main) ; .assetsignore
 *   l'empêche d'être servi comme fichier public.
 */

/* ============================== Base de données : structure et contenu initial ============================== */


const SCHEMA_VERSION = '2';

const SCHEMA = [
  "CREATE TABLE IF NOT EXISTS products ( id TEXT PRIMARY KEY, name TEXT NOT NULL, arabic_name TEXT, tagline TEXT, description TEXT, price_cents INTEGER NOT NULL, price_label TEXT DEFAULT 'la pièce', threshold INTEGER, ingredients TEXT, allergens TEXT, traces TEXT, energy_kcal REAL, proteins REAL, carbs REAL, fats REAL, salt REAL, image TEXT, gallery TEXT DEFAULT '[]', featured INTEGER DEFAULT 0, visible INTEGER DEFAULT 1, position INTEGER DEFAULT 0, updated_at TEXT DEFAULT (datetime('now')) )",
  "CREATE TABLE IF NOT EXISTS settings ( key TEXT PRIMARY KEY, value TEXT )",
  "CREATE TABLE IF NOT EXISTS videos ( id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, description TEXT, url TEXT NOT NULL, poster TEXT, product_id TEXT, visible INTEGER DEFAULT 1, position INTEGER DEFAULT 0, created_at TEXT DEFAULT (datetime('now')) )",
  "CREATE TABLE IF NOT EXISTS requests ( id INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT NOT NULL DEFAULT 'devis', name TEXT NOT NULL, email TEXT, phone TEXT, event_date TEXT, event_type TEXT, delivery TEXT, message TEXT, items TEXT DEFAULT '[]', estimate_cents INTEGER DEFAULT 0, status TEXT DEFAULT 'nouveau', created_at TEXT DEFAULT (datetime('now')) )",
  "CREATE TABLE IF NOT EXISTS media ( id TEXT PRIMARY KEY, name TEXT, mime TEXT NOT NULL, size INTEGER, data BLOB NOT NULL, created_at TEXT DEFAULT (datetime('now')) )",
  "CREATE INDEX IF NOT EXISTS idx_products_pos ON products(position)",
  "CREATE INDEX IF NOT EXISTS idx_requests_date ON requests(created_at)"
];

// Requêtes paramétrées : aucun souci d'apostrophes ni de retours à la ligne.
const SEED = [
 {
  "sql": "INSERT OR IGNORE INTO products (id, name, arabic_name, tagline, description, price_cents, price_label, threshold, ingredients, allergens, traces, energy_kcal, proteins, carbs, fats, salt, image, gallery, featured, visible, position) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
  "params": [
   "sable-royal",
   "Sablé Royal",
   null,
   "L’élégance en une bouchée",
   "Un biscuit fondant, sublimé par la douceur du beurre, la richesse des amandes et une touche précieuse de feuille d’or. Parce que chaque détail compte, nous avons créé une pâtisserie qui allie raffinement et authenticité.",
   70,
   "la pièce",
   12,
   "Farine, Sucre glace, Beurre, Arôme amande, Amande, Œuf, Sucre en poudre, Sel, Gingembre confit, Nappage, Glucose, Feuille d’or",
   "Gluten (blé), Lait, Fruits à coque (amande), Œufs",
   null,
   480,
   6,
   60,
   24,
   0.5,
   "/assets/img/sable-royal.webp",
   "[]",
   1,
   1,
   10
  ]
 },
 {
  "sql": "INSERT OR IGNORE INTO products (id, name, arabic_name, tagline, description, price_cents, price_label, threshold, ingredients, allergens, traces, energy_kcal, proteins, carbs, fats, salt, image, gallery, featured, visible, position) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
  "params": [
   "cornes-de-gazelle",
   "Cornes de Gazelle",
   "كعب الغزال",
   "L’Art de la Tradition",
   "Plongez dans la douceur orientale avec nos Cornes de Gazelle, une alliance parfaite entre pâte fine parfumée à la fleur d’oranger et cœur fondant aux amandes. Ingrédients nobles, sans compromis sur la qualité. Fait maison, avec passion et authenticité.",
   80,
   "la pièce",
   12,
   "Farine, Sucre glace, Gomme arabique, Beurre, Eau de fleur d’oranger, Œuf, Amande, Sucre en poudre, Arôme amande",
   "Gluten, Lait, Œufs, Fruits à coque",
   null,
   475,
   8.5,
   60,
   22,
   0.15,
   "/assets/img/cornes-de-gazelle.webp",
   "[\"/assets/img/cornes-de-gazelle-coffrets.webp\"]",
   1,
   1,
   20
  ]
 },
 {
  "sql": "INSERT OR IGNORE INTO products (id, name, arabic_name, tagline, description, price_cents, price_label, threshold, ingredients, allergens, traces, energy_kcal, proteins, carbs, fats, salt, image, gallery, featured, visible, position) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
  "params": [
   "chbakia",
   "Chbakia",
   "شباكية",
   null,
   "Voici notre Chbakia artisanale, travaillée à la main selon la tradition et parfumée aux arômes authentiques : fleur d’oranger, miel pur, cannelle, fenouil et gomme arabique. Chaque pièce est dorée avec soin, puis généreusement enrobée de miel chaud et parsemée de sésame torréfié pour une texture crousti-fondante incomparable.",
   65,
   "la pièce",
   30,
   "Farine, Miel, Arôme fleur d’oranger, Gomme arabique, Cannelle, Eau de fleur d’oranger, Œuf, Beurre, Sucre en poudre, Glucose, Levure chimique, Sel, Vinaigre blanc, Graine de fenouil, Smen, Huile de sésame, Sésame, Poudre d’amande",
   "Gluten (farine), Œuf, Lait / produits laitiers (beurre + smen), Sésame (graine + huile), Amande (poudre d’amande)",
   null,
   520,
   8,
   62,
   8,
   0.4,
   "/assets/img/chbakia.webp",
   "[]",
   1,
   1,
   30
  ]
 },
 {
  "sql": "INSERT OR IGNORE INTO products (id, name, arabic_name, tagline, description, price_cents, price_label, threshold, ingredients, allergens, traces, energy_kcal, proteins, carbs, fats, salt, image, gallery, featured, visible, position) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
  "params": [
   "haloua-sesame",
   "Haloua Sésame",
   "حلوة السمسم",
   null,
   "Haloua Sésame est une création artisanale subtilement parfumée à la vanille et enrobée d’un manteau généreux de graines de sésame torréfiées. Sa texture allie croquant extérieur et fondant intérieur, offrant une douceur traditionnelle sublimée par un goût délicatement beurré.",
   30,
   "la pièce",
   15,
   "Farine, Œuf, Beurre, Sucre en poudre, Levure chimique, Sel, Sésame, Vanille liquide",
   "Gluten (farine), Œuf, Lait (beurre), Sésame",
   null,
   470,
   8,
   55,
   28,
   0.55,
   "/assets/img/haloua-sesame.webp",
   "[]",
   0,
   1,
   40
  ]
 },
 {
  "sql": "INSERT OR IGNORE INTO products (id, name, arabic_name, tagline, description, price_cents, price_label, threshold, ingredients, allergens, traces, energy_kcal, proteins, carbs, fats, salt, image, gallery, featured, visible, position) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
  "params": [
   "makrout",
   "Makrout",
   "مقروط",
   null,
   "Le Makrout est une pâtisserie orientale emblématique, délicatement travaillée, parfumée à la fleur d’oranger, au beurre et aux épices. Son cœur tendre à la pâte de dattes s’allie parfaitement à l’arôme subtil de cannelle et au parfum du safran. Chaque pièce est ensuite dorée puis trempée dans un miel parfumé, lui donnant une brillance naturelle et une douceur incomparable.",
   150,
   "la pièce",
   6,
   "Farine, Miel, Cannelle, Eau de fleur d’oranger, Beurre, Levure chimique, Sel, Pâte de dattes, Semoule extra fine, Huile, Safran",
   "Gluten (farine & semoule), Lait (beurre)",
   "Peut contenir des traces de fruits à coque.",
   445,
   5,
   60,
   34,
   0.35,
   "/assets/img/makrout.webp",
   "[]",
   0,
   1,
   50
  ]
 },
 {
  "sql": "INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)",
  "params": [
   "hero_title",
   "Saveurs des Rois"
  ]
 },
 {
  "sql": "INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)",
  "params": [
   "hero_text",
   "Pâtisseries orientales artisanales, faites maison avec passion et authenticité."
  ]
 },
 {
  "sql": "INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)",
  "params": [
   "quote_note",
   "Devis gratuit. Les prix dégressifs s’appliquent à partir du nombre de pièces indiqué pour chaque pâtisserie."
  ]
 },
 {
  "sql": "INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)",
  "params": [
   "story_title",
   "Notre histoire"
  ]
 },
 {
  "sql": "INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)",
  "params": [
   "story_body",
   "Chez Saveurs des Rois, chaque pâtisserie est façonnée à la main, selon la tradition, avec des ingrédients nobles et sans compromis sur la qualité.\n\n[À personnaliser depuis l’espace administrateur : vos origines, la personne qui vous a transmis ces recettes, vos premières fournées, ce qui rend votre maison unique.]"
  ]
 },
 {
  "sql": "INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)",
  "params": [
   "story_image",
   "/assets/img/cornes-de-gazelle-coffrets.webp"
  ]
 },
 {
  "sql": "INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)",
  "params": [
   "contact_phone",
   ""
  ]
 },
 {
  "sql": "INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)",
  "params": [
   "contact_whatsapp",
   ""
  ]
 },
 {
  "sql": "INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)",
  "params": [
   "contact_email",
   ""
  ]
 },
 {
  "sql": "INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)",
  "params": [
   "contact_instagram",
   ""
  ]
 },
 {
  "sql": "INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)",
  "params": [
   "contact_facebook",
   ""
  ]
 },
 {
  "sql": "INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)",
  "params": [
   "contact_tiktok",
   ""
  ]
 },
 {
  "sql": "INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)",
  "params": [
   "contact_zone",
   ""
  ]
 },
 {
  "sql": "INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)",
  "params": [
   "contact_hours",
   ""
  ]
 },
 {
  "sql": "INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)",
  "params": [
   "music_url",
   ""
  ]
 },
 {
  "sql": "INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)",
  "params": [
   "legal_text",
   "Éditeur : [Nom Prénom], micro-entrepreneur — Saveurs des Rois\nSIRET : [à compléter]\nAdresse : [à compléter]\nContact : [à compléter]\n\nHébergeur : Cloudflare, Inc. — 101 Townsend St, San Francisco, CA 94107, États-Unis.\n\nDonnées personnelles : les informations transmises via le formulaire de devis servent uniquement à répondre à votre demande et ne sont jamais revendues. Vous pouvez demander leur suppression à tout moment."
  ]
 }
];

/* ============================== Serveur ============================== */


const SESSION_COOKIE = 'sdr_session';
const SESSION_HOURS = 12;
const MAX_MEDIA_BYTES = 1_800_000; // limite D1 : ~2 Mo par ligne

const PRODUCT_FIELDS = [
  'name', 'arabic_name', 'tagline', 'description', 'price_cents', 'price_label', 'threshold',
  'ingredients', 'allergens', 'traces', 'energy_kcal', 'proteins', 'carbs', 'fats', 'salt',
  'image', 'gallery', 'featured', 'visible', 'position',
];
const VIDEO_FIELDS = ['title', 'description', 'url', 'poster', 'product_id', 'visible', 'position'];
const PUBLIC_SETTINGS = [
  'hero_title', 'hero_text', 'quote_note', 'story_title', 'story_body', 'story_image',
  'contact_phone', 'contact_whatsapp', 'contact_email', 'contact_instagram', 'contact_facebook',
  'contact_tiktok', 'contact_zone', 'contact_hours', 'music_url', 'legal_text',
];
const REQUEST_STATUSES = ['nouveau', 'en cours', 'devis envoyé', 'confirmé', 'archivé'];

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    try {
      if (path.startsWith('/api/') || path.startsWith('/media/')) {
        if (!env.DB) return json({ error: 'Base de données non reliée. Cloudflare Pages : Settings → Bindings → ajouter une base D1 nommée DB. Cloudflare Workers : vérifier database_id dans wrangler.jsonc.' }, 500);
        await ensureDb(env);
      }
      if (path.startsWith('/api/')) return await api(request, env, url);
      if (path.startsWith('/media/')) return await serveMedia(request, env, path.slice(7));
      return env.ASSETS.fetch(request);
    } catch (err) {
      console.error(err);
      return json({ error: 'Erreur serveur. Réessayez dans un instant.' }, 500);
    }
  },
};

/* ---------------------------------------------------------------- base D1 */

// Crée les tables et le contenu initial au premier accès (une seule fois par version).
let dbReady = null;
function ensureDb(env) {
  if (!dbReady) dbReady = initDb(env).catch(err => { dbReady = null; throw err; });
  return dbReady;
}
async function initDb(env) {
  const db = env.DB;
  const current = await db.prepare("SELECT value FROM settings WHERE key = 'schema_version'").first().catch(() => null);
  if (current?.value === SCHEMA_VERSION) return;
  await db.batch(SCHEMA.map(sql => db.prepare(sql)));
  await db.batch(SEED.map(({ sql, params }) => db.prepare(sql).bind(...params)));
  await db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('schema_version', ?)").bind(SCHEMA_VERSION).run();
}

/* ---------------------------------------------------------------- routes */

async function api(request, env, url) {
  const { pathname: p } = url;
  const m = request.method;

  // ---- Public
  if (p === '/api/catalogue' && m === 'GET') return catalogue(env);
  if (p === '/api/requests' && m === 'POST') return createRequest(request, env);

  // ---- Auth
  if (p === '/api/admin/login' && m === 'POST') return login(request, env);
  if (p === '/api/admin/logout' && m === 'POST') {
    return json({ ok: true }, 200, { 'Set-Cookie': `${SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict` });
  }

  if (p.startsWith('/api/admin/')) {
    if (!(await isAuthed(request, env))) return json({ error: 'Session expirée. Reconnectez-vous.' }, 401);
    // Protection CSRF simple : les écritures doivent venir du même site
    if (m !== 'GET' && !sameOrigin(request, url)) return json({ error: 'Origine refusée.' }, 403);
    return adminApi(request, env, p, m);
  }
  return json({ error: 'Route inconnue.' }, 404);
}

async function adminApi(request, env, p, m) {
  const db = env.DB;
  let mt;

  if (p === '/api/admin/me') return json({ ok: true });

  if (p === '/api/admin/overview' && m === 'GET') {
    const [products, videos, settings, counts] = await Promise.all([
      db.prepare('SELECT * FROM products ORDER BY position, name').all(),
      db.prepare('SELECT * FROM videos ORDER BY position, id').all(),
      db.prepare('SELECT key, value FROM settings').all(),
      db.prepare("SELECT status, COUNT(*) AS n FROM requests GROUP BY status").all(),
    ]);
    return json({
      products: products.results.map(parseProduct),
      videos: videos.results,
      settings: Object.fromEntries(settings.results.map(r => [r.key, r.value])),
      requestCounts: Object.fromEntries(counts.results.map(r => [r.status, r.n])),
    });
  }

  // Produits
  if (p === '/api/admin/products' && m === 'POST') {
    const body = await request.json();
    const id = slugify(body.id || body.name || '');
    if (!id || !body.name) return json({ error: 'Le nom du produit est obligatoire.' }, 400);
    const exists = await db.prepare('SELECT id FROM products WHERE id = ?').bind(id).first();
    if (exists) return json({ error: `Un produit « ${id} » existe déjà.` }, 409);
    const data = normalizeProduct(pick(body, PRODUCT_FIELDS));
    if (data.price_cents == null) return json({ error: 'Le prix est obligatoire.' }, 400);
    const cols = ['id', ...Object.keys(data)];
    await db.prepare(`INSERT INTO products (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`)
      .bind(id, ...Object.values(data)).run();
    return json({ ok: true, id });
  }
  if ((mt = p.match(/^\/api\/admin\/products\/([\w-]+)$/))) {
    const id = mt[1];
    if (m === 'PUT') {
      const data = normalizeProduct(pick(await request.json(), PRODUCT_FIELDS));
      if ('price_cents' in data && data.price_cents == null) return json({ error: 'Le prix est obligatoire.' }, 400);
      if ('name' in data && !data.name) return json({ error: 'Le nom est obligatoire.' }, 400);
      const keys = Object.keys(data);
      if (!keys.length) return json({ error: 'Aucune modification reçue.' }, 400);
      await db.prepare(`UPDATE products SET ${keys.map(k => `${k} = ?`).join(', ')}, updated_at = datetime('now') WHERE id = ?`)
        .bind(...Object.values(data), id).run();
      return json({ ok: true });
    }
    if (m === 'DELETE') {
      await db.prepare('DELETE FROM products WHERE id = ?').bind(id).run();
      return json({ ok: true });
    }
  }

  // Réglages / textes
  if (p === '/api/admin/settings' && m === 'PUT') {
    const body = await request.json();
    const stmts = Object.entries(body)
      .filter(([k]) => PUBLIC_SETTINGS.includes(k))
      .map(([k, v]) => db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').bind(k, String(v ?? '')));
    if (stmts.length) await db.batch(stmts);
    return json({ ok: true });
  }

  // Vidéos
  if (p === '/api/admin/videos' && m === 'POST') {
    const data = pick(await request.json(), VIDEO_FIELDS);
    if (!data.title || !data.url) return json({ error: 'Titre et lien de la vidéo obligatoires.' }, 400);
    const cols = Object.keys(data);
    const r = await db.prepare(`INSERT INTO videos (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`).bind(...Object.values(data)).run();
    return json({ ok: true, id: r.meta.last_row_id });
  }
  if ((mt = p.match(/^\/api\/admin\/videos\/(\d+)$/))) {
    if (m === 'PUT') {
      const data = pick(await request.json(), VIDEO_FIELDS);
      const keys = Object.keys(data);
      await db.prepare(`UPDATE videos SET ${keys.map(k => `${k} = ?`).join(', ')} WHERE id = ?`).bind(...Object.values(data), mt[1]).run();
      return json({ ok: true });
    }
    if (m === 'DELETE') {
      await db.prepare('DELETE FROM videos WHERE id = ?').bind(mt[1]).run();
      return json({ ok: true });
    }
  }

  // Demandes (devis / contact)
  if (p === '/api/admin/requests' && m === 'GET') {
    const r = await db.prepare('SELECT * FROM requests ORDER BY created_at DESC LIMIT 300').all();
    return json({ requests: r.results.map(x => ({ ...x, items: safeJson(x.items, []) })) });
  }
  if ((mt = p.match(/^\/api\/admin\/requests\/(\d+)$/))) {
    if (m === 'PUT') {
      const { status } = await request.json();
      if (!REQUEST_STATUSES.includes(status)) return json({ error: 'Statut inconnu.' }, 400);
      await db.prepare('UPDATE requests SET status = ? WHERE id = ?').bind(status, mt[1]).run();
      return json({ ok: true });
    }
    if (m === 'DELETE') {
      await db.prepare('DELETE FROM requests WHERE id = ?').bind(mt[1]).run();
      return json({ ok: true });
    }
  }

  // Médias (images importées depuis l'admin)
  if (p === '/api/admin/media' && m === 'GET') {
    const r = await db.prepare('SELECT id, name, mime, size, created_at FROM media ORDER BY created_at DESC').all();
    return json({ media: r.results.map(x => ({ ...x, url: `/media/${x.id}` })) });
  }
  if (p === '/api/admin/media' && m === 'POST') {
    const form = await request.formData();
    const file = form.get('file');
    if (!file || typeof file === 'string') return json({ error: 'Aucun fichier reçu.' }, 400);
    if (!/^image\/(webp|jpeg|png|avif)$/.test(file.type)) return json({ error: 'Formats acceptés : WebP, JPEG, PNG, AVIF.' }, 400);
    if (file.size > MAX_MEDIA_BYTES) return json({ error: 'Image trop lourde (1,8 Mo max). Elle est normalement compressée automatiquement : réessayez.' }, 413);
    const id = crypto.randomUUID().replace(/-/g, '').slice(0, 16);
    const buf = await file.arrayBuffer();
    await db.prepare('INSERT INTO media (id, name, mime, size, data) VALUES (?, ?, ?, ?, ?)')
      .bind(id, (form.get('name') || file.name || 'image').toString().slice(0, 120), file.type, file.size, buf).run();
    return json({ ok: true, id, url: `/media/${id}` });
  }
  if ((mt = p.match(/^\/api\/admin\/media\/(\w+)$/)) && m === 'DELETE') {
    await db.prepare('DELETE FROM media WHERE id = ?').bind(mt[1]).run();
    return json({ ok: true });
  }

  return json({ error: 'Route admin inconnue.' }, 404);
}

/* ---------------------------------------------------------------- public */

async function catalogue(env) {
  const db = env.DB;
  const keys = PUBLIC_SETTINGS.map(() => '?').join(',');
  const [products, videos, settings] = await db.batch([
    db.prepare('SELECT * FROM products WHERE visible = 1 ORDER BY position, name'),
    db.prepare('SELECT id, title, description, url, poster, product_id FROM videos WHERE visible = 1 ORDER BY position, id'),
    db.prepare(`SELECT key, value FROM settings WHERE key IN (${keys})`).bind(...PUBLIC_SETTINGS),
  ]);
  return json({
    products: products.results.map(parseProduct),
    videos: videos.results,
    settings: Object.fromEntries(settings.results.map(r => [r.key, r.value])),
  }, 200, { 'Cache-Control': 'public, max-age=30' });
}

async function createRequest(request, env) {
  let body;
  try { body = await request.json(); } catch { return json({ error: 'Demande illisible.' }, 400); }
  if (body.website) return json({ ok: true }); // pot de miel anti-robots
  const name = clean(body.name, 120);
  const email = clean(body.email, 160);
  const phone = clean(body.phone, 40);
  if (!name) return json({ error: 'Indiquez votre nom.' }, 400);
  if (!email && !phone) return json({ error: 'Indiquez un e-mail ou un téléphone pour que nous puissions vous répondre.' }, 400);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: 'L’adresse e-mail semble incorrecte.' }, 400);

  // Les prix sont recalculés côté serveur à partir de la base (jamais depuis le navigateur)
  const items = Array.isArray(body.items) ? body.items.slice(0, 40) : [];
  let estimate = 0;
  const checked = [];
  if (items.length) {
    const ids = items.map(i => String(i.id));
    const rows = await env.DB.prepare(`SELECT id, name, price_cents, price_label FROM products WHERE id IN (${ids.map(() => '?').join(',')})`).bind(...ids).all();
    const byId = Object.fromEntries(rows.results.map(r => [r.id, r]));
    for (const it of items) {
      const prod = byId[it.id];
      const qty = Math.max(0, Math.min(5000, toInt(it.qty) || 0));
      if (!prod || !qty) continue;
      checked.push({ id: prod.id, name: prod.name, qty, unit_cents: prod.price_cents, label: prod.price_label });
      estimate += qty * prod.price_cents;
    }
  }

  await env.DB.prepare(`INSERT INTO requests (kind, name, email, phone, event_date, event_type, delivery, message, items, estimate_cents)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(
    body.kind === 'contact' ? 'contact' : 'devis', name, email, phone,
    clean(body.event_date, 20), clean(body.event_type, 60), clean(body.delivery, 60),
    clean(body.message, 3000), JSON.stringify(checked), estimate,
  ).run();
  return json({ ok: true, estimate_cents: estimate });
}

async function serveMedia(request, env, id) {
  if (!/^\w{1,32}$/.test(id)) return new Response('Introuvable', { status: 404 });
  const row = await env.DB.prepare('SELECT mime, data FROM media WHERE id = ?').bind(id).first();
  if (!row) return new Response('Introuvable', { status: 404 });
  return new Response(new Uint8Array(row.data), {
    headers: { 'Content-Type': row.mime, 'Cache-Control': 'public, max-age=31536000, immutable' },
  });
}

/* ---------------------------------------------------------------- auth */

async function login(request, env) {
  if (!env.ADMIN_PASSWORD) {
    return json({ error: 'Mot de passe non configuré : Cloudflare → Workers & Pages → saveurs-des-rois → Settings → Variables and Secrets → ajouter le secret ADMIN_PASSWORD, puis redéployer.' }, 500);
  }
  const { password } = await request.json().catch(() => ({}));
  const ok = await safeEqual(String(password || ''), env.ADMIN_PASSWORD);
  if (!ok) {
    await new Promise(r => setTimeout(r, 900)); // ralentit les essais en série
    return json({ error: 'Mot de passe incorrect.' }, 401);
  }
  const exp = Date.now() + SESSION_HOURS * 3600_000;
  const token = `${exp}.${await hmac(String(exp), await sessionKey(env))}`;
  return json({ ok: true }, 200, {
    'Set-Cookie': `${SESSION_COOKIE}=${token}; Path=/; Max-Age=${SESSION_HOURS * 3600}; HttpOnly; Secure; SameSite=Strict`,
  });
}

async function isAuthed(request, env) {
  if (!env.ADMIN_PASSWORD) return false;
  const cookie = request.headers.get('Cookie') || '';
  const match = cookie.match(new RegExp(`${SESSION_COOKIE}=([^;]+)`));
  if (!match) return false;
  const [exp, sig] = match[1].split('.');
  if (!exp || !sig || Number(exp) < Date.now()) return false;
  return safeEqual(sig, await hmac(exp, await sessionKey(env)));
}

// Clé de signature des sessions : SESSION_SECRET si défini, sinon dérivée du mot de passe
// (changer le mot de passe déconnecte alors toutes les sessions).
async function sessionKey(env) {
  if (env.SESSION_SECRET) return env.SESSION_SECRET;
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('sdr-session:' + env.ADMIN_PASSWORD));
  return btoa(String.fromCharCode(...new Uint8Array(d)));
}

async function hmac(message, secret) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
  return btoa(String.fromCharCode(...new Uint8Array(sig))).replace(/[+/=]/g, c => ({ '+': '-', '/': '_', '=': '' }[c]));
}

async function safeEqual(a, b) {
  const enc = new TextEncoder();
  const [ha, hb] = await Promise.all([crypto.subtle.digest('SHA-256', enc.encode(a)), crypto.subtle.digest('SHA-256', enc.encode(b))]);
  const x = new Uint8Array(ha), y = new Uint8Array(hb);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

function sameOrigin(request, url) {
  const origin = request.headers.get('Origin');
  return !origin || origin === url.origin;
}

/* ---------------------------------------------------------------- utils */

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers },
  });
}
function pick(obj, fields) {
  const out = {};
  for (const f of fields) if (obj && f in obj) out[f] = obj[f] === '' ? null : obj[f];
  return out;
}
function normalizeProduct(data) {
  if (data.gallery && typeof data.gallery !== 'string') data.gallery = JSON.stringify(data.gallery);
  for (const k of ['price_cents', 'threshold', 'featured', 'visible', 'position']) if (k in data) data[k] = data[k] == null ? null : toInt(data[k]);
  for (const k of ['energy_kcal', 'proteins', 'carbs', 'fats', 'salt']) if (k in data) data[k] = data[k] == null ? null : toNum(data[k]);
  for (const k of ['featured', 'visible', 'position']) if (k in data && data[k] == null) data[k] = 0;
  return data;
}
function parseProduct(p) { return { ...p, gallery: safeJson(p.gallery, []) }; }
function safeJson(s, fallback) { try { return JSON.parse(s ?? ''); } catch { return fallback; } }
function toInt(v) { const n = parseInt(v, 10); return Number.isFinite(n) ? n : null; }
function toNum(v) { const n = parseFloat(String(v).replace(',', '.')); return Number.isFinite(n) ? n : null; }
function clean(v, max) { return String(v ?? '').trim().slice(0, max); }
function slugify(s) {
  return String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
}
