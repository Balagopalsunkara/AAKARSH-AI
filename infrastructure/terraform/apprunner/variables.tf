variable "aws_region" {
  description = "AWS region to deploy resources into"
  type        = string
  default     = "us-east-1"
}

variable "project_name" {
  description = "Prefix for resource names"
  type        = string
  default     = "ai-app"
}

variable "backend_ecr_name" {
  description = "Name of the backend ECR repository"
  type        = string
  default     = "ai-app-backend"
}

variable "frontend_ecr_name" {
  description = "Name of the frontend ECR repository"
  type        = string
  default     = "ai-app-frontend"
}

variable "backend_service_name" {
  description = "App Runner service name for the backend"
  type        = string
  default     = "ai-app-backend"
}

variable "frontend_service_name" {
  description = "App Runner service name for the frontend"
  type        = string
  default     = "ai-app-frontend"
}

variable "backend_image_tag" {
  description = "Docker image tag for the backend service"
  type        = string
  default     = "latest"
}

variable "frontend_image_tag" {
  description = "Docker image tag for the frontend service"
  type        = string
  default     = "latest"
}

variable "frontend_next_public_api_url" {
  description = "Value for NEXT_PUBLIC_API_URL environment variable"
  type        = string
  default     = "https://replace-with-backend-url"
}

variable "backend_additional_env" {
  description = "Additional environment variables for the backend"
  type        = map(string)
  default     = {}
}

variable "frontend_additional_env" {
  description = "Additional environment variables for the frontend"
  type        = map(string)
  default     = {}
}

variable "enable_auto_deployments" {
  description = "Enable automatic deployments for App Runner services"
  type        = bool
  default     = true
}

variable "backend_cpu" {
  description = "CPU configuration for the backend App Runner service"
  type        = string
  default     = "1024"
}

variable "backend_memory" {
  description = "Memory configuration for the backend App Runner service"
  type        = string
  default     = "2048"
}

variable "frontend_cpu" {
  description = "CPU configuration for the frontend App Runner service"
  type        = string
  default     = "1024"
}

variable "frontend_memory" {
  description = "Memory configuration for the frontend App Runner service"
  type        = string
  default     = "2048"
}

variable "apprunner_min_size" {
  description = "Minimum number of App Runner instances"
  type        = number
  default     = 1
}

variable "apprunner_max_size" {
  description = "Maximum number of App Runner instances"
  type        = number
  default     = 5
}

variable "apprunner_max_concurrency" {
  description = "Maximum concurrency per App Runner instance"
  type        = number
  default     = 20
}

variable "common_tags" {
  description = "Tags applied to all resources"
  type        = map(string)
  default = {
    Project = "AI-APP"
  }
}
