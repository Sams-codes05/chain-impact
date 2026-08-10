from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
from flask_migrate import Migrate
from werkzeug.utils import secure_filename
import os
import json
import hashlib
from datetime import datetime, timedelta, timezone
from typing import Optional
from sqlalchemy import func, or_
from dateutil import tz

from config import config
from models import db, Donation, Campaign, Admin
from blockchain_service import BlockchainService
from ocr_service import OCRService
from receipt_service import ReceiptService
from email_service import EmailService
from supabase_blockchain_manager import BlockchainDBManager

# Initialize Flask app
app = Flask(__name__)
app.config.from_object(config['development'])

# Initialize extensions
CORS(app)
db.init_app(app)
migrate = Migrate(app, db)

# Initialize services
blockchain_service = BlockchainService(app.config)
ocr_service = OCRService(app.config)
receipt_service = ReceiptService(app.config)
email_service = EmailService(app, app.config)

# Feature flags
FEATURE_ADVANCED_ANALYTICS = app.config.get('FEATURE_ADVANCED_ANALYTICS', False)
ANALYTICS_ADVANCED_DEFAULT_RANGE_DAYS = app.config.get('ANALYTICS_ADVANCED_DEFAULT_RANGE_DAYS', 90)

# Initialize Supabase manager
supabase_service_key = os.getenv("SUPABASE_SERVICE_KEY")
supabase_manager: Optional[BlockchainDBManager] = None
if os.getenv("SUPABASE_URL") and (os.getenv("SUPABASE_ANON_KEY") or supabase_service_key):
    try:
        supabase_manager = BlockchainDBManager(
            supabase_url=os.getenv("SUPABASE_URL"),
            supabase_key=os.getenv("SUPABASE_ANON_KEY"),
            supabase_service_key=supabase_service_key,
            auto_provision=bool(supabase_service_key),
            donor_table_name=os.getenv("SUPABASE_DONOR_TABLE", "donors"),
            fallback_mode=True,  # Enable fallback mode for graceful degradation
        )
        if supabase_manager.is_connected():
            app.logger.info("Supabase manager initialized successfully")
        else:
            app.logger.warning("Supabase manager initialized in fallback mode - network connectivity issues detected")
    except Exception as exc:
        app.logger.error("Failed to initialize Supabase manager: %s", exc)
        supabase_manager = None
else:
    app.logger.warning("Supabase credentials not fully configured; donor sync disabled.")

# Create upload folder
if not os.path.exists(app.config['UPLOAD_FOLDER']):
    os.makedirs(app.config['UPLOAD_FOLDER'])

def allowed_file(filename):
    """Check if file extension is allowed"""
    return '.' in filename and \
           filename.rsplit('.', 1)[1].lower() in app.config['ALLOWED_EXTENSIONS']

def _calculate_file_hash(file_storage):
    """Calculate SHA256 hash of a file without saving it first"""
    sha256_hash = hashlib.sha256()
    # Read in chunks to be memory efficient
    file_storage.seek(0)
    for byte_block in iter(lambda: file_storage.read(4096), b""):
        sha256_hash.update(byte_block)
    file_storage.seek(0)  # Reset file pointer for later use
    return sha256_hash.hexdigest()

def _validate_indian_phone(phone):
    """Validate Indian phone number (10 digits starting with 6-9)"""
    import re
    cleaned = re.sub(r'\D', '', phone)
    return bool(re.match(r'^[6-9]\d{9}$', cleaned))

def _validate_email(email):
    """Validate email format"""
    import re
    return bool(re.match(r'^[^\s@]+@[^\s@]+\.[^\s@]+$', email))

def _validate_pan(pan):
    """Validate PAN format"""
    import re
    return bool(re.match(r'^[A-Z]{5}[0-9]{4}[A-Z]{1}$', pan.upper()))

def _validate_transaction_id(tx_id):
    """Validate transaction ID format (alphanumeric, 8-100 chars)"""
    import re
    return bool(re.match(r'^[A-Za-z0-9]{8,100}$', tx_id))

def _validate_sha256_hash(hash_str):
    """Validate SHA256 hash format (64 hex characters)"""
    import re
    return bool(re.match(r'^[a-f0-9]{64}$', hash_str, re.IGNORECASE))

def _verify_donation_hash(hash_str, donor_name, donor_phone, amount, transaction_id, hash_timestamp):
    """Verify that the provided hash matches the donation data"""
    hash_input = f"{donor_name}{donor_phone}{amount}{transaction_id}{hash_timestamp}"
    calculated_hash = hashlib.sha256(hash_input.encode()).hexdigest()
    return calculated_hash.lower() == hash_str.lower()

def _get_ist_now():
    """Get current datetime in IST (Indian Standard Time)"""
    ist = tz.gettz('Asia/Kolkata')
    return datetime.now(ist)

# ==================== DONATION ENDPOINTS ====================

@app.route('/api/donations/extract-ocr', methods=['POST'])
def extract_ocr_for_autofill():
    """Extract OCR data from screenshot to auto-fill form fields"""
    try:
        file = request.files.get('screenshot')
        
        if not file:
            return jsonify({'error': 'No screenshot provided'}), 400
        
        if not allowed_file(file.filename):
            return jsonify({'error': 'Invalid file type (PNG/JPG only)'}), 400
        
        if not validateFileSize(file, 5):
            return jsonify({'error': 'File too large (max 5MB)'}), 400
        
        filename = secure_filename(f"{datetime.now().timestamp()}_{file.filename}")
        screenshot_path = os.path.join(app.config['UPLOAD_FOLDER'], filename)
        file.save(screenshot_path)
        
        ocr_result = ocr_service.parse_upi_screenshot(screenshot_path)
        
        if ocr_result['success']:
            ocr_data = ocr_result['data']
            return jsonify({
                'success': True,
                'data': {
                    'transaction_id': ocr_data.get('transaction_id'),
                    'transaction_id_bbox': ocr_data.get('transaction_id_bbox'),
                    'amount': ocr_data.get('amount'),
                    'amount_bbox': ocr_data.get('amount_bbox'),
                    'donor_name': ocr_data.get('donor_name'),
                    'payee_name': ocr_data.get('payee_name'),
                    'date': ocr_data.get('date'),
                    'payment_method': ocr_data.get('payment_method'),
                    'confidence': ocr_data.get('confidence')
                }
            }), 200
        else:
            return jsonify({
                'success': False,
                'error': 'Could not extract data from screenshot',
                'partial_data': ocr_result.get('partial_data', {})
            }), 400
    
    except Exception as e:
        return jsonify({'error': str(e)}), 500

def validateFileSize(file, maxSizeMB=5):
    """Validate file size"""
    # Use seek to get file size for FileStorage objects
    file.seek(0, os.SEEK_END)
    size = file.tell()
    file.seek(0)
    return size <= maxSizeMB * 1024 * 1024

@app.route('/api/donations', methods=['POST'])
def create_donation():
    """Create a new donation with secure validation"""
    try:
        data = request.form.to_dict()
        file = request.files.get('screenshot')
        
        validation_errors = []
        
        if not data.get('donor_name'):
            validation_errors.append('Donor name is required')
        elif not data.get('donor_name').replace(' ', '').isalpha():
            validation_errors.append('Donor name must contain only alphabetic characters')
        
        if not data.get('amount'):
            validation_errors.append('Amount is required')
        else:
            try:
                amount = float(data['amount'])
                if amount <= 0:
                    validation_errors.append('Amount must be positive')
                if amount < 10:
                    validation_errors.append('Minimum donation amount is ₹10')
            except ValueError:
                validation_errors.append('Invalid amount')
        
        if data.get('donor_phone') and not _validate_indian_phone(data.get('donor_phone')):
            validation_errors.append('Invalid Indian phone number (must be 10 digits starting with 6-9)')
        
        if data.get('donor_email') and not _validate_email(data.get('donor_email')):
            validation_errors.append('Invalid email format')
        
        if data.get('pan_number') and not _validate_pan(data.get('pan_number')):
            validation_errors.append('Invalid PAN format')
        
        if data.get('donor_address') and len(data.get('donor_address').strip()) < 10:
            validation_errors.append('Address must be at least 10 characters')
        
        if not data.get('transaction_id'):
            validation_errors.append('Transaction ID is required')
        elif not _validate_transaction_id(data.get('transaction_id')):
            validation_errors.append('Invalid Transaction ID format (alphanumeric, 8-100 chars)')
        
        if not data.get('donation_hash'):
            validation_errors.append('Donation hash is required')
        elif not _validate_sha256_hash(data.get('donation_hash')):
            validation_errors.append('Invalid donation hash format (must be 64 hex characters)')
        
        if not data.get('qr_amount'):
            validation_errors.append('QR amount is required')
        else:
            try:
                qr_amount = float(data['qr_amount'])
                submitted_amount = float(data['amount']) if data.get('amount') else 0
                if abs(qr_amount - submitted_amount) > 0.01:
                    validation_errors.append('QR amount does not match submitted amount')
            except ValueError:
                validation_errors.append('Invalid QR amount')
        
        if not file:
            validation_errors.append('Payment screenshot is required as proof of donation')
        elif not allowed_file(file.filename):
            validation_errors.append('Invalid file type for screenshot (PNG/JPG only)')
        
        if validation_errors:
            return jsonify({'error': ' | '.join(validation_errors)}), 400
        
        existing = Donation.query.filter_by(transaction_id=data['transaction_id']).first()
        if existing:
            return jsonify({'error': 'Donation with this transaction ID already exists'}), 400
        
        # Check for duplicate donation hash to prevent double submission
        existing_hash = Donation.query.filter_by(donation_hash=data.get('donation_hash')).first()
        if existing_hash:
            return jsonify({'error': 'This donation hash has already been used. Please refresh and try again.'}), 400
        
        # Calculate screenshot hash to prevent duplicate image uploads
        img_hash = _calculate_file_hash(file)
        existing_img = Donation.query.filter_by(screenshot_hash=img_hash).first()
        if existing_img:
            return jsonify({'error': 'This payment screenshot has already been submitted for another donation.'}), 400
        
        screenshot_path = None
        ocr_data = None
        
        ocr_validation_warnings = []
        ocr_validation_errors = []
        
        # Process the required screenshot
        filename = secure_filename(f"{datetime.now().timestamp()}_{file.filename}")
        screenshot_path = os.path.join(app.config['UPLOAD_FOLDER'], filename)
        file.save(screenshot_path)
        
        ocr_result = ocr_service.parse_upi_screenshot(screenshot_path)
        
        if not ocr_result['success']:
            # If OCR failed to extract basic info, we MUST reject it for robustness
            # as requested by the user to prevent fake entries.
            os.remove(screenshot_path) # Clean up invalid file
            return jsonify({
                'success': False,
                'error': f"Screenshot Verification Failed: {ocr_result.get('error', 'Could not extract payment details')}. Please ensure you upload a clear screenshot of the successful payment.",
                'details': 'OCR could not find Transaction ID or Amount in the provided image.'
            }), 400

        ocr_data = ocr_result['data']
        
        try:
            user_amount = float(data['amount'])
            ocr_amount = ocr_data.get('amount')
            qr_amount = float(data['qr_amount'])
            
            # 1. Validate Amount
            if not ocr_amount:
                ocr_validation_errors.append("Could not verify amount from screenshot.")
            else:
                amount_diff = abs(ocr_amount - user_amount)
                if amount_diff > 0.5: # Allow small rounding difference
                    ocr_validation_errors.append(
                        f"CRITICAL: Amount mismatch! Screenshot shows ₹{ocr_amount}, but you entered ₹{user_amount}. Please enter the exact amount paid."
                    )
                
                if abs(ocr_amount - qr_amount) > 0.5:
                    ocr_validation_errors.append(
                        f"CRITICAL: Screenshot amount ₹{ocr_amount} does not match the QR code amount ₹{qr_amount}."
                    )
            
            # 2. Validate Transaction ID
            ocr_txn_id = ocr_data.get('transaction_id')
            user_txn_id = data['transaction_id']
            
            if not ocr_txn_id:
                ocr_validation_errors.append("Could not find Transaction ID / UTR in the screenshot.")
            else:
                if ocr_txn_id.upper() != user_txn_id.upper():
                    ocr_validation_errors.append(
                        f"CRITICAL: Transaction ID mismatch! Screenshot shows '{ocr_txn_id}', but you entered '{user_txn_id}'."
                    )
                
                # Verify if the transaction ID from the screenshot is already in database
                existing_ocr_txn = Donation.query.filter(
                    func.upper(Donation.transaction_id) == ocr_txn_id.upper()
                ).first()
                if existing_ocr_txn:
                    ocr_validation_errors.append(
                        f"CRITICAL: This transaction ({ocr_txn_id}) has already been recorded in our system."
                    )
            
            # 3. Validate Payee Name (Optional but good for robustness)
            ocr_payee_name = ocr_data.get('payee_name')
            expected_payee = "SAMS SWINSON" 
            if ocr_payee_name and expected_payee not in ocr_payee_name.upper():
                ocr_validation_warnings.append(
                    f"Warning: Payee name '{ocr_payee_name}' mismatch. Expected '{expected_payee}'."
                )

        except Exception as ocr_check_error:
            app.logger.error(f"OCR cross-validation check error: {ocr_check_error}")
            ocr_validation_errors.append(f"Validation internal error: {str(ocr_check_error)}")
        
        if ocr_validation_errors:
            if os.path.exists(screenshot_path):
                os.remove(screenshot_path)
            return jsonify({
                'success': False,
                'error': 'Verification Failed: ' + ' | '.join(ocr_validation_errors),
                'ocr_validation_errors': ocr_validation_errors
            }), 400
        
        hash_timestamp_str = data.get('hash_timestamp', '')
        hash_timestamp = None
        if hash_timestamp_str:
            try:
                utc_dt = datetime.fromisoformat(hash_timestamp_str.replace('Z', '+00:00'))
                ist = tz.gettz('Asia/Kolkata')
                hash_timestamp = utc_dt.astimezone(ist)
            except (ValueError, AttributeError):
                hash_timestamp = _get_ist_now()
        else:
            hash_timestamp = _get_ist_now()
        
        hash_is_valid = _verify_donation_hash(
            data.get('donation_hash'),
            data['donor_name'],
            data.get('donor_phone', ''),
            data['amount'],
            data['transaction_id'],
            hash_timestamp_str
        )
        
        if not hash_is_valid:
            if screenshot_path and os.path.exists(screenshot_path):
                os.remove(screenshot_path)
            return jsonify({
                'success': False,
                'error': 'Security verification failed: Donation hash is invalid. Possible data tampering detected.'
            }), 400
        
        donation = Donation(
            donor_name=data['donor_name'],
            donor_email=data.get('donor_email'),
            donor_phone=data.get('donor_phone'),
            donor_address=data.get('donor_address'),
            amount=float(data['amount']),
            currency=data.get('currency', 'INR'),
            transaction_id=data['transaction_id'],
            payment_method=data.get('payment_method', 'UPI'),
            message=data.get('message'),
            campaign=data.get('campaign'),
            screenshot_path=screenshot_path,
            screenshot_hash=img_hash,
            ocr_processed=ocr_data is not None,
            ocr_confidence=ocr_data.get('confidence') if ocr_data else None,
            ocr_validation_warnings=json.dumps(ocr_validation_warnings) if ocr_validation_warnings else None,
            receipt_number=receipt_service.generate_receipt_number(),
            status='pending',
            tax_exemption_claimed=data.get('tax_exemption_claimed', 'false').lower() == 'true',
            pan_number=data.get('pan_number'),
            donation_hash=data.get('donation_hash'),
            hash_verified=hash_is_valid,
            hash_timestamp=hash_timestamp,
            qr_amount=float(data['qr_amount'])
        )
        
        db.session.add(donation)
        db.session.flush()
        
        donation.receipt_number = receipt_service.generate_receipt_number(donation.id)
        
        if blockchain_service.is_connected():
            blockchain_result = blockchain_service.record_donation(
                donation.donation_hash,
                donation.amount,
                donation.transaction_id,
                "PENDING"
            )
            
            if blockchain_result.get('success'):
                donation.blockchain_tx_hash = blockchain_result.get('tx_hash')
                donation.blockchain_verified = True
                donation.etherscan_link = blockchain_result.get('blockscout_link') or blockchain_result.get('explorer_url')
                donation.status = 'verified'
            else:
                donation.blockchain_verified = False
                donation.status = 'pending'
                error_message = blockchain_result.get('error', 'Unknown blockchain error')
                donation.verification_notes = (
                    f"Blockchain record failed: {error_message}"
                )
        
        db.session.commit()
        
        receipt_path = receipt_service.generate_receipt(donation)
        donation.receipt_path = receipt_path
        db.session.commit()

        if supabase_manager:
            try:
                result = supabase_manager.create_donor_record(donation.to_dict())
                app.logger.info("Supabase sync succeeded for donation %s: %s", donation.id, result)
            except Exception as supabase_error:
                app.logger.error(
                    "Failed to sync donation %s to Supabase: %s",
                    donation.id,
                    supabase_error,
                )
        
        email_service.send_admin_notification(donation)
        
        if donation.blockchain_verified and donation.donor_email:
            email_service.send_donation_receipt(donation, receipt_path)
        
        return jsonify({
            'success': True,
            'message': 'Donation created successfully',
            'donation': donation.to_dict(),
            'ocr_data': ocr_data,
            'ocr_validation_warnings': ocr_validation_warnings if ocr_validation_warnings else []
        }), 201
    
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500

@app.route('/api/donations', methods=['GET'])
def get_donations():
    """Get all donations with filtering and pagination"""
    try:
        # Pagination
        page = request.args.get('page', 1, type=int)
        per_page = request.args.get('per_page', 10, type=int)
        
        # Filters
        status = request.args.get('status')
        campaign = request.args.get('campaign')
        start_date = request.args.get('start_date')
        end_date = request.args.get('end_date')
        search = request.args.get('search')
        
        # Build query
        query = Donation.query
        
        if status:
            query = query.filter_by(status=status)
        
        if campaign:
            query = query.filter_by(campaign=campaign)
        
        if start_date:
            start = datetime.fromisoformat(start_date)
            query = query.filter(Donation.created_at >= start)
        
        if end_date:
            end = datetime.fromisoformat(end_date)
            query = query.filter(Donation.created_at <= end)
        
        if search:
            query = query.filter(
                db.or_(
                    Donation.donor_name.ilike(f'%{search}%'),
                    Donation.transaction_id.ilike(f'%{search}%'),
                    Donation.receipt_number.ilike(f'%{search}%')
                )
            )
        
        # Order by created_at descending
        query = query.order_by(Donation.created_at.desc())
        
        # Paginate
        pagination = query.paginate(page=page, per_page=per_page, error_out=False)
        
        return jsonify({
            'donations': [d.to_dict() for d in pagination.items],
            'total': pagination.total,
            'pages': pagination.pages,
            'current_page': page,
            'per_page': per_page
        }), 200
    
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/donations/<int:donation_id>', methods=['GET'])
def get_donation(donation_id):
    """Get a specific donation"""
    try:
        donation = Donation.query.get_or_404(donation_id)
        return jsonify(donation.to_dict()), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/donations/<int:donation_id>', methods=['PUT'])
def update_donation(donation_id):
    """Update a donation"""
    try:
        donation = Donation.query.get_or_404(donation_id)
        data = request.json
        
        # Update allowed fields
        allowed_fields = ['status', 'verified_by', 'verification_notes', 'donor_email', 
                         'donor_phone', 'donor_address', 'message', 'campaign']
        
        for field in allowed_fields:
            if field in data:
                setattr(donation, field, data[field])
        
        db.session.commit()
        
        # Send verification email if status changed to verified
        if data.get('status') == 'verified' and donation.donor_email:
            email_service.send_verification_email(donation)
        
        return jsonify({
            'success': True,
            'message': 'Donation updated successfully',
            'donation': donation.to_dict()
        }), 200
    
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500

@app.route('/api/donations/<int:donation_id>/receipt', methods=['GET'])
def download_receipt(donation_id):
    """Download donation receipt"""
    try:
        donation = Donation.query.get_or_404(donation_id)
        
        if not donation.receipt_path or not os.path.exists(donation.receipt_path):
            return jsonify({'error': 'Receipt not found'}), 404
        
        return send_file(
            donation.receipt_path,
            as_attachment=True,
            download_name=f"{donation.receipt_number}.pdf"
        )
    
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# ==================== ANALYTICS ENDPOINTS ====================

@app.route('/api/analytics/summary', methods=['GET'])
def get_analytics_summary():
    """Get donation analytics summary"""
    try:
        # Feature guard: advanced aggregation runs only when enabled
        advanced_enabled = FEATURE_ADVANCED_ANALYTICS

        # Total donations
        total_donations = db.session.query(func.sum(Donation.amount)).scalar() or 0
        
        # Total count
        total_count = Donation.query.count()
        
        # Verified donations
        verified_count = Donation.query.filter_by(status='verified').count()
        
        # Blockchain verified
        blockchain_count = Donation.query.filter_by(blockchain_verified=True).count()
        
        # Average donation
        avg_donation = db.session.query(func.avg(Donation.amount)).scalar() or 0
        
        # This month's donations
        start_of_month = datetime.utcnow().replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        month_donations = db.session.query(func.sum(Donation.amount)).filter(
            Donation.created_at >= start_of_month
        ).scalar() or 0
        
        # Top donors
        top_donors = db.session.query(
            Donation.donor_name,
            func.sum(Donation.amount).label('total')
        ).group_by(Donation.donor_name).order_by(func.sum(Donation.amount).desc()).limit(5).all()

        advanced_summary = {}
        if advanced_enabled:
            # Conversion funnel: initiated vs verified donations
            pending_count = Donation.query.filter_by(status='pending').count()
            rejected_count = Donation.query.filter_by(status='rejected').count()

            # Engagement window: donations in the selected range
            default_days = max(int(ANALYTICS_ADVANCED_DEFAULT_RANGE_DAYS or 90), 1)
            range_days = request.args.get('advanced_days', default_days, type=int) or default_days
            window_start = datetime.utcnow() - timedelta(days=range_days)

            window_donations = Donation.query.filter(Donation.created_at >= window_start).all()
            returning_donors = 0
            new_donors = 0
            total_window_amount = 0
            total_window_count = 0

            donor_totals = {}
            for donation in window_donations:
                donor_key = donation.donor_email or donation.donor_name or f"anonymous-{donation.id}"
                totals = donor_totals.setdefault(donor_key, {'count': 0, 'amount': 0})
                totals['count'] += 1
                totals['amount'] += donation.amount or 0

            for totals in donor_totals.values():
                if totals['count'] > 1:
                    returning_donors += 1
                else:
                    new_donors += 1
                total_window_amount += totals['amount']
                total_window_count += totals['count']

            average_window_donation = (total_window_amount / total_window_count) if total_window_count else 0

            advanced_summary = {
                'funnel': {
                    'pending': pending_count,
                    'verified': verified_count,
                    'rejected': rejected_count,
                },
                'donor_retention': {
                    'new_donors': new_donors,
                    'returning_donors': returning_donors,
                    'window_days': range_days,
                },
                'lifetime': {
                    'average_window_donation': float(average_window_donation),
                },
            }

        response_payload = {
            'total_donations': float(total_donations),
            'total_count': total_count,
            'verified_count': verified_count,
            'blockchain_count': blockchain_count,
            'average_donation': float(avg_donation),
            'month_donations': float(month_donations),
            'top_donors': [{'name': name, 'total': float(total)} for name, total in top_donors]
        }

        if advanced_enabled:
            response_payload['advanced'] = advanced_summary

        return jsonify(response_payload), 200
    
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/analytics/trends', methods=['GET'])
def get_donation_trends():
    """Get donation trends over time"""
    try:
        days = request.args.get('days', 30, type=int)
        start_date = datetime.utcnow() - timedelta(days=days)
        
        # Daily donations
        daily_donations = db.session.query(
            func.date(Donation.created_at).label('date'),
            func.sum(Donation.amount).label('total'),
            func.count(Donation.id).label('count')
        ).filter(
            Donation.created_at >= start_date
        ).group_by(
            func.date(Donation.created_at)
        ).order_by('date').all()

        response_payload = {
            'trends': [
                {
                    'date': date if isinstance(date, str) else date.isoformat(),
                    'total': float(total),
                    'count': count
                }
                for date, total, count in daily_donations
            ]
        }

        if FEATURE_ADVANCED_ANALYTICS:
            # Extended metrics: cumulative totals and moving averages
            cumulative_total = 0
            cumulative_count = 0
            extended_points = []
            for raw_date, total, count in daily_donations:
                cumulative_total += float(total or 0)
                cumulative_count += int(count or 0)
                formatted_date = raw_date if isinstance(raw_date, str) else raw_date.isoformat()
                extended_points.append({
                    'date': formatted_date,
                    'total': float(total or 0),
                    'count': int(count or 0),
                    'cumulative_total': cumulative_total,
                    'cumulative_count': cumulative_count,
                    'average_donation': float(total) / count if count else 0,
                })

            response_payload['advanced'] = {
                'dataset': extended_points,
                'range_days': days,
            }

        return jsonify(response_payload), 200
    
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/analytics/campaigns', methods=['GET'])
def get_campaign_analytics():
    """Get analytics by campaign"""
    try:
        campaign_stats = db.session.query(
            Donation.campaign,
            func.sum(Donation.amount).label('total'),
            func.count(Donation.id).label('count')
        ).filter(
            Donation.campaign.isnot(None)
        ).group_by(
            Donation.campaign
        ).all()
        
        base_campaigns = [
            {
                'name': campaign or 'General',
                'total': float(total),
                'count': count
            }
            for campaign, total, count in campaign_stats
        ]

        response_payload = {'campaigns': base_campaigns}

        if FEATURE_ADVANCED_ANALYTICS:
            # Compute share of total donations per campaign
            total_amount = sum(item['total'] for item in base_campaigns)
            campaigns_with_share = [
                {
                    **item,
                    'share_percent': round((item['total'] / total_amount) * 100, 2) if total_amount else 0,
                }
                for item in base_campaigns
            ]
            response_payload['advanced'] = {
                'campaigns': campaigns_with_share,
            }

        return jsonify(response_payload), 200
    
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# ==================== BLOCKCHAIN ENDPOINTS ====================

@app.route('/api/blockchain/status', methods=['GET'])
def blockchain_status():
    """Get blockchain connection status"""
    try:
        is_connected = blockchain_service.is_connected()
        balance = 0
        total_donations = 0
        gas_estimate = None
        
        if is_connected:
            try:
                balance = blockchain_service.get_balance()
            except Exception as e:
                app.logger.warning(f"Error getting balance: {e}")
                balance = 0
            
            try:
                total_donations = blockchain_service.get_total_donations()
            except Exception as e:
                app.logger.warning(f"Error getting total donations: {e}")
                total_donations = 0
            
            try:
                gas_estimate = blockchain_service.estimate_gas_cost()
            except Exception as e:
                app.logger.warning(f"Error estimating gas: {e}")
                gas_estimate = None
        
        return jsonify({
            'connected': is_connected,
            'network': app.config['ETHEREUM_NETWORK'],
            'balance': float(balance),
            'total_donations': total_donations,
            'gas_estimate': gas_estimate
        }), 200
    
    except Exception as e:
        app.logger.error(f"Blockchain status error: {e}")
        return jsonify({
            'connected': False,
            'network': app.config['ETHEREUM_NETWORK'],
            'balance': 0,
            'total_donations': 0,
            'gas_estimate': None,
            'error': str(e)
        }), 200

@app.route('/api/config/upi', methods=['GET'])
def get_upi_config():
    """Get public UPI configuration for QR code generation"""
    try:
        return jsonify({
            'success': True,
            'upi_id': app.config.get('UPI_ID', 'samswinson5@oksbi'),
            'upi_payee_name': app.config.get('UPI_PAYEE_NAME', 'Sams Swinson')
        }), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/donations/public/<int:donation_id>', methods=['GET'])
def get_public_donation(donation_id):
    """Get public donation details for QR code verification"""
    try:
        donation = Donation.query.get(donation_id)
        
        if not donation:
            return jsonify({'error': 'Donation not found'}), 404
        
        return jsonify({
            'success': True,
            'donation': {
                'receipt_number': donation.receipt_number,
                'donor_name': donation.donor_name,
                'donor_email': donation.donor_email,
                'donor_phone': donation.donor_phone,
                'amount': donation.amount,
                'currency': donation.currency,
                'transaction_id': donation.transaction_id,
                'payment_method': donation.payment_method,
                'campaign': donation.campaign,
                'status': donation.status,
                'created_at': donation.created_at.isoformat() if donation.created_at else None,
                'blockchain_verified': donation.blockchain_verified,
                'blockchain_tx_hash': donation.blockchain_tx_hash,
                'donation_hash': donation.donation_hash
            }
        }), 200
    
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/blockchain/verify/<transaction_id>', methods=['GET'])
def verify_on_blockchain(transaction_id):
    """Verify donation on blockchain"""
    try:
        identifier = transaction_id.strip()

        if not identifier:
            return jsonify({
                'verified': False,
                'donation': None,
                'message': 'Donation identifier is required'
            }), 400

        donation = Donation.query.filter(
            or_(
                Donation.blockchain_tx_hash == identifier,
                Donation.transaction_id == identifier,
                func.lower(Donation.receipt_number) == identifier.lower()
            )
        ).first()

        if not donation:
            return jsonify({
                'verified': False,
                'donation': None,
                'message': 'Donation not found in admin records'
            }), 404

        return jsonify({
            'verified': True,
            'donation': donation.to_dict(),
            'message': 'Donation retrieved from admin records'
        }), 200
    
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# ==================== CAMPAIGN ENDPOINTS ====================

@app.route('/api/campaigns', methods=['GET'])
def get_campaigns():
    """Get all campaigns"""
    try:
        campaigns = Campaign.query.filter_by(is_active=True).all()
        return jsonify({
            'campaigns': [c.to_dict() for c in campaigns]
        }), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/campaigns', methods=['POST'])
def create_campaign():
    """Create a new campaign"""
    try:
        data = request.json
        
        campaign = Campaign(
            name=data['name'],
            description=data.get('description'),
            goal_amount=data.get('goal_amount'),
            end_date=datetime.fromisoformat(data['end_date']) if data.get('end_date') else None
        )
        
        db.session.add(campaign)
        db.session.commit()
        
        return jsonify({
            'success': True,
            'campaign': campaign.to_dict()
        }), 201
    
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500

# ==================== HEALTH CHECK ====================

@app.route('/api/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({
        'status': 'healthy',
        'timestamp': datetime.utcnow().isoformat() + 'Z',
        'database': 'connected',
        'blockchain': 'connected' if blockchain_service.is_connected() else 'disconnected'
    }), 200

# ==================== ERROR HANDLERS ====================

@app.errorhandler(404)
def not_found(error):
    return jsonify({'error': 'Not found'}), 404

@app.errorhandler(500)
def internal_error(error):
    db.session.rollback()
    return jsonify({'error': 'Internal server error'}), 500

# ==================== DATABASE INITIALIZATION ====================

@app.cli.command()
def init_db():
    """Initialize the database"""
    db.create_all()
    print("Database initialized!")

if __name__ == '__main__':
    with app.app_context():
        db.create_all()
    app.run(debug=True, host='0.0.0.0', port=5000)