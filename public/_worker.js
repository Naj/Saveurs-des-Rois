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


const SCHEMA_VERSION = '3';

const SCHEMA = [
  "CREATE TABLE IF NOT EXISTS products ( id TEXT PRIMARY KEY, name TEXT NOT NULL, arabic_name TEXT, tagline TEXT, description TEXT, price_cents INTEGER NOT NULL, price_label TEXT DEFAULT 'la pièce', threshold INTEGER, ingredients TEXT, allergens TEXT, traces TEXT, energy_kcal REAL, proteins REAL, carbs REAL, fats REAL, salt REAL, image TEXT, gallery TEXT DEFAULT '[]', featured INTEGER DEFAULT 0, visible INTEGER DEFAULT 1, position INTEGER DEFAULT 0, updated_at TEXT DEFAULT (datetime('now')) )",
  "CREATE TABLE IF NOT EXISTS settings ( key TEXT PRIMARY KEY, value TEXT )",
  "CREATE TABLE IF NOT EXISTS videos ( id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, description TEXT, url TEXT NOT NULL, poster TEXT, product_id TEXT, visible INTEGER DEFAULT 1, position INTEGER DEFAULT 0, created_at TEXT DEFAULT (datetime('now')) )",
  "CREATE TABLE IF NOT EXISTS requests ( id INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT NOT NULL DEFAULT 'devis', name TEXT NOT NULL, email TEXT, phone TEXT, event_date TEXT, event_type TEXT, delivery TEXT, message TEXT, items TEXT DEFAULT '[]', estimate_cents INTEGER DEFAULT 0, status TEXT DEFAULT 'nouveau', created_at TEXT DEFAULT (datetime('now')) )",
  "CREATE TABLE IF NOT EXISTS media ( id TEXT PRIMARY KEY, name TEXT, mime TEXT NOT NULL, size INTEGER, data BLOB NOT NULL, created_at TEXT DEFAULT (datetime('now')) )",
  "CREATE INDEX IF NOT EXISTS idx_products_pos ON products(position)",
  "CREATE INDEX IF NOT EXISTS idx_requests_date ON requests(created_at)",
  "CREATE TABLE IF NOT EXISTS gallery ( id INTEGER PRIMARY KEY AUTOINCREMENT, image TEXT NOT NULL, title TEXT, event_type TEXT, caption TEXT, visible INTEGER DEFAULT 1, position INTEGER DEFAULT 0, created_at TEXT DEFAULT (datetime('now')) )",
  "CREATE TABLE IF NOT EXISTS reviews ( id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, event_type TEXT, rating INTEGER NOT NULL, text TEXT NOT NULL, reply TEXT, source TEXT DEFAULT 'site', status TEXT DEFAULT 'en attente', event_date TEXT, created_at TEXT DEFAULT (datetime('now')) )",
  "CREATE INDEX IF NOT EXISTS idx_reviews_status ON reviews(status, created_at)",
  "CREATE TABLE IF NOT EXISTS stats ( day TEXT NOT NULL, kind TEXT NOT NULL, key TEXT NOT NULL DEFAULT '', n INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (day, kind, key) )"
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
const APP_VERSION = '2.4';
const GALLERY_FIELDS = ['image', 'title', 'event_type', 'caption', 'visible', 'position'];
const REVIEW_STATUSES = ['en attente', 'publié', 'refusé'];
const TRACK_PAGES = ['accueil', 'collection', 'p', 'histoire', 'evenements', 'avis', 'videos', 'contact', 'devis', 'mentions'];
const BOT_UA = /bot|crawl|spider|slurp|preview|facebookexternalhit|headless|lighthouse|monitor|curl|wget|python|httpclient/i;
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
      if (path.startsWith('/api/')) return await api(request, env, url, ctx);
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

async function api(request, env, url, ctx) {
  const { pathname: p } = url;
  const m = request.method;

  // ---- Public
  if (p === '/api/catalogue' && m === 'GET') return catalogue(env);
  if (p === '/api/requests' && m === 'POST') return createRequest(request, env, url, ctx);
  if (p === '/api/reviews' && m === 'POST') return createReview(request, env, url, ctx);
  if (p === '/api/track' && m === 'POST') return track(request, env);

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

  if (p === '/api/admin/test-alert' && m === 'POST') {
    const channels = alertChannels(env);
    if (!channels.email && !channels.whatsapp) return json({ error: 'Aucune alerte configurée (voir le guide, section « Alertes de devis »).' }, 400);
    const results = await notify(env, {
      kind: 'devis', name: 'Test — Saveurs des Rois', email: '', phone: '', event_date: '', event_type: 'Test',
      delivery: '', message: 'Ceci est une alerte de test envoyée depuis l’espace administrateur.', items: [], estimate_cents: 0,
    }, new URL(request.url).origin);
    const failed = results.filter(r => !r.ok);
    if (failed.length) return json({ error: failed.map(f => `${f.channel} : ${f.error}`).join(' — ') }, 502);
    return json({ ok: true, sent: results.map(r => r.channel) });
  }

  if (p === '/api/admin/overview' && m === 'GET') {
    const [products, videos, settings, counts, gallery, pending] = await Promise.all([
      db.prepare('SELECT * FROM products ORDER BY position, name').all(),
      db.prepare('SELECT * FROM videos ORDER BY position, id').all(),
      db.prepare('SELECT key, value FROM settings').all(),
      db.prepare("SELECT status, COUNT(*) AS n FROM requests GROUP BY status").all(),
      db.prepare('SELECT * FROM gallery ORDER BY position, id DESC').all(),
      db.prepare("SELECT COUNT(*) AS n FROM reviews WHERE status = 'en attente'").first(),
    ]);
    return json({
      products: products.results.map(parseProduct),
      videos: videos.results,
      settings: Object.fromEntries(settings.results.map(r => [r.key, r.value])),
      requestCounts: Object.fromEntries(counts.results.map(r => [r.status, r.n])),
      alerts: alertChannels(env),
      alertTargets: {
        email: env.ALERT_EMAIL ? env.ALERT_EMAIL.split(',').map(maskEmail).join(', ') : '',
        whatsapp: env.CALLMEBOT_PHONE ? String(env.CALLMEBOT_PHONE).replace(/\d(?=\d{2})/g, '•') : '',
        from: env.ALERT_FROM || '',
      },
      version: APP_VERSION,
      gallery: gallery.results,
      pendingReviews: pending?.n || 0,
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

  // Galerie « Vos événements »
  if (p === '/api/admin/gallery' && m === 'POST') {
    const d = pick(await request.json(), GALLERY_FIELDS);
    if (!d.image) return json({ error: 'Choisissez une photo.' }, 400);
    const cols = Object.keys(d);
    const r = await db.prepare(`INSERT INTO gallery (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`).bind(...Object.values(d)).run();
    return json({ ok: true, id: r.meta.last_row_id });
  }
  if ((mt = p.match(/^\/api\/admin\/gallery\/(\d+)$/))) {
    if (m === 'PUT') {
      const d = pick(await request.json(), GALLERY_FIELDS);
      const keys = Object.keys(d);
      if (!keys.length) return json({ error: 'Aucune modification.' }, 400);
      await db.prepare(`UPDATE gallery SET ${keys.map(k => `${k} = ?`).join(', ')} WHERE id = ?`).bind(...Object.values(d), mt[1]).run();
      return json({ ok: true });
    }
    if (m === 'DELETE') { await db.prepare('DELETE FROM gallery WHERE id = ?').bind(mt[1]).run(); return json({ ok: true }); }
  }

  // Avis clients
  if (p === '/api/admin/reviews' && m === 'GET') {
    const r = await db.prepare('SELECT * FROM reviews ORDER BY created_at DESC LIMIT 500').all();
    return json({ reviews: r.results });
  }
  if (p === '/api/admin/reviews' && m === 'POST') {
    const b = await request.json();
    const rating = toInt(b.rating);
    if (!clean(b.name, 80) || !clean(b.text, 1500) || !(rating >= 1 && rating <= 5)) return json({ error: 'Nom, note (1 à 5) et texte obligatoires.' }, 400);
    await db.prepare(`INSERT INTO reviews (name, event_type, rating, text, event_date, source, status) VALUES (?, ?, ?, ?, ?, 'message', 'publié')`)
      .bind(clean(b.name, 80), clean(b.event_type, 60), rating, clean(b.text, 1500), clean(b.event_date, 20)).run();
    return json({ ok: true });
  }
  if ((mt = p.match(/^\/api\/admin\/reviews\/(\d+)$/))) {
    if (m === 'PUT') {
      const b = await request.json();
      const sets = [], vals = [];
      if ('status' in b) { if (!REVIEW_STATUSES.includes(b.status)) return json({ error: 'Statut inconnu.' }, 400); sets.push('status = ?'); vals.push(b.status); }
      if ('reply' in b) { sets.push('reply = ?'); vals.push(clean(b.reply, 1500)); }
      if (!sets.length) return json({ error: 'Aucune modification.' }, 400);
      await db.prepare(`UPDATE reviews SET ${sets.join(', ')} WHERE id = ?`).bind(...vals, mt[1]).run();
      return json({ ok: true });
    }
    if (m === 'DELETE') { await db.prepare('DELETE FROM reviews WHERE id = ?').bind(mt[1]).run(); return json({ ok: true }); }
  }

  // Statistiques (mesure d'audience anonyme)
  if (p === '/api/admin/stats' && m === 'GET') {
    const days = Math.min(365, Math.max(1, toInt(new URL(request.url).searchParams.get('days')) || 30));
    const since = parisDay(Date.now() - (days - 1) * 86400_000);
    const [rows, reqs] = await db.batch([
      db.prepare('SELECT day, kind, key, n FROM stats WHERE day >= ? ORDER BY day').bind(since),
      db.prepare("SELECT substr(created_at, 1, 10) AS day, kind, COUNT(*) AS n FROM requests WHERE created_at >= ? GROUP BY day, kind").bind(since),
    ]);
    return json({ since, days, rows: rows.results, requests: reqs.results });
  }

  return json({ error: 'Route admin inconnue.' }, 404);
}

/* ---------------------------------------------------------------- public */

async function catalogue(env) {
  const db = env.DB;
  const keys = PUBLIC_SETTINGS.map(() => '?').join(',');
  const [products, videos, settings, gallery, reviews] = await db.batch([
    db.prepare('SELECT * FROM products WHERE visible = 1 ORDER BY position, name'),
    db.prepare('SELECT id, title, description, url, poster, product_id FROM videos WHERE visible = 1 ORDER BY position, id'),
    db.prepare(`SELECT key, value FROM settings WHERE key IN (${keys})`).bind(...PUBLIC_SETTINGS),
    db.prepare('SELECT id, image, title, event_type, caption FROM gallery WHERE visible = 1 ORDER BY position, id DESC'),
    db.prepare("SELECT id, name, event_type, rating, text, reply, source, created_at FROM reviews WHERE status = 'publié' ORDER BY created_at DESC LIMIT 100"),
  ]);
  return json({
    gallery: gallery.results,
    reviews: reviews.results,
    products: products.results.map(parseProduct),
    videos: videos.results,
    settings: Object.fromEntries(settings.results.map(r => [r.key, r.value])),
  }, 200, { 'Cache-Control': 'public, max-age=30' });
}

async function createRequest(request, env, url, ctx) {
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

  const record = {
    kind: body.kind === 'contact' ? 'contact' : 'devis', name, email, phone,
    event_date: clean(body.event_date, 20), event_type: clean(body.event_type, 60), delivery: clean(body.delivery, 60),
    message: clean(body.message, 3000), items: checked, estimate_cents: estimate,
  };
  await env.DB.prepare(`INSERT INTO requests (kind, name, email, phone, event_date, event_type, delivery, message, items, estimate_cents)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(
    record.kind, name, email, phone, record.event_date, record.event_type, record.delivery,
    record.message, JSON.stringify(checked), estimate,
  ).run();

  // Alerte envoyée en arrière-plan : le client n'attend pas, et un échec d'envoi ne bloque jamais sa demande
  const alert = notify(env, record, url.origin).catch(err => console.error('Alerte non envoyée :', err.message));
  if (ctx?.waitUntil) ctx.waitUntil(alert);
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

/* ---------------------------------------------------------------- avis & audience */

async function createReview(request, env, url, ctx) {
  let b;
  try { b = await request.json(); } catch { return json({ error: 'Avis illisible.' }, 400); }
  if (b.website) return json({ ok: true }); // pot de miel
  const name = clean(b.name, 80), text = clean(b.text, 1500), rating = toInt(b.rating);
  if (!name) return json({ error: 'Indiquez votre prénom.' }, 400);
  if (!(rating >= 1 && rating <= 5)) return json({ error: 'Choisissez une note de 1 à 5 étoiles.' }, 400);
  if (text.length < 10) return json({ error: 'Votre avis est un peu court : quelques mots de plus ?' }, 400);
  const event_type = clean(b.event_type, 60);
  await env.DB.prepare('INSERT INTO reviews (name, event_type, rating, text, source, status) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(name, event_type, rating, text, 'site', 'en attente').run();
  const alert = notify(env, { kind: 'avis', name, rating, event_type, message: text, items: [], estimate_cents: 0 }, url.origin)
    .catch(err => console.error('Alerte avis non envoyée :', err.message));
  if (ctx?.waitUntil) ctx.waitUntil(alert);
  return json({ ok: true });
}

// Mesure d'audience anonyme : aucun cookie, aucune adresse IP, aucun identifiant ; uniquement des compteurs par jour.
async function track(request, env) {
  const ua = request.headers.get('User-Agent') || '';
  if (!ua || BOT_UA.test(ua)) return new Response(null, { status: 204 });
  let b;
  try { b = JSON.parse(await request.text()); } catch { return new Response(null, { status: 204 }); }
  const day = parisDay(Date.now());
  const hits = [];
  if (TRACK_PAGES.includes(b.p)) hits.push(['page', b.p]);
  if (b.prod && /^[\w-]{1,60}$/.test(b.prod)) hits.push(['produit', b.prod]);
  if (b.add && /^[\w-]{1,60}$/.test(b.add)) hits.push(['ajout', b.add]);
  if (b.v) {
    hits.push(['visite', '']);
    const src = String(b.src || 'direct').toLowerCase().replace(/^www\./, '').slice(0, 60);
    hits.push(['source', /^[a-z0-9.-]+$/.test(src) ? src : 'autre']);
    if (b.dev === 'mobile' || b.dev === 'ordinateur' || b.dev === 'tablette') hits.push(['appareil', b.dev]);
  }
  if (!hits.length) return new Response(null, { status: 204 });
  await env.DB.batch(hits.slice(0, 6).map(([kind, key]) => env.DB.prepare(
    'INSERT INTO stats (day, kind, key, n) VALUES (?, ?, ?, 1) ON CONFLICT(day, kind, key) DO UPDATE SET n = n + 1').bind(day, kind, key)));
  return new Response(null, { status: 204 });
}

function parisDay(ts) {
  return new Date(ts).toLocaleDateString('sv-SE', { timeZone: 'Europe/Paris' }); // AAAA-MM-JJ
}

/* ---------------------------------------------------------------- alertes */

// Canaux configurés par des secrets Cloudflare (Settings → Variables and Secrets) :
//  - e-mail via Resend : RESEND_API_KEY + ALERT_EMAIL (+ ALERT_FROM facultatif)
//  - WhatsApp via CallMeBot : CALLMEBOT_PHONE + CALLMEBOT_APIKEY
function maskEmail(e) {
  const [u, d] = String(e).trim().split('@');
  return d ? `${u.slice(0, 2)}${'•'.repeat(Math.max(1, u.length - 2))}@${d}` : '';
}
function alertChannels(env) {
  return {
    email: Boolean(env.RESEND_API_KEY && env.ALERT_EMAIL),
    whatsapp: Boolean(env.CALLMEBOT_PHONE && env.CALLMEBOT_APIKEY),
  };
}

async function notify(env, r, origin) {
  const channels = alertChannels(env);
  const label = r.kind === 'avis' ? 'Nouvel avis client à valider' : r.kind === 'contact' ? 'Nouveau message' : 'Nouvelle demande de devis';
  const fmt = c => (c / 100).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' });
  const lines = r.items.map(i => `${i.qty} × ${i.name} (${fmt(i.unit_cents)} ${i.label || ''})`);
  const details = [
    r.rating && `Note : ${'★'.repeat(r.rating)}${'☆'.repeat(5 - r.rating)}`,
    r.phone && `Téléphone : ${r.phone}`, r.email && `E-mail : ${r.email}`,
    r.event_type && `Occasion : ${r.event_type}`, r.event_date && `Date : ${r.event_date}`, r.delivery && `Retrait / livraison : ${r.delivery}`,
  ].filter(Boolean);
  const tasks = [];

  if (channels.email) {
    const e = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const html = `<div style="font-family:Georgia,serif;max-width:560px;margin:auto;color:#1e1812">
      <div style="background:#050505;color:#d6b55d;padding:18px 22px;font-size:20px;letter-spacing:.04em">Saveurs des Rois</div>
      <div style="border:1px solid #dcc08f;border-top:0;padding:22px;background:#fbf8f1">
        <h2 style="margin:0 0 12px;font-size:20px">${e(label)} — ${e(r.name)}</h2>
        <p style="margin:0 0 14px;line-height:1.6">${details.map(e).join('<br>')}</p>
        ${lines.length ? `<table style="width:100%;border-collapse:collapse;margin:0 0 10px">${r.items.map(i => `<tr><td style="padding:6px 0;border-bottom:1px solid #e8dcc2">${i.qty} × ${e(i.name)}</td><td style="padding:6px 0;border-bottom:1px solid #e8dcc2;text-align:right">${fmt(i.qty * i.unit_cents)}</td></tr>`).join('')}</table>
        <p style="margin:0 0 14px;text-align:right"><strong>Estimation : ${fmt(r.estimate_cents)}</strong></p>` : ''}
        ${r.message ? `<p style="white-space:pre-wrap;background:#fff;border:1px solid #e8dcc2;padding:12px;border-radius:8px">${e(r.message)}</p>` : ''}
        <p style="margin:20px 0 0"><a href="${origin}/admin/" style="background:#050505;color:#d6b55d;padding:10px 18px;border-radius:999px;text-decoration:none">Ouvrir l’espace administrateur</a></p>
      </div></div>`;
    tasks.push(fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: env.ALERT_FROM || 'Saveurs des Rois <onboarding@resend.dev>',
        to: env.ALERT_EMAIL.split(',').map(s => s.trim()).filter(Boolean),
        reply_to: r.email || undefined,
        subject: `${label} — ${r.name}${r.estimate_cents ? ` (${fmt(r.estimate_cents)})` : ''}`,
        html,
        text: [label + ' — ' + r.name, ...details, ...lines, r.estimate_cents ? `Estimation : ${fmt(r.estimate_cents)}` : '', r.message, `${origin}/admin/`].filter(Boolean).join('\n'),
      }),
    }).then(async res => res.ok ? { channel: 'E-mail', ok: true } : { channel: 'E-mail', ok: false, error: (await res.json().catch(() => ({}))).message || `erreur ${res.status}` }));
  }

  if (channels.whatsapp) {
    const text = [`*${label}* — ${r.name}`, ...details, ...lines, r.estimate_cents ? `Estimation : ${fmt(r.estimate_cents)}` : '', r.message && `« ${r.message.slice(0, 300)} »`, `${origin}/admin/`].filter(Boolean).join('\n');
    const q = new URLSearchParams({ phone: env.CALLMEBOT_PHONE, apikey: env.CALLMEBOT_APIKEY, text });
    tasks.push(fetch(`https://api.callmebot.com/whatsapp.php?${q}`)
      .then(async res => res.ok ? { channel: 'WhatsApp', ok: true } : { channel: 'WhatsApp', ok: false, error: `erreur ${res.status}` }));
  }

  return Promise.all(tasks.map(t => t.catch(err => ({ channel: '?', ok: false, error: err.message }))));
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
