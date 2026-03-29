# Kubernetes Deployment Guide - URL Shortener

## Files Overview

- **00-namespace.yaml** - Creates the `url-shortener` namespace
- **01-configmap.yaml** - Application configuration (non-sensitive)
- **02-secret.yaml** - Database password secret
- **03-nginx-configmap.yaml** - Nginx gateway configuration
- **04-redirect-url-db.yaml** - PostgreSQL database for redirect service
- **05-store-url-db.yaml** - PostgreSQL database for store service
- **06-redis-cache.yaml** - Redis cache for redirect service
- **07-kafka.yaml** - Kafka message broker
- **08-redirect-url-service.yaml** - Redirect URL microservice
- **09-store-url-service.yaml** - Store URL microservice
- **10-api-gateway.yaml** - Nginx API gateway

## Prerequisites

1. Kubernetes cluster running (minikube, EKS, GKE, etc.)
2. kubectl configured to access your cluster
3. Docker images built and pushed to a registry:
   - `redirect-url:latest`
   - `store-url:latest`

## Deployment Steps

### 1. Update Secret with Your Password
Edit `02-secret.yaml` and replace `your-postgres-password-here` with your actual password:

```bash
kubectl apply -f 02-secret.yaml
```

Or create it securely:
```bash
kubectl create secret generic db-secret \
  --from-literal=POSTGRES_PASSWORD='your-password' \
  -n url-shortener
```

### 2. Deploy the Namespace
```bash
kubectl apply -f 00-namespace.yaml
```

### 3. Deploy Configuration
```bash
kubectl apply -f 01-configmap.yaml
kubectl apply -f 03-nginx-configmap.yaml
```

### 4. Deploy Infrastructure (Databases, Cache, Message Broker)
```bash
kubectl apply -f 04-redirect-url-db.yaml
kubectl apply -f 05-store-url-db.yaml
kubectl apply -f 06-redis-cache.yaml
kubectl apply -f 07-kafka.yaml
```

Wait for these to be ready:
```bash
kubectl get pods -n url-shortener -w
```

### 5. Update Image References
Edit `08-redirect-url-service.yaml` and `09-store-url-service.yaml`:
- Change `image: redirect-url:latest` to your actual image (e.g., `myregistry.azurecr.io/redirect-url:v1`)
- Change `image: store-url:latest` to your actual image
- Update `imagePullPolicy` if needed

### 6. Deploy Services
```bash
kubectl apply -f 08-redirect-url-service.yaml
kubectl apply -f 09-store-url-service.yaml
kubectl apply -f 10-api-gateway.yaml
```

### 7. Verify Deployment
```bash
kubectl get all -n url-shortener
kubectl logs -n url-shortener -l app=redirect-url-service
```

## Accessing Your Application

### Local Development (minikube)
```bash
minikube service api-gateway -n url-shortener
```

### Cloud (LoadBalancer)
```bash
kubectl get svc api-gateway -n url-shortener
# Get the EXTERNAL-IP and access on port 8080
```

### Port Forward (any cluster)
```bash
kubectl port-forward -n url-shortener svc/api-gateway 8080:8080
# Access at http://localhost:8080
```

## Key Differences from Docker Compose

### Images
- **Docker Compose**: Used `build: ./redirect-url` to build locally
- **Kubernetes**: You must build and push images to a registry, then reference them

```bash
# Example build and push
docker build -t myregistry/redirect-url:v1 ./redirect-url
docker push myregistry/redirect-url:v1
```

### Networking
- **Docker Compose**: Services on custom bridge network `backend`
- **Kubernetes**: All pods in namespace can reach each other via service names

### Storage
- **Docker Compose**: Anonymous volumes
- **Kubernetes**: PersistentVolumeClaims (PVCs) - requires storage class

### Service Dependencies
- **Docker Compose**: `depends_on` with condition
- **Kubernetes**: Init containers that wait for TCP ports to be open

### Configuration
- **Docker Compose**: Environment variables in compose file
- **Kubernetes**: ConfigMaps (non-sensitive) and Secrets (sensitive)

## Managing Configuration

### Update ConfigMap
```bash
kubectl edit configmap app-config -n url-shortener
```

### Update Secret
```bash
kubectl delete secret db-secret -n url-shortener
kubectl create secret generic db-secret \
  --from-literal=POSTGRES_PASSWORD='new-password' \
  -n url-shortener
```

### Restart Deployments (to pick up config changes)
```bash
kubectl rollout restart deployment/redirect-url-service -n url-shortener
kubectl rollout restart deployment/store-url-service -n url-shortener
```

## Scaling

### Scale Services
```bash
kubectl scale deployment redirect-url-service --replicas=3 -n url-shortener
kubectl scale deployment store-url-service --replicas=3 -n url-shortener
```

### Scale API Gateway
```bash
kubectl scale deployment api-gateway --replicas=3 -n url-shortener
```

## Monitoring

### Check Pod Status
```bash
kubectl get pods -n url-shortener
kubectl describe pod <pod-name> -n url-shortener
kubectl logs <pod-name> -n url-shortener
```

### Check Services
```bash
kubectl get svc -n url-shortener
```

### Check PVC Status
```bash
kubectl get pvc -n url-shortener
```

## Cleanup

Delete everything:
```bash
kubectl delete namespace url-shortener
```

## Important Notes

1. **Health Checks**: Services expect `/health` endpoint on port 80. Update if your apps use different paths.

2. **Init Containers**: Use `nc` (netcat) to wait for dependencies. If your cluster doesn't have netcat in busybox, update the init container image.

3. **Resource Limits**: Adjust CPU/memory based on your needs and cluster capacity.

4. **Storage**: Default uses cluster's storage class. For production, configure persistent storage explicitly.

5. **WEB_HOST**: Currently set to `http://localhost:8080/r/`. Update for production URLs.

6. **Replicas**: Set to 2 for most services. Adjust based on traffic and node count.

## Troubleshooting

### Pods stuck in pending
```bash
kubectl describe pvc <pvc-name> -n url-shortener
# Check if storage class exists
kubectl get storageclass
```

### Connection refused errors
```bash
# Verify service DNS
kubectl run -it --rm debug --image=busybox --restart=Never -n url-shortener -- sh
# Inside pod: nslookup redirect-url-db, nslookup mq, etc.
```

### Image pull errors
```bash
kubectl describe pod <pod-name> -n url-shortener
# Update image names and credentials in deployments
```

## Next Steps

- Set up Ingress for better routing
- Add NetworkPolicies for security
- Implement HorizontalPodAutoscaler for auto-scaling
- Use Helm to package and version deployments
- Add monitoring with Prometheus/Grafana
