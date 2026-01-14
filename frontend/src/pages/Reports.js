import React, { useState, useEffect } from 'react';
import api from '../services/api';
import {
  FiDollarSign,
  FiPackage,
  FiTrendingUp,
  FiDownload,
  FiCalendar
} from 'react-icons/fi';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from 'recharts';

const Reports = () => {
  const [stockValueReport, setStockValueReport] = useState(null);
  const [movementReport, setMovementReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState({
    startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    endDate: new Date().toISOString().split('T')[0],
  });

  useEffect(() => {
    fetchReports();
  }, [dateRange]);

  const fetchReports = async () => {
    try {
      const [stockValueRes, movementRes] = await Promise.all([
        api.get('/reports/stock-value'),
        api.get('/reports/movement', {
          params: {
            startDate: dateRange.startDate,
            endDate: dateRange.endDate,
          },
        }),
      ]);
      setStockValueReport(stockValueRes.data);
      setMovementReport(movementRes.data);
    } catch (error) {
      console.error('Error fetching reports:', error);
    } finally {
      setLoading(false);
    }
  };

  const chartData = movementReport?.map((item) => ({
    name: item.product.name,
    'Stock In': item.stockIn,
    'Stock Out': item.stockOut,
  })) || [];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Reports</h1>
          <p className="text-gray-600 mt-1">Analytics and insights for your inventory</p>
        </div>
        <div className="mt-4 sm:mt-0 flex space-x-2">
          <input
            type="date"
            value={dateRange.startDate}
            onChange={(e) => setDateRange({ ...dateRange, startDate: e.target.value })}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
          />
          <input
            type="date"
            value={dateRange.endDate}
            onChange={(e) => setDateRange({ ...dateRange, endDate: e.target.value })}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
          />
        </div>
      </div>

      {/* Stock Value Summary */}
      {stockValueReport && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-semibold text-gray-900 flex items-center">
              <FiDollarSign className="w-6 h-6 text-primary-600 mr-2" />
              Stock Value Report
            </h2>
            <div className="text-right">
              <p className="text-sm text-gray-600">Total Stock Value</p>
              <p className="text-2xl font-bold text-primary-600">
                ₹{stockValueReport.summary.totalValue.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
              </p>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Product</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Category</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Stock</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Cost Price</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Stock Value</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Potential Value</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {stockValueReport.products.map((product) => (
                  <tr key={product.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">{product.name}</div>
                      <div className="text-sm text-gray-500">{product.sku}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="px-2 py-1 text-xs font-medium bg-primary-100 text-primary-800 rounded-full">
                        {product.category}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {product.currentStock.toLocaleString('en-IN', { maximumFractionDigits: 2 })} {product.unit}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      ₹{product.costPrice.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      ₹{product.stockValue.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      ₹{product.potentialValue.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Movement Chart */}
      {movementReport && movementReport.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-6 flex items-center">
            <FiTrendingUp className="w-6 h-6 text-primary-600 mr-2" />
            Stock Movement Analysis
          </h2>
          <ResponsiveContainer width="100%" height={400}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" angle={-45} textAnchor="end" height={100} />
              <YAxis />
              <Tooltip />
              <Legend />
              <Bar dataKey="Stock In" fill="#10b981" />
              <Bar dataKey="Stock Out" fill="#ef4444" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Movement Details */}
      {movementReport && movementReport.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-6">Movement Details</h2>
          <div className="space-y-4">
            {movementReport.map((item) => (
              <div key={item.product.id} className="border border-gray-200 rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h3 className="font-semibold text-gray-900">{item.product.name}</h3>
                    <p className="text-sm text-gray-600">{item.product.sku} - {item.product.category}</p>
                  </div>
                  <div className="text-right">
                    <div className="text-sm text-gray-600">Net Movement</div>
                    <div className={`text-lg font-bold ${(item.stockIn - item.stockOut) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {(item.stockIn - item.stockOut).toLocaleString('en-IN', { maximumFractionDigits: 2 })} kg
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-4 text-sm">
                  <div>
                    <span className="text-gray-600">Stock In:</span>
                    <span className="ml-2 font-medium text-green-600">
                      {item.stockIn.toLocaleString('en-IN', { maximumFractionDigits: 2 })} kg
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-600">Stock Out:</span>
                    <span className="ml-2 font-medium text-red-600">
                      {item.stockOut.toLocaleString('en-IN', { maximumFractionDigits: 2 })} kg
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-600">Adjustments:</span>
                    <span className="ml-2 font-medium text-gray-900">{item.adjustments}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default Reports;
