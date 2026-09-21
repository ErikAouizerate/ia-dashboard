# Protocole d'A/B testing des configurations agentiques

Ce document décrit comment comparer des configurations d'agent (profils OpenCode,
plugins, skills, modèles) avec des résultats exploitables. Il répond au constat
suivant : le premier A/B (2026-09-21, profils `default`, `default-full`,
`default-full-without-rtk`, `default-full-without-caveman`,
`default-full-without-ponytail`) était sous-dimensionné et bruité.

## Ce qui invalide un test

- **n = 1 par bras.** La variance intra-config dépasse l'écart inter-configs :
  `default-full` lancé deux fois sur la même tâche donne 0.0282 vs 0.0215 € de coût
  (+31 %) et 8 min vs 3 min de durée (×2.7).
- **Ordre séquentiel non contrôlé.** Le prompt caching fait varier `cacheRead` d'un
  facteur > 2 ; les runs tardifs bénéficient d'un cache chaud.
- **Tâche non gelée.** Les diffs produits divergent structurellement
  (`modelFilter.ts` vs `modelVisibility.ts`) : ce n'est plus la même expérience.
- **Métrique primaire absente.** Aucun test d'acceptation déterministe : « l'agent a
  commité » ne dit pas si la tâche est réussie.
- **Métriques confondues.** `cacheRead` domine le volume de tokens mais coûte peu ;
  lire le coût comme un proxy des tokens d'entrée est trompeur.

## Protocole

1. **Geler la base.** Un commit de base unique, une seule branche par run, aucune
   modification du repo entre les runs.
2. **Geler la tâche.** Un prompt identique, un test d'acceptation déterministe
   (ex. `pnpm test` ciblé, un `assert`). Le pass/fail est la métrique primaire.
3. **n ≥ 5 par bras.** Session fraîche à chaque run (pas de contexte réutilisé).
4. **Randomiser / entrelacer l'ordre.** Éviter que tous les runs d'un bras soient
   consécutifs.
5. **Relever par run** : pass/fail, coût, `tokensOutput + tokensReasoning`,
   nombre d'appels d'outils, nombre d'itérations, durée murale.
6. **Rapporter médiane + IQR**, jamais la moyenne seule. Afficher `N` et la
   dispersion ; un bras à n = 1 ne conclut rien.
7. **Isoler la variable cible.** Exemples : RTK se teste sur une tâche à fort volume
   de sortie de commande (build, logs) ; ponytail sur des tâches de conception de
   code (mesure : taille/complexité du diff) ; caveman sur des tâches à forte sortie
   en prose.

## Lecture dans le dashboard

La vue `/configs` expose, par config :

- `N` (nombre de sessions),
- coût médian et intervalle p25–p75,
- tokens de sortie médians,
- durée médiane,
- la liste générique des **plugins** et **skills** de la config.

La vue `/configs/:id` ajoute la distribution par session (durée, tokens de sortie,
coût) et le détail min–max.

Un `configId` est un **fingerprint** du contenu de config, insensible à l'ordre des
plugins/MCP/skills : deux captures de la même config avec des plugins réordonnés
fusionnent en une seule ligne (`configIds` liste les identifiants bruts fusionnés).

## Limites connues

- La durée est un proxy (`timeUpdated - timeCreated`) : pas de champ durée natif,
  et la latence humaine/outils est incluse.
- Le coût est fourni par le provider ; sur un modèle très bon marché, l'effet
  cherché peut être du même ordre que le bruit d'arrondi.
- `offeredTools` est identique entre ces profils : la variable mesurée est le
  comportement des plugins (system prompt), pas l'ensemble d'outils offerts.
