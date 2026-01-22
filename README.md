# Rice Inventory Management System (RIMS)

![React](https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)
![Node.js](https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=nodedotjs&logoColor=white)
![MongoDB](https://img.shields.io/badge/MongoDB-47A248?style=for-the-badge&logo=mongodb&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-38B2AC?style=for-the-badge&logo=tailwind-css&logoColor=white)

---

### Project Overview
**RIMS** is an enterprise-grade full-stack application designed to digitize operations for large-scale rice mills. It replaces legacy manual ledger systems with a centralized digital dashboard, offering real-time tracking of stock levels, financial transactions, and operational analytics.

The system is built to handle complex industrial workflows, including batch tracking, moisture control adjustments, and automated financial reporting in **PKR (Pakistani Rupee)**.

### Technical Architecture
The application utilizes a decoupled **MERN (MongoDB, Express, React, Node.js)** architecture to ensure scalability and performance.

| Component | Technology | Description |
| :--- | :--- | :--- |
| **Frontend** | React.js & Tailwind | Responsive dashboard with `Recharts` for data visualization. |
| **Backend** | Node.js & Express | RESTful API with distinct routes for products, transactions, and reports. |
| **Database** | MongoDB | NoSQL schema optimized for high-volume transaction logging. |
| **Security** | JWT & Bcrypt | Stateless authentication with secure password hashing (8 rounds). |
| **Reporting** | PDFKit | Server-side generation of transactional receipts and stock reports. |

### Core Features

#### 📊 Business Intelligence Dashboard
* **Real-Time Analytics:** Visual breakdown of stock movement (In/Out) using Area and Bar charts.
* **Financial Health:** Instant calculation of total inventory value, potential revenue, and profit margins.
* **Low Stock Alerts:** Automated threshold monitoring to prevent stockouts.

#### 📦 Inventory & Product Management
* **Granular Tracking:** Supports multiple units (kg, tons, bags, sacks) with auto-conversion logic.
* **Batch Management:** Tracks products by batch number and expiry dates for quality control.
* **Stock Adjustments:** Specialized transaction types for `stock_in`, `stock_out`, `adjustment`, and `transfer`.

#### 💰 Financial Operations
* **Cash Withdrawal Tracking:** Dedicated module for tracking petty cash and operational withdrawals with audit trails.
* **Transaction Receipts:** Auto-generates professional PDF receipts for every transaction.
* **Profit Analysis:** Calculates ROI per transaction based on Cost Price vs. Selling Price.

#### 🔐 Enterprise Security
* **Audit Logging:** Comprehensive tracking of WHO, WHEN, and WHAT for every critical action.
* **Role-Based Access:** Infrastructure ready for Admin, Manager, and Staff permission levels.
* **Immutable Records:** Transaction history is designed to prevent silent data tampering.

---

### Installation & Setup

**1. Clone the Repository**
```bash
git clone [https://github.com/masifmuhammad/rice-inventory-management.git](https://github.com/masifmuhammad/rice-inventory-management.git)
cd rice-inventory-management

2. Backend Setup

cd backend
npm install
# Create a .env file with:
# MONGODB_URI=your_mongodb_connection_string
# JWT_SECRET=your_jwt_secret
# PORT=5000
npm start

3. Frontend Setup

cd frontend
npm install
# Create a .env file with:
# REACT_APP_API_URL=http://localhost:5000/api
npm start
