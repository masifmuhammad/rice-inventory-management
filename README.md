# Rice Factory Inventory Management System

A comprehensive, modern inventory management system designed specifically for rice factories. Built with React frontend and Node.js backend, featuring beautiful UI, real-time stock tracking, and comprehensive reporting.

## 🚀 Features

### Core Features
- **User Authentication** - Secure login/register system with JWT tokens
- **Product Management** - Add, edit, and manage rice products with categories
- **Stock Tracking** - Real-time inventory tracking with stock in/out transactions
- **Low Stock Alerts** - Automatic alerts when products fall below minimum levels
- **Batch & Expiry Tracking** - Track batches and expiry dates for food safety
- **Transaction History** - Complete audit trail of all stock movements
- **Analytics Dashboard** - Visual insights into inventory value and movements
- **Responsive Design** - Works seamlessly on desktop, tablet, and mobile devices

### Product Features
- Multiple rice categories (Basmati, Jasmine, Long Grain, etc.)
- SKU management
- Cost and selling price tracking
- Stock level monitoring (current, min, max)
- Location tracking
- Supplier information

### Transaction Types
- **Stock In** - Add inventory from suppliers
- **Stock Out** - Remove inventory for sales
- **Stock Adjustment** - Correct inventory discrepancies

### Reports
- Stock value report (total inventory value)
- Stock movement analysis
- Low stock alerts
- Transaction history

## 📋 Prerequisites

- Node.js (v14 or higher)
- MongoDB Atlas account (free tier) or local MongoDB
- npm or yarn

## 🛠️ Installation

### 1. Backend Setup

```bash
cd RiceInventory/backend
npm install
```

Create a `.env` file in the backend directory:

```env
PORT=5000
MONGODB_URI=your_mongodb_atlas_connection_string
JWT_SECRET=your_super_secret_jwt_key
NODE_ENV=development
```

### 2. MongoDB Setup (Free Option - MongoDB Atlas)

1. Go to [MongoDB Atlas](https://www.mongodb.com/cloud/atlas)
2. Sign up for a free account
3. Create a new cluster (free tier)
4. Create a database user
5. Whitelist your IP address (or use 0.0.0.0/0 for development)
6. Get your connection string and add it to `.env`

Example connection string:
```
mongodb+srv://username:password@cluster0.xxxxx.mongodb.net/rice-inventory?retryWrites=true&w=majority
```

### 3. Frontend Setup

```bash
cd RiceInventory/frontend
npm install
```

Create a `.env` file in the frontend directory:

```env
REACT_APP_API_URL=http://localhost:5000/api
```

## 🚀 Running the Application

### Start Backend

```bash
cd RiceInventory/backend
npm start
# or for development with auto-reload
npm run dev
```

Backend will run on `http://localhost:5000`

### Start Frontend

```bash
cd RiceInventory/frontend
npm start
```

Frontend will run on `http://localhost:3000`

## 📱 Usage

1. **Register/Login**: Create an account or login with existing credentials
2. **Add Products**: Go to Products page and add your rice products
3. **Track Stock**: Use Transactions to record stock in/out movements
4. **Monitor Dashboard**: View key metrics and low stock alerts
5. **Generate Reports**: Check Reports page for detailed analytics

## 🎨 Tech Stack

### Frontend
- React 18
- React Router
- Tailwind CSS
- Axios
- Recharts (for analytics)
- React Icons

### Backend
- Node.js
- Express.js
- MongoDB with Mongoose
- JWT Authentication
- bcryptjs for password hashing

## 🔒 Security Features

- Password hashing with bcrypt
- JWT token-based authentication
- Protected API routes
- Input validation
- CORS configuration

## 📊 Database Schema

### User
- Name, Email, Password (hashed), Role

### Product
- Name, SKU, Category, Description
- Stock levels (current, min, max)
- Pricing (cost, selling)
- Location, Batch, Expiry, Supplier

### Transaction
- Type (stock_in, stock_out, adjustment)
- Product reference
- Quantity, Price, Total Value
- Stock before/after
- Reference, Supplier, Customer, Notes

## 🌐 Deployment

### Backend Deployment Options (Free)
- **Render.com** - Free tier available
- **Railway.app** - Free tier available
- **Heroku** - Free tier (limited)
- **Vercel** - For serverless functions

### Frontend Deployment Options (Free)
- **Vercel** - Excellent for React apps
- **Netlify** - Great free tier
- **GitHub Pages** - Free hosting

### Environment Variables for Production

Update your frontend `.env` with production API URL:
```
REACT_APP_API_URL=https://your-backend-url.com/api
```

## 📝 Notes

- MongoDB Atlas free tier provides 512MB storage (sufficient for most use cases)
- All data is stored securely in the cloud
- Responsive design works on all devices
- Real-time stock updates prevent inventory loss

## 🐛 Troubleshooting

### Backend won't start
- Check MongoDB connection string
- Ensure PORT is not already in use
- Verify all dependencies are installed

### Frontend can't connect to backend
- Check REACT_APP_API_URL in frontend .env
- Ensure backend is running
- Check CORS settings in backend

### MongoDB connection issues
- Verify connection string
- Check IP whitelist in MongoDB Atlas
- Ensure database user has correct permissions

## 📧 Support

For issues or questions, please check the code comments or create an issue in the repository.

## 📄 License

This project is for personal/business use.

---

**Built with ❤️ for efficient rice factory inventory management**
