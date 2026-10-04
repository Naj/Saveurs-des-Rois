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
| Le déploiement échoue | **Deployments** → cliquer sur le déploiement → lire le journal (*build log*). |
| Une modification n'apparaît pas | Attendre la fin du déploiement, puis Ctrl + F5. |

---

## Alternative : Cloudflare Workers au lieu de Pages

Le projet fonctionne aussi en Worker. **Workers & Pages → Create → Workers → Import a repository** ; *Deploy command* : `npm run deploy`. Il faut alors coller le **Database ID** de la base (visible dans la barre d'adresse de la page de la base, après `databases/`) dans `wrangler.jsonc` à la place de `REMPLACER-PAR-VOTRE-ID-D1`, et ajouter le secret `ADMIN_PASSWORD` dans *Settings → Variables and Secrets*.
