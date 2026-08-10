from datetime import datetime
from flask_sqlalchemy import SQLAlchemy

db = SQLAlchemy()

class Donation(db.Model):
    """Donation model for storing donation records"""
    __tablename__ = 'donations'
    
    id = db.Column(db.Integer, primary_key=True)
    
    # Donor Information
    donor_name = db.Column(db.String(200), nullable=False)
    donor_email = db.Column(db.String(200), nullable=True)
    donor_phone = db.Column(db.String(20), nullable=True)
    donor_address = db.Column(db.Text, nullable=True)
    
    # Donation Details
    amount = db.Column(db.Float, nullable=False)
    currency = db.Column(db.String(10), default='INR')
    transaction_id = db.Column(db.String(200), unique=True, nullable=False)
    payment_method = db.Column(db.String(50), default='UPI')
    
    # Message and Purpose
    message = db.Column(db.Text, nullable=True)
    campaign = db.Column(db.String(200), nullable=True)
    
    # Blockchain Information
    blockchain_tx_hash = db.Column(db.String(200), unique=True, nullable=True)
    blockchain_verified = db.Column(db.Boolean, default=False)
    etherscan_link = db.Column(db.String(500), nullable=True)
    
    # OCR/AI Processing
    screenshot_path = db.Column(db.String(500), nullable=True)
    screenshot_hash = db.Column(db.String(64), unique=True, nullable=True)
    ocr_processed = db.Column(db.Boolean, default=False)
    ocr_confidence = db.Column(db.Float, nullable=True)
    ocr_validation_warnings = db.Column(db.Text, nullable=True)
    
    # Receipt Information
    receipt_number = db.Column(db.String(100), unique=True, nullable=False)
    receipt_path = db.Column(db.String(500), nullable=True)
    
    # Status and Verification
    status = db.Column(db.String(50), default='pending')  # pending, verified, rejected
    verified_by = db.Column(db.String(100), nullable=True)
    verification_notes = db.Column(db.Text, nullable=True)
    
    # Timestamps
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Tax Exemption
    tax_exemption_claimed = db.Column(db.Boolean, default=False)
    pan_number = db.Column(db.String(20), nullable=True)
    
    # Secure Donation Flow
    donation_hash = db.Column(db.String(64), unique=True, nullable=True)
    hash_verified = db.Column(db.Boolean, default=False)
    hash_timestamp = db.Column(db.DateTime, nullable=True)
    qr_amount = db.Column(db.Float, nullable=True)
    
    def __repr__(self):
        return f'<Donation {self.receipt_number}: {self.donor_name} - ₹{self.amount}>'
    
    def to_dict(self):
        """Convert donation object to dictionary"""
        return {
            'id': self.id,
            'donor_name': self.donor_name,
            'donor_email': self.donor_email,
            'donor_phone': self.donor_phone,
            'donor_address': self.donor_address,
            'amount': self.amount,
            'currency': self.currency,
            'transaction_id': self.transaction_id,
            'payment_method': self.payment_method,
            'message': self.message,
            'campaign': self.campaign,
            'blockchain_tx_hash': self.blockchain_tx_hash,
            'blockchain_verified': self.blockchain_verified,
            'etherscan_link': self.etherscan_link,
            'screenshot_path': self.screenshot_path,
            'ocr_processed': self.ocr_processed,
            'ocr_confidence': self.ocr_confidence,
            'ocr_validation_warnings': self.ocr_validation_warnings,
            'receipt_number': self.receipt_number,
            'receipt_path': self.receipt_path,
            'status': self.status,
            'verified_by': self.verified_by,
            'verification_notes': self.verification_notes,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
            'tax_exemption_claimed': self.tax_exemption_claimed,
            'pan_number': self.pan_number,
            'donation_hash': self.donation_hash,
            'hash_verified': self.hash_verified,
            'hash_timestamp': self.hash_timestamp.isoformat() if self.hash_timestamp else None,
            'qr_amount': self.qr_amount
        }

class Campaign(db.Model):
    """Campaign model for organizing donations"""
    __tablename__ = 'campaigns'
    
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(200), nullable=False, unique=True)
    description = db.Column(db.Text, nullable=True)
    goal_amount = db.Column(db.Float, nullable=True)
    start_date = db.Column(db.DateTime, default=datetime.utcnow)
    end_date = db.Column(db.DateTime, nullable=True)
    is_active = db.Column(db.Boolean, default=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    def __repr__(self):
        return f'<Campaign {self.name}>'
    
    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'description': self.description,
            'goal_amount': self.goal_amount,
            'start_date': self.start_date.isoformat() if self.start_date else None,
            'end_date': self.end_date.isoformat() if self.end_date else None,
            'is_active': self.is_active,
            'created_at': self.created_at.isoformat() if self.created_at else None
        }

class Admin(db.Model):
    """Admin model for authentication"""
    __tablename__ = 'admins'
    
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(100), unique=True, nullable=False)
    email = db.Column(db.String(200), unique=True, nullable=False)
    password_hash = db.Column(db.String(500), nullable=False)
    role = db.Column(db.String(50), default='admin')  # admin, super_admin
    is_active = db.Column(db.Boolean, default=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    last_login = db.Column(db.DateTime, nullable=True)
    
    def __repr__(self):
        return f'<Admin {self.username}>'