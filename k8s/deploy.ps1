$ns = 'url-shortener';
$rs = 'redirect-url-service'
$ss = 'store-url-service'

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
kubectl autoscale deployment $rs --min 2 --max 4 --cpu '60%' -n $ns
kubectl autoscale deployment $ss --min 2 --max 4 --cpu '60%' -n $ns
kubectl get svc -n $ns



# echo "Forwarding app to localhost:8080"
# kubectl port-forward svc -n $ns api-gatway 8080:80