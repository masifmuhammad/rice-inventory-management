import React, { useState, useEffect } from 'react';
import api from '../services/api';
import { format } from 'date-fns';
import {
  FiPlus,
  FiSearch,
  FiTrendingUp,
  FiTrendingDown,
  FiEdit,
  FiFilter
} from 'react-icons/fi';

const Transactions = () => {
  const [transactions, setTransactions] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [formData, setFormData] = useState({
    type: 'stock_in',
    product: '',
    quantity: 0,
    price: '',
    reference: '',
    batchNumber: '',
    expiryDate: '',
    supplier: '',
    customer: '',
    notes: '',
  });

  useEffect(() => {
    fetchProducts();
    fetchTransactions();
  }, []);

  const fetchProducts = async () => {
    try {
      const response = await api.get('/products');
      setProducts(response.data);
    } catch (error) {
      console.error('Error fetching products:', error);
    }
  };

  const fetchTransactions = async () => {
    try {
      const response = await api.get('/transactions', { params: { limit: 100 } });
      setTransactions(response.data);
    } catch (error) {
      console.error('Error fetching transactions:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await api.post('/transactions', formData);
      setShowModal(false);
      resetForm();
      fetchTransactions();
      fetchProducts(); // Refresh products to update stock
    } catch (error) {
      alert(error.response?.data?.message || 'Error creating transaction');
    }
  };

  const resetForm = () => {
    setFormData({
      type: 'stock_in',
      product: '',
      quantity: 0,
      price: '',
      reference: '',
      batchNumber: '',
      expiryDate: '',
      supplier: '',
      customer: '',
      notes: '',
    });
  };

  const getTransactionIcon = (type) => {
    switch (type) {
      case 'stock_in':
        return <FiTrendingUp className="w-5 h-5 text-green-600" />;
      case 'stock_out':
        return <FiTrendingDown className="w-5 h-5 text-red-600" />;
      default:
        return <FiEdit className="w-5 h-5 text-blue-600" />;
    }
  };

  const getTransactionColor = (type) => {
    switch (type) {
      case 'stock_in':
        return 'bg-green-50 text-green-700 border-green-200';
      case 'stock_out':
        return 'bg-red-50 text-red-700 border-red-200';
      default:
        return 'bg-blue-50 text-blue-700 border-blue-200';
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Transactions</h1>
          <p className="text-gray-600 mt-1">Track all stock movements</p>
        </div>
        <button
          onClick={() => {
            resetForm();
            setShowModal(true);
          }}
          className="mt-4 sm:mt-0 inline-flex items-center px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
        >
          <FiPlus className="w-5 h-5 mr-2" />
          New Transaction
        </button>
      </div>

      {/* Transactions List */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
          </div>
        ) : transactions.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-500">No transactions found</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-200">
            {transactions.map((transaction) => (
              <div key={transaction._id} className="p-6 hover:bg-gray-50 transition-colors">
                <div className="flex items-start justify-between">
                  <div className="flex items-start space-x-4 flex-1">
                    <div className={`p-2 rounded-lg ${getTransactionColor(transaction.type)}`}>
                      {getTransactionIcon(transaction.type)}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center space-x-3">
                        <h3 className="text-lg font-semibold text-gray-900">
                          {transaction.product?.name || 'Unknown Product'}
                        </h3>
                        <span className={`px-2 py-1 text-xs font-medium rounded-full border ${getTransactionColor(transaction.type)}`}>
                          {transaction.type.replace('_', ' ').toUpperCase()}
                        </span>
                      </div>
                      <div className="mt-2 grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                        <div>
                          <span className="text-gray-500">Quantity:</span>
                          <span className="ml-2 font-medium text-gray-900">
                            {transaction.quantity.toLocaleString('en-IN', { maximumFractionDigits: 2 })} {transaction.unit}
                          </span>
                        </div>
                        {transaction.price && (
                          <div>
                            <span className="text-gray-500">Price:</span>
                            <span className="ml-2 font-medium text-gray-900">
                              ₹{transaction.price.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                            </span>
                          </div>
                        )}
                        {transaction.totalValue && (
                          <div>
                            <span className="text-gray-500">Total:</span>
                            <span className="ml-2 font-medium text-gray-900">
                              ₹{transaction.totalValue.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                            </span>
                          </div>
                        )}
                        <div>
                          <span className="text-gray-500">Stock:</span>
                          <span className="ml-2 font-medium text-gray-900">
                            {transaction.stockBefore} → {transaction.stockAfter} {transaction.unit}
                          </span>
                        </div>
                      </div>
                      {(transaction.reference || transaction.supplier || transaction.customer || transaction.notes) && (
                        <div className="mt-2 text-sm text-gray-600">
                          {transaction.reference && <span>Ref: {transaction.reference}</span>}
                          {transaction.supplier && <span className="ml-4">Supplier: {transaction.supplier}</span>}
                          {transaction.customer && <span className="ml-4">Customer: {transaction.customer}</span>}
                          {transaction.notes && <div className="mt-1">Notes: {transaction.notes}</div>}
                        </div>
                      )}
                      <div className="mt-2 text-xs text-gray-500">
                        {format(new Date(transaction.createdAt), 'PPpp')} by {transaction.createdBy?.name || 'Unknown'}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full">
            <div className="px-6 py-4 border-b border-gray-200">
              <h2 className="text-xl font-bold text-gray-900">New Transaction</h2>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Transaction Type *</label>
                <select
                  required
                  value={formData.type}
                  onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                >
                  <option value="stock_in">Stock In</option>
                  <option value="stock_out">Stock Out</option>
                  <option value="adjustment">Stock Adjustment</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Product *</label>
                <select
                  required
                  value={formData.product}
                  onChange={(e) => setFormData({ ...formData, product: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                >
                  <option value="">Select a product</option>
                  {products.map((product) => (
                    <option key={product._id} value={product._id}>
                      {product.name} ({product.sku}) - Stock: {product.currentStock} {product.unit}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Quantity *</label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  required
                  value={formData.quantity}
                  onChange={(e) => setFormData({ ...formData, quantity: parseFloat(e.target.value) || 0 })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Price (₹)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.price}
                  onChange={(e) => setFormData({ ...formData, price: parseFloat(e.target.value) || '' })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  placeholder="Leave empty to use product cost price"
                />
              </div>
              {formData.type === 'stock_in' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Supplier</label>
                  <input
                    type="text"
                    value={formData.supplier}
                    onChange={(e) => setFormData({ ...formData, supplier: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  />
                </div>
              )}
              {formData.type === 'stock_out' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Customer</label>
                  <input
                    type="text"
                    value={formData.customer}
                    onChange={(e) => setFormData({ ...formData, customer: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  />
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Reference Number</label>
                <input
                  type="text"
                  value={formData.reference}
                  onChange={(e) => setFormData({ ...formData, reference: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                <textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  rows="3"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
              </div>
              <div className="flex justify-end space-x-3 pt-4 border-t border-gray-200">
                <button
                  type="button"
                  onClick={() => {
                    setShowModal(false);
                    resetForm();
                  }}
                  className="px-6 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-6 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
                >
                  Create Transaction
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Transactions;
