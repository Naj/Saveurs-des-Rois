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
3. Sur la page de la base, copiez le **Database ID** (une suite du type `8a1c3f2e-…`).

> Vous voulez réutiliser une base D1 existante ? Copiez simplement son Database ID et, à l'étape 4, remplacez aussi `"database_name": "saveurs-des-rois"` par son nom. Les tables du site s'ajoutent à côté de l'existant.

Vous n'avez **rien d'autre** à faire sur la base : le site crée ses tables et y place les 5 recettes tout seul, à la première visite.

---

## Étape 4 — Relier la base au projet (dans GitHub)

1. Dans votre dépôt GitHub, cliquez sur le fichier **`wrangler.jsonc`**.
2. Cliquez sur l'icône **crayon** (✏️ *Edit this file*).
3. Remplacez `REMPLACER-PAR-VOTRE-ID-D1` par le Database ID copié (gardez les guillemets) :
   ```
   "database_id": "8a1c3f2e-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
   ```
4. **Commit changes…** → **Commit changes**.

---

## Étape 5 — Connecter GitHub à Cloudflare (publication automatique)

1. Cloudflare → **Workers & Pages** → **Create** (ou *Create application*).
2. Onglet **Workers** → **Import a repository** (*Connect to Git*).
3. Cliquez **Connect GitHub**, autorisez Cloudflare, puis donnez-lui accès au dépôt **saveurs-des-rois** (*Only select repositories*).
4. Choisissez le dépôt **saveurs-des-rois** et réglez :

   | Champ | Valeur |
   |---|---|
   | Project name | `saveurs-des-rois` *(doit être identique au nom dans wrangler.jsonc)* |
   | Build command | *(laisser vide)* |
   | Deploy command | `npm run deploy` |
   | Root directory | *(laisser vide ou `/`)* |

5. **Save and Deploy** (ou *Create and deploy*).

Cloudflare installe tout lui-même sur ses serveurs, vérifie le projet puis publie. Comptez 1 à 2 minutes.

✅ Vérification : le déploiement passe au vert et une adresse s'affiche :
`https://saveurs-des-rois.<votre-compte>.workers.dev`

---

## Étape 6 — Choisir le mot de passe de l'espace administrateur

1. Cloudflare → **Workers & Pages** → **saveurs-des-rois** → onglet **Settings**.
2. Section **Variables and Secrets** → **+ Add**.
3. **Type** : **Secret** — **Variable name** : `ADMIN_PASSWORD` — **Value** : votre mot de passe (12 caractères minimum, unique).
4. **Deploy** (ou *Save*).

> Les secrets restent en place à chaque nouvelle publication.

---

## Étape 7 — Vérifier

1. Ouvrez `https://saveurs-des-rois.<votre-compte>.workers.dev` : les 5 pâtisseries s'affichent.
2. Ouvrez la même adresse suivie de **`/admin`** et connectez-vous.
3. Envoyez-vous une demande de devis test depuis le site : elle apparaît dans l'onglet **Demandes** de l'admin.

**Le site est en ligne.**

---

## Étape 8 — Votre nom de domaine (facultatif)

**Workers & Pages → saveurs-des-rois → Settings → Domains & Routes → + Add → Custom domain** → tapez votre domaine (ex. `saveursdesrois.fr`), puis recommencez avec `www.saveursdesrois.fr`.

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
| Changer le mot de passe admin | Cloudflare → saveurs-des-rois → Settings → Variables and Secrets → modifier `ADMIN_PASSWORD` |
| Voir si une publication a réussi | Cloudflare → saveurs-des-rois → onglet **Deployments** |

---

## En cas de problème

| Symptôme | Solution |
|---|---|
| Le déploiement échoue avec « database_id non renseigné » | Étape 4 : l'identifiant n'a pas été collé dans `wrangler.jsonc`. |
| Échec « Could not find package.json » | Les fichiers ont été déposés dans un sous-dossier : `package.json` doit être à la racine du dépôt (étape 2). |
| Échec mentionnant le nom du Worker | Le *Project name* (étape 5) doit être exactement `saveurs-des-rois`. |
| L'admin affiche « Mot de passe non configuré » | Étape 6, puis recharger la page. |
| Le site affiche « Aperçu hors ligne » | La base n'est pas reliée : vérifier le Database ID (étape 4). |
| Une modification n'apparaît pas | Attendre la fin du déploiement (onglet Deployments), puis Ctrl + F5. |

Pour voir les détails d'une erreur : Cloudflare → saveurs-des-rois → **Deployments** → cliquer sur le déploiement → **View build log**.
