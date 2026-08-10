import React from 'react';
import { Link as RouterLink } from 'react-router-dom';
import VolunteerActivismIcon from '@mui/icons-material/VolunteerActivism';
import EmailIcon from '@mui/icons-material/Email';
import PhoneIcon from '@mui/icons-material/Phone';
import LocationOnIcon from '@mui/icons-material/LocationOn';

const Footer = () => {
  return (
    <footer className="bg-slate-900 text-slate-300 py-16 border-t border-slate-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-12 mb-12">
          {/* Brand section */}
          <div className="space-y-6">
            <div className="flex items-center gap-2 text-white">
              <VolunteerActivismIcon className="text-ocean-400" />
              <span className="text-xl font-bold tracking-tight">TrustChain NGO</span>
            </div>
            <p className="text-slate-400 leading-relaxed">
              Transparent, secure, and blockchain-verified donations for a better tomorrow. Empowering lives through technology and trust.
            </p>
            <div className="flex gap-4">
              <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center hover:bg-ocean-600 transition-colors cursor-pointer">
                <span className="text-xs font-bold">In</span>
              </div>
              <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center hover:bg-ocean-600 transition-colors cursor-pointer">
                <span className="text-xs font-bold">X</span>
              </div>
            </div>
          </div>

          {/* Quick Links */}
          <div>
            <h4 className="text-white font-bold mb-6 uppercase text-xs tracking-widest">Quick Links</h4>
            <ul className="space-y-4">
              {['Home', 'Donate', 'Dashboard', 'Verify Donation'].map((link) => (
                <li key={link}>
                  <RouterLink 
                    to={link === 'Home' ? '/' : `/${link.toLowerCase().split(' ')[0]}`}
                    className="hover:text-ocean-400 transition-colors"
                  >
                    {link}
                  </RouterLink>
                </li>
              ))}
            </ul>
          </div>

          {/* Contact Information */}
          <div>
            <h4 className="text-white font-bold mb-6 uppercase text-xs tracking-widest">Contact Us</h4>
            <ul className="space-y-4 text-sm">
              <li className="flex items-center gap-3">
                <EmailIcon className="text-slate-500" fontSize="small" />
                <span>support@trustchain.ngo</span>
              </li>
              <li className="flex items-center gap-3">
                <PhoneIcon className="text-slate-500" fontSize="small" />
                <span>+91 1800-TRUST-NGO</span>
              </li>
              <li className="flex items-start gap-3">
                <LocationOnIcon className="text-slate-500 mt-1" fontSize="small" />
                <span>123 NGO Street, Innovation Hub<br />Bangalore, KA - 560001</span>
              </li>
            </ul>
          </div>

          {/* Impact section */}
          <div>
            <h4 className="text-white font-bold mb-6 uppercase text-xs tracking-widest">Our Impact</h4>
            <div className="space-y-4">
              <div className="p-4 bg-slate-800/50 rounded-2xl border border-slate-700/50">
                <p className="text-2xl font-bold text-ocean-400">100%</p>
                <p className="text-xs text-slate-500">Blockchain Transparency</p>
              </div>
              <div className="p-4 bg-slate-800/50 rounded-2xl border border-slate-700/50">
                <p className="text-2xl font-bold text-emerald-400">₹2.5Cr+</p>
                <p className="text-xs text-slate-500">Donations Distributed</p>
              </div>
            </div>
          </div>
        </div>

        {/* Copyright section */}
        <div className="pt-8 border-t border-slate-800 text-center sm:flex sm:justify-between sm:text-left">
          <p className="text-sm text-slate-500">
            © {new Date().getFullYear()} TrustChain NGO. All rights reserved.
          </p>
          <p className="text-sm text-slate-500 mt-2 sm:mt-0 flex items-center justify-center sm:justify-start gap-1">
            Built with <span className="text-rose-500">❤️</span> for transparency and trust.
          </p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
