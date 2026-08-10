import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  CircularProgress,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import VerifiedIcon from '@mui/icons-material/Verified';
import ReportProblemIcon from '@mui/icons-material/ReportProblem';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import { blockchainAPI } from '../services/api';

const VerifyPage = () => {
  const [transactionId, setTransactionId] = useState('');
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  const donation = result?.donation;

  const handleVerify = async (event) => {
    event.preventDefault();
    const trimmedIdentifier = transactionId.trim();

    if (!trimmedIdentifier) {
      setError('Donation identifier is required.');
      setStatusMessage('');
      return;
    }

    setLoading(true);
    setError('');
    setResult(null);

    try {
      setStatusMessage('Looking up donation in records...');
      const response = await blockchainAPI.verify(trimmedIdentifier);
      const { data } = response;

      if (!data?.verified || !data?.donation) {
        throw new Error(data?.message || 'Donation could not be verified.');
      }

      setResult({
        donation: data.donation,
        identifier: trimmedIdentifier,
      });
      setStatusMessage(data.message || 'Donation found in records.');
    } catch (verificationError) {
      setError(verificationError.message || 'Failed to verify donation.');
      setStatusMessage('');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 pt-32 pb-20">
      <div className="max-w-4xl mx-auto px-6">
        <motion.div 
          initial={{ opacity: 0, y: 20 }} 
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-12"
        >
          <h1 className="text-4xl md:text-5xl font-bold text-slate-900 mb-4">Verify Donation</h1>
          <p className="text-slate-500 text-lg max-w-2xl mx-auto">
            Validate a donation identifier against blockchain and internal records for transparency.
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          className="glass-card p-8 md:p-12 rounded-3xl border border-slate-200/60 shadow-soft"
        >
          <form onSubmit={handleVerify} className="mb-10">
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="relative flex-grow">
                <input
                  type="text"
                  value={transactionId}
                  onChange={(e) => setTransactionId(e.target.value)}
                  placeholder="Enter transaction hash (0x...) or receipt identifier"
                  className="w-full pl-5 pr-5 py-4 rounded-2xl border border-slate-200 focus:outline-none focus:ring-4 focus:ring-ocean-500/10 focus:border-ocean-500 transition-all text-slate-900"
                  maxLength={66}
                  required
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="btn-primary flex items-center justify-center min-w-[160px] py-4 rounded-2xl disabled:opacity-70"
              >
                {loading ? (
                  <CircularProgress size={24} sx={{ color: 'white' }} />
                ) : (
                  <>
                    <SearchIcon className="mr-2" />
                    <span>Verify</span>
                  </>
                )}
              </button>
            </div>
            <p className="mt-3 text-xs text-slate-400 ml-2">
              Accepts 32-byte transaction hashes (0x…) or unique receipt IDs
            </p>
          </form>

          <AnimatePresence>
            {statusMessage && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="mb-6 p-4 rounded-xl bg-ocean-50 text-ocean-700 border border-ocean-100 flex items-center gap-3"
              >
                <InfoOutlinedIcon fontSize="small" />
                <span className="text-sm font-medium">{statusMessage}</span>
              </motion.div>
            )}

            {error && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="mb-6 p-4 rounded-xl bg-rose-50 text-rose-700 border border-rose-100 flex items-center gap-3"
              >
                <ReportProblemIcon fontSize="small" />
                <span className="text-sm font-medium">{error}</span>
              </motion.div>
            )}
          </AnimatePresence>

          <AnimatePresence mode="wait">
            {donation && !error && (
              <motion.div
                key="result"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="bg-white rounded-2xl border border-slate-100 p-6 md:p-8 shadow-sm"
              >
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8 pb-6 border-b border-slate-50">
                  <div className="flex items-center gap-4">
                    <div className="w-16 h-16 rounded-full bg-emerald-50 flex items-center justify-center">
                      <VerifiedIcon className="text-emerald-500" sx={{ fontSize: 32 }} />
                    </div>
                    <div>
                      <h3 className="text-xl font-bold text-slate-900">Donation Located</h3>
                      <p className="text-sm text-slate-500">Details verified from audit records</p>
                    </div>
                  </div>
                  <div className="inline-flex px-4 py-1.5 rounded-full bg-emerald-50 text-emerald-700 text-sm font-semibold border border-emerald-100">
                    Officially Verified
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-8">
                  <div>
                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Donor</p>
                    <p className="text-lg font-bold text-slate-900">{donation.donor_name || 'Anonymous'}</p>
                    <p className="text-sm text-slate-500 truncate">{donation.donor_email}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Amount</p>
                    <p className="text-lg font-bold text-slate-900">₹{Number(donation.amount).toLocaleString('en-IN')}</p>
                    <p className="text-sm text-slate-500">{donation.currency}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Campaign</p>
                    <p className="text-lg font-bold text-slate-900 truncate">{donation.campaign || 'General'}</p>
                    <p className="text-sm text-slate-500">{donation.payment_method}</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-6 border-t border-slate-50">
                  <div className="space-y-4">
                    <div>
                      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Transaction ID</p>
                      <p className="text-xs font-mono text-slate-600 break-all bg-slate-50 p-2 rounded-lg">{donation.transaction_id}</p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Receipt Number</p>
                      <p className="text-xs font-mono text-slate-600 break-all bg-slate-50 p-2 rounded-lg">{donation.receipt_number}</p>
                    </div>
                  </div>
                  <div className="space-y-4">
                    {donation.blockchain_tx_hash && (
                      <div>
                        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Blockchain Hash</p>
                        <div className="flex flex-col gap-2">
                          <p className="text-xs font-mono text-slate-600 break-all bg-slate-50 p-2 rounded-lg">{donation.blockchain_tx_hash}</p>
                          <a 
                            href={`https://amoy.polygonscan.com/tx/${donation.blockchain_tx_hash}`} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="text-[10px] text-ocean-600 font-bold hover:underline flex items-center gap-1"
                          >
                            VIEW ON POLYGONSCAN ↗
                          </a>
                        </div>
                      </div>
                    )}
                    <div>
                      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Timestamp</p>
                      <p className="text-sm text-slate-600">{new Date(donation.created_at).toLocaleString()}</p>
                    </div>
                  </div>
                </div>

                {donation.message && (
                  <div className="mt-8 pt-6 border-t border-slate-50">
                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Message</p>
                    <p className="text-sm text-slate-600 italic">"{donation.message}"</p>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          <div className="mt-12 p-6 rounded-2xl bg-slate-50/50 border border-slate-100">
            <h4 className="text-sm font-bold text-slate-900 mb-4 flex items-center gap-2">
              <InfoOutlinedIcon fontSize="inherit" className="text-ocean-500" />
              <span>How verification works</span>
            </h4>
            <ul className="space-y-3 text-sm text-slate-500">
              <li className="flex gap-2">
                <span className="text-ocean-500 font-bold">•</span>
                <span>Enter the donation identifier exactly as recorded (hash or unique ID).</span>
              </li>
              <li className="flex gap-2">
                <span className="text-ocean-500 font-bold">•</span>
                <span>We look up the identifier against our transparency ledger.</span>
              </li>
              <li className="flex gap-2">
                <span className="text-ocean-500 font-bold">•</span>
                <span>Matched donations display audit details for public verification.</span>
              </li>
            </ul>
          </div>
        </motion.div>
      </div>
    </div>
  );
};

export default VerifyPage;
