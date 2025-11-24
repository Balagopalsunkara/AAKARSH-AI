#!/usr/bin/env bash
# Deploy or update the AI-APP backend on AWS App Runner from CloudShell.
#
# Usage:
#   ./scripts/deploy_backend_apprunner.sh -a <codeconnection-arn> [-r <region>] [-b <branch>] [-s <service-name>] [-p <aws-profile>]
#
# Example:
#   ./scripts/deploy_backend_apprunner.sh \
#     -a arn:aws:codeconnections:us-east-1:123456789012:connection/abc123 \
#     -r us-east-1
#
# The script will:
#   * Generate the App Runner source configuration pointing at the GitHub repo (backend directory)
#   * Create the backend service if it does not exist, otherwise update it
#   * Wait for the deployment to finish and print the public Service URL

set -euo pipefail

usage() {
  cat <<'USAGE'
Usage: deploy_backend_apprunner.sh -a <codeconnection-arn> [options]

Required arguments:
  -a  CodeConnections ARN that grants App Runner access to the GitHub repository.

Optional arguments:
  -r  AWS region (default: us-east-1)
  -b  Git branch to deploy (default: main)
  -s  App Runner service name (default: ai-app-backend-github)
  -p  AWS profile to use (default: current CLI context)
  -h  Show this help message
USAGE
  exit 1
}

CONNECTION_ARN=""
REGION="us-east-1"
BRANCH="main"
SERVICE_NAME="ai-app-backend-github"
PROFILE=""

while getopts "a:r:b:s:p:h" opt; do
  case "$opt" in
    a) CONNECTION_ARN="$OPTARG" ;;
    r) REGION="$OPTARG" ;;
    b) BRANCH="$OPTARG" ;;
    s) SERVICE_NAME="$OPTARG" ;;
    p) PROFILE="$OPTARG" ;;
    h|*) usage ;;
  esac
done
shift $((OPTIND - 1))

[[ -z "$CONNECTION_ARN" ]] && usage

aws_cli() {
  if [[ -n "$PROFILE" ]]; then
    aws --profile "$PROFILE" --region "$REGION" "$@"
  else
    aws --region "$REGION" "$@"
  fi
}

REPO_URL="https://github.com/Balagopalsunkara/AI-APP"
TMP_SOURCE_FILE="$(mktemp)"
trap 'rm -f "$TMP_SOURCE_FILE"' EXIT

cat <<EOF >"$TMP_SOURCE_FILE"
{
  "CodeRepository": {
    "RepositoryUrl": "$REPO_URL",
    "SourceCodeVersion": {
      "Type": "BRANCH",
      "Value": "$BRANCH"
    },
    "SourceDirectory": "backend",
    "CodeConfiguration": {
      "ConfigurationSource": "API",
      "CodeConfigurationValues": {
        "Runtime": "NODEJS_18",
        "BuildCommand": "npm install",
        "StartCommand": "npm run start",
        "Port": "4000",
        "RuntimeEnvironmentVariables": [
          {"Name": "NODE_ENV", "Value": "production"},
          {"Name": "PORT", "Value": "4000"}
        ]
      }
    }
  },
  "AuthenticationConfiguration": {
    "ConnectionArn": "$CONNECTION_ARN"
  },
  "AutoDeploymentsEnabled": true
}
EOF

SERVICE_ARN=$(aws_cli apprunner list-services \
  --query "ServiceSummaryList[?ServiceName=='$SERVICE_NAME'].ServiceArn | [0]" \
  --output text)

if [[ "$SERVICE_ARN" == "None" || -z "$SERVICE_ARN" ]]; then
  echo "[info] Creating new App Runner service '$SERVICE_NAME' in $REGION"
  CREATE_OUTPUT=$(aws_cli apprunner create-service \
    --service-name "$SERVICE_NAME" \
    --instance-configuration Cpu=1024,Memory=2048 \
    --source-configuration "file://$TMP_SOURCE_FILE")
  SERVICE_ARN=$(echo "$CREATE_OUTPUT" | jq -r '.Service.ServiceArn')
else
  echo "[info] Updating existing App Runner service '$SERVICE_NAME'"
  UPDATE_OUTPUT=$(aws_cli apprunner update-service \
    --service-arn "$SERVICE_ARN" \
    --source-configuration "file://$TMP_SOURCE_FILE")
  SERVICE_ARN=$(echo "$UPDATE_OUTPUT" | jq -r '.Service.ServiceArn')
fi

if [[ -z "$SERVICE_ARN" || "$SERVICE_ARN" == "null" ]]; then
  echo "[error] Failed to determine service ARN." >&2
  exit 1
fi

echo "[info] Waiting for deployment to reach RUNNING state..."
while true; do
  STATUS=$(aws_cli apprunner describe-service \
    --service-arn "$SERVICE_ARN" \
    --query "Service.Status" \
    --output text)

  case "$STATUS" in
    RUNNING)
      break
      ;;
    OPERATION_IN_PROGRESS)
      sleep 10
      ;;
    *)
      echo "[error] Service entered unexpected status: $STATUS" >&2
      exit 1
      ;;
  esac
done

BACKEND_URL=$(aws_cli apprunner describe-service \
  --service-arn "$SERVICE_ARN" \
  --query "Service.ServiceUrl" \
  --output text)

echo
echo "[success] Backend service is running." | tee /dev/stderr
echo "[success] Service ARN: $SERVICE_ARN" | tee /dev/stderr
echo "[success] Public URL: $BACKEND_URL" | tee /dev/stderr

echo
echo "Next steps:" | tee /dev/stderr
echo "  1. Configure Amplify (or any frontend) to use NEXT_PUBLIC_API_URL=$BACKEND_URL" | tee /dev/stderr
echo "  2. Verify health: curl -s $BACKEND_URL/health" | tee /dev/stderr
