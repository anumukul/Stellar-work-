module "github_oidc" {
  source = "./modules/github-oidc"

  github_org         = var.github_org
  github_repo        = var.github_repo
  github_environment = var.github_environment
  role_name_prefix   = "stellarwork-${var.environment}"

  # Set to false in environments that share an AWS account with another
  # environment — the OIDC provider is account-scoped and can only exist once.
  create_oidc_provider = var.create_oidc_provider
}

module "networking" {
  source         = "./modules/networking"
  environment    = var.environment
  vpc_cidr       = var.vpc_cidr
  container_port = var.container_port
}

module "compute" {
  source                      = "./modules/compute"
  environment                 = var.environment
  vpc_id                      = module.networking.vpc_id
  public_subnet_ids           = module.networking.public_subnet_ids
  private_subnet_ids          = module.networking.private_subnet_ids
  alb_security_group_id       = module.networking.alb_security_group_id
  ecs_tasks_security_group_id = module.networking.ecs_tasks_security_group_id
  container_image             = var.container_image
  container_port              = var.container_port
  app_count                   = var.app_count
  aws_region                  = var.aws_region
  certificate_arn             = var.certificate_arn
}

module "storage" {
  source      = "./modules/storage"
  environment = var.environment
}

module "monitoring" {
  source           = "./modules/monitoring"
  environment      = var.environment
  ecs_cluster_name = module.compute.ecs_cluster_name
  ecs_service_name = module.compute.ecs_service_name
  email_recipient  = var.email_recipient
  aws_region       = var.aws_region
}
