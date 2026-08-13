# Guía para agentes: desplegar esta pizarra con `wrangler --temporary`

Mismo mecanismo que [wrangler-ephemeral-chat](https://github.com/MauricioPerera/wrangler-ephemeral-chat/blob/master/AGENTS.md) — esta guía repite lo esencial aplicado a este repo.

Si lo que el usuario necesita no es dibujar sino inspeccionar webhooks entrantes, usá el repo hermano [wrangler-ephemeral-webhook](https://github.com/MauricioPerera/wrangler-ephemeral-webhook/blob/master/AGENTS.md).

## Paso 1 — Confirmar que NO hay sesión activa

```bash
npx wrangler whoami
```

Si hay sesión logueada, `--temporary` falla (o, peor, corre igual pero contra la cuenta real del usuario sin avisar con error — siempre revisar esto antes). Correr `wrangler logout` si hace falta y el usuario lo autoriza.

## Paso 2 — Instalar y desplegar

```bash
npm install
npx wrangler deploy --temporary
```

Guardar de la salida: la URL del Worker (pizarra) y la claim URL.

## Gotchas (compartidos con el proyecto del chat)

- Wrangler cachea la cuenta temporal en `wrangler-temporary-account.toml` (Windows: `%APPDATA%\xdg.config\.wrangler\`, Linux/Mac: `~/.config/.wrangler/`). Si expiró y falla con `Authentication error [code: 10000]` / `Invalid access token [code: 9109]`, borrar ese archivo antes de reintentar.
- El timer de 60 minutos es fijo desde la creación, no se extiende con actividad.
- Cuentas temporales solo soportan: Workers, Static Assets, KV, D1 (1 base, 100MB), Durable Objects, Hyperdrive, Queues, certificados mTLS. **R2 y Vectorize no** — este proyecto no los usa, así que no aplica.

## Paso 3 — Verificar que funciona de verdad

```bash
curl -sS -w "\nHTTP %{http_code}\n" https://<worker-name>.<account-slug>.workers.dev/
```

Smoke test del WebSocket (Durable Object):

```js
import WebSocket from "ws";
const ws = new WebSocket("wss://<worker-name>.<account-slug>.workers.dev/room/test?name=probe");
ws.on("message", (data) => { console.log(data.toString()); ws.close(); });
```

Si llega el mensaje `{"history":[...]}` seguido de `{"status":true,...}`, el Durable Object está funcionando.

## Paso 4 — Comunicar el resultado

Entregar la URL de la pizarra y la claim URL (aclarando la ventana de ~1 hora y que hay que completar el login, no solo abrir el link, para quedarse con el Worker).
