param(
  [string]$AccountId = "289981265319",
  [string]$RoleName = "maite-trading-github-actions",
  [string]$PolicyName = "MaiteTradingGitHubActionsDeploy",
  [string]$Region = "us-east-1"
)

$ErrorActionPreference = "Stop"
$Here = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $Here

Write-Host "Caller identity:"
aws sts get-caller-identity | Out-Host

$OidcArn = "arn:aws:iam::${AccountId}:oidc-provider/token.actions.githubusercontent.com"
$existing = aws iam list-open-id-connect-providers --query "OpenIDConnectProviderList[?Arn=='$OidcArn'].Arn" --output text

if ([string]::IsNullOrWhiteSpace($existing) -or $existing -eq "None") {
  Write-Host "Creating GitHub OIDC provider..."
  aws iam create-open-id-connect-provider `
    --url "https://token.actions.githubusercontent.com" `
    --client-id-list "sts.amazonaws.com" `
    --thumbprint-list "ffffffffffffffffffffffffffffffffffffffff" `
    --tags Key=Project,Value=maite-trading | Out-Host
} else {
  Write-Host "OIDC provider already exists: $OidcArn"
}

$RoleArn = "arn:aws:iam::${AccountId}:role/$RoleName"
$roleCheck = aws iam get-role --role-name $RoleName 2>&1
$roleExists = $LASTEXITCODE -eq 0

if (-not $roleExists) {
  Write-Host "Creating role $RoleName ..."
  aws iam create-role `
    --role-name $RoleName `
    --assume-role-policy-document "file://github-oidc-trust-policy.json" `
    --description "GitHub Actions deploy role for maite-trading" `
    --tags Key=Project,Value=maite-trading | Out-Host
} else {
  Write-Host "Updating trust policy on existing role..."
  aws iam update-assume-role-policy `
    --role-name $RoleName `
    --policy-document "file://github-oidc-trust-policy.json" | Out-Host
}

Write-Host "Putting inline deploy policy $PolicyName ..."
aws iam put-role-policy `
  --role-name $RoleName `
  --policy-name $PolicyName `
  --policy-document "file://github-actions-deploy-policy.json" | Out-Host

Write-Host ""
Write-Host "DONE. Add this GitHub Actions secret:"
Write-Host "  AWS_ROLE_ARN = $RoleArn"
Write-Host ""
Write-Host "Also set variables:"
Write-Host "  AWS_REGION = $Region"
Write-Host "  PROJECT_NAME = maite-trading"
Write-Host "  CFN_TEMPLATE_BUCKET = maite-trading-cfn-$AccountId"
Write-Host "  FRONTEND_REPOSITORY = https://github.com/maitelels71/maite-trading"
Write-Host "  FRONTEND_BRANCH = main"
Write-Host ""
Write-Host "Secret DB_PASSWORD = (choose a 16+ character password)"
