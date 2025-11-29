# Deployment Workflows

This directory contains GitHub Actions workflows for deploying the Cascade MCP Auth Bridge to different environments.

## Overview

The deployment workflows use [Bitovi's GitHub Actions Deploy Docker to EC2](https://github.com/bitovi/github-actions-deploy-docker-to-ec2) action to provision AWS infrastructure and deploy the Dockerized application to EC2 instances.

You will need a .env file containing the following variables. The example workflow below expects the file to be called `repo_env`.
```
AWS_SECRET_ACCESS_KEY=$AWS_SECRET_ACCESS_KEY
AWS_ACCESS_KEY_ID=$AWS_ACCESS_KEY_ID
VITE_COMMIT_SHA=$VITE_COMMIT_SHA
VITE_AUTH_SERVER_URL=$VITE_AUTH_SERVER_URL
VITE_JIRA_CLIENT_ID=$VITE_JIRA_CLIENT_ID
VITE_JIRA_SCOPE=$VITE_JIRA_SCOPE
VITE_JIRA_CALLBACK_URL=$VITE_JIRA_CALLBACK_URL
VITE_JIRA_API_URL=$VITE_JIRA_API_URL
VITE_STATUS_REPORTS_ENV=$VITE_STATUS_REPORTS_ENV
JIRA_CLIENT_SECRET=$JIRA_CLIENT_SECRET
FIGMA_CLIENT_ID=$FIGMA_CLIENT_ID
FIGMA_OAUTH_SCOPES=$FIGMA_OAUTH_SCOPES
FIGMA_CLIENT_SECRET=$FIGMA_CLIENT_SECRET
PORT=$PORT
```

```yaml
name: Deploy Cascade-MCP

jobs:
  Build-Server:
    runs-on: ubuntu-latest
    environment:
      name: cascade
      url: ${{ steps.deploy.outputs.vm_url}}
    steps:
      - id: deploy
        name: Deploy
        uses: bitovi/github-actions-deploy-docker-to-ec2@v1
        with:
          checkout: true
          aws_access_key_id: ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws_secret_access_key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws_default_region: us-east-1

          aws_resource_identifier: bitovi-jira-mcp-auth-bridge-prod
          tf_state_bucket: bitovi-jira-mcp-auth-bridge-tf-state
          tf_state_bucket_destroy: true # Destroy bucket if stack is destroyed

          aws_r53_enable: true
          aws_r53_create_sub_cert: true
          aws_r53_sub_domain_name: cascade
          aws_r53_domain_name: bitovi.tools
          aws_elb_app_port: 3000

          docker_full_cleanup: true

          aws_ec2_instance_type: t3.small
          aws_ec2_instance_root_vol_size: 16

          repo_env: repo_env # Adjust this name if changing your variables file name.
```

## Workflows

### 1. `deploy-staging.yaml` - Deploy Staging

**Purpose**: Automatically deploys the latest changes from the `main` branch to the staging environment for testing and validation.

**Triggers**:
- Push to `main` branch (ignores changes to markdown files and workflow files)
- Manual workflow dispatch via GitHub UI

**Environment**: `staging`
- **URL**: Configured via `aws_r53_sub_domain_name: cascade-staging` and `aws_r53_domain_name: bitovi.tools`
- **Resulting URL**: `https://cascade-staging.bitovi.tools`

**Deployment Flow**:
1. Checks out the code
2. Generates environment configuration via `scripts/generate-build-env.sh`
3. Deploys to AWS EC2 using Bitovi's Docker deployment action

**Concurrency**: Cancels in-progress deployments when a new one starts

---

### 2. `deploy-prod.yaml` - Deploy Latest Tag

**Purpose**: Deploys published releases to the production environment.

**Triggers**:
- GitHub release published or edited

**Environment**: `prod`
- **URL**: Configured via `aws_r53_sub_domain_name: cascade` and `aws_r53_domain_name: bitovi.tools`
- **Resulting URL**: `https://cascade.bitovi.tools`

**Deployment Flow**:
1. Checks out the code
2. Fetches the latest release tag from GitHub API
3. Generates environment configuration via `scripts/generate-build-env.sh`
4. Deploys to AWS EC2 using Bitovi's Docker deployment action
5. Includes a safeguard step that skips deployment if the current ref is not the latest tag

**Additional Infrastructure**:
- Uses explicit `aws_resource_identifier: bitovi-jira-mcp-auth-bridge-prod`
- Uses explicit `tf_state_bucket: bitovi-jira-mcp-auth-bridge-prod-tf-state`

**Concurrency**: Cancels in-progress deployments when a new one starts

---

## Common Configuration

Both workflows share similar configuration:

### Environment Variables (GitHub Secrets/Vars Required)

**AWS Credentials** (Secrets):
- `AWS_ACCESS_KEY_ID_JIRA_INTEGRATIONS`
- `AWS_SECRET_ACCESS_KEY_JIRA_INTEGRATIONS`

**OAuth Configuration**:
- **Jira** (Vars):
  - `VITE_AUTH_SERVER_URL`
  - `VITE_JIRA_CLIENT_ID`
  - `VITE_JIRA_SCOPE`
  - `VITE_JIRA_CALLBACK_URL`
  - `VITE_JIRA_API_URL`
- **Jira** (Secrets):
  - `JIRA_CLIENT_SECRET`
- **Figma** (Vars):
  - `FIGMA_CLIENT_ID`
  - `FIGMA_OAUTH_SCOPES`
- **Figma** (Secrets):
  - `FIGMA_CLIENT_SECRET`

**Environment-Specific**:
- `VITE_STATUS_REPORTS_ENV`: `staging` or `prod`
- `VITE_COMMIT_SHA`: Automatically set to current commit SHA

### AWS Infrastructure Settings

Both workflows provision the following AWS resources:

**EC2 Instance**:
- Instance type: `t3.small`
- Root volume size: `16 GB`
- Port: `3000`

**Route 53**:
- Enabled with SSL certificate auto-generation
- Domain: `bitovi.tools`
- Subdomains:
  - Staging: `cascade-staging.bitovi.tools`
  - Production: `cascade.bitovi.tools`
---

## Changing Environment Variables

Environment variables are passed to `scripts/generate-build-env.sh`. To add/remove/modify:

1. Update the `env:` section in the workflow file
2. Update the corresponding script to handle the new variable
3. Add any new secrets/variables in GitHub repository settings:
   - Settings → Secrets and variables → Actions
   - Add to appropriate environment (`staging` or `prod`)

---

## Deployment Action Details

Both workflows use [bitovi/github-actions-deploy-docker-to-ec2@v1](https://github.com/bitovi/github-actions-deploy-docker-to-ec2).

This action:
- Provisions AWS infrastructure using Terraform
- Builds and deploys Docker containers
- Configures Route 53 DNS and SSL certificates
- Manages EC2 instances and load balancers

For full configuration options, see the [action documentation](https://github.com/bitovi/github-actions-deploy-docker-to-ec2#readme).

## Related Documentation

- [Deployment Documentation](../../docs/deployment.md)
- [Generate Build Env Script](../../scripts/generate-build-env.sh)
- [Bitovi Docker to EC2 Action](https://github.com/bitovi/github-actions-deploy-docker-to-ec2)
