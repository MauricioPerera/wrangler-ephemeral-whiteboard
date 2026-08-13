# 🎨 Ephemeral Whiteboard

🌐 **Español** · [English](./README.en.md) · [Português](./README.pt.md)

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/MauricioPerera/wrangler-ephemeral-whiteboard)

🌐 **[Landing page](https://mauricioperera.github.io/wrangler-ephemeral-whiteboard/)** — presentación visual del proyecto, disponible en español / English / português.

Una pizarra colaborativa en tiempo real que se despliega en segundos sobre una **cuenta temporal de Cloudflare**, sin necesidad de login, y se **autodestruye sola** cuando esa cuenta expira (~1 hora).

Hermana de [wrangler-ephemeral-chat](https://github.com/MauricioPerera/wrangler-ephemeral-chat) ([landing page](https://mauricioperera.github.io/wrangler-ephemeral-chat/)) y de [wrangler-ephemeral-airdrop](https://github.com/MauricioPerera/wrangler-ephemeral-airdrop) ([landing page](https://mauricioperera.github.io/wrangler-ephemeral-airdrop/)) y de [wrangler-ephemeral-sandbox](https://github.com/MauricioPerera/wrangler-ephemeral-sandbox) ([landing page](https://mauricioperera.github.io/wrangler-ephemeral-sandbox/)) — mismo patrón (Durable Objects + `wrangler deploy --temporary`), pero para chatear, compartir un archivo por QR, o que un agente ejecute JavaScript, en vez de dibujar.

¿Querés chat + pizarra + airdrop juntos, en un solo deploy? Mirá [wrangler-ephemeral-suite](https://github.com/MauricioPerera/wrangler-ephemeral-suite) ([landing page](https://mauricioperera.github.io/wrangler-ephemeral-suite/)).

## Cómo funciona

- `wrangler deploy --temporary` crea una cuenta de Cloudflare temporal (sin login), despliega el Worker, y te da una URL pública en `workers.dev`.
- Esa cuenta —y todo lo que contiene: el Worker, la pizarra, los trazos— vive **~60 minutos**. Si nadie la reclama, Cloudflare la borra automáticamente.
- La pizarra corre en un único Durable Object con estado en SQLite: trazos, configuración de la sala e invitaciones.

## Requisitos

- Node.js
- Wrangler **4.102.0 o superior**
- **No estar logueado** en Wrangler (`wrangler logout` si ya tenés sesión) — `--temporary` solo funciona sin credenciales existentes

## Deploy

```bash
git clone https://github.com/MauricioPerera/wrangler-ephemeral-whiteboard.git
cd wrangler-ephemeral-whiteboard
npm install
npx wrangler deploy --temporary
```

La salida te da la URL de la pizarra y una **claim URL**. Compartí la URL con quien quieras invitar. Si te interesa quedarte con el Worker de forma permanente, abrí la claim URL y completá el login de Cloudflare antes de que venza la hora.

### Deploy permanente (opcional)

Si preferís que no expire, hacé `wrangler login` y corré `npx wrangler deploy` en vez de `--temporary`. También podés usar el botón **Deploy to Cloudflare** de arriba.

## Funcionalidades

- **Dibujo en tiempo real** vía WebSockets (Durable Objects hibernation API), con transmisión incremental mientras se dibuja
- **Historial persistente**: los últimos 300 trazos se guardan en SQLite del propio Durable Object — quien entra tarde ve todo lo dibujado
- **Paleta de colores y grosor** ajustable
- **Exportar PNG / JSON**: descargá el dibujo como imagen, o como JSON para reimportarlo en una instancia futura y seguir donde quedaste
- **Modo abierto / cerrado**: cualquiera con el link (abierto) vs. solo invitados (cerrado)
- **Admin**: quien primero se conecta con `?admin=1` se vuelve admin; puede cambiar el modo, generar invitaciones y **borrar la pizarra entera**
- **Invitaciones de un solo uso**
- **Banner de cuenta regresiva**
- **UI mobile-friendly**: pantalla completa en celular, dibujo táctil (pointer events)

## Uso

1. Abrí la URL del deploy → pantalla de login, poné un nombre.
2. Para ser admin: agregá `?admin=1` a la URL la primera vez que entrás. Guardá el link con tu token de admin.
3. Elegí color y grosor, y dibujá — se sincroniza en vivo con todos los conectados.
4. Desde el panel admin: cambiá entre pizarra abierta/cerrada, generá invitaciones, o borrá todo con "borrar pizarra".

## Estructura

```
src/index.js       — Worker + Durable Object (Board) + UI embebida
wrangler.jsonc      — config del Worker y binding del Durable Object
```

## Limitaciones (heredadas de las cuentas temporales de Cloudflare)

- Durable Objects, KV, D1, Hyperdrive, Queues y certificados mTLS están soportados en cuentas temporales — **R2 y Vectorize no**.
- El timer de 60 minutos es fijo desde la creación de la cuenta, no se extiende con actividad.

Más info: [Claim deployments · Cloudflare Workers docs](https://developers.cloudflare.com/workers/platform/claim-deployments/)

## ¿Sos un agente de IA?

Ver [AGENTS.md](./AGENTS.md) para instrucciones de despliegue autónomo con `wrangler --temporary`.
