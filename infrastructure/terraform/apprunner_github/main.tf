terraform {
  required_version = ">= 1.5.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = ">= 5.0"
    }
  }
}

provider "aws" {
  region = var.aws_region
}

resource "aws_apprunner_auto_scaling_configuration_version" "default" {
  auto_scaling_configuration_name = "${var.project_name}-github-autoscaling"
  max_concurrency                 = var.apprunner_max_concurrency
  min_size                        = var.apprunner_min_size
  max_size                        = var.apprunner_max_size
}

resource "aws_apprunner_service" "backend" {
  service_name = "${var.project_name}-backend-github"

  source_configuration {
    auto_deployments_enabled = var.enable_auto_deployments

    authentication_configuration {
      connection_arn = var.github_connection_arn
    }

    code_repository {
      repository_url = var.repository_url
      source_directory = var.backend_source_directory

      source_code_version {
        type  = "BRANCH"
        value = var.branch
      }

      code_configuration {
        configuration_source = "API"

        code_configuration_values {
          runtime                     = "NODEJS_18"
          build_command               = "npm install"
          start_command               = "npm run start"
          port                        = "4000"
          runtime_environment_variables = var.backend_runtime_env
        }
      }
    }
  }

  instance_configuration {
    cpu    = var.backend_cpu
    memory = var.backend_memory
  }

  auto_scaling_configuration_arn = aws_apprunner_auto_scaling_configuration_version.default.arn

  tags = merge(var.common_tags, {
    Component = "backend"
    Source    = "github"
  })
}

resource "aws_apprunner_service" "frontend" {
  service_name = "${var.project_name}-frontend-github"

  source_configuration {
    auto_deployments_enabled = var.enable_auto_deployments

    authentication_configuration {
      connection_arn = var.github_connection_arn
    }

    code_repository {
      repository_url = var.repository_url
      source_directory = var.frontend_source_directory

      source_code_version {
        type  = "BRANCH"
        value = var.branch
      }

      code_configuration {
        configuration_source = "API"

        code_configuration_values {
          runtime                     = "NODEJS_18"
          build_command               = "npm install && npm run build"
          start_command               = "npm run start"
          port                        = "3000"
          runtime_environment_variables = var.frontend_runtime_env
        }
      }
    }
  }

  instance_configuration {
    cpu    = var.frontend_cpu
    memory = var.frontend_memory
  }

  auto_scaling_configuration_arn = aws_apprunner_auto_scaling_configuration_version.default.arn

  tags = merge(var.common_tags, {
    Component = "frontend"
    Source    = "github"
  })
}
