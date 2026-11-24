# Kubernetes Deployment with Helm

This guide explains how to deploy StellarWork on a Kubernetes cluster using the included Helm chart. 

## Prerequisites

- Kubernetes 1.25+
- Helm 3.10+
- An ingress controller (e.g. ingress-nginx) for external access
- cert-manager (optional, for automatic TLS in production)

## Quick Start

```bash
# Add the chart (local path install)
helm install stellar-work ./helm/stellar-work \
  --set env.NEXT_PUBLIC_CONTRACT_ID=<your-contract-id> \
  --set env.NEXT_PUBLIC_ADMIN_ADDRESS=<your-admin-address>
```

## Environment Profiles

### Development

```bash
helm install stellar-work ./helm/stellar-work \
  -f ./helm/stellar-work/values-dev.yaml \
  --set env.NEXT_PUBLIC_CONTRACT_ID=<contract-id>
```

### Production

```bash
helm install stellar-work ./helm/stellar-work \
  -f ./helm/stellar-work/values-prod.yaml \
  --set env.NEXT_PUBLIC_CONTRACT_ID=<contract-id> \
  --set env.NEXT_PUBLIC_ADMIN_ADDRESS=<admin-address> \
  --set ingress.hosts[0].host=<your-domain>
```

## Configuration Reference

| Parameter | Description | Default |
|-----------|-------------|---------|
| `replicaCount` | Number of frontend pods | `1` |
| `image.repository` | Container image repository | `ghcr.io/anumukul/stellar-work-frontend` |
| `image.tag` | Image tag (defaults to chart appVersion) | `""` |
| `service.type` | Kubernetes service type | `ClusterIP` |
| `ingress.enabled` | Enable ingress | `false` |
| `ingress.className` | Ingress class | `nginx` |
| `autoscaling.enabled` | Enable HPA | `false` |
| `autoscaling.minReplicas` | Minimum pod count | `1` |
| `autoscaling.maxReplicas` | Maximum pod count | `5` |
| `podDisruptionBudget.enabled` | Enable PDB | `false` |
| `env.NEXT_PUBLIC_CONTRACT_ID` | Deployed escrow contract ID | `""` |
| `env.NEXT_PUBLIC_STELLAR_NETWORK` | `testnet` or `mainnet` | `testnet` |
| `env.NEXT_PUBLIC_HORIZON_URL` | Horizon API endpoint | testnet URL |
| `env.NEXT_PUBLIC_SOROBAN_RPC_URL` | Soroban RPC endpoint | testnet URL |
| `env.NEXT_PUBLIC_ADMIN_ADDRESS` | Stellar address of contract admin | `""` |

## Upgrading

```bash
helm upgrade stellar-work ./helm/stellar-work \
  -f ./helm/stellar-work/values-prod.yaml \
  --set env.NEXT_PUBLIC_CONTRACT_ID=<contract-id>
```

## Uninstalling

```bash
helm uninstall stellar-work
```
