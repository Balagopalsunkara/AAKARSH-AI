# AWS Deployment Toolkit

This folder contains repeatable infrastructure assets and command cheatsheets for deploying AI-APP to AWS App Runner.

## 1. Manual ECR + Docker Workflow

Replace the placeholders (everything wrapped in `< >`) with values from your AWS account.

```powershell
# 1. Authenticate the AWS CLI (skip if your shell already has credentials)
aws configure set region <AWS_REGION>
aws configure set output json

# 2. Create ECR repositories (one time)
aws ecr create-repository `
  --repository-name <BACKEND_ECR_REPO> `
  --image-scanning-configuration scanOnPush=true `
  --image-tag-mutability IMMUTABLE `
  --region <AWS_REGION>

aws ecr create-repository `
  --repository-name <FRONTEND_ECR_REPO> `
  --image-scanning-configuration scanOnPush=true `
  --image-tag-mutability IMMUTABLE `
  --region <AWS_REGION>

# 3. Authenticate Docker to ECR
$EcrUri = "<AWS_ACCOUNT_ID>.dkr.ecr.<AWS_REGION>.amazonaws.com"
aws ecr get-login-password --region <AWS_REGION> | docker login --username AWS --password-stdin $EcrUri

# 4. Build images (from repo root)
docker build -t $EcrUri/<BACKEND_ECR_REPO>:<IMAGE_TAG> backend

docker build -t $EcrUri/<FRONTEND_ECR_REPO>:<IMAGE_TAG> frontend

# 5. Push images
docker push $EcrUri/<BACKEND_ECR_REPO>:<IMAGE_TAG>
docker push $EcrUri/<FRONTEND_ECR_REPO>:<IMAGE_TAG>
```

After the pushes finish, update the App Runner services (manually in the console or with `aws apprunner start-deployment --service-arn <SERVICE_ARN>` for backend and frontend).

## 2. Terraform Configurations

- **Image based (ECR)**
  - Path: `infrastructure/terraform/apprunner`
  - Creates two ECR repositories, shared App Runner IAM role, autoscaling config, and two App Runner services that deploy pre-built container images.

Usage:

```bash
cd infrastructure/terraform/apprunner
terraform init
terraform plan -var="frontend_next_public_api_url=https://<backend-service-url>"
terraform apply
```

Overrides:
- `backend_image_tag` / `frontend_image_tag` – set to the tag you pushed (for example `terraform apply -var="backend_image_tag=20251110"`).
- `backend_additional_env` / `frontend_additional_env` – supply maps via `-var='backend_additional_env={"HUGGINGFACE_API_KEY"="..."}'`.
- `common_tags` – tag resources for billing/compliance.

- **Direct from GitHub (CodeConnections)**
  - Path: `infrastructure/terraform/apprunner_github`
  - Expects an existing GitHub connection ARN (for example `arn:aws:codeconnections:us-east-1:734115983240:connection/ca29e821-6d94-4a7c-b393-a62a4ca2ddd2`).
  - Provisions two App Runner services that build straight from the monorepo using App Runner managed runtimes.

Usage:

```bash
cd infrastructure/terraform/apprunner_github
terraform init
terraform plan \
  -var="github_connection_arn=arn:aws:codeconnections:us-east-1:734115983240:connection/ca29e821-6d94-4a7c-b393-a62a4ca2ddd2" \
  -var="frontend_runtime_env={NEXT_PUBLIC_API_URL=\"https://<backend-service-url>\"}"
terraform apply \
  -var="github_connection_arn=arn:aws:codeconnections:us-east-1:734115983240:connection/ca29e821-6d94-4a7c-b393-a62a4ca2ddd2"
```

Key variables:
- `backend_source_directory` / `frontend_source_directory` – set if you reorganise the repo layout.
- `backend_runtime_env` / `frontend_runtime_env` – extend with API keys or service URLs required at runtime.
- `enable_auto_deployments` – toggle to disable automatic redeployments on push.

## 3. CloudFormation Template

- Path: `infrastructure/cloudformation/app-runner.yaml`
- Mirrors the Terraform resources. Launch it with the AWS CLI:

```bash
aws cloudformation deploy \
  --template-file infrastructure/cloudformation/app-runner.yaml \
  --stack-name ai-app-runner \
  --capabilities CAPABILITY_NAMED_IAM \
  --parameter-overrides \
      ProjectName=ai-app \
      BackendECRRepositoryName=<BACKEND_ECR_REPO> \
      BackendImageTag=<IMAGE_TAG> \
      FrontendECRRepositoryName=<FRONTEND_ECR_REPO> \
      FrontendImageTag=<IMAGE_TAG> \
      NextPublicApiUrl=https://<backend-service-url>
```

If you store secrets in AWS Secrets Manager, add them after the stack is live using the App Runner console (`Runtime environment variables and secrets` section).

## 4. GitHub Actions Pipeline

- Workflow file: `.github/workflows/deploy-apprunner.yml`
- On every push to `main`, builds both images, pushes them to ECR, and optionally triggers App Runner deployments.

Required GitHub secrets:

| Secret | Purpose |
| --- | --- |
| `AWS_REGION` | Region that hosts ECR and App Runner |
| `AWS_ACCOUNT_ID` | Numeric AWS account ID |
| `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` **or** `AWS_ROLE_TO_ASSUME` | Credentials used by the workflow |
| `BACKEND_ECR_REPO` | Backend ECR repo name (e.g. `ai-app-backend`) |
| `FRONTEND_ECR_REPO` | Frontend ECR repo name (e.g. `ai-app-frontend`) |
| `APP_RUNNER_BACKEND_ARN` | ARN of the backend App Runner service |
| `APP_RUNNER_FRONTEND_ARN` | ARN of the frontend App Runner service |

Optional additions:
- Add `HUGGINGFACE_API_KEY`, `OPENAI_API_KEY`, etc. to App Runner as runtime secrets.
- Configure custom domains in the App Runner console after services are healthy.
