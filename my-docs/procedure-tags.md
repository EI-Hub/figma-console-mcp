# Procédure de tag — fork EI

## Pourquoi une convention séparée

Deux historiques de tags cohabitent : celui de l'amont `southleft/figma-console-mcp` et celui de ce fork
`EI-Hub/figma-console-mcp`. Les noms `vX.Y.Z` **ne désignent pas le même arbre des deux côtés**.

Constat vérifié le 2026-09-21 : le tag amont `v1.34.0` pointe sur `26b87b4`, qui est ici le commit de release
**v1.33.2**. Un `git fetch --tags` mélangerait les deux espaces de noms.

Deuxième raison, plus structurelle : un build de ce fork n'est jamais la release amont. C'est la version amont
**plus** la sanitisation (relay cloud supprimé) et le rangement `my-docs/` / `my-scripts/`. Lui donner le nom
`v1.34.0` laisserait croire à une parité qui n'existe pas.

## Convention de nommage

| Préfixe | Usage | Exemple |
|---|---|---|
| `ei/<version amont>` | nos builds sanitisés — **les seuls tags à créer** | `ei/v1.34.0` |
| `upstream/<version>` | tag amont récupéré pour une montée de version | `upstream/v1.40.4` |
| `vX.Y.Z` (nu) | historique hérité au moment du fork — ne jamais en créer de nouveau | `v1.29.0` |

## Créer et publier un tag

```bash
# 1. sur main, arbre propre, aligné avec origin
git switch main
git status --short                              # doit être vide
git rev-list --left-right --count origin/main...main   # doit afficher 0 0

# 2. le nom doit correspondre à la version de package.json
node -e "console.log(require('./package.json').version)"

# 3. tag annoté (tous les tags du dépôt le sont)
git tag -a ei/v<version> -m "ei/v<version> — build sanitisé local-only. Base amont v<version> (<résumé amont>) ; relay cloud supprimé, trafic limité à localhost:9223-9232 et api.figma.com."

# 4. publier ce tag seul, par son nom
git push origin ei/v<version>
```

`git push` seul ne pousse **que les branches** : sans l'étape 4 le tag reste sur le poste et n'apparaît pas sur
GitHub.

## Interdits

- **`git fetch upstream --tags`** (ou `git fetch --tags`) — ramène les tags amont dans le même espace de noms et
  entre en collision avec l'historique local. Toujours cibler un tag précis, dans le namespace `upstream/`, **et
  toujours avec `--no-tags`** : sans lui, git suit automatiquement les tags pointant dans l'historique récupéré
  (*tag auto-following*) et les ramène quand même — constaté le 2026-09-21, 24 tags amont importés :
  ```bash
  git fetch --no-tags upstream refs/tags/v1.40.4:refs/tags/upstream/v1.40.4
  ```
- **`git push --tags`** — pousserait les ~68 tags hérités et tout tag de travail local. Toujours pousser par nom.
- **Tag non annoté** (`git tag <nom>` sans `-a`) — perd auteur, date et message.

## Corriger un tag

- **Pas encore poussé** : `git tag -d <nom>` puis recréer. Gratuit, personne ne l'a vu.
- **Déjà poussé** : `git push origin --delete <nom>` puis `git tag -d <nom>`. À éviter — quiconque a fetché garde
  une copie périmée que rien ne met à jour. Préférer un nouveau nom.

## Vérifier

```bash
git tag -l 'ei/*'                        # nos tags en local
git ls-remote --tags origin | grep ei/   # ce qui est réellement publié
git tag -n1 -l ei/v1.34.0                # relire le message d'un tag
```

## Historique des tags EI

| Tag | Commit | Base amont | Date |
|---|---|---|---|
| `ei/v1.34.0` | `6082938` | v1.34.0 | 2026-09-21 |
