# CommandKit Deployment Guide

## Prerequisites

- Node.js 20 or later
- npm 9 or later
- Docker 24 or later (for container deployment)
- Docker Compose v2 or later (for local stack)
- kubectl v1.28 or later (for Kubernetes deployment)
- A Kubernetes cluster v1.28 or later with:
  - NGINX Ingress Controller
  - cert-manager (for TLS certificate provisioning)
  - Default StorageClass for persistent volumes
- A Supabase project with the required tables created
- A container registry (e.g., Docker Hub, AWS ECR, GCR) for image storage

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Supabase anonymous key |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes (prod) | Supabase service role key for server-side operations |
| `REDIS_URL` | No | Redis connection URL (defaults to `redis://localhost:6379`) |
| `NODE_ENV` | No | Application environment (`development`, `production`) |

## Local Development Setup

1. Clone the repository:

```bash
git clone https://github.com/your-org/commandkit.git
cd commandkit
```

2. Install dependencies:

```bash
npm install
```

3. Create a `.env` file in the project root:

```bash
cp .env.example .env
```

Edit `.env` and set the required variables:

```
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

4. Start the development server:

```bash
npm run dev
```

The application will be available at http://localhost:3000.

## Docker Deployment

### Build the Image

```bash
docker build -t commandkit/app:latest .
```

### Run with Docker Compose

The Compose stack includes the Next.js application and Redis.

1. Create a `.env` file with the required variables (see above).

2. Start the stack:

```bash
docker compose up -d
```

3. Verify the services are running:

```bash
docker compose ps
```

Both the `app` and `redis` containers should report a healthy status.

4. Access the application at http://localhost:3000.

### Stop the Stack

```bash
docker compose down
```

To also remove the Redis data volume:

```bash
docker compose down -v
```

### View Logs

```bash
# Application logs
docker compose logs -f app

# Redis logs
docker compose logs -f redis

# All services
docker compose logs -f
```

## Kubernetes Deployment

### 1. Create the Namespace

```bash
kubectl apply -f k8s/namespace.yaml
```

### 2. Configure Secrets

Before deploying, update the ConfigMap and Secret with your actual values:

```bash
# Edit the ConfigMap with your Supabase URL and anon key
kubectl edit configmap commandkit-config -n commandkit

# Create the secrets (do not store secrets in Git)
kubectl create secret generic commandkit-secrets \
  --namespace=commandkit \
  --from-literal=SUPABASE_SERVICE_ROLE_KEY=your-service-role-key \
  --from-literal=REDIS_URL=redis://commandkit-redis:6379 \
  --dry-run=client -o yaml | kubectl apply -f -
```

### 3. Deploy Redis

```bash
kubectl apply -f k8s/redis-deployment.yaml
```

Verify Redis is running:

```bash
kubectl get pods -n commandkit -l app=commandkit-redis
```

### 4. Deploy the Application

```bash
kubectl apply -f k8s/configmap.yaml
kubectl apply -f k8s/deployment.yaml
kubectl apply -f k8s/service.yaml
kubectl apply -f k8s/ingress.yaml
```

### 5. Verify the Deployment

```bash
kubectl get pods -n commandkit
kubectl get services -n commandkit
kubectl get ingress -n commandkit
```

All three application pods should reach `Running` status and pass their readiness probes.

### 6. Configure DNS

Point your DNS for `commandkit.example.com` to the external IP of the NGINX Ingress controller:

```bash
kubectl get svc -n ingress-nginx
```

Add an A record or CNAME pointing to the `EXTERNAL-IP` value.

### 7. Verify TLS

Once DNS propagates, cert-manager will request a TLS certificate from Let's Encrypt. Check the certificate status:

```bash
kubectl get certificate -n commandkit
kubectl describe certificate commandkit-tls -n commandkit
```

### Update the Deployment

To roll out a new image:

```bash
kubectl set image deployment/commandkit-app \
  app=commandkit/app:<new-tag> \
  --namespace=commandkit
```

Monitor the rollout:

```bash
kubectl rollout status deployment/commandkit-app -n commandkit
```

To roll back:

```bash
kubectl rollout undo deployment/commandkit-app -n commandkit
```

## Agent Installation

The CommandKit macOS agent is installed on managed devices to report metrics and execute commands.

### Prerequisites on the Mac

- macOS 13 (Ventura) or later
- Administrator privileges
- Xcode Command Line Tools (for Swift compilation)

### Installation Steps

1. Transfer the agent package to the target Mac:

```bash
scp -r agent/ admin@<device-ip>:/tmp/commandkit-agent/
```

2. On the target Mac, run the installer:

```bash
cd /tmp/commandkit-agent
sudo ./install.sh --server-url https://commandkit.example.com --enrollment-token <token>
```

The installer will:

- Build the Swift agent from source
- Install the agent binary to `/usr/local/bin/commandkit-agent`
- Install the launch daemon plist to `/Library/LaunchDaemons/com.commandkit.agent.plist`
- Load the launch daemon to start the agent
- Complete enrollment with the server using the provided token

3. Verify the agent is running:

```bash
sudo launchctl list | grep commandkit
```

The agent should appear with a PID, indicating it is running.

4. Check agent logs:

```bash
log show --predicate 'process == "commandkit-agent"' --last 5m
```

### Uninstall the Agent

```bash
sudo launchctl unload /Library/LaunchDaemons/com.commandkit.agent.plist
sudo rm /Library/LaunchDaemons/com.commandkit.agent.plist
sudo rm /usr/local/bin/commandkit-agent
```

## Troubleshooting

### Application fails to start

1. Check the container logs:

```bash
# Docker
docker compose logs app

# Kubernetes
kubectl logs -n commandkit -l app=commandkit-app --tail=100
```

2. Verify environment variables are set correctly:

```bash
# Kubernetes
kubectl exec -n commandkit deployment/commandkit-app -- env | grep -E 'SUPABASE|REDIS|NODE_ENV'
```

3. Ensure `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are set. The application will not start without them.

### Redis connection errors

1. Verify Redis is running and healthy:

```bash
# Docker
docker compose exec redis redis-cli ping

# Kubernetes
kubectl exec -n commandkit deployment/commandkit-redis -- redis-cli ping
```

The response should be `PONG`.

2. Check the Redis URL in the application environment matches the service name:

```bash
# Docker: REDIS_URL should be redis://redis:6379
# Kubernetes: REDIS_URL should be redis://commandkit-redis:6379
```

3. If using Kubernetes, verify the Redis service exists:

```bash
kubectl get svc commandkit-redis -n commandkit
```

### Pods fail readiness probes

1. Check pod events:

```bash
kubectl describe pod -n commandkit -l app=commandkit-app
```

2. Common causes:

- Application crash during startup (check logs)
- Missing environment variables
- Redis is not reachable
- Resource limits are too low (increase memory or CPU)

### TLS certificate not issued

1. Check cert-manager logs:

```bash
kubectl logs -n cert-manager -l app=cert-manager
```

2. Verify the ClusterIssuer exists:

```bash
kubectl get clusterissuer letsencrypt-prod
```

3. Verify DNS resolves to the correct ingress IP:

```bash
dig commandkit.example.com
```

### Agent not reporting metrics

1. Verify the agent process is running:

```bash
sudo launchctl list | grep commandkit
```

2. Check agent logs for connection errors:

```bash
log show --predicate 'process == "commandkit-agent"' --last 30m --info
```

3. Verify network connectivity from the device to the server:

```bash
curl -v https://commandkit.example.com/api/enroll/test
```

A 404 response confirms the server is reachable (the token "test" simply does not exist).

4. Verify the enrollment token is valid and not expired. Tokens are single-use and must be generated fresh for each device.

### Docker build fails

1. Ensure the Docker daemon is running and you have sufficient disk space.

2. If the build fails at the `npm ci` step, verify `package-lock.json` is committed and up to date:

```bash
npm install
git add package-lock.json
```

3. If the build fails at the `npm run build` step, check for TypeScript errors:

```bash
npm run typecheck
```

### Database connection issues

1. Verify the Supabase project URL is correct and accessible:

```bash
curl -I https://your-project.supabase.co
```

2. Verify the Supabase anon key is valid by making a test API call:

```bash
curl -H "apikey: your-anon-key" \
     -H "Authorization: Bearer your-anon-key" \
     https://your-project.supabase.co/rest/v1/
```

3. Ensure the required tables exist in your Supabase project: `devices`, `enrollment_tokens`, `organizations`, `commands`, `audit_logs`, `installed_apps`.
