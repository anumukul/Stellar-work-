variable "environment" {
  type        = string
  description = "Environment name (dev, staging, prod)"
}

variable "ecs_cluster_name" {
  type        = string
  description = "The name of the ECS cluster"
}

variable "ecs_service_name" {
  type        = string
  description = "The name of the ECS service"
}

variable "alb_arn_suffix" {
  type        = string
  description = "The ARN suffix of the ALB"
  default     = ""
}

variable "email_recipient" {
  type        = string
  description = "Email address to receive alerts"
  default     = "alerts@stellarwork.io"
}

variable "aws_region" {
  type        = string
  description = "AWS region for dashboard metrics and monitoring"
  default     = "us-east-1"
}
