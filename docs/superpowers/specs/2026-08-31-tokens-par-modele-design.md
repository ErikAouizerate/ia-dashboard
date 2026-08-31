# Design — Tokens par modèle sur le dashboard

Date : 2026-08-31

## Objectif

Ajouter un graphique sur le dashboard exprimant l'usage par modèle en tokens,
avec une décomposition entrée (input) / sortie (output) par modèle.

## Contexte

- L'API renvoie déjà `tokensInput` et `tokensOutput` par modèle via
  `OpenCodeReader.aggregateByModel` (`api/src/opencode/opencode-reader.ts`) et les
  transmet telles quelles dans `summary.byModel`
  (`api/src/dashboard/dashboard.service.ts`). **Aucun changement API nécessaire.**
- La webapp ne conserve que `model`, `totalCost`, `sessions` pour `byModel`
  (`webapp/src/store/dashboard.ts`).
- `BarList` (`webapp/src/components/ui/BarList.tsx`) formate la valeur en dur
  (`toFixed(2)` + suffixe `€`), inadapté aux tokens (entiers, `toLocaleString`).

## Approche retenue

Généraliser `BarList` puis l'utiliser pour une nouvelle carte.

### Changements

1. **Store** (`webapp/src/store/dashboard.ts`) — ajouter `tokensInput: number` et
   `tokensOutput: number` au type d'élément `byModel`.
2. **BarList** (`webapp/src/components/ui/BarList.tsx`) — ajouter deux props
   optionnelles :
   - `formatValue?: (n: number) => string` (défaut : `(n) => n.toFixed(2)`, comportement
     actuel inchangé) ;
   - `stack?: { segments: Array<{ valueOf: (r: any) => number; className: string }> }`
     pour les barres empilées (segment input + output par modèle).
   Les props `rows`, `valueOf`, `labelOf`, `to`, `valueSuffix` restent tels quels.
3. **DashboardView** (`webapp/src/views/DashboardView.tsx`) — nouvelle carte
   **« Tokens par modèle »** dans la rangée `lg:grid-cols-2`, à côté de
   « Coût par modèle » :
   - une barre empilée par modèle (input en `bg-blue-500`, output en une teinte
     secondaire, ex. `bg-emerald-400`) ;
   - le libellé = modèle ;
   - la valeur affichée = total de tokens du modèle, formatée avec
     `toLocaleString()`.
4. **Tests** (`webapp/src/views/DashboardView.spec.tsx`) — étendre le fixture
   `summary.byModel` avec `tokensInput`/`tokensOutput` et asserter que la carte
   « Tokens par modèle » rend le modèle et son total de tokens.

### Non-modifié

- API (déjà fournie).
- Gestion d'erreur et sélecteur de période (7/30 jours) : inchangés, mêmes flux.
- BarList par défaut : le rendu de « Coût par modèle » et « Coût par projet »
  reste identique.

## Hors périmètre

- Pas de nouvelle dépendance de graphique (recharts, etc.).
- Pas de graphique tokens par projet ni par jour.