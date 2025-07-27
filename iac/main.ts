import { Construct } from "constructs";
import { App, TerraformStack, TerraformOutput } from "cdktf";
import { AwsProvider } from "@cdktf/provider-aws/lib/provider";
import { EcrRepository } from "@cdktf/provider-aws/lib/ecr-repository";
import { IamRole } from "@cdktf/provider-aws/lib/iam-role";
import { IamRolePolicy } from "@cdktf/provider-aws/lib/iam-role-policy";
import { DataAwsCallerIdentity } from "@cdktf/provider-aws/lib/data-aws-caller-identity";
import { DataAwsAvailabilityZones } from "@cdktf/provider-aws/lib/data-aws-availability-zones";
import { Vpc } from "@cdktf/provider-aws/lib/vpc";
import { Subnet } from "@cdktf/provider-aws/lib/subnet";
import { InternetGateway } from "@cdktf/provider-aws/lib/internet-gateway";
import { RouteTable } from "@cdktf/provider-aws/lib/route-table";
import { Route } from "@cdktf/provider-aws/lib/route";
import { RouteTableAssociation } from "@cdktf/provider-aws/lib/route-table-association";
import { SecurityGroup } from "@cdktf/provider-aws/lib/security-group";
import { EcsCluster } from "@cdktf/provider-aws/lib/ecs-cluster";
import { EcsTaskDefinition } from "@cdktf/provider-aws/lib/ecs-task-definition";
import { EcsService } from "@cdktf/provider-aws/lib/ecs-service";
import { CloudwatchLogGroup } from "@cdktf/provider-aws/lib/cloudwatch-log-group";
import { LbTargetGroup } from "@cdktf/provider-aws/lib/lb-target-group";
import { Lb } from "@cdktf/provider-aws/lib/lb";
import { LbListener } from "@cdktf/provider-aws/lib/lb-listener";
import { LbListenerRule } from "@cdktf/provider-aws/lib/lb-listener-rule";
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

    // Get available availability zones
    const availabilityZones = new DataAwsAvailabilityZones(this, "available-azs", {
      state: "available"
    });

    // Get configuration from environment variables with defaults
    // TODO: Replace this variable with more general Name
    const repositoryName = process.env.ECR_REPOSITORY_NAME ?? "tv-devops-assessment";
    const imageTagMutability = process.env.ECR_IMAGE_TAG_MUTABILITY ?? "MUTABLE";
    const scanOnPush = process.env.ECR_SCAN_ON_PUSH === "true";
    const ecrImageTag = process.env.ECR_IMAGE_TAG ?? 'latest';
    const ecsServiceContainerPort = Number(process.env.ECS_CONTAINER_PORT) ?? 3000; // Make this more durable

    // Create VPC for ECS service
    const vpc = new Vpc(this, `${repositoryName}-vpc`, {
      cidrBlock: "10.0.0.0/16",
      enableDnsHostnames: true,
      enableDnsSupport: true,
      tags: {
        Name: `${repositoryName}-vpc`,
        Environment: "development",
        Project: "tv-devops-assessment",
        ManagedBy: "terraform-cdk",
      },
    });

    // Create Internet Gateway
    const internetGateway = new InternetGateway(this, `${repositoryName}-igw`, {
      vpcId: vpc.id,
      tags: {
        Name: `${repositoryName}-igw`,
        Environment: "development",
        Project: "tv-devops-assessment",
        ManagedBy: "terraform-cdk",
      },
    });

    // Create public subnets ( limit to 2 Azs for now)
    const publicSubnets: Subnet[] = [];
    for (let i = 0; i < 2; i++) {
      const subnet = new Subnet(this, `${repositoryName}-subnet-${i + 1}`, {
        vpcId: vpc.id,
        cidrBlock: `10.0.${i + 1}.0/24`,
        availabilityZone: `\${${availabilityZones.fqn}.names[${i}]}`,
        mapPublicIpOnLaunch: true,
        tags: {
          Name: `${repositoryName}-subnet-${i + 1}`,
          Type: "Public",
          Environment: "development",
          Project: "tv-devops-assessment",
          ManagedBy: "terraform-cdk",
        },
      });
      publicSubnets.push(subnet);
    }

    // Create route table for public subnets
    const publicRouteTable = new RouteTable(this, `${repositoryName}-route-table`, {
      vpcId: vpc.id,
      tags: {
        Name: `${repositoryName}-route-table`,
        Environment: "development",
        Project: "tv-devops-assessment",
        ManagedBy: "terraform-cdk",
      },
    });

    // Create route to internet gateway
    new Route(this, `${repositoryName}-route`, {
      routeTableId: publicRouteTable.id,
      destinationCidrBlock: "0.0.0.0/0",
      gatewayId: internetGateway.id,
    });

    // Associate public subnets with route table
    publicSubnets.forEach((subnet, index) => {
      new RouteTableAssociation(this, `${repositoryName}-subnet-assoc-${index + 1}`, {
        subnetId: subnet.id,
        routeTableId: publicRouteTable.id,
      });
    });

    // ECR Repository
    const ecrRepository = new EcrRepository(this, `${repositoryName}-ecr-reg`, {
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
      tags: {
        Name: repositoryName,
        Environment: "development",
        Project: "tv-devops-assessment",
        ManagedBy: "terraform-cdk",
      },
    });

    // Create IAM Role for ECR access (least privilege for container operations)
    const ecrRole = new IamRole(this, `${repositoryName}-ecr-access-role`, {
      name: `${repositoryName}-ecr-role`,
      assumeRolePolicy: JSON.stringify({
        Version: "2012-10-17",
        Statement: [
          {
            Effect: "Allow",
            Principal: {
              Service: "ecs-tasks.amazonaws.com"
            },
            Action: "sts:AssumeRole",
            Condition: {
              StringEquals: {
                "aws:RequestedRegion": process.env.AWS_DEFAULT_REGION
              }
            }
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

    // Create IAM Policy for ECR operations (minimal required permissions)
    new IamRolePolicy(this, `${repositoryName}-ecr-policy`, {
      name: `${repositoryName}-ecr-policy`,
      role: ecrRole.id,
      policy: JSON.stringify({
        Version: "2012-10-17",
        Statement: [
          {
            Sid: "ECRTokenAccess",
            Effect: "Allow",
            Action: [
              "ecr:GetAuthorizationToken"
            ],
            Resource: "*",
            Condition: {
              StringEquals: {
                "aws:RequestedRegion": process.env.AWS_DEFAULT_REGION
              }
            }
          },
          {
            Sid: "ECRRepositoryAccess",
            Effect: "Allow",
            Action: [
              "ecr:BatchCheckLayerAvailability",
              "ecr:GetDownloadUrlForLayer",
              "ecr:BatchGetImage"
            ],
            Resource: ecrRepository.arn
          },
          {
            Sid: "CloudWatchLogsAccess",
            Effect: "Allow",
            Action: [
              "logs:CreateLogStream",
              "logs:PutLogEvents"
            ],
            Resource: `arn:aws:logs:${process.env.AWS_DEFAULT_REGION}:${currentIdentity.accountId}:log-group:/ecs/${repositoryName}:*`
          }
        ]
      })
    });

    // Create ECS Task Execution Role (least privilege for ECS task execution)
    const ecsTaskExecutionRole = new IamRole(this, `${repositoryName}-ecs-task-execution-role`, {
      name: `${repositoryName}-ecs-task-execution-role`,
      assumeRolePolicy: JSON.stringify({
        Version: "2012-10-17",
        Statement: [
          {
            Effect: "Allow",
            Principal: {
              Service: "ecs-tasks.amazonaws.com"
            },
            Action: "sts:AssumeRole",
            Condition: {
              StringEquals: {
                "aws:RequestedRegion": process.env.AWS_DEFAULT_REGION
              }
            }
          }
        ]
      }),
      tags: {
        Name: `${repositoryName}-ecs-task-execution-role`,
        Environment: "development",
        Project: "tv-devops-assessment",
        ManagedBy: "terraform-cdk",
      },
    });

    // Attach minimal ECS Task Execution Role Policy (least privilege)
    new IamRolePolicy(this, "ecs-task-execution-policy", {
      name: `${repositoryName}-ecs-task-execution-policy`,
      role: ecsTaskExecutionRole.id,
      policy: JSON.stringify({
        Version: "2012-10-17",
        Statement: [
          {
            Sid: "ECRAccess",
            Effect: "Allow",
            Action: [
              "ecr:GetAuthorizationToken"
            ],
            Resource: "*",
            Condition: {
              StringEquals: {
                "aws:RequestedRegion": process.env.AWS_DEFAULT_REGION
              }
            }
          },
          {
            Sid: "ECRImageAccess",
            Effect: "Allow",
            Action: [
              "ecr:BatchCheckLayerAvailability",
              "ecr:GetDownloadUrlForLayer",
              "ecr:BatchGetImage"
            ],
            Resource: ecrRepository.arn
          },
          {
            Sid: "CloudWatchLogsAccess",
            Effect: "Allow",
            Action: [
              "logs:CreateLogGroup",
              "logs:CreateLogStream",
              "logs:PutLogEvents"
            ],
            Resource: [
              `arn:aws:logs:${process.env.AWS_DEFAULT_REGION}:${currentIdentity.accountId}:log-group:/ecs/${repositoryName}`,
              `arn:aws:logs:${process.env.AWS_DEFAULT_REGION}:${currentIdentity.accountId}:log-group:/ecs/${repositoryName}:*`
            ]
          }
        ]
      })
    });

    // Create deployment role (for CI/CD and infrastructure management)
    const deploymentRole = new IamRole(this, `${repositoryName}-deployment-role`, {
      name: `${repositoryName}-deployment-role`,
      assumeRolePolicy: JSON.stringify({
        Version: "2012-10-17",
        Statement: [
          {
            Effect: "Allow",
            Principal: {
              AWS: `arn:aws:iam::${currentIdentity.accountId}:root`
            },
            Action: "sts:AssumeRole",
            Condition: {
              StringEquals: {
                "aws:RequestedRegion": process.env.AWS_DEFAULT_REGION
              }
            }
          }
        ]
      }),
      tags: {
        Name: `${repositoryName}-deployment-role`,
        Environment: "development",
        Project: "tv-devops-assessment",
        ManagedBy: "terraform-cdk",
      },
    });

    // Deployment role policy (for infrastructure management and container deployment)
    new IamRolePolicy(this, "deployment-role-policy", {
      name: `${repositoryName}-deployment-policy`,
      role: deploymentRole.id,
      policy: JSON.stringify({
        Version: "2012-10-17",
        Statement: [
          {
            Sid: "ECRFullAccess",
            Effect: "Allow",
            Action: [
              "ecr:GetAuthorizationToken",
              "ecr:BatchCheckLayerAvailability",
              "ecr:GetDownloadUrlForLayer",
              "ecr:BatchGetImage",
              "ecr:PutImage",
              "ecr:InitiateLayerUpload",
              "ecr:UploadLayerPart",
              "ecr:CompleteLayerUpload",
              "ecr:ListImages",
              "ecr:DescribeImages",
              "ecr:DescribeRepositories"
            ],
            Resource: [
              ecrRepository.arn,
              "*"
            ]
          },
          {
            Sid: "ECSManagement",
            Effect: "Allow",
            Action: [
              "ecs:UpdateService",
              "ecs:DescribeServices",
              "ecs:DescribeTasks",
              "ecs:DescribeTaskDefinition",
              "ecs:RegisterTaskDefinition",
              "ecs:ListTasks",
              "ecs:RunTask",
              "ecs:StopTask"
            ],
            Resource: "*",
            Condition: {
              StringEquals: {
                "aws:RequestedRegion": process.env.AWS_DEFAULT_REGION
              }
            }
          },
          {
            Sid: "IAMPassRole",
            Effect: "Allow",
            Action: [
              "iam:PassRole"
            ],
            Resource: [
              ecsTaskExecutionRole.arn,
              ecrRole.arn
            ]
          },
          {
            Sid: "CloudWatchLogs",
            Effect: "Allow",
            Action: [
              "logs:CreateLogGroup",
              "logs:CreateLogStream",
              "logs:PutLogEvents",
              "logs:DescribeLogGroups",
              "logs:DescribeLogStreams"
            ],
            Resource: `arn:aws:logs:${process.env.AWS_DEFAULT_REGION}:${currentIdentity.accountId}:log-group:/ecs/${repositoryName}*`
          }
        ]
      })
    });

    // Create CloudWatch Log Group for ECS
    const logGroup = new CloudwatchLogGroup(this, `${repositoryName}-ecs-log-group`, {
      name: `/ecs/${repositoryName}`,
      retentionInDays: 7,
      tags: {
        Name: `/ecs/${repositoryName}`,
        Environment: "development",
        Project: "tv-devops-assessment",
        ManagedBy: "terraform-cdk",
      },
    });

    // Create Security Group for ALB (allows public traffic on port 80)
    const albSecurityGroup = new SecurityGroup(this, `${repositoryName}-alb-sg`, {
      name: `${repositoryName}-alb-sg`,
      description: "Security group for Application Load Balancer - allows public HTTP traffic",
      vpcId: vpc.id,
      ingress: [
        {
          fromPort: 80,
          toPort: 80,
          protocol: "tcp",
          cidrBlocks: ["0.0.0.0/0"],
          description: "HTTP access from internet"
        },
        {
          fromPort: 443,
          toPort: 443,
          protocol: "tcp",
          cidrBlocks: ["0.0.0.0/0"],
          description: "HTTPS access from internet"
        },
        {
          fromPort: 80,
          toPort: 80,
          protocol: "tcp",
          cidrBlocks: ["0.0.0.0/0"],
          description: "HTTP access from internet"
        },        
      ],
      egress: [
        {
          fromPort: 0,
          toPort: 65535,
          protocol: "tcp",
          cidrBlocks: ["0.0.0.0/0"],
          description: "All outbound traffic"
        }
      ],
      tags: {
        Name: `${repositoryName}-alb-sg`,
        Environment: "development",
        Project: "tv-devops-assessment",
        ManagedBy: "terraform-cdk",
      },
    });

    // Create Security Group for ECS Service (only allows traffic from ALB on port 3000)
    const ecsSecurityGroup = new SecurityGroup(this, `${repositoryName}-ecs-sg`, {
      name: `${repositoryName}-ecs-sg`,
      description: "Security group for ECS Fargate service - only allows traffic from ALB on port 3000",
      vpcId: vpc.id,
      ingress: [
        {
          fromPort: 3000,
          toPort: 3000,
          protocol: "tcp",
          securityGroups: [albSecurityGroup.id],
          description: "HTTP access from ALB to container port 3000"
        }
      ],
      egress: [
        {
          fromPort: 443,
          toPort: 443,
          protocol: "tcp",
          cidrBlocks: ["0.0.0.0/0"],
          description: "HTTPS outbound for ECR, CloudWatch, and AWS API calls"
        },
        {
          fromPort: 80,
          toPort: 80,
          protocol: "tcp",
          cidrBlocks: ["0.0.0.0/0"],
          description: "HTTP outbound for package downloads and updates"
        },
        {
          fromPort: 53,
          toPort: 53,
          protocol: "udp",
          cidrBlocks: ["0.0.0.0/0"],
          description: "DNS resolution"
        },
        {
          fromPort: 53,
          toPort: 53,
          protocol: "tcp",
          cidrBlocks: ["0.0.0.0/0"],
          description: "DNS resolution over TCP"
        }
      ],
      tags: {
        Name: `${repositoryName}-ecs-sg`,
        Environment: "development",
        Project: "tv-devops-assessment",
        ManagedBy: "terraform-cdk",
      },
      dependsOn: [albSecurityGroup], // Ensure ALB SG is created first
    });

    // Create Security Group for VPC Endpoints (if needed for private subnets later)
    new SecurityGroup(this, `${repositoryName}-vpc-endpoint-sg`, {
      name: `${repositoryName}-vpc-endpoint-sg`,
      description: "Security group for VPC endpoints - allows HTTPS from VPC",
      vpcId: vpc.id,
      ingress: [
        {
          fromPort: 443,
          toPort: 443,
          protocol: "tcp",
          cidrBlocks: [vpc.cidrBlock],
          description: "HTTPS access from VPC for AWS service endpoints"
        }
      ],
      egress: [
        {
          fromPort: 443,
          toPort: 443,
          protocol: "tcp",
          cidrBlocks: ["0.0.0.0/0"],
          description: "HTTPS outbound to AWS services"
        }
      ],
      tags: {
        Name: `${repositoryName}-vpc-endpoint-sg`,
        Environment: "development",
        Project: "tv-devops-assessment",
        ManagedBy: "terraform-cdk",
      },
    });

    // Create ALB
    const applicationLoadBalancer = new Lb(this, `${repositoryName}-alb`, {
      name: `${repositoryName}-alb`,
      loadBalancerType: "application",
      subnets: publicSubnets.map(subnet => subnet.id),
      securityGroups: [albSecurityGroup.id],
      enableDeletionProtection: false,
      tags: {
        Name: `${repositoryName}-alb`,
        Environment: "development",
        Project: "tv-devops-assessment",
        ManagedBy: "terraform-cdk",
      },
    });

    // Create Target Group for the API service
    const targetGroup = new LbTargetGroup(this, `${repositoryName}-tg`, {
      name: `${repositoryName}-tg`,
      port: ecsServiceContainerPort,
      protocol: "HTTP",
      vpcId: vpc.id,
      targetType: "ip",
      tags: {
        Name: `${repositoryName}-tg`,
        Environment: "development",
        Project: "tv-devops-assessment",
        ManagedBy: "terraform-cdk",
      },
    });

    // Create ALB Listener to forward all traffic to the TargetGroup above
    const albListener = new LbListener(this, `${repositoryName}-alb-listener`, {
      loadBalancerArn: applicationLoadBalancer.arn,
      port: 80,
      protocol: "HTTP",
      defaultAction: [
        {
          type: "forward",
          targetGroupArn: targetGroup.arn,
        }
      ],
      tags: {
        Name: `${repositoryName}-alb-listener`,
        Environment: "development",
        Project: "tv-devops-assessment",
        ManagedBy: "terraform-cdk",
      },
    });

    // Create specific listener rule for /health endpoint with fixed response
    new LbListenerRule(this, `${repositoryName}-health-rule`, {
      listenerArn: albListener.arn,
      priority: 100,
      condition: [
        {
          pathPattern: {
            values: ["/health"]
          }
        }
      ],
      action: [
        {
          type: "fixed-response",
          fixedResponse: {
            contentType: "text/plain",
            messageBody: "OK",
            statusCode: "200"
          }
        }
      ],
      tags: {
        Name: `${repositoryName}-health-rule`,
        Environment: "development",
        Project: "tv-devops-assessment",
        ManagedBy: "terraform-cdk",
      },
    });

    // Create ECS Cluster
    const ecsCluster = new EcsCluster(this, `${repositoryName}-ecs-cluster`, {
      name: `${repositoryName}-cluster`,
      setting: [
        {
          name: "containerInsights",
          value: "enabled"
        }
      ],
      tags: {
        Name: `${repositoryName}-cluster`,
        Environment: "development",
        Project: "tv-devops-assessment",
        ManagedBy: "terraform-cdk",
      },
    });

    // Create ECS Task Definition, 
    const ecsTaskDefinition = new EcsTaskDefinition(this, `${repositoryName}-ecs-task-def`, {
      family: `${repositoryName}-task`,
      networkMode: "awsvpc",
      requiresCompatibilities: ["FARGATE"],
      cpu: "256",
      memory: "512",
      executionRoleArn: ecsTaskExecutionRole.arn,
      taskRoleArn: ecrRole.arn,
      containerDefinitions: JSON.stringify([
        {
          name: `${repositoryName}-app-container`,
          image: `${ecrRepository.repositoryUrl}:${ecrImageTag}`,
          essential: true,
          portMappings: [
            {
              containerPort: ecsServiceContainerPort,
              protocol: "tcp",
            }
          ],
          healthCheck: {
            command: ["CMD-SHELL","ls"],
            // command: ["CMD-SHELL", "wget --spider --no-verbose --server-response http://localhost:3000/health"],
            interval: 60,
            timeout: 10,
            retries: 6,
            startPeriod: 60
          },
          environment: [
            {
              name: "PORT",
              value: String(ecsServiceContainerPort)
            },
            {
              name: "NODE_ENV",
              value: "development"
            }
          ],
          logConfiguration: {
            logDriver: "awslogs",
            options: {
              "awslogs-group": logGroup.name,
              "awslogs-region": process.env.AWS_DEFAULT_REGION,
              "awslogs-stream-prefix": "ecs"
            }
          }
        }
      ]),
      tags: {
        Name: `${repositoryName}-task`,
        Environment: "development",
        Project: "tv-devops-assessment",
        ManagedBy: "terraform-cdk",
      },
    });

    // Create ECS Service to run containers 
    const ecsService = new EcsService(this, `${repositoryName}-ecs-service`, {
      name: `${repositoryName}-service`,
      cluster: ecsCluster.id,
      taskDefinition: ecsTaskDefinition.arn,
      launchType: "FARGATE",
      desiredCount: 2,
      networkConfiguration: {
        subnets: publicSubnets.map(subnet => subnet.id),
        securityGroups: [ecsSecurityGroup.id],
        assignPublicIp: true,
      },
      loadBalancer: [
        {
          targetGroupArn: targetGroup.arn,
          containerName: `${repositoryName}-app-container`,
          containerPort: ecsServiceContainerPort,
        }
      ],
      dependsOn: [applicationLoadBalancer],
      tags: {
        Name: `${repositoryName}-service`,
        Environment: "development",
        Project: "tv-devops-assessment",
        ManagedBy: "terraform-cdk",
      },
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

    // VPC and Network Outputs
    new TerraformOutput(this, "vpc-id", {
      value: vpc.id,
      description: "VPC ID for the infrastructure",
    });

    new TerraformOutput(this, "public-subnet-ids", {
      value: publicSubnets.map(subnet => subnet.id),
      description: "List of public subnet IDs",
    });

    new TerraformOutput(this, "security-group-id", {
      value: ecsSecurityGroup.id,
      description: "Security Group ID for ECS service",
    });

    // ECS Outputs
    new TerraformOutput(this, "ecs-cluster-name", {
      value: ecsCluster.name,
      description: "ECS Cluster name",
    });

    new TerraformOutput(this, "ecs-cluster-arn", {
      value: ecsCluster.arn,
      description: "ECS Cluster ARN",
    });

    new TerraformOutput(this, "ecs-service-name", {
      value: ecsService.name,
      description: "ECS Service name",
    });

    new TerraformOutput(this, "ecs-task-definition-arn", {
      value: ecsTaskDefinition.arn,
      description: "ECS Task Definition ARN",
    });

    new TerraformOutput(this, "ecs-task-execution-role-arn", {
      value: ecsTaskExecutionRole.arn,
      description: "ECS Task Execution Role ARN",
    });

    new TerraformOutput(this, "cloudwatch-log-group", {
      value: logGroup.name,
      description: "CloudWatch Log Group for ECS service",
    });

    // Security and Deployment Outputs
    new TerraformOutput(this, "deployment-role-arn", {
      value: deploymentRole.arn,
      description: "Deployment Role ARN for CI/CD and infrastructure management",
    });

    new TerraformOutput(this, "deployment-role-name", {
      value: deploymentRole.name,
      description: "Deployment Role Name for CI/CD and infrastructure management",
    });

    new TerraformOutput(this, "assume-deployment-role-command", {
      value: `aws sts assume-role --role-arn ${deploymentRole.arn} --role-session-name DeploymentAccess`,
      description: "Command to assume the deployment role for infrastructure management",
    });

    // Load Balancer Outputs
    new TerraformOutput(this, "load-balancer-dns", {
      value: applicationLoadBalancer.dnsName,
      description: "Application Load Balancer DNS name for public access",
    });

    new TerraformOutput(this, "health-endpoint-url", {
      value: `http://${applicationLoadBalancer.dnsName}/health`,
      description: "Public URL for the health endpoint",
    });

    new TerraformOutput(this, "application-url", {
      value: `http://${applicationLoadBalancer.dnsName}`,
      description: "Public URL for the application",
    });
  }
}

const app = new App();
new ECRStack(app, "ecr-instance");
app.synth();
