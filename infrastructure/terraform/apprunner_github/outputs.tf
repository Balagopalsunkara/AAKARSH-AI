output "backend_service_arn" {
  description = "ARN of the backend App Runner service built directly from GitHub"
  value       = aws_apprunner_service.backend.arn
}

output "backend_service_url" {
  description = "Public URL of the backend App Runner service"
  value       = aws_apprunner_service.backend.service_url
}

output "frontend_service_arn" {
  description = "ARN of the frontend App Runner service built directly from GitHub"
  value       = aws_apprunner_service.frontend.arn
}

output "frontend_service_url" {
  description = "Public URL of the frontend App Runner service"
  value       = aws_apprunner_service.frontend.service_url
}
