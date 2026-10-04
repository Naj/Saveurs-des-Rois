/* Structure et contenu initial de la base D1.
   Appliqués automatiquement par le Worker au premier accès : aucune commande à lancer.
   Les insertions utilisent INSERT OR IGNORE : elles ne remplacent jamais une donnée modifiée dans l'admin. */

export const SCHEMA_VERSION = '2';

export const SCHEMA = [
  "CREATE TABLE IF NOT EXISTS products ( id TEXT PRIMARY KEY, name TEXT NOT NULL, arabic_name TEXT, tagline TEXT, description TEXT, price_cents INTEGER NOT NULL, price_label TEXT DEFAULT 'la pièce', threshold INTEGER, ingredients TEXT, allergens TEXT, traces TEXT, energy_kcal REAL, proteins REAL, carbs REAL, fats REAL, salt REAL, image TEXT, gallery TEXT DEFAULT '[]', featured INTEGER DEFAULT 0, visible INTEGER DEFAULT 1, position INTEGER DEFAULT 0, updated_at TEXT DEFAULT (datetime('now')) )",
  "CREATE TABLE IF NOT EXISTS settings ( key TEXT PRIMARY KEY, value TEXT )",
  "CREATE TABLE IF NOT EXISTS videos ( id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, description TEXT, url TEXT NOT NULL, poster TEXT, product_id TEXT, visible INTEGER DEFAULT 1, position INTEGER DEFAULT 0, created_at TEXT DEFAULT (datetime('now')) )",
  "CREATE TABLE IF NOT EXISTS requests ( id INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT NOT NULL DEFAULT 'devis', name TEXT NOT NULL, email TEXT, phone TEXT, event_date TEXT, event_type TEXT, delivery TEXT, message TEXT, items TEXT DEFAULT '[]', estimate_cents INTEGER DEFAULT 0, status TEXT DEFAULT 'nouveau', created_at TEXT DEFAULT (datetime('now')) )",
  "CREATE TABLE IF NOT EXISTS media ( id TEXT PRIMARY KEY, name TEXT, mime TEXT NOT NULL, size INTEGER, data BLOB NOT NULL, created_at TEXT DEFAULT (datetime('now')) )",
  "CREATE INDEX IF NOT EXISTS idx_products_pos ON products(position)",
  "CREATE INDEX IF NOT EXISTS idx_requests_date ON requests(created_at)"
];

// Requêtes paramétrées : aucun souci d'apostrophes ni de retours à la ligne.
export const SEED = [
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
