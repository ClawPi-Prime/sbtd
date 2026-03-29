#!/bin/bash
# Rebuild and redeploy sbtd-client to k3s
set -e
cd "$(dirname "$0")/.."

echo "🔨 Building Docker image..."
docker build --no-cache -t sbtd-client:latest -f client/Dockerfile .

echo "📦 Importing into k3s containerd..."
docker save sbtd-client:latest | sudo k3s ctr images import -

echo "🚀 Rolling restart..."
kubectl rollout restart deployment/sbtd-client -n sbtd
kubectl rollout status deployment/sbtd-client -n sbtd --timeout=60s

echo "✅ Done. Bundle: $(curl -s http://localhost:30090/ | grep -o 'index-[^"]*\.js')"
