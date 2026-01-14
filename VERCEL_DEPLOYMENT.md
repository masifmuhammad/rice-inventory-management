# Vercel Deployment Guide

## Frontend Deployment on Vercel

### Step 1: Deploy Backend First
Before deploying the frontend, make sure your backend is deployed and accessible. You can deploy it to:
- Render.com (free tier)
- Railway.app (free tier)
- Heroku
- Or any Node.js hosting service

### Step 2: Deploy Frontend to Vercel

1. **Go to [Vercel.com](https://vercel.com)** and sign in with GitHub

2. **Import your repository:**
   - Click "Add New Project"
   - Select your `rice-inventory-management` repository
   - Choose the `frontend` folder as the root directory

3. **Configure Build Settings:**
   - Framework Preset: **Create React App**
   - Root Directory: `frontend` (or leave blank if deploying from frontend folder)
   - Build Command: `npm run build` (should auto-detect)
   - Output Directory: `build` (should auto-detect)
   - Install Command: `npm install`

4. **Set Environment Variables:**
   - Click "Environment Variables"
   - Add: `REACT_APP_API_URL`
   - Value: Your backend API URL (e.g., `https://your-backend.railway.app/api` or `https://your-backend.onrender.com/api`)
   - Make sure to add it for **Production**, **Preview**, and **Development**

5. **Deploy:**
   - Click "Deploy"
   - Wait for build to complete

### Step 3: Fix Common Issues

#### Issue: "Page not found" or blank page
**Solution:** The `vercel.json` file is already created with proper routing configuration.

#### Issue: "Cannot connect to API"
**Solution:** 
- Make sure `REACT_APP_API_URL` is set in Vercel environment variables
- Make sure your backend is deployed and CORS is configured
- Check backend CORS settings allow your Vercel domain

#### Issue: Build fails
**Solution:**
- Check build logs in Vercel dashboard
- Make sure all dependencies are in `package.json`
- Try clearing Vercel cache and redeploying

### Step 4: Update Backend CORS (Important!)

In your backend `server.js`, make sure CORS allows your Vercel domain:

```javascript
const cors = require('cors');

const corsOptions = {
  origin: [
    'http://localhost:3000',
    'https://your-vercel-app.vercel.app',
    'https://*.vercel.app' // Allow all Vercel preview deployments
  ],
  credentials: true
};

app.use(cors(corsOptions));
```

### Quick Fix for Current Deployment

1. Go to your Vercel project settings
2. Go to "Environment Variables"
3. Add: `REACT_APP_API_URL` = `https://your-backend-url.com/api`
4. Redeploy the project

### Testing

After deployment, visit your Vercel URL and check:
- ✅ Page loads without errors
- ✅ Can register/login
- ✅ API calls work (check browser console for errors)
- ✅ All pages are accessible

## Backend Deployment (Quick Guide)

### Option 1: Render.com (Recommended - Free)

1. Go to [Render.com](https://render.com)
2. Create new Web Service
3. Connect your GitHub repo
4. Settings:
   - Build Command: `cd backend && npm install`
   - Start Command: `cd backend && npm start`
   - Environment Variables:
     - `MONGODB_URI` = your MongoDB connection string
     - `JWT_SECRET` = random secret key
     - `NODE_ENV` = production
     - `PORT` = 10000 (or let Render assign)
5. Deploy

### Option 2: Railway.app

1. Go to [Railway.app](https://railway.app)
2. New Project → Deploy from GitHub
3. Select your repo
4. Add environment variables
5. Deploy

After backend is deployed, update `REACT_APP_API_URL` in Vercel with your backend URL!
