variable "aws_region" {
  description = "AWS region to deploy resources"
  type        = string
  default     = "us-east-1"
}

variable "project_name" {
  description = "Prefix for shared resource names"
  type        = string
  default     = "ai-app"
}

variable "github_connection_arn" {
  description = "ARN of the App Runner / CodeConnections GitHub connection"
  type        = string
}

variable "repository_url" {
  description = "HTTPS URL of the GitHub repository"
  type        = string
  default     = "https://github.com/Balagopalsunkara/AI-APP"
}

variable "branch" {
  description = "Git branch to deploy"
  type        = string
  default     = "main"
}

variable "enable_auto_deployments" {
  description = "Allow App Runner to redeploy automatically when the branch updates"
  type        = bool
  default     = true
}

variable "backend_source_directory" {
  description = "Path to the backend code within the repository"
  type        = string
  default     = "backend"
}

variable "frontend_source_directory" {
  description = "Path to the frontend code within the repository"
  type        = string
  default     = "frontend"
}

variable "backend_runtime_env" {
  description = "Environment variables for the backend service"
  type        = map(string)
  default     = {
    NODE_ENV = "production"
    PORT     = "4000"
  }
}

variable "frontend_runtime_env" {
  description = "Environment variables for the frontend service"
  type        = map(string)
  default     = {
    NODE_ENV            = "production"
    NEXT_PUBLIC_API_URL = "https://replace-with-backend-url"
  }
}

variable "backend_cpu" {
  description = "Backend App Runner CPU setting"
  type        = string
  default     = "1024"
}

variable "backend_memory" {
  description = "Backend App Runner memory setting"
  type        = string
  default     = "2048"
}

variable "frontend_cpu" {
  description = "Frontend App Runner CPU setting"
  type        = string
  default     = "1024"
}

variable "frontend_memory" {
  description = "Frontend App Runner memory setting"
  type        = string
  default     = "2048"
}

variable "apprunner_min_size" {
  description = "Minimum number of running instances"
  type        = number
  default     = 1
}

variable "apprunner_max_size" {
  description = "Maximum number of running instances"
  type        = number
  default     = 3
}

variable "apprunner_max_concurrency" {
  description = "Maximum concurrent requests per instance"
  type        = number
  default     = 20
}

variable "common_tags" {
  description = "Tags to apply to all managed resources"
  type        = map(string)
  default     = {
    Project = "AI-APP"
    DeployedBy = "Terraform"
  }
}
