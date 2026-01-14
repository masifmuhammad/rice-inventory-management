# Quick Fix for Your Vercel Deployment

## Your Backend URL
✅ Backend is deployed at: `https://rice-inventory-management.onrender.com`

## Fix Steps (2 minutes)

### Step 1: Add Environment Variable in Vercel

1. Go to: https://vercel.com/dashboard
2. Click on your project: `rice-inventory-management`
3. Click **Settings** (top menu)
4. Click **Environment Variables** (left sidebar)
5. Click **Add New**
6. Enter:
   - **Key:** `REACT_APP_API_URL`
   - **Value:** `https://rice-inventory-management.onrender.com/api`
   - **Environment:** Check all three boxes:
     - ✅ Production
     - ✅ Preview  
     - ✅ Development
7. Click **Save**

### Step 2: Redeploy

1. Go to **Deployments** tab
2. Find your latest deployment
3. Click the **3 dots** (⋯) menu
4. Click **Redeploy**
5. Wait 1-2 minutes for deployment to complete

### Step 3: Test

1. Visit your Vercel URL: `https://rice-inventory-management-zo6a-5fxzskvy9.vercel.app`
2. The app should now work! ✅
3. Try registering a new account or logging in

## That's It!

Your frontend will now connect to your backend on Render.com.

## Troubleshooting

If it still doesn't work:
1. Check browser console (F12) for errors
2. Make sure backend is running: Visit `https://rice-inventory-management.onrender.com/api/health`
3. Check Vercel build logs for any errors
4. Make sure you redeployed after adding the environment variable
