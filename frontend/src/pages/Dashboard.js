import React, { useState, useEffect } from 'react';
import api from '../services/api';
import {
  FiPackage,
  FiTrendingUp,
  FiAlertCircle,
  FiDollarSign,
  FiActivity,
  FiShoppingCart,
  FiPieChart,
  FiBarChart2,
  FiDownload
} from 'react-icons/fi';
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Area,
  AreaChart
} from 'recharts';
import { formatPKR, formatCompactPKR } from '../utils/currency';
import { generateInventoryReportPDF } from '../utils/pdfGenerator';

const Dashboard = () => {
  const [stats, setStats] = useState(null);
  const [biAnalytics, setBiAnalytics] = useState(null);
  const [profitAnalysis, setProfitAnalysis] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedDateRange, setSelectedDateRange] = useState('30');

  useEffect(() => {
    fetchAllData();
  }, [selectedDateRange]);

  const fetchAllData = async () => {
    try {
      setLoading(true);
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - parseInt(selectedDateRange));

      const [dashboardRes, biRes, profitRes] = await Promise.all([
        api.get('/reports/dashboard'),
        api.get('/reports/bi-analytics', {
          params: {
            startDate: startDate.toISOString(),
            endDate: endDate.toISOString()
          }
        }),
        api.get('/reports/profit-analysis', {
          params: {
            startDate: startDate.toISOString(),
            endDate: endDate.toISOString()
          }
        })
      ]);

      setStats(dashboardRes.data);
      setBiAnalytics(biRes.data);
      setProfitAnalysis(profitRes.data);
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleExportReport = async () => {
    try {
      const response = await api.get('/reports/stock-value');
      generateInventoryReportPDF(response.data.products, response.data.summary);
    } catch (error) {
      console.error('Error generating report:', error);
      alert('Failed to generate report');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-primary-600 mx-auto"></div>
          <p className="mt-4 text-gray-600 font-medium">Loading analytics...</p>
        </div>
      </div>
    );
  }

  const COLORS = ['#0284c7', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

  const statCards = [
    {
      title: 'Total Inventory Value',
      value: formatCompactPKR(stats?.totalStockValue || 0),
      fullValue: formatPKR(stats?.totalStockValue || 0),
      icon: FiDollarSign,
      color: 'bg-green-500',
      bgColor: 'bg-gradient-to-br from-green-50 to-green-100',
      change: '+12.5%',
      trend: 'up'
    },
    {
      title: 'Total Products',
      value: stats?.totalProducts || 0,
      icon: FiPackage,
      color: 'bg-blue-500',
      bgColor: 'bg-gradient-to-br from-blue-50 to-blue-100',
      change: '+3',
      trend: 'up'
    },
    {
      title: 'Total Revenue',
      value: formatCompactPKR(profitAnalysis?.summary?.totalRevenue || 0),
      fullValue: formatPKR(profitAnalysis?.summary?.totalRevenue || 0),
      icon: FiShoppingCart,
      color: 'bg-purple-500',
      bgColor: 'bg-gradient-to-br from-purple-50 to-purple-100',
      change: `${profitAnalysis?.summary?.transactionCount || 0} sales`,
      trend: 'up'
    },
    {
      title: 'Low Stock Alerts',
      value: stats?.lowStockCount || 0,
      icon: FiAlertCircle,
      color: 'bg-red-500',
      bgColor: 'bg-gradient-to-br from-red-50 to-red-100',
      change: 'Needs attention',
      trend: stats?.lowStockCount > 0 ? 'down' : 'neutral'
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Business Intelligence Dashboard</h1>
          <p className="text-gray-600 mt-1">Comprehensive analytics and insights for your rice inventory</p>
        </div>
        <div className="flex items-center space-x-3 mt-4 md:mt-0">
          <select
            value={selectedDateRange}
            onChange={(e) => setSelectedDateRange(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
          >
            <option value="7">Last 7 Days</option>
            <option value="30">Last 30 Days</option>
            <option value="90">Last 90 Days</option>
            <option value="180">Last 6 Months</option>
            <option value="365">Last Year</option>
          </select>
          <button
            onClick={handleExportReport}
            className="flex items-center px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
          >
            <FiDownload className="mr-2" />
            Export Report
          </button>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {statCards.map((stat, index) => {
          const Icon = stat.icon;
          return (
            <div
              key={index}
              className="bg-white rounded-xl shadow-lg p-6 border border-gray-100 hover:shadow-xl transition-shadow"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-600 uppercase tracking-wider">{stat.title}</p>
                  <p className="text-3xl font-bold text-gray-900 mt-3" title={stat.fullValue}>
                    {stat.value}
                  </p>
                  <p className={`text-sm mt-2 flex items-center ${
                    stat.trend === 'up' ? 'text-green-600' : stat.trend === 'down' ? 'text-red-600' : 'text-gray-600'
                  }`}>
                    {stat.trend === 'up' && <FiTrendingUp className="mr-1" />}
                    {stat.change}
                  </p>
                </div>
                <div className={`${stat.bgColor} p-4 rounded-xl`}>
                  <Icon className={`w-7 h-7 ${stat.color.replace('bg-', 'text-')}`} />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Profit Analysis */}
      {profitAnalysis && profitAnalysis.summary.totalProfit > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="bg-gradient-to-br from-green-500 to-green-600 rounded-xl shadow-lg p-6 text-white">
            <FiDollarSign className="w-8 h-8 mb-3 opacity-90" />
            <p className="text-sm font-medium opacity-90 uppercase tracking-wider">Total Profit</p>
            <p className="text-3xl font-bold mt-2">{formatPKR(profitAnalysis.summary.totalProfit)}</p>
          </div>
          <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl shadow-lg p-6 text-white">
            <FiPieChart className="w-8 h-8 mb-3 opacity-90" />
            <p className="text-sm font-medium opacity-90 uppercase tracking-wider">Average Margin</p>
            <p className="text-3xl font-bold mt-2">{profitAnalysis.summary.averageMargin.toFixed(2)}%</p>
          </div>
          <div className="bg-gradient-to-br from-purple-500 to-purple-600 rounded-xl shadow-lg p-6 text-white">
            <FiShoppingCart className="w-8 h-8 mb-3 opacity-90" />
            <p className="text-sm font-medium opacity-90 uppercase tracking-wider">Total Sales</p>
            <p className="text-3xl font-bold mt-2">{profitAnalysis.summary.transactionCount}</p>
          </div>
        </div>
      )}

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Transaction Trends Chart */}
        <div className="bg-white rounded-xl shadow-lg border border-gray-100 p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-bold text-gray-900 flex items-center">
              <FiBarChart2 className="w-5 h-5 text-primary-600 mr-2" />
              Stock Movement Trends
            </h2>
          </div>
          {biAnalytics?.transactionTrends?.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={biAnalytics.transactionTrends}>
                <defs>
                  <linearGradient id="colorStockIn" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.8}/>
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="colorStockOut" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#ef4444" stopOpacity={0.8}/>
                    <stop offset="95%" stopColor="#ef4444" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" tick={{fontSize: 12}} />
                <YAxis tick={{fontSize: 12}} />
                <Tooltip />
                <Legend />
                <Area type="monotone" dataKey="stock_in" stroke="#10b981" fillOpacity={1} fill="url(#colorStockIn)" name="Stock In" />
                <Area type="monotone" dataKey="stock_out" stroke="#ef4444" fillOpacity={1} fill="url(#colorStockOut)" name="Stock Out" />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-gray-500 text-center py-12">No data available</p>
          )}
        </div>

        {/* Category Revenue Chart */}
        <div className="bg-white rounded-xl shadow-lg border border-gray-100 p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-bold text-gray-900 flex items-center">
              <FiPieChart className="w-5 h-5 text-primary-600 mr-2" />
              Revenue by Category
            </h2>
          </div>
          {biAnalytics?.categoryRevenue?.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={biAnalytics.categoryRevenue}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({category, percent}) => `${category}: ${(percent * 100).toFixed(0)}%`}
                  outerRadius={100}
                  fill="#8884d8"
                  dataKey="revenue"
                >
                  {biAnalytics.categoryRevenue.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(value) => formatPKR(value)} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-gray-500 text-center py-12">No data available</p>
          )}
        </div>
      </div>

      {/* Category Analysis & Top Products */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Category Analysis */}
        <div className="bg-white rounded-xl shadow-lg border border-gray-100">
          <div className="p-6 border-b border-gray-200">
            <h2 className="text-lg font-bold text-gray-900 flex items-center">
              <FiBarChart2 className="w-5 h-5 text-primary-600 mr-2" />
              Category Stock Value
            </h2>
          </div>
          <div className="p-6">
            {biAnalytics?.categoryAnalysis?.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={biAnalytics.categoryAnalysis}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="category" tick={{fontSize: 11}} />
                  <YAxis tick={{fontSize: 12}} />
                  <Tooltip formatter={(value) => formatPKR(value)} />
                  <Legend />
                  <Bar dataKey="totalValue" fill="#0284c7" name="Current Value" />
                  <Bar dataKey="totalPotentialValue" fill="#10b981" name="Potential Value" />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-gray-500 text-center py-12">No data available</p>
            )}
          </div>
        </div>

        {/* Top Products */}
        <div className="bg-white rounded-xl shadow-lg border border-gray-100">
          <div className="p-6 border-b border-gray-200">
            <h2 className="text-lg font-bold text-gray-900 flex items-center">
              <FiTrendingUp className="w-5 h-5 text-primary-600 mr-2" />
              Top Performing Products
            </h2>
          </div>
          <div className="p-6">
            {biAnalytics?.topProducts?.length > 0 ? (
              <div className="space-y-4">
                {biAnalytics.topProducts.slice(0, 5).map((product, index) => (
                  <div
                    key={product.id}
                    className="flex items-center justify-between p-4 bg-gradient-to-r from-primary-50 to-transparent rounded-lg hover:from-primary-100 transition-colors"
                  >
                    <div className="flex items-center space-x-4">
                      <div className="flex-shrink-0 w-10 h-10 bg-primary-600 text-white rounded-full flex items-center justify-center font-bold">
                        {index + 1}
                      </div>
                      <div>
                        <p className="font-semibold text-gray-900">{product.name}</p>
                        <p className="text-sm text-gray-600">{product.category}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-primary-600">{formatPKR(product.totalRevenue)}</p>
                      <p className="text-xs text-gray-500">{product.totalQuantitySold.toFixed(2)} units sold</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-gray-500 text-center py-12">No data available</p>
            )}
          </div>
        </div>
      </div>

      {/* Low Stock & Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Low Stock Products */}
        <div className="bg-white rounded-xl shadow-lg border border-gray-100">
          <div className="p-6 border-b border-gray-200">
            <h2 className="text-lg font-bold text-gray-900 flex items-center">
              <FiAlertCircle className="w-5 h-5 text-red-500 mr-2" />
              Low Stock Alerts
            </h2>
          </div>
          <div className="p-6">
            {stats?.lowStockProducts?.length > 0 ? (
              <div className="space-y-3">
                {stats.lowStockProducts.slice(0, 5).map((product) => (
                  <div
                    key={product.id}
                    className="flex items-center justify-between p-4 bg-red-50 rounded-lg border border-red-200 hover:bg-red-100 transition-colors"
                  >
                    <div>
                      <p className="font-semibold text-gray-900">{product.name}</p>
                      <p className="text-sm text-gray-600">{product.sku || 'No SKU'}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold text-red-600">
                        {product.currentStock} / {product.minStockLevel}
                      </p>
                      <p className="text-xs text-gray-500">Current / Min</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-12">
                <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
                  <FiPackage className="w-8 h-8 text-green-600" />
                </div>
                <p className="text-gray-600 font-medium">All products are well stocked!</p>
              </div>
            )}
          </div>
        </div>

        {/* Recent Activity Summary */}
        <div className="bg-white rounded-xl shadow-lg border border-gray-100">
          <div className="p-6 border-b border-gray-200">
            <h2 className="text-lg font-bold text-gray-900 flex items-center">
              <FiActivity className="w-5 h-5 text-primary-600 mr-2" />
              Activity Summary
            </h2>
          </div>
          <div className="p-6">
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-4">
                  <div className="w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center">
                    <FiTrendingUp className="w-6 h-6 text-green-600" />
                  </div>
                  <div>
                    <p className="font-semibold text-gray-900">Stock In</p>
                    <p className="text-sm text-gray-600">Incoming inventory</p>
                  </div>
                </div>
                <p className="text-xl font-bold text-green-600">
                  {stats?.recentActivity?.stockIn?.toLocaleString('en-PK', { maximumFractionDigits: 2 })} kg
                </p>
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-4">
                  <div className="w-12 h-12 bg-red-100 rounded-xl flex items-center justify-center">
                    <FiTrendingUp className="w-6 h-6 text-red-600 rotate-180" />
                  </div>
                  <div>
                    <p className="font-semibold text-gray-900">Stock Out</p>
                    <p className="text-sm text-gray-600">Outgoing inventory</p>
                  </div>
                </div>
                <p className="text-xl font-bold text-red-600">
                  {stats?.recentActivity?.stockOut?.toLocaleString('en-PK', { maximumFractionDigits: 2 })} kg
                </p>
              </div>

              <div className="flex items-center justify-between pt-4 border-t border-gray-200">
                <div className="flex items-center space-x-4">
                  <div className="w-12 h-12 bg-primary-100 rounded-xl flex items-center justify-center">
                    <FiActivity className="w-6 h-6 text-primary-600" />
                  </div>
                  <div>
                    <p className="font-semibold text-gray-900">Total Transactions</p>
                    <p className="text-sm text-gray-600">All activities</p>
                  </div>
                </div>
                <p className="text-xl font-bold text-primary-600">
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
