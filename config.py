import os
from dotenv import load_dotenv

load_dotenv()

class Config:
    """Base configuration"""
    SECRET_KEY = os.getenv('SECRET_KEY', 'dev-secret-key-change-in-production')
    SQLALCHEMY_DATABASE_URI = os.getenv('DATABASE_URL', 'sqlite:///donations.db')
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    
    # Upload Configuration
    UPLOAD_FOLDER = 'uploads'
    MAX_CONTENT_LENGTH = 16 * 1024 * 1024  # 16MB max file size
    ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'pdf'}
    
    # Blockchain Configuration - Polygon Amoy Testnet (Mumbai replacement)
    ETHEREUM_NETWORK = os.getenv('ETHEREUM_NETWORK', 'amoy')
    INFURA_PROJECT_ID = os.getenv('INFURA_PROJECT_ID')
    PRIVATE_KEY = os.getenv('PRIVATE_KEY')
    CONTRACT_ADDRESS = os.getenv('CONTRACT_ADDRESS')
    
    # Polygon Amoy Testnet RPC (Polygon Mumbai replacement)
    AMOY_RPC_URL = os.getenv('AMOY_RPC_URL', 'https://rpc.ankr.com/polygon_amoy')
    AMOY_CHAIN_ID = 80002  # Polygon Amoy Testnet Chain ID
    
    # Legacy Mumbai RPC URLs (kept for backward compatibility during migration)
    MUMBAI_RPC_URL = os.getenv('MUMBAI_RPC_URL', 'https://rpc-mumbai.maticvigil.com')
    MUMBAI_CHAIN_ID = 80001  # Polygon Mumbai Testnet Chain ID (deprecated)
    
    # Email Configuration
    MAIL_SERVER = os.getenv('MAIL_SERVER', 'smtp.gmail.com')
    MAIL_PORT = int(os.getenv('MAIL_PORT', 587))
    MAIL_USE_TLS = os.getenv('MAIL_USE_TLS', 'True') == 'True'
    MAIL_USERNAME = os.getenv('MAIL_USERNAME')
    MAIL_PASSWORD = os.getenv('MAIL_PASSWORD')
    MAIL_DEFAULT_SENDER = os.getenv('MAIL_DEFAULT_SENDER')
    
    # NGO Information
    NGO_NAME = os.getenv('NGO_NAME', 'Sample NGO')
    NGO_EMAIL = os.getenv('NGO_EMAIL', 'ngo@example.com')
    NGO_ADDRESS = os.getenv('NGO_ADDRESS', 'NGO Address')
    NGO_PAN = os.getenv('NGO_PAN', 'AAAAA0000A')
    NGO_REGISTRATION = os.getenv('NGO_REGISTRATION', 'REG123456')
    
    # UPI Payment Configuration
    UPI_ID = os.getenv('UPI_ID', 'samswinson5@oksbi')
    UPI_PAYEE_NAME = os.getenv('UPI_PAYEE_NAME', 'Sams Swinson')
    
    # Frontend URL
    FRONTEND_URL = os.getenv('FRONTEND_URL', 'http://localhost:3000')
    
    # Backend Base URL for QR codes and public endpoints
    # Use environment variable or default to localhost (should be set in production)
    BASE_URL = os.getenv('BASE_URL', 'http://127.0.0.1:5000')
    
    # AI/OCR Configuration
    OCR_CONFIDENCE_THRESHOLD = float(os.getenv('OCR_CONFIDENCE_THRESHOLD', 0.3))

    # Feature Flags
    FEATURE_ADVANCED_ANALYTICS = os.getenv('FEATURE_ADVANCED_ANALYTICS', 'False').lower() == 'true'
    ANALYTICS_ADVANCED_DEFAULT_RANGE_DAYS = int(os.getenv('ANALYTICS_ADVANCED_DEFAULT_RANGE_DAYS', 90))

class DevelopmentConfig(Config):
    """Development configuration"""
    DEBUG = True
    TESTING = False

class ProductionConfig(Config):
    """Production configuration"""
    DEBUG = False
    TESTING = False

class TestingConfig(Config):
    """Testing configuration"""
    DEBUG = True
    TESTING = True
    SQLALCHEMY_DATABASE_URI = 'sqlite:///test_donations.db'

config = {
    'development': DevelopmentConfig,
    'production': ProductionConfig,
    'testing': TestingConfig,
    'default': DevelopmentConfig
}