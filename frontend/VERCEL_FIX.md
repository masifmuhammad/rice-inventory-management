# Quick Fix for Vercel Deployment

## The Problem
Your frontend is deployed but not working because it's trying to connect to `localhost:5000` which doesn't exist in production.

## The Solution

### Step 1: Set Environment Variable in Vercel

1. Go to your Vercel dashboard: https://vercel.com/dashboard
2. Click on your project: `rice-inventory-management`
3. Go to **Settings** → **Environment Variables**
4. Click **Add New**
5. Add this:
   - **Key:** `REACT_APP_API_URL`
   - **Value:** `https://your-backend-url.com/api` (replace with your actual backend URL)
   - **Environment:** Select all (Production, Preview, Development)
6. Click **Save**

### Step 2: Redeploy

1. Go to **Deployments** tab
2. Click the **3 dots** (⋯) on the latest deployment
3. Click **Redeploy**
4. Wait for it to finish

### Step 3: If You Don't Have Backend Deployed Yet

You need to deploy your backend first! Here are free options:

#### Option A: Render.com (Easiest)
1. Go to https://render.com
2. Sign up with GitHub
3. Click "New" → "Web Service"
4. Connect your GitHub repo
5. Settings:
   - **Name:** rice-inventory-backend
   - **Root Directory:** backend
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Environment Variables:**
     - `MONGODB_URI` = your MongoDB connection string
     - `JWT_SECRET` = any random string (e.g., `mysecretkey123`)
     - `NODE_ENV` = `production`
6. Click "Create Web Service"
7. Wait for deployment
8. Copy the URL (e.g., `https://rice-inventory-backend.onrender.com`)
9. Use this URL in Vercel: `https://rice-inventory-backend.onrender.com/api`

#### Option B: Railway.app
1. Go to https://railway.app
2. Sign up with GitHub
3. "New Project" → "Deploy from GitHub repo"
4. Select your repo
5. Add environment variables (same as above)
6. Deploy and get URL

### Step 4: Test Your Deployment

After setting the environment variable and redeploying:
1. Visit your Vercel URL
2. Open browser console (F12)
3. Check for errors
4. Try to register/login
5. If you see CORS errors, the backend CORS is already fixed in the code

## Common Errors

### Error: "Network Error" or "Failed to fetch"
- **Cause:** Backend not deployed or wrong API URL
- **Fix:** Deploy backend and set correct `REACT_APP_API_URL`

### Error: "CORS policy"
- **Cause:** Backend CORS not allowing your Vercel domain
- **Fix:** Already fixed in `backend/server.js` - just redeploy backend

### Error: Blank page
- **Cause:** React Router not configured for SPA
- **Fix:** `vercel.json` is already created with correct config

### Error: "Cannot GET /products"
- **Cause:** Missing `vercel.json` routing
- **Fix:** Already fixed - `vercel.json` exists

## Quick Checklist

- [ ] Backend deployed and accessible
- [ ] `REACT_APP_API_URL` set in Vercel environment variables
- [ ] Vercel project redeployed after setting env var
- [ ] Backend CORS allows Vercel domain (already fixed in code)
- [ ] MongoDB connection string is correct

## Still Not Working?

1. Check Vercel build logs for errors
2. Check browser console (F12) for specific errors
3. Test backend API directly: `https://your-backend.com/api/health`
4. Make sure backend is running and accessible
