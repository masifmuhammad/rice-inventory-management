import React, { useState, useEffect } from 'react';
import api from '../services/api';
import { format } from 'date-fns';
import {
  FiPlus,
  FiDollarSign,
  FiX,
  FiTrash2,
  FiCalendar
} from 'react-icons/fi';
import { formatPKR } from '../utils/currency';

const CashWithdrawals = () => {
  const [withdrawals, setWithdrawals] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [formData, setFormData] = useState({
    amount: '',
    purpose: '',
    takenBy: '',
    reference: '',
    notes: '',
  });

  useEffect(() => {
    fetchWithdrawals();
    fetchSummary();
  }, []);

  const fetchWithdrawals = async () => {
    try {
      const response = await api.get('/cash-withdrawals');
      setWithdrawals(response.data);
    } catch (error) {
      console.error('Error fetching cash withdrawals:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchSummary = async () => {
    try {
      const response = await api.get('/cash-withdrawals/summary');
      setSummary(response.data);
    } catch (error) {
      console.error('Error fetching summary:', error);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await api.post('/cash-withdrawals', formData);
      setShowModal(false);
      resetForm();
      fetchWithdrawals();
      fetchSummary();
    } catch (error) {
      alert(error.response?.data?.message || 'Error creating cash withdrawal');
    }
  };

  const handleDelete = async (id) => {
    if (window.confirm('Are you sure you want to delete this cash withdrawal record?')) {
      try {
        await api.delete(`/cash-withdrawals/${id}`);
        fetchWithdrawals();
        fetchSummary();
      } catch (error) {
        alert('Error deleting cash withdrawal');
      }
    }
  };

  const resetForm = () => {
    setFormData({
      amount: '',
      purpose: '',
      takenBy: '',
      reference: '',
      notes: '',
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Cash Withdrawals</h1>
          <p className="text-gray-600 mt-1">Track money taken out from the shop</p>
        </div>
        <button
          onClick={() => {
            resetForm();
            setShowModal(true);
          }}
          className="mt-4 sm:mt-0 inline-flex items-center px-6 py-3 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors shadow-lg hover:shadow-xl"
        >
          <FiPlus className="w-5 h-5 mr-2" />
          Record Withdrawal
        </button>
      </div>

      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-gradient-to-br from-red-500 to-red-600 rounded-xl shadow-lg p-6 text-white">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium opacity-90 uppercase tracking-wider">Total Withdrawn</p>
                <p className="text-3xl font-bold mt-2">{formatPKR(summary.totalAmount)}</p>
                <p className="text-sm mt-2 opacity-90">{summary.count} withdrawals</p>
              </div>
              <div className="w-16 h-16 bg-white bg-opacity-20 rounded-xl flex items-center justify-center">
                <FiDollarSign className="w-8 h-8" />
              </div>
            </div>
          </div>

          <div className="bg-gradient-to-br from-orange-500 to-orange-600 rounded-xl shadow-lg p-6 text-white">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium opacity-90 uppercase tracking-wider">This Month</p>
                <p className="text-3xl font-bold mt-2">{formatPKR(summary.totalAmount)}</p>
                <p className="text-sm mt-2 opacity-90">All time total</p>
              </div>
              <div className="w-16 h-16 bg-white bg-opacity-20 rounded-xl flex items-center justify-center">
                <FiCalendar className="w-8 h-8" />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Withdrawals List */}
      <div className="bg-white rounded-xl shadow-lg border border-gray-100 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto"></div>
              <p className="mt-4 text-gray-600">Loading withdrawals...</p>
            </div>
          </div>
        ) : withdrawals.length === 0 ? (
          <div className="text-center py-16">
            <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <FiDollarSign className="w-10 h-10 text-gray-400" />
            </div>
            <p className="text-gray-600 text-lg font-medium">No cash withdrawals recorded</p>
            <p className="text-gray-500 text-sm mt-1">Record your first withdrawal to get started</p>
          </div>
        ) : (
          <>
            {/* Mobile View */}
            <div className="block sm:hidden divide-y divide-gray-200">
              {withdrawals.map((withdrawal) => (
                <div key={withdrawal._id} className="p-4 hover:bg-gray-50 transition-colors">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1">
                      <div className="text-lg font-bold text-red-600 mb-1">
                        {formatPKR(withdrawal.amount)}
                      </div>
                      <div className="text-sm font-medium text-gray-900 mb-1">
                        {withdrawal.purpose}
                      </div>
                      <div className="text-xs text-gray-500">
                        {format(new Date(withdrawal.createdAt), 'PP')} at {format(new Date(withdrawal.createdAt), 'p')}
                      </div>
                    </div>
                    <button
                      onClick={() => handleDelete(withdrawal._id)}
                      className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-all duration-200 transform hover:scale-110 active:scale-95"
                      title="Delete withdrawal"
                    >
                      <FiTrash2 className="w-5 h-5" />
                    </button>
                  </div>
                  <div className="space-y-1 text-sm">
                    <div className="flex items-center">
                      <span className="text-gray-500 w-24">Taken By:</span>
                      <span className="font-semibold text-gray-900">{withdrawal.takenBy}</span>
                    </div>
                    {withdrawal.reference && (
                      <div className="flex items-center">
                        <span className="text-gray-500 w-24">Reference:</span>
                        <span className="text-gray-600">{withdrawal.reference}</span>
                      </div>
                    )}
                    <div className="flex items-center">
                      <span className="text-gray-500 w-24">Recorded By:</span>
                      <span className="text-gray-600">{withdrawal.createdBy?.name || 'Unknown'}</span>
                    </div>
                    {withdrawal.notes && (
                      <div className="mt-2 p-2 bg-gray-50 rounded text-xs text-gray-600">
                        {withdrawal.notes}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop View */}
            <div className="hidden sm:block overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gradient-to-r from-red-600 to-red-700">
                  <tr>
                    <th className="px-6 py-4 text-left text-xs font-bold text-white uppercase tracking-wider">Date & Time</th>
                    <th className="px-6 py-4 text-left text-xs font-bold text-white uppercase tracking-wider">Amount</th>
                    <th className="px-6 py-4 text-left text-xs font-bold text-white uppercase tracking-wider">Purpose</th>
                    <th className="px-6 py-4 text-left text-xs font-bold text-white uppercase tracking-wider">Taken By</th>
                    <th className="px-6 py-4 text-left text-xs font-bold text-white uppercase tracking-wider">Reference</th>
                    <th className="px-6 py-4 text-left text-xs font-bold text-white uppercase tracking-wider">Recorded By</th>
                    <th className="px-6 py-4 text-right text-xs font-bold text-white uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {withdrawals.map((withdrawal) => (
                    <tr key={withdrawal._id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900">
                          {format(new Date(withdrawal.createdAt), 'PP')}
                        </div>
                        <div className="text-xs text-gray-500">
                          {format(new Date(withdrawal.createdAt), 'p')}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-lg font-bold text-red-600">
                          {formatPKR(withdrawal.amount)}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm font-medium text-gray-900">{withdrawal.purpose}</div>
                        {withdrawal.notes && (
                          <div className="text-xs text-gray-500 mt-1">{withdrawal.notes}</div>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-semibold text-gray-900">{withdrawal.takenBy}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-600">{withdrawal.reference || '-'}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-600">{withdrawal.createdBy?.name || 'Unknown'}</div>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <button
                          onClick={() => handleDelete(withdrawal._id)}
                          className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-all duration-200 transform hover:scale-110 active:scale-95"
                          title="Delete withdrawal"
                        >
                          <FiTrash2 className="w-5 h-5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full">
            <div className="sticky top-0 bg-gradient-to-r from-red-600 to-red-700 px-6 py-5 flex items-center justify-between rounded-t-2xl">
              <h2 className="text-2xl font-bold text-white">Record Cash Withdrawal</h2>
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
                  Amount (PKR) <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500 font-medium">Rs.</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    required
                    value={formData.amount}
                    onChange={(e) => setFormData({ ...formData, amount: parseFloat(e.target.value) || '' })}
                    className="w-full pl-12 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                    placeholder="Enter amount"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Purpose <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={formData.purpose}
                  onChange={(e) => setFormData({ ...formData, purpose: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                  placeholder="e.g., Personal expense, Shop maintenance"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Taken By <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={formData.takenBy}
                  onChange={(e) => setFormData({ ...formData, takenBy: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                  placeholder="Name of person who took the money"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Reference Number</label>
                <input
                  type="text"
                  value={formData.reference}
                  onChange={(e) => setFormData({ ...formData, reference: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                  placeholder="Voucher or receipt number"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Notes</label>
                <textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  rows="3"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                  placeholder="Additional details about this withdrawal..."
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
                  className="px-6 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-medium shadow-lg hover:shadow-xl"
                >
                  Record Withdrawal
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default CashWithdrawals;
