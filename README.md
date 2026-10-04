# Saveurs des Rois — site vitrine

Site de présentation des pâtisseries **Saveurs des Rois** : collection, fiches produits (ingrédients, allergènes, valeurs nutritionnelles), demande de devis, histoire, vidéos, contact, et un **espace administrateur** (`/admin`) pour tout modifier sans toucher au code.

Fonctionne **entièrement sur GitHub et Cloudflare** : aucune installation sur votre ordinateur.

👉 **Mise en ligne pas à pas : [GUIDE-MISE-EN-LIGNE.md](GUIDE-MISE-EN-LIGNE.md)**

## Comment ça marche

```
GitHub (code)  ──commit──▶  Cloudflare Pages (ou Workers) ──▶  Site en ligne
                            installe et vérifie tout                  │
                            sur les serveurs Cloudflare               ▼
                                                              Base D1 (produits, devis,
                                                              textes, vidéos, photos)
```

- Chaque modification enregistrée sur GitHub republie le site automatiquement.
- La base D1 est créée et remplie **automatiquement** à la première visite (5 recettes, textes). Les données modifiées dans l'admin ne sont jamais écrasées.
- Réglages dans le tableau de bord Cloudflare uniquement : dossier de sortie `public`, liaison D1 `DB`, secret `ADMIN_PASSWORD`.

## Contenu du dépôt

```
├── GUIDE-MISE-EN-LIGNE.md   Pas à pas GitHub + Cloudflare
├── wrangler.jsonc           Configuration (utilisée seulement en mode Workers)
├── package.json             Commande de publication utilisée par Cloudflare
├── package-lock.json        Versions exactes des outils (utilisé par Cloudflare)
├── scripts/check.mjs        Vérifications automatiques avant chaque publication
└── public/                  Le site (dossier publié)
    ├── _worker.js                  Serveur : API, admin, base de données (créée automatiquement)
    ├── _routes.json                Réserve le serveur aux adresses /api et /media
    ├── index.html, css/, js/       Pages publiques
    ├── admin/                      Espace administrateur
    ├── assets/img/                 Logo et photos
    └── assets/docs/                Carte complète en PDF
```

## Espace administrateur — `/admin`

| Onglet | Ce que vous pouvez faire |
|---|---|
| Demandes | Demandes de devis et messages : statut, réponse par e-mail ou WhatsApp ; état des alertes et envoi d'un test |
| Produits | **Ajouter une recette** (fiche guidée ou copie d'une fiche existante, aperçu, liste « Prêt à publier ? ») ; nom, nom arabe, description, prix, seuil dégressif, photos, ingrédients, allergènes, valeurs nutritionnelles ; masquer, mettre en avant, ajouter, supprimer |
| Galerie | Photos de vos événements (titre, occasion, légende), affichées sur la page « Vos événements » et l'accueil |
| Avis | Valider, refuser, répondre aux avis ; ajouter un avis reçu par message |
| Statistiques | Visites, pâtisseries consultées, ajouts au devis, demandes, provenance, appareils (mesure anonyme sans cookie) |
| Textes & contact | Accueil, votre histoire, coordonnées, réseaux sociaux, mentions légales, musique d'ambiance |
| Vidéos | Lien YouTube / Vimeo / .mp4, associable à un produit |
| Photos | Import de photos (compressées automatiquement) |

## Bon à savoir

- **Carte PDF** (`public/assets/docs/`) : image figée de vos fiches. Si un prix change, remplacez aussi ce PDF depuis GitHub.
- **Photos importées dans l'admin** : stockées dans D1 (1,8 Mo max après compression). Pour un grand volume, prévoir Cloudflare R2.
- **Musique d'ambiance** : désactivée par défaut, jamais lancée automatiquement. Uniquement une musique libre de droits ou sous licence.
- **Alertes de devis** : e-mail (Resend) et/ou WhatsApp (CallMeBot), activées par des secrets Cloudflare — voir le guide.
- **Mot de passe** : jamais dans le code. Il est stocké chez Cloudflare (secret `ADMIN_PASSWORD`).
