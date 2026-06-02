# AI-BACKEND-DEPLOY — Prompt pour configurer le serveur

> Fichier destiné à être collé dans une session Claude Code (ou autre IA agent)
> **sur le serveur cible**, pour automatiser la configuration backend + Nginx.
>
> Avant de coller : remplacer `{{DOMAIN}}`, `{{EMAIL_CERTBOT}}`, `{{GIT_REPO_URL}}`.

---

## CONTEXTE

Je déploie **Collab MVP**, un outil de collaboration éphémère temps réel par EXXOLAB.

**Stack à installer / configurer** :
- Docker + Docker Compose
- Nginx + Certbot (Let's Encrypt)
- Redis 7 (containerisé)
- Backend Fastify + Socket.io (containerisé, PM2 cluster 6 workers)
- Frontend SvelteKit (build statique servi par Nginx hors Docker)

**Cible** : Ubuntu 22.04 LTS (ou Debian 12), accès root via SSH.

**Repo git** : `{{GIT_REPO_URL}}`
- Branche `main` = release stable
- Branche `front` = itérations frontend (déclenche rebuild static)
- Branche `back` = itérations backend (déclenche rebuild container)

**Domaine cible** : `{{DOMAIN}}`
**Email Certbot** : `{{EMAIL_CERTBOT}}`

---

## OBJECTIFS

1. **Provisionner** le serveur (utilisateur non-root, firewall, fail2ban)
2. **Installer** Docker, Nginx, Certbot, Node.js 20 LTS
3. **Cloner** le repo et bootstrap les variables d'environnement
4. **Lancer** Redis + Backend via docker-compose
5. **Build** le frontend et le placer dans `/var/www/collab/`
6. **Configurer** Nginx avec SSL (HTTP→HTTPS, WebSocket upgrade, gzip, headers sec)
7. **Setup** un git bare repo + hook post-receive sur le serveur pour auto-deploy
8. **Tester** : créer une room via curl, ouvrir 2 onglets, vérifier sync Y.js

---

## CONTRAINTES

- **Ne jamais commit de secret** dans le repo. Utiliser `.env` non-tracké.
- **Toujours créer un user non-root** `collab` avec sudo pour les actions serveur.
- **Firewall UFW** : autoriser 22 (SSH), 80, 443 uniquement.
- **Cookies httpOnly + SameSite=Strict** non négociable.
- **Backups Redis** : AOF activé (`appendonly yes`, `appendfsync everysec`).
- **Logs** : Pino JSON côté backend, rotation via logrotate.
- **Monitoring** : UptimeRobot externe (gratuit) + Sentry pour erreurs Node.

---

## ÉTAPES À EXÉCUTER (dans l'ordre)

### 1. Provisioning de base

```bash
# Update + outils essentiels
apt update && apt upgrade -y
apt install -y curl git ufw fail2ban htop ncdu

# User non-root
adduser collab
usermod -aG sudo collab

# SSH key (l'IA doit me demander la pubkey à coller)
mkdir -p /home/collab/.ssh
echo "<PASTE_PUBKEY_HERE>" >> /home/collab/.ssh/authorized_keys
chown -R collab:collab /home/collab/.ssh
chmod 700 /home/collab/.ssh
chmod 600 /home/collab/.ssh/authorized_keys

# Désactiver login root SSH (après avoir testé collab !)
sed -i 's/^PermitRootLogin.*/PermitRootLogin no/' /etc/ssh/sshd_config
sed -i 's/^#*PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config
systemctl restart sshd

# Firewall
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw enable

# fail2ban sshd preset
systemctl enable --now fail2ban
```

### 2. Docker + Nginx + Node

```bash
# Docker
curl -fsSL https://get.docker.com | sh
usermod -aG docker collab

# Nginx + Certbot
apt install -y nginx certbot python3-certbot-nginx

# Node 20 LTS (pour build SvelteKit)
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs
node -v && npm -v
```

### 3. Bootstrap repo

```bash
su - collab

# Clone (lecture)
git clone {{GIT_REPO_URL}} ~/collab
cd ~/collab
git checkout main

# .env (à compléter)
cp .env.example .env
nano .env
# Remplir : JWT_SECRET, ADMIN_SECRET, R2_*, FRONTEND_URL
```

### 4. Bare repo + post-receive hook (auto-deploy)

```bash
# Bare repo pour recevoir les pushes
mkdir -p ~/collab.git && cd ~/collab.git
git init --bare

# Hook post-receive
cat > hooks/post-receive <<'EOF'
#!/bin/bash
set -e
TARGET=/home/collab/collab
GIT_DIR=/home/collab/collab.git

while read oldrev newrev ref; do
  branch=$(echo "$ref" | sed 's|refs/heads/||')

  echo "[deploy] Push reçu sur branche : $branch"

  # Checkout dans le working tree
  git --work-tree="$TARGET" --git-dir="$GIT_DIR" checkout -f "$branch"

  case "$branch" in
    front)
      echo "[deploy] Rebuild frontend statique"
      cd "$TARGET/apps/frontend"
      npm ci
      npm run build
      sudo rsync -a --delete build/ /var/www/collab/
      sudo systemctl reload nginx
      ;;
    back)
      echo "[deploy] Rebuild backend container"
      cd "$TARGET"
      docker compose up -d --build backend
      ;;
    main)
      echo "[deploy] Main mis à jour — rebuild des deux côtés"
      cd "$TARGET/apps/frontend" && npm ci && npm run build
      sudo rsync -a --delete build/ /var/www/collab/
      cd "$TARGET" && docker compose up -d --build
      sudo systemctl reload nginx
      ;;
  esac

  echo "[deploy] OK"
done
EOF

chmod +x hooks/post-receive

# Sudoers pour les commandes nginx + rsync sans password
echo "collab ALL=(root) NOPASSWD: /bin/systemctl reload nginx, /usr/bin/rsync" | sudo tee /etc/sudoers.d/collab-deploy
```

Côté local après ça :
```bash
git remote add prod collab@{{DOMAIN}}:collab.git
git push prod main
git push prod front
git push prod back
```

### 5. Première mise en route

```bash
cd ~/collab
docker compose up -d redis           # démarrer Redis seul
docker compose exec redis redis-cli ping   # → PONG

docker compose up -d backend         # démarrer backend
docker compose logs -f backend       # vérifier "Backend ready :3001"
```

### 6. Nginx config

```bash
sudo nano /etc/nginx/sites-available/collab
```

Contenu :
```nginx
server {
    listen 80;
    server_name {{DOMAIN}};
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name {{DOMAIN}};

    # SSL (Certbot va remplir ces lignes)
    ssl_certificate     /etc/letsencrypt/live/{{DOMAIN}}/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/{{DOMAIN}}/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;

    # Security headers
    add_header Strict-Transport-Security "max-age=63072000; includeSubDomains" always;
    add_header X-Content-Type-Options nosniff always;
    add_header X-Frame-Options DENY always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    # Gzip
    gzip on;
    gzip_types text/css application/javascript application/json image/svg+xml;
    gzip_min_length 1024;

    # Frontend statique
    root /var/www/collab;
    index index.html;
    try_files $uri $uri/ /index.html;

    # Backend API + WebSocket
    location ~ ^/(room|admin|socket\.io) {
        proxy_pass         http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header   Upgrade $http_upgrade;
        proxy_set_header   Connection "upgrade";
        proxy_set_header   Host $host;
        proxy_set_header   X-Real-IP $remote_addr;
        proxy_set_header   X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
        proxy_read_timeout 3600s;            # WebSocket long-lived
    }

    # Upload limite (matches backend cap)
    client_max_body_size 10M;
}
```

```bash
sudo ln -s /etc/nginx/sites-available/collab /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx

# SSL
sudo certbot --nginx -d {{DOMAIN}} --email {{EMAIL_CERTBOT}} --agree-tos --non-interactive
```

### 7. Tests bout en bout

```bash
# Créer une room
curl -X POST https://{{DOMAIN}}/room/create -i

# Doit retourner :
# HTTP/2 200
# set-cookie: admin_XXXXXX=...; HttpOnly; Secure; SameSite=Strict
# {"roomId":"XXXXXX"}

# Ouvrir 2 onglets sur https://{{DOMAIN}}/room/XXXXXX
# Taper dans le bloc-notes → l'autre onglet doit voir la frappe en temps réel
```

---

## CRITÈRES DE SUCCÈS

- [ ] `https://{{DOMAIN}}` charge la landing
- [ ] HTTPS auto-redirect depuis HTTP
- [ ] Certificat SSL valide (test : ssllabs.com)
- [ ] `POST /room/create` répond 200 avec cookie httpOnly Secure SameSite=Strict
- [ ] Y.js sync visible à 2 onglets (frappe miroir)
- [ ] `docker compose logs backend` montre les events `join:room` `yjs:sync`
- [ ] `git push prod front` rebuild + reload Nginx automatiquement
- [ ] `git push prod back` rebuild le container backend automatiquement
- [ ] UFW actif, root SSH désactivé, fail2ban running

---

## EN CAS D'ERREUR

| Symptôme | Diagnostic |
|---|---|
| `502 Bad Gateway` | `docker compose ps` — backend down ? logs ? |
| WebSocket connect failed | `proxy_set_header Upgrade` manquant dans Nginx ? |
| Cookie pas envoyé | `SameSite=Strict` + cross-origin ? mettre `Lax` si pages externes pointent vers room |
| Y.js pas de sync | check console browser : event `yjs:update` reçu ? backend log `applyUpdate` ? |
| Redis "Connection in subscriber mode" | bug connu — utiliser `app.redis.duplicate()` pour subscribe (voir SUIVI.md bug #1) |
| `EADDRINUSE :3001` | autre process écoute — `lsof -i :3001` puis kill |

---

## RAPPORTS À ME RENVOYER

À la fin de l'install, l'IA doit me donner :

1. Output de `nginx -t` (config valide)
2. Output de `docker compose ps` (services up)
3. Output de `curl -I https://{{DOMAIN}}` (HTTPS OK, headers sec)
4. URL de test pour création de room manuelle
5. Liste des fichiers `.env` créés (sans les valeurs — juste les clés)
6. Commande exacte pour me connecter en SSH user `collab`
