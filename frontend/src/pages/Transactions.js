import React, { useState, useEffect } from 'react';
import api from '../services/api';
import { format } from 'date-fns';
import {
  FiPlus,
  FiSearch,
  FiTrendingUp,
  FiTrendingDown,
  FiEdit,
  FiFilter,
  FiDownload,
  FiX
} from 'react-icons/fi';
import { formatPKR, formatQuantity } from '../utils/currency';
import { generateTransactionPDF } from '../utils/pdfGenerator';

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

  const handleDownloadReceipt = (transaction) => {
    const product = transaction.product;
    generateTransactionPDF(transaction, product, {
      name: 'Rice Inventory Management',
      address: 'Pakistan',
      phone: '',
      email: ''
    });
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
          <p className="text-gray-600 mt-1">Track all stock movements and download receipts</p>
        </div>
        <button
          onClick={() => {
            resetForm();
            setShowModal(true);
          }}
          className="mt-4 sm:mt-0 inline-flex items-center px-6 py-3 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors shadow-lg hover:shadow-xl"
        >
          <FiPlus className="w-5 h-5 mr-2" />
          New Transaction
        </button>
      </div>

      {/* Transactions List */}
      <div className="bg-white rounded-xl shadow-lg border border-gray-100 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto"></div>
              <p className="mt-4 text-gray-600">Loading transactions...</p>
            </div>
          </div>
        ) : transactions.length === 0 ? (
          <div className="text-center py-16">
            <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <FiTrendingUp className="w-10 h-10 text-gray-400" />
            </div>
            <p className="text-gray-600 text-lg font-medium">No transactions found</p>
            <p className="text-gray-500 text-sm mt-1">Create your first transaction to get started</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-200">
            {transactions.map((transaction) => (
              <div key={transaction._id} className="p-4 sm:p-6 hover:bg-gray-50 transition-colors">
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                  <div className="flex items-start space-x-3 sm:space-x-4 flex-1">
                    <div className={`p-2 sm:p-3 rounded-xl ${getTransactionColor(transaction.type)} flex-shrink-0`}>
                      {getTransactionIcon(transaction.type)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-2">
                        <h3 className="text-base sm:text-lg font-semibold text-gray-900 truncate">
                          {transaction.product?.name || 'Unknown Product'}
                        </h3>
                        <span className={`px-2 sm:px-3 py-1 text-xs font-semibold rounded-full border ${getTransactionColor(transaction.type)} whitespace-nowrap`}>
                          {transaction.type.replace('_', ' ').toUpperCase()}
                        </span>
                      </div>
                      <div className="mt-2 sm:mt-3 grid grid-cols-2 gap-3 sm:gap-4 text-sm">
                        <div>
                          <span className="text-gray-500 font-medium text-xs sm:text-sm">Quantity:</span>
                          <p className="font-semibold text-gray-900 mt-1 text-sm">
                            {formatQuantity(transaction.quantity, transaction.unit)}
                          </p>
                        </div>
                        {transaction.price && (
                          <div>
                            <span className="text-gray-500 font-medium text-xs sm:text-sm">Price:</span>
                            <p className="font-semibold text-gray-900 mt-1 text-sm">
                              {formatPKR(transaction.price)}
                            </p>
                          </div>
                        )}
                        {transaction.totalValue && (
                          <div>
                            <span className="text-gray-500 font-medium text-xs sm:text-sm">Total:</span>
                            <p className="font-bold text-primary-600 mt-1 text-sm">
                              {formatPKR(transaction.totalValue)}
                            </p>
                          </div>
                        )}
                        <div>
                          <span className="text-gray-500 font-medium text-xs sm:text-sm">Stock:</span>
                          <p className="font-semibold text-gray-900 mt-1 text-sm">
                            {formatQuantity(transaction.stockBefore, transaction.unit)} → {formatQuantity(transaction.stockAfter, transaction.unit)}
                          </p>
                        </div>
                      </div>
                      {(transaction.reference || transaction.supplier || transaction.customer || transaction.notes) && (
                        <div className="mt-3 p-3 bg-gray-50 rounded-lg text-xs sm:text-sm">
                          {transaction.reference && (
                            <div className="flex items-center flex-wrap">
                              <span className="font-medium text-gray-700">Reference:</span>
                              <span className="ml-2 text-gray-600">{transaction.reference}</span>
                            </div>
                          )}
                          {transaction.supplier && (
                            <div className="flex items-center mt-1 flex-wrap">
                              <span className="font-medium text-gray-700">Supplier:</span>
                              <span className="ml-2 text-gray-600">{transaction.supplier}</span>
                            </div>
                          )}
                          {transaction.customer && (
                            <div className="flex items-center mt-1 flex-wrap">
                              <span className="font-medium text-gray-700">Customer:</span>
                              <span className="ml-2 text-gray-600">{transaction.customer}</span>
                            </div>
                          )}
                          {transaction.notes && (
                            <div className="mt-1">
                              <span className="font-medium text-gray-700">Notes:</span>
                              <p className="text-gray-600 mt-1 break-words">{transaction.notes}</p>
                            </div>
                          )}
                        </div>
                      )}
                      <div className="mt-3 text-xs text-gray-500">
                        {format(new Date(transaction.createdAt), 'PPpp')} by {transaction.createdBy?.name || 'Unknown'}
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => handleDownloadReceipt(transaction)}
                    className="w-full sm:w-auto flex items-center justify-center px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-all duration-200 transform hover:scale-105 active:scale-95 shadow-md hover:shadow-lg whitespace-nowrap"
                    title="Download Receipt PDF"
                  >
                    <FiDownload className="w-4 h-4 mr-2" />
                    <span className="text-sm font-medium">Receipt</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-gradient-to-r from-primary-600 to-primary-700 px-6 py-5 flex items-center justify-between rounded-t-2xl">
              <h2 className="text-2xl font-bold text-white">New Transaction</h2>
              <button
                onClick={() => {
                  setShowModal(false);
                  resetForm();
                }}
                className="text-white hover:bg-white hover:bg-opacity-20 rounded-lg p-2 transition-colors"
              >
                <FiX className="w-6 h-6" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Transaction Type <span className="text-red-500">*</span>
                </label>
                <select
                  required
                  value={formData.type}
                  onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                >
                  <option value="stock_in">Stock In (Purchase/Receive)</option>
                  <option value="stock_out">Stock Out (Sale/Issue)</option>
                  <option value="adjustment">Stock Adjustment</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Product <span className="text-red-500">*</span>
                </label>
                <select
                  required
                  value={formData.product}
                  onChange={(e) => setFormData({ ...formData, product: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                >
                  <option value="">Select a product</option>
                  {products.map((product) => (
                    <option key={product._id} value={product._id}>
                      {product.name} {product.sku ? `(${product.sku})` : ''} - Stock: {product.currentStock} {product.unit}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Quantity <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  required
                  value={formData.quantity}
                  onChange={(e) => setFormData({ ...formData, quantity: parseFloat(e.target.value) || 0 })}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  placeholder="Enter quantity"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Price (PKR)</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500 font-medium">Rs.</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.price}
                    onChange={(e) => setFormData({ ...formData, price: parseFloat(e.target.value) || '' })}
                    className="w-full pl-12 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    placeholder="Leave empty to use product price"
                  />
                </div>
              </div>
              {formData.type === 'stock_in' && (
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Supplier</label>
                  <input
                    type="text"
                    value={formData.supplier}
                    onChange={(e) => setFormData({ ...formData, supplier: e.target.value })}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    placeholder="Enter supplier name"
                  />
                </div>
              )}
              {formData.type === 'stock_out' && (
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Customer</label>
                  <input
                    type="text"
                    value={formData.customer}
                    onChange={(e) => setFormData({ ...formData, customer: e.target.value })}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    placeholder="Enter customer name"
                  />
                </div>
              )}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Reference Number</label>
                <input
                  type="text"
                  value={formData.reference}
                  onChange={(e) => setFormData({ ...formData, reference: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  placeholder="Invoice or PO number"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Notes</label>
                <textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  rows="3"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  placeholder="Add any additional notes..."
                />
              </div>
              <div className="flex justify-end space-x-3 pt-6 border-t border-gray-200">
                <button
                  type="button"
                  onClick={() => {
                    setShowModal(false);
                    resetForm();
                  }}
                  className="px-6 py-3 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-6 py-3 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors font-medium shadow-lg hover:shadow-xl"
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
