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

resource "aws_ecr_repository" "backend" {
  name                 = var.backend_ecr_name
  image_tag_mutability = "IMMUTABLE"
  force_delete         = false

  image_scanning_configuration {
    scan_on_push = true
  }
}

resource "aws_ecr_repository" "frontend" {
  name                 = var.frontend_ecr_name
  image_tag_mutability = "IMMUTABLE"
  force_delete         = false

  image_scanning_configuration {
    scan_on_push = true
  }
}

resource "aws_apprunner_auto_scaling_configuration_version" "default" {
  auto_scaling_configuration_name = "${var.project_name}-autoscaling"
  max_concurrency                 = var.apprunner_max_concurrency
  min_size                        = var.apprunner_min_size
  max_size                        = var.apprunner_max_size
}

resource "aws_iam_role" "apprunner_service" {
  name = "${var.project_name}-apprunner-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Service = "build.apprunner.amazonaws.com"
        }
        Action = "sts:AssumeRole"
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "apprunner_ecr" {
  role       = aws_iam_role.apprunner_service.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSAppRunnerServicePolicyForECRAccess"
}

resource "aws_apprunner_service" "backend" {
  service_name = var.backend_service_name

  source_configuration {
    image_repository {
      image_identifier      = "${aws_ecr_repository.backend.repository_url}:${var.backend_image_tag}"
      image_repository_type = "ECR"

      image_configuration {
        port = "4000"
        runtime_environment_variables = merge({
          NODE_ENV = "production"
          PORT     = "4000"
        }, var.backend_additional_env)
      }
    }

    authentication_configuration {
      access_role_arn = aws_iam_role.apprunner_service.arn
    }

    auto_deployments_enabled = var.enable_auto_deployments
  }

  instance_configuration {
    cpu    = var.backend_cpu
    memory = var.backend_memory
  }

  auto_scaling_configuration_arn = aws_apprunner_auto_scaling_configuration_version.default.arn

  health_check_configuration {
    healthy_threshold   = 1
    interval            = 10
    protocol            = "HTTP"
    path                = "/health"
    timeout             = 5
    unhealthy_threshold = 5
  }

  tags = var.common_tags
}

resource "aws_apprunner_service" "frontend" {
  service_name = var.frontend_service_name

  source_configuration {
    image_repository {
      image_identifier      = "${aws_ecr_repository.frontend.repository_url}:${var.frontend_image_tag}"
      image_repository_type = "ECR"

      image_configuration {
        port = "3000"
        runtime_environment_variables = merge({
          NODE_ENV           = "production"
          NEXT_PUBLIC_API_URL = var.frontend_next_public_api_url
        }, var.frontend_additional_env)
      }
    }

    authentication_configuration {
      access_role_arn = aws_iam_role.apprunner_service.arn
    }

    auto_deployments_enabled = var.enable_auto_deployments
  }

  instance_configuration {
    cpu    = var.frontend_cpu
    memory = var.frontend_memory
  }

  auto_scaling_configuration_arn = aws_apprunner_auto_scaling_configuration_version.default.arn

  health_check_configuration {
    healthy_threshold   = 1
    interval            = 10
    protocol            = "HTTP"
    path                = "/"
    timeout             = 5
    unhealthy_threshold = 5
  }

  tags = var.common_tags
}
