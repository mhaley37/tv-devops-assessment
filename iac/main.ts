import { Construct } from "constructs";
import { App, TerraformStack, TerraformOutput } from "cdktf";
import { AwsProvider } from "@cdktf/provider-aws/lib/provider";
import { EcrRepository } from "@cdktf/provider-aws/lib/ecr-repository";
import { IamRole } from "@cdktf/provider-aws/lib/iam-role";
import { IamRolePolicy } from "@cdktf/provider-aws/lib/iam-role-policy";
import { DataAwsCallerIdentity } from "@cdktf/provider-aws/lib/data-aws-caller-identity";
import * as dotenv from "dotenv";

// Load environment variables from .env file
dotenv.config();

class ECRStack extends TerraformStack {
  constructor(scope: Construct, id: string) {
    super(scope, id);

    // Validate required environment variables
    const requiredVars = ['AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'AWS_DEFAULT_REGION'];
    for (const varName of requiredVars) {
      if (!process.env[varName]) {
        throw new Error(`Required environment variable ${varName} is not set. Please check your .env file.`);
      }
    }

    // Configure AWS Provider with environment variables
    new AwsProvider(this, "aws", {
      region: process.env.AWS_DEFAULT_REGION || "us-east-1",
      accessKey: process.env.AWS_ACCESS_KEY_ID,
      secretKey: process.env.AWS_SECRET_ACCESS_KEY,
    });

    // Get current AWS account information
    const currentIdentity = new DataAwsCallerIdentity(this, "current-identity");

    // Get configuration from environment variables with defaults
    const repositoryName = process.env.ECR_REPOSITORY_NAME || "tv-devops-assessment";
    const imageTagMutability = process.env.ECR_IMAGE_TAG_MUTABILITY || "MUTABLE";
    const scanOnPush = process.env.ECR_SCAN_ON_PUSH === "true";

    // Create ECR Repository
    const ecrRepository = new EcrRepository(this, "ecr-repository", {
      name: repositoryName,
      imageTagMutability: imageTagMutability,
      imageScanningConfiguration: {
        scanOnPush: scanOnPush,
      },
      encryptionConfiguration: [
        {
          encryptionType: "AES256",
        },
      ],
      forceDelete: true, // Allow for development
      tags: {
        Name: repositoryName,
        Environment: "development",
        Project: "tv-devops-assessment",
        ManagedBy: "terraform-cdk",
      },
    });

    // Create IAM Role for ECR access
    const ecrRole = new IamRole(this, "ecr-access-role", {
      name: `${repositoryName}-ecr-role`,
      assumeRolePolicy: JSON.stringify({
        Version: "2012-10-17",
        Statement: [
          {
            Effect: "Allow",
            Principal: {
              Service: "ec2.amazonaws.com"
            },
            Action: "sts:AssumeRole"
          },
          {
            Effect: "Allow",
            Principal: {
              AWS: `arn:aws:iam::${currentIdentity.accountId}:root`
            },
            Action: "sts:AssumeRole"
          }
        ]
      }),
      tags: {
        Name: `${repositoryName}-ecr-role`,
        Environment: "development",
        Project: "tv-devops-assessment",
        ManagedBy: "terraform-cdk",
      },
    });

    // Create IAM Policy for ECR operations (get and push images)
    new IamRolePolicy(this, "ecr-access-policy", {
      name: `${repositoryName}-ecr-policy`,
      role: ecrRole.id,
      policy: JSON.stringify({
        Version: "2012-10-17",
        Statement: [
          {
            Effect: "Allow",
            Action: [
              "ecr:GetAuthorizationToken"
            ],
            Resource: "*"
          },
          {
            Effect: "Allow",
            Action: [
              "ecr:BatchCheckLayerAvailability",
              "ecr:GetDownloadUrlForLayer",
              "ecr:BatchGetImage",
              "ecr:PutImage",
              "ecr:InitiateLayerUpload",
              "ecr:UploadLayerPart",
              "ecr:CompleteLayerUpload"
            ],
            Resource: ecrRepository.arn
          }
        ]
      })
    });

    // Output important information
    new TerraformOutput(this, "ecr-repository-url", {
      value: ecrRepository.repositoryUrl,
      description: "ECR Repository URL for pushing/pulling images",
    });

    new TerraformOutput(this, "ecr-repository-arn", {
      value: ecrRepository.arn,
      description: "ECR Repository ARN",
    });

    new TerraformOutput(this, "ecr-repository-name", {
      value: ecrRepository.name,
      description: "ECR Repository Name",
    });

    new TerraformOutput(this, "iam-role-arn", {
      value: ecrRole.arn,
      description: "IAM Role ARN for ECR access",
    });

    new TerraformOutput(this, "iam-role-name", {
      value: ecrRole.name,
      description: "IAM Role Name for ECR access",
    });

    new TerraformOutput(this, "docker-login-command", {
      value: `aws ecr get-login-password --region ${process.env.AWS_DEFAULT_REGION} | docker login --username AWS --password-stdin ${ecrRepository.repositoryUrl}`,
      description: "Command to authenticate Docker with ECR",
    });

    new TerraformOutput(this, "assume-role-command", {
      value: `aws sts assume-role --role-arn ${ecrRole.arn} --role-session-name ECRAccess`,
      description: "Command to assume the ECR access role",
    });
  }
}

const app = new App();
new ECRStack(app, "ecr-instance");
app.synth();
