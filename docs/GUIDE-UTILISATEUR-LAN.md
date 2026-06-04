# Guide d'utilisation — Collab en mode LAN (sans internet)

> Pour utilisateurs non-techniciens. Pas de jargon. Si quelque chose n'est pas clair, c'est un bug du guide — dis-le.

---

## C'est quoi le mode LAN ?

Quand tu n'as pas internet (ou que la connexion est trop lente), Collab peut tourner **uniquement sur ton réseau Wi-Fi local**. Une personne lance l'app sur son ordinateur, les autres rejoignent via leur navigateur.

**Exemple concret** :
- Salle de TD à l'université, pas de Wi-Fi étudiant qui marche
- Réunion de chantier BTP, zone sans 4G
- Bureau pendant une coupure
- Atelier formation, on veut éviter de bouffer la 4G de tout le monde

---

## Ce qu'il faut

| Côté | Ce qu'il faut |
|---|---|
| **Personne qui héberge** (1 seule) | Un PC Windows/Mac/Linux + Collab Host installé |
| **Tout le monde** (étudiants/collègues) | Un téléphone OU laptop avec navigateur (Chrome, Firefox, Safari) |
| **Tous ensemble** | Être connectés au même réseau Wi-Fi |

Pas besoin d'internet. Le Wi-Fi local suffit (même un hotspot téléphone marche).

---

## Étape 1 — Installer Collab Host (1 fois, sur le PC qui hébergera)

### Windows

1. Télécharge **Collab-LAN-Setup.exe** depuis [collab.exxolab.bf/download](https://collab.exxolab.bf/download)
2. Double-clique pour lancer l'installation
3. Si Windows demande "Voulez-vous autoriser cette application ?" → oui
4. L'installeur va peut-être proposer d'installer Docker Desktop — clique oui (c'est nécessaire)
5. Une fois fini, Collab Host apparaît dans le menu Démarrer

### macOS

1. Télécharge **Collab-LAN.dmg** depuis le même lien
2. Ouvre le fichier .dmg
3. Glisse l'icône Collab dans Applications
4. Double-clique sur Collab dans Applications
5. macOS dira "App non vérifiée" → clic droit → Ouvrir → confirmer

### Linux (Ubuntu/Debian)

```bash
wget https://collab.exxolab.bf/download/collab-lan.deb
sudo dpkg -i collab-lan.deb
collab-host
```

---

## Étape 2 — Lancer une session

1. Ouvre **Collab Host** sur ton PC
2. Tu vois une fenêtre comme ça :

```
┌──────────────────────────────────────────┐
│  Collab Host · Session active            │
│                                            │
│   ▢▢▢▢▢▢▢▢▢▢▢▢▢                         │
│   ▢ [QR CODE]  ▢                          │
│   ▢▢▢▢▢▢▢▢▢▢▢▢▢                         │
│                                            │
│   Adresse à partager :                    │
│   http://192.168.1.42:5173                │
│   [📋 Copier]                              │
│                                            │
│   Participants : 0                        │
│   [Arrêter]                                │
└──────────────────────────────────────────┘
```

3. **Tu n'as rien d'autre à faire.** L'app tourne.

---

## Étape 3 — Partager avec les autres

### Option A — Le plus simple : QR code

- Demande à tes collègues de **scanner le QR code** avec l'appareil photo de leur téléphone
- Sur la plupart des téléphones modernes, ça ouvre directement Collab dans le navigateur
- Sinon, ils peuvent utiliser une app QR scanner (gratuit partout)

### Option B — Coller l'adresse

- Clique sur **📋 Copier**
- Envoie l'adresse par WhatsApp / SMS / message à tes collègues
- Ils tapent l'adresse dans leur navigateur (Chrome, Firefox, Safari)

⚠️ **Important** : tout le monde doit être sur **le même Wi-Fi** que toi. Sinon ça ne marchera pas.

---

## Étape 4 — Utiliser Collab normalement

À partir de là, tout fonctionne comme dans la version internet :
- Créer une room ou rejoindre avec un code
- Prendre des notes en collaboratif
- Partager des fichiers
- Poser des questions, voter

**La différence** : tout reste sur ton Wi-Fi local. Rien ne sort sur internet. Quand tu fermes Collab Host, tout disparaît.

---

## Étape 5 — Arrêter la session

- Clique sur **Arrêter** dans la fenêtre Collab Host
- Toutes les rooms et fichiers sont supprimés
- Tu peux relancer plus tard sans souci

---

## Problèmes fréquents

### "Mes collègues n'arrivent pas à se connecter"

**Vérifie qu'ils sont bien sur ton Wi-Fi** :
- Sur le téléphone : Paramètres → Wi-Fi → vérifier le nom du réseau
- Sur leur PC : icône Wi-Fi en bas à droite

Le nom doit être **exactement le même** que celui auquel tu es connecté.

### "Ça dit 'Page introuvable'"

Vérifie l'adresse — c'est sûrement une faute de frappe. L'adresse ressemble à `http://192.168.X.Y:5173` (toujours commence par `http://192.168.` ou `http://10.`).

### "Collab Host ne se lance pas"

Sur Windows :
- Vérifie que Docker Desktop est bien installé (cherche-le dans le menu démarrer)
- Si oui, lance Docker Desktop d'abord, puis Collab Host

Sur Mac :
- Pareil — lance Docker Desktop avant Collab Host

### "C'est lent quand on est nombreux"

Le PC qui héberge fait le travail pour tous. Si vous êtes plus de 20 :
- Utilise un PC plutôt qu'un téléphone pour héberger
- Préfère un Wi-Fi 5GHz si possible
- Maximum recommandé : 50 personnes par room

### "Je dois éteindre mon PC, qu'est-ce qui se passe ?"

- Clique d'abord sur **Arrêter** dans Collab Host
- Les autres perdront la connexion
- Tu peux relancer plus tard mais les notes/fichiers seront perdus (c'est éphémère par nature)

### "Mon antivirus bloque Collab"

Ajoute Collab Host en exception :
- Windows Defender : Paramètres → Sécurité Windows → Virus → Exclusions → Ajouter
- Si autre antivirus, cherche "exclusion" ou "whitelist"

---

## Conseils d'usage

### Pour une réunion

1. Lance Collab Host avant que les gens arrivent
2. Affiche le QR code sur ton écran ou via projecteur
3. Les gens scannent en arrivant — pas de friction
4. Crée une seule room pour la réunion, partage le code

### Pour une salle de TD / formation

1. Lance Collab Host sur le PC du prof
2. Projette le QR code au tableau
3. Les étudiants rejoignent en moins de 30 secondes
4. Le prof peut être admin de la room et modérer

### Pour un chantier BTP

1. Le chef de projet lance Collab Host sur son portable
2. Active le hotspot Wi-Fi de son téléphone si pas de Wi-Fi chantier
3. Les ouvriers se connectent au hotspot, scannent le QR
4. Échange d'infos, photos, instructions en temps réel sans 4G

---

## Combien ça consomme ?

- **Internet** : zéro. Tout passe par le Wi-Fi local.
- **Batterie PC host** : équivalent d'avoir un onglet Chrome ouvert
- **Données mobile** : zéro côté participants (ils sont sur Wi-Fi local)

---

## Et la sécurité ?

- Personne en dehors de ton Wi-Fi ne peut accéder à ta session
- Les codes de rooms sont aléatoires (32^6 possibilités)
- Si quelqu'un de mal intentionné est sur ton Wi-Fi, il pourrait théoriquement se connecter — donc utilise un Wi-Fi de confiance (pas un Wi-Fi public ouvert)
- À la fermeture de Collab Host, tout est supprimé

---

## Besoin d'aide ?

- Email : contact@exxolab.com
- WhatsApp : +226 XX XX XX XX
- Documentation complète : [collab.exxolab.bf/docs](https://collab.exxolab.bf/docs)

---

*Collab Host est gratuit pour les étudiants. Pour les usages pro intensifs, voir nos abonnements sur collab.exxolab.bf.*
