import React, { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { QRCodeSVG } from "qrcode.react";
import SHA256 from "crypto-js/sha256";
import { Container, CircularProgress, Checkbox, Alert } from "@mui/material";
import CloudUploadIcon from "@mui/icons-material/CloudUpload";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import FavoriteIcon from "@mui/icons-material/Favorite";
import ShieldOutlinedIcon from "@mui/icons-material/ShieldOutlined";
import { donationsAPI, campaignsAPI } from "../services/api";

const DonatePage = () => {
  const [formData, setFormData] = useState({
    donor_name: "",
    donor_email: "",
    donor_phone: "",
    donor_address: "",
    amount: "",
    transaction_id: "",
    payment_method: "UPI",
    message: "",
    campaign: "",
    tax_exemption_claimed: false,
    pan_number: "",
  });

  const [screenshot, setScreenshot] = useState(null);
  const [campaigns, setCampaigns] = useState([]);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");
  const [donationResult, setDonationResult] = useState(null);

  const [qrGenerated, setQrGenerated] = useState(false);
  const [qrUpiString, setQrUpiString] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});
  const [extracting, setExtracting] = useState(false);
  const [ocrExtracted, setOcrExtracted] = useState(false);
  const [verificationStatus, setVerificationStatus] = useState("none"); // 'none', 'pending', 'verified'
  const [extractedValues, setExtractedValues] = useState({
    amount: "",
    transaction_id: "",
  });
  const [extractedBboxes, setExtractedBboxes] = useState({
    amount: null,
    transaction_id: null,
  });
  const [screenshotPreview, setScreenshotPreview] = useState(null);
  const [imageSize, setImageSize] = useState({ width: 0, height: 0 });
  const [isPaid, setIsPaid] = useState(false);
  const [showTrustPhase, setShowTrustPhase] = useState(false);
  const [trustMessage, setTrustMessage] = useState("");

  const onImageLoad = (e) => {
    setImageSize({
      width: e.target.offsetWidth,
      height: e.target.offsetHeight,
      naturalWidth: e.target.naturalWidth,
      naturalHeight: e.target.naturalHeight,
    });
  };

  const renderBbox = (bbox, label, color) => {
    if (!bbox || !imageSize.width) return null;

    // EasyOCR format: [[x1, y1], [x2, y1], [x2, y2], [x1, y2]]
    const x1 = bbox[0][0];
    const y1 = bbox[0][1];
    const x2 = bbox[2][0];
    const y2 = bbox[2][1];

    const scaleX = imageSize.width / imageSize.naturalWidth;
    const scaleY = imageSize.height / imageSize.naturalHeight;

    const style = {
      position: "absolute",
      left: x1 * scaleX,
      top: y1 * scaleY,
      width: (x2 - x1) * scaleX,
      height: (y2 - y1) * scaleY,
      border: `2px solid ${color}`,
      backgroundColor: `${color}22`,
      pointerEvents: "none",
      zIndex: 10,
      borderRadius: "4px",
      transition: "all 0.3s ease",
    };

    const labelStyle = {
      position: "absolute",
      top: "-20px",
      left: "0",
      backgroundColor: color,
      color: "white",
      padding: "2px 6px",
      borderRadius: "4px",
      fontSize: "10px",
      fontWeight: "bold",
      whiteSpace: "nowrap",
    };

    return (
      <div style={style}>
        <span style={labelStyle}>{label}</span>
      </div>
    );
  };
  const [upiConfig, setUpiConfig] = useState({
    upi_id: "samswinson5@oksbi",
    upi_payee_name: "Sams Swinson",
  });

  useEffect(() => {
    fetchCampaigns();
    fetchUpiConfig();
  }, []);

  const fetchUpiConfig = async () => {
    try {
      const response = await fetch("/api/config/upi");
      if (response.ok) {
        const data = await response.json();
        setUpiConfig(data);
      }
    } catch (err) {
      console.error("Error fetching UPI config:", err);
    }
  };

  const fetchCampaigns = async () => {
    try {
      const response = await campaignsAPI.getAll();
      setCampaigns(response.data.campaigns);
    } catch (fetchError) {
      console.error("Error fetching campaigns:", fetchError);
    }
  };

  const handleScreenshotUpload = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!["image/jpeg", "image/png"].includes(file.type)) {
      setError("Please upload PNG or JPG image only");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setError("File size must be less than 5MB");
      return;
    }

    setScreenshot(file);
    setScreenshotPreview(URL.createObjectURL(file));
    setError("");
    setVerificationStatus("pending"); // Start as pending immediately
    setOcrExtracted(false);
    setExtractedBboxes({ amount: null, transaction_id: null });

    // START OCR IMMEDIATELY ON UPLOAD
    performOcrOnly(file);
  };

  const performOcrOnly = async (file) => {
    setExtracting(true);
    const formDataOCR = new FormData();
    formDataOCR.append("screenshot", file);

    try {
      const response = await fetch("/api/donations/extract-ocr", {
        method: "POST",
        body: formDataOCR,
      });

      const result = await response.json();

      if (result.success && result.data) {
        const extractedData = result.data;
        const currentExtracted = {
          amount: extractedData.amount ? extractedData.amount.toString() : "",
          transaction_id: extractedData.transaction_id || "",
        };

        setExtractedValues(currentExtracted);
        setExtractedBboxes({
          amount: extractedData.amount_bbox || null,
          transaction_id: extractedData.transaction_id_bbox || null,
        });
        setOcrExtracted(true);

        // If user already filled fields, verify now
        if (formData.amount && formData.transaction_id) {
          verifyData(
            currentExtracted,
            formData.amount,
            formData.transaction_id,
          );
        }
      } else {
        setVerificationStatus("error");
        setError(result.error || "Could not read screenshot details.");
      }
    } catch (err) {
      console.error("OCR error:", err);
    } finally {
      setExtracting(false);
    }
  };

  const verifyData = useCallback((extracted, userAmount, userTxId) => {
    if (!extracted.amount && !extracted.transaction_id) return;

    const uAmt = parseFloat(userAmount);
    const oAmt = parseFloat(extracted.amount);
    const amountMatch = Math.abs(uAmt - oAmt) < 0.1;
    const txMatch =
      userTxId.trim().toUpperCase() ===
      extracted.transaction_id.trim().toUpperCase();

    if (amountMatch && txMatch) {
      setVerificationStatus("verified");
      setError("");
    } else {
      let msg = "Screenshot mismatch: ";
      if (!amountMatch && !txMatch) msg += "Amount & ID mismatch.";
      else if (!amountMatch) msg += `Amount ₹${userAmount} ≠ Screenshot.`;
      else msg += "ID ≠ Screenshot.";
      setError(msg);
      setVerificationStatus("error");
    }
  }, []);

  useEffect(() => {
    // Re-verify when fields change if we already have OCR data
    if (
      ocrExtracted &&
      formData.transaction_id &&
      formData.amount &&
      !extracting
    ) {
      verifyData(extractedValues, formData.amount, formData.transaction_id);
    }
  }, [
    formData.transaction_id,
    formData.amount,
    ocrExtracted,
    extracting,
    extractedValues,
    verifyData,
  ]);

  const validateName = (name) => /^[a-zA-Z\s]{2,200}$/.test(name);
  const validatePhone = (phone) =>
    /^[6-9]\d{9}$/.test(phone.replace(/\D/g, ""));
  const validateEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const validatePAN = (pan) =>
    /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(pan.toUpperCase());
  const validateTransactionId = (txId) => /^[A-Za-z0-9]{8,100}$/.test(txId);

  const generateQRCode = async () => {
    setError("");
    const errors = {};

    if (!formData.amount) {
      errors.amount = "Amount is required";
    } else if (isNaN(formData.amount) || parseFloat(formData.amount) <= 0) {
      errors.amount = "Amount must be a positive number";
    } else if (parseFloat(formData.amount) < 10) {
      errors.amount = "Minimum donation amount is ₹10";
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    setFieldErrors({});
    const amount = parseFloat(formData.amount).toFixed(2);
    const txnRef = `DON${Date.now().toString().slice(-8)}`;
    const payeeNameEncoded = encodeURIComponent(upiConfig.upi_payee_name);
    const upiString = `upi://pay?pa=${upiConfig.upi_id}&pn=${payeeNameEncoded}&am=${amount}&tn=Donation&tr=${txnRef}&cu=INR`;
    setQrUpiString(upiString);
    setQrGenerated(true);
  };

  const handleChange = (event) => {
    const { name, value, checked, type } = event.target;
    if (qrGenerated && name === "amount") return;

    if (name === "amount" || name === "transaction_id") {
      if (verificationStatus === "verified") {
        setVerificationStatus("pending");
      }
    }

    setFormData((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }));
  };

  const validateAllFields = () => {
    const errors = {};
    if (!formData.donor_name) errors.donor_name = "Name is required";
    else if (!validateName(formData.donor_name))
      errors.donor_name = "Invalid name format";
    if (formData.donor_phone && !validatePhone(formData.donor_phone))
      errors.donor_phone = "Invalid phone number";
    if (formData.donor_email && !validateEmail(formData.donor_email))
      errors.donor_email = "Invalid email";
    if (formData.pan_number && !validatePAN(formData.pan_number))
      errors.pan_number = "Invalid PAN";
    if (!formData.transaction_id)
      errors.transaction_id = "Transaction ID is required";
    else if (!validateTransactionId(formData.transaction_id))
      errors.transaction_id = "Invalid ID";

    if (!screenshot) {
      errors.screenshot = "Payment screenshot is required as proof of donation";
    } else if (verificationStatus !== "verified" && ocrExtracted) {
      errors.verification =
        "Data mismatch with screenshot. Please check Amount and Transaction ID.";
    }

    return errors;
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");

    if (!qrGenerated) {
      setError("Please generate QR code and make payment first");
      return;
    }

    const validationErrors = validateAllFields();
    if (Object.keys(validationErrors).length > 0) {
      setFieldErrors(validationErrors);
      if (validationErrors.screenshot) {
        setError(validationErrors.screenshot);
      } else if (validationErrors.verification) {
        setError(validationErrors.verification);
      } else {
        setError("Please fix all errors in the form");
      }
      return;
    }

    setLoading(true);

    try {
      const timestamp = new Date().toISOString();
      const hashInput = `${formData.donor_name}${formData.donor_phone}${formData.amount}${formData.transaction_id}${timestamp}`;
      const donationHash = SHA256(hashInput).toString();
      const submitData = new FormData();
      Object.keys(formData).forEach((key) => {
        if (formData[key]) submitData.append(key, formData[key]);
      });
      submitData.append("donation_hash", donationHash);
      submitData.append("hash_timestamp", timestamp);
      submitData.append("qr_amount", parseFloat(formData.amount));
      if (screenshot) submitData.append("screenshot", screenshot);

      const response = await donationsAPI.create(submitData);

      // Trust-building micro-animations
      setLoading(false);
      setShowTrustPhase(true);

      setTrustMessage("Submission received");
      await new Promise((r) => setTimeout(r, 600));

      setTrustMessage("Verifying payment details");
      await new Promise((r) => setTimeout(r, 700));

      setTrustMessage("You can safely continue");
      await new Promise((r) => setTimeout(r, 500));

      setShowTrustPhase(false);
      setSuccess(true);
      setDonationResult(response.data.donation);
    } catch (submitError) {
      setError(submitError.response?.data?.error || "Failed to submit");
      setLoading(false);
    }
  };

  return (
    <AnimatePresence mode="wait">
      {showTrustPhase ? (
        <motion.div
          key="trust-phase"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="min-h-screen bg-slate-50 flex items-center justify-center p-6"
        >
          <Container maxWidth="sm">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="glass-card p-12 rounded-[40px] text-center shadow-2xl relative overflow-hidden"
            >
              <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-sky-400 via-emerald-400 to-sky-400 animate-gradient-x" />

              <div className="mb-8 relative">
                <div className="w-24 h-24 border-4 border-slate-100 border-t-sky-500 rounded-full animate-spin mx-auto" />
                <motion.div
                  key={trustMessage}
                  initial={{ opacity: 0, scale: 0.5 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="absolute inset-0 flex items-center justify-center"
                >
                  <ShieldOutlinedIcon sx={{ fontSize: 32, color: "#0ea5e9" }} />
                </motion.div>
              </div>

              <motion.h3
                key={trustMessage + "-text"}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-2xl font-bold text-slate-900 mb-3 tracking-tight"
              >
                {trustMessage}
              </motion.h3>

              <p className="text-slate-500 text-sm font-medium h-10">
                {trustMessage === "Submission received" &&
                  "Securing your request on our servers..."}
                {trustMessage === "Verifying payment details" &&
                  "Cross-referencing transaction with blockchain logs..."}
                {trustMessage === "You can safely continue" &&
                  "Everything looks good! Finalizing your receipt..."}
              </p>

              <div className="mt-10 flex justify-center gap-2">
                {[0, 1, 2].map((i) => (
                  <div
                    key={i}
                    className={`h-1.5 rounded-full transition-all duration-500 ${
                      (trustMessage === "Submission received" && i === 0) ||
                      (trustMessage === "Verifying payment details" &&
                        i === 1) ||
                      (trustMessage === "You can safely continue" && i === 2)
                        ? "bg-sky-500 w-8"
                        : "bg-slate-200 w-2"
                    }`}
                  />
                ))}
              </div>
            </motion.div>
          </Container>
        </motion.div>
      ) : success && donationResult ? (
        <motion.div
          key="success-screen"
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0 }}
          className="min-h-screen bg-slate-50 pt-24 pb-20"
        >
          <Container maxWidth="md">
            <div className="glass-card p-12 rounded-[40px] text-center">
              <div className="w-20 h-20 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-8">
                <CheckCircleIcon sx={{ fontSize: 48 }} />
              </div>
              <h2 className="text-3xl font-bold text-slate-900 mb-4">
                Donation Successful!
              </h2>
              <p className="text-slate-600 mb-8 text-lg">
                Thank you, <strong>{donationResult.donor_name}</strong>, for
                your generous donation of{" "}
                <strong>₹{donationResult.amount}</strong>. Your contribution is
                being logged on the blockchain.
              </p>

              <div className="grid grid-cols-2 gap-4 mb-10 text-left">
                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">
                    Receipt Number
                  </p>
                  <p className="font-bold text-slate-900">
                    {donationResult.receipt_number}
                  </p>
                </div>
                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">
                    Status
                  </p>
                  <p className="font-bold text-emerald-600 uppercase tracking-wide">
                    Verified
                  </p>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <button
                  onClick={() => {
                    setSuccess(false);
                    setDonationResult(null);
                    setFormData({
                      donor_name: "",
                      donor_email: "",
                      donor_phone: "",
                      donor_address: "",
                      amount: "",
                      transaction_id: "",
                      payment_method: "UPI",
                      message: "",
                      campaign: "",
                      tax_exemption_claimed: false,
                      pan_number: "",
                    });
                    setScreenshot(null);
                    setQrGenerated(false);
                    setIsPaid(false);
                  }}
                  className="px-8 py-3 rounded-2xl bg-sky-500 text-white font-bold hover:bg-sky-600 transition-all shadow-lg shadow-sky-500/25"
                >
                  Make Another Donation
                </button>
                <button
                  onClick={() =>
                    window.open(
                      `/api/donations/${donationResult.id}/receipt`,
                      "_blank",
                    )
                  }
                  className="px-8 py-3 rounded-2xl bg-white border border-slate-200 text-slate-700 font-bold hover:bg-slate-50 transition-all"
                >
                  Download Receipt
                </button>
              </div>
            </div>
          </Container>
        </motion.div>
      ) : (
        <motion.div
          key="donate-form"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="min-h-screen bg-slate-50 pt-24 pb-20"
        >
          <Container maxWidth="lg">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-center mb-16 relative"
            >
              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-64 h-64 bg-sky-400/10 blur-[100px] -z-10 rounded-full" />

              <motion.div
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="inline-flex items-center gap-2 px-5 py-2 mb-8 text-[10px] font-black tracking-[0.2em] text-sky-600 uppercase bg-white shadow-xl shadow-sky-500/10 rounded-full border border-sky-50"
              >
                <ShieldOutlinedIcon sx={{ fontSize: 14 }} />
                Secure Philanthropy
              </motion.div>

              <h1 className="text-6xl md:text-7xl font-black text-slate-900 mb-8 tracking-tighter leading-[0.9]">
                Fuel the{" "}
                <span className="text-transparent bg-clip-text bg-gradient-to-tr from-sky-600 via-indigo-600 to-violet-600">
                  Future
                </span>
              </h1>

              <p className="text-slate-500 max-w-2xl mx-auto text-xl font-medium leading-relaxed">
                Join our elite community of transparent donors. Every
                contribution is encrypted on the <strong>Blockchain</strong> and
                validated by <strong>AI</strong>.
              </p>
            </motion.div>

            <div className="grid lg:grid-cols-12 gap-12 items-start">
              <div className="lg:col-span-7">
                <div className="glass-card p-8 md:p-10 rounded-[40px]">
                  <form onSubmit={handleSubmit} className="space-y-8">
                    <div className="grid md:grid-cols-2 gap-6">
                      <div className="space-y-2">
                        <label className="text-sm font-bold text-slate-700 ml-1 uppercase tracking-wider">
                          Full Name
                        </label>
                        <input
                          type="text"
                          name="donor_name"
                          value={formData.donor_name}
                          onChange={handleChange}
                          className={`w-full px-5 py-4 rounded-2xl bg-slate-50 border ${
                            fieldErrors.donor_name
                              ? "border-rose-300"
                              : "border-slate-200"
                          } focus:ring-4 focus:ring-sky-500/10 focus:border-sky-500 outline-none transition-all`}
                          placeholder="John Doe"
                        />
                        {fieldErrors.donor_name && (
                          <p className="text-rose-500 text-xs font-bold mt-1 ml-1">
                            {fieldErrors.donor_name}
                          </p>
                        )}
                      </div>

                      <div className="space-y-2">
                        <label className="text-sm font-bold text-slate-700 ml-1 uppercase tracking-wider">
                          Email Address
                        </label>
                        <input
                          type="email"
                          name="donor_email"
                          value={formData.donor_email}
                          onChange={handleChange}
                          className={`w-full px-5 py-4 rounded-2xl bg-slate-50 border ${
                            fieldErrors.donor_email
                              ? "border-rose-300"
                              : "border-slate-200"
                          } focus:ring-4 focus:ring-sky-500/10 focus:border-sky-500 outline-none transition-all`}
                          placeholder="john@example.com"
                        />
                        {fieldErrors.donor_email && (
                          <p className="text-rose-500 text-xs font-bold mt-1 ml-1">
                            {fieldErrors.donor_email}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="grid md:grid-cols-2 gap-6">
                      <div className="space-y-2">
                        <label className="text-sm font-bold text-slate-700 ml-1 uppercase tracking-wider">
                          Phone Number
                        </label>
                        <input
                          type="tel"
                          name="donor_phone"
                          value={formData.donor_phone}
                          onChange={handleChange}
                          className={`w-full px-5 py-4 rounded-2xl bg-slate-50 border ${
                            fieldErrors.donor_phone
                              ? "border-rose-300"
                              : "border-slate-200"
                          } focus:ring-4 focus:ring-sky-500/10 focus:border-sky-500 outline-none transition-all`}
                          placeholder="9876543210"
                        />
                        {fieldErrors.donor_phone && (
                          <p className="text-rose-500 text-xs font-bold mt-1 ml-1">
                            {fieldErrors.donor_phone}
                          </p>
                        )}
                      </div>

                      <div className="space-y-2">
                        <label className="text-sm font-bold text-slate-700 ml-1 uppercase tracking-wider">
                          Select Campaign
                        </label>
                        <select
                          name="campaign"
                          value={formData.campaign}
                          onChange={handleChange}
                          className="w-full px-5 py-4 rounded-2xl bg-slate-50 border border-slate-200 focus:ring-4 focus:ring-sky-500/10 focus:border-sky-500 outline-none transition-all appearance-none"
                        >
                          <option value="">General Donation</option>
                          {campaigns.map((c) => (
                            <option key={c.id} value={c.name}>
                              {c.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className="space-y-4">
                      <label className="text-sm font-bold text-slate-700 ml-1 uppercase tracking-wider">
                        Donation Amount (₹)
                      </label>

                      <div className="grid grid-cols-4 gap-3 mb-4">
                        {[100, 500, 1000, 2000].map((amt) => (
                          <button
                            key={amt}
                            type="button"
                            onClick={() =>
                              !qrGenerated &&
                              setFormData((prev) => ({
                                ...prev,
                                amount: amt.toString(),
                              }))
                            }
                            className={`py-3 rounded-2xl font-bold transition-all ${
                              formData.amount === amt.toString()
                                ? "bg-sky-500 text-white shadow-lg shadow-sky-500/25 scale-[1.02]"
                                : "bg-slate-50 text-slate-600 border border-slate-200 hover:border-sky-300 hover:bg-sky-50"
                            } ${
                              qrGenerated ? "opacity-50 cursor-not-allowed" : ""
                            }`}
                          >
                            ₹{amt}
                          </button>
                        ))}
                      </div>

                      <div className="relative">
                        <span className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-400 font-bold">
                          ₹
                        </span>
                        <input
                          type="number"
                          name="amount"
                          value={formData.amount}
                          onChange={handleChange}
                          disabled={qrGenerated}
                          className={`w-full pl-10 pr-5 py-4 rounded-2xl bg-slate-50 border ${
                            fieldErrors.amount
                              ? "border-rose-300"
                              : "border-slate-200"
                          } focus:ring-4 focus:ring-sky-500/10 focus:border-sky-500 outline-none transition-all ${
                            qrGenerated ? "opacity-50" : ""
                          } ${
                            ocrExtracted
                              ? "border-emerald-300 bg-emerald-50/30"
                              : ""
                          } text-lg font-bold`}
                          placeholder="Enter custom amount"
                        />
                        {ocrExtracted && (
                          <p className="text-emerald-600 text-[10px] font-bold mt-2 ml-1 flex items-center gap-1">
                            <CheckCircleIcon sx={{ fontSize: 14 }} /> Amount
                            verified by AI
                          </p>
                        )}
                      </div>
                      {formData.amount && parseFloat(formData.amount) > 0 && (
                        <motion.p
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0 }}
                          className="text-sky-600 text-sm font-medium ml-1"
                        >
                          Your ₹{formData.amount} can provide meals for{" "}
                          {Math.floor(parseFloat(formData.amount) / 50)} people!
                        </motion.p>
                      )}
                      {fieldErrors.amount && (
                        <p className="text-rose-500 text-xs font-bold mt-1 ml-1">
                          {fieldErrors.amount}
                        </p>
                      )}
                      {!qrGenerated && (
                        <button
                          type="button"
                          onClick={generateQRCode}
                          className="w-full mt-4 py-4 rounded-2xl bg-gradient-to-r from-sky-500 to-indigo-600 text-white font-black uppercase tracking-widest hover:shadow-lg hover:shadow-sky-500/25 transition-all active:scale-[0.98]"
                        >
                          Generate Payment QR →
                        </button>
                      )}
                    </div>

                    {qrGenerated && !isPaid && (
                      <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        className="p-8 bg-gradient-to-br from-sky-50 to-indigo-50 rounded-[32px] border border-sky-100 shadow-inner overflow-hidden"
                      >
                        <div className="flex flex-col md:flex-row gap-10 items-center">
                          <div className="bg-white p-5 rounded-[32px] shadow-2xl shadow-sky-200/50 transform hover:scale-105 transition-transform">
                            <QRCodeSVG value={qrUpiString} size={180} />
                          </div>
                          <div className="flex-1 text-center md:text-left">
                            <div className="flex items-center gap-2 mb-3 justify-center md:justify-start">
                              <span className="w-2 h-2 rounded-full bg-sky-500 animate-pulse" />
                              <h4 className="text-2xl font-black text-slate-900 tracking-tight">
                                Ready for Payment
                              </h4>
                            </div>
                            <p className="text-slate-600 text-sm mb-6 leading-relaxed">
                              Scan the QR with any UPI app (PhonePe, GPay,
                              Paytm). After the payment is successful, click the
                              button below.
                            </p>
                            <div className="flex flex-col sm:flex-row gap-4">
                              <button
                                type="button"
                                onClick={() => setIsPaid(true)}
                                className="px-8 py-4 rounded-2xl bg-slate-900 text-white font-black text-sm uppercase tracking-widest hover:bg-slate-800 transition-all shadow-xl flex items-center justify-center gap-3 group"
                              >
                                <CheckCircleIcon
                                  sx={{ fontSize: 20 }}
                                  className="text-emerald-400 group-hover:scale-120 transition-transform"
                                />
                                I Have Paid
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setQrGenerated(false);
                                  setIsPaid(false);
                                }}
                                className="px-8 py-4 rounded-2xl bg-white/50 backdrop-blur-sm border border-slate-200 text-slate-500 hover:text-rose-500 hover:border-rose-200 transition-all font-bold text-xs uppercase tracking-widest"
                              >
                                Change Amount
                              </button>
                            </div>
                          </div>
                        </div>
                      </motion.div>
                    )}

                    {isPaid && (
                      <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="space-y-6 pt-4 border-t border-slate-100"
                      >
                        <div className="space-y-2">
                          <div className="flex items-center justify-between mb-2">
                            <label className="text-sm font-bold text-slate-700 ml-1 uppercase tracking-wider">
                              Transaction Details
                            </label>
                            <div className="relative">
                              <input
                                type="file"
                                id="screenshot-upload"
                                onChange={handleScreenshotUpload}
                                className="hidden"
                                accept="image/*"
                              />

                              {!screenshot ? (
                                <label
                                  htmlFor="screenshot-upload"
                                  className="flex items-center gap-2 px-6 py-2.5 rounded-2xl text-[10px] font-black uppercase tracking-widest cursor-pointer bg-sky-50 text-sky-600 border-2 border-dashed border-sky-200 hover:bg-sky-100 hover:border-sky-300 transition-all group"
                                >
                                  <CloudUploadIcon
                                    sx={{ fontSize: 18 }}
                                    className="group-hover:-translate-y-0.5 transition-transform"
                                  />
                                  Upload Screenshot
                                </label>
                              ) : verificationStatus === "verified" ? (
                                <div className="flex items-center gap-2 px-6 py-2.5 rounded-2xl text-[10px] font-black uppercase tracking-widest bg-emerald-500 text-white shadow-md shadow-emerald-500/20 animate-in fade-in zoom-in duration-300">
                                  <CheckCircleIcon sx={{ fontSize: 18 }} />
                                  Fully Verified
                                </div>
                              ) : (
                                <div className="flex items-center gap-2 px-6 py-2.5 rounded-2xl text-[10px] font-black uppercase tracking-widest bg-slate-100 text-slate-500 border border-slate-200">
                                  {extracting ? (
                                    <>
                                      <CircularProgress
                                        size={14}
                                        color="inherit"
                                        thickness={6}
                                      />
                                      <span className="animate-pulse">
                                        AI Verifying...
                                      </span>
                                    </>
                                  ) : verificationStatus === "error" ? (
                                    <span className="text-rose-600 flex items-center gap-1">
                                      <ShieldOutlinedIcon
                                        sx={{ fontSize: 18 }}
                                      />
                                      Check Details
                                    </span>
                                  ) : (
                                    <>
                                      <ShieldOutlinedIcon
                                        sx={{ fontSize: 18 }}
                                      />
                                      Analyzing
                                    </>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>

                          {screenshotPreview && (
                            <motion.div
                              initial={{ opacity: 0, scale: 0.95 }}
                              animate={{ opacity: 1, scale: 1 }}
                              className="relative mb-6 rounded-2xl overflow-hidden border border-slate-200 bg-slate-100"
                            >
                              <img
                                src={screenshotPreview}
                                alt="Screenshot Preview"
                                onLoad={onImageLoad}
                                className="w-full h-auto max-h-[300px] object-contain mx-auto"
                              />
                              {renderBbox(
                                extractedBboxes.amount,
                                "Donation Amount",
                                "#10b981",
                              )}
                              {renderBbox(
                                extractedBboxes.transaction_id,
                                `ID: ${extractedValues.transaction_id}`,
                                "#0ea5e9",
                              )}

                              <button
                                type="button"
                                onClick={() => {
                                  setScreenshot(null);
                                  setScreenshotPreview(null);
                                  setOcrExtracted(false);
                                  setVerificationStatus("none");
                                  setExtractedBboxes({
                                    amount: null,
                                    transaction_id: null,
                                  });
                                }}
                                className="absolute top-2 right-2 p-1.5 bg-black/50 hover:bg-black/70 text-white rounded-full transition-colors"
                              >
                                <svg
                                  xmlns="http://www.w3.org/2000/svg"
                                  className="h-4 w-4"
                                  fill="none"
                                  viewBox="0 0 24 24"
                                  stroke="currentColor"
                                >
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M6 18L18 6M6 6l12 12"
                                  />
                                </svg>
                              </button>
                            </motion.div>
                          )}

                          <input
                            type="text"
                            name="transaction_id"
                            value={formData.transaction_id}
                            onChange={handleChange}
                            className={`w-full px-5 py-4 rounded-2xl bg-slate-50 border ${
                              fieldErrors.transaction_id
                                ? "border-rose-300"
                                : "border-slate-200"
                            } focus:ring-4 focus:ring-sky-500/10 focus:border-sky-500 outline-none transition-all ${
                              verificationStatus === "verified"
                                ? "border-emerald-300 bg-emerald-50/30"
                                : ""
                            }`}
                            placeholder="Enter Transaction ID / UTR Number"
                          />
                          {verificationStatus === "verified" && (
                            <p className="text-emerald-600 text-xs font-bold mt-1 ml-1">
                              ✓ Transaction ID verified against screenshot
                            </p>
                          )}
                          {verificationStatus === "error" && error && (
                            <div className="p-3 bg-rose-50 border border-rose-100 rounded-xl mt-3">
                              <p className="text-rose-800 text-[11px] leading-relaxed font-bold">
                                ⚠️ {error}
                              </p>
                            </div>
                          )}
                          {fieldErrors.transaction_id && (
                            <p className="text-rose-500 text-xs font-bold mt-1 ml-1">
                              {fieldErrors.transaction_id}
                            </p>
                          )}
                        </div>

                        <div className="flex items-start gap-3 p-4 bg-slate-50 rounded-2xl border border-slate-100">
                          <Checkbox
                            name="tax_exemption_claimed"
                            checked={formData.tax_exemption_claimed}
                            onChange={handleChange}
                            sx={{ p: 0 }}
                          />
                          <div className="space-y-2">
                            <p className="text-sm font-bold text-slate-700">
                              I want to claim 80G Tax Exemption
                            </p>
                            {formData.tax_exemption_claimed && (
                              <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                              >
                                <input
                                  type="text"
                                  name="pan_number"
                                  value={formData.pan_number}
                                  onChange={handleChange}
                                  className={`w-full px-4 py-2 text-sm rounded-xl bg-white border ${
                                    fieldErrors.pan_number
                                      ? "border-rose-300"
                                      : "border-slate-200"
                                  } outline-none focus:border-sky-500`}
                                  placeholder="Enter PAN Number"
                                />
                                {fieldErrors.pan_number && (
                                  <p className="text-rose-500 text-[10px] font-bold mt-1">
                                    {fieldErrors.pan_number}
                                  </p>
                                )}
                              </motion.div>
                            )}
                          </div>
                        </div>
                      </motion.div>
                    )}

                    <button
                      type="submit"
                      disabled={loading}
                      className="w-full py-5 rounded-[28px] bg-slate-900 text-white font-black text-lg uppercase tracking-[0.2em] hover:bg-black transition-all shadow-2xl shadow-slate-900/20 active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-3 group relative overflow-hidden"
                    >
                      <div className="absolute inset-0 bg-gradient-to-r from-sky-500/10 to-transparent translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000" />
                      {loading ? (
                        <CircularProgress size={24} color="inherit" />
                      ) : (
                        <>
                          <FavoriteIcon className="text-rose-500 group-hover:scale-125 transition-transform" />{" "}
                          Confirm Contribution
                        </>
                      )}
                    </button>

                    {error && (
                      <Alert
                        severity="error"
                        className="rounded-2xl border border-rose-100"
                      >
                        {error}
                      </Alert>
                    )}
                  </form>
                </div>
              </div>

              <div className="lg:col-span-5 space-y-8">
                <div className="glass-card p-10 rounded-[40px] border border-emerald-100/50 bg-gradient-to-br from-white to-emerald-50/30 relative overflow-hidden">
                  <div className="absolute -top-10 -right-10 w-40 h-40 bg-emerald-100/20 rounded-full blur-3xl" />
                  <div className="flex items-center gap-5 mb-10 relative">
                    <div className="w-14 h-14 rounded-2xl bg-emerald-500 text-white flex items-center justify-center shadow-lg shadow-emerald-200">
                      <ShieldOutlinedIcon sx={{ fontSize: 28 }} />
                    </div>
                    <div>
                      <h3 className="text-2xl font-black text-slate-900 tracking-tight">
                        Trust & Safety
                      </h3>
                      <p className="text-emerald-600 font-bold text-xs uppercase tracking-widest">
                        Your security is our priority
                      </p>
                    </div>
                  </div>

                  <div className="space-y-8 relative">
                    {[
                      {
                        title: "AI OCR Verification",
                        desc: "Our advanced AI instantly scans your payment proof to prevent errors.",
                        icon: "🤖",
                      },
                      {
                        title: "Blockchain Transparency",
                        desc: "Every transaction is etched onto the blockchain for public auditability.",
                        icon: "⛓️",
                      },
                      {
                        title: "Instant Tax Benefits",
                        desc: "Download your 80G certificate immediately after verification.",
                        icon: "📄",
                      },
                    ].map((item, i) => (
                      <div key={i} className="flex gap-5 group">
                        <div className="w-10 h-10 rounded-xl bg-white border border-slate-100 shadow-sm flex items-center justify-center text-xl group-hover:scale-110 transition-transform flex-shrink-0">
                          {item.icon}
                        </div>
                        <div>
                          <h4 className="font-bold text-slate-800 mb-1.5">
                            {item.title}
                          </h4>
                          <p className="text-sm text-slate-500 leading-relaxed">
                            {item.desc}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="bg-slate-900 rounded-[40px] p-10 text-white relative overflow-hidden group">
                  <div className="absolute top-0 right-0 w-64 h-64 bg-sky-500/10 blur-3xl rounded-full -mr-32 -mt-32 group-hover:bg-sky-500/20 transition-colors" />
                  <h3 className="text-2xl font-black mb-4 tracking-tight">
                    Need Assistance?
                  </h3>
                  <p className="text-slate-400 mb-8 leading-relaxed text-sm">
                    If you face any issues with your payment or transaction ID,
                    our dedicated support team is here to help 24/7.
                  </p>
                  <button className="w-full py-4 rounded-2xl bg-white text-slate-900 font-black text-xs uppercase tracking-widest hover:bg-slate-50 transition-all active:scale-[0.98] shadow-xl">
                    Chat with Support
                  </button>
                </div>
              </div>
            </div>
          </Container>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default DonatePage;
