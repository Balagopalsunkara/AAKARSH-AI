# AWS Lambda Deployment

This directory documents how to run the Express backend on AWS Lambda behind an HTTP API and connect the hosted frontend in AWS Amplify.

## 1. Install production dependencies

```powershell
Set-Location c:\projects\AI-APP\backend
npm.cmd install --omit=dev
```

## 2. Package the Lambda artifact

```powershell
Set-Location c:\projects\AI-APP\backend
Remove-Item -Recurse -Force dist -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Path dist | Out-Null
Copy-Item *.json dist\
Copy-Item -Recurse llmService.js,ragService.js,intentDetector.js,agentReviewService.js,logger.js,metrics.js,middleware.js,nlpService.js dist\
Copy-Item -Recurse rag_storage dist\rag_storage -ErrorAction SilentlyContinue
Copy-Item app.js dist\
Copy-Item server.js dist\
Copy-Item lambdaHandler.js dist\
Copy-Item -Recurse node_modules dist\node_modules
Compress-Archive -Path dist\* -DestinationPath dist\backend-lambda.zip -Force
```

Adjust the `Copy-Item` list if you add new modules.

## 3. Create/Update the Lambda function

```powershell
aws lambda create-function `
  --function-name ai-app-backend `
  --runtime nodejs20.x `
  --handler lambdaHandler.handler `
  --zip-file fileb://dist/backend-lambda.zip `
  --role arn:aws:iam::<ACCOUNT_ID>:role/<ROLE_WITH_LAMBDA_PERMS> `
  --timeout 28 `
  --memory-size 1024 `
  --environment Variables="NODE_ENV=production"
```

Use `aws lambda update-function-code` on redeploys. Set additional environment variables with `aws lambda update-function-configuration` as needed.

## 4. Expose the Lambda through an HTTP API

```powershell
aws apigatewayv2 create-api `
  --name ai-app-backend-http `
  --protocol-type HTTP `
  --target arn:aws:lambda:<REGION>:<ACCOUNT_ID>:function:ai-app-backend
```

Grant invoke permissions before or after creation:

```powershell
aws lambda add-permission `
  --function-name ai-app-backend `
  --statement-id apigw `
  --action lambda:InvokeFunction `
  --principal apigateway.amazonaws.com `
  --source-arn arn:aws:execute-api:<REGION>:<ACCOUNT_ID>:<API_ID>/*/*/*
```

Record the API invoke URL; this is the backend base URL.

## 5. Point Amplify at the Lambda URL

```powershell
aws amplify update-branch `
  --app-id <AMPLIFY_APP_ID> `
  --branch-name <BRANCH> `
  --environment-variables NEXT_PUBLIC_API_URL=<API_INVOKE_URL>
```

Trigger a new Amplify build so the frontend picks up the updated environment variables.

## 6. Health checks

- Lambda `/health` should return HTTP 200.
- Update any monitors to hit the API Gateway invoke URL.
- Prometheus metrics remain available at `/metrics`.
