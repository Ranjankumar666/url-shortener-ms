#!/bin/bash

# Kubernetes Deployment Script for URL Shortener

set -e

NAMESPACE="url-shortener"
DB_PASSWORD="${DB_PASSWORD:-postgres123}"  # Change this!

echo "🚀 Deploying URL Shortener to Kubernetes..."

# 1. Create namespace
echo "1️⃣ Creating namespace..."
kubectl apply -f 00-namespace.yaml

# 2. Create secret
echo "2️⃣ Creating secret..."
kubectl create secret generic db-secret \
  --from-literal=POSTGRES_PASSWORD="$DB_PASSWORD" \
  -n $NAMESPACE \
  --dry-run=client -o yaml | kubectl apply -f -

# 3. Create configmaps
echo "3️⃣ Creating ConfigMaps..."
kubectl apply -f 01-configmap.yaml
kubectl apply -f 03-nginx-configmap.yaml

# 4. Deploy databases
echo "4️⃣ Deploying databases and infrastructure..."
kubectl apply -f 04-redirect-url-db.yaml
kubectl apply -f 05-store-url-db.yaml
kubectl apply -f 06-redis-cache.yaml
kubectl apply -f 07-kafka.yaml

# Wait for statefulsets to be ready
echo "⏳ Waiting for databases and infrastructure to be ready..."
kubectl rollout status statefulset/redirect-url-db -n $NAMESPACE --timeout=5m
kubectl rollout status statefulset/store-url-db -n $NAMESPACE --timeout=5m
kubectl rollout status deployment/redirect-url-cache -n $NAMESPACE --timeout=5m
kubectl rollout status statefulset/mq -n $NAMESPACE --timeout=5m

# 5. Deploy services
echo "5️⃣ Deploying microservices..."
kubectl apply -f 08-redirect-url-service.yaml
kubectl apply -f 09-store-url-service.yaml
kubectl apply -f 10-api-gateway.yaml

# Wait for deployments
echo "⏳ Waiting for services to be ready..."
kubectl rollout status deployment/redirect-url-service -n $NAMESPACE --timeout=5m
kubectl rollout status deployment/store-url-service -n $NAMESPACE --timeout=5m
kubectl rollout status deployment/api-gateway -n $NAMESPACE --timeout=5m

# 6. Summary
echo ""
echo "✅ Deployment complete!"
echo ""
echo "Namespace: $NAMESPACE"
echo ""
echo "Check deployment status:"
echo "  kubectl get all -n $NAMESPACE"
echo ""
echo "Access the API Gateway:"
echo "  kubectl port-forward -n $NAMESPACE svc/api-gateway 8080:8080"
echo "  Then visit: http://localhost:8080"
echo ""
echo "View logs:"
echo "  kubectl logs -n $NAMESPACE -l app=redirect-url-service"
echo "  kubectl logs -n $NAMESPACE -l app=store-url-service"
echo ""
