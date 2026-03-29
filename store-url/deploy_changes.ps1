
podman build --no-cache -t docker.io/ranjankumar2000/url-shortner-store-url-service:latest .
podman push docker.io/ranjankumar2000/url-shortner-store-url-service:latest --remove-signatures
kubectl rollout restart deployment/store-url-service -n url-shortener
kubectl rollout status deployment/store-url-service -n url-shortener