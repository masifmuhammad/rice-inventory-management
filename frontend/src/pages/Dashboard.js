import React, { useState, useEffect } from 'react';
import api from '../services/api';
import {
  FiPackage,
  FiTrendingUp,
  FiAlertCircle,
  FiDollarSign,
  FiActivity
} from 'react-icons/fi';

const Dashboard = () => {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      const response = await api.get('/reports/dashboard');
      setStats(response.data);
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  const statCards = [
    {
      title: 'Total Products',
      value: stats?.totalProducts || 0,
      icon: FiPackage,
      color: 'bg-blue-500',
      bgColor: 'bg-blue-50',
    },
    {
      title: 'Total Stock Value',
      value: `₹${(stats?.totalStockValue || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`,
      icon: FiDollarSign,
      color: 'bg-green-500',
      bgColor: 'bg-green-50',
    },
    {
      title: 'Total Stock Quantity',
      value: `${(stats?.totalStockQuantity || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })} kg`,
      icon: FiTrendingUp,
      color: 'bg-purple-500',
      bgColor: 'bg-purple-50',
    },
    {
      title: 'Low Stock Alerts',
      value: stats?.lowStockCount || 0,
      icon: FiAlertCircle,
      color: 'bg-red-500',
      bgColor: 'bg-red-50',
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-600 mt-1">Overview of your rice inventory</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {statCards.map((stat, index) => {
          const Icon = stat.icon;
          return (
            <div
              key={index}
              className="bg-white rounded-xl shadow-sm p-6 border border-gray-100"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">{stat.title}</p>
                  <p className="text-2xl font-bold text-gray-900 mt-2">{stat.value}</p>
                </div>
                <div className={`${stat.bgColor} p-3 rounded-lg`}>
                  <Icon className={`w-6 h-6 ${stat.color.replace('bg-', 'text-')}`} />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Low Stock Products */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100">
          <div className="p-6 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900 flex items-center">
              <FiAlertCircle className="w-5 h-5 text-red-500 mr-2" />
              Low Stock Products
            </h2>
          </div>
          <div className="p-6">
            {stats?.lowStockProducts?.length > 0 ? (
              <div className="space-y-4">
                {stats.lowStockProducts.slice(0, 5).map((product) => (
                  <div
                    key={product.id}
                    className="flex items-center justify-between p-3 bg-red-50 rounded-lg"
                  >
                    <div>
                      <p className="font-medium text-gray-900">{product.name}</p>
                      <p className="text-sm text-gray-600">{product.sku}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-medium text-red-600">
                        {product.currentStock} / {product.minStockLevel}
                      </p>
                      <p className="text-xs text-gray-500">kg</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-gray-500 text-center py-4">No low stock products</p>
            )}
          </div>
        </div>

        {/* Recent Activity */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100">
          <div className="p-6 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900 flex items-center">
              <FiActivity className="w-5 h-5 text-primary-600 mr-2" />
              Recent Activity (30 Days)
            </h2>
          </div>
          <div className="p-6">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center">
                  <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
                    <FiTrendingUp className="w-5 h-5 text-green-600" />
                  </div>
                  <div className="ml-4">
                    <p className="font-medium text-gray-900">Stock In</p>
                    <p className="text-sm text-gray-600">Last 30 days</p>
                  </div>
                </div>
                <p className="text-lg font-semibold text-green-600">
                  {stats?.recentActivity?.stockIn?.toLocaleString('en-IN', { maximumFractionDigits: 2 })} kg
                </p>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center">
                  <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center">
                    <FiTrendingUp className="w-5 h-5 text-red-600 rotate-180" />
                  </div>
                  <div className="ml-4">
                    <p className="font-medium text-gray-900">Stock Out</p>
                    <p className="text-sm text-gray-600">Last 30 days</p>
                  </div>
                </div>
                <p className="text-lg font-semibold text-red-600">
                  {stats?.recentActivity?.stockOut?.toLocaleString('en-IN', { maximumFractionDigits: 2 })} kg
                </p>
              </div>
              <div className="flex items-center justify-between pt-4 border-t border-gray-200">
                <div className="flex items-center">
                  <div className="w-10 h-10 bg-primary-100 rounded-full flex items-center justify-center">
                    <FiActivity className="w-5 h-5 text-primary-600" />
                  </div>
                  <div className="ml-4">
                    <p className="font-medium text-gray-900">Total Transactions</p>
                    <p className="text-sm text-gray-600">Last 30 days</p>
                  </div>
                </div>
                <p className="text-lg font-semibold text-gray-900">
                  {stats?.recentActivity?.transactions || 0}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
