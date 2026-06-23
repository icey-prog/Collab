# Collab Desktop — Dépannage

> Si Collab.exe n'arrive pas à démarrer son moteur local, lis ce guide avant d'ouvrir une issue.

---

## Symptôme #1 — Fenêtre Edge "Cette page ne fonctionne pas — ERR_CONNECTION_REFUSED"

**Cause** : le sidecar Node (`collab-backend.exe`) n'a pas pu démarrer / bind le port 47931.

### Diagnostic

```powershell
# 1. Sidecar tourne-t-il ?
Get-Process -Name collab-backend -ErrorAction SilentlyContinue

# 2. Port libre ou occupé ?
Test-NetConnection -ComputerName localhost -Port 47931 -InformationLevel Quiet

# 3. Tail du log Rust
Get-Content "$env:LOCALAPPDATA\Collab\collab-backend.log" -Tail 50

# 4. Test isolé (sans Tauri)
C:\Collab\collab-backend.exe --port 47931
# Doit afficher : Server listening at http://0.0.0.0:47931
```

### Si #4 affiche "Server listening"
Le sidecar fonctionne, le bug est dans Tauri. Probablement :
- Zombie d'une session précédente tient le port (voir #2 ci-dessous)
- Antivirus bloque le spawn par Collab.exe alors que CLI direct passe

### Si #4 crash immédiatement
L'antivirus bloque le binaire. Voir section AV ci-dessous.

---

## Symptôme #2 — "Le moteur local n'a pas démarré" + log mentionne zombie PID

Sidecar.rs détecte le port occupé mais ne peut pas tuer le zombie cross-session.

```powershell
# En ADMIN PowerShell :
taskkill /F /PID <PID-affiché-dans-le-modal>

# OU plus brutal — kill tous les collab-backend
Get-Process -Name collab-backend -ErrorAction SilentlyContinue | Stop-Process -Force

# Puis relance Collab.exe
```

---

## Antivirus — exclusions par produit

Collab Desktop est un binaire non signé (MVP). Les AV à comportement heuristique
peuvent bloquer ou sandbox le sidecar Node compilé via `pkg` (60 Mo, mêmes
heuristiques que beaucoup de malwares packagés).

### Avast (CyberCapture / DeepScreen)

CyberCapture envoie les exes inconnus à Avast Cloud pour analyse et peut les
bloquer/sandbox pendant ~5-10 min. Solution :

1. **Ouvre Avast** → Menu → Paramètres
2. **Général** → **Exceptions** → **Ajouter une exception**
3. Ajoute les chemins :
   ```
   C:\Collab\Collab.exe
   C:\Collab\collab-backend.exe
   ```
4. **Protection** → **Composants principaux** → **CyberCapture** → **Désactiver** (temporairement)
5. Relance Collab.exe

### McAfee (Real-Time Scanning)

1. **McAfee SecurityCenter** → Paramètres → Real-Time Scanning → Désactivé temporairement
2. OU **Exclusion** : Antivirus → Real-Time Scanning → Excluded Files → ajoute les 2 .exe

### Windows Defender

```powershell
# En ADMIN PowerShell
Add-MpPreference -ExclusionPath "C:\Collab"
Add-MpPreference -ExclusionProcess "collab-backend.exe"
Add-MpPreference -ExclusionProcess "Collab.exe"
```

Si l'erreur `0x800106ba` : le service Defender est désactivé (autre AV installé qui
le remplace). Pas Defender qui bloque dans ce cas.

---

## Console DevTools (debug avancé)

Le build 1.0.0+ a devtools activés. Dans la fenêtre Collab :

1. **Clic droit n'importe où → Inspecter**
2. Onglet **Console** : erreurs JS, output `console.log` runtime
3. Onglet **Network** : voir toutes les requêtes HTTP, les URLs qui échouent
4. Onglet **Sources** : breakpoints dans le code Svelte

Pour atteindre la page diagnostic :
```js
// Dans Console DevTools :
location.href = '/diag'
```

La page `/diag` affiche :
- Snapshot Rust live (port libre, backend running, tasklist zombie)
- Boutons pour invoquer chaque commande Tauri manuellement avec timing
- Tail des 200 dernières lignes du log file

---

## Réinitialisation complète

Si rien ne marche, repart de zéro :

```powershell
# 1. Tue tous les processus Collab
Get-Process -Name Collab,collab-backend,collab-desktop -ErrorAction SilentlyContinue | Stop-Process -Force

# 2. Supprime les données locales (logs, PID file)
Remove-Item "$env:LOCALAPPDATA\Collab" -Recurse -Force -ErrorAction SilentlyContinue

# 3. Re-télécharge la dernière release
# https://github.com/icey-prog/Collab/releases/latest

# 4. Dézippe dans un dossier propre (PAS dans Program Files — droit écriture nécessaire)
# Exemples OK : C:\Collab\ , %USERPROFILE%\Documents\Collab\
# Exemples KO : C:\Program Files\... (UAC bloque le write log)

# 5. Lance Collab.exe
```

---

## Logs à fournir pour un bug report

Si tu ouvres une issue GitHub, joins ces 4 sorties :

```powershell
# 1. Version Windows + utilisateur
[System.Environment]::OSVersion ; whoami

# 2. AV installés
Get-CimInstance -Namespace root/SecurityCenter2 -ClassName AntiVirusProduct |
  Select displayName, productState

# 3. Processus Collab
Get-Process -Name Collab,collab-backend,collab-desktop -ErrorAction SilentlyContinue

# 4. Tail log
Get-Content "$env:LOCALAPPDATA\Collab\collab-backend.log" -Tail 100
```

Plus le contenu de la **Console DevTools** (Inspecter dans la fenêtre Collab).
