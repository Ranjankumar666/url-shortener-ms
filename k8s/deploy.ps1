$ns = 'url-shortener';
cd ./k8s/

echo "Adding namespace..."
kubectl apply -f ./00-namespace.yaml;

echo "Appling secrets...."
kubectl apply -f ./secret 
kubectl get secret -n $ns

echo "Applying configs....."

kubectl apply -f ./config
kubectl get configMap -n $ns


echo "Loading infra...."

kubectl apply -f ./infra
kubectl get svc -n $ns


echo "Loading service"

kubectl apply -f ./service
kubectl get svc -n $ns

# echo "Forwarding app to localhost:8080"
# kubectl port-forward svc -n $ns api-gatway 8080:80