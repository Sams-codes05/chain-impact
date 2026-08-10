import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { format, isValid, parseISO } from 'date-fns';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CancelIcon from '@mui/icons-material/Cancel';
import RefreshIcon from '@mui/icons-material/Refresh';
import SearchIcon from '@mui/icons-material/Search';
import VerifiedIcon from '@mui/icons-material/Verified';
import AccountBalanceWalletIcon from '@mui/icons-material/AccountBalanceWallet';
import NetworkCheckIcon from '@mui/icons-material/NetworkCheck';
import InfoIcon from '@mui/icons-material/Info';
import CloseIcon from '@mui/icons-material/Close';

import { donationsAPI, blockchainAPI } from '../services/api';

const safeParseDate = (value) => {
  if (value instanceof Date) {
    return isValid(value) ? value : null;
  }

  if (typeof value === 'number') {
    const numericDate = new Date(value);
    return isValid(numericDate) ? numericDate : null;
  }

  if (typeof value === 'string') {
    const isoCandidate = parseISO(value);
    if (isValid(isoCandidate)) {
      return isoCandidate;
    }

    const fallbackCandidate = new Date(value);
    return isValid(fallbackCandidate) ? fallbackCandidate : null;
  }

  return null;
};

const AdminPage = () => {
  const [donations, setDonations] = useState([]);
  const [selectedDonation, setSelectedDonation] = useState(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [blockchainStatus, setBlockchainStatus] = useState(null);
  const [updateData, setUpdateData] = useState({
    status: '',
    verification_notes: '',
  });
  const [dataLoading, setDataLoading] = useState(false);
  const [dataError, setDataError] = useState('');
  const [actionLoading, setActionLoading] = useState(null);
  const [actionError, setActionError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  const fetchDonations = useCallback(async () => {
    try {
      const response = await donationsAPI.getAll({ per_page: 50 });
      const rows = Array.isArray(response.data?.donations)
        ? response.data.donations
        : Array.isArray(response.data)
        ? response.data
        : [];
      setDonations(rows);
    } catch (error) {
      console.error('Error fetching donations:', error);
      throw error;
    }
  }, []);

  const fetchBlockchainStatus = useCallback(async () => {
    try {
      const response = await blockchainAPI.getStatus();
      setBlockchainStatus(response.data || null);
    } catch (error) {
      console.error('Error fetching blockchain status:', error);
      throw error;
    }
  }, []);

  const loadAdminData = useCallback(async () => {
    setDataLoading(true);
    setDataError('');

    try {
      const [donationsResult, blockchainResult] = await Promise.allSettled([
        fetchDonations(),
        fetchBlockchainStatus(),
      ]);

      if (donationsResult.status === 'rejected' && blockchainResult.status === 'rejected') {
        setDataError('Unable to load admin data. Please try again.');
      } else if (donationsResult.status === 'rejected') {
        setDataError('Unable to load donation records. Blockchain status is still available.');
      } else if (blockchainResult.status === 'rejected') {
        setDataError('Unable to load blockchain status. Donation records are still available.');
      }
    } catch (_error) {
      setDataError('Unable to load admin data. Please try again.');
    } finally {
      setDataLoading(false);
    }
  }, [fetchDonations, fetchBlockchainStatus]);

  useEffect(() => {
    loadAdminData();
  }, [loadAdminData]);

  const handleOpenDialog = (donation) => {
    setSelectedDonation(donation);
    setUpdateData({
      status: donation.status || 'pending',
      verification_notes: donation.verification_notes || '',
    });
    setDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setDialogOpen(false);
    setSelectedDonation(null);
  };

  const handleUpdate = async () => {
    if (!selectedDonation) return;

    try {
      await donationsAPI.update(selectedDonation.id, updateData);
      await loadAdminData();
      handleCloseDialog();
    } catch (error) {
      console.error('Error updating donation:', error);
      setActionError('Failed to update donation');
    }
  };

  const handleQuickApprove = async (donationId) => {
    setActionLoading(donationId);
    setActionError('');
    try {
      await donationsAPI.update(donationId, {
        status: 'verified',
        verification_notes: 'Approved by admin'
      });
      await loadAdminData();
    } catch (error) {
      console.error('Error approving donation:', error);
      setActionError('Failed to approve donation');
    } finally {
      setActionLoading(null);
    }
  };

  const handleQuickReject = async (donationId) => {
    setActionLoading(donationId);
    setActionError('');
    try {
      await donationsAPI.update(donationId, {
        status: 'rejected',
        verification_notes: 'Rejected by admin'
      });
      await loadAdminData();
    } catch (error) {
      console.error('Error rejecting donation:', error);
      setActionError('Failed to reject donation');
    } finally {
      setActionLoading(null);
    }
  };

  const filteredDonations = donations.filter(donation => {
    const searchLower = searchTerm.toLowerCase();
    return (
      donation.donor_name?.toLowerCase().includes(searchLower) ||
      donation.donor_email?.toLowerCase().includes(searchLower) ||
      donation.transaction_id?.toLowerCase().includes(searchLower) ||
      donation.receipt_number?.toLowerCase().includes(searchLower)
    );
  });

  if (dataLoading && donations.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-[80vh]">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-ocean-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 pt-24 pb-12">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header Section */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }} 
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-10"
        >
          <div>
            <h1 className="text-4xl font-bold text-slate-900 mb-2">Admin Dashboard</h1>
            <p className="text-slate-500 text-lg">Manage and verify donation records across the platform.</p>
          </div>
          <button 
            onClick={loadAdminData}
            disabled={dataLoading}
            className="flex items-center gap-2 px-6 py-3 bg-white border border-slate-200 text-slate-700 rounded-xl hover:bg-slate-50 transition-all shadow-sm font-medium disabled:opacity-50"
          >
            <RefreshIcon className={dataLoading ? 'animate-spin' : ''} fontSize="small" />
            Refresh Data
          </button>
        </motion.div>

        {/* Alerts */}
        <AnimatePresence>
          {(dataError || actionError) && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="mb-6"
            >
              <div className="p-4 bg-rose-50 border border-rose-100 rounded-xl flex items-center gap-3 text-rose-700">
                <InfoIcon fontSize="small" />
                <p className="font-medium">{dataError || actionError}</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Blockchain Status Cards */}
        {blockchainStatus && (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-10"
          >
            <div className="glass-card p-6 rounded-2xl border border-slate-200/60 shadow-sm">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 rounded-lg bg-sky-50 text-sky-600">
                  <NetworkCheckIcon fontSize="small" />
                </div>
                <p className="text-slate-500 font-medium">Network</p>
              </div>
              <div className="flex items-center justify-between">
                <h3 className="text-xl font-bold text-slate-900 capitalize">{blockchainStatus.network || 'Mainnet'}</h3>
                <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${blockchainStatus.connected ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                  {blockchainStatus.connected ? 'Connected' : 'Offline'}
                </span>
              </div>
            </div>

            <div className="glass-card p-6 rounded-2xl border border-slate-200/60 shadow-sm">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 rounded-lg bg-emerald-50 text-emerald-600">
                  <AccountBalanceWalletIcon fontSize="small" />
                </div>
                <p className="text-slate-500 font-medium">Wallet Balance</p>
              </div>
              <h3 className="text-2xl font-bold text-slate-900">
                {Number(blockchainStatus?.balance ?? 0).toFixed(4)} <span className="text-sm font-normal text-slate-500 uppercase">ETH</span>
              </h3>
            </div>

            <div className="glass-card p-6 rounded-2xl border border-slate-200/60 shadow-sm">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 rounded-lg bg-purple-50 text-purple-600">
                  <VerifiedIcon fontSize="small" />
                </div>
                <p className="text-slate-500 font-medium">On-Chain Verified</p>
              </div>
              <h3 className="text-2xl font-bold text-slate-900">
                {Number(blockchainStatus?.total_donations ?? 0).toLocaleString('en-IN')}
              </h3>
            </div>

            <div className="glass-card p-6 rounded-2xl border border-slate-200/60 shadow-sm flex items-center justify-center bg-slate-900 text-white">
              <div className="text-center">
                <p className="text-slate-400 text-sm mb-1">Contract Status</p>
                <p className="text-emerald-400 font-bold flex items-center gap-2">
                  <div className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse"></div>
                  Operational
                </p>
              </div>
            </div>
          </motion.div>
        )}

        {/* Donations Table Section */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="glass-card rounded-2xl border border-slate-200/60 overflow-hidden"
        >
          <div className="p-6 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <h3 className="text-xl font-bold text-slate-900">Donation Requests</h3>
            
            <div className="relative max-w-md w-full">
              <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" fontSize="small" />
              <input
                type="text"
                placeholder="Search by name, email, or transaction ID..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-ocean-500/20 focus:border-ocean-500 transition-all"
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/50">
                  <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Donor Details</th>
                  <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Amount</th>
                  <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Transaction Info</th>
                  <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Status</th>
                  <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Blockchain</th>
                  <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredDonations.length > 0 ? (
                  filteredDonations.map((donation, idx) => {
                    const parsedDate = safeParseDate(donation.created_at);
                    const formattedDate = parsedDate ? format(parsedDate, 'MMM dd, yyyy') : '—';
                    const normalizedStatus = (donation.status || 'pending').toLowerCase();
                    const isBlockchainVerified = Boolean(
                      donation.blockchain_verified ?? donation.on_chain_confirmation ?? donation.on_chain ?? false
                    );

                    return (
                      <motion.tr 
                        key={donation.id} 
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: idx * 0.03 }}
                        className="hover:bg-slate-50/50 transition-colors"
                      >
                        <td className="px-6 py-4">
                          <div className="flex flex-col">
                            <span className="font-semibold text-slate-900">{donation.donor_name || 'Anonymous'}</span>
                            <span className="text-xs text-slate-500">{donation.donor_email || 'No email'}</span>
                            <span className="text-[10px] text-slate-400 mt-1 uppercase tracking-tighter font-medium">
                              ID: {donation.id} • {formattedDate}
                            </span>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span className="font-bold text-slate-900">
                            ₹{Number(donation.amount || 0).toLocaleString('en-IN')}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex flex-col max-w-[180px]">
                            <span className="text-xs font-mono text-slate-600 truncate">
                              {donation.transaction_id || donation.tx_hash || '—'}
                            </span>
                            <span className="text-[10px] text-slate-400 mt-0.5">
                              Receipt: {donation.receipt_number || 'N/A'}
                            </span>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${
                            normalizedStatus === 'verified' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' :
                            normalizedStatus === 'pending' ? 'bg-amber-50 text-amber-700 border-amber-100' :
                            'bg-rose-50 text-rose-700 border-rose-100'
                          }`}>
                            {normalizedStatus}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          {isBlockchainVerified ? (
                            <div className="flex items-center gap-1.5 text-emerald-600">
                              <VerifiedIcon className="text-[16px]" />
                              <span className="text-[11px] font-bold uppercase tracking-tight">Verified</span>
                            </div>
                          ) : (
                            <span className="text-[11px] font-medium text-slate-400 uppercase tracking-tight">Off-chain</span>
                          )}
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            {normalizedStatus === 'pending' && (
                              <>
                                <button
                                  onClick={() => handleQuickApprove(donation.id)}
                                  disabled={actionLoading === donation.id}
                                  className="p-2 bg-emerald-50 text-emerald-600 rounded-lg hover:bg-emerald-100 transition-colors disabled:opacity-50"
                                  title="Quick Approve"
                                >
                                  {actionLoading === donation.id ? <div className="h-4 w-4 border-2 border-emerald-600 border-t-transparent animate-spin rounded-full"></div> : <CheckCircleIcon fontSize="small" />}
                                </button>
                                <button
                                  onClick={() => handleQuickReject(donation.id)}
                                  disabled={actionLoading === donation.id}
                                  className="p-2 bg-rose-50 text-rose-600 rounded-lg hover:bg-rose-100 transition-colors disabled:opacity-50"
                                  title="Quick Reject"
                                >
                                  {actionLoading === donation.id ? <div className="h-4 w-4 border-2 border-rose-600 border-t-transparent animate-spin rounded-full"></div> : <CancelIcon fontSize="small" />}
                                </button>
                              </>
                            )}
                            <button
                              onClick={() => handleOpenDialog(donation)}
                              className="px-3 py-1.5 text-xs font-bold text-ocean-600 hover:bg-ocean-50 rounded-lg transition-colors"
                            >
                              REVIEW
                            </button>
                          </div>
                        </td>
                      </motion.tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan="6" className="px-6 py-12 text-center text-slate-400 font-medium">
                      {searchTerm ? 'No results found matching your search.' : 'No donation requests found.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </motion.div>
      </div>

      {/* Review Modal */}
      <AnimatePresence>
        {dialogOpen && selectedDonation && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={handleCloseDialog}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-2xl bg-white rounded-3xl shadow-2xl overflow-hidden"
            >
              <div className="flex items-center justify-between p-6 border-b border-slate-100 bg-slate-50/50">
                <h2 className="text-xl font-bold text-slate-900">Review Donation Request</h2>
                <button 
                  onClick={handleCloseDialog}
                  className="p-2 hover:bg-slate-200 rounded-full transition-colors text-slate-500"
                >
                  <CloseIcon />
                </button>
              </div>

              <div className="p-8 max-h-[70vh] overflow-y-auto">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
                  {/* Donor Info */}
                  <div className="space-y-4">
                    <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Donor Information</h4>
                    <div className="space-y-3">
                      <div>
                        <p className="text-[10px] text-slate-500 uppercase font-bold tracking-tight">Full Name</p>
                        <p className="text-slate-900 font-semibold">{selectedDonation.donor_name || 'Anonymous'}</p>
                      </div>
                      <div>
                        <p className="text-[10px] text-slate-500 uppercase font-bold tracking-tight">Email Address</p>
                        <p className="text-slate-900">{selectedDonation.donor_email || '—'}</p>
                      </div>
                      <div>
                        <p className="text-[10px] text-slate-500 uppercase font-bold tracking-tight">Phone</p>
                        <p className="text-slate-900">{selectedDonation.donor_phone || '—'}</p>
                      </div>
                      <div>
                        <p className="text-[10px] text-slate-500 uppercase font-bold tracking-tight">PAN Number</p>
                        <p className="text-slate-900 font-mono text-sm">{selectedDonation.pan_number || '—'}</p>
                      </div>
                    </div>
                  </div>

                  {/* Donation Details */}
                  <div className="space-y-4">
                    <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Donation Details</h4>
                    <div className="space-y-3 p-4 bg-slate-50 rounded-2xl border border-slate-100">
                      <div className="flex justify-between items-end">
                        <p className="text-[10px] text-slate-500 uppercase font-bold tracking-tight">Amount</p>
                        <p className="text-2xl font-black text-emerald-600">₹{Number(selectedDonation.amount || 0).toLocaleString('en-IN')}</p>
                      </div>
                      <div className="pt-2 border-t border-slate-200 space-y-2">
                        <div className="flex justify-between text-sm">
                          <span className="text-slate-500">Receipt #</span>
                          <span className="text-slate-900 font-medium">{selectedDonation.receipt_number || '—'}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-slate-500">Method</span>
                          <span className="text-slate-900 font-medium capitalize">{selectedDonation.payment_method || 'Other'}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-slate-500">Date</span>
                          <span className="text-slate-900 font-medium">
                            {safeParseDate(selectedDonation.created_at)
                              ? format(safeParseDate(selectedDonation.created_at), 'MMM dd, yyyy HH:mm')
                              : '—'}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Blockchain Info */}
                <div className="mb-8 p-4 bg-ocean-50/30 border border-ocean-100 rounded-2xl">
                  <h4 className="text-xs font-bold text-ocean-600 uppercase tracking-widest mb-3">Blockchain Confirmation</h4>
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-2">
                      <div className={`h-2 w-2 rounded-full ${selectedDonation.blockchain_verified ? 'bg-emerald-500' : 'bg-slate-300'}`}></div>
                      <span className="text-sm font-bold text-slate-700">
                        {selectedDonation.blockchain_verified ? 'Verified On-Chain' : 'Pending On-Chain Confirmation'}
                      </span>
                    </div>
                    {selectedDonation.blockchain_tx_hash && (
                      <div className="mt-2">
                        <p className="text-[10px] text-slate-500 uppercase font-bold tracking-tight mb-1">Transaction Hash</p>
                        <p className="text-[11px] font-mono text-ocean-700 break-all bg-white p-2 rounded-lg border border-ocean-100">
                          {selectedDonation.blockchain_tx_hash}
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Decision Form */}
                <div className="space-y-6 pt-6 border-t border-slate-100">
                  <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Verification Decision</h4>
                  <div className="grid grid-cols-1 gap-4">
                    <div className="space-y-2">
                      <label className="text-[10px] text-slate-500 uppercase font-bold tracking-tight">Update Status</label>
                      <div className="flex gap-4">
                        {['pending', 'verified', 'rejected'].map((status) => (
                          <button
                            key={status}
                            onClick={() => setUpdateData(prev => ({ ...prev, status }))}
                            className={`flex-1 py-2 px-4 rounded-xl border-2 text-sm font-bold capitalize transition-all ${
                              updateData.status === status
                                ? status === 'verified' ? 'bg-emerald-50 border-emerald-500 text-emerald-700' :
                                  status === 'rejected' ? 'bg-rose-50 border-rose-500 text-rose-700' :
                                  'bg-amber-50 border-amber-500 text-amber-700'
                                : 'bg-white border-slate-100 text-slate-400 hover:border-slate-200'
                            }`}
                          >
                            {status}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className="text-[10px] text-slate-500 uppercase font-bold tracking-tight">Verification Notes</label>
                      <textarea
                        value={updateData.verification_notes}
                        onChange={(e) => setUpdateData(prev => ({ ...prev, verification_notes: e.target.value }))}
                        placeholder="Add internal notes or reason for approval/rejection..."
                        className="w-full px-4 py-3 rounded-2xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-ocean-500/20 focus:border-ocean-500 transition-all text-sm min-h-[100px]"
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="p-6 bg-slate-50 border-t border-slate-100 flex justify-end gap-3">
                <button
                  onClick={handleCloseDialog}
                  className="px-6 py-2.5 text-sm font-bold text-slate-500 hover:bg-slate-200 rounded-xl transition-all"
                >
                  CANCEL
                </button>
                <button
                  onClick={handleUpdate}
                  disabled={!updateData.status}
                  className={`px-8 py-2.5 rounded-xl text-sm font-bold text-white shadow-lg transition-all disabled:opacity-50 ${
                    updateData.status === 'verified' ? 'bg-emerald-600 shadow-emerald-200 hover:bg-emerald-700' :
                    updateData.status === 'rejected' ? 'bg-rose-600 shadow-rose-200 hover:bg-rose-700' :
                    'bg-slate-900 shadow-slate-200 hover:bg-slate-800'
                  }`}
                >
                  {updateData.status === 'verified' ? 'APPROVE DONATION' : updateData.status === 'rejected' ? 'REJECT DONATION' : 'SAVE CHANGES'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default AdminPage;
