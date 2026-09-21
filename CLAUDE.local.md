# Consignes locales

> Ce fichier complète le `CLAUDE.md` du dépôt.

## Registre des observations

Toute observation surprenante expliquée pendant le travail (comportement d'un outil, d'un build, d'un test, d'une stack,
contournement trouvé) s'ajoute **en fin de tableau** dans `.claude/docs/ledger-observations.md` : date ISO, fait constaté,
cause vérifiée et parade. Jamais de suppression ni de réécriture : une explication erronée se corrige par une nouvelle ligne.
Le registre complète la mémoire, il ne la remplace pas : l'inscrire dans les deux.

## Sanitisation obligatoire à chaque montée de version

Ce dépôt est un fork de `southleft/figma-console-mcp`. **Aucune version fusionnée depuis l'amont ne part en déploiement
sans une passe de sanitisation.** Règle de fond : le serveur et le plugin ne parlent qu'à `localhost` (ports 9223–9232)
et à `api.figma.com`. Aucune requête sortante, aucune écoute entrante vers quoi que ce soit d'autre que ce poste.

À chaque merge amont, vérifier au minimum :

- `figma-desktop-bridge/manifest.json` — `allowedDomains` et `devAllowedDomains` ne contiennent que `localhost` /
  `ws://localhost:9223`→`9232`. Tout domaine distant réintroduit est bloquant (c'est la garantie la plus forte :
  Figma lui-même refuse la connexion au niveau du sandbox).
- `figma-desktop-bridge/ui.html` — `CLOUD_RELAY_HOST` reste vide, le garde-fou de `cloudDial()` est en place,
  `CLOUD_CONFIG_RESTORED` ne redéclenche aucune connexion.
- `figma-desktop-bridge/code.js` — `STORE_CLOUD_CONFIG` reste un no-op et le `cloudConfig` de `clientStorage` est
  toujours supprimé au lancement (aucun identifiant d'appairage ne survit).
- `src/local.ts` — aucune suggestion d'installer un MCP tiers dans les prompts d'outils (vecteur d'injection).
- `package.json` — aucun hook `preinstall` / `postinstall`.
- Code nouveau ou modifié — pas de télémétrie, pas de `eval` / `new Function`, pas de chargement distant,
  aucun `fetch`/WebSocket vers un hôte hors de la liste ci-dessus.

L'audit initial, les correctifs et ce qui a été laissé volontairement en l'état sont dans
`my-docs/SANITIZED-PLAN-figma-console-mcp.md` : le mettre à jour à chaque passe (version auditée, nouveaux constats),
et consigner toute surprise dans le registre des observations.

## Déploiement

Une seule voie : `npm run ei-build-install` (`my-scripts/ei-install.mjs`) — build local + apps, `npm pack`, puis
installation globale du tarball `@ei/figma-console-mcp`. Jamais d'installation manuelle à côté.

- Jamais `npx figma-console-mcp` ni `npm i -g figma-console-mcp` : cela récupère l'amont **non sanitisé** depuis le
  registre public.
- Jamais `npm i -g .` : un install par dossier crée un lien symbolique vers le working tree, le tarball donne une
  copie figée et indépendante du checkout.
- Déployer uniquement depuis la branche `sanitized`, après la vérification ci-dessus et avec les tests au vert.
- La config MCP pointe sur la commande globale `figma-console-mcp` (ou sur le `dist/local.js` du build local),
  jamais sur un endpoint hébergé.

## Tags et versions

Les tags de ce fork se nomment **`ei/<version amont>`** (ex. `ei/v1.34.0`), jamais `vX.Y.Z` nu : le même nom existe
en amont et pointe sur un autre commit (le `v1.34.0` amont vise ici la release v1.33.2). Toujours des tags annotés
(`git tag -a`), créés sur `main` avec un arbre propre, et poussés **un par un** (`git push origin ei/v1.34.0`) —
`git push` seul ne pousse que les branches.

Jamais `--tags`, ni en fetch ni en push : un tag amont se récupère nommément dans son propre namespace
(`git fetch --no-tags upstream refs/tags/v1.40.4:refs/tags/upstream/v1.40.4`).

Procédure complète, interdits et historique des tags : `my-docs/procedure-tags.md` — le tableau d'historique se
complète à chaque nouveau tag.

## Montée de version amont

Toute release de `southleft/figma-console-mcp` s'intègre par **fusion sur une branche `upgrade/vX.Y.Z`**, jamais
par rebase, et jamais directement sur `main`. Le tag amont se récupère avec `--no-tags` dans le namespace
`upstream/` (cf. la section précédente).

Règle qui prime sur tout le reste : **résoudre les conflits ne sanitise rien.** Un conflit n'apparaît que là où les
deux côtés ont touché les mêmes lignes ; tout le code amont nouveau fusionne en silence, y compris un éventuel
nouveau `fetch`, domaine d'allowlist, hook d'install ou prompt d'outil. L'audit de la section « Sanitisation
obligatoire » porte donc sur **l'arbre fusionné entier**, après la fusion, et se termine par la preuve par le
diff : `git diff upstream/vX.Y.Z..HEAD --stat` ne doit lister que nos fichiers connus.

Ensuite seulement : build, tests, `npm run ei-build-install`, vérification de l'artefact **installé** (et non du
checkout), rechargement du plugin dans Figma Desktop, mise à jour du SANITIZED-PLAN, fusion dans `main` et tag.

Procédure détaillée, commandes d'audit, pièges rencontrés et historique des montées :
`my-docs/procedure-migration.md` — compléter son tableau à chaque montée.
