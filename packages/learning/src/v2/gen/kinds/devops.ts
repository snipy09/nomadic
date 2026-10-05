/**
 * DevOps projects: take a small API for an app idea (the student's own
 * backend project or the minimal service given here) and run it like a
 * production system: containers, CI, infrastructure, deployment, secrets,
 * monitoring and a runbook, on a Linux server with Docker and GitHub Actions,
 * on Kubernetes with Helm, or on AWS with Terraform. Advanced adds scaling and
 * resilience, delivery automation and supply-chain security.
 */
import type { ProjectLevel } from '../../types';
import type { Ctx, KindPlan, StackDef, StageTemplate } from '../types';

type Lang = 'docker-actions' | 'kubernetes-helm' | 'terraform-aws';
const lang = (c: Ctx) => c.stack.key as Lang;
const svc = (c: Ctx) => `${c.idea.key}-api`;
const apiPath = (c: Ctx) => `/api/${c.n.kebabMany}`;
const pick = <T>(c: Ctx, v: Record<Lang, T>): T => v[lang(c)];

// ── Code ────────────────────────────────────────────────────────────────────

function service(c: Ctx): string {
  const N = c.n;
  return `# app/main.py: a minimal ${c.idea.title.toLowerCase()} API to operate (or use your own backend project)\n# pip install "fastapi[standard]" psycopg[binary] prometheus-fastapi-instrumentator\nimport os\n\nimport psycopg\nfrom fastapi import FastAPI\nfrom prometheus_fastapi_instrumentator import Instrumentator\n\napp = FastAPI(title='${svc(c)}')\nInstrumentator().instrument(app).expose(app)  # GET /metrics for Prometheus\nDB = os.environ['DATABASE_URL']\n\n\n@app.get('/health')\ndef health():\n    with psycopg.connect(DB, connect_timeout=2) as conn:\n        conn.execute('SELECT 1')\n    return {'status': 'ok'}\n\n\n@app.get('${apiPath(c)}')\ndef list_${N.snakeMany}():\n    with psycopg.connect(DB) as conn:\n        rows = conn.execute('SELECT id, ${c.fields.map((f) => f.name.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase()).slice(0, 3).join(', ')} FROM ${N.snakeMany} ORDER BY id DESC LIMIT 50').fetchall()\n    return [list(r) for r in rows]\n\n# the table comes from your backend project's migration (or a schema.sql you run once)`;
}

const DOCKERFILE = 'FROM python:3.12-slim AS base\nENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1\nWORKDIR /app\nCOPY requirements.txt .\nRUN pip install --no-cache-dir -r requirements.txt\nCOPY app ./app\nRUN useradd --create-home --uid 10001 api\nUSER api\nEXPOSE 8000\nHEALTHCHECK --interval=30s --timeout=3s CMD python -c "import urllib.request; urllib.request.urlopen(\'http://localhost:8000/health\')"\nCMD ["fastapi", "run", "app/main.py", "--port", "8000"]';

function compose(c: Ctx): string {
  return `# compose.yaml\nservices:\n  db:\n    image: postgres:16\n    environment:\n      POSTGRES_PASSWORD: \${POSTGRES_PASSWORD:?set it in .env}\n      POSTGRES_DB: app\n    volumes: [pgdata:/var/lib/postgresql/data]\n    healthcheck: { test: ["CMD", "pg_isready", "-U", "postgres"], interval: 5s, retries: 10 }\n  api:\n    image: \${IMAGE:-${svc(c)}:dev}\n    build: .\n    environment:\n      DATABASE_URL: postgresql://postgres:\${POSTGRES_PASSWORD}@db:5432/app\n    ports: ["8000:8000"]\n    depends_on: { db: { condition: service_healthy } }\n    restart: unless-stopped\nvolumes:\n  pgdata:`;
}

function ci(c: Ctx): string {
  return `# .github/workflows/ci.yml\nname: ci\non: { push: { branches: [main] }, pull_request: {} }\npermissions: { contents: read, packages: write }\njobs:\n  build:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n      - uses: actions/setup-python@v5\n        with: { python-version: '3.12', cache: pip }\n      - run: pip install -r requirements.txt ruff pytest && ruff check . && pytest\n      - uses: docker/login-action@v3\n        with: { registry: ghcr.io, username: \${{ github.actor }}, password: \${{ secrets.GITHUB_TOKEN }} }\n      - uses: docker/build-push-action@v6\n        with:\n          push: \${{ github.ref == 'refs/heads/main' }}\n          tags: ghcr.io/\${{ github.repository_owner }}/${svc(c)}:\${{ github.sha }}\n      - uses: aquasecurity/trivy-action@0.28.0\n        with:\n          image-ref: ghcr.io/\${{ github.repository_owner }}/${svc(c)}:\${{ github.sha }}\n          severity: CRITICAL,HIGH\n          exit-code: '1'`;
}

const INFRA: Record<Lang, (c: Ctx) => string> = {
  'docker-actions': (c) => `# On a fresh Ubuntu 24.04 server (any VPS or a free-tier VM), as root once:\nadduser deploy && usermod -aG sudo,docker deploy\n# copy your public key to /home/deploy/.ssh/authorized_keys, then in /etc/ssh/sshd_config:\n#   PasswordAuthentication no\n#   PermitRootLogin no\nsystemctl restart ssh\nufw allow OpenSSH && ufw allow 80/tcp && ufw allow 443/tcp && ufw enable\napt update && apt install -y docker.io docker-compose-v2 unattended-upgrades\n\n# Caddyfile: automatic HTTPS in front of the API\n{$DOMAIN} {\n\treverse_proxy api:8000\n\tencode gzip\n}\n# add a caddy service (image caddy:2, ports 80 and 443, volume for /data) to compose.yaml`,
  'kubernetes-helm': (c) => `# kind create cluster --name ${c.idea.key}\napiVersion: apps/v1\nkind: Deployment\nmetadata: { name: ${svc(c)} }\nspec:\n  replicas: 2\n  selector: { matchLabels: { app: ${svc(c)} } }\n  template:\n    metadata: { labels: { app: ${svc(c)} } }\n    spec:\n      securityContext: { runAsNonRoot: true }\n      containers:\n        - name: api\n          image: ghcr.io/YOU/${svc(c)}:TAG\n          ports: [{ containerPort: 8000 }]\n          envFrom: [{ secretRef: { name: ${svc(c)}-db } }]\n          readinessProbe: { httpGet: { path: /health, port: 8000 }, periodSeconds: 5 }\n          livenessProbe: { httpGet: { path: /health, port: 8000 }, initialDelaySeconds: 10 }\n          resources:\n            requests: { cpu: 100m, memory: 128Mi }\n            limits: { memory: 256Mi }\n---\napiVersion: v1\nkind: Service\nmetadata: { name: ${svc(c)} }\nspec:\n  selector: { app: ${svc(c)} }\n  ports: [{ port: 80, targetPort: 8000 }]`,
  'terraform-aws': (c) => `terraform {\n  required_version = ">= 1.10"\n  required_providers {\n    aws = { source = "hashicorp/aws", version = "~> 5.0" }\n  }\n  backend "s3" {\n    bucket       = "tfstate-YOURNAME"   # create this bucket once by hand, with versioning on\n    key          = "${c.idea.key}/terraform.tfstate"\n    region       = "ap-south-1"\n    use_lockfile = true\n  }\n}\n\nprovider "aws" { region = "ap-south-1" }\n\nmodule "vpc" {\n  source             = "terraform-aws-modules/vpc/aws"\n  version            = "~> 5.0"\n  name               = "${c.idea.key}"\n  cidr               = "10.0.0.0/16"\n  azs                = ["ap-south-1a", "ap-south-1b"]\n  public_subnets     = ["10.0.1.0/24", "10.0.2.0/24"]\n  private_subnets    = ["10.0.11.0/24", "10.0.12.0/24"]\n  enable_nat_gateway = false   # saves money; tasks run in public subnets\n}\n\nresource "aws_db_instance" "db" {\n  identifier                  = "${c.idea.key}"\n  engine                      = "postgres"\n  engine_version              = "16"\n  instance_class              = "db.t4g.micro"\n  allocated_storage           = 20\n  username                    = "app"\n  manage_master_user_password = true   # the password lives in Secrets Manager\n  db_subnet_group_name        = aws_db_subnet_group.db.name\n  vpc_security_group_ids      = [aws_security_group.db.id]\n  skip_final_snapshot         = true\n}`,
};

const DEPLOY: Record<Lang, (c: Ctx) => string> = {
  'docker-actions': (c) => `# .github/workflows/deploy.yml: runs after ci succeeds on main\nname: deploy\non:\n  workflow_run: { workflows: [ci], types: [completed], branches: [main] }\njobs:\n  deploy:\n    if: \${{ github.event.workflow_run.conclusion == 'success' }}\n    runs-on: ubuntu-latest\n    environment: production\n    steps:\n      - uses: appleboy/ssh-action@v1\n        with:\n          host: \${{ secrets.SERVER_HOST }}\n          username: deploy\n          key: \${{ secrets.SERVER_SSH_KEY }}\n          script: |\n            cd /srv/${svc(c)}\n            export IMAGE=ghcr.io/\${{ github.repository_owner }}/${svc(c)}:\${{ github.event.workflow_run.head_sha }}\n            docker compose pull api && docker compose up -d api\n            sleep 5 && curl -fsS localhost:8000/health`,
  'kubernetes-helm': (c) => `helm create chart        # then trim templates to deployment, service, ingress, hpa\n# chart/values.yaml\nimage:\n  repository: ghcr.io/YOU/${svc(c)}\n  tag: ""                 # set per release: --set image.tag=$SHA\nreplicaCount: 2\nresources:\n  requests: { cpu: 100m, memory: 128Mi }\n  limits: { memory: 256Mi }\n\n# chart/values-prod.yaml overrides replicas and resources for production\nhelm lint chart\nhelm upgrade --install ${svc(c)} ./chart -f chart/values-prod.yaml --set image.tag=$SHA --atomic --wait\nhelm history ${svc(c)}\nhelm rollback ${svc(c)} 1   # practise this before you need it`,
  'terraform-aws': (c) => `resource "aws_ecs_task_definition" "api" {\n  family                   = "${svc(c)}"\n  requires_compatibilities = ["FARGATE"]\n  network_mode             = "awsvpc"\n  cpu                      = 256\n  memory                   = 512\n  execution_role_arn       = aws_iam_role.exec.arn\n  container_definitions = jsonencode([{\n    name         = "api"\n    image        = "\${aws_ecr_repository.api.repository_url}:\${var.image_tag}"\n    portMappings = [{ containerPort = 8000 }]\n    secrets      = [{ name = "DATABASE_URL", valueFrom = aws_secretsmanager_secret.db_url.arn }]\n    logConfiguration = {\n      logDriver = "awslogs"\n      options   = { awslogs-group = "/ecs/${svc(c)}", awslogs-region = "ap-south-1", awslogs-stream-prefix = "api" }\n    }\n  }])\n}\n\n# GitHub Actions deploys with OIDC: no long-lived AWS keys in secrets\n# - uses: aws-actions/configure-aws-credentials@v4\n#   with: { role-to-assume: \${{ vars.DEPLOY_ROLE_ARN }}, aws-region: ap-south-1 }\n# - run: terraform apply -auto-approve -var image_tag=$GITHUB_SHA`,
};

const OBSERVE: Record<Lang, string> = {
  'docker-actions': '# add to compose.yaml\n  prometheus:\n    image: prom/prometheus:v3.0.0\n    volumes: [./prometheus.yml:/etc/prometheus/prometheus.yml]\n  grafana:\n    image: grafana/grafana:11.3.0\n    ports: ["127.0.0.1:3000:3000"]   # reach it through an SSH tunnel, not the internet\n\n# prometheus.yml\nscrape_configs:\n  - job_name: api\n    scrape_interval: 15s\n    static_configs: [{ targets: ["api:8000"] }]',
  'kubernetes-helm': '# add the prometheus-community chart repository (its address is in the chart README)\nhelm repo add prometheus-community <chart repository address>\nhelm install monitoring prometheus-community/kube-prometheus-stack -n monitoring --create-namespace\n\n# chart/templates/servicemonitor.yaml\napiVersion: monitoring.coreos.com/v1\nkind: ServiceMonitor\nmetadata:\n  name: {{ .Release.Name }}\n  labels: { release: monitoring }\nspec:\n  selector: { matchLabels: { app: {{ .Release.Name }} } }\n  endpoints: [{ port: http, path: /metrics, interval: 15s }]\n\nkubectl -n monitoring port-forward svc/monitoring-grafana 3000:80',
  'terraform-aws': 'resource "aws_cloudwatch_metric_alarm" "api_5xx" {\n  alarm_name          = "api-5xx"\n  namespace           = "AWS/ApplicationELB"\n  metric_name         = "HTTPCode_Target_5XX_Count"\n  dimensions          = { LoadBalancer = aws_lb.api.arn_suffix }\n  statistic           = "Sum"\n  period              = 300\n  evaluation_periods  = 1\n  threshold           = 5\n  comparison_operator = "GreaterThanThreshold"\n  alarm_actions       = [aws_sns_topic.alerts.arn]   # SNS emails you\n}\n\nresource "aws_budgets_budget" "monthly" {\n  name         = "monthly"\n  budget_type  = "COST"\n  limit_amount = "5"\n  limit_unit   = "USD"\n  time_unit    = "MONTHLY"\n}',
};

const TOPICS: Record<Lang, { infra: string[]; deploy: string[]; observe: string[]; scale: string[]; delivery: string[] }> = {
  'docker-actions': {
    infra: ['dev.linux-networking.linux-server-ops', 'dev.linux-networking.nginx-tls-balancing'],
    deploy: ['dev.containers-ci.ci-cd-delivery'],
    observe: ['dev.cloud-ops.observability-prometheus'],
    scale: ['dev.cloud-ops.sre-practices'],
    delivery: ['dev.containers-ci.ci-cd-delivery'],
  },
  'kubernetes-helm': {
    infra: ['dev.containers-ci.kubernetes-deployments', 'dev.containers-ci.kubernetes-services'],
    deploy: ['dev.containers-ci.kubernetes-helm-rbac'],
    observe: ['dev.cloud-ops.observability-prometheus'],
    scale: ['dev.containers-ci.kubernetes-scaling'],
    delivery: ['dev.containers-ci.gitops', 'dev.containers-ci.gitops-promotion'],
  },
  'terraform-aws': {
    infra: ['dev.cloud-ops.terraform', 'dev.cloud-ops.terraform-state', 'dev.cloud-ops.cloud-platforms-networking'],
    deploy: ['dev.cloud-ops.cloud-platforms-compute', 'dev.cloud-ops.cloud-platforms-iam'],
    observe: ['dev.cloud-ops.observability'],
    scale: ['dev.cloud-ops.cloud-platforms-architecture'],
    delivery: ['dev.cloud-ops.terraform-modules', 'dev.containers-ci.ci-cd-delivery'],
  },
};

// ── Stages ──────────────────────────────────────────────────────────────────

const serviceStage: StageTemplate<Ctx> = {
  id: 'service',
  minutes: [15, 20, 15],
  build: (c) => ({
    title: 'The service you will operate',
    goal: `A ${c.idea.title.toLowerCase()} API with /health and /metrics runs locally, reads all settings from environment variables, and is on GitHub.`,
    steps: [
      { title: 'Pick the service', detail: `Use the ${c.idea.title} API from one of your backend projects, or start from this minimal one. It must have GET /health (checks the database) and GET /metrics (Prometheus format).`, code: service(c) },
      { title: 'Twelve-factor settings', detail: 'Every setting that changes between your laptop and production (database address, log level, secrets) comes from an environment variable. Log to standard output, one line per request.' },
      { title: 'Repository layout', detail: 'Create the repository with app/, tests/, a requirements.txt (pinned versions), a short README and a .gitignore. Add one test that calls /health with the database mocked or running.' },
    ],
    hints: ['A health check that does not touch the database cannot tell you the database is down.', 'Pin dependency versions so builds are repeatable.'],
    acceptance: ['The API runs locally against PostgreSQL.', '/health and /metrics respond.', 'No setting or secret is hard-coded.'],
    repo: { paths: ['app/**', 'requirements.txt'] },
    self_check: ['What is the difference between a liveness and a readiness check?', 'Why should configuration come from the environment?'],
    commit: 'feat: service with health and metrics endpoints',
    topics: ['dev.backend-core.python-web-frameworks', 'dev.cloud-ops.observability'],
  }),
};

const containerStage: StageTemplate<Ctx> = {
  id: 'container',
  minutes: [20, 20, 15],
  build: (c) => ({
    title: 'A small, safe container',
    goal: 'The service builds into a small image that runs as a non-root user, and the API and PostgreSQL start together with docker compose up.',
    steps: [
      { title: 'Dockerfile', detail: 'Copy the dependency list and install before copying the code (so Docker caches the slow layer), run as a non-root user and add a health check. Add a .dockerignore for .git, .env, tests and caches.', code: DOCKERFILE },
      { title: 'Compose for local runs', detail: 'Run the API next to PostgreSQL with a named volume, a database health check the API waits for, and the password from a .env file that git ignores.', code: compose(c) },
      { title: 'Inspect the image', detail: 'Check the image size with docker images and the layers with docker history. Run it, stop the database and watch /health fail, then start it again and watch it recover.' },
    ],
    hints: ['Slim base images are smaller and have fewer vulnerabilities than full ones.', 'docker compose config prints the final file with variables filled in.'],
    acceptance: ['The image runs as a non-root user.', 'docker compose up starts a working API and database.', 'No secret is baked into the image.'],
    repo: { paths: ['Dockerfile', '.dockerignore', 'compose.yaml'] },
    self_check: ['Why does the order of Dockerfile instructions matter?', 'What could an attacker do inside a container running as root?'],
    commit: 'build: Dockerfile and compose',
    topics: ['dev.containers-ci.docker-dockerfile', 'dev.containers-ci.docker-compose'],
  }),
};

const ciStage: StageTemplate<Ctx> = {
  id: 'ci',
  minutes: [25, 15, 15],
  build: (c) => ({
    title: 'Continuous integration',
    goal: 'Every push is linted, tested, built into an image tagged with the commit, scanned for vulnerabilities and, on main, pushed to a registry.',
    steps: [
      { title: 'The pipeline', detail: 'Add a GitHub Actions workflow: lint and test, build the image, scan it with Trivy (failing on high or critical issues), and push it to GitHub Container Registry only from main.', code: ci(c) },
      { title: 'Protect main', detail: 'Turn on branch protection: pull requests only, CI must pass. Open a pull request with a failing test and watch it get blocked.' },
      { title: 'Tag by commit', detail: 'Tag images with the commit SHA, never only "latest", so every running version can be traced back to its code and redeployed exactly.' },
    ],
    hints: ['Give the workflow the least permissions it needs (the permissions block).', 'Cache dependencies to keep runs under a few minutes.'],
    acceptance: ['CI runs lint, tests, build and scan on every push.', 'Images are tagged with the commit SHA.', 'main cannot receive a change whose CI failed.'],
    repo: { paths: ['.github/workflows/*.yml'] },
    self_check: ['Why tag images with the commit SHA instead of latest?', 'What does the vulnerability scan catch, and what does it miss?'],
    commit: 'ci: lint, test, build, scan and push',
    topics: ['dev.containers-ci.ci-cd', 'dev.cloud-ops.devsecops'],
  }),
};

const infraStage: StageTemplate<Ctx> = {
  id: 'infrastructure',
  minutes: [25, 25, 20],
  build: (c) => ({
    title: pick(c, { 'docker-actions': 'A hardened Linux server', 'kubernetes-helm': 'Kubernetes manifests', 'terraform-aws': 'Infrastructure as code' }),
    goal: pick(c, {
      'docker-actions': 'A Linux server accepts only SSH keys, has a firewall, runs Docker, and serves the API over HTTPS through Caddy.',
      'kubernetes-helm': 'The API runs on a local kind cluster with two replicas, probes, resource limits and a database secret.',
      'terraform-aws': 'Terraform creates the network, the PostgreSQL database and the image registry on AWS from code, with remote state.',
    }),
    steps: pick(c, {
      'docker-actions': [
        { title: 'Get a server', detail: 'Create a small Ubuntu server (a free-tier cloud VM or the cheapest VPS) and point a domain or a free subdomain at its IP address.' },
        { title: 'Harden it and add HTTPS', detail: 'Create a deploy user, allow SSH keys only, turn on the firewall and automatic security updates, install Docker, and put Caddy in front of the API for automatic HTTPS.', code: INFRA['docker-actions'](c) },
        { title: 'First manual deploy', detail: 'Copy compose.yaml and .env to /srv on the server, pull the image and start it. Open the API over HTTPS and check the certificate.' },
      ],
      'kubernetes-helm': [
        { title: 'A local cluster', detail: 'Install kind and kubectl, create a cluster and load or pull your image. Run PostgreSQL in the cluster (a StatefulSet or a chart) and create a Secret with DATABASE_URL.' },
        { title: 'Deployment and Service', detail: 'Write the Deployment (two replicas, readiness and liveness probes, requests and limits, non-root) and the Service.', code: INFRA['kubernetes-helm'](c) },
        { title: 'Break it on purpose', detail: 'kubectl apply, then delete a pod and watch a new one start; stop the database and watch readiness fail and traffic stop. Use kubectl describe and logs to explain each event.' },
      ],
      'terraform-aws': [
        { title: 'Accounts and safety first', detail: 'Use an AWS account with MFA on the root user and an admin IAM user for yourself. Set a billing alarm before creating anything, and create the state bucket with versioning.' },
        { title: 'Network, database and registry', detail: 'Write Terraform for the VPC, a security group that only lets the app reach PostgreSQL, the RDS instance with its password managed in Secrets Manager, and an ECR repository.', code: INFRA['terraform-aws'](c) },
        { title: 'Plan, apply, read the state', detail: 'Run terraform fmt, validate and plan, read every line of the plan, then apply. Change one setting and see how the plan shows only that change.' },
      ],
    }),
    hints: pick(c, {
      'docker-actions': ['Keep a second SSH session open while changing SSH settings, so a mistake cannot lock you out.', 'Expose only ports 22, 80 and 443.'],
      'kubernetes-helm': ['kubectl get events --sort-by=.lastTimestamp explains most failures.', 'Requests decide scheduling; limits stop one pod starving the others.'],
      'terraform-aws': ['Never commit terraform.tfstate or .tfvars with secrets.', 'Small instance classes and no NAT gateway keep the bill near zero; destroy what you do not use.'],
    }),
    acceptance: pick(c, {
      'docker-actions': ['Password log-in and root log-in are off.', 'Only ports 22, 80 and 443 are open.', 'The API is served over HTTPS.'],
      'kubernetes-helm': ['Two replicas run with probes and resource limits.', 'The database address comes from a Secret.', 'A deleted pod is replaced automatically.'],
      'terraform-aws': ['terraform plan on a clean checkout shows no changes.', 'State is stored remotely with locking.', 'The database is not reachable from the internet.'],
    }),
    repo: { paths: [pick(c, { 'docker-actions': 'deploy/**', 'kubernetes-helm': 'k8s/**', 'terraform-aws': 'infra/**' })] },
    self_check: pick(c, {
      'docker-actions': ['What did you do to harden the server, and why each step?', 'How does Caddy get and renew the HTTPS certificate?'],
      'kubernetes-helm': ['What happens, step by step, when a readiness probe fails?', 'Deployment versus StatefulSet: when do you use each?'],
      'terraform-aws': ['Why keep Terraform state remote and locked?', 'How did you make sure the database is private?'],
    }),
    commit: pick(c, { 'docker-actions': 'ops: server setup and HTTPS', 'kubernetes-helm': 'ops: Kubernetes manifests', 'terraform-aws': 'infra: network, database and registry' }),
    topics: TOPICS[lang(c)].infra,
  }),
};

const deployStage: StageTemplate<Ctx> = {
  id: 'deploy',
  minutes: [20, 25, 15],
  build: (c) => ({
    title: pick(c, { 'docker-actions': 'Continuous deployment', 'kubernetes-helm': 'A Helm chart and releases', 'terraform-aws': 'Run on ECS Fargate' }),
    goal: pick(c, {
      'docker-actions': 'Merging to main deploys the new image to the server automatically, checks /health and can be rolled back in one command.',
      'kubernetes-helm': 'The app is packaged as a Helm chart with values per environment, released by commit tag, and rolled back with one command.',
      'terraform-aws': 'The API runs on ECS Fargate behind a load balancer, and GitHub Actions deploys new versions with short-lived OIDC credentials.',
    }),
    steps: [
      { title: 'Design the release', detail: 'Write down how a commit becomes a running version: which job builds it, where the image tag is set, how the new version is checked and what happens if the check fails.' },
      { title: pick(c, { 'docker-actions': 'Deploy job', 'kubernetes-helm': 'Chart and release', 'terraform-aws': 'Service and deploy pipeline' }), detail: pick(c, { 'docker-actions': 'Add a deploy workflow that runs after CI succeeds on main: SSH in as the deploy user, pull the new tag, restart the API and check /health. Store the host and key as environment secrets.', 'kubernetes-helm': 'Turn the manifests into a Helm chart with values for the image tag, replicas and resources, and release with --atomic so a failed upgrade rolls back by itself.', 'terraform-aws': 'Add the task definition, ECS service and an application load balancer with a health check on /health. Let GitHub Actions assume an IAM role through OIDC to apply new image tags.' }), code: DEPLOY[lang(c)](c) },
      { title: 'Practise a rollback', detail: 'Deploy a version whose /health fails on purpose, watch the release stop or fail, then roll back to the previous tag and time how long it took. Write the steps in the README.' },
    ],
    hints: ['A deploy that does not check health afterwards is only half a deploy.', 'Keep the previous image tag noted somewhere you can find in a hurry.'],
    acceptance: ['A merge to main ends with the new version running.', 'Every release is checked with /health.', 'A rollback to the previous version is documented and was practised.'],
    repo: { paths: [pick(c, { 'docker-actions': '.github/workflows/*.yml', 'kubernetes-helm': 'chart/**', 'terraform-aws': 'infra/**' })] },
    self_check: ['Continuous delivery versus continuous deployment: which did you build?', 'How do you know a deploy succeeded, and how long does a rollback take?'],
    commit: pick(c, { 'docker-actions': 'cd: deploy on merge with health check', 'kubernetes-helm': 'deploy: Helm chart and releases', 'terraform-aws': 'deploy: ECS service with OIDC pipeline' }),
    topics: TOPICS[lang(c)].deploy,
  }),
};

const secretsStage: StageTemplate<Ctx> = {
  id: 'secrets',
  minutes: [15, 20, 15],
  build: (c) => ({
    title: 'Secrets and configuration',
    goal: 'Every secret lives in a secret store, none are in git (checked automatically), and a database password can be rotated without downtime.',
    steps: [
      { title: 'Inventory', detail: 'List every secret and setting the system uses (database password, registry token, SSH key, API keys), where each lives today and who can read it.' },
      { title: 'Move them to a store', detail: pick(c, { 'docker-actions': 'Keep deploy secrets in GitHub environment secrets and the server .env readable only by the deploy user (chmod 600). Nothing secret goes in compose.yaml.', 'kubernetes-helm': 'Keep secrets out of the chart: create Kubernetes Secrets from a sealed or external source (Sealed Secrets or the External Secrets Operator), and mount them as environment variables.', 'terraform-aws': 'Keep secrets in AWS Secrets Manager, give the ECS execution role permission to read only those, and never put a secret in a Terraform variable file in git.' }) },
      { title: 'Scan and rotate', detail: 'Add gitleaks to CI to block commits that contain secrets. Then rotate the database password end to end and confirm the app keeps working.' },
    ],
    hints: ['If a secret was ever committed, rotate it: deleting the commit is not enough.', 'Least privilege: each part of the system can read only the secrets it needs.'],
    acceptance: ['No secret is in the repository or image (gitleaks passes).', 'Each secret has one documented home.', 'A password rotation was done without downtime.'],
    repo: { paths: ['.github/workflows/*.yml', 'README.md'] },
    self_check: ['What would you do in the first hour after a secret leaked?', 'How does your app get its database password at runtime?'],
    commit: 'sec: secrets store and leak scanning',
    topics: ['dev.cloud-ops.devsecops', 'dev.cloud-ops.cloud-platforms-iam'],
  }),
};

const observeStage: StageTemplate<Ctx> = {
  id: 'observability',
  minutes: [20, 25, 15],
  build: (c) => ({
    title: 'Monitoring and alerts',
    goal: 'Dashboards show request rate, errors and latency, logs are searchable, and an alert reaches you when the API is down or failing.',
    steps: [
      { title: 'Golden signals', detail: 'Decide what "healthy" means: request rate, error rate (5xx), latency (p95) and saturation. Write a target, for example 99.5% of requests succeed over 30 days.' },
      { title: 'Metrics and dashboards', detail: pick(c, { 'docker-actions': 'Run Prometheus and Grafana next to the app, scrape /metrics and build a dashboard with the four signals.', 'kubernetes-helm': 'Install the kube-prometheus-stack chart, add a ServiceMonitor to your chart and build a Grafana dashboard with the four signals.', 'terraform-aws': 'Use CloudWatch metrics from the load balancer and ECS, send logs to CloudWatch Logs, and add alarms and a monthly budget in Terraform.' }), code: OBSERVE[lang(c)] },
      { title: 'Alerts and an uptime check', detail: 'Alert on the API being down for 2 minutes and on the error rate above your target for 5 minutes, sent to email or a chat app. Trigger each alert on purpose once.' },
    ],
    hints: ['Alert on symptoms users feel (errors, slowness), not on every CPU spike.', 'Structured JSON logs with a request id make one request easy to follow.'],
    acceptance: ['A dashboard shows rate, errors and latency.', 'Logs can be searched by request id or status.', 'Down and error-rate alerts were each triggered once on purpose.'],
    repo: { paths: [pick(c, { 'docker-actions': 'monitoring/**', 'kubernetes-helm': 'chart/**', 'terraform-aws': 'infra/**' })] },
    self_check: ['What are the four golden signals?', 'Why alert on symptoms rather than causes?'],
    commit: 'ops: metrics, dashboards and alerts',
    topics: TOPICS[lang(c)].observe,
  }),
};

const scaleStage: StageTemplate<Ctx> = {
  id: 'resilience',
  minutes: [20, 20, 20],
  build: (c) => ({
    title: pick(c, { 'docker-actions': 'Backups and restore', 'kubernetes-helm': 'Autoscaling and disruption budgets', 'terraform-aws': 'Autoscaling and high availability' }),
    goal: pick(c, {
      'docker-actions': 'The database is backed up every night off the server, a restore has been tested, and a load test shows the limits of the server.',
      'kubernetes-helm': 'The API scales with load, survives node maintenance, and a load test shows where it breaks.',
      'terraform-aws': 'The API scales with load across two availability zones, and a load test shows where it breaks.',
    }),
    steps: pick(c, {
      'docker-actions': [
        { title: 'Nightly backups', detail: 'Add a cron job that runs pg_dump inside the database container, compresses the file and copies it to object storage (or another machine). Keep 7 daily copies.' },
        { title: 'Test a restore', detail: 'Restore last night\'s backup into a fresh database and run the app against it. Time it: that is your recovery time.' },
        { title: 'Load test', detail: `Run a k6 or hey load test against ${apiPath(c)} and watch the dashboard: find the request rate where latency or errors climb, and write it down.` },
      ],
      'kubernetes-helm': [
        { title: 'Horizontal Pod Autoscaler', detail: 'Install metrics-server in kind, add an HPA (2 to 6 replicas at 70% CPU) to the chart, and check kubectl get hpa reacts.' },
        { title: 'PodDisruptionBudget', detail: 'Add a PDB with minAvailable 1 and drain a node: at least one pod must keep serving the whole time.' },
        { title: 'Load test', detail: `Run a k6 test against ${apiPath(c)} through a port-forward or ingress, watch replicas scale up and down, and note the limits.` },
      ],
      'terraform-aws': [
        { title: 'Service autoscaling', detail: 'Add Application Auto Scaling to the ECS service (1 to 4 tasks on CPU) and spread tasks across both availability zones.' },
        { title: 'Database resilience', detail: 'Turn on automated RDS backups with 7 days retention and restore a snapshot into a new instance once. Note what Multi-AZ would cost and when it is worth it.' },
        { title: 'Load test', detail: `Run a k6 test against ${apiPath(c)} through the load balancer, watch tasks scale, and note the limits and the cost per hour at peak.` },
      ],
    }),
    hints: ['An untested backup is not a backup.', 'Load test a staging copy, never production you share with others.'],
    acceptance: pick(c, {
      'docker-actions': ['Backups run nightly and leave the server.', 'A restore was tested and timed.', 'The load limit is measured and written down.'],
      'kubernetes-helm': ['The HPA scales pods under load.', 'A node drain keeps the API available.', 'The load limit is measured and written down.'],
      'terraform-aws': ['Tasks scale under load across two zones.', 'Database backups are on and a restore was tested.', 'The load limit is measured and written down.'],
    }),
    repo: { paths: [pick(c, { 'docker-actions': 'deploy/**', 'kubernetes-helm': 'chart/**', 'terraform-aws': 'infra/**' }), 'loadtest/**'] },
    self_check: ['What are RPO and RTO, and what are yours?', 'What breaks first when your API gets ten times the traffic?'],
    commit: pick(c, { 'docker-actions': 'ops: backups, restore test and load test', 'kubernetes-helm': 'ops: HPA, PDB and load test', 'terraform-aws': 'infra: autoscaling, backups and load test' }),
    topics: TOPICS[lang(c)].scale,
  }),
};

const deliveryStage: StageTemplate<Ctx> = {
  id: 'delivery',
  minutes: [20, 25, 15],
  build: (c) => ({
    title: pick(c, { 'docker-actions': 'Staging and safe releases', 'kubernetes-helm': 'GitOps with Argo CD', 'terraform-aws': 'Terraform in the pipeline' }),
    goal: pick(c, {
      'docker-actions': 'Changes go to a staging copy first and are promoted to production by hand, with dependency updates arriving as pull requests.',
      'kubernetes-helm': 'The cluster syncs itself from git with Argo CD, and promotion from staging to production is a pull request.',
      'terraform-aws': 'Pull requests show a Terraform plan, merges apply it, and staging and production are separate stacks.',
    }),
    steps: pick(c, {
      'docker-actions': [
        { title: 'A staging copy', detail: 'Run a second compose project (staging) on the same server with its own database and subdomain. Deploys go to staging automatically.' },
        { title: 'Manual promotion', detail: 'Add a production job that needs a manual approval (a GitHub environment with required reviewers) and deploys the exact image tag that passed staging.' },
        { title: 'Dependency updates', detail: 'Turn on Dependabot or Renovate for Python packages, the base image and GitHub Actions, so updates arrive as tested pull requests.' },
      ],
      'kubernetes-helm': [
        { title: 'Install Argo CD', detail: 'Install Argo CD in the cluster and create an Application that points at the chart in your repository with values-staging.yaml.' },
        { title: 'Promote with pull requests', detail: 'CI updates the image tag in the staging values file; promotion to production is a pull request that copies the tag. Argo CD syncs each change.' },
        { title: 'Drift and self-heal', detail: 'Change a replica count by hand with kubectl and watch Argo CD put it back. Explain why that matters.' },
      ],
      'terraform-aws': [
        { title: 'Plan on pull requests', detail: 'A workflow runs terraform fmt -check, validate and plan on every pull request and posts the plan as a comment, using a read-only OIDC role.' },
        { title: 'Apply on merge', detail: 'Merges to main apply the saved plan with the deploy role. Protect the production environment with a required reviewer.' },
        { title: 'Staging and production', detail: 'Turn the stack into a module used by two root configurations (staging and production) with different sizes, so both are built from the same code.' },
      ],
    }),
    hints: ['Promote the same artefact (image tag) through environments; never rebuild for production.', 'Small, frequent releases are safer than big ones.'],
    acceptance: pick(c, {
      'docker-actions': ['Every change reaches staging first.', 'Production deploys need approval and use the tag tested in staging.', 'Dependency updates arrive as pull requests.'],
      'kubernetes-helm': ['Argo CD syncs the cluster from git.', 'Promotion to production is a pull request.', 'Manual drift is reverted automatically.'],
      'terraform-aws': ['Pull requests show a Terraform plan.', 'Merges apply changes with OIDC credentials.', 'Staging and production come from one module.'],
    }),
    repo: { paths: [pick(c, { 'docker-actions': '.github/**', 'kubernetes-helm': 'argocd/**', 'terraform-aws': 'infra/**' })] },
    self_check: ['Why promote the same image instead of rebuilding?', pick(c, { 'docker-actions': 'What does a staging environment protect you from?', 'kubernetes-helm': 'What does GitOps change about who can deploy?', 'terraform-aws': 'Why show the plan on the pull request?' })],
    commit: pick(c, { 'docker-actions': 'cd: staging, approvals and dependency updates', 'kubernetes-helm': 'cd: Argo CD and promotion by pull request', 'terraform-aws': 'ci: terraform plan and apply in the pipeline' }),
    topics: TOPICS[lang(c)].delivery,
  }),
};

const supplyStage: StageTemplate<Ctx> = {
  id: 'supply-chain',
  minutes: [20, 15, 15],
  build: () => ({
    title: 'Supply-chain security',
    goal: 'Images come with an SBOM and a signature that is checked before deploy, and the pipeline runs with the least privilege it needs.',
    steps: [
      { title: 'SBOM and signing', detail: 'Generate an SBOM for each image (Syft or docker buildx --sbom) and sign the image with cosign using keyless signing from GitHub Actions. Verify the signature in the deploy job before running it.' },
      { title: 'Pin and restrict', detail: 'Pin GitHub Actions to commit SHAs, give each workflow only the permissions it uses, and make the base image a pinned digest updated by Dependabot or Renovate.' },
      { title: 'Review the attack surface', detail: 'List what an attacker could do with each credential in the system and remove anything not needed. Write it up as a short threat model in the README.' },
    ],
    hints: ['A tag can be moved; a digest cannot.', 'Most supply-chain attacks start with a compromised dependency or CI token.'],
    acceptance: ['Every image has an SBOM and a signature.', 'Deploys refuse unsigned images.', 'Actions are pinned and permissions minimal.'],
    repo: { paths: ['.github/workflows/*.yml', 'README.md'] },
    self_check: ['What does signing an image prove, and what does it not?', 'Why pin actions to a commit SHA?'],
    commit: 'sec: SBOM, signing and pinned dependencies',
    topics: ['dev.cloud-ops.devsecops-supply-chain'],
  }),
};

const runbookStage: StageTemplate<Ctx> = {
  id: 'runbook',
  minutes: [20, 20, 15],
  build: (c) => ({
    title: 'Runbook, drill and write-up',
    goal: 'The README explains the architecture and how to deploy, roll back and recover, and a practised incident has a written postmortem.',
    steps: [
      { title: 'Architecture and runbook', detail: 'Draw the system (a diagram made in a tool like Excalidraw, or a Mermaid diagram) and write runbook sections: deploy, roll back, restore the database, rotate a secret, and what each alert means.' },
      { title: 'Incident drill', detail: `Break something on purpose (stop the database, ship a bad config, fill the disk), follow your runbook to fix it, and time detection and recovery for the ${c.idea.title.toLowerCase()} API.` },
      { title: 'Postmortem and costs', detail: 'Write a blameless postmortem of the drill (timeline, impact, cause, what you will change), note the monthly cost of the setup, and how to tear everything down.' },
    ],
    hints: ['A runbook is for a tired person at 3 am: short steps, exact commands.', 'Tear down cloud resources you are not using; check the bill a day later.'],
    acceptance: ['The README has an architecture diagram and runbook sections.', 'An incident drill was run and timed.', 'A postmortem and a cost note are written.'],
    repo: { paths: ['README.md', 'docs/**'], readme: ['Architecture', 'Runbook'] },
    self_check: ['Walk through your system from a user request to the database and back.', 'What did the drill teach you that you did not expect?'],
    commit: 'docs: architecture, runbook and postmortem',
    topics: ['dev.cloud-ops.sre-practices-incidents', 'dev.cloud-ops.sre-practices-postmortems'],
  }),
};

const STAGES: Record<ProjectLevel, StageTemplate<Ctx>[]> = {
  beginner: [],
  intermediate: [serviceStage, containerStage, ciStage, infraStage, deployStage, secretsStage, observeStage, runbookStage],
  advanced: [serviceStage, containerStage, ciStage, infraStage, deployStage, secretsStage, observeStage, scaleStage, deliveryStage, supplyStage, runbookStage],
};

const LEVELS: ProjectLevel[] = ['intermediate', 'advanced'];
const stack = (s: Omit<StackDef, 'kind' | 'levels' | 'roles' | 'lang'>): StackDef => ({ kind: 'devops', levels: LEVELS, roles: ['devops', 'backend'], lang: 'yaml', ...s });

export const DEVOPS = {
  stacks: [
    stack({ key: 'docker-actions', label: 'Docker + GitHub Actions + a Linux server', short: 'Docker + Actions', tech: ['Docker', 'GitHub Actions', 'Linux', 'Caddy', 'Prometheus', 'Grafana'], skills: ['docker', 'ci-cd', 'linux', 'nginx', 'observability'], modules: ['dev.linux-networking', 'dev.containers-ci'], host: 'a small Linux VPS or free-tier VM' }),
    stack({ key: 'kubernetes-helm', label: 'Kubernetes + Helm + Prometheus', short: 'Kubernetes', tech: ['Kubernetes', 'Helm', 'kind', 'Prometheus', 'Argo CD'], skills: ['kubernetes', 'docker', 'ci-cd', 'observability', 'gitops'], modules: ['dev.containers-ci', 'dev.cloud-ops'], host: 'a local kind cluster (or any managed Kubernetes free tier)' }),
    stack({ key: 'terraform-aws', label: 'Terraform + AWS (ECS Fargate, RDS)', short: 'Terraform + AWS', tech: ['Terraform', 'AWS', 'ECS Fargate', 'RDS', 'GitHub Actions'], skills: ['terraform', 'cloud-platforms', 'docker', 'ci-cd', 'observability'], modules: ['dev.containers-ci', 'dev.cloud-ops'], host: 'AWS (free tier where possible, torn down after)' }),
  ],
  plan: {
    kind: 'devops',
    stages: (level: ProjectLevel) => STAGES[level],
    outcome: (c: Ctx) =>
      `A production-style setup for the ${c.idea.title.toLowerCase()} API on ${c.stack.short}: a small non-root container, CI with tests and vulnerability scans, ${pick(c, { 'docker-actions': 'a hardened server with HTTPS and deploy on merge', 'kubernetes-helm': 'a Helm chart with probes, limits and atomic releases', 'terraform-aws': 'infrastructure as code with ECS Fargate, RDS and OIDC deploys' })}, managed secrets, dashboards and alerts, and a practised rollback and incident drill${c.level === 'advanced' ? `, plus ${pick(c, { 'docker-actions': 'tested backups, a staging environment', 'kubernetes-helm': 'autoscaling, GitOps with Argo CD', 'terraform-aws': 'autoscaling across zones, plan-on-PR pipelines' })} and signed images with SBOMs` : ''}.`,
    readme: () => ['Architecture', 'Pipeline', 'Deploy', 'Runbook', 'Monitoring', 'Costs', 'Tear down'],
    deploy: (c: Ctx) => [
      'Push everything (code, Dockerfile, pipelines, infrastructure code) to a public GitHub repository without secrets.',
      `Run the full pipeline from a clean commit to a running service on ${c.stack.host}.`,
      'Record a short video: a commit, the pipeline, the dashboard, and a rollback.',
      'Add the architecture diagram and runbook to the README.',
      'Tear down paid resources when you are done and note the total cost.',
      `Put "${c.stack.short} deployment of a ${c.idea.title.toLowerCase()} API" and the repository link on your resume.`,
    ],
    verbs: ['Automated', 'Containerised', 'Deployed', 'Provisioned', 'Monitored', 'Secured', 'Hardened'],
  } satisfies KindPlan<Ctx>,
};
