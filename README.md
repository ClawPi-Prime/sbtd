# SquadBattleTD

Multiplayer tower defence game — Phase 0 skeleton.

## Structure

```
client/   # Phaser 3 + TypeScript + Vite frontend
server/   # Colyseus game server
shared/   # Shared TypeScript types
k8s/      # Kubernetes manifests
docs/     # Architecture and design docs
```

## Development

```bash
npm install
npm run dev --workspace=client
npm run dev --workspace=server
```

## Deploy

Images are built and imported to k3s. Apply manifests:

```bash
kubectl apply -f k8s/namespace.yaml
kubectl apply -f k8s/postgres.yaml
kubectl apply -f k8s/server.yaml
kubectl apply -f k8s/client.yaml
```

Frontend: http://localhost:30090
