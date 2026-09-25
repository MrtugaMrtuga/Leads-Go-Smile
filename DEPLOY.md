# Deploy no Mac Mini — GoSmile Leads

Alvo: **https://leads.evob.org** na porta **3040**, PWA instalável. As leads vivem na aba **Leads (2024 - 2026)** (Apps Script). Comissão e lembretes continuam em disco. Sync e população dessa aba ficam fora deste repositório.

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

Confirme que `data/` é gravável pelo utilizador do serviço (definições e lembretes). As leads não vêm desse diretório.

## 3. Arranque

Publique primeiro o Apps Script ([backend-gas/README.md](./backend-gas/README.md)). Depois:

```bash
PORT=3040 NODE_ENV=production \
  APPS_SCRIPT_URL='https://script.google.com/macros/s/…/exec' \
  APPS_SCRIPT_SECRET='o mesmo valor da propriedade do script' \
  npm start
```

Estas duas variáveis ficam só no Mini (launchd). Não as meta no frontend.

Teste local:

```bash
curl -s http://127.0.0.1:3040/api/health
# {"ok":true,"app":"GoSmile Leads","host":"leads.evob.org","storage":"apps-script","sheetTab":"Leads (2024 - 2026)","contactCutoff":"2026-09-01","configured":true}
```

A UI e a API partilham a mesma origem. Não há projecto Google Cloud, conta de serviço nem Firebase. Sem `APPS_SCRIPT_URL` / `APPS_SCRIPT_SECRET`, a lista vem vazia (`configured: false`) em vez do JSON antigo.

## 4. launchd (sobe no login)

Copie [deploy/org.evault.leads.plist](./deploy/org.evault.leads.plist) para `~/Library/LaunchAgents/` e ajuste `WorkingDirectory` e o caminho do `node`.

```bash
sed -i '' "s|/opt/evault-leads|$(pwd)|g" deploy/org.evault.leads.plist
cp deploy/org.evault.leads.plist ~/Library/LaunchAgents/
launchctl load ~/Library/LaunchAgents/org.evault.leads.plist
```

Logs: `/tmp/evault-leads.out.log` e `/tmp/evault-leads.err.log`.

## 5. HTTPS em leads.evob.org

A app escuta só em `127.0.0.1:3040`. Exponha o domínio com **Cloudflare Tunnel** (recomendado no Mini) ou Caddy.

### Cloudflare Tunnel

```bash
brew install cloudflared
cloudflared tunnel login
cloudflared tunnel create evault-leads
cloudflared tunnel route dns evault-leads leads.evob.org
```

`~/.cloudflared/config.yml`:

```yaml
tunnel: evault-leads
credentials-file: /Users/SEU_USER/.cloudflared/<TUNNEL_ID>.json
ingress:
  - hostname: leads.evob.org
    service: http://127.0.0.1:3040
  - service: http_status:404
```

```bash
cloudflared tunnel run evault-leads
```

O frontend continua em same-origin `/api` — o túnel não muda URLs.

### Caddy (alternativa se o Mini tiver IP público)

```
leads.evob.org {
  encode gzip
  reverse_proxy 127.0.0.1:3040
}
```

```bash
brew install caddy
sudo caddy start --config /usr/local/etc/Caddyfile
```

Firewall: só 80/443 públicos; 3040 fica em localhost se usar proxy ou túnel.

## 6. PWA

No Safari ou Chrome, abra https://leads.evob.org, introduza o PIN **2000**, depois **Partilhar → Adicionar ao Ecrã Principal** (iOS) ou **Instalar aplicação** (desktop).

## 7. Cópias de segurança

A base das leads é a Google Sheet (aba Leads (2024 - 2026), só datas de contacto >= 2026-09-01). `data/leads.json` é esvaziado no arranque e não deve ser restaurado como fonte. Faça backup de `data/settings.json` e `data/reminders.json` se quiser guardar comissão e lembretes. Sync e população da aba ficam fora deste PR.

```bash
rsync -a data/settings.json data/reminders.json /Volumes/Backup/evault-leads-data/
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
