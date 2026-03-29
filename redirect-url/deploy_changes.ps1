
podman build --no-cache -t docker.io/ranjankumar2000/url-shortner-redirect-url-service:latest .
podman push docker.io/ranjankumar2000/url-shortner-redirect-url-service:latest --remove-signatures
kubectl rollout restart deployment/redirect-url-service -n url-shortener
kubectl rollout status deployment/redirect-url-service -n url-shortener