variable "aws_region" {
  type        = string
  description = "AWS Region to deploy resources"
  default     = "us-east-1"
}

variable "environment" {
  type        = string
  description = "Environment name (dev, staging, prod)"
}

variable "vpc_cidr" {
  type        = string
  description = "VPC CIDR block"
  default     = "10.0.0.0/16"
}

variable "container_image" {
  type        = string
  description = "Docker image for the Next.js frontend"
  default     = "stellarwork-frontend:latest"
}

variable "app_count" {
  type        = number
  description = "Number of ECS tasks to run"
  default     = 2
}

variable "email_recipient" {
  type        = string
  description = "Email address to receive alerts"
  default     = "alerts@stellarwork.io"
}

variable "github_org" {
  type        = string
  description = "GitHub organisation or user name that owns the repository"
  default     = "stellarwork-io"
}

variable "github_repo" {
  type        = string
  description = "GitHub repository name (without owner prefix)"
  default     = "stellarwork"
}

variable "github_environment" {
  type        = string
  description = <<-EOT
    Name of the GitHub Actions Environment that gates terraform apply.
    Must match an Environment configured in the repository Settings.
  EOT
  default     = "production"
}

variable "create_oidc_provider" {
  type        = bool
  description = <<-EOT
    Create the IAM OIDC provider for token.actions.githubusercontent.com.
    Set to false when multiple environments share one AWS account and the
    provider already exists from a previous environment's apply.
  EOT
  default     = true
}

variable "container_port" {
  type        = number
  description = "Port exposed by the Next.js container and target group"
  default     = 3000
}

variable "certificate_arn" {
  type        = string
  description = "ARN of the ACM certificate for HTTPS listener"
  default     = ""
}
