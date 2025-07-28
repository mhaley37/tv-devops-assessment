# ECS (Fargate) based CKDTF project for DevOps Assement

This project uses Terraform CDK (CDKTF) to create and manage:
- AWS Elastic Container Registry (ECR) repository
- AWS ECS Fargate service with associated infrastructure for running the app ()
- Application Load Balancer ( ALM ) with publicly accessible `/health` endpoint
- IAM roles & Security groups using the principle of least privelage


## Deloyment Prerequisites 

- AWS credentials ( An access Key ID as well as a secret Key )
- An S3 bucket created to act as a remote backend for terraform operations
  - The prinipal associated with the credentials needs to have access to the `"s3:ListBucket` action as well as the `s3:GetObject` & `s3:PutObject` actions on the `terraform.tfstate` key of that bucket

### Local deploy prerequisites
- Node.js 20.9+
- Docker (for pushing images to ECR)
- `cdktf-cli` npm package installed globally fow cli commands in scripts

## How to Deploy

This infrastructure allowed configuration through a number of Environment variables that are interpolated during the deployment. A valid AWS Access Key ID, secret KEY and and the name of the S3 bucket that will be used are required. Other configurations are optional, with default values

### Deploy via CICD pipeline with GitHub Actions (Preferred Method)

The GitHub Action workflow `cicd` (`.github/workflows/cicd.yml`) is used to both validate and deploy the app and infrastructure when a commit is merged to `main`.

Configuration is done via the GitHub Actions [secrets](`https://github.com/mhaley37/tv-devops-assessment/settings/secrets/actions`) ( and [variables](https://github.com/mhaley37/tv-devops-assessment/settings/variables/actions) ) in the  path of the GitHub. If any of these values need to be changed:

1. Make the changes to the GitHub actions secrets and variables
2. Run the `cicd` pipeline directly from GitHub Actions ( `workflow_dispatch` )

Secrets:

| S Name | Required | Description |
|-------------|----------|-------------|
| `AWS_ACCESS_KEY_ID` | Yes | AWS access key ID for authentication |
| `AWS_SECRET_ACCESS_KEY` | Yes | AWS secret access key for authentication |

Variables 
|  Name | Required | Default | Description |
|-------------|----------|-------------|
| `AWS_REGION` | No | us-east-1 | AWS region to use |
| `ECR_FORCE_DELETE` | No | true | true to allow ECR repo to be deleted if not empty |
| `ECR_IMAGE_TAG` | No | us-east-1 | latest | Tag to use for the image to deployed for the app server |
| `ECR_IMAGE_TAG_MUTABILITY` | No | us-east-1 | MUTABLE | MUTABLE if tags can be pushed with the same tag ( for different digets )|
| `ECR_REPOSITORY_NAME` | No | us-east-1 | tv-devops-assessment | Name to use for the ECR repo and also used as prefix |
| `ECR_SCAN_ON_PUSH` | No | us-east-1 | true | true if scan for vulnerabilities should be done when the image is pushed to ECR |
| `ECS_CONTAINER_PORT` | No | us-east-1 | 3000 | Port the the container in the ECS service is listening on |
| `TF_STATE_BUCKET` | Yes | S3 bucket name to use as remote backend |


### Deploy locally
1. **Install npm dependencies:**
   ```bash
   npm install
   ```

2. **Configure AWS credentials:**
   
   There is an `.env.example` file in this path that can be used to change the configuration. Steps to do so are:

   ```bash
   cp .env.example .env
   # Edit each configuration value wiht your own values
   # Non-Required configuration values are set with placeholder default values
   ```
    Configure these variables in your `.env` file:

    | Variable | Required | Default | Description |
    |----------|----------|---------|-------------|
    | `AWS_ACCESS_KEY_ID` | Yes | - | AWS access key ID |
    | `AWS_SECRET_ACCESS_KEY` | Yes | - | AWS secret access key |
    | `AWS_REGION` | Yes | us-east-1 | AWS region for ECR |
    | `ECR_FORCE_DELETE` | No | true | Allow ECR repo to be deleted if not empty |
    | `ECR_IMAGE_TAG` | No | edge | Tag to use for the image deployed for the app server |
    | `ECR_IMAGE_TAG_MUTABILITY` | No | MUTABLE | Image tag mutability (MUTABLE/IMMUTABLE) |
    | `ECR_REPOSITORY_NAME` | No | tv-devops-assessment | ECR repository name |
    | `ECR_SCAN_ON_PUSH` | No | true | Enable vulnerability scanning on push |
    | `ECS_CONTAINER_PORT` | No | 3000 | Port the container in the ECS service is listening on |
    | `TF_STATE_BUCKET` | Yes | - | S3 bucket name to use as remote backend |

3. **Download AWS provider:**
   ```bash
   npm run get
   ```

4. **Generate Terraform configuration:**
   ```bash
   npm run synth
   ```

5. **Deploy the application stack:**
   ```bash
   npm run deploy
   ```
```
