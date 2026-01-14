# Quick Setup Guide

## Step 1: Get Free MongoDB Database

1. Visit [MongoDB Atlas](https://www.mongodb.com/cloud/atlas/register)
2. Sign up for free account
3. Create a new cluster (choose FREE tier)
4. Wait for cluster to be created (2-3 minutes)
5. Click "Connect" → "Connect your application"
6. Copy the connection string (looks like: `mongodb+srv://username:password@cluster0.xxxxx.mongodb.net/...`)
7. Replace `<password>` with your database password
8. Add database name at the end: `?retryWrites=true&w=majority` → `/rice-inventory?retryWrites=true&w=majority`

## Step 2: Setup Backend

```bash
cd RiceInventory/backend
npm install
```

Create `.env` file:
```env
PORT=5000
MONGODB_URI=paste_your_mongodb_connection_string_here
JWT_SECRET=create_a_random_secret_key_here_make_it_long_and_random
NODE_ENV=development
```

Start backend:
```bash
npm start
```

## Step 3: Setup Frontend

Open a NEW terminal window:

```bash
cd RiceInventory/frontend
npm install
```

Create `.env` file:
```env
REACT_APP_API_URL=http://localhost:5000/api
```

Start frontend:
```bash
npm start
```

## Step 4: Access the Application

1. Open browser to `http://localhost:3000`
2. Click "Sign up" to create your account
3. Start adding your rice products!

## Important Notes

- Keep both terminals running (backend and frontend)
- Backend must be running before frontend
- MongoDB Atlas free tier gives you 512MB - plenty for inventory data
- All your data is saved in the cloud automatically

## Troubleshooting

**Backend error?**
- Check MongoDB connection string in `.env`
- Make sure MongoDB Atlas IP whitelist includes your IP (or use 0.0.0.0/0 for development)

**Frontend can't connect?**
- Make sure backend is running on port 5000
- Check REACT_APP_API_URL in frontend `.env`

**Port already in use?**
- Change PORT in backend `.env` to another number (e.g., 5001)
- Update REACT_APP_API_URL in frontend `.env` accordingly

## Next Steps

1. Add your rice products in the Products page
2. Set minimum stock levels to get alerts
3. Record stock in/out transactions
4. Monitor your dashboard for insights
5. Use Reports to analyze inventory value

Enjoy managing your rice inventory! 🍚
