# ECR + ECS Fargate Infrastructure with CDKTF

This project uses Terraform CDK (CDKTF) to create and manage:
- AWS Elastic Container Registry (ECR) repository
- AWS ECS Fargate service with associated infrastructure
- VPC with public subnets and networking components
- IAM roles for secure access

## Infrastructure Components

This CDKTF project creates the following AWS resources:

### Container Infrastructure
- **ECR Repository**: Container image registry with encryption and vulnerability scanning
- **ECS Fargate Cluster**: Serverless container orchestration
- **ECS Service**: Manages container instances with auto-scaling capabilities
- **ECS Task Definition**: Defines container specifications and resource requirements

### Networking
- **VPC**: Isolated network environment (10.0.0.0/16)
- **Public Subnets**: Two subnets across different availability zones
- **Internet Gateway**: Provides internet access for containers
- **Route Tables**: Network routing configuration
- **Security Group**: Firewall rules for ECS service (HTTP/HTTPS access)

### Security & Access
- **ECR Access IAM Role**: Dedicated role for ECR push/pull operations
- **ECS Task Execution Role**: Role for ECS to pull images and write logs
- **Repository Policy**: Restricts ECR access to specific roles only
- **Security Groups**: Network-level access control

## Prerequisites

- Node.js 20.9+
- AWS CLI configured or AWS credentials
- Docker (for pushing images to ECR)

## Quick Start

1. **Setup the project:**
   ```bash
   npm run setup
   ```

2. **Configure AWS credentials:**
   Edit the `.env` file with your AWS credentials:
   ```bash
   cp .env.example .env
   # Edit .env with your AWS credentials
   ```

3. **Download AWS provider:**
   ```bash
   npm run get
   ```

4. **Generate Terraform configuration:**
   ```bash
   npm run synth
   ```

5. **Deploy the ECR repository:**
   ```bash
   npm run deploy
   ```

## Environment Variables

Configure these variables in your `.env` file:

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `AWS_ACCESS_KEY_ID` | Yes | - | AWS access key ID |
| `AWS_SECRET_ACCESS_KEY` | Yes | - | AWS secret access key |
| `AWS_REGION` | Yes | us-east-1 | AWS region for ECR |
| `ECR_REPOSITORY_NAME` | No | tv-devops-assessment | ECR repository name |
| `ECR_IMAGE_TAG_MUTABILITY` | No | MUTABLE | Image tag mutability (MUTABLE/IMMUTABLE) |
| `ECR_SCAN_ON_PUSH` | No | true | Enable vulnerability scanning on push |

## AWS Credentials Setup

### Environment Variables (Development)
```bash
# In .env file
AWS_ACCESS_KEY_ID=your_access_key
AWS_SECRET_ACCESS_KEY=your_secret_key
AWS_REGION=us-east-1
```


## Required AWS Permissions

The AWS credentials need the following ECR permissions:
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "ecr:CreateRepository",
        "ecr:DeleteRepository",
        "ecr:DescribeRepositories",
        "ecr:PutRepositoryPolicy",
        "ecr:DeleteRepositoryPolicy",
        "ecr:SetRepositoryPolicy",
        "ecr:GetRepositoryPolicy"
      ],
      "Resource": "*"
    }
  ]
}
```

## Using the ECR Repository

After deployment, you'll get outputs including:
- ECR Repository URL
- Docker login command

### Push an image to ECR:

1. **Authenticate Docker:**
   ```bash
   aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin <repository-url>
   ```

2. **Tag your image:**
   ```bash
   docker tag your-app:latest <repository-url>:latest
   ```

3. **Push the image:**
   ```bash
   docker push <repository-url>:latest
   ```

## Project Structure

```
iac/
├── main.ts              # Main CDKTF stack definition
├── package.json         # Node.js dependencies and scripts
├── cdktf.json          # CDKTF configuration
├── .env.example        # Environment variables template
├── .env                # Your environment variables (gitignored)
├── setup-assistant.js  # Setup helper script
└── README.md           # This file
```

## Security Best Practices

- ✅ Never commit `.env` files to version control
- ✅ Use IAM roles in production instead of access keys
- ✅ Regularly rotate access keys
- ✅ Follow principle of least privilege for permissions
- ✅ Enable ECR image scanning (enabled by default)
- ✅ Use encryption at rest (enabled by default)

## Troubleshooting

### Common Issues:

1. **"Unable to locate credentials"**
   - Check your `.env` file has correct AWS credentials
   - Ensure AWS CLI is configured if using profiles

2. **"Repository already exists"**
   - ECR repository names must be unique within an AWS account
   - Change `ECR_REPOSITORY_NAME` in `.env` file

3. **Permission denied errors**
   - Verify your AWS credentials have ECR permissions
   - Check IAM policies attached to your user/role

### Getting Help:

- Check AWS CloudTrail for detailed error logs
- Use `npm run diff` to see what changes will be made
- Run `npm run synth` to validate configuration locally
