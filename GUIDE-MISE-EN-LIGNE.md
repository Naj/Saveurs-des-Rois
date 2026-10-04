# Mise en ligne — 100 % GitHub et Cloudflare

Aucune installation sur votre ordinateur : tout se fait dans le navigateur, sur **github.com** et **dash.cloudflare.com**.
Durée : environ 20 minutes.

Ce qu'il vous faut : un compte GitHub (gratuit) et votre compte Cloudflare.

---

## Étape 1 — Décompresser l'archive

Faites un clic droit sur `saveurs-des-rois.zip` → **Extraire tout** (Windows) ou double-clic (Mac).
Vous obtenez un dossier `saveurs-des-rois` contenant notamment `public`, `src`, `scripts`, `package.json`, `wrangler.jsonc`.

---

## Étape 2 — Créer le dépôt GitHub et y déposer les fichiers

1. Sur **github.com**, cliquez sur **+** (en haut à droite) → **New repository**.
2. **Repository name** : `saveurs-des-rois` — cochez **Private** — ne cochez rien d'autre → **Create repository**.
3. Sur la page qui s'affiche, cliquez sur le lien **uploading an existing file**.
4. Ouvrez le dossier `saveurs-des-rois` sur votre ordinateur, **sélectionnez tout son contenu** (Ctrl + A / Cmd + A) et **glissez-le** dans la zone de dépôt de GitHub.
   ⚠️ Glissez le *contenu* du dossier, pas le dossier lui-même : `package.json` doit se retrouver à la racine du dépôt.
5. Attendez la fin de l'envoi, puis cliquez sur **Commit changes**.

✅ Vérification : à la racine du dépôt, vous voyez `public/`, `src/`, `scripts/`, `package.json`, `package-lock.json`, `wrangler.jsonc`, `README.md`.

> Les fichiers `.gitignore` et `.gitattributes` peuvent ne pas être envoyés (fichiers cachés) : ce n'est pas grave.

---

## Étape 3 — Créer la base de données dans Cloudflare

1. **dash.cloudflare.com** → menu de gauche **Storage & Databases** → **D1 SQL Database** → **Create Database**.
2. **Name** : `saveurs-des-rois` → **Create**.

> Vous pourrez aussi choisir une base D1 existante à l'étape 5 : les tables du site s'ajoutent à côté de l'existant.

Vous n'avez **rien d'autre** à faire sur la base : le site crée ses tables et y place les 5 recettes tout seul, à la première visite.

---

## Étape 4 — Créer le site dans Cloudflare Pages

1. Cloudflare → **Workers & Pages** → **Create** → onglet **Pages** → **Import an existing Git repository** (*Connect to Git*).
2. Connectez GitHub si ce n'est pas fait et choisissez le dépôt **saveurs-des-rois** → **Begin setup**.
3. Réglez **exactement** :

   | Champ | Valeur |
   |---|---|
   | Project name | `saveurs-des-rois` |
   | Production branch | `main` |
   | Framework preset | **None** |
   | Build command | *(laisser vide)* |
   | Build output directory | **`public`** |
   | Root directory | *(laisser vide)* |

4. **Save and Deploy**.

> ⚠️ Le champ **Build output directory = `public`** est indispensable. Sans lui, Cloudflare ne trouve pas le site et affiche « Page introuvable (404) ».

---

## Étape 5 — Relier la base de données au site

1. **Workers & Pages** → **saveurs-des-rois** → onglet **Settings** → **Bindings** → **+ Add**.
2. Choisissez **D1 database**.
3. **Variable name** : `DB` (en majuscules, exactement) — **D1 database** : `saveurs-des-rois` → **Save**.

Vous n'avez pas besoin du Database ID avec Pages, ni de modifier `wrangler.jsonc`.

---

## Étape 6 — Choisir le mot de passe de l'espace administrateur

1. **Settings** → **Variables and Secrets** → **+ Add**.
2. **Type** : **Secret** — **Variable name** : `ADMIN_PASSWORD` — **Value** : votre mot de passe (12 caractères minimum) → **Save**.

Puis **republiez** pour que la base et le mot de passe soient pris en compte :
onglet **Deployments** → sur la dernière ligne, menu **⋯** → **Retry deployment**.

✅ Le site est disponible sur `https://saveurs-des-rois.pages.dev`.

---

## Étape 7 — Vérifier

1. Ouvrez `https://saveurs-des-rois.pages.dev` : les 5 pâtisseries s'affichent.
2. Ouvrez la même adresse suivie de **`/admin`** et connectez-vous.
3. Envoyez-vous une demande de devis test depuis le site : elle apparaît dans l'onglet **Demandes** de l'admin.

**Le site est en ligne.**

---

## Étape 8 — Votre nom de domaine (facultatif)

**Workers & Pages → saveurs-des-rois → Custom domains → Set up a custom domain** → tapez votre domaine (ex. `saveursdesrois.fr`), puis recommencez avec `www.saveursdesrois.fr`.

- Domaine déjà chez Cloudflare : c'est immédiat, HTTPS compris.
- Domaine chez OVH, IONOS… : Cloudflare → **Add a domain** → offre **Free** → recopiez chez votre registraire les **deux serveurs de noms** indiqués. Une fois le domaine actif (quelques minutes à 24 h), faites la manipulation ci-dessus.
- Pas encore de domaine : Cloudflare → **Domain Registration → Register Domains**.

---

## Alertes de devis (e-mail et/ou WhatsApp)

À chaque demande de devis ou message, le site peut vous prévenir. Tout se règle dans le navigateur ; les deux services sont gratuits pour cet usage. Vous pouvez activer l'un, l'autre ou les deux.

### Par e-mail (service Resend)

1. Créez un compte gratuit sur **resend.com**, avec **l'adresse e-mail qui doit recevoir les alertes**.
2. Menu **API Keys → Create API Key** → nom : `saveurs-des-rois`, permission **Sending access** → **Add** → copiez la clé (elle commence par `re_`).
3. Cloudflare → **Workers et Pages → saveurs-des-rois → Paramètres → Variables et secrets → + Ajouter**, type **Secret** :

   | Nom | Valeur |
   |---|---|
   | `RESEND_API_KEY` | la clé copiée |
   | `ALERT_EMAIL` | l'adresse du compte Resend |

4. **Deployments** → dernier déploiement → **⋯ → Retry deployment**.

> Sans nom de domaine vérifié, Resend n'envoie qu'à l'adresse de votre compte : c'est exactement ce qu'il faut pour des alertes. L'e-mail contient la sélection, l'estimation et le message ; **« Répondre » écrit directement au client**.
> Quand vous aurez votre domaine : Resend → **Domains → Add Domain** (ajout automatique des DNS si le domaine est chez Cloudflare), puis ajoutez le secret `ALERT_FROM` = `Saveurs des Rois <devis@votredomaine.fr>`.

### Par WhatsApp (service CallMeBot)

1. Sur **callmebot.com**, rubrique *WhatsApp API*, notez le numéro du bot et la phrase d'activation indiqués.
2. Depuis votre WhatsApp, envoyez cette phrase à ce numéro : vous recevez en retour votre **apikey**.
3. Cloudflare → **Variables et secrets → + Ajouter**, type **Secret** :

   | Nom | Valeur |
   |---|---|
   | `CALLMEBOT_PHONE` | votre numéro au format international, ex. `33612345678` |
   | `CALLMEBOT_APIKEY` | l'apikey reçue |

4. **Retry deployment**.

### Vérifier

Admin → onglet **Alertes** : chaque canal affiche **● Actif** ou **○ Non configuré** (avec les étapes à suivre). Cliquez sur **Envoyer une alerte de test** : vous devez la recevoir dans la minute. En cas d'échec, le message précise quel service a refusé l'envoi.

> Si l'onglet Alertes n'apparaît pas ou affiche « Serveur du site pas à jour » : vérifiez sur GitHub que `public/_worker.js` et le dossier `public/admin` ont bien été remplacés, attendez la fin du déploiement, puis rechargez avec Ctrl + F5.

---

## Ajouter une nouvelle recette

Admin → **Produits → Ajouter une recette**, puis choisissez :
- **Fiche guidée vierge** : chaque champ affiche un exemple ; boutons pour les 14 allergènes réglementaires ; calcul automatique de l'énergie ;
- **Partir d'une fiche existante** : reprend prix, seuil, composition et valeurs nutritionnelles d'une autre recette.

Un aperçu de la carte et une liste « Prêt à publier ? » se mettent à jour pendant la saisie. La recette est créée **masquée** : cochez **Visible sur le site** quand tout est vert.

---

## Galerie « Vos événements » et avis clients

La page **Vos événements** (menu du site) réunit vos photos d'événements, les avis publiés et un formulaire « Laisser un avis ». Un aperçu apparaît automatiquement sur l'accueil dès qu'il y a une photo ou un avis.

**Ajouter une photo** : admin → **Galerie** → *Choisir une photo* (import depuis votre téléphone possible) → titre, occasion, légende → **Ajouter à la galerie**. Demandez toujours l'accord du client si des personnes ou un lieu privé sont visibles.

**Gérer les avis** : admin → **Avis** (le badge indique les avis en attente). *Publier*, *Refuser* ou répondre publiquement. Vous recevez une alerte pour chaque nouvel avis si les alertes sont configurées.

**Obtenir des avis** : dans **Demandes**, passez une commande en statut *confirmé* (ou *archivé*) : les liens **Demander un avis (WhatsApp / e-mail)** apparaissent, avec un message prêt à envoyer contenant le lien direct vers le formulaire.

**Avis reçus par message** : admin → **Avis** → *Ajouter un avis reçu par message* (avec l'accord du client) ; ils sont signalés comme tels sur le site.

> Règle à respecter (Code de la consommation) : le site indique que les avis sont modérés, leur date et leur ordre d'affichage. Ne publiez que des avis authentiques et ne retirez pas un avis uniquement parce qu'il est moins flatteur : répondez-y plutôt.

---

## Statistiques de visites

Admin → **Statistiques** : visites, pages vues, pâtisseries les plus consultées, ajouts au devis, demandes de devis, taux de transformation, provenance des visiteurs (Instagram, Google, accès direct…) et appareils. Mesure **anonyme, sans cookie** : aucun bandeau de consentement n'est nécessaire.

**Astuce** : pour savoir quelles publications vous amènent des visiteurs, partagez l'adresse du site en ajoutant `?utm_source=instagram` (ou `whatsapp`, `facebook`, `tiktok`…), par exemple :
`https://saveurs-des-rois.pages.dev/?utm_source=instagram`

**En complément (facultatif, 1 clic)** : Cloudflare → **Workers et Pages → saveurs-des-rois → Metrics** (*Métriques*) → **Web Analytics → Enable**. Vous obtenez aussi les pays, navigateurs et temps de chargement, toujours sans cookie.

---

## Au quotidien

| Je veux… | Où |
|---|---|
| Changer un prix, un texte, une photo, ajouter une vidéo, lire les demandes de devis | `https://votre-site/admin` — effet immédiat |
| Modifier le code ou le design | GitHub → ouvrir le fichier → ✏️ → *Commit changes* : le site se republie tout seul en 1 à 2 minutes |
| Remplacer un fichier (ex. la carte PDF) | GitHub → dossier `public/assets/docs` → **Add file → Upload files** → même nom de fichier → *Commit changes* |
| Changer le mot de passe admin | Cloudflare → saveurs-des-rois → Settings → Variables and Secrets → modifier `ADMIN_PASSWORD`, puis *Retry deployment* |
| Voir si une publication a réussi | Cloudflare → saveurs-des-rois → onglet **Deployments** |

---

## En cas de problème

| Symptôme | Solution |
|---|---|
| « Cette page est introuvable » / HTTP ERROR 404 sur `pages.dev` | **Settings → Build** → *Build output directory* = `public`, puis *Retry deployment*. |
| Le site affiche « Aperçu hors ligne » | La base n'est pas reliée : étape 5 (nom `DB` exact), puis *Retry deployment*. |
| L'admin affiche « Mot de passe non configuré » | Étape 6, puis *Retry deployment*. |
| « Alertes non configurées » alors que les secrets existent | Les secrets sont pris en compte au déploiement suivant : *Retry deployment*. |
| Le déploiement échoue | **Deployments** → cliquer sur le déploiement → lire le journal (*build log*). |
| Une modification n'apparaît pas | Attendre la fin du déploiement, puis Ctrl + F5. |

---

## Alternative : Cloudflare Workers au lieu de Pages

Le projet fonctionne aussi en Worker. **Workers & Pages → Create → Workers → Import a repository** ; *Deploy command* : `npm run deploy`. Il faut alors coller le **Database ID** de la base (visible dans la barre d'adresse de la page de la base, après `databases/`) dans `wrangler.jsonc` à la place de `REMPLACER-PAR-VOTRE-ID-D1`, et ajouter le secret `ADMIN_PASSWORD` dans *Settings → Variables and Secrets*.
