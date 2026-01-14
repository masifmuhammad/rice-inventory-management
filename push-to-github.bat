@echo off
echo ========================================
echo Push Rice Inventory to GitHub
echo ========================================
echo.
echo STEP 1: Create a new repository on GitHub.com
echo         - Go to https://github.com/new
echo         - Name it: rice-inventory-management
echo         - Don't initialize with README
echo         - Click Create repository
echo.
echo STEP 2: Copy your repository URL
echo         (It will look like: https://github.com/YOUR_USERNAME/rice-inventory-management.git)
echo.
pause
echo.
set /p REPO_URL="Paste your GitHub repository URL here: "
echo.
echo Adding remote repository...
git remote add origin %REPO_URL%
if errorlevel 1 (
    echo.
    echo Remote might already exist. Updating instead...
    git remote set-url origin %REPO_URL%
)
echo.
echo Renaming branch to main...
git branch -M main
echo.
echo Pushing to GitHub...
git push -u origin main
echo.
if errorlevel 1 (
    echo.
    echo ========================================
    echo ERROR: Push failed!
    echo ========================================
    echo.
    echo Common issues:
    echo 1. Make sure you're logged into GitHub
    echo 2. Check your repository URL is correct
    echo 3. If repository already has files, you may need to pull first
    echo.
    pause
) else (
    echo.
    echo ========================================
    echo SUCCESS! Your code is on GitHub!
    echo ========================================
    echo.
    echo Visit your repository at: %REPO_URL%
    echo.
    pause
)
