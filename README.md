# LostBus

Application web mobile-first de gestion des objets perdus pour compagnies de bus et de transport en autocar.

## Fonctionnalités

- Recherche publique passager par catégorie, ligne et date.
- Aperçu photo flouté et demande de récupération.
- Connexion sécurisée conducteur et administrateur via Supabase Auth.
- Tableau de bord conducteur avec ajout d’objet, photo depuis caméra, statut et validation.
- Tableau de bord administrateur avec filtres, mise à jour de statut, suppression et suivi des demandes.
- Notifications toast, états vides, chargements et fenêtre de confirmation.

## Installation

```bash
npm install
cp .env.example .env
npm run dev
```

Renseignez ensuite dans `.env` :

```bash
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

## Supabase

1. Créez un projet Supabase.
2. Copiez le contenu de `supabase/schema.sql` dans l’éditeur SQL Supabase.
3. Lancez le script.
4. Créez les utilisateurs conducteur et administrateur dans Supabase Auth.
5. Pour créer un administrateur, ajoutez la métadonnée utilisateur `role: "admin"` avant la première connexion, ou modifiez la ligne correspondante dans `profiles`.

Le bucket `lost-item-photos` est créé par le script. Il est public afin que la recherche passager puisse afficher un aperçu flouté rapidement. Pour une confidentialité plus stricte, remplacez ce mode par des miniatures signées générées côté serveur.

## Déploiement

```bash
npm run build
```

Déployez le dossier `dist` sur Vercel, Netlify ou tout hébergeur statique compatible Vite.

## Architecture

```text
src/
  App.jsx              Interface, navigation et logique métier
  lib/
    constants.js       Catégories et statuts
    supabase.js        Client Supabase
  styles.css           Design responsive
supabase/
  schema.sql           Tables, RLS, vue publique et stockage
```
