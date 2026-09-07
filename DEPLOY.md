# Deploy no Mac Mini — eVault Leads

Alvo: **https://id.evault.org** na porta **3040**, PWA instalável, dados só em disco.

## 1. Requisitos

- macOS no Mini
- Node.js 20 LTS (`brew install node@20`)
- (Opcional) Caddy ou nginx para HTTPS no porto 443

## 2. Instalar a app

```bash
cd /opt/evault-leads   # ou a pasta que preferir
git clone <repo> .
npm ci
npm run build
```

Confirme que `data/` é gravável pelo utilizador do serviço.

## 3. Arranque

```bash
PORT=3040 NODE_ENV=production npm start
```

Teste local:

```bash
curl -s http://127.0.0.1:3040/api/health
# {"ok":true,"app":"eVault Leads","host":"id.evault.org","storage":"local-json"}
```

A UI e a API partilham a mesma origem. Não configure webhooks, Gemini, Apps Script nem Firebase.

## 4. launchd (sobe no login)

Copie [deploy/org.evault.leads.plist](./deploy/org.evault.leads.plist) para `~/Library/LaunchAgents/` e ajuste `WorkingDirectory` e o caminho do `node`.

```bash
sed -i '' "s|/opt/evault-leads|$(pwd)|g" deploy/org.evault.leads.plist
cp deploy/org.evault.leads.plist ~/Library/LaunchAgents/
launchctl load ~/Library/LaunchAgents/org.evault.leads.plist
```

Logs: `/tmp/evault-leads.out.log` e `/tmp/evault-leads.err.log`.

## 5. HTTPS em id.evault.org (Caddy)

Aponte o DNS de `id.evault.org` para o Mini. Exemplo Caddyfile:

```
id.evault.org {
  encode gzip
  reverse_proxy 127.0.0.1:3040
}
```

```bash
brew install caddy
sudo caddy start --config /usr/local/etc/Caddyfile
```

Firewall: só 80/443 públicos; 3040 fica em localhost se usar o proxy.

## 6. PWA

No Safari ou Chrome, abra https://id.evault.org, introduza o PIN **2009**, depois **Partilhar → Adicionar ao Ecrã Principal** (iOS) ou **Instalar aplicação** (desktop).

## 7. Cópias de segurança

Faça backup de `data/` (Time Machine ou `rsync`). Esse diretório é a base de dados.

```bash
rsync -a data/ /Volumes/Backup/evault-leads-data/
```

## 8. Actualizar

```bash
git pull
npm ci
npm run build
launchctl kickstart -k gui/$(id -u)/org.evault.leads
```

## Porta

A porta por omissão é **3040** (`PORT`). Mantenha-a estável para o reverse proxy e para o Vite em desenvolvimento (`/api` → `127.0.0.1:3040`).
