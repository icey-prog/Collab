# KAIROS — Débogage Production : Méthodologie et Pièges de Déploiement

**Projet** : Collab MVP (Vercel + Coolify/Docker)
**Thème** : bugs qui n'existent QU'en production, méthodologie de diagnostic par preuve

8 concepts en analogies Feynman. Matériel d'apprentissage Kairos.

---

## #1 — Le fix validé "sur le fichier" mais jamais vérifié en prod réelle

**Analogie**
Un architecte qui valide des plans sur papier ("la porte fait bien 90cm, ça devrait passer") sans jamais aller vérifier que la porte réellement construite fait bien 90cm. Le plan avait raison. Le chantier a dévié.

**Contexte**
Un premier fix du 404 avait ajouté `cleanUrls: true` + des rewrites ciblés dans `vercel.json`, validé en relisant la config. Le bug a persisté en prod. Cause réelle : `cleanUrls: true` masquait `/index.html` derrière une redirection 308 — la destination des rewrites ne résolvait donc plus rien, malgré des rewrites syntaxiquement corrects.

**Ce qui a permis de le trouver**
```bash
curl -sI -o /dev/null -w "status=%{http_code} redirect=%{redirect_url}\n" \
  "https://collab-one-lac.vercel.app/index.html"
# → status=308 redirect=https://collab-one-lac.vercel.app/
```
Un simple `curl` sur la PROD RÉELLE a révélé en une commande ce que la relecture du fichier n'avait pas montré.

**Concept**
*Vérification sur le système réel vs sur l'artefact source*. La configuration Vercel a des comportements (redirections implicites de `cleanUrls`) qui n'apparaissent qu'à l'exécution, pas à la lecture du JSON.

**Leçon**
Un fix de configuration de déploiement (Vercel, Nginx, DNS) N'EST PAS validé tant qu'il n'a pas été testé contre l'environnement réel déployé — jamais seulement contre sa représentation locale.

---

## #2 — Le domaine gelé sur un vieux déploiement : la promotion suspendue

**Analogie**
Un ascenseur configuré pour s'arrêter automatiquement au dernier étage visité — sauf que quelqu'un a un jour appuyé sur "stop d'urgence" à un étage précédent, et depuis, l'ascenseur ne bouge plus tout seul, même si de nouveaux étages sont construits au-dessus.

**Contexte**
Après plusieurs commits et déploiements "READY" sur Vercel, le domaine stable `collab-one-lac.vercel.app` continuait de servir un déploiement vieux de **6 commits**. Diagnostic via l'API Vercel (`get_deployment`) : le domaine était toujours aliasé sur `dpl_BaguQ1...`, alors que des déploiements bien plus récents existaient et étaient marqués `READY`.

**Cause**
Un rollback manuel avait été fait à un moment (probablement pour stopper un bug visible), ce qui **suspend l'auto-promotion** : Vercel n'aliasera plus automatiquement les nouveaux déploiements sur le domaine de prod tant qu'on n'a pas explicitement re-promu un déploiement.

**Fix**
Action manuelle : Dashboard Vercel → Deployments → déploiement le plus récent → **Promote to Production**.

**Concept**
*État caché dans la plateforme de déploiement, invisible depuis le code source*. Rien dans le repo Git n'indique qu'un rollback a eu lieu — seule l'API/dashboard de la plateforme le révèle.

**Leçon**
Quand un déploiement "READY" ne se reflète pas en prod malgré un push réussi, vérifier l'état de PROMOTION (pas juste l'état de BUILD) via l'outil de la plateforme elle-même.

---

## #3 — DuckDNS bloqué par les adblockers : bloqué par association, pas par comportement

**Analogie**
Un videur de boîte qui refuse l'entrée à quelqu'un simplement parce qu'il porte le même type de veste qu'un groupe de fauteurs de troubles historiques — sans jamais vérifier qui est réellement la personne.

**Contexte**
`collab-backend.duckdns.org` — bloqué par certaines listes de filtrage d'adblockers (ex. "Badware risks" d'uBlock Origin). DuckDNS est un service de DNS dynamique **gratuit**, historiquement très utilisé pour du C2 malware / phishing / spam — beaucoup de listes bloquent `*.duckdns.org` en entier, indépendamment du contenu réel hébergé.

**Concept**
*Réputation de domaine par catégorie, pas par contenu*. Un sous-domaine parfaitement légitime hérite de la mauvaise réputation collective de son domaine parent.

**Fix**
Pas de correctif côté code possible — migration vers un vrai nom de domaine (`.app`, `.bf`) plutôt qu'un service de DNS dynamique gratuit pour la prod.

**Leçon**
Le choix d'infrastructure (nom de domaine, hébergeur) a des conséquences invisibles tant qu'on ne teste pas avec les outils que les vrais utilisateurs utilisent (adblockers, navigateurs avec filtres de sécurité activés par défaut).

---

## #4 — QR code qui pointe vers l'API au lieu du site

**Analogie**
Un panneau routier "Restaurant →" qui, en fait, pointe vers les cuisines et l'entrepôt (le back-office), pas vers la salle où les clients doivent s'asseoir. Techniquement "le restaurant" existe à cette adresse — mais ce n'est pas ce que le client cherchait à atteindre.

**Code (le bug)**
```ts
export async function getSharableBase(): Promise<string> {
  return (
    import.meta.env.VITE_PUBLIC_URL ||
    import.meta.env.VITE_API_URL ||     // ← le BACKEND, jamais un lien à partager
    window.location.origin
  );
}
```
`VITE_API_URL` pointe vers `https://collab-backend.duckdns.org` (le serveur API). Un QR généré avec cette base ouvrait, dans un navigateur, la réponse JSON brute de l'API — pas l'application.

**Fix**
```ts
export async function getSharableBase(): Promise<string> {
  return import.meta.env.VITE_PUBLIC_URL || window.location.origin;
}
```
Retirer `VITE_API_URL` du calcul — un lien de partage doit TOUJOURS pointer vers le frontend (là où l'utilisateur ouvre une page dans un navigateur), jamais vers une API.

**Concept**
*Confusion entre deux URLs de base qui se ressemblent dans le code mais servent des publics totalement différents*. `VITE_API_URL` = destination pour du code (fetch, XHR). Le lien de partage = destination pour un humain avec un navigateur.

**Leçon**
Quand une fonction construit une URL "à partager" ou "à afficher à un humain", auditer TOUTES les variables d'environnement utilisées dans son fallback chain — un fallback vers une URL technique interne est presque toujours une erreur.

---

## #5 — Reproduire avant de corriger : le `curl` qui confirme l'hypothèse

**Analogie**
Un médecin qui prescrit un traitement sans avoir d'abord confirmé le diagnostic par un examen — il se peut que le traitement soit inutile, ou pire, traite le mauvais problème.

**Méthodologie appliquée systématiquement dans cette phase**
Avant chaque fix de bug "signalé par l'utilisateur mais pas encore vu", reproduction directe :
```bash
curl -s --ssl-no-revoke -o /dev/null -w "status=%{http_code}\n" "https://.../route-suspecte"
```
Cela a évité au moins deux fois de corriger le mauvais fichier ou la mauvaise hypothèse — notamment en révélant que le 404 signalé n'était PAS dû à des rewrites manquants (déjà présents) mais à `cleanUrls` qui les rendait inopérants.

**Concept**
*Investigation empirique avant modification*. Un bug en production a une cause RÉELLE et unique — deviner puis corriger "au jugé" risque de masquer le symptôme sans toucher la cause, ou pire, d'introduire un nouveau bug sur un système qui n'était pas fautif.

**Leçon**
Pour tout bug de production, reproduire d'abord avec l'outil le plus simple possible (`curl`, `ping`, logs bruts) avant d'ouvrir un seul fichier de code — la reproduction oriente le diagnostic, elle ne le remplace jamais, mais elle l'empêche de partir dans la mauvaise direction.

---

## #6 — Windows + SSL : `curl` qui échoue localement sur un problème qui n'existe pas en vrai

**Analogie**
Un détecteur de fumée d'appartement qui sonne à cause de la vapeur de la douche — un vrai signal (de la vapeur existe), mais qui ne signifie PAS ce que l'alarme prétend signaler (un incendie).

**Contexte**
`curl` sous Windows échouait avec exit code 35 (erreur SSL) sur des requêtes vers des domaines HTTPS parfaitement valides — un problème de vérification de révocation de certificat (`schannel`) propre à l'environnement Windows, pas un vrai problème réseau/SSL du serveur distant.

**Fix**
```bash
curl -s --ssl-no-revoke ...
```

**Concept**
*Distinguer un problème d'outil local d'un problème du système testé*. Une erreur d'outillage peut ressembler exactement à un vrai bug si on ne connaît pas les particularités de la plateforme d'exécution.

**Leçon**
Face à une erreur inattendue d'un outil de diagnostic (curl, ping, etc.), vérifier si elle est spécifique à l'environnement local avant de conclure sur l'état du système distant testé.

---

## #7 — Auditer le CHEMIN COMPLET jusqu'à la prod, pas juste le code

**Analogie**
Une recette de cuisine parfaitement écrite, testée par le chef, mais jamais vérifiée dans les mains du livreur qui doit suivre les instructions d'emballage. Le plat était bon en cuisine. Il arrive froid et renversé chez le client.

**Contexte récurrent dans cette phase**
Plusieurs "bugs" n'étaient pas dans le code applicatif mais dans la chaîne de déploiement : `ADMIN_SECRET` absent de `docker-compose.yml`/`DEPLOY.md`, promotion Vercel suspendue, `cleanUrls` qui casse les rewrites en prod uniquement.

**Concept**
*Le code correct n'est qu'une des couches nécessaires à un système correct en production*. Configuration de déploiement, DNS, promotion de version, variables d'environnement — chacune de ces couches peut invalider un code par ailleurs juste.

**Leçon**
Un audit de sécurité ou de bugs qui se limite au code source (`git diff`, lecture de fichiers) est incomplet — il faut aussi auditer la documentation de déploiement et, quand c'est possible, l'état RÉEL du système déployé (via API de la plateforme, `curl` direct).

---

## #8 — Utiliser les outils de la plateforme plutôt que deviner

**Analogie**
Plutôt que de deviner pourquoi une lettre n'est jamais arrivée en essayant plusieurs théories au hasard, appeler directement le bureau de poste et demander le suivi réel du colis.

**Contexte**
Face au domaine Vercel gelé sur un vieux déploiement, plutôt que de re-pousser des commits en espérant que "ça se déclenche", utilisation directe de l'API Vercel (`list_deployments`, `get_deployment`) pour voir l'état RÉEL : quel déploiement est aliasé sur quel domaine, avec quel commit, à quelle heure.

**Concept**
*Observabilité via l'API native de la plateforme*. Chaque plateforme de déploiement (Vercel, Coolify, GitHub Actions) expose généralement une API ou un dashboard qui donne un état FACTUEL — bien plus fiable que d'inférer l'état depuis des symptômes externes (curl, comportement de l'app).

**Leçon**
Quand un outil dédié à la plateforme concernée existe (API, MCP, CLI officiel), l'utiliser en premier pour obtenir l'état réel plutôt que d'empiler des hypothèses basées sur des symptômes indirects.

---

# Méta-leçons de cette phase

1. **Un fix "validé sur le fichier" n'est pas validé** — toujours tester contre le système réellement déployé.
2. **Les plateformes de déploiement ont un état caché** (promotion, rollback) invisible depuis Git seul — apprendre à interroger cet état directement.
3. **Le choix d'infrastructure a des conséquences invisibles** tant qu'on ne teste pas dans les conditions réelles des utilisateurs (adblockers, filtres réseau).
4. **Ne jamais confondre une URL technique (API) avec une URL destinée à un humain (lien de partage)** — même variable d'environnement, deux usages incompatibles.
5. **Reproduire avant de corriger, systématiquement** — la reproduction empirique évite de corriger la mauvaise cause.
6. **Un audit complet couvre le code ET le chemin de déploiement** — les deux peuvent contenir des bugs indépendamment l'un de l'autre.
