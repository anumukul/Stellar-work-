variable "environment" {
  type        = string
  description = "Environment name (dev, staging, prod)"
}

variable "vpc_id" {
  type        = string
  description = "VPC ID"
}

variable "public_subnet_ids" {
  type        = list(string)
  description = "List of public subnet IDs"
}

variable "private_subnet_ids" {
  type        = list(string)
  description = "List of private subnet IDs"
}

variable "alb_security_group_id" {
  type        = string
  description = "Security group ID for the ALB"
}

variable "ecs_tasks_security_group_id" {
  type        = string
  description = "Security group ID for ECS tasks"
}

variable "container_image" {
  type        = string
  description = "Docker image for the Next.js frontend"
  default     = "stellarwork-frontend:latest"
}

variable "container_port" {
  type        = number
  description = "Port exposed by the container"
  default     = 3000
}

variable "cpu" {
  type        = string
  description = "Fargate instance CPU units"
  default     = "256"
}

variable "memory" {
  type        = string
  description = "Fargate instance memory (MiB)"
  default     = "512"
}

variable "app_count" {
  type        = number
  description = "Number of ECS tasks to run"
  default     = 2
}

variable "aws_region" {
  type        = string
  description = "AWS region for logging and resources"
  default     = "us-east-1"
}

variable "certificate_arn" {
  type        = string
  description = "ARN of the ACM certificate for HTTPS listener"
  default     = ""
}

variable "ssl_policy" {
  type        = string
  description = "SSL Policy for HTTPS listener"
  default     = "ELBSecurityPolicy-TLS13-1-2-2021-06"
}
  description = "Fargate instance memory (MiB)"
  default     = "512"
}

variable "app_count" {
  type        = number
  description = "Number of ECS tasks to run"
  default     = 2
}

variable "enable_deployment_circuit_breaker" {
  type        = bool
  description = "Enable deployment circuit breaker for ECS service"
  default     = true
}

variable "enable_deployment_rollback" {
  type        = bool
  description = "Enable automatic rollback on deployment failure"
  default     = true
}

variable "health_check_grace_period_seconds" {
  type        = number
  description = "Seconds to ignore failing load balancer health checks on newly instantiated tasks"
  default     = 60
}
