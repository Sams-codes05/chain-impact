import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import VerifiedIcon from '@mui/icons-material/Verified';
import SecurityIcon from '@mui/icons-material/Security';
import SpeedIcon from '@mui/icons-material/Speed';
import ReceiptIcon from '@mui/icons-material/Receipt';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import ShieldOutlinedIcon from '@mui/icons-material/ShieldOutlined';
import FavoriteBorderIcon from '@mui/icons-material/FavoriteBorder';
import { analyticsAPI } from '../services/api';

const fadeIn = (delay = 0) => ({
  initial: { opacity: 0, y: 40 },
  animate: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.7,
      delay,
      ease: [0.22, 1, 0.36, 1],
    },
  },
});

const staggerContainer = {
  initial: {},
  animate: {
    transition: {
      staggerChildren: 0.15,
    },
  },
};

const HomePage = () => {
  const navigate = useNavigate();
  const [stats, setStats] = useState(null);

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    try {
      const response = await analyticsAPI.getSummary();
      setStats(response.data);
    } catch (error) {
      console.error('Error fetching stats:', error);
    }
  };

  const features = [
    {
      title: 'Immutable Ledger',
      description: 'Every donation is cryptographically sealed on the Ethereum blockchain for absolute transparency.',
      icon: <VerifiedIcon className="text-sky-500" fontSize="large" />,
    },
    {
      title: 'AI Verification',
      description: 'Advanced OCR automatically validates your payment proofs, ensuring accuracy and speed.',
      icon: <SecurityIcon className="text-emerald-500" fontSize="large" />,
    },
    {
      title: 'Smart Receipts',
      description: 'Instant, tax-compliant digital receipts generated and emailed within seconds of verification.',
      icon: <ReceiptIcon className="text-amber-500" fontSize="large" />,
    },
    {
      title: 'Live Impact',
      description: 'Real-time analytics dashboard showing exactly how and where your contributions are used.',
      icon: <TrendingUpIcon className="text-rose-500" fontSize="large" />,
    },
  ];

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 overflow-x-hidden">
      {/* Hero Section */}
      <section className="relative pt-32 pb-20 md:pt-48 md:pb-32 bg-midnight">
        {/* Abstract Background Elements */}
        <div className="absolute top-0 right-0 w-1/3 h-1/3 bg-ocean-500/10 blur-[120px] rounded-full pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-1/4 h-1/4 bg-emerald-500/10 blur-[100px] rounded-full pointer-events-none" />
        
        <div className="section-container relative z-10">
          <div className="max-w-4xl mx-auto text-center">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
            >
              <span className="inline-block px-4 py-1.5 mb-6 text-sm font-bold tracking-widest text-sky-400 uppercase bg-sky-400/10 rounded-full border border-sky-400/20">
                The Future of Philanthropy
              </span>
              <h1 className="text-5xl md:text-7xl font-extrabold text-white mb-8 tracking-tight leading-[1.1]">
                Transparency <span className="text-transparent bg-clip-text bg-gradient-to-r from-sky-400 to-emerald-400">Powered by Code</span>
              </h1>
              <p className="text-xl text-slate-400 mb-12 max-w-2xl mx-auto leading-relaxed">
                Experience the first donation platform that combines blockchain immutability with AI verification to ensure your impact is real and trackable.
              </p>
              
              <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                <button
                  onClick={() => navigate('/donate')}
                  className="w-full sm:w-auto px-10 py-4 rounded-2xl bg-sky-500 text-white font-bold text-lg hover:bg-sky-400 transition-all shadow-lg shadow-sky-500/25 active:scale-[0.98]"
                >
                  Donate Now
                </button>
                <button
                  onClick={() => navigate('/verify')}
                  className="w-full sm:w-auto px-10 py-4 rounded-2xl bg-white/5 text-white font-bold text-lg hover:bg-white/10 transition-all border border-white/10 active:scale-[0.98]"
                >
                  Verify Proof
                </button>
              </div>
            </motion.div>
          </div>
        </div>
        
        {/* Floating Stats Card */}
        <div className="section-container -mb-32 md:-mb-48 relative z-20">
          <motion.div 
            className="grid grid-cols-1 md:grid-cols-3 gap-8"
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.2 }}
          >
            {[
              { label: 'Total Contributions', value: stats ? `₹${(stats.total_donations / 100000).toFixed(1)}L+` : '₹25L+', icon: <FavoriteBorderIcon /> },
              { label: 'Verified Blocks', value: stats ? stats.blockchain_count : '1,200+', icon: <SecurityIcon /> },
              { label: 'Active Donors', value: stats ? stats.total_count : '850+', icon: <VerifiedIcon /> },
            ].map((stat, i) => (
              <div key={i} className="glass-card p-8 rounded-3xl flex flex-col items-center text-center">
                <div className="w-12 h-12 rounded-2xl bg-sky-50 flex items-center justify-center text-sky-500 mb-4 shadow-inner">
                  {stat.icon}
                </div>
                <h3 className="text-3xl font-black text-slate-900 mb-1">{stat.value}</h3>
                <p className="text-slate-500 font-medium uppercase tracking-wider text-xs">{stat.label}</p>
              </div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* Trust & Transparency Section */}
      <section className="pt-48 pb-24 md:pt-64">
        <div className="section-container">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            <motion.div
              initial={{ opacity: 0, x: -40 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.7 }}
            >
              <h2 className="text-4xl md:text-5xl font-extrabold mb-8 tracking-tight">
                Engineered for <span className="text-sky-600">Trust</span>
              </h2>
              <p className="text-lg text-slate-600 mb-10 leading-relaxed">
                Traditional charity lacks visibility. ChainImpact changes that. We use advanced technologies to ensure that every single donation is accounted for and publicly verifiable.
              </p>
              
              <div className="grid gap-6">
                {features.map((f, i) => (
                  <div key={i} className="flex gap-5">
                    <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-white shadow-soft flex items-center justify-center">
                      {f.icon}
                    </div>
                    <div>
                      <h4 className="text-xl font-bold mb-1">{f.title}</h4>
                      <p className="text-slate-500 leading-relaxed">{f.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
            
            <motion.div
              className="relative"
              initial={{ opacity: 0, scale: 0.9 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 0.7 }}
            >
              <div className="aspect-square rounded-[40px] overflow-hidden shadow-2xl rotate-3">
                <img 
                  src="https://images.unsplash.com/photo-1639762681485-074b7f938ba0?q=80&w=2000&auto=format&fit=crop" 
                  alt="Blockchain Technology" 
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-midnight/60 to-transparent" />
              </div>
              
              {/* Overlay Content */}
              <div className="absolute -bottom-8 -left-8 glass-card p-6 rounded-3xl max-w-xs -rotate-3">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-3 h-3 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="text-sm font-bold uppercase tracking-wider">Network Status</span>
                </div>
                <p className="text-slate-600 text-sm font-medium">
                  The donation registry is live on Ethereum Mainnet. Total gas optimized.
                </p>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* How it Works */}
      <section className="py-24 bg-slate-100">
        <div className="section-container">
          <div className="text-center max-w-3xl mx-auto mb-20">
            <h2 className="text-4xl font-extrabold mb-6">Simple 3-Step Process</h2>
            <p className="text-lg text-slate-600">We've automated the complex verification process so you can focus on making a difference.</p>
          </div>
          
          <div className="grid md:grid-cols-3 gap-12 relative">
            {/* Connecting Lines (Desktop) */}
            <div className="hidden md:block absolute top-1/2 left-0 right-0 h-0.5 bg-slate-200 -z-10" />
            
            {[
              { step: '01', title: 'Submit Proof', desc: 'Upload your payment screenshot or transaction hash.' },
              { step: '02', title: 'AI Verification', desc: 'Our OCR system extracts and validates data instantly.' },
              { step: '03', title: 'Impact Logged', desc: 'Transaction is sealed on-chain and receipt is sent.' },
            ].map((step, i) => (
              <div key={i} className="bg-white p-10 rounded-[32px] shadow-soft hover:shadow-xl transition-all border border-slate-200/60 text-center relative">
                <div className="absolute -top-6 left-1/2 -translate-x-1/2 w-12 h-12 rounded-2xl bg-midnight text-white flex items-center justify-center font-black text-xl shadow-lg">
                  {step.step}
                </div>
                <h4 className="text-2xl font-bold mt-4 mb-4">{step.title}</h4>
                <p className="text-slate-500 leading-relaxed">{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-24">
        <div className="section-container">
          <div className="bg-midnight rounded-[48px] p-12 md:p-24 overflow-hidden relative text-center">
            {/* Decorative background elements */}
            <div className="absolute top-0 right-0 w-full h-full bg-[radial-gradient(circle_at_top_right,rgba(14,165,233,0.15),transparent)]" />
            
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
            >
              <h2 className="text-4xl md:text-5xl font-extrabold text-white mb-8">Ready to make a <span className="text-sky-400">transparent</span> impact?</h2>
              <p className="text-xl text-slate-400 mb-12 max-w-2xl mx-auto leading-relaxed">
                Join hundreds of donors who are already using ChainImpact to track their contributions with 100% certainty.
              </p>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-6">
                <button
                  onClick={() => navigate('/donate')}
                  className="px-12 py-5 rounded-2xl bg-white text-midnight font-bold text-lg hover:bg-slate-100 transition-all active:scale-[0.98]"
                >
                  Donate Now
                </button>
                <button
                  onClick={() => navigate('/verify')}
                  className="px-12 py-5 rounded-2xl bg-white/5 text-white font-bold text-lg hover:bg-white/10 transition-all border border-white/10 active:scale-[0.98]"
                >
                  Verify Proof
                </button>
              </div>
            </motion.div>
          </div>
        </div>
      </section>
    </div>
  );
};

export default HomePage;