# 🎨 Ephemeral Whiteboard

🌐 [Español](./README.md) · [English](./README.en.md) · **Português**

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/MauricioPerera/wrangler-ephemeral-whiteboard)

🌐 **[Landing page](https://mauricioperera.github.io/wrangler-ephemeral-whiteboard/)** — apresentação visual do projeto, disponível em español / English / português.

Um quadro branco colaborativo em tempo real que é implantado em segundos numa **conta temporária da Cloudflare**, sem precisar de login, e **se autodestrói sozinho** quando essa conta expira (~1 hora).

Irmão de [wrangler-ephemeral-chat](https://github.com/MauricioPerera/wrangler-ephemeral-chat) ([landing page](https://mauricioperera.github.io/wrangler-ephemeral-chat/)) e de [wrangler-ephemeral-airdrop](https://github.com/MauricioPerera/wrangler-ephemeral-airdrop) — mesmo padrão (Durable Objects + `wrangler deploy --temporary`), mas para conversar ou compartilhar um arquivo via QR em vez de desenhar.

## Como funciona

- `wrangler deploy --temporary` cria uma conta temporária da Cloudflare (sem login), implanta o Worker e te dá uma URL pública em `workers.dev`.
- Essa conta — e tudo que ela contém: o Worker, o quadro, os traços — vive por **~60 minutos**. Se ninguém a reivindicar, a Cloudflare a apaga automaticamente.
- O quadro roda em um único Durable Object com estado em SQLite: traços, configuração da sala e convites.

## Requisitos

- Node.js
- Wrangler **4.102.0 ou superior**
- **Não estar logado** no Wrangler (`wrangler logout` se já tiver sessão) — `--temporary` só funciona sem credenciais existentes

## Deploy

```bash
git clone https://github.com/MauricioPerera/wrangler-ephemeral-whiteboard.git
cd wrangler-ephemeral-whiteboard
npm install
npx wrangler deploy --temporary
```

A saída te dá a URL do quadro e uma **claim URL**. Compartilhe a URL com quem você quiser convidar. Se quiser ficar com o Worker permanentemente, abra a claim URL e complete o login da Cloudflare antes da hora acabar.

### Deploy permanente (opcional)

Se preferir que não expire, rode `wrangler login` e `npx wrangler deploy` em vez de `--temporary`. Você também pode usar o botão **Deploy to Cloudflare** acima.

## Funcionalidades

- **Desenho em tempo real** via WebSockets (Hibernation API dos Durable Objects), com transmissão incremental enquanto você desenha
- **Histórico persistente**: os últimos 300 traços ficam salvos no SQLite do próprio Durable Object — quem entra depois vê tudo que foi desenhado
- **Paleta de cores e espessura** ajustável
- **Exportar PNG / JSON**: baixe o desenho como imagem, ou como JSON para reimportar numa instância futura e continuar de onde parou
- **Modo aberto / fechado**: qualquer um com o link (aberto) vs. só convidados (fechado)
- **Admin**: quem conecta primeiro com `?admin=1` vira admin; pode mudar o modo, gerar convites e **apagar o quadro inteiro**
- **Convites de uso único**
- **Banner de contagem regressiva**
- **UI mobile-friendly**: tela cheia no celular, desenho por toque (pointer events)

## Uso

1. Abra a URL do deploy → tela de login, coloque um nome.
2. Para ser admin: adicione `?admin=1` na URL na primeira vez que entrar. Guarde o link com seu token de admin.
3. Escolha cor e espessura, e desenhe — sincroniza ao vivo com todos os conectados.
4. No painel admin: alterne entre quadro aberto/fechado, gere convites, ou apague tudo com "apagar quadro".

## Estrutura

```
src/index.js       — Worker + Durable Object (Board) + UI embutida
wrangler.jsonc      — config do Worker e binding do Durable Object
```

## Limitações (herdadas das contas temporárias da Cloudflare)

- Durable Objects, KV, D1, Hyperdrive, Queues e certificados mTLS são suportados em contas temporárias — **R2 e Vectorize não**.
- O timer de 60 minutos é fixo a partir da criação da conta, não se estende com atividade.

Mais informações: [Claim deployments · Cloudflare Workers docs](https://developers.cloudflare.com/workers/platform/claim-deployments/)

## Você é um agente de IA?

Veja [AGENTS.md](./AGENTS.md) para instruções de deploy autônomo com `wrangler --temporary`.
