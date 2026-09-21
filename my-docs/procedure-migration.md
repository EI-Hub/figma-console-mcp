# Procédure de montée de version amont

Comment intégrer une release de `southleft/figma-console-mcp` dans ce fork sans perdre la sanitisation.
Déroulé validé le 2026-09-21 sur la montée **v1.34.0 → v1.40.4** (42 commits amont).

## 0. Pré-requis — remote amont en lecture seule

```bash
git remote add upstream https://github.com/southleft/figma-console-mcp
git remote set-url --push upstream DISABLED    # interdit tout push accidentel vers southleft
```

## 1. Récupérer le tag amont — impérativement `--no-tags`

```bash
git fetch --no-tags upstream refs/tags/v<X.Y.Z>:refs/tags/upstream/v<X.Y.Z>
```

> **Piège vécu (2026-09-21)** : sans `--no-tags`, un refspec pourtant ciblé ramène quand même 24 tags amont, par
> *tag auto-following* (git suit les tags qui pointent dans l'historique récupéré). Parmi eux, le `v1.34.0` amont —
> qui pointe ici sur le commit de release **v1.33.2**.
>
> Nettoyage si ça arrive : comparer aux tags réellement publiés et supprimer les intrus.
> ```bash
> git ls-remote --tags origin | sed 's|.*refs/tags/||' | grep -v '\^{}' | sort -u > /tmp/origin_tags.txt
> git tag -l 'v*' | sort -u > /tmp/local_bare.txt
> comm -13 /tmp/origin_tags.txt /tmp/local_bare.txt | xargs -r git tag -d
> ```

## 2. Branche et fusion

```bash
git switch -c upgrade/v<X.Y.Z> main
git merge upstream/v<X.Y.Z>
```

Fusion, **jamais rebase** : un rebase rejouerait nos commits de sanitisation par-dessus chaque commit amont et
ferait résoudre les mêmes conflits des dizaines de fois.

## 3. Résoudre les conflits

Conflit attendu : `package.json`. Garder **notre** `"name": "@ei/figma-console-mcp"`, prendre **la version amont**,
vérifier que `ei-build-install` a survécu. Les fichiers sanitisés fusionnent en général tout seuls — ce n'est pas
une bonne nouvelle, voir l'étape suivante.

## 4. Audit complet du résultat fusionné — l'étape qu'on ne saute pas

Un conflit n'apparaît que là où **les deux côtés** ont touché les mêmes lignes. Tout le code amont nouveau
(6 versions mineures d'un coup) fusionne **silencieusement** : un nouveau `fetch`, un domaine ajouté à
l'allowlist, un hook d'install, un prompt d'outil qui suggère un MCP tiers ne déclencheraient aucun conflit.
L'audit porte donc sur l'arbre fusionné entier, pas sur les zones de conflit.

```bash
# allowlists du plugin : aucune entrée non-localhost
python -c "import json;m=json.load(open('figma-desktop-bridge/manifest.json'));n=m.get('networkAccess',{});print([d for d in n.get('allowedDomains',[])+n.get('devAllowedDomains',[]) if 'localhost' not in d] or 'NONE')"

# les trois verrous du plugin
grep -n "CLOUD_RELAY_HOST *=" figma-desktop-bridge/ui.html          # doit être ''
grep -n "if (!CLOUD_RELAY_HOST)" figma-desktop-bridge/ui.html       # garde en tête de cloudDial()
grep -n "deleteAsync('cloudConfig')" figma-desktop-bridge/code.js   # purge au lancement

# vecteur d'injection de prompt + exécution dynamique + hooks
grep -rn "design-systems-mcp" src/ ; grep -rnE "\beval\(|new Function\(" src/ --include=*.ts
node -e "const s=require('./package.json').scripts;console.log(s.preinstall,s.postinstall)"   # undefined undefined

# tous les points d'appel réseau de la surface du build local
grep -rnE "fetch\(|new WebSocket\(" src/ --include=*.ts \
  --exclude=index.ts --exclude=cloud-websocket-relay.ts --exclude=cloud-websocket-connector.ts --exclude=cloudflare.ts

# le worker Cloudflare reste hors build local
grep -n '"exclude"' tsconfig.local.json
```

Attendu (état vérifié en 1.40.4) : **deux** points d'appel réseau seulement — `src/core/figma-api.ts`
(`api.figma.com`) et `src/local.ts` (CDN images Figma). Les `southleft.com` restants sont des identifiants
`$schema` inertes, des commentaires, et `src/index.ts` que `tsconfig.local.json` exclut.

## 5. Preuve par le diff — notre delta doit rester minuscule

```bash
git diff upstream/v<X.Y.Z>..HEAD --stat
```

Doit ne lister **que** : `figma-desktop-bridge/{code.js,manifest.json,ui.html}`, `src/local.ts`, `package.json`,
`.gitignore`, `CLAUDE.local.md`, `my-docs/**`, `my-scripts/**`. Tout autre fichier signale une modification
non intentionnelle. En v1.40.4 : 10 fichiers, +290/-41.

> À lancer **après** avoir commité la fusion : tant qu'elle n'est pas commitée, `HEAD` est encore l'ancien
> sommet et le diff se lit à l'envers.

## 6. Dépendances, build, tests

```bash
git diff main...HEAD -- package.json | grep -E '^[+-]\s*"'   # deps modifiées ?
npm install        # seulement si oui — le Nexus est VPN-only, cf. my-scripts/ei-install.mjs
npm run build:local
npm test
```

> `tests/accessibility-tools.test.ts` peut échouer *à démarrer* sous le runner parallèle
> (`Converting circular structure to JSON` dans jest-worker). Rejouer seul pour trancher :
> `npx jest tests/accessibility-tools.test.ts --runInBand` — 45/45 en 1.40.4. C'est un artefact d'IPC du runner,
> pas une régression.

## 7. Déployer en local et vérifier l'artefact installé

```bash
npm run ei-build-install
which figma-console-mcp && npm ls -g @ei/figma-console-mcp
```

Vérifier que c'est bien le plugin sanitisé **qui est installé**, pas seulement celui du checkout :

```bash
node -e "const fs=require('fs'),p=require('path');const b='C:/Program Files/nodejs/node_modules/@ei/figma-console-mcp';const n=JSON.parse(fs.readFileSync(p.join(b,'figma-desktop-bridge','manifest.json'),'utf8')).networkAccess||{};console.log([...(n.allowedDomains||[]),...(n.devAllowedDomains||[])].filter(d=>!d.includes('localhost')) .length?'ALERTE':'NONE')"
```

**Puis recharger le plugin dans Figma Desktop** (Plugins → Development → ré-importer `manifest.json`) : un plugin
déjà chargé garde son ancienne allowlist.

## 8. Clôturer

1. Mettre à jour `my-docs/SANITIZED-PLAN-figma-console-mcp.md` (version auditée, nouveaux constats).
2. Fusionner la branche dans `main`.
3. Taguer selon `my-docs/procedure-tags.md` : `ei/v<X.Y.Z>`, annoté, poussé par son nom, + ligne dans le tableau
   d'historique.
4. Consigner toute surprise dans le registre des observations.

> Bénéfice collatéral du namespace `ei/` : le workflow amont `.github/workflows/publish.yml` se déclenche sur
> `push: tags: 'v*'`. Un tag `ei/v1.40.4` ne matche pas ce motif et ne déclenchera donc jamais de tentative de
> publication npm depuis notre fork. Ne jamais pousser de tag `vX.Y.Z` nu sur `origin`.

## Historique des montées

| Date | De → vers | Conflits | Delta après fusion | Notes |
|---|---|---|---|---|
| 2026-09-21 | v1.34.0 → v1.40.4 | `package.json` seul | 10 fichiers, +290/-41 | 42 commits amont ; aucune dépendance modifiée ; piège du tag auto-following rencontré |
