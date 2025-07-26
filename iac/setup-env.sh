#!/bin/bash

# Sample script to set up environment variables for CDKTF ECR deployment
# This is an alternative to using .env files

echo "Setting up environment variables for AWS ECR deployment..."

# AWS Configuration - Replace with your actual values
export AWS_ACCESS_KEY_ID="your_access_key_here"
export AWS_SECRET_ACCESS_KEY="your_secret_key_here"
export AWS_REGION="us-east-1"
export AWS_ACCOUNT_ID="123456789012"  # Optional: Your AWS account ID

# ECR Configuration - Customize as needed
export ECR_REPOSITORY_NAME="tv-devops-assessment"
export ECR_IMAGE_TAG_MUTABILITY="MUTABLE"
export ECR_SCAN_ON_PUSH="true"

echo "Environment variables set. You can now run:"
echo "npm run synth    # To generate Terraform files"
echo "npm run deploy   # To deploy to AWS"
