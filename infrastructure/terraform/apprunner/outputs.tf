output "backend_ecr_repository_url" {
  description = "URI for the backend ECR repository"
  value       = aws_ecr_repository.backend.repository_url
}

output "frontend_ecr_repository_url" {
  description = "URI for the frontend ECR repository"
  value       = aws_ecr_repository.frontend.repository_url
}

output "backend_apprunner_service_arn" {
  description = "ARN of the backend App Runner service"
  value       = aws_apprunner_service.backend.arn
}

output "frontend_apprunner_service_arn" {
  description = "ARN of the frontend App Runner service"
  value       = aws_apprunner_service.frontend.arn
}

output "backend_service_url" {
  description = "Public URL for the backend App Runner service"
  value       = aws_apprunner_service.backend.service_url
}

output "frontend_service_url" {
  description = "Public URL for the frontend App Runner service"
  value       = aws_apprunner_service.frontend.service_url
}
