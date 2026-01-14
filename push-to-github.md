# Push to GitHub - Step by Step

## Option 1: Using GitHub Website (Easiest)

### Step 1: Create Repository on GitHub
1. Go to [GitHub.com](https://github.com) and sign in
2. Click the **"+"** icon in the top right → **"New repository"**
3. Repository name: `rice-inventory-management` (or any name you like)
4. Description: "Rice Factory Inventory Management System"
5. Choose **Public** or **Private**
6. **DO NOT** check "Initialize with README" (we already have files)
7. Click **"Create repository"**

### Step 2: Copy the Repository URL
After creating, GitHub will show you commands. Copy the repository URL (looks like):
- `https://github.com/YOUR_USERNAME/rice-inventory-management.git`
- OR `git@github.com:YOUR_USERNAME/rice-inventory-management.git`

### Step 3: Run These Commands
Open PowerShell in the RiceInventory folder and run:

```powershell
cd C:\Users\masif\Desktop\NewProject\RiceInventory
git remote add origin YOUR_REPOSITORY_URL_HERE
git branch -M main
git push -u origin main
```

Replace `YOUR_REPOSITORY_URL_HERE` with the URL you copied in Step 2.

## Option 2: Using GitHub Desktop (If Installed)

1. Open GitHub Desktop
2. File → Add Local Repository
3. Navigate to `C:\Users\masif\Desktop\NewProject\RiceInventory`
4. Click "Publish repository"
5. Choose name and visibility
6. Click "Publish repository"

## Option 3: Quick Script

I've created a script file `push-to-github.bat` that you can edit and run!
