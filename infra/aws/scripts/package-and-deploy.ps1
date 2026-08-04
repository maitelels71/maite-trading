# Package nested CloudFormation templates to S3 and deploy the root stack.
# Usage:
#   .\scripts\package-and-deploy.ps1 -Bucket <s3-bucket> -StackName <name> [-ParamsFile path] [-Region us-east-1]
param(
  [Parameter(Mandatory = $true)][string]$Bucket,
  [Parameter(Mandatory = $true)][string]$StackName,
  [string]$ParamsFile = "",
  [string]$Region = $env:AWS_DEFAULT_REGION
)

$ErrorActionPreference = "Stop"
$RootDir = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
if (-not $ParamsFile) { $ParamsFile = Join-Path $RootDir "parameters\staging.example.json" }
if (-not $Region) { $Region = "us-east-1" }
$Packaged = Join-Path $RootDir "packaged.yaml"

Write-Host "Packaging templates to s3://$Bucket ..."
aws cloudformation package `
  --template-file (Join-Path $RootDir "template.yaml") `
  --s3-bucket $Bucket `
  --output-template-file $Packaged `
  --region $Region

Write-Host "Deploying stack $StackName ..."
aws cloudformation deploy `
  --template-file $Packaged `
  --stack-name $StackName `
  --parameter-overrides "file://$ParamsFile" `
  --capabilities CAPABILITY_NAMED_IAM `
  --region $Region

Write-Host "Done. Stack outputs:"
aws cloudformation describe-stacks `
  --stack-name $StackName `
  --region $Region `
  --query "Stacks[0].Outputs" `
  --output table
