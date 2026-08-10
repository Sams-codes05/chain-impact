import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  Legend,
  ResponsiveContainer,
  AreaChart,
  Area,
} from 'recharts';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import PeopleIcon from '@mui/icons-material/People';
import VerifiedIcon from '@mui/icons-material/Verified';
import AccountBalanceWalletIcon from '@mui/icons-material/AccountBalanceWallet';
import CloudDownloadIcon from '@mui/icons-material/CloudDownload';
import SecurityIcon from '@mui/icons-material/Security';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import VolunteerActivismIcon from '@mui/icons-material/VolunteerActivism';
import FavoriteIcon from '@mui/icons-material/Favorite';
import PublicIcon from '@mui/icons-material/Public';
import InfoIcon from '@mui/icons-material/Info';
import supabaseClient from '../services/supabaseClient';
import { analyticsAPI, donationsAPI } from '../services/api';
import { format, isValid, parseISO } from 'date-fns';
import { saveAs } from 'file-saver';

const COLORS = ['#0ea5e9', '#10b981', '#f59e0b', '#64748b', '#7c3aed'];

const NGO_QUOTES = [
  { text: "Small acts, when multiplied by millions of people, can transform the world.", author: "Howard Zinn" },
  { text: "The best way to find yourself is to lose yourself in the service of others.", author: "Mahatma Gandhi" },
  { text: "We make a living by what we get, but we make a life by what we give.", author: "Winston Churchill" },
  { text: "The measure of life is not its duration, but its donation.", author: "Peter Marshall" },
  { text: "No one has ever become poor by giving.", author: "Anne Frank" }
];

const DEFAULT_SUMMARY = {
  total_donations: 0,
  total_count: 0,
  verified_count: 0,
  blockchain_count: 0,
  average_donation: 0,
  month_donations: 0,
  top_donors: [],
};

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

const toDateLabel = (value) => {
  const parsed = safeParseDate(value);
  return parsed ? format(parsed, 'yyyy-MM-dd') : null;
};

const toISOStringOrNull = (value) => {
  const parsed = safeParseDate(value);
  return parsed ? parsed.toISOString() : null;
};

const calculateTotalPages = (totalCount, perPage = 10) => {
  const safeTotal = Number.isFinite(totalCount) ? totalCount : 0;
  const safePerPage = perPage || 10;
  return Math.max(Math.ceil(safeTotal / safePerPage), 1);
};

const normalizeSummary = (rawSummary) => ({
  ...DEFAULT_SUMMARY,
  ...(rawSummary || {}),
});

const calculateImpact = (totalAmount) => {
  const amount = Number(totalAmount || 0);
  return [
    { label: 'Meals Provided', count: Math.floor(amount / 100), icon: '🍔' },
    { label: 'Education Days', count: Math.floor(amount / 250), icon: '📚' },
    { label: 'Health Kits', count: Math.floor(amount / 1000), icon: '🏥' },
  ];
};

const toBoolean = (value) => {
  if (typeof value === 'boolean') return value;
  if (value === null || value === undefined) return false;
  if (typeof value === 'number') return value === 1;
  return String(value).toLowerCase() === 'true';
};

const normalizeDonations = (records) =>
  (records || []).map((item) => {
    const parsedDate = toISOStringOrNull(item.created_at || item.createdAt || item.date);
    return {
      ...item,
      amount: Number(item.amount ?? item.total ?? item.total_amount ?? 0),
      blockchain_verified: toBoolean(item.blockchain_verified ?? item.blockchainVerified),
      created_at: parsedDate || new Date().toISOString(),
    };
  });

const normalizeTrends = (records) =>
  (records || [])
    .map((record) => {
      const dateValue = toDateLabel(record.date || record.day || record.created_at || record.createdAt);
      if (!dateValue) {
        return null;
      }
      const amountValue = Number(record.amount ?? record.total ?? record.total_amount ?? 0);
      const countValue = Number(record.count ?? record.donation_count ?? record.total_count ?? 0);
      if (!Number.isFinite(amountValue) && !Number.isFinite(countValue)) {
        return null;
      }
      return {
        date: dateValue,
        amount: Math.max(amountValue, 0),
        count: Math.max(countValue, 0),
      };
    })
    .filter(Boolean)
    .sort((a, b) => new Date(a.date) - new Date(b.date));

const normalizeCampaigns = (records) =>
  (records || [])
    .map((record, index) => ({
      campaign:
        record.campaign ||
        record.campaign_name ||
        record.name ||
        record.title ||
        `Campaign ${index + 1}`,
      total: Number(
        record.total ??
          record.amount ??
          record.total_donations ??
          record.donation_total ??
          record.totalAmount ??
          record.amount_total ??
          record.total_amount ??
          0,
      ),
      count: Number(
        record.count ??
          record.donation_count ??
          record.total_count ??
          record.count_total ??
          record.total_donations_count ??
          0,
      ),
    }))
    .filter((record) => Number.isFinite(record.total) || Number.isFinite(record.count));

const buildTrendDataset = ({ trendRecords, donations, windowDays }) => {
  if (Array.isArray(trendRecords) && trendRecords.length) {
    return trendRecords.map((record) => ({
      ...record,
      date: toDateLabel(record.date) || record.date,
      amount: Math.max(record.amount, 0),
      count: Math.max(record.count, 0),
    }));
  }

  if (!Array.isArray(donations) || !donations.length) {
    return [];
  }

  const windowMillis = (windowDays || 30) * 24 * 60 * 60 * 1000;
  const now = new Date();
  const startWindow = new Date(now.getTime() - windowMillis);

  const grouped = donations.reduce((accumulator, donation) => {
    const createdAt = safeParseDate(donation.created_at || donation.createdAt || donation.date);
    if (!createdAt || createdAt < startWindow || createdAt > now) {
      return accumulator;
    }
    const bucketKey = format(createdAt, 'yyyy-MM-dd');
    if (!accumulator[bucketKey]) {
      accumulator[bucketKey] = { date: bucketKey, amount: 0, count: 0 };
    }
    accumulator[bucketKey].amount += Number(donation.amount) || 0;
    accumulator[bucketKey].count += 1;
    return accumulator;
  }, {});

  return Object.values(grouped)
    .map((entry) => ({
      ...entry,
      amount: Math.max(entry.amount, 0),
      count: Math.max(entry.count, 0),
    }))
    .sort((first, second) => new Date(first.date) - new Date(second.date));
};

const buildCampaignDataset = ({ campaignRecords, donations }) => {
  if (Array.isArray(campaignRecords) && campaignRecords.length) {
    return campaignRecords.map((record) => ({
      ...record,
      total: Math.max(record.total, 0),
      count: Math.max(record.count, 0),
    }));
  }

  if (!Array.isArray(donations) || !donations.length) {
    return [];
  }

  const grouped = donations.reduce((accumulator, donation) => {
    const campaignKey = donation.campaign || donation.campaign_name || 'Uncategorized';
    if (!accumulator[campaignKey]) {
      accumulator[campaignKey] = { campaign: campaignKey, total: 0, count: 0 };
    }
    accumulator[campaignKey].total += Number(donation.amount) || 0;
    accumulator[campaignKey].count += 1;
    return accumulator;
  }, {});

  return Object.values(grouped)
    .map((entry) => ({
      ...entry,
      total: Math.max(entry.total, 0),
      count: Math.max(entry.count, 0),
    }))
    .sort((first, second) => second.total - first.total);
};

const DashboardPage = () => {
  const [donations, setDonations] = useState([]);
  const [summary, setSummary] = useState(DEFAULT_SUMMARY);
  const [trends, setTrends] = useState([]);
  const [campaigns, setCampaigns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [quoteIndex, setQuoteIndex] = useState(0);
  const [filters, setFilters] = useState({
    status: '',
    search: '',
    verified: '',
    dateRange: '30',
  });

  useEffect(() => {
    const timer = setInterval(() => {
      setQuoteIndex((prev) => (prev + 1) % NGO_QUOTES.length);
    }, 8000);
    return () => clearInterval(timer);
  }, []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [donationResponse, summaryResponse, trendsResponse, campaignsResponse] = await Promise.all([
        supabaseClient
          .from('donations')
          .select('id, donor_name, donor_email, amount, currency, created_at, status, blockchain_verified, transaction_id, campaign, payment_method', { count: 'exact' })
          .order('created_at', { ascending: false })
          .range((page - 1) * 10, page * 10 - 1),
        supabaseClient.rpc('donation_summary'),
        supabaseClient.rpc('donation_trends', { days_window: parseInt(filters.dateRange, 10) || 30 }),
        supabaseClient.rpc('donation_campaign_totals'),
      ]);

      if (donationResponse.error) throw donationResponse.error;
      
      // If summary is missing or empty, we use defaults instead of throwing
      const summaryData = normalizeSummary(summaryResponse.data?.[0]);
      const donationData = normalizeDonations(donationResponse.data || []);
      const trendData = normalizeTrends(trendsResponse.data || []);
      const campaignData = normalizeCampaigns(campaignsResponse.data || []);

      setDonations(donationData);
      setTotalPages(calculateTotalPages(donationResponse.count ?? donationData.length));
      
      setSummary(summaryData);
      setTrends(buildTrendDataset({ trendRecords: trendData, donations: donationData, windowDays: parseInt(filters.dateRange, 10) || 30 }));
      setCampaigns(buildCampaignDataset({ campaignRecords: campaignData, donations: donationData }));

    } catch (supabaseError) {
      console.warn('Supabase fetch issue, checking local API', supabaseError);
      try {
        const [donationApiResponse, summaryApiResponse, trendsApiResponse, campaignsApiResponse] = await Promise.all([
          donationsAPI.getAll({ page, per_page: 10, ...filters }).catch(() => ({ data: [] })),
          analyticsAPI.getSummary().catch(() => ({ data: DEFAULT_SUMMARY })),
          analyticsAPI.getTrends(parseInt(filters.dateRange, 10) || 30).catch(() => ({ data: [] })),
          analyticsAPI.getCampaigns().catch(() => ({ data: [] })),
        ]);

        const donationItemsRaw = donationApiResponse.data?.donations || donationApiResponse.data || [];
        const donationItems = normalizeDonations(donationItemsRaw);
        const summaryPayload = summaryApiResponse.data?.summary || summaryApiResponse.data;
        const trendsPayload = trendsApiResponse.data?.trends || trendsApiResponse.data;
        const campaignsPayload = campaignsApiResponse.data?.campaigns || campaignsApiResponse.data;

        setDonations(donationItems);
        const paginationMeta = donationApiResponse.data?.pagination || donationApiResponse.data;
        setTotalPages(calculateTotalPages(paginationMeta?.total ?? donationItems.length));

        setSummary(normalizeSummary(summaryPayload));
        setTrends(buildTrendDataset({ trendRecords: normalizeTrends(trendsPayload), donations: donationItems, windowDays: parseInt(filters.dateRange, 10) || 30 }));
        setCampaigns(buildCampaignDataset({ campaignRecords: normalizeCampaigns(campaignsPayload), donations: donationItems }));
      } catch (apiError) {
        console.error('Data source unavailable', apiError);
        // We don't set a hard error here to allow the UI to show empty state instead of a crash
      }
    } finally {
      setLoading(false);
    }
  }, [page, filters]);

  useEffect(() => {
    fetchData();
    
    const subscription = supabaseClient
      .channel('donations-changes')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'donations',
        },
        () => {
          setPage(1);
          fetchData();
        }
      )
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, [fetchData]); // Optimized dependencies


  const handleFilterChange = (event) => {
    setFilters((prev) => ({
      ...prev,
      [event.target.name]: event.target.value,
    }));
    setPage(1);
  };

  const filteredDonations = useMemo(() => {
    return donations.filter((donation) => {
      const matchesStatus = filters.status ? donation.status === filters.status : true;
      const matchesVerification = filters.verified
        ? filters.verified === 'true'
          ? donation.blockchain_verified
          : !donation.blockchain_verified
        : true;
      const matchesSearch = filters.search
        ? [donation.donor_name, donation.transaction_id, donation.campaign]
            .filter(Boolean)
            .some((value) => value.toLowerCase().includes(filters.search.toLowerCase()))
        : true;
      return matchesStatus && matchesVerification && matchesSearch;
    });
  }, [donations, filters.status, filters.verified, filters.search]);

  const exportCsv = () => {
    const csvHeaders = 'Donor Name,Email,Amount,Currency,Date,Status,Blockchain Verified,Transaction ID\n';
    const csvRows = filteredDonations
      .map((donation) =>
        [
          donation.donor_name,
          donation.donor_email,
          donation.amount,
          donation.currency,
          donation.created_at,
          donation.status,
          donation.blockchain_verified ? 'Yes' : 'No',
          donation.transaction_id,
        ]
          .map((value) => `"${value || ''}"`)
          .join(',')
      )
      .join('\n');

    const blob = new Blob([csvHeaders + csvRows], { type: 'text/csv;charset=utf-8;' });
    saveAs(blob, `donation-report-${Date.now()}.csv`);
  };

  if (loading && (!summary || !donations.length)) {
    return (
      <div className="flex items-center justify-center min-h-[80vh]">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-ocean-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f8fafc] pt-24 pb-12">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* NGO Quote & Hero Section */}
        <motion.div 
          initial={{ opacity: 0, y: -20 }} 
          animate={{ opacity: 1, y: 0 }}
          className="mb-12 text-center"
        >
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-ocean-50 text-ocean-700 text-sm font-semibold mb-6 border border-ocean-100">
            <VolunteerActivismIcon sx={{ fontSize: 16 }} />
            <span>Empowering Change Together</span>
          </div>
          
          <div className="min-h-[120px] flex flex-col items-center justify-center px-4">
            <motion.div
              key={quoteIndex}
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.8 }}
              className="max-w-3xl"
            >
              <h2 className="text-2xl md:text-3xl font-serif italic text-slate-800 leading-relaxed mb-4">
                "{NGO_QUOTES[quoteIndex].text}"
              </h2>
              <p className="text-ocean-600 font-medium">— {NGO_QUOTES[quoteIndex].author}</p>
            </motion.div>
          </div>
        </motion.div>

        {error && (
          <div className="mb-8 p-4 bg-red-50 border border-red-100 rounded-xl flex items-center gap-3 text-red-700 shadow-sm">
            <ErrorOutlineIcon />
            <p className="font-medium">{error}</p>
          </div>
        )}

        {/* KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-10">
          {[
            { 
              label: 'Total Impact', 
              value: `₹${Number(summary.total_donations || 0).toLocaleString('en-IN')}`, 
              sub: `Across ${summary.total_count || 0} generous contributions`,
              icon: <AccountBalanceWalletIcon className="text-emerald-600" />,
              color: 'emerald'
            },
            { 
              label: 'Community', 
              value: (summary.total_count || 0).toLocaleString(), 
              sub: `${summary.verified_count || 0} verified by our team`,
              icon: <PeopleIcon className="text-ocean-600" />,
              color: 'ocean'
            },
            { 
              label: 'Transparency', 
              value: summary.blockchain_count || 0, 
              sub: 'Secured on Blockchain',
              icon: <SecurityIcon className="text-amber-600" />,
              color: 'amber'
            },
            { 
              label: 'Average Gift', 
              value: `₹${Number(summary.average_donation || 0).toLocaleString('en-IN')}`, 
              sub: 'Every rupee counts',
              icon: <FavoriteIcon className="text-rose-600" />,
              color: 'rose'
            }
          ].map((card, idx) => (
            <motion.div
              key={card.label}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.1 }}
              className="relative overflow-hidden bg-white p-6 rounded-2xl shadow-sm border border-slate-200/60 hover:shadow-md transition-all duration-300 group"
            >
              <div className="flex items-center gap-4 mb-4">
                <div className={`p-3 rounded-xl bg-${card.color}-50 group-hover:scale-110 transition-transform duration-300`}>
                  {card.icon}
                </div>
                <p className="text-slate-500 font-semibold text-sm uppercase tracking-wider">{card.label}</p>
              </div>
              <h3 className="text-3xl font-bold text-slate-900 mb-1">{card.value}</h3>
              <p className="text-sm text-slate-500 flex items-center gap-1">
                {card.sub}
              </p>
            </motion.div>
          ))}
        </div>

        {/* Impact Analytics Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white p-8 rounded-3xl shadow-sm border border-slate-200/60 mb-10 overflow-hidden relative"
        >
          <div className="absolute top-0 right-0 p-8 opacity-5">
            <PublicIcon sx={{ fontSize: 120 }} />
          </div>
          
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-8 relative">
            <div className="max-w-md">
              <h3 className="text-2xl font-bold text-slate-900 mb-3 flex items-center gap-2">
                <InfoIcon className="text-ocean-500" />
                Tangible Impact
              </h3>
              <p className="text-slate-600 leading-relaxed">
                Your contributions are more than just numbers. Here's how the community's generosity transforms into real-world change.
              </p>
            </div>

            <div className="flex flex-wrap gap-4 md:gap-8">
              {calculateImpact(summary.total_donations).map((item, idx) => (
                <div key={idx} className="flex flex-col items-center p-4 bg-slate-50 rounded-2xl min-w-[120px] border border-slate-100">
                  <span className="text-3xl mb-2">{item.icon}</span>
                  <span className="text-2xl font-bold text-slate-800">{item.count.toLocaleString()}</span>
                  <span className="text-xs font-medium text-slate-500 uppercase tracking-tighter">{item.label}</span>
                </div>
              ))}
            </div>
          </div>
        </motion.div>

        {/* Charts and Supporters */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-10">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="lg:col-span-2 bg-white p-8 rounded-3xl shadow-sm border border-slate-200/60"
          >
            <div className="flex justify-between items-start mb-8">
              <div>
                <h3 className="text-xl font-bold text-slate-900">Contribution Trends</h3>
                <p className="text-slate-500 text-sm italic">Our journey of growth and impact</p>
              </div>
            </div>
            <div className="h-[350px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trends}>
                  <defs>
                    <linearGradient id="colorAmount" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.15}/>
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis 
                    dataKey="date" 
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: '#94a3b8', fontSize: 11 }}
                    dy={10}
                  />
                  <YAxis 
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: '#94a3b8', fontSize: 11 }}
                  />
                  <RechartsTooltip 
                    contentStyle={{ 
                      backgroundColor: '#ffffff', 
                      borderRadius: '16px',
                      border: '1px solid #f1f5f9',
                      boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.05)'
                    }} 
                  />
                  <Area 
                    type="monotone" 
                    dataKey="amount" 
                    stroke="#10b981" 
                    strokeWidth={4}
                    fillOpacity={1} 
                    fill="url(#colorAmount)" 
                    name="Amount (₹)" 
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="bg-white p-8 rounded-3xl shadow-sm border border-slate-200/60"
          >
            <h3 className="text-xl font-bold text-slate-900 mb-6 flex items-center gap-2">
              <FavoriteIcon className="text-rose-500" />
              Top Supporters
            </h3>
            <div className="space-y-6">
              {(summary.top_donors?.length ? summary.top_donors : donations.slice(0, 5)).map((donor, idx) => (
                <div key={idx} className="flex items-center justify-between group">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center font-bold text-slate-600 border border-slate-200 group-hover:bg-ocean-50 group-hover:text-ocean-600 transition-colors">
                      {donor.donor_name?.[0] || 'D'}
                    </div>
                    <div>
                      <p className="font-semibold text-slate-900 line-clamp-1">{donor.donor_name}</p>
                      <p className="text-xs text-slate-500">Generous Supporter</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-emerald-600">₹{Number(donor.amount || donor.total_amount || 0).toLocaleString('en-IN')}</p>
                    <p className="text-[10px] uppercase tracking-wider text-slate-400">Total Gift</p>
                  </div>
                </div>
              ))}
              {(!summary.top_donors?.length && !donations.length) && (
                <div className="text-center py-10">
                  <p className="text-slate-400 italic">Waiting for our first hero...</p>
                </div>
              )}
            </div>
          </motion.div>
        </div>

        {/* Campaign Breakdown */}
        <div className="grid grid-cols-1 gap-8 mb-10">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white p-8 rounded-3xl shadow-sm border border-slate-200/60"
          >
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
              <div>
                <h3 className="text-xl font-bold text-slate-900">Impact by Mission</h3>
                <p className="text-slate-500 text-sm">Where your contributions go</p>
              </div>
              <div className="flex items-center gap-3">
                {campaigns.map((c, i) => (
                  <div key={i} className="flex items-center gap-1.5">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }}></div>
                    <span className="text-xs font-medium text-slate-600 whitespace-nowrap">{c.campaign}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="h-[300px] w-full flex items-center justify-center">
              {campaigns.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie 
                      data={campaigns} 
                      dataKey="total" 
                      nameKey="campaign" 
                      innerRadius={100}
                      outerRadius={130} 
                      paddingAngle={8}
                      stroke="none"
                    >
                      {campaigns.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} cornerRadius={8} />
                      ))}
                    </Pie>
                    <RechartsTooltip 
                      formatter={(value) => `₹${value.toLocaleString('en-IN')}`}
                      contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 20px rgba(0,0,0,0.05)' }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex flex-col items-center gap-2">
                  <PublicIcon sx={{ fontSize: 48, color: '#e2e8f0' }} />
                  <p className="text-slate-400 italic">No mission data yet</p>
                </div>
              )}
            </div>
          </motion.div>
        </div>

        {/* Donations Table */}
        <div className="bg-white rounded-3xl overflow-hidden shadow-sm border border-slate-200/60">
          <div className="p-8 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h3 className="text-xl font-bold text-slate-900">Recent Contributions</h3>
              <p className="text-sm text-slate-500 italic">Thank you for being part of our mission</p>
            </div>
            
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex bg-slate-100 p-1 rounded-xl">
                {['7', '30', '90'].map((range) => (
                  <button
                    key={range}
                    onClick={() => setFilters(prev => ({ ...prev, dateRange: range }))}
                    className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${
                      filters.dateRange === range 
                        ? 'bg-white text-ocean-600 shadow-sm' 
                        : 'text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    {range} Days
                  </button>
                ))}
              </div>
              <button
                onClick={exportCsv}
                className="flex items-center gap-2 px-5 py-2 bg-slate-900 text-white rounded-xl hover:bg-slate-800 transition-all text-sm font-bold shadow-lg shadow-slate-200"
              >
                <CloudDownloadIcon sx={{ fontSize: 18 }} />
                <span>Download Report</span>
              </button>
            </div>
          </div>

          <div className="p-6">
            <div className="flex flex-wrap gap-4 mb-6">
              <input
                type="text"
                name="search"
                placeholder="Search by name or ID..."
                value={filters.search}
                onChange={handleFilterChange}
                className="flex-grow max-w-sm px-4 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-ocean-500/10 focus:border-ocean-500 transition-all text-sm"
              />
              <select
                name="status"
                value={filters.status}
                onChange={handleFilterChange}
                className="px-4 py-2.5 rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-ocean-500/10 transition-all text-sm font-medium"
              >
                <option value="">All Status</option>
                <option value="verified">Verified</option>
                <option value="pending">Pending</option>
              </select>
            </div>

            <div className="overflow-x-auto rounded-2xl border border-slate-100">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50/50">
                    <th className="px-6 py-4 text-[11px] font-bold text-slate-400 uppercase tracking-widest">Donor Detail</th>
                    <th className="px-6 py-4 text-[11px] font-bold text-slate-400 uppercase tracking-widest text-right">Contribution</th>
                    <th className="px-6 py-4 text-[11px] font-bold text-slate-400 uppercase tracking-widest">Mission</th>
                    <th className="px-6 py-4 text-[11px] font-bold text-slate-400 uppercase tracking-widest">Verification</th>
                    <th className="px-6 py-4 text-[11px] font-bold text-slate-400 uppercase tracking-widest text-center">Safety</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredDonations.length > 0 ? (
                    filteredDonations.map((donation) => (
                      <tr key={donation.id} className="hover:bg-slate-50/50 transition-colors group">
                        <td className="px-6 py-5">
                          <div>
                            <p className="font-bold text-slate-900 group-hover:text-ocean-600 transition-colors">{donation.donor_name}</p>
                            <p className="text-xs text-slate-400 font-medium">{format(new Date(donation.created_at), 'dd MMM, yyyy')}</p>
                          </div>
                        </td>
                        <td className="px-6 py-5 text-right">
                          <span className="text-base font-black text-slate-900">
                            ₹{Number(donation.amount).toLocaleString('en-IN')}
                          </span>
                        </td>
                        <td className="px-6 py-5">
                          <span className="text-xs font-bold px-2 py-1 bg-slate-100 text-slate-600 rounded-md uppercase tracking-tighter">
                            {donation.campaign || 'General'}
                          </span>
                        </td>
                        <td className="px-6 py-5">
                          <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border ${
                            donation.status === 'verified' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' :
                            'bg-amber-50 text-amber-700 border-amber-100'
                          }`}>
                            {donation.status === 'verified' ? <VerifiedIcon sx={{ fontSize: 12 }} /> : <InfoIcon sx={{ fontSize: 12 }} />}
                            {donation.status}
                          </span>
                        </td>
                        <td className="px-6 py-5 text-center">
                          {donation.blockchain_verified ? (
                            <div className="flex items-center justify-center gap-1 text-emerald-600">
                              <SecurityIcon sx={{ fontSize: 16 }} />
                              <span className="text-[10px] font-bold uppercase tracking-tight">On-Chain</span>
                            </div>
                          ) : (
                            <span className="text-[10px] font-bold text-slate-300 uppercase tracking-tight">Syncing...</span>
                          )}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan="5" className="px-6 py-20 text-center">
                        <div className="flex flex-col items-center gap-3">
                          <VolunteerActivismIcon sx={{ fontSize: 48, color: '#f1f5f9' }} />
                          <p className="text-slate-400 italic text-sm font-medium">No contribution records match your current view.</p>
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {totalPages > 1 && (
              <div className="mt-8 flex items-center justify-between">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">
                  Page {page} of {totalPages}
                </p>
                <div className="flex gap-2">
                  <button
                    disabled={page === 1}
                    onClick={() => setPage(p => p - 1)}
                    className="px-5 py-2 text-xs font-black uppercase tracking-widest text-slate-600 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 disabled:opacity-30 transition-all"
                  >
                    Back
                  </button>
                  <button
                    disabled={page === totalPages}
                    onClick={() => setPage(p => p + 1)}
                    className="px-5 py-2 text-xs font-black uppercase tracking-widest text-white bg-slate-900 rounded-xl hover:bg-slate-800 disabled:opacity-30 transition-all shadow-md shadow-slate-100"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default DashboardPage;
