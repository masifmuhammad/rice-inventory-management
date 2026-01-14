Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Push Rice Inventory to GitHub" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "STEP 1: Create a new repository on GitHub.com" -ForegroundColor Yellow
Write-Host "        - Go to https://github.com/new" -ForegroundColor Gray
Write-Host "        - Name it: rice-inventory-management" -ForegroundColor Gray
Write-Host "        - Don't initialize with README" -ForegroundColor Gray
Write-Host "        - Click Create repository" -ForegroundColor Gray
Write-Host ""
Write-Host "STEP 2: Copy your repository URL" -ForegroundColor Yellow
Write-Host "        (It will look like: https://github.com/YOUR_USERNAME/rice-inventory-management.git)" -ForegroundColor Gray
Write-Host ""
Read-Host "Press Enter to continue"

$repoUrl = Read-Host "Paste your GitHub repository URL here"

Write-Host ""
Write-Host "Adding remote repository..." -ForegroundColor Green
try {
    git remote add origin $repoUrl
} catch {
    Write-Host "Remote might already exist. Updating instead..." -ForegroundColor Yellow
    git remote set-url origin $repoUrl
}

Write-Host ""
Write-Host "Renaming branch to main..." -ForegroundColor Green
git branch -M main

Write-Host ""
Write-Host "Pushing to GitHub..." -ForegroundColor Green
git push -u origin main

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Green
    Write-Host "SUCCESS! Your code is on GitHub!" -ForegroundColor Green
    Write-Host "========================================" -ForegroundColor Green
    Write-Host ""
    Write-Host "Visit your repository at: $repoUrl" -ForegroundColor Cyan
} else {
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Red
    Write-Host "ERROR: Push failed!" -ForegroundColor Red
    Write-Host "========================================" -ForegroundColor Red
    Write-Host ""
    Write-Host "Common issues:" -ForegroundColor Yellow
    Write-Host "1. Make sure you're logged into GitHub" -ForegroundColor Gray
    Write-Host "2. Check your repository URL is correct" -ForegroundColor Gray
    Write-Host "3. If repository already has files, you may need to pull first" -ForegroundColor Gray
}

Write-Host ""
Read-Host "Press Enter to exit"
