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


const SCHEMA_VERSION = '12';

// Colonnes ajoutées après la première version (ajoutées une à une, sans rien effacer)
const ADD_COLUMNS = [
  "ALTER TABLE products ADD COLUMN price_mode TEXT DEFAULT 'piece'",   // piece | kg | both | devis
  'ALTER TABLE products ADD COLUMN price_kg_cents INTEGER',            // prix au kilo (professionnels)
  'ALTER TABLE products ADD COLUMN min_kg REAL',                       // commande minimale au kilo
  'ALTER TABLE requests ADD COLUMN quote TEXT',                        // devis PDF enregistré (JSON)
  'ALTER TABLE products ADD COLUMN tiers TEXT',                        // grille dégressive : [{min, price_cents}]
  'ALTER TABLE requests ADD COLUMN pro_id INTEGER',                    // demande envoyée par un client professionnel
  'ALTER TABLE invoices ADD COLUMN sent_at TEXT',                      // dernier envoi de la facture par e-mail depuis le site
  'ALTER TABLE invoices ADD COLUMN sent_to TEXT',
  'ALTER TABLE requests ADD COLUMN quote_sent_at TEXT',                // devis envoyé par e-mail depuis le site
  'ALTER TABLE requests ADD COLUMN quote_sent_to TEXT',
  'ALTER TABLE requests ADD COLUMN accepted_at TEXT',                  // devis accepté en ligne par le client
  'ALTER TABLE requests ADD COLUMN accepted_name TEXT',
  'ALTER TABLE requests ADD COLUMN accepted_quote TEXT',               // copie du devis tel qu'accepté
];

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
  "CREATE TABLE IF NOT EXISTS stats ( day TEXT NOT NULL, kind TEXT NOT NULL, key TEXT NOT NULL DEFAULT '', n INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (day, kind, key) )",
  "CREATE TABLE IF NOT EXISTS file_meta ( id TEXT PRIMARY KEY, name TEXT, mime TEXT, size INTEGER, chunks INTEGER, updated_at TEXT DEFAULT (datetime('now')) )",
  "CREATE TABLE IF NOT EXISTS file_chunks ( id TEXT NOT NULL, idx INTEGER NOT NULL, data BLOB NOT NULL, PRIMARY KEY (id, idx) )",
  "CREATE TABLE IF NOT EXISTS invoices ( id INTEGER PRIMARY KEY AUTOINCREMENT, number TEXT UNIQUE, type TEXT NOT NULL DEFAULT 'facture', status TEXT NOT NULL DEFAULT 'brouillon', request_ids TEXT DEFAULT '[]', pro_id INTEGER, parent_id INTEGER, is_pro INTEGER DEFAULT 0, client TEXT DEFAULT '{}', lines TEXT DEFAULT '[]', total_cents INTEGER DEFAULT 0, deduct_cents INTEGER DEFAULT 0, issue_date TEXT, sale_date TEXT, due_date TEXT, object TEXT, quote_ref TEXT, notes TEXT, payment_link TEXT, sumup_checkout_id TEXT, reminders INTEGER DEFAULT 0, last_reminder_at TEXT, source TEXT DEFAULT 'site', import_batch TEXT, created_at TEXT DEFAULT (datetime('now')), validated_at TEXT )",
  "CREATE INDEX IF NOT EXISTS idx_invoices_date ON invoices(issue_date)",
  "CREATE TABLE IF NOT EXISTS payments ( id INTEGER PRIMARY KEY AUTOINCREMENT, invoice_id INTEGER NOT NULL, date TEXT NOT NULL, amount_cents INTEGER NOT NULL, method TEXT, ref TEXT, note TEXT, import_batch TEXT, created_at TEXT DEFAULT (datetime('now')) )",
  "CREATE INDEX IF NOT EXISTS idx_payments_inv ON payments(invoice_id)",
  "CREATE TABLE IF NOT EXISTS expenses ( id INTEGER PRIMARY KEY AUTOINCREMENT, date TEXT NOT NULL, supplier TEXT, category TEXT, label TEXT, amount_cents INTEGER NOT NULL, method TEXT, note TEXT, import_batch TEXT, created_at TEXT DEFAULT (datetime('now')) )",
  "CREATE TABLE IF NOT EXISTS pros ( id INTEGER PRIMARY KEY AUTOINCREMENT, company TEXT NOT NULL, siret TEXT, activity TEXT, contact_name TEXT, email TEXT, phone TEXT, city TEXT, volume TEXT, message TEXT, code TEXT UNIQUE, status TEXT DEFAULT 'en attente', note TEXT, created_at TEXT DEFAULT (datetime('now')), last_login TEXT )"
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
   "Plongez dans la douceur marocaine avec nos Cornes de Gazelle, une alliance parfaite entre pâte fine parfumée à la fleur d’oranger et cœur fondant aux amandes. Ingrédients nobles, sans compromis sur la qualité. Fait maison, avec passion et authenticité.",
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
   "Le Makrout est une pâtisserie marocaine emblématique, délicatement travaillée, parfumée à la fleur d’oranger, au beurre et aux épices. Son cœur tendre à la pâte de dattes s’allie parfaitement à l’arôme subtil de cannelle et au parfum du safran. Chaque pièce est ensuite dorée puis trempée dans un miel parfumé, lui donnant une brillance naturelle et une douceur incomparable.",
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
   "Pâtisseries marocaines artisanales, faites maison avec passion et authenticité."
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
  'image', 'gallery', 'featured', 'visible', 'position', 'price_mode', 'price_kg_cents', 'min_kg', 'tiers',
];
const PRICE_MODES = ['piece', 'kg', 'both', 'devis'];
const VIDEO_FIELDS = ['title', 'description', 'url', 'poster', 'product_id', 'visible', 'position'];
// Réglages privés (devis) : modifiables dans l'admin, jamais renvoyés au site public
const QUOTE_SETTINGS = ['company_name', 'company_owner', 'company_siret', 'company_address', 'company_phone', 'company_email',
  'quote_validity', 'quote_payment', 'quote_legal', 'quote_footer',
  // Facturation
  'invoice_terms', 'invoice_terms_pro', 'invoice_due_days_pro', 'invoice_late_text', 'invoice_footer', 'invoice_next',
  'company_iban', 'company_bic', 'sumup_link', 'social_rate', 'ca_ceiling', 'vat_threshold'];
// Fichiers volumineux (musique, carte PDF) découpés en morceaux de 1,5 Mo dans D1
const FILES = {
  musique: { types: /^audio\/(mpeg|mp3|mp4|x-m4a|m4a|aac|ogg|wav|x-wav|webm)$/, max: 15_000_000, label: 'un fichier audio (MP3, M4A, OGG)' },
  carte: { types: /^application\/pdf$/, max: 25_000_000, label: 'un fichier PDF' },
};
const CHUNK = 1_500_000;
const PUBLIC_SETTINGS = ['carte_mode', 
  'hero_title', 'hero_text', 'quote_note', 'story_title', 'story_body', 'story_image',
  'contact_phone', 'contact_whatsapp', 'contact_email', 'contact_instagram', 'contact_facebook',
  'contact_tiktok', 'contact_zone', 'contact_hours', 'music_url', 'legal_text',
];
const APP_VERSION = '3.7';
// Colonnes restaurées depuis une sauvegarde (les colonnes inconnues sont ignorées)
const RESTORE_COLUMNS = {
  products: ['id', 'name', 'arabic_name', 'tagline', 'description', 'price_cents', 'price_label', 'threshold', 'ingredients', 'allergens', 'traces',
    'energy_kcal', 'proteins', 'carbs', 'fats', 'salt', 'image', 'gallery', 'featured', 'visible', 'position', 'updated_at',
    'price_mode', 'price_kg_cents', 'min_kg', 'tiers'],
  settings: ['key', 'value'],
  videos: ['id', 'title', 'description', 'url', 'poster', 'product_id', 'visible', 'position', 'created_at'],
  gallery: ['id', 'image', 'title', 'event_type', 'caption', 'visible', 'position', 'created_at'],
  reviews: ['id', 'name', 'event_type', 'rating', 'text', 'reply', 'source', 'status', 'event_date', 'created_at'],
  requests: ['id', 'kind', 'name', 'email', 'phone', 'event_date', 'event_type', 'delivery', 'message', 'items', 'estimate_cents', 'status', 'created_at', 'quote', 'pro_id',
    'quote_sent_at', 'quote_sent_to', 'accepted_at', 'accepted_name', 'accepted_quote'],
  invoices: ['id', 'number', 'type', 'status', 'request_ids', 'pro_id', 'parent_id', 'is_pro', 'client', 'lines', 'total_cents', 'deduct_cents',
    'issue_date', 'sale_date', 'due_date', 'object', 'quote_ref', 'notes', 'payment_link', 'sumup_checkout_id', 'reminders', 'last_reminder_at',
    'source', 'import_batch', 'created_at', 'validated_at', 'sent_at', 'sent_to'],
  payments: ['id', 'invoice_id', 'date', 'amount_cents', 'method', 'ref', 'note', 'import_batch', 'created_at'],
  expenses: ['id', 'date', 'supplier', 'category', 'label', 'amount_cents', 'method', 'note', 'import_batch', 'created_at'],
  pros: ['id', 'company', 'siret', 'activity', 'contact_name', 'email', 'phone', 'city', 'volume', 'message', 'code', 'status', 'note', 'created_at', 'last_login'],
  media: ['id', 'name', 'mime', 'size', 'data', 'created_at'],
  file_meta: ['id', 'name', 'mime', 'size', 'chunks', 'updated_at'],
  file_chunks: ['id', 'idx', 'data'],
};
const BINARY_TABLES = ['media', 'file_chunks'];
const GALLERY_FIELDS = ['image', 'title', 'event_type', 'caption', 'visible', 'position'];
const REVIEW_STATUSES = ['en attente', 'publié', 'refusé'];
const TRACK_PAGES = ['accueil', 'collection', 'p', 'histoire', 'pro', 'evenements', 'avis', 'videos', 'contact', 'devis', 'mentions'];
const BOT_UA = /bot|crawl|spider|slurp|preview|facebookexternalhit|headless|lighthouse|monitor|curl|wget|python|httpclient/i;
const REQUEST_STATUSES = ['nouveau', 'en cours', 'devis envoyé', 'confirmé', 'archivé'];

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    try {
      if (path.startsWith('/api/') || path.startsWith('/media/') || path === '/carte.pdf') {
        if (!env.DB) return json({ error: 'Base de données non reliée. Cloudflare Pages : Settings → Bindings → ajouter une base D1 nommée DB. Cloudflare Workers : vérifier database_id dans wrangler.jsonc.' }, 500);
        await ensureDb(env);
      }
      if (path.startsWith('/api/')) return await api(request, env, url, ctx);
      if (path === '/carte.pdf') return await serveCarte(request, env);
      if (path.startsWith('/media/fichier/')) return await serveFile(request, env, path.slice(15));
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
  for (const sql of ADD_COLUMNS) await db.prepare(sql).run().catch(() => {}); // déjà présente : ignoré
  await db.batch(SEED.map(({ sql, params }) => db.prepare(sql).bind(...params)));
  await db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('schema_version', ?)").bind(SCHEMA_VERSION).run();
  await migrations(db);
}

// Corrections de contenu appliquées une seule fois sur une base existante
async function migrations(db) {
  const fait = await db.prepare("SELECT value FROM settings WHERE key = 'migr_marocaine'").first();
  if (!fait) {
    // « orientale(s) » → « marocaine(s) » dans les textes du site et les fiches
    const rep = col => `${col} = REPLACE(REPLACE(REPLACE(REPLACE(${col}, 'orientales', 'marocaines'), 'orientale', 'marocaine'), 'Orientales', 'Marocaines'), 'Orientale', 'Marocaine')`;
    await db.batch([
      db.prepare(`UPDATE settings SET ${rep('value')} WHERE value LIKE '%rientale%'`),
      db.prepare(`UPDATE products SET ${['name', 'tagline', 'description', 'ingredients'].map(rep).join(', ')}`),
      db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('migr_marocaine', '1')"),
    ]);
  }
}

/* ---------------------------------------------------------------- routes */

async function api(request, env, url, ctx) {
  const { pathname: p } = url;
  const m = request.method;

  // ---- Public
  if (p === '/api/catalogue' && m === 'GET') return catalogue(request, env);
  if (p === '/api/pro/demande' && m === 'POST') return demandePro(request, env, url, ctx);
  if (p === '/api/pro/login' && m === 'POST') return loginPro(request, env);
  if (p === '/api/pro/logout' && m === 'POST') return json({ ok: true }, 200, { 'Set-Cookie': `${PRO_COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax` });
  if (p === '/api/requests' && m === 'POST') return createRequest(request, env, url, ctx);
  if (p === '/api/reviews' && m === 'POST') return createReview(request, env, url, ctx);
  if (p === '/api/track' && m === 'POST') return track(request, env);
  const dv = p.match(/^\/api\/devis\/(\d+)\/([\w-]{20,60})$/);
  if (dv) return accepterDevis(request, env, url, ctx, +dv[1], dv[2]);
  const pay = p.match(/^\/api\/payer\/(\d+)\/([\w-]{20,60})(\/retour)?$/);
  if (pay) return payerFacture(request, env, url, +pay[1], pay[2], Boolean(pay[3]));

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
      sumup: { api: Boolean(env.SUMUP_API_KEY && env.SUMUP_MERCHANT_CODE) },
      mail: etatMail(env),
      gallery: gallery.results,
      pendingReviews: pending?.n || 0,
      pendingPros: (await db.prepare("SELECT COUNT(*) AS n FROM pros WHERE status = 'en attente'").first())?.n || 0,
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
      .filter(([k]) => PUBLIC_SETTINGS.includes(k) || QUOTE_SETTINGS.includes(k))
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
  // Devis PDF : lecture d'une demande et enregistrement du devis rédigé
  if ((mt = p.match(/^\/api\/admin\/requests\/(\d+)\/quote$/))) {
    if (m === 'GET') {
      const [req, prods, sets] = await db.batch([
        db.prepare('SELECT * FROM requests WHERE id = ?').bind(mt[1]),
        db.prepare('SELECT id, name, price_mode, price_cents, price_label, threshold, price_kg_cents, min_kg, tiers FROM products'),
        db.prepare('SELECT key, value FROM settings'),
      ]);
      const r = req.results[0];
      if (!r) return json({ error: 'Demande introuvable.' }, 404);
      const pro = r.pro_id ? await db.prepare('SELECT company, siret, city, contact_name FROM pros WHERE id = ?').bind(r.pro_id).first() : null;
      return json({
        pro, mail: etatMail(env), acceptLink: await lienDevis(env, new URL(request.url).origin, r.id),
        request: { ...r, items: safeJson(r.items, []), quote: safeJson(r.quote, null), accepted_quote: safeJson(r.accepted_quote, null) },
        products: prods.results.map(x => ({ ...x, tiers: cleanTiers(x.tiers) })),
        settings: Object.fromEntries(sets.results.map(x => [x.key, x.value])),
      });
    }
    if (m === 'PUT') {
      const body = await request.text();
      if (body.length > 60000) return json({ error: 'Devis trop volumineux.' }, 413);
      try { JSON.parse(body); } catch { return json({ error: 'Devis illisible.' }, 400); }
      await db.prepare('UPDATE requests SET quote = ? WHERE id = ?').bind(body, mt[1]).run();
      return json({ ok: true });
    }
  }
  if ((mt = p.match(/^\/api\/admin\/requests\/(\d+)\/quote-email$/)) && m === 'POST') {
    try { return json(await envoyerDevis(request, env, +mt[1])); }
    catch (e) { if (e instanceof Erreur) return json({ error: e.message }, e.status); throw e; }
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

  // Professionnels : demandes d'accès et comptes
  if (p === '/api/admin/pros' && m === 'GET') {
    const r = await db.prepare("SELECT * FROM pros ORDER BY CASE status WHEN 'en attente' THEN 0 WHEN 'actif' THEN 1 ELSE 2 END, created_at DESC").all();
    return json({ pros: r.results });
  }
  if (p === '/api/admin/pros' && m === 'POST') { // ajout manuel d'un client pro existant, accès créé tout de suite
    const b = await request.json();
    const company = clean(b.company, 120);
    if (!company) return json({ error: 'Indiquez le nom de l’entreprise.' }, 400);
    const code = await nouveauCode(db);
    const r = await db.prepare(`INSERT INTO pros (company, siret, activity, contact_name, email, phone, city, code, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'actif')`)
      .bind(company, clean(b.siret, 20), clean(b.activity, 60), clean(b.contact_name, 120), clean(b.email, 160), clean(b.phone, 40), clean(b.city, 80), code).run();
    return json({ ok: true, id: r.meta.last_row_id, code });
  }
  if ((mt = p.match(/^\/api\/admin\/pros\/(\d+)$/))) {
    if (m === 'PUT') {
      const b = await request.json();
      const pro = await db.prepare('SELECT * FROM pros WHERE id = ?').bind(mt[1]).first();
      if (!pro) return json({ error: 'Professionnel introuvable.' }, 404);
      if (b.status && !PRO_STATUSES.includes(b.status)) return json({ error: 'Statut inconnu.' }, 400);
      // Activer sans code, ou demander un nouveau code : un code unique est créé (l'ancien ne fonctionne plus)
      const code = (b.status === 'actif' && !pro.code) || b.nouveau_code ? await nouveauCode(db) : pro.code;
      await db.prepare('UPDATE pros SET status = ?, code = ?, note = ? WHERE id = ?')
        .bind(b.status || pro.status, code, 'note' in b ? clean(b.note, 1000) : pro.note, mt[1]).run();
      return json({ ok: true, code });
    }
    if (m === 'DELETE') { await db.prepare('DELETE FROM pros WHERE id = ?').bind(mt[1]).run(); return json({ ok: true }); }
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
  // Fichiers : musique d'ambiance et carte PDF
  if (p === '/api/admin/files' && m === 'GET') {
    const r = await db.prepare('SELECT id, name, mime, size, chunks, updated_at FROM file_meta').all();
    return json({ files: Object.fromEntries(r.results.map(f => [f.id, f])) });
  }
  if ((mt = p.match(/^\/api\/admin\/files\/(musique|carte)$/))) {
    const id = mt[1], conf = FILES[id];
    if (m === 'POST') {
      const type = (request.headers.get('Content-Type') || '').split(';')[0].trim().toLowerCase();
      if (!conf.types.test(type)) return json({ error: `Choisissez ${conf.label}.` }, 415);
      const buf = new Uint8Array(await request.arrayBuffer());
      if (!buf.length) return json({ error: 'Fichier vide.' }, 400);
      if (buf.length > conf.max) return json({ error: `Fichier trop lourd (${Math.round(conf.max / 1e6)} Mo maximum).` }, 413);
      const name = decodeURIComponent(request.headers.get('X-Filename') || id).slice(0, 120);
      const n = Math.ceil(buf.length / CHUNK);
      await db.prepare('DELETE FROM file_chunks WHERE id = ?').bind(id).run();
      for (let i = 0; i < n; i++) {
        await db.prepare('INSERT INTO file_chunks (id, idx, data) VALUES (?, ?, ?)').bind(id, i, buf.subarray(i * CHUNK, (i + 1) * CHUNK)).run();
      }
      await db.prepare(`INSERT OR REPLACE INTO file_meta (id, name, mime, size, chunks, updated_at) VALUES (?, ?, ?, ?, ?, datetime('now'))`)
        .bind(id, name, type === 'audio/mp3' ? 'audio/mpeg' : type === 'audio/x-m4a' || type === 'audio/m4a' ? 'audio/mp4' : type, buf.length, n).run();
      const url = id === 'musique' ? `/media/fichier/musique?v=${Date.now()}` : '/carte.pdf';
      if (id === 'musique') {
        await db.prepare("INSERT INTO settings (key, value) VALUES ('music_url', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").bind(url).run();
      } else {
        await db.prepare("INSERT INTO settings (key, value) VALUES ('carte_mode', 'fichier') ON CONFLICT(key) DO UPDATE SET value = excluded.value").run();
      }
      return json({ ok: true, url, size: buf.length });
    }
    if (m === 'DELETE') {
      await db.batch([db.prepare('DELETE FROM file_chunks WHERE id = ?').bind(id), db.prepare('DELETE FROM file_meta WHERE id = ?').bind(id)]);
      if (id === 'musique') await db.prepare("UPDATE settings SET value = '' WHERE key = 'music_url' AND value LIKE '/media/fichier/musique%'").run();
      return json({ ok: true });
    }
  }

  // Sauvegarde complète (fichier JSON téléchargé) et restauration
  if (p === '/api/admin/backup' && m === 'GET') {
    const withMedia = new URL(request.url).searchParams.get('media') === '1';
    const q = sql => db.prepare(sql);
    const res = await db.batch([q('SELECT * FROM products ORDER BY position'), q('SELECT * FROM settings'), q('SELECT * FROM videos'),
      q('SELECT * FROM gallery'), q('SELECT * FROM reviews'), q('SELECT * FROM requests'), q('SELECT * FROM pros'),
      q('SELECT * FROM invoices'), q('SELECT * FROM payments'), q('SELECT * FROM expenses'),
      withMedia ? q('SELECT id, name, mime, size, data, created_at FROM media') : q('SELECT id FROM media WHERE 0'),
      withMedia ? q('SELECT * FROM file_meta') : q('SELECT id FROM file_meta WHERE 0'),
      withMedia ? q('SELECT id, idx, data FROM file_chunks ORDER BY id, idx') : q('SELECT id FROM file_chunks WHERE 0')]);
    const [products, settings, videos, gallery, reviews, requests, pros, invoices, payments, expenses, media, file_meta, file_chunks] = res.map(r => r.results);
    const b64 = buf => { const u = new Uint8Array(buf); let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000)); return btoa(s); };
    const body = {
      format: 'saveurs-des-rois-backup', version: 1, app: APP_VERSION, created_at: new Date().toISOString(),
      tables: { products, settings: settings.filter(x => x.key !== 'schema_version'), videos, gallery, reviews, requests, pros, invoices, payments, expenses,
        media: media.map(x => ({ ...x, data: b64(x.data) })), file_meta, file_chunks: file_chunks.map(x => ({ ...x, data: b64(x.data) })) },
    };
    const day = parisDay(Date.now());
    return new Response(JSON.stringify(body), { headers: {
      'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store',
      'Content-Disposition': `attachment; filename="sauvegarde-saveurs-des-rois-${day}${withMedia ? '-avec-photos' : ''}.json"`,
    } });
  }
  if (p === '/api/admin/restore' && m === 'POST') {
    let b;
    try { b = await request.json(); } catch { return json({ error: 'Fichier illisible : choisissez une sauvegarde .json du site.' }, 400); }
    if (b?.format !== 'saveurs-des-rois-backup' || !b.tables) return json({ error: 'Ce fichier n’est pas une sauvegarde Saveurs des Rois.' }, 400);
    const only = Array.isArray(b.only) && b.only.length ? b.only : Object.keys(RESTORE_COLUMNS);
    const counts = {};
    for (const [table, cols] of Object.entries(RESTORE_COLUMNS)) {
      if (!only.includes(table)) continue;
      const rows = Array.isArray(b.tables[table]) ? b.tables[table] : [];
      const stmts = [];
      for (const row of rows) {
        if (!row || typeof row !== 'object') continue;
        const vals = cols.map(c => {
          let v = row[c] ?? null;
          if (BINARY_TABLES.includes(table) && c === 'data') v = v ? Uint8Array.from(atob(v), ch => ch.charCodeAt(0)) : null;
          else if (v !== null && typeof v === 'object') v = JSON.stringify(v);
          return v;
        });
        if (table === 'settings' && row.key === 'schema_version') continue;
        if (BINARY_TABLES.includes(table) && !vals[cols.indexOf('data')]) continue;
        stmts.push(db.prepare(`INSERT OR REPLACE INTO ${table} (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`).bind(...vals));
      }
      const lot = table === 'file_chunks' ? 1 : table === 'media' ? 5 : 50; // gros fichiers : un par un
      for (let i = 0; i < stmts.length; i += lot) await db.batch(stmts.slice(i, i + lot));
      counts[table] = stmts.length;
    }
    return json({ ok: true, counts });
  }

  if (p === '/api/admin/stats' && m === 'GET') {
    const days = Math.min(365, Math.max(1, toInt(new URL(request.url).searchParams.get('days')) || 30));
    const since = parisDay(Date.now() - (days - 1) * 86400_000);
    // Après une remise à zéro, les demandes antérieures ne sont plus comptées
    const raz = (await db.prepare("SELECT value FROM settings WHERE key = 'stats_depuis'").first())?.value || '';
    const depuisReq = raz > since ? raz : since;
    const [rows, reqs] = await db.batch([
      db.prepare('SELECT day, kind, key, n FROM stats WHERE day >= ? ORDER BY day').bind(since),
      db.prepare("SELECT substr(created_at, 1, 10) AS day, kind, (pro_id IS NOT NULL) AS pro, COUNT(*) AS n FROM requests WHERE created_at >= ? GROUP BY day, kind, pro").bind(depuisReq),
    ]);
    return json({ since, days, raz, rows: rows.results, requests: reqs.results });
  }
  if (p === '/api/admin/stats' && m === 'DELETE') { // remise à zéro des compteurs (les demandes elles-mêmes sont conservées)
    await db.batch([
      db.prepare('DELETE FROM stats'),
      db.prepare("INSERT INTO settings (key, value) VALUES ('stats_depuis', datetime('now')) ON CONFLICT(key) DO UPDATE SET value = excluded.value"),
    ]);
    return json({ ok: true });
  }

  const fact = await facturationApi(request, env, p, m);
  if (fact) return fact;

  return json({ error: 'Route admin inconnue.' }, 404);
}

/* ---------------------------------------------------------------- public */

async function catalogue(request, env) {
  const db = env.DB;
  // Les prix au kilo ne sont envoyés qu'aux professionnels connectés (et à l'administratrice)
  const pro = await proSession(request, env);
  const voitPro = Boolean(pro) || await isAuthed(request, env);
  const keys = PUBLIC_SETTINGS.map(() => '?').join(',');
  const [products, videos, settings, gallery, reviews] = await db.batch([
    db.prepare('SELECT * FROM products WHERE visible = 1 ORDER BY position, name'),
    db.prepare('SELECT id, title, description, url, poster, product_id FROM videos WHERE visible = 1 ORDER BY position, id'),
    db.prepare(`SELECT key, value FROM settings WHERE key IN (${keys})`).bind(...PUBLIC_SETTINGS),
    db.prepare('SELECT id, image, title, event_type, caption FROM gallery WHERE visible = 1 ORDER BY position, id DESC'),
    db.prepare("SELECT id, name, event_type, rating, text, reply, source, created_at FROM reviews WHERE status = 'publié' ORDER BY created_at DESC LIMIT 100"),
  ]);
  return json({
    pro: pro ? { company: pro.company, contact_name: pro.contact_name } : null,
    gallery: gallery.results,
    reviews: reviews.results,
    products: products.results.map(parseProduct).map(x => {
      if (voitPro) return x;
      const vendKg = ['kg', 'both'].includes(x.price_mode) && x.price_kg_cents > 0;
      const { price_kg_cents, min_kg, ...reste } = x;
      return { ...reste, pro_dispo: vendKg }; // le public sait seulement qu'un tarif pro existe
    }),
    videos: videos.results,
    settings: Object.fromEntries(settings.results.map(r => [r.key, r.value])),
  }, 200, { 'Cache-Control': 'private, no-store', 'Vary': 'Cookie' });
}

async function createRequest(request, env, url, ctx) {
  let body;
  try { body = await request.json(); } catch { return json({ error: 'Demande illisible.' }, 400); }
  if (body.website) return json({ ok: true }); // pot de miel anti-robots
  const pro = await proSession(request, env);
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
    const rows = await env.DB.prepare(`SELECT id, name, price_cents, price_label, price_mode, price_kg_cents, tiers FROM products WHERE id IN (${ids.map(() => '?').join(',')})`).bind(...ids).all();
    const byId = Object.fromEntries(rows.results.map(r => [r.id, r]));
    for (const it of items) {
      const prod = byId[it.id];
      if (!prod) continue;
      const mode = prod.price_mode || 'piece';
      if (it.unit === 'kg') {
        // Achat au poids : réservé aux professionnels connectés, jamais de dégressivité
        if (!pro || !['kg', 'both'].includes(mode) || !prod.price_kg_cents) continue;
        const qty = Math.round(Math.max(0, Math.min(500, toNum(it.qty) || 0)) * 10) / 10;
        if (!qty) continue;
        checked.push({ id: prod.id, name: prod.name, qty, unit: 'kg', unit_cents: prod.price_kg_cents, label: 'le kg' });
        estimate += Math.round(qty * prod.price_kg_cents);
      } else {
        if (mode === 'kg') continue;
        const qty = Math.max(0, Math.min(5000, toInt(it.qty) || 0));
        if (!qty) continue;
        const surDevis = mode === 'devis';
        const unit = surDevis ? 0 : unitPrice(prod, qty);
        checked.push({ id: prod.id, name: prod.name, qty, unit: 'piece', unit_cents: unit, base_cents: surDevis ? 0 : prod.price_cents,
          label: surDevis ? 'sur devis' : prod.price_label + (unit < prod.price_cents ? ' (dégressif)' : '') });
        estimate += qty * unit;
      }
    }
  }

  const record = {
    kind: body.kind === 'contact' ? 'contact' : 'devis', name, email, phone,
    event_date: clean(body.event_date, 20), event_type: clean(body.event_type, 60), delivery: clean(body.delivery, 60),
    message: clean(body.message, 3000), items: checked, estimate_cents: estimate,
    pro_company: pro?.company || '',
  };
  await env.DB.prepare(`INSERT INTO requests (kind, name, email, phone, event_date, event_type, delivery, message, items, estimate_cents, pro_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(
    record.kind, name, email, phone, record.event_date, record.event_type, record.delivery,
    record.message, JSON.stringify(checked), estimate, pro?.id ?? null,
  ).run();

  // Alerte envoyée en arrière-plan : le client n'attend pas, et un échec d'envoi ne bloque jamais sa demande
  const alert = notify(env, record, url.origin).catch(err => console.error('Alerte non envoyée :', err.message));
  if (ctx?.waitUntil) ctx.waitUntil(alert);
  return json({ ok: true, estimate_cents: estimate });
}

// Fichier découpé (musique, carte) : réassemblé, avec prise en charge des requêtes partielles
// (Range), indispensables à la lecture audio sur iPhone / Safari.
async function serveFile(request, env, id, opts = {}) {
  if (!FILES[id]) return new Response('Introuvable', { status: 404 });
  const meta = await env.DB.prepare('SELECT * FROM file_meta WHERE id = ?').bind(id).first();
  if (!meta) return opts.fallback ? opts.fallback() : new Response('Introuvable', { status: 404 });
  const rows = (await env.DB.prepare('SELECT data FROM file_chunks WHERE id = ? ORDER BY idx').bind(id).all()).results;
  const full = new Uint8Array(meta.size);
  let off = 0;
  for (const r of rows) { const d = new Uint8Array(r.data); full.set(d, off); off += d.length; }
  const headers = {
    'Content-Type': meta.mime, 'Accept-Ranges': 'bytes', 'Cache-Control': 'public, max-age=3600',
    ...(opts.filename ? { 'Content-Disposition': `inline; filename="${opts.filename}"` } : {}),
  };
  const range = (request.headers.get('Range') || '').match(/^bytes=(\d*)-(\d*)$/);
  if (range && (range[1] || range[2])) {
    let start = range[1] ? +range[1] : meta.size - +range[2];
    let end = range[1] && range[2] ? Math.min(+range[2], meta.size - 1) : meta.size - 1;
    if (start < 0) start = 0;
    if (start > end || start >= meta.size) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${meta.size}` } });
    return new Response(request.method === 'HEAD' ? null : full.slice(start, end + 1), {
      status: 206, headers: { ...headers, 'Content-Range': `bytes ${start}-${end}/${meta.size}`, 'Content-Length': String(end - start + 1) },
    });
  }
  return new Response(request.method === 'HEAD' ? null : full, { headers: { ...headers, 'Content-Length': String(meta.size) } });
}

// Carte PDF : le fichier importé dans l'admin, sinon la carte d'origine du site
function serveCarte(request, env) {
  return serveFile(request, env, 'carte', {
    filename: 'carte-saveurs-des-rois.pdf',
    fallback: () => env.ASSETS.fetch(new Request(new URL('/assets/docs/carte-saveurs-des-rois.pdf', request.url), request)),
  });
}

async function serveMedia(request, env, id) {
  if (!/^\w{1,32}$/.test(id)) return new Response('Introuvable', { status: 404 });
  const row = await env.DB.prepare('SELECT mime, data FROM media WHERE id = ?').bind(id).first();
  if (!row) return new Response('Introuvable', { status: 404 });
  return new Response(new Uint8Array(row.data), {
    headers: { 'Content-Type': row.mime, 'Cache-Control': 'public, max-age=31536000, immutable' },
  });
}

/* ---------------------------------------------------------------- espace professionnel */

const PRO_COOKIE = 'sdr_pro';
const PRO_STATUSES = ['en attente', 'actif', 'suspendu', 'refusé'];
const PRO_JOURS = 365;

// Code d'accès lisible : 8 caractères sans 0/O ni 1/I/L, affiché « ABCD-EFGH »
async function nouveauCode(db) {
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  for (;;) {
    const r = crypto.getRandomValues(new Uint8Array(8));
    const code = [...r].map(x => alphabet[x % alphabet.length]).join('');
    if (!(await db.prepare('SELECT id FROM pros WHERE code = ?').bind(code).first())) return code;
  }
}
const normCode = c => String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 16);

async function demandePro(request, env, url, ctx) {
  let b;
  try { b = await request.json(); } catch { return json({ error: 'Demande illisible.' }, 400); }
  if (b.website) return json({ ok: true });
  const d = {
    company: clean(b.company, 120), siret: clean(b.siret, 20).replace(/\s/g, ''), activity: clean(b.activity, 60),
    contact_name: clean(b.contact_name, 120), email: clean(b.email, 160), phone: clean(b.phone, 40),
    city: clean(b.city, 80), volume: clean(b.volume, 200), message: clean(b.message, 2000),
  };
  if (!d.company) return json({ error: 'Indiquez le nom de votre entreprise.' }, 400);
  if (!d.contact_name) return json({ error: 'Indiquez votre nom.' }, 400);
  if (!d.email && !d.phone) return json({ error: 'Indiquez un e-mail ou un téléphone pour que nous puissions vous répondre.' }, 400);
  if (d.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email)) return json({ error: 'L’adresse e-mail semble incorrecte.' }, 400);
  // SIRET facultatif et jamais bloquant : enregistré tel quel, vérifiable ensuite depuis l'admin
  await env.DB.prepare(`INSERT INTO pros (company, siret, activity, contact_name, email, phone, city, volume, message) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(d.company, d.siret, d.activity, d.contact_name, d.email, d.phone, d.city, d.volume, d.message).run();
  const alert = notify(env, { kind: 'acces_pro', name: d.contact_name, pro_company: d.company, ...d, items: [], estimate_cents: 0 }, url.origin)
    .catch(err => console.error('Alerte pro non envoyée :', err.message));
  if (ctx?.waitUntil) ctx.waitUntil(alert);
  return json({ ok: true });
}

async function loginPro(request, env) {
  const { code } = await request.json().catch(() => ({}));
  const c = normCode(code);
  const pro = c.length >= 6 ? await env.DB.prepare("SELECT * FROM pros WHERE code = ? AND status = 'actif'").bind(c).first() : null;
  if (!pro) {
    await new Promise(r => setTimeout(r, 900)); // ralentit les essais en série
    return json({ error: 'Code inconnu ou désactivé. Vérifiez-le, ou contactez-nous.' }, 401);
  }
  await env.DB.prepare("UPDATE pros SET last_login = datetime('now') WHERE id = ?").bind(pro.id).run();
  const exp = Date.now() + PRO_JOURS * 86400_000;
  const token = `${pro.id}.${exp}.${await hmac(`pro:${pro.id}.${exp}.${pro.code}`, await sessionKey(env))}`;
  return json({ ok: true, company: pro.company }, 200, {
    'Set-Cookie': `${PRO_COOKIE}=${token}; Path=/; Max-Age=${PRO_JOURS * 86400}; HttpOnly; Secure; SameSite=Lax`,
  });
}

// Session pro valide uniquement si le compte est toujours actif et que son code n'a pas changé
async function proSession(request, env) {
  if (!env.ADMIN_PASSWORD) return null;
  const m = (request.headers.get('Cookie') || '').match(new RegExp(`${PRO_COOKIE}=([^;]+)`));
  if (!m) return null;
  const [id, exp, sig] = m[1].split('.');
  if (!id || !exp || !sig || Number(exp) < Date.now()) return null;
  const pro = await env.DB.prepare("SELECT id, company, contact_name, code FROM pros WHERE id = ? AND status = 'actif'").bind(id).first();
  if (!pro) return null;
  return (await safeEqual(sig, await hmac(`pro:${pro.id}.${exp}.${pro.code}`, await sessionKey(env)))) ? pro : null;
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
  const label = r.kind === 'devis_accepte' ? 'Devis accepté en ligne'
    : r.kind === 'paiement' ? 'Paiement en ligne reçu'
    : r.kind === 'acces_pro' ? 'Nouvelle demande d’accès professionnel'
    : r.kind === 'avis' ? 'Nouvel avis client à valider'
    : r.kind === 'contact' ? (r.pro_company ? 'Nouveau message PRO' : 'Nouveau message')
    : r.pro_company ? 'Nouvelle demande de devis PRO' : 'Nouvelle demande de devis';
  const fmt = c => (c / 100).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' });
  const qtyTxt = i => i.unit === 'kg' ? `${String(i.qty).replace('.', ',')} kg de` : `${i.qty} ×`;
  const lines = r.items.map(i => `${qtyTxt(i)} ${i.name} (${i.unit_cents ? fmt(i.unit_cents) + ' ' : ''}${i.label || ''})`);
  const details = [
    r.rating && `Note : ${'★'.repeat(r.rating)}${'☆'.repeat(5 - r.rating)}`,
    r.pro_company && `Entreprise : ${r.pro_company}`, r.siret && `SIRET : ${r.siret}`, r.activity && `Activité : ${r.activity}`, r.city && `Ville : ${r.city}`, r.volume && `Volumes : ${r.volume}`,
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
        ${lines.length ? `<table style="width:100%;border-collapse:collapse;margin:0 0 10px">${r.items.map(i => `<tr><td style="padding:6px 0;border-bottom:1px solid #e8dcc2">${e(qtyTxt(i))} ${e(i.name)}</td><td style="padding:6px 0;border-bottom:1px solid #e8dcc2;text-align:right">${i.unit_cents ? fmt(Math.round(i.qty * i.unit_cents)) : 'sur devis'}</td></tr>`).join('')}</table>
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

/* ---------------------------------------------------------------- facturation */

// Factures : brouillon modifiable, puis « validée » (numéro définitif, plus jamais modifiée ; une erreur se corrige par un avoir).
// Numérotation continue par année : FA-AAAA-0001 (factures, acomptes, soldes) et AV-AAAA-0001 (avoirs).
const INVOICE_TYPES = ['facture', 'acompte', 'solde', 'avoir'];
const UNITES = ['pc', 'kg', ''];

function lignesPropres(l) {
  if (!Array.isArray(l)) return [];
  return l.slice(0, 80).map(x => ({
    label: clean(x?.label, 200), detail: clean(x?.detail, 300),
    qty: Math.round((toNum(x?.qty) ?? 0) * 1000) / 1000,
    unit: UNITES.includes(x?.unit) ? x.unit : '',
    prix: toInt(x?.prix) ?? 0,
  })).filter(x => x.label || x.qty || x.prix);
}
function clientPropre(c) {
  const o = {};
  for (const k of ['nom', 'societe', 'siret', 'adresse', 'tel', 'email']) o[k] = clean(c?.[k], k === 'adresse' ? 300 : 160);
  return o;
}
const totalLignes = l => l.reduce((t, x) => t + Math.round(x.qty * x.prix), 0);
const isoDay = v => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? String(v) : null);
function addDays(iso, n) { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
const frDay = iso => (iso ? new Date(iso + 'T12:00:00Z').toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }) : '');
const eur = c => ((c || 0) / 100).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' });
const sumupApi = env => Boolean(env.SUMUP_API_KEY && env.SUMUP_MERCHANT_CODE);
async function lireReglages(db) {
  return Object.fromEntries((await db.prepare('SELECT key, value FROM settings').all()).results.map(r => [r.key, r.value]));
}
function parseInvoice(i) {
  return { ...i, client: safeJson(i.client, {}), lines: safeJson(i.lines, []), request_ids: safeJson(i.request_ids, []) };
}

// Lignes de facture reprises du devis enregistré (sinon de la demande du client)
function lignesDevis(req) {
  const numero = `DEV-${(req.created_at || '').slice(0, 4) || new Date().getFullYear()}-${String(req.id).padStart(4, '0')}`;
  const q = safeJson(req.quote, null);
  if (q?.lignes?.length) {
    const lignes = q.lignes.map(l => ({ label: l.label, detail: l.detail, qty: l.qty, unit: l.kg ? 'kg' : l.s === 'frais' ? '' : 'pc', prix: l.prix }));
    const part = q.lignes.filter(l => l.s === 'part').reduce((t, l) => t + Math.round(l.qty * l.prix), 0);
    const remise = Math.round(part * (q.remise || 0) / 100);
    if (remise) lignes.push({ label: `Remise ${String(q.remise).replace('.', ',')} %`, detail: '', qty: 1, unit: '', prix: -remise });
    return { lignes: lignesPropres(lignes), numero: q.numero || numero, acompte_pct: toNum(q.acompte) || 0, client: q.client || null };
  }
  const items = safeJson(req.items, []);
  return {
    lignes: lignesPropres(items.map(i => ({ label: i.name, detail: '', qty: i.qty, unit: i.unit === 'kg' ? 'kg' : 'pc', prix: i.unit_cents }))),
    numero, acompte_pct: 0, client: null,
  };
}

async function creerFacture(db, b) {
  const S = await lireReglages(db);
  const today = parisDay(Date.now());
  const inv = { type: 'facture', request_ids: [], pro_id: null, parent_id: null, is_pro: 0, client: {}, lines: [], deduct_cents: 0,
    object: '', quote_ref: '', notes: '', sale_date: today };
  let paiement = null;

  if (b.mode === 'demande' || b.mode === 'groupe') {
    const ids = (b.mode === 'demande' ? [b.request_id] : b.request_ids || []).map(toInt).filter(Boolean).slice(0, 60);
    if (!ids.length) throw new Erreur('Choisissez au moins une commande.');
    const reqs = (await db.prepare(`SELECT * FROM requests WHERE id IN (${ids.map(() => '?').join(',')}) ORDER BY created_at`).bind(...ids).all()).results;
    if (!reqs.length) throw new Erreur('Demande introuvable.');
    const first = reqs[0];
    if (reqs.some(r => (r.pro_id || null) !== (first.pro_id || null))) throw new Erreur('Les commandes regroupées doivent appartenir au même client.');
    const pro = first.pro_id ? await db.prepare('SELECT * FROM pros WHERE id = ?').bind(first.pro_id).first() : null;
    const d0 = lignesDevis(first);
    inv.pro_id = first.pro_id || null;
    inv.is_pro = pro ? 1 : 0;
    inv.request_ids = reqs.map(r => r.id);
    inv.client = clientPropre({
      nom: d0.client?.nom || first.name, societe: d0.client?.societe || pro?.company || '', siret: d0.client?.siret || pro?.siret || '',
      adresse: d0.client?.adresse || pro?.city || '', tel: d0.client?.tel || first.phone, email: d0.client?.email || first.email,
    });
    if (isoDay(first.event_date)) inv.sale_date = first.event_date;

    if (b.mode === 'groupe') {
      for (const r of reqs) {
        const d = lignesDevis(r);
        const quand = isoDay(r.event_date) ? frDay(r.event_date) : frDay(r.created_at.slice(0, 10));
        inv.lines.push(...d.lignes.map(l => ({ ...l, detail: [`Commande du ${quand} (${d.numero})`, l.detail].filter(Boolean).join(' · ') })));
      }
      inv.object = clean(b.label, 120) || 'Facture récapitulative de vos commandes';
      inv.quote_ref = reqs.map(r => lignesDevis(r).numero).join(', ').slice(0, 300);
      inv.sale_date = reqs.map(r => isoDay(r.event_date) || r.created_at.slice(0, 10)).sort().at(-1);
    } else {
      const type = ['acompte', 'facture', 'solde'].includes(b.type) ? b.type : 'facture';
      const total = totalLignes(d0.lignes);
      inv.type = type;
      inv.quote_ref = d0.numero;
      inv.object = [first.event_type, isoDay(first.event_date) && `le ${frDay(first.event_date)}`, first.delivery].filter(Boolean).join(' · ');
      const acompte = toInt(b.deposit_cents) || 0;
      if (type === 'acompte') {
        if (!(acompte > 0)) throw new Erreur('Indiquez le montant de l’acompte.');
        if (acompte > total) throw new Erreur('L’acompte dépasse le montant du devis.');
        inv.lines = [{ label: `Acompte sur le devis ${d0.numero}`, detail: `${Math.round(acompte / total * 100)} % de ${eur(total)}${inv.object ? ' · ' + inv.object : ''}`, qty: 1, unit: '', prix: acompte }];
        inv.sale_date = today; // l'acompte est facturé à sa réception
      } else {
        inv.lines = d0.lignes;
        if (type === 'solde') {
          const ac = (await db.prepare(`SELECT id, number, total_cents FROM invoices WHERE type = 'acompte' AND status = 'validée'
            AND EXISTS (SELECT 1 FROM json_each(invoices.request_ids) WHERE value = ?) ORDER BY id`).bind(first.id).all()).results;
          if (!ac.length) throw new Erreur('Aucune facture d’acompte validée pour ce devis : créez plutôt une facture complète.');
          inv.deduct_cents = ac.reduce((t, a) => t + a.total_cents, 0);
          inv.parent_id = ac.at(-1).id;
        }
      }
      // Acompte reçu (facture d'acompte) ou encaissé sans facture d'acompte (facture complète, acompte déduit du reste à payer)
      if (b.paid && acompte > 0 && type !== 'solde') {
        paiement = { date: isoDay(b.paid.date) || today, amount_cents: acompte, method: clean(b.paid.method, 40) || 'Autre', note: type === 'facture' ? 'Acompte reçu à la commande' : '' };
      }
      await db.prepare("UPDATE requests SET status = 'confirmé' WHERE id = ? AND status NOT IN ('confirmé', 'archivé')").bind(first.id).run();
    }
  } else if (b.mode === 'avoir') {
    const parent = await db.prepare("SELECT * FROM invoices WHERE id = ? AND status = 'validée'").bind(toInt(b.parent_id)).first();
    if (!parent || parent.type === 'avoir') throw new Erreur('Choisissez une facture validée.');
    const P = parseInvoice(parent);
    Object.assign(inv, {
      type: 'avoir', parent_id: P.id, pro_id: P.pro_id, is_pro: P.is_pro, client: P.client, request_ids: P.request_ids, quote_ref: P.quote_ref,
      object: `Avoir sur la facture ${P.number}`, sale_date: P.sale_date || today,
      lines: [{ label: `Annulation de la facture ${P.number} du ${frDay(P.issue_date)}`, detail: 'À ajuster en cas d’avoir partiel', qty: 1, unit: '', prix: P.total_cents - P.deduct_cents }],
    });
  } else {
    inv.is_pro = b.is_pro ? 1 : 0;
    inv.pro_id = toInt(b.pro_id);
    if (inv.pro_id) {
      const pro = await db.prepare('SELECT * FROM pros WHERE id = ?').bind(inv.pro_id).first();
      if (pro) { inv.is_pro = 1; inv.client = clientPropre({ nom: pro.contact_name, societe: pro.company, siret: pro.siret, adresse: pro.city, tel: pro.phone, email: pro.email }); }
    }
    if (b.client) inv.client = clientPropre(b.client);
    inv.lines = lignesPropres(b.lines);
    if (!inv.lines.length) inv.lines = [{ label: '', detail: '', qty: 1, unit: 'pc', prix: 0 }];
  }

  const jours = toInt(S.invoice_due_days_pro) ?? 30;
  const due = inv.is_pro && inv.type !== 'avoir' ? addDays(today, jours) : today;
  const total = (inv.type === 'avoir' ? -1 : 1) * Math.abs(totalLignes(inv.lines));
  const r = await db.prepare(`INSERT INTO invoices (type, status, request_ids, pro_id, parent_id, is_pro, client, lines, total_cents, deduct_cents,
      issue_date, sale_date, due_date, object, quote_ref, notes) VALUES (?, 'brouillon', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(inv.type, JSON.stringify(inv.request_ids), inv.pro_id, inv.parent_id, inv.is_pro, JSON.stringify(inv.client), JSON.stringify(inv.lines),
      total, inv.deduct_cents, today, inv.sale_date, due, inv.object, inv.quote_ref, inv.notes).run();
  const id = r.meta.last_row_id;
  if (paiement) {
    await db.prepare('INSERT INTO payments (invoice_id, date, amount_cents, method, note) VALUES (?, ?, ?, ?, ?)')
      .bind(id, paiement.date, paiement.amount_cents, paiement.method, paiement.note).run();
  }
  return id;
}

class Erreur extends Error { constructor(msg, status = 400) { super(msg); this.status = status; } }

async function validerFacture(db, id) {
  const inv = await db.prepare('SELECT * FROM invoices WHERE id = ?').bind(id).first();
  if (!inv) throw new Erreur('Facture introuvable.', 404);
  if (inv.status !== 'brouillon') throw new Erreur('Cette facture est déjà validée.');
  const I = parseInvoice(inv);
  if (!I.lines.length || !I.total_cents) throw new Erreur('La facture est vide : ajoutez au moins une ligne avec un montant.');
  if (I.lines.some(l => !l.label)) throw new Erreur('Chaque ligne doit avoir une désignation.');
  if (!I.client.nom && !I.client.societe) throw new Erreur('Indiquez le nom du client.');
  if (I.is_pro && !I.client.adresse) throw new Erreur('Pour un client professionnel, l’adresse de facturation est obligatoire.');
  if (!isoDay(I.issue_date)) throw new Erreur('Date de facture invalide.');
  const prefix = I.type === 'avoir' ? 'AV' : 'FA';
  const annee = I.issue_date.slice(0, 4);
  const S = await lireReglages(db);
  for (let essai = 0; essai < 4; essai++) {
    const rows = (await db.prepare('SELECT number, issue_date, source FROM invoices WHERE number LIKE ?').bind(`${prefix}-${annee}-%`).all()).results;
    let max = 0, derniere = '';
    for (const r of rows) {
      const n = parseInt(r.number.slice(prefix.length + 6), 10);
      if (Number.isFinite(n)) max = Math.max(max, n);
      if (r.source !== 'import' && r.issue_date > derniere) derniere = r.issue_date;
    }
    if (derniere && I.issue_date < derniere) {
      throw new Erreur(`La date de la facture ne peut pas être antérieure à celle de la dernière facture émise (${frDay(derniere)}) : la numérotation doit suivre l’ordre chronologique.`);
    }
    // Numéro de départ choisi dans les réglages (factures déjà émises ailleurs cette année)
    const dep = String(S.invoice_next || '').trim().match(/^(?:FA-)?(\d{4})-(\d{1,6})$/);
    if (prefix === 'FA' && dep && dep[1] === annee) max = Math.max(max, parseInt(dep[2], 10) - 1);
    const number = `${prefix}-${annee}-${String(max + 1).padStart(4, '0')}`;
    try {
      const r = await db.prepare("UPDATE invoices SET number = ?, status = 'validée', validated_at = datetime('now') WHERE id = ? AND status = 'brouillon'").bind(number, id).run();
      if (!r.meta.changes) throw new Erreur('Cette facture est déjà validée.');
      return number;
    } catch (e) {
      if (e instanceof Erreur || !/UNIQUE/i.test(e.message)) throw e; // numéro pris entre-temps : on recommence
    }
  }
  throw new Erreur('Numérotation momentanément impossible, réessayez.', 503);
}

// Statut lisible : payée, partiellement payée, en retard, à payer, avoir…
function statutFacture(i, today) {
  if (i.status === 'brouillon') return 'brouillon';
  const du = i.total_cents - i.deduct_cents;
  if (i.type === 'avoir') return i.paid_cents && i.paid_cents <= du ? 'remboursé' : 'avoir';
  if (i.paid_cents >= du) return 'payée';
  if (i.due_date && i.due_date < today) return 'en retard';
  return i.paid_cents > 0 ? 'partiel' : 'à payer';
}

async function listeFactures(db) {
  const today = parisDay(Date.now());
  const [inv, pay, exp] = await db.batch([
    db.prepare(`SELECT i.*, COALESCE((SELECT SUM(amount_cents) FROM payments p WHERE p.invoice_id = i.id), 0) AS paid_cents
      FROM invoices i ORDER BY CASE WHEN i.status = 'brouillon' THEN 0 ELSE 1 END, i.issue_date DESC, i.number DESC, i.id DESC`),
    db.prepare('SELECT * FROM payments ORDER BY date DESC, id DESC'),
    db.prepare('SELECT * FROM expenses ORDER BY date DESC, id DESC'),
  ]);
  return {
    today,
    invoices: inv.results.map(i => ({ ...parseInvoice(i), state: statutFacture(i, today) })),
    payments: pay.results, expenses: exp.results,
  };
}

async function lienPaiement(env, origin, id) {
  return `${origin}/api/payer/${id}/${await hmac(`pay:${id}`, await sessionKey(env))}`;
}

async function verifierSumup(env, db, inv) {
  if (!inv.sumup_checkout_id || !sumupApi(env)) return { status: 'AUCUN' };
  const r = await fetch(`https://api.sumup.com/v0.1/checkouts/${encodeURIComponent(inv.sumup_checkout_id)}`, { headers: { Authorization: `Bearer ${env.SUMUP_API_KEY}` } })
    .catch(err => ({ ok: false, status: 0, json: async () => ({ message: `SumUp injoignable (${err.message})` }) }));
  const c = await r.json().catch(() => ({}));
  if (!r.ok) return { status: 'ERREUR', error: c.message || c.error_message || `SumUp : erreur ${r.status}` };
  if (c.status === 'PAID') {
    const deja = await db.prepare('SELECT id FROM payments WHERE ref = ?').bind(inv.sumup_checkout_id).first();
    if (!deja) {
      const montant = Math.round((Number(c.amount) || 0) * 100);
      await db.prepare("INSERT INTO payments (invoice_id, date, amount_cents, method, ref, note) VALUES (?, ?, ?, 'SumUp (en ligne)', ?, 'Paiement en ligne par carte')")
        .bind(inv.id, parisDay(Date.now()), montant, inv.sumup_checkout_id).run();
      return { status: 'PAID', nouveau: true, amount_cents: montant };
    }
    return { status: 'PAID', nouveau: false };
  }
  return { status: c.status || 'INCONNU' };
}

async function facturationApi(request, env, p, m) {
  const db = env.DB;
  let mt;
  try {
    if (p === '/api/admin/invoices' && m === 'GET') return json(await listeFactures(db));
    if (p === '/api/admin/invoices' && m === 'POST') {
      const id = await creerFacture(db, await request.json());
      return json({ ok: true, id });
    }
    if ((mt = p.match(/^\/api\/admin\/invoices\/(\d+)$/))) {
      const id = +mt[1];
      const row = await db.prepare(`SELECT i.*, COALESCE((SELECT SUM(amount_cents) FROM payments p WHERE p.invoice_id = i.id), 0) AS paid_cents FROM invoices i WHERE id = ?`).bind(id).first();
      if (!row) return json({ error: 'Facture introuvable.' }, 404);
      if (m === 'GET') {
        const [pays, liees, S] = await Promise.all([
          db.prepare('SELECT * FROM payments WHERE invoice_id = ? ORDER BY date, id').bind(id).all(),
          db.prepare("SELECT id, number, type, status, total_cents, deduct_cents, issue_date FROM invoices WHERE (id = ? OR parent_id = ?) AND id != ?").bind(row.parent_id || 0, id, id).all(),
          lireReglages(db),
        ]);
        return json({
          invoice: { ...parseInvoice(row), state: statutFacture(row, parisDay(Date.now())) }, payments: pays.results, related: liees.results, settings: S,
          paylink: row.status === 'validée' && row.type !== 'avoir' ? await lienPaiement(env, new URL(request.url).origin, id) : '',
          sumup: { api: sumupApi(env), link: S.sumup_link || '' }, mail: etatMail(env),
        });
      }
      if (m === 'PUT') {
        const b = await request.json();
        if (row.status !== 'brouillon') {
          // Facture validée : seuls le lien de paiement et la relance peuvent changer (pas le contenu)
          if ('payment_link' in b) await db.prepare('UPDATE invoices SET payment_link = ? WHERE id = ?').bind(clean(b.payment_link, 400), id).run();
          if (b.relance) await db.prepare("UPDATE invoices SET reminders = COALESCE(reminders, 0) + 1, last_reminder_at = datetime('now') WHERE id = ?").bind(id).run();
          return json({ ok: true });
        }
        const lines = lignesPropres(b.lines ?? safeJson(row.lines, []));
        const total = (row.type === 'avoir' ? -1 : 1) * Math.abs(totalLignes(lines));
        const v = {
          client: JSON.stringify(clientPropre(b.client ?? safeJson(row.client, {}))), lines: JSON.stringify(lines), total_cents: total,
          issue_date: isoDay(b.issue_date) || row.issue_date, sale_date: isoDay(b.sale_date) || row.sale_date, due_date: isoDay(b.due_date) || row.due_date,
          object: 'object' in b ? clean(b.object, 300) : row.object, notes: 'notes' in b ? clean(b.notes, 2000) : row.notes,
          is_pro: 'is_pro' in b ? (b.is_pro ? 1 : 0) : row.is_pro, payment_link: 'payment_link' in b ? clean(b.payment_link, 400) : row.payment_link,
          quote_ref: 'quote_ref' in b ? clean(b.quote_ref, 300) : row.quote_ref,
        };
        if (row.type !== 'avoir' && total - row.deduct_cents < 0) return json({ error: 'Le total ne peut pas être inférieur à l’acompte déjà facturé.' }, 400);
        await db.prepare(`UPDATE invoices SET ${Object.keys(v).map(k => `${k} = ?`).join(', ')} WHERE id = ?`).bind(...Object.values(v), id).run();
        return json({ ok: true, total_cents: total });
      }
      if (m === 'DELETE') {
        if (row.status !== 'brouillon' && row.source !== 'import') return json({ error: 'Une facture validée ne peut pas être supprimée : créez un avoir.' }, 400);
        await db.batch([db.prepare('DELETE FROM payments WHERE invoice_id = ?').bind(id), db.prepare('DELETE FROM invoices WHERE id = ?').bind(id)]);
        return json({ ok: true });
      }
    }
    if ((mt = p.match(/^\/api\/admin\/invoices\/(\d+)\/email$/)) && m === 'POST') return json(await envoyerFacture(request, env, +mt[1]));
    if (p === '/api/admin/mail-test' && m === 'POST') {
      const st = etatMail(env);
      if (!st.actif) throw new Erreur('Aucun envoi d’e-mail configuré (voir Factures → Réglages).');
      const S = await lireReglages(db);
      const to = (await request.json().catch(() => ({}))).to || st.from;
      await envoyerMail(env, { to: [to], subject: 'Test d’envoi — Saveurs des Rois', fromName: S.company_name || 'Saveurs des Rois',
        text: 'Ceci est un e-mail de test envoyé depuis l’administration de votre site. Les factures partiront de cette adresse.',
        html: gabaritMail(S, 'Ceci est un e-mail de test envoyé depuis l’administration de votre site.\n\nLes factures partiront de cette adresse.') });
      return json({ ok: true, to, via: st.via });
    }
    if ((mt = p.match(/^\/api\/admin\/invoices\/(\d+)\/valider$/)) && m === 'POST') return json({ ok: true, number: await validerFacture(db, +mt[1]) });
    if ((mt = p.match(/^\/api\/admin\/invoices\/(\d+)\/sumup$/)) && m === 'POST') {
      const inv = await db.prepare('SELECT * FROM invoices WHERE id = ?').bind(+mt[1]).first();
      if (!inv) return json({ error: 'Facture introuvable.' }, 404);
      return json({ ok: true, ...(await verifierSumup(env, db, inv)) });
    }
    if ((mt = p.match(/^\/api\/admin\/invoices\/(\d+)\/payments$/)) && m === 'POST') {
      const inv = await db.prepare('SELECT id, status, type FROM invoices WHERE id = ?').bind(+mt[1]).first();
      if (!inv) return json({ error: 'Facture introuvable.' }, 404);
      if (inv.status !== 'validée') return json({ error: 'Validez la facture avant d’enregistrer un paiement.' }, 400);
      const b = await request.json();
      const montant = Math.abs(toInt(b.amount_cents) || 0) * (inv.type === 'avoir' ? -1 : 1); // avoir : remboursement
      if (!montant) return json({ error: 'Indiquez le montant reçu.' }, 400);
      const date = isoDay(b.date);
      if (!date) return json({ error: 'Indiquez la date du paiement.' }, 400);
      await db.prepare('INSERT INTO payments (invoice_id, date, amount_cents, method, note) VALUES (?, ?, ?, ?, ?)')
        .bind(inv.id, date, montant, clean(b.method, 40) || 'Autre', clean(b.note, 300)).run();
      return json({ ok: true });
    }
    if ((mt = p.match(/^\/api\/admin\/payments\/(\d+)$/)) && m === 'DELETE') {
      await db.prepare('DELETE FROM payments WHERE id = ?').bind(+mt[1]).run();
      return json({ ok: true });
    }

    // Registre des achats (obligatoire pour la vente de marchandises)
    if (p === '/api/admin/expenses' && m === 'POST') {
      const e = depensePropre(await request.json());
      if (e.error) return json({ error: e.error }, 400);
      const r = await db.prepare('INSERT INTO expenses (date, supplier, category, label, amount_cents, method, note) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .bind(e.date, e.supplier, e.category, e.label, e.amount_cents, e.method, e.note).run();
      return json({ ok: true, id: r.meta.last_row_id });
    }
    if ((mt = p.match(/^\/api\/admin\/expenses\/(\d+)$/))) {
      if (m === 'PUT') {
        const e = depensePropre(await request.json());
        if (e.error) return json({ error: e.error }, 400);
        await db.prepare('UPDATE expenses SET date = ?, supplier = ?, category = ?, label = ?, amount_cents = ?, method = ?, note = ? WHERE id = ?')
          .bind(e.date, e.supplier, e.category, e.label, e.amount_cents, e.method, e.note, +mt[1]).run();
        return json({ ok: true });
      }
      if (m === 'DELETE') { await db.prepare('DELETE FROM expenses WHERE id = ?').bind(+mt[1]).run(); return json({ ok: true }); }
    }

    // Import de l'historique (factures passées, achats)
    if (p === '/api/admin/import' && m === 'POST') return json(await importer(db, await request.json()));
    if ((mt = p.match(/^\/api\/admin\/import\/([\w-]{6,40})$/)) && m === 'DELETE') {
      const lot = mt[1];
      await db.batch([
        db.prepare('DELETE FROM payments WHERE import_batch = ?').bind(lot),
        db.prepare("DELETE FROM invoices WHERE import_batch = ? AND source = 'import'").bind(lot),
        db.prepare('DELETE FROM expenses WHERE import_batch = ?').bind(lot),
      ]);
      return json({ ok: true });
    }
  } catch (e) {
    if (e instanceof Erreur) return json({ error: e.message }, e.status);
    throw e;
  }
  return null;
}

function depensePropre(b) {
  const date = isoDay(b.date);
  const amount = toInt(b.amount_cents);
  if (!date) return { error: 'Indiquez la date de l’achat.' };
  if (!amount) return { error: 'Indiquez le montant de l’achat.' };
  return { date, amount_cents: amount, supplier: clean(b.supplier, 120), category: clean(b.category, 60) || 'Autre', label: clean(b.label, 200), method: clean(b.method, 40), note: clean(b.note, 300) };
}

async function importer(db, b) {
  const rows = Array.isArray(b.rows) ? b.rows.slice(0, 5000) : [];
  if (!rows.length) throw new Erreur('Aucune ligne à importer.');
  const lot = `imp-${Date.now().toString(36)}`;
  if (b.kind === 'achats') {
    const ok = rows.map(depensePropre).filter(e => !e.error);
    for (let i = 0; i < ok.length; i += 50) {
      await db.batch(ok.slice(i, i + 50).map(e => db.prepare('INSERT INTO expenses (date, supplier, category, label, amount_cents, method, note, import_batch) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
        .bind(e.date, e.supplier, e.category, e.label, e.amount_cents, e.method, e.note, lot)));
    }
    return { ok: true, lot, importees: ok.length, ignorees: rows.length - ok.length, doublons: 0 };
  }
  // Factures passées : déjà émises, donc enregistrées comme validées (numéro d'origine conservé)
  const existants = new Set((await db.prepare('SELECT number FROM invoices WHERE number IS NOT NULL').all()).results.map(r => r.number));
  const propres = [];
  let ignorees = 0, doublons = 0;
  for (const r of rows) {
    const number = clean(r.number, 40), date = isoDay(r.issue_date), montant = toInt(r.amount_cents);
    if (!number || !date || !montant) { ignorees++; continue; }
    if (existants.has(number)) { doublons++; continue; }
    existants.add(number);
    const avoir = r.type === 'avoir' || montant < 0;
    const lignes = [{ label: clean(r.label, 200) || (avoir ? 'Avoir (importé)' : 'Vente de pâtisseries (facture importée)'), detail: '', qty: 1, unit: '', prix: Math.abs(montant) }];
    const paye = r.paid === true || isoDay(r.paid_date);
    propres.push({
      number, date, avoir, lignes, total: avoir ? -Math.abs(montant) : Math.abs(montant), is_pro: r.is_pro ? 1 : 0,
      client: clientPropre({ nom: r.client, societe: r.societe, siret: r.siret, adresse: r.adresse }),
      due: isoDay(r.due_date) || date,
      paiement: paye ? { date: isoDay(r.paid_date) || date, amount: avoir ? -Math.abs(toInt(r.paid_cents) || montant) : Math.abs(toInt(r.paid_cents) || montant), method: clean(r.method, 40) || 'Non précisé' } : null,
    });
  }
  for (let i = 0; i < propres.length; i += 40) {
    const part = propres.slice(i, i + 40);
    const res = await db.batch(part.map(x => db.prepare(`INSERT INTO invoices (number, type, status, is_pro, client, lines, total_cents, deduct_cents, issue_date, sale_date, due_date, object, source, import_batch, validated_at)
      VALUES (?, ?, 'validée', ?, ?, ?, ?, 0, ?, ?, ?, 'Facture importée', 'import', ?, datetime('now')) RETURNING id`)
      .bind(x.number, x.avoir ? 'avoir' : 'facture', x.is_pro, JSON.stringify(x.client), JSON.stringify(x.lignes), x.total, x.date, x.date, x.due, lot)));
    const pays = [];
    res.forEach((r, k) => {
      const x = part[k], id = r.results?.[0]?.id;
      if (id && x.paiement) pays.push(db.prepare("INSERT INTO payments (invoice_id, date, amount_cents, method, ref, import_batch) VALUES (?, ?, ?, ?, 'import', ?)").bind(id, x.paiement.date, x.paiement.amount, x.paiement.method, lot));
    });
    if (pays.length) await db.batch(pays);
  }
  return { ok: true, lot, importees: propres.length, ignorees, doublons };
}

/* Page publique de paiement : lien imprimé sur la facture, qui ne périme jamais.
   GET : récapitulatif ; POST : crée un paiement SumUp du reste à payer (les robots d'aperçu de liens ne déclenchent rien). */
async function payerFacture(request, env, url, id, sig, retour) {
  const db = env.DB;
  if (!env.ADMIN_PASSWORD || !(await safeEqual(sig, await hmac(`pay:${id}`, await sessionKey(env))))) return pagePaiement('Lien invalide', '<p>Ce lien de paiement n’est pas valide. Contactez-nous pour recevoir le bon lien.</p>', 404);
  const inv = await db.prepare(`SELECT i.*, COALESCE((SELECT SUM(amount_cents) FROM payments p WHERE p.invoice_id = i.id), 0) AS paid_cents FROM invoices i WHERE id = ? AND status = 'validée' AND type != 'avoir'`).bind(id).first();
  if (!inv) return pagePaiement('Facture introuvable', '<p>Cette facture n’existe plus. Contactez-nous.</p>', 404);
  const S = await lireReglages(db);
  const nom = esc(S.company_name || 'Saveurs des Rois');
  const contact = [S.company_phone || S.contact_phone, S.company_email || S.contact_email].filter(Boolean).map(esc).join(' · ');

  if (retour) {
    const v = await verifierSumup(env, db, inv).catch(() => ({ status: 'ERREUR' }));
    if (v.status === 'PAID') {
      if (v.nouveau) {
        const alerte = notify(env, { kind: 'paiement', name: safeJson(inv.client, {}).nom || inv.number, message: `Facture ${inv.number} : ${eur(v.amount_cents)} payés par carte (SumUp).`, items: [], estimate_cents: 0 }, url.origin).catch(() => {});
        await alerte;
      }
      return pagePaiement('Merci !', `<p>Votre paiement pour la facture <strong>${esc(inv.number)}</strong> est bien reçu.</p><p>À très bientôt,<br>${nom}</p>`);
    }
    if (v.status === 'FAILED') return pagePaiement('Paiement non abouti', `<p>Le paiement n’a pas abouti. Vous pouvez réessayer.</p><p><a class="b" href="${url.pathname.replace(/\/retour$/, '')}">Réessayer</a></p>`);
    return pagePaiement('Paiement en cours', `<p>Votre paiement est en cours de vérification. Si vous avez validé le paiement, inutile de recommencer : nous le recevrons sous peu.</p><p>${contact}</p>`);
  }

  const reste = inv.total_cents - inv.deduct_cents - inv.paid_cents;
  if (reste <= 0) return pagePaiement('Facture réglée', `<p>La facture <strong>${esc(inv.number)}</strong> est entièrement réglée. Merci !</p>`);
  const lien = /^https:\/\//.test(inv.payment_link || '') ? inv.payment_link : /^https:\/\//.test(S.sumup_link || '') ? S.sumup_link : '';

  if (request.method === 'POST') {
    if (sumupApi(env)) try {
      const r = await fetch('https://api.sumup.com/v0.1/checkouts', {
        method: 'POST', headers: { Authorization: `Bearer ${env.SUMUP_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          merchant_code: env.SUMUP_MERCHANT_CODE, amount: reste / 100, currency: 'EUR',
          checkout_reference: `${inv.number}-${Date.now().toString(36)}`, description: `Facture ${inv.number} — ${S.company_name || 'Saveurs des Rois'}`,
          redirect_url: `${url.origin}${url.pathname.replace(/\/$/, '')}/retour`, hosted_checkout: { enabled: true },
        }),
      });
      const c = await r.json().catch(() => ({}));
      if (r.ok && c.hosted_checkout_url) {
        await db.prepare('UPDATE invoices SET sumup_checkout_id = ? WHERE id = ?').bind(c.id, id).run();
        return Response.redirect(c.hosted_checkout_url, 303);
      }
      console.error('SumUp :', r.status, JSON.stringify(c));
    } catch (err) { console.error('SumUp injoignable :', err.message); }
    if (lien) return Response.redirect(lien, 303);
  }

  const peutPayer = sumupApi(env) || lien;
  const virement = S.company_iban ? `<p class="petit">Ou par virement : IBAN <strong>${esc(S.company_iban)}</strong>${S.company_bic ? ` · BIC ${esc(S.company_bic)}` : ''}, en indiquant « ${esc(inv.number)} ».</p>` : '';
  return pagePaiement(`Facture ${esc(inv.number)}`, `
    <p class="montant">${eur(reste)}</p><p class="petit">reste à payer · facture du ${frDay(inv.issue_date)}</p>
    ${peutPayer ? `<form method="post"><button class="b" type="submit">Payer par carte</button></form><p class="petit">Paiement sécurisé par SumUp.</p>` : '<p>Le paiement en ligne n’est pas encore disponible : contactez-nous.</p>'}
    ${virement}<p class="petit">${contact}</p>`);
}
function esc(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function pagePaiement(titre, corps, status = 200) {
  return new Response(`<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex">
<title>${titre} — Saveurs des Rois</title><link rel="icon" href="/assets/img/favicon.png">
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#050505;color:#fbf8f1;font:18px/1.5 Georgia,serif;padding:1.2rem;box-sizing:border-box}
main{max-width:430px;width:100%;box-sizing:border-box;text-align:center;border:1px solid #d6b55d;border-radius:20px;padding:2rem 1.5rem;background:#0d0b08}
img{width:64px}h1{color:#d6b55d;font-weight:600;font-size:1.5rem;margin:.6rem 0 1rem}.montant{font-size:2.4rem;color:#ecd79a;margin:0}.petit{font-size:.9rem;color:#dcc08f}
.b{display:inline-block;background:#d6b55d;color:#050505;border:0;border-radius:999px;padding:.8rem 1.8rem;font:600 1rem Georgia,serif;cursor:pointer;text-decoration:none;margin-top:.6rem}a{color:#d6b55d}
main:has(.acc){max-width:540px}.dv{width:100%;border-collapse:collapse;text-align:left;font-size:.95rem;margin:.6rem 0}.dv td{padding:.45rem .2rem;border-bottom:1px solid #3a3122;vertical-align:top}.dv small{color:#dcc08f}.dv .n{text-align:right;white-space:nowrap}
.dv--tot td{border:0;padding:.25rem .2rem}.dv--tot .fort td{font-size:1.15rem;color:#ecd79a;border-top:1px solid #d6b55d;padding-top:.5rem}
.acc{display:grid;gap:.8rem;text-align:left;margin:1.2rem 0 .6rem;border-top:1px solid #3a3122;padding-top:1rem}.acc label{display:grid;gap:.3rem}.acc input:not([type=checkbox]),.acc textarea{font:inherit;padding:.6rem .8rem;border-radius:10px;border:1px solid #8c6b22;background:#16130d;color:#fbf8f1}
.acc .case{display:flex;gap:.6rem;align-items:flex-start}.acc .case input{margin-top:.35rem;width:1.1rem;height:1.1rem;accent-color:#d6b55d}.acc .b{justify-self:center}.err{background:#3a1512;color:#f2c2b9;border-radius:10px;padding:.5rem .8rem}</style></head>
<body><main><img src="/assets/img/logo-transparent.webp" alt="Saveurs des Rois"><h1>${titre}</h1>${corps}</main></body></html>`,
  { status, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' } });
}

/* ---------------------------------------------------------------- envoi des factures par e-mail */

// Deux solutions, au choix (secrets Cloudflare) :
//  • Gmail (ou autre messagerie) : SMTP_USER + SMTP_PASS (mot de passe d'application) — gratuit, sans nom de domaine,
//    les e-mails partent de votre adresse et apparaissent dans vos « Messages envoyés ».
//    Facultatif : SMTP_HOST (smtp.gmail.com), SMTP_PORT (465), SMTP_FROM.
//  • Resend : RESEND_API_KEY + INVOICE_FROM (adresse d'un domaine vérifié chez Resend).
function etatMail(env) {
  if (env.SMTP_USER && env.SMTP_PASS) return { actif: true, via: 'smtp', from: env.SMTP_FROM || env.SMTP_USER, host: env.SMTP_HOST || 'smtp.gmail.com' };
  if (env.RESEND_API_KEY && env.INVOICE_FROM) return { actif: true, via: 'resend', from: env.INVOICE_FROM };
  return { actif: false, via: '', from: '', resendSansDomaine: Boolean(env.RESEND_API_KEY) };
}

const b64utf8 = str => { const u = new TextEncoder().encode(str); let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000)); return btoa(s); };
const plier = b64 => b64.replace(/.{1,76}/g, '$&\r\n').trimEnd();
const enteteUtf8 = t => (/^[\x20-\x7e]*$/.test(t) ? t : `=?UTF-8?B?${b64utf8(t)}?=`);
const adresseValide = a => /^[^\s@<>,;"]+@[^\s@<>,;"]+\.[^\s@<>,;"]+$/.test(a);

function messageMime({ from, fromName, to, replyTo, subject, text, html, attachments = [] }) {
  const b1 = `sdr1${crypto.randomUUID().replace(/-/g, '')}`, b2 = `sdr2${crypto.randomUUID().replace(/-/g, '')}`;
  const l = [
    `From: ${enteteUtf8(fromName || 'Saveurs des Rois')} <${from}>`,
    `To: ${to.join(', ')}`,
    ...(replyTo ? [`Reply-To: ${replyTo}`] : []),
    `Subject: ${enteteUtf8(subject)}`,
    `Date: ${new Date().toUTCString().replace('GMT', '+0000')}`,
    `Message-ID: <${crypto.randomUUID()}@${from.split('@')[1]}>`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/mixed; boundary="${b1}"`, '',
    `--${b1}`, `Content-Type: multipart/alternative; boundary="${b2}"`, '',
    `--${b2}`, 'Content-Type: text/plain; charset=UTF-8', 'Content-Transfer-Encoding: base64', '', plier(b64utf8(text)),
    `--${b2}`, 'Content-Type: text/html; charset=UTF-8', 'Content-Transfer-Encoding: base64', '', plier(b64utf8(html)),
    `--${b2}--`,
  ];
  for (const a of attachments) {
    l.push(`--${b1}`, `Content-Type: ${a.type || 'application/pdf'}; name="${a.filename}"`, `Content-Disposition: attachment; filename="${a.filename}"`,
      'Content-Transfer-Encoding: base64', '', plier(a.content));
  }
  l.push(`--${b1}--`, '');
  return l.join('\r\n');
}

async function envoiSmtp(env, msg) {
  const { connect } = await import('cloudflare:sockets');
  const host = env.SMTP_HOST || 'smtp.gmail.com', port = Number(env.SMTP_PORT || 465);
  const mode = env.SMTP_SECURE === 'off' ? 'off' : port === 465 ? 'on' : 'starttls';
  let sock = connect({ hostname: host, port }, { secureTransport: mode, allowHalfOpen: false });
  let reader = sock.readable.getReader(), writer = sock.writable.getWriter();
  const enc = new TextEncoder(), dec = new TextDecoder();
  let tampon = '';
  const lire = async () => {
    for (;;) {
      const lignes = tampon.split('\r\n');
      for (let i = 0; i < lignes.length - 1; i++) {
        if (/^\d{3} /.test(lignes[i])) { tampon = lignes.slice(i + 1).join('\r\n'); return { code: +lignes[i].slice(0, 3), texte: lignes.slice(0, i + 1).join(' ') }; }
      }
      const { value, done } = await reader.read();
      if (done) throw new Error('la connexion a été fermée par le serveur de messagerie');
      tampon += dec.decode(value, { stream: true });
    }
  };
  const cmd = async (ligne, attendu, secret = false) => {
    if (ligne != null) await writer.write(enc.encode(ligne + '\r\n'));
    const r = await lire();
    if (!attendu.includes(r.code)) {
      if (secret || r.code === 535) throw new Error('identifiant ou mot de passe d’application refusé par la messagerie (vérifiez SMTP_USER et SMTP_PASS)');
      throw new Error(`réponse ${r.code} du serveur de messagerie : ${r.texte.slice(0, 180)}`);
    }
    return r;
  };
  const delai = new Promise((_, ko) => setTimeout(() => ko(new Error('le serveur de messagerie ne répond pas')), 25000));
  const echange = (async () => {
    await cmd(null, [220]);
    await cmd('EHLO saveurs-des-rois', [250]);
    if (mode === 'starttls') {
      await cmd('STARTTLS', [220]);
      reader.releaseLock(); writer.releaseLock();
      sock = sock.startTls();
      reader = sock.readable.getReader(); writer = sock.writable.getWriter();
      await cmd('EHLO saveurs-des-rois', [250]);
    }
    await cmd('AUTH LOGIN', [334]);
    await cmd(b64utf8(env.SMTP_USER), [334], true);
    await cmd(b64utf8(env.SMTP_PASS.replace(/\s/g, '')), [235], true);
    await cmd(`MAIL FROM:<${msg.from}>`, [250]);
    for (const r of [...msg.to, ...(msg.bcc || [])]) await cmd(`RCPT TO:<${r}>`, [250, 251]);
    await cmd('DATA', [354]);
    const corps = messageMime(msg).split('\r\n').map(x => (x.startsWith('.') ? '.' + x : x)).join('\r\n');
    await writer.write(enc.encode(corps + '\r\n.\r\n'));
    await cmd(null, [250]);
    await cmd('QUIT', [221]).catch(() => {});
  })();
  try { await Promise.race([echange, delai]); } finally { try { sock.close(); } catch { } }
}

async function envoyerMail(env, { to, bcc = [], subject, text, html, attachments = [], replyTo, fromName }) {
  const st = etatMail(env);
  if (!st.actif) throw new Erreur('Aucun envoi d’e-mail configuré : voir Factures → Réglages → « Envoi des factures par e-mail ».');
  if (st.via === 'smtp') {
    try { await envoiSmtp(env, { from: st.from, fromName, to, bcc, replyTo, subject, text, html, attachments }); }
    catch (e) { if (e instanceof Erreur) throw e; throw new Erreur(`E-mail non envoyé : ${e.message}.`, 502); }
    return st.via;
  }
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST', headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: `${fromName || 'Saveurs des Rois'} <${st.from}>`, to, bcc: bcc.length ? bcc : undefined, reply_to: replyTo || undefined,
      subject, text, html, attachments: attachments.map(a => ({ filename: a.filename, content: a.content })) }),
  }).catch(e => ({ ok: false, status: 0, json: async () => ({ message: e.message }) }));
  if (!r.ok) throw new Erreur(`E-mail non envoyé (Resend) : ${(await r.json().catch(() => ({}))).message || `erreur ${r.status}`}.`, 502);
  return st.via;
}

function gabaritMail(S, message) {
  const paragraphes = esc(message).replace(/(https:\/\/[^\s<]+)/g, '<a href="$1" style="color:#8c6b22">$1</a>').split(/\n{2,}/).map(p => `<p style="margin:0 0 14px;line-height:1.6">${p.replace(/\n/g, '<br>')}</p>`).join('');
  const pied = [S.company_name || 'Saveurs des Rois', S.company_phone || S.contact_phone, S.company_email || S.contact_email].filter(Boolean).map(esc).join(' · ');
  return `<div style="font-family:Georgia,'Times New Roman',serif;max-width:580px;margin:auto;color:#1e1812">
    <div style="background:#050505;color:#d6b55d;padding:18px 24px;font-size:21px;letter-spacing:.05em;border-bottom:2px solid #d6b55d">${esc(S.company_name || 'Saveurs des Rois')}</div>
    <div style="border:1px solid #dcc08f;border-top:0;padding:24px;background:#fbf8f1;font-size:16px">${paragraphes}</div>
    <p style="font-size:12px;color:#5b4f40;text-align:center;margin:12px 0">${pied}<br>Pâtisseries marocaines artisanales</p></div>`;
}

async function envoyerFacture(request, env, id) {
  const db = env.DB;
  const inv = await db.prepare('SELECT * FROM invoices WHERE id = ?').bind(id).first();
  if (!inv) throw new Erreur('Facture introuvable.', 404);
  if (inv.status !== 'validée') throw new Erreur('Validez la facture avant de l’envoyer.');
  const b = await request.json().catch(() => ({}));
  const to = String(b.to || '').split(/[,;\s]+/).map(x => x.trim()).filter(Boolean).slice(0, 5);
  if (!to.length || !to.every(adresseValide)) throw new Erreur('Adresse e-mail du client invalide.');
  const pdf = String(b.pdf || '').replace(/^data:[^,]+,/, '');
  if (!pdf || pdf.length > 7_000_000 || !/^[A-Za-z0-9+/=]+$/.test(pdf.slice(0, 200))) throw new Erreur('PDF de la facture manquant ou trop lourd.');
  const S = await lireReglages(db);
  const st = etatMail(env);
  const message = clean(b.message, 5000);
  const subject = clean(b.subject, 200) || `Facture ${inv.number} — ${S.company_name || 'Saveurs des Rois'}`;
  const replyTo = S.company_email || S.contact_email || '';
  const via = await envoyerMail(env, {
    to, bcc: b.copie && adresseValide(st.from) && !to.includes(st.from) ? [st.from] : [], subject, text: message, html: gabaritMail(S, message), replyTo: replyTo !== st.from ? replyTo : '',
    fromName: S.company_name || 'Saveurs des Rois',
    attachments: [{ filename: (clean(b.filename, 80) || `${inv.number}.pdf`).replace(/[^\w.\- ]/g, '_'), content: pdf }],
  });
  await db.prepare(`UPDATE invoices SET sent_at = datetime('now'), sent_to = ?${b.relance ? ", reminders = COALESCE(reminders, 0) + 1, last_reminder_at = datetime('now')" : ''} WHERE id = ?`).bind(to.join(', '), id).run();
  return { ok: true, via, to };
}

/* ---------------------------------------------------------------- devis : envoi par e-mail et acceptation en ligne */

async function lienDevis(env, origin, id) {
  return `${origin}/api/devis/${id}/${await hmac(`devis:${id}`, await sessionKey(env))}`;
}

// Totaux d'un devis enregistré (mêmes règles que la page devis)
function totauxDevis(q) {
  const t = { part: 0, pro: 0, frais: 0 };
  (q?.lignes || []).forEach(l => { t[l.s] = (t[l.s] || 0) + Math.round((Number(l.qty) || 0) * (Number(l.prix) || 0)); });
  const remise = Math.round(t.part * (Number(q?.remise) || 0) / 100);
  const total = t.part - remise + t.pro + t.frais;
  return { ...t, remise, total, acompte: Math.round(total * (Number(q?.acompte) || 0) / 100) };
}
function finValidite(q) {
  if (!isoDay(q?.date)) return null;
  return addDays(q.date, toInt(q.validite) || 30);
}

async function envoyerDevis(request, env, id) {
  const db = env.DB;
  const r = await db.prepare('SELECT * FROM requests WHERE id = ?').bind(id).first();
  if (!r) throw new Erreur('Demande introuvable.', 404);
  const q = safeJson(r.quote, null);
  if (!q?.lignes?.length) throw new Erreur('Enregistrez d’abord le devis.');
  const b = await request.json().catch(() => ({}));
  const to = String(b.to || '').split(/[,;\s]+/).map(x => x.trim()).filter(Boolean).slice(0, 5);
  if (!to.length || !to.every(adresseValide)) throw new Erreur('Adresse e-mail du client invalide.');
  const pdf = String(b.pdf || '').replace(/^data:[^,]+,/, '');
  if (!pdf || pdf.length > 7_000_000 || !/^[A-Za-z0-9+/=]+$/.test(pdf.slice(0, 200))) throw new Erreur('PDF du devis manquant ou trop lourd.');
  const S = await lireReglages(db);
  const st = etatMail(env);
  const message = clean(b.message, 5000);
  const replyTo = S.company_email || S.contact_email || '';
  const via = await envoyerMail(env, {
    to, bcc: b.copie && adresseValide(st.from) && !to.includes(st.from) ? [st.from] : [],
    subject: clean(b.subject, 200) || `Votre devis ${q.numero} — ${S.company_name || 'Saveurs des Rois'}`,
    text: message, html: gabaritMail(S, message), replyTo: replyTo !== st.from ? replyTo : '', fromName: S.company_name || 'Saveurs des Rois',
    attachments: [{ filename: (clean(b.filename, 80) || `${q.numero}.pdf`).replace(/[^\w.\- ]/g, '_'), content: pdf }],
  });
  await db.prepare(`UPDATE requests SET quote_sent_at = datetime('now'), quote_sent_to = ?,
    status = CASE WHEN status IN ('nouveau', 'en cours') THEN 'devis envoyé' ELSE status END WHERE id = ?`).bind(to.join(', '), id).run();
  return { ok: true, via, to };
}

/* Page publique : le client consulte son devis et l'accepte (« bon pour accord » en ligne).
   L'acceptation enregistre une copie du devis, passe la demande en « confirmé » et prépare le brouillon de la facture d'acompte. */
async function accepterDevis(request, env, url, ctx, id, sig) {
  const db = env.DB;
  if (!env.ADMIN_PASSWORD || !(await safeEqual(sig, await hmac(`devis:${id}`, await sessionKey(env))))) return pagePaiement('Lien invalide', '<p>Ce lien n’est pas valide. Contactez-nous pour recevoir le bon lien.</p>', 404);
  const r = await db.prepare('SELECT * FROM requests WHERE id = ?').bind(id).first();
  const q = safeJson(r?.quote, null);
  if (!r || !q?.lignes?.length || r.status === 'archivé') return pagePaiement('Devis indisponible', '<p>Ce devis n’est plus disponible. Contactez-nous.</p>', 404);
  const S = await lireReglages(db);
  const contact = [S.company_phone || S.contact_phone, S.company_email || S.contact_email].filter(Boolean).map(esc).join(' · ');
  const today = parisDay(Date.now());
  const t = totauxDevis(r.accepted_quote ? safeJson(r.accepted_quote, q) : q);

  if (r.accepted_at) {
    return pagePaiement('Devis accepté', `<p>Le devis <strong>${esc(q.numero)}</strong> a été accepté le ${frDay(r.accepted_at.slice(0, 10))}${r.accepted_name ? ` par ${esc(r.accepted_name)}` : ''}.</p><p>Merci pour votre confiance !</p><p class="petit">${contact}</p>`);
  }
  const fin = finValidite(q);
  if (fin && fin < today) return pagePaiement('Devis expiré', `<p>Le devis <strong>${esc(q.numero)}</strong> était valable jusqu’au ${frDay(fin)}. Contactez-nous pour un devis à jour.</p><p class="petit">${contact}</p>`);

  let erreur = '';
  if (request.method === 'POST') {
    const f = await request.formData().catch(() => null);
    const nom = clean(f?.get('nom'), 120), ok = f?.get('accord') === 'oui', mot = clean(f?.get('message'), 1500);
    if (f?.get('website')) return pagePaiement('Merci', '<p>Merci.</p>');
    if (!nom || nom.length < 3) erreur = 'Indiquez votre nom et prénom.';
    else if (!ok) erreur = 'Cochez la case « Bon pour accord » pour accepter le devis.';
    else {
      const res = await db.prepare(`UPDATE requests SET accepted_at = datetime('now'), accepted_name = ?, accepted_quote = ?,
        status = 'confirmé', message = CASE WHEN ? = '' THEN message WHEN COALESCE(message, '') = '' THEN 'Message à l’acceptation : ' || ? ELSE message || char(10) || char(10) || 'Message à l’acceptation : ' || ? END
        WHERE id = ? AND accepted_at IS NULL`).bind(nom, r.quote, mot, mot, mot, id).run();
      if (res.meta.changes) {
        // Brouillon de la facture d'acompte (à vérifier et valider dans l'administration)
        const deja = await db.prepare("SELECT id FROM invoices WHERE EXISTS (SELECT 1 FROM json_each(invoices.request_ids) WHERE value = ?) LIMIT 1").bind(id).first();
        if (!deja && t.acompte > 0) await creerFacture(db, { mode: 'demande', request_id: id, type: 'acompte', deposit_cents: t.acompte }).catch(e => console.error('Brouillon d’acompte :', e.message));
        const alerte = notify(env, { kind: 'devis_accepte', name: nom, phone: r.phone, email: r.email, event_type: r.event_type, event_date: r.event_date,
          message: `Devis ${q.numero} accepté en ligne (${eur(t.total)}).${t.acompte ? ` Brouillon de facture d’acompte (${eur(t.acompte)}) prêt à valider.` : ''}${mot ? `\n« ${mot} »` : ''}`, items: [], estimate_cents: t.total }, url.origin).catch(() => {});
        if (ctx?.waitUntil) ctx.waitUntil(alerte);
      }
      const virement = S.company_iban && t.acompte ? `<p class="petit">Acompte à verser : <strong>${eur(t.acompte)}</strong> — virement sur l’IBAN ${esc(S.company_iban)} en indiquant « ${esc(q.numero)} ». Nous vous confirmons la réception.</p>` : '';
      return pagePaiement('Merci !', `<p>Votre accord pour le devis <strong>${esc(q.numero)}</strong> (${eur(t.total)}) est bien enregistré.</p>${t.acompte ? `<p>Nous vous envoyons la facture d’acompte de ${eur(t.acompte)} très vite.</p>` : '<p>Nous revenons vers vous très vite pour la suite.</p>'}${virement}<p class="petit">${contact}</p>`);
    }
  }

  const lignes = q.lignes.map(l => `<tr><td>${esc(l.label)}${l.detail ? `<br><small>${esc(l.detail)}</small>` : ''}</td><td class="n">${String(l.qty).replace('.', ',')}${l.kg ? ' kg' : ''}</td><td class="n">${eur(Math.round(l.qty * l.prix))}</td></tr>`).join('');
  const corps = `
    <p class="petit">Devis ${esc(q.numero)} du ${frDay(q.date)}${fin ? ` · valable jusqu’au ${frDay(fin)}` : ''}</p>
    <p>${esc(q.client?.nom || r.name)}${q.evenement ? `<br><span class="petit">${esc(q.evenement)}</span>` : ''}</p>
    <table class="dv"><tbody>${lignes}</tbody></table>
    <table class="dv dv--tot"><tbody>
      ${t.remise ? `<tr><td>Remise</td><td class="n">− ${eur(t.remise)}</td></tr>` : ''}
      <tr class="fort"><td>Total</td><td class="n">${eur(t.total)}</td></tr>
      ${t.acompte ? `<tr><td>Acompte à la commande (${String(q.acompte).replace('.', ',')} %)</td><td class="n">${eur(t.acompte)}</td></tr>` : ''}
    </tbody></table>
    <p class="petit">${esc(S.quote_legal || 'TVA non applicable, art. 293 B du CGI.')}</p>
    ${erreur ? `<p class="err">${esc(erreur)}</p>` : ''}
    <form method="post" class="acc">
      <label>Nom et prénom<input name="nom" required autocomplete="name" value=""></label>
      <label class="case"><input type="checkbox" name="accord" value="oui" required> <span>J’ai lu ce devis et je l’accepte : <strong>bon pour accord</strong>.</span></label>
      <label>Un message pour nous ? (facultatif)<textarea name="message" rows="2" placeholder="Horaire de retrait, précision…"></textarea></label>
      <input name="website" tabindex="-1" autocomplete="off" style="position:absolute;left:-9999px" aria-hidden="true">
      <button class="b" type="submit">J’accepte le devis</button>
    </form>
    <p class="petit">Une question ou une modification ? ${contact || 'Contactez-nous.'}</p>`;
  return pagePaiement(`Votre devis`, corps, erreur ? 400 : 200);
}

/* ---------------------------------------------------------------- auth */

async function login(request, env) {
  if (!env.ADMIN_PASSWORD) {
    return json({ error: 'Mot de passe non configuré : Cloudflare → Workers & Pages → saveurs-des-rois → Settings → Variables and Secrets → ajouter le secret ADMIN_PASSWORD, puis redéployer.' }, 500);
  }
  const { password, remember } = await request.json().catch(() => ({}));
  const ok = await safeEqual(String(password || ''), env.ADMIN_PASSWORD);
  if (!ok) {
    await new Promise(r => setTimeout(r, 900)); // ralentit les essais en série
    return json({ error: 'Mot de passe incorrect.' }, 401);
  }
  const hours = remember ? 24 * 30 : SESSION_HOURS; // « Rester connectée » : 30 jours sur cet appareil
  const exp = Date.now() + hours * 3600_000;
  const token = `${exp}.${await hmac(String(exp), await sessionKey(env))}`;
  return json({ ok: true }, 200, {
    'Set-Cookie': `${SESSION_COOKIE}=${token}; Path=/; Max-Age=${hours * 3600}; HttpOnly; Secure; SameSite=Strict`,
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
  for (const k of ['price_cents', 'price_kg_cents', 'threshold', 'featured', 'visible', 'position']) if (k in data) data[k] = data[k] == null ? null : toInt(data[k]);
  if ('min_kg' in data) data.min_kg = data.min_kg == null ? null : toNum(data.min_kg);
  if ('price_mode' in data && !PRICE_MODES.includes(data.price_mode)) data.price_mode = 'piece';
  if ('tiers' in data) data.tiers = JSON.stringify(cleanTiers(data.tiers));
  for (const k of ['energy_kcal', 'proteins', 'carbs', 'fats', 'salt']) if (k in data) data[k] = data[k] == null ? null : toNum(data[k]);
  for (const k of ['featured', 'visible', 'position']) if (k in data && data[k] == null) data[k] = 0;
  return data;
}
function parseProduct(p) { return { ...p, gallery: safeJson(p.gallery, []), tiers: cleanTiers(safeJson(p.tiers, [])) }; }
// Grille dégressive : paliers valides (quantité ≥ 2, prix > 0), triés par quantité croissante
function cleanTiers(t) {
  if (typeof t === 'string') t = safeJson(t, []);
  if (!Array.isArray(t)) return [];
  const seen = new Set();
  return t.map(x => ({ min: toInt(x?.min), price_cents: toInt(x?.price_cents) }))
    .filter(x => x.min >= 2 && x.price_cents > 0 && !seen.has(x.min) && seen.add(x.min))
    .sort((a, b) => a.min - b.min).slice(0, 6);
}
// Prix unitaire applicable pour une quantité : le palier le plus élevé atteint, sinon le prix de base
function unitPrice(p, qty) {
  let price = p.price_cents;
  for (const t of cleanTiers(p.tiers)) if (qty >= t.min && t.price_cents < price) price = t.price_cents;
  return price;
}
function safeJson(s, fallback) { try { return JSON.parse(s ?? ''); } catch { return fallback; } }
function toInt(v) { const n = parseInt(v, 10); return Number.isFinite(n) ? n : null; }
function toNum(v) { const n = parseFloat(String(v).replace(',', '.')); return Number.isFinite(n) ? n : null; }
function clean(v, max) { return String(v ?? '').trim().slice(0, max); }
function slugify(s) {
  return String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
}
