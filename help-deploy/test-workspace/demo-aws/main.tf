terraform {
  required_version = ">= 1.6.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
  }
}

provider "aws" {
  region = var.aws_region
  
}

variable "aws_region" {
  type    = string
  default = "us-east-2"
}

resource "random_string" "suffix" {
  length  = 6
  upper   = false
  special = false
}

resource "aws_s3_bucket" "demo" {
  bucket = "help-deploy-demo-${random_string.suffix.result}"

  tags = {
    Project = "help-deploy"
    Env     = "demo"
  }
}

resource "random_string" "object_suffix" {
  length  = 8
  upper   = false
  special = false
}

resource "aws_s3_object" "sample" {
  bucket       = aws_s3_bucket.demo.bucket
  key          = "sample-${random_string.object_suffix.result}.txt"
  content      = "Hello desde help-deploy: ${random_string.object_suffix.result}"
  content_type = "text/plain"
}
