from flask_mail import Mail, Message
import os

class EmailService:
    """Service for sending email notifications"""
    
    def __init__(self, app, config):
        self.config = config
        self.mail = Mail(app)
    
    def send_donation_receipt(self, donation, receipt_path):
        """Send donation receipt via email - ONLY after blockchain verification"""
        if not donation.donor_email:
            return {
                'success': False,
                'error': 'No email address provided'
            }
        
        if not donation.blockchain_verified:
            return {
                'success': False,
                'error': 'Email only sent after blockchain verification'
            }
        
        try:
            subject = f"Official Donation Receipt | {donation.receipt_number} | INR {donation.amount:,.0f}"
            
            body = f"""Dear {donation.donor_name},

Thank you for your generous contribution to {self.config.get('NGO_NAME', 'our organization')}. We truly appreciate your support and commitment to creating meaningful social impact.

DONATION SUMMARY
----------------
Receipt Number : {donation.receipt_number}
Amount          : INR {donation.amount:,.2f} {donation.currency}
Transaction ID  : {donation.transaction_id}
Donation Date   : {donation.created_at.strftime('%d %B %Y at %I:%M %p IST')}

BLOCKCHAIN VERIFICATION
----------------------
Your donation has been securely recorded on the blockchain to ensure transparency and immutability.

Blockchain Hash : {donation.blockchain_tx_hash}
Verify Link     : {donation.etherscan_link}

This allows you to independently verify your contribution at any time.

RECEIPT
-------
Your official donation receipt is attached with this email for your records and compliance purposes.

YOUR SUPPORT ENABLES US TO
-------------------------
- Deliver essential services to those in need  
- Build sustainable community programs  
- Promote transparency and accountability  
- Create long-term social impact  

For any assistance, feel free to contact us at:
{self.config.get('NGO_EMAIL', '')}

With sincere gratitude,

{self.config.get('NGO_NAME', 'our organization')}

Together, we create impact.
"""
            
            msg = Message(
                subject=subject,
                recipients=[donation.donor_email],
                body=body,
                sender=self.config.get('MAIL_DEFAULT_SENDER')
            )
            
            if receipt_path and os.path.exists(receipt_path):
                with open(receipt_path, 'rb') as f:
                    msg.attach(
                        filename=f"{donation.receipt_number}.pdf",
                        content_type="application/pdf",
                        data=f.read()
                    )
            
            self.mail.send(msg)
            
            return {
                'success': True,
                'message': 'Email sent successfully'
            }
        
        except Exception as e:
            return {
                'success': False,
                'error': str(e)
            }
    
    def send_admin_notification(self, donation):
        """Send notification to admin about new donation - PENDING STATUS"""
        if not self.config.get('MAIL_DEFAULT_SENDER'):
            return {
                'success': False,
                'error': 'Admin email not configured'
            }
        
        try:
            subject = f"New Donation Alert | {donation.receipt_number} | INR {donation.amount:,.0f}"
            
            body = f"""New Donation Notification

DONATION DETAILS
----------------
Amount          : INR {donation.amount:,.2f} {donation.currency}
Receipt Number  : {donation.receipt_number}
Transaction ID  : {donation.transaction_id}
Payment Method  : {donation.payment_method}
Received At     : {donation.created_at.strftime('%d %B %Y at %I:%M %p IST')}

DONOR INFORMATION
----------------
Name            : {donation.donor_name}
Email           : {donation.donor_email or 'Not provided'}
Phone           : {donation.donor_phone or 'Not provided'}
Address         : {donation.donor_address or 'Not provided'}
"""
            
            if donation.message:
                body += f"\nDonor Message:\n{donation.message}\n"
            
            if donation.campaign:
                body += f"\nCampaign: {donation.campaign}\n"
            
            body += f"""

BLOCKCHAIN STATUS
----------------
Hash Verification : {'VERIFIED' if donation.hash_verified else 'PENDING'}
Blockchain Status : {'VERIFIED' if donation.blockchain_verified else 'PENDING'}

CURRENT STATE
-------------
Status           : {donation.status.upper()}

ADMIN ACTION
------------
Please review this donation in the admin dashboard if further verification or notes are required.

Note: Donor receipt email will be automatically sent after blockchain verification is completed.
"""
            
            admin_emails = [self.config.get('MAIL_DEFAULT_SENDER')]
            
            msg = Message(
                subject=subject,
                recipients=admin_emails,
                body=body,
                sender=self.config.get('MAIL_DEFAULT_SENDER')
            )
            
            self.mail.send(msg)
            
            return {
                'success': True,
                'message': 'Admin notification sent'
            }
        
        except Exception as e:
            return {
                'success': False,
                'error': str(e)
            }
    
    def send_verification_notification(self, donation):
        """Send verification notification when donation is verified"""
        if not donation.donor_email:
            return {
                'success': False,
                'error': 'No donor email'
            }
        
        try:
            subject = f"Donation Successfully Verified | {donation.receipt_number}"
            
            body = f"""Dear {donation.donor_name},

We are pleased to inform you that your donation has been successfully verified and permanently recorded on the blockchain.

VERIFICATION DETAILS
--------------------
Receipt Number : {donation.receipt_number}
Amount         : INR {donation.amount:,.2f}
Status         : VERIFIED

BLOCKCHAIN RECORD
-----------------
Transaction Hash : {donation.blockchain_tx_hash}
Verification Link: {donation.etherscan_link}

Your contribution is now publicly verifiable and securely stored for long-term transparency.

Thank you for your valuable support.

Warm regards,

{self.config.get('NGO_NAME', 'our organization')}
"""
            
            msg = Message(
                subject=subject,
                recipients=[donation.donor_email],
                body=body,
                sender=self.config.get('MAIL_DEFAULT_SENDER')
            )
            
            self.mail.send(msg)
            
            return {
                'success': True,
                'message': 'Verification notification sent'
            }
        
        except Exception as e:
            return {
                'success': False,
                'error': str(e)
            }
