param(
  [Parameter(Mandatory = $true)][string]$StackName,
  [Parameter(Mandatory = $true)][string]$Region,
  [Parameter(Mandatory = $true)][string]$TemplateBucket,
  [Parameter(Mandatory = $true)][string]$DbPassword,
  [string]$ProjectName = "maite-trading",
  [string]$EnvironmentName = "staging",
  [string]$ApiImageUri = "",
  [string]$ParametersFile = ""
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $Root

$Packaged = Join-Path $Root "packaged.yaml"

Write-Host "Packaging nested templates to s3://$TemplateBucket ..."
aws cloudformation package `
  --template-file template.yaml `
  --s3-bucket $TemplateBucket `
  --output-template-file $Packaged `
  --region $Region

if ($ParametersFile -and (Test-Path $ParametersFile)) {
  Write-Host "Deploying stack $StackName using $ParametersFile ..."
  aws cloudformation deploy `
    --template-file $Packaged `
    --stack-name $StackName `
    --parameter-overrides "file://$ParametersFile" `
    --capabilities CAPABILITY_NAMED_IAM `
    --region $Region
} else {
  Write-Host "Deploying stack $StackName ..."
  $overrides = @(
    "ProjectName=$ProjectName",
    "EnvironmentName=$EnvironmentName",
    "DBPassword=$DbPassword",
    "ApiImageUri=$ApiImageUri"
  )
  aws cloudformation deploy `
    --template-file $Packaged `
    --stack-name $StackName `
    --parameter-overrides $overrides `
    --capabilities CAPABILITY_NAMED_IAM `
    --region $Region
}

Write-Host "Done. Stack outputs:"
aws cloudformation describe-stacks `
  --stack-name $StackName `
  --region $Region `
  --query "Stacks[0].Outputs" `
  --output table
