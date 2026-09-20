# INSTRUCTIONS — features à implémenter (décisions validées)

Statut : **décisions prises**, implémentation à faire plus tard.
Ce document sert de base au plan d'implémentation.

## Demandes brutes

- enleve l'idée de feature, je ne travail que sur les sessions en vrai. donc enleve aussi le concept d'analyse, de status, d'annotate et de link
- mettre le fitre tout par defaut sur le dashboard
- rajouter la legende des modele utilisé
- ajouter une entrée dans le menu : "config" qui liste les config utilisé
- quand on clique sur un projet, on vois la liste des sessions, les features ne sont plus affiché. aussi, on voit le découpage par config.
- sur la liste des sessions, affiche la source (vm ou host)
- dans la liste des sessions, ajoute une colonne config qui est lien vers la config.
- dans la liste des sessions, la pagination ne fonctionne pas
- pour chaque session, ajoute une page de détail et montre la config, model, token etc + quel outils on été utilisé et combien de fois
- dans le dashboard, rajoute un cout moyen des token par modeles. et à coté subdivise aussi par config (et par modele)

## Regroupement

| Groupe | Demandes | Nature | Dépend de |
|---|---|---|---|
| A. Suppression du modèle "feature" | feature/analyse/status/annotate/link | Refonte + migration DB | — |
| B. Entité "config" (socle) | menu config, colonne config, découpage config, détail session, coût par config | Nouveau backend + pages | indépendant |
| C. Dashboard | filtre Tout par défaut, légende modèles, coût moyen tokens par modèle/config | UI + API | B |
| D. Liste des sessions | source vm/host, colonne config, pagination | UI + API | B |
| E. Page projet | sessions au lieu des features + découpage config | UI | A, B |
| F. Page détail session | config, modèle, tokens, outils + fréquence | Nouvelle page | B |

Ordre proposé : **A → B → (C, D, E, F)**.

---

## Décisions validées

### A. Suppression du concept "feature"

- **A1 — Suppression complète** : drop des tables Postgres `session_analyses`, `feature_proposals`, `features`, `feature_sessions` (+ enums `analysis_status`, `proposal_status`) via migration, suppression des modules `api/src/analysis/*` et `api/src/features/*` et du worker LLM. Pas de code mort.
- **A2 — « status »** : retrait explicite du statut d'analyse **et** du statut des propositions (`proposal_status`).
- **A3 — « Comparer » est conservé** (comparaison A/B de sessions, indépendante des features).
- **A4 — Perte des snapshots `feature_sessions` acceptée** (pas d'archivage).
- **A5 — Menu final** : Dashboard / Sessions / Projets / Config / Comparer.

### B. Entité "config"

- **B1 — Identité** : le **profil** (lisible) est le nom affiché, le **configId** en information secondaire.
- **B2 — Sessions sans config** : bucket explicite **« sans config »** dans les vues/agrégats par config (les totaux restent justes).
- **B3 — Menu Config** : **liste + page détail** (détail = config JSON et sessions associées).
- **B4 — Fusion par `configId`**, toutes sources confondues.
- **B5 — Dérivation à la volée** depuis les sidecars (`configs.json` / `captures.jsonl`), **aucune nouvelle table** ni migration.

Rappel technique : les captures ne sont chargées que pour les sources VM (`MultiSourceReader.refresh()` → `loadCaptures`), la source `host` n'a pas de config. `config` est déjà calculé par `SessionsService.profile()`. Il manque un **endpoint de listing des configs** et des **agrégats par config**.

### C. Dashboard

- **C1** — Défaut **« Tout »** à chaque ouverture, **non mémorisé**.
- **C2** — **Légende globale unique** (modèle → couleur) pour tout le dashboard.
- **C3** — « Coût moyen des tokens » = **coût / 1M tokens, input + output combinés**.
- **C4** — **Deux graphes** : un par config (segments = modèles) + un par modèle.
- **C5** — KPI « Analysées / Features » : **simple retrait** (grille 5 → 4 KPIs).

### D. Liste des sessions

- **D1** — Source affichée au format **`host` / `vm:<gen>` complet**.
- **D2** — Colonne config : **profil** cliquable → **page détail config**.
- **D3** — Pagination **Précédent / Suivant**, **taille 50**, **en mémoire** (pas d'URL).
- **D4** — Filtres : **garder « Cacher subagents », ajouter filtres source et config, retirer le filtre analyse**.

Bug à corriger : `SESSIONS_LOAD_SUCCESS` (`store/sessions.ts:54`) ne met à jour ni `page` ni `pageSize`, aucun contrôle de page n'existe (page figée à 1). Le backend pagine correctement (`multi-source-reader.ts:224`).

### E. Page projet

- **E1** — **Page projet dédiée** : en-tête, KPIs, tableau sessions, découpage config.
- **E2** — Découpage par config : **table ET barres empilées**.
- **E3** — KPIs projet : **Coût, Sessions, Tokens, Durée, Configs** (Features et « Non groupées » retirés).

### F. Page détail session

- **F1** — **Nouvel endpoint `GET /api/sessions/:id/profile`** réutilisant la logique `profile()` existante.
- **F2 — Sections retenues** :
  - Totaux (coût, tokens in/out/reasoning/cache)
  - Tableau par modèle
  - Tableau outils + fréquence (nom, nb appels, succès/erreurs)
  - Config (agents/mcp/plugins/skills)
  - Arbre subagents
  - Liste des LLM calls
- **F3** — Accès depuis la liste : **titre cliquable**.
- **F4** — Config : **vue résumée + JSON repliable**.

---

## Prochaines étapes

1. Écrire le plan d'implémentation (skill `writing-plans`).
2. Implémenter dans l'ordre A → B → C/D/E/F.

### Impact transverse à ne pas oublier

- README et AGENTS évoquent l'annotation comme raison d'être du projet → à réécrire.
- `ProjectsService.findOne` renvoie encore `features`/`proposals`/`ungroupedSessions` → à nettoyer.
- `DashboardSummary` (webapp) et `DashboardView` référencent `analysedCount`/`featureCount` → à retirer.
- `SessionsService` : retirer `annotatedMap`, `analysisMap`, `analysisFor`, filtres `annotated`/`analysed`, et les champs `annotated`/`featureId`/`analysedStatus`.
- Exposer `source` dans `SessionRow` (webapp) et la colonne config (profil).
