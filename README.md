# Atelier SAV — Groupe Nivault

Application interne des magasins : tickets de réparation (SAV), commandes clients,
transferts de vélos entre magasins, flocage, commandes OBUT, opérations commerciales,
planning RH et espace B2B.

**Stack** : React 18 · Vite 8 · Tailwind CSS 3 · Zustand · React Router 7 · Firebase (Auth + Firestore)

---

## Démarrage

Prérequis : Node.js ≥ 20.19 (voir `.nvmrc`), et pour les émulateurs :
[Firebase CLI](https://firebase.google.com/docs/cli) + Java 21.

```bash
npm install
cp .env.example .env   # puis renseigner la config Firebase
npm run dev
```

### Travailler en local sans toucher à la production

```bash
npm run emulators      # terminal 1 : émulateurs Auth + Firestore (UI sur http://localhost:4000)
npm run dev:emulator   # terminal 2 : l'app pointe sur les émulateurs (.env.emulator)
```

Les données locales sont sauvegardées dans `emulator-data/` (ignoré par git).
Des jeux de données de test sont disponibles dans `scripts/seed-*.mjs`.

## Scripts

| Commande | Rôle |
|---|---|
| `npm run dev` | Serveur de développement (Firebase de production, via `.env`) |
| `npm run dev:emulator` | Serveur de développement branché sur les émulateurs |
| `npm run build` | Build de production dans `dist/` |
| `npm run lint` | ESLint |
| `npm run emulators` | Lance les émulateurs Firebase avec import/export de `emulator-data/` |
| `npm run test:rules` | Tests des règles de sécurité Firestore (émulateur) |
| `npm run deploy:rules` | Déploie `firestore.rules` en production |

## Rôles

Chaque utilisateur a un document `users/{uid}` (`role`, `magasinId`, `isActive`, …).

| Rôle | Périmètre |
|---|---|
| `directeurgen` | Tous les magasins, gestion de tous les comptes |
| `acheteur` | Tous les magasins (filtré par `rayons`), gestion des comptes rayon |
| `directeurmag` | Son magasin, gestion de ses rayons et comptes rayon |
| `velo`, `chaussure`, `textile`, `randonnee`, `caisse` | Compte partagé d'un rayon de son magasin |

Passer `isActive` à `false` coupe immédiatement tous les accès d'un compte.

## Sécurité

Toutes les autorisations sont appliquées côté serveur par [`firestore.rules`](firestore.rules) :
les contrôles faits dans l'interface ne servent qu'à l'affichage.

- Toute modification des règles doit être accompagnée d'un test dans
  [`tests/firestore.rules.test.mjs`](tests/firestore.rules.test.mjs) (`npm run test:rules`).
- Les identifiants B2B sont stockés dans `b2b_tools/{id}/credentials/{magasinId}` :
  un magasin ne peut lire que les siens.
- Ne jamais commiter de `.env` ni de clé de compte de service (`service-account*.json`).

## Structure

```
src/
  pages/        une page par route (chargée à la demande)
  components/   composants partagés (Navbar, calendrier, tickets…)
  lib/          Firebase, compteurs, import Excel, helpers de sécurité
  store/        stores Zustand (auth, magasin sélectionné, thème)
scripts/        seeds pour l'émulateur et migrations ponctuelles
tests/          tests des règles Firestore
```

## CI

GitHub Actions ([`.github/workflows/ci.yml`](.github/workflows/ci.yml)) exécute à chaque push et PR :
lint, build, audit des dépendances et tests des règles Firestore.
Dependabot propose chaque semaine les mises à jour de dépendances.
