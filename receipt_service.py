from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.units import inch
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer, Image
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_CENTER, TA_RIGHT, TA_LEFT
from datetime import datetime
import os
import uuid
import qrcode
from io import BytesIO

class ReceiptService:
    """Service for generating donation receipts"""
    
    def __init__(self, config):
        self.config = config
        self.receipts_folder = 'receipts'
        
        # Create receipts folder if it doesn't exist
        if not os.path.exists(self.receipts_folder):
            os.makedirs(self.receipts_folder)
    
    def generate_receipt_number(self, donation_id=None):
        """Generate unique receipt number. Uses UUID fallback when donation_id is not available."""
        year = datetime.now().year
        if donation_id:
            return f"RCP-{year}-{donation_id:06d}"
        unique_suffix = uuid.uuid4().hex[:10].upper()
        return f"RCP-{year}-{unique_suffix}"
    
    def generate_receipt(self, donation):
        """Generate PDF receipt for donation"""
        receipt_filename = f"{donation.receipt_number}.pdf"
        receipt_path = os.path.join(self.receipts_folder, receipt_filename)
        
        # Create PDF document
        doc = SimpleDocTemplate(receipt_path, pagesize=A4)
        story = []
        styles = getSampleStyleSheet()
        
        # Custom styles
        title_style = ParagraphStyle(
            'CustomTitle',
            parent=styles['Heading1'],
            fontSize=24,
            textColor=colors.HexColor('#1a73e8'),
            spaceAfter=30,
            alignment=TA_CENTER
        )
        
        heading_style = ParagraphStyle(
            'CustomHeading',
            parent=styles['Heading2'],
            fontSize=14,
            textColor=colors.HexColor('#333333'),
            spaceAfter=12
        )
        
        qr_label_style = ParagraphStyle(
            'QRLabel',
            parent=styles['Normal'],
            fontSize=9,
            textColor=colors.HexColor('#666666'),
            alignment=TA_CENTER
        )
        
        # Header - NGO Information
        story.append(Paragraph(self.config.get('NGO_NAME', 'Donation Platform'), title_style))
        story.append(Paragraph(self.config.get('NGO_ADDRESS', ''), styles['Normal']))
        story.append(Paragraph(f"Email: {self.config.get('NGO_EMAIL', '')}", styles['Normal']))
        story.append(Paragraph(f"PAN: {self.config.get('NGO_PAN', '')} | Registration: {self.config.get('NGO_REGISTRATION', '')}", styles['Normal']))
        story.append(Spacer(1, 0.3*inch))
        
        # Receipt Title
        story.append(Paragraph("DONATION RECEIPT", heading_style))
        story.append(Spacer(1, 0.2*inch))
        
        # Receipt Details Table
        receipt_data = [
            ['Receipt Number:', donation.receipt_number],
            ['Date:', donation.created_at.strftime('%d %B %Y')],
            ['Status:', donation.status.upper()],
        ]
        
        receipt_table = Table(receipt_data, colWidths=[2*inch, 4*inch])
        receipt_table.setStyle(TableStyle([
            ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
            ('FONTNAME', (1, 0), (1, -1), 'Helvetica'),
            ('FONTSIZE', (0, 0), (-1, -1), 10),
            ('TEXTCOLOR', (0, 0), (0, -1), colors.HexColor('#555555')),
            ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
        ]))
        
        story.append(receipt_table)
        story.append(Spacer(1, 0.3*inch))
        
        # Donor Information
        story.append(Paragraph("Donor Information", heading_style))
        
        donor_data = [
            ['Name:', donation.donor_name],
            ['Email:', donation.donor_email or 'N/A'],
            ['Phone:', donation.donor_phone or 'N/A'],
        ]
        
        if donation.donor_address:
            donor_data.append(['Address:', donation.donor_address])
        
        donor_table = Table(donor_data, colWidths=[2*inch, 4*inch])
        donor_table.setStyle(TableStyle([
            ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
            ('FONTNAME', (1, 0), (1, -1), 'Helvetica'),
            ('FONTSIZE', (0, 0), (-1, -1), 10),
            ('TEXTCOLOR', (0, 0), (0, -1), colors.HexColor('#555555')),
            ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
        ]))
        
        story.append(donor_table)
        story.append(Spacer(1, 0.3*inch))
        
        qr_section_data = [
            [Paragraph("<b>Donation Verification Reference</b>", qr_label_style)],
        ]
        qr_section_table = Table(qr_section_data, colWidths=[6*inch])
        qr_section_table.setStyle(TableStyle([
            ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ]))
        story.append(qr_section_table)
        story.append(Spacer(1, 0.15*inch))
        
        qr_img = self._generate_verification_qr_code(donation)
        story.append(qr_img)
        
        story.append(Spacer(1, 0.1*inch))
        
        scan_instruction_style = ParagraphStyle(
            'ScanInstruction',
            parent=styles['Normal'],
            fontSize=8,
            textColor=colors.HexColor('#666666'),
            alignment=TA_CENTER
        )
        story.append(Paragraph("Scan to view donation verification reference.<br/>No internet required - hash can be verified on any blockchain explorer.", scan_instruction_style))
        
        story.append(Spacer(1, 0.2*inch))
        
        # Donation Details
        story.append(Paragraph("Donation Details", heading_style))
        
        donation_data = [
            ['Amount:', f"₹{donation.amount:,.2f} {donation.currency}"],
            ['Payment Method:', donation.payment_method],
            ['Transaction ID:', donation.transaction_id],
        ]
        
        if donation.campaign:
            donation_data.append(['Campaign:', donation.campaign])
        
        if donation.message:
            donation_data.append(['Message:', donation.message])
        
        donation_table = Table(donation_data, colWidths=[2*inch, 4*inch])
        donation_table.setStyle(TableStyle([
            ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
            ('FONTNAME', (1, 0), (1, -1), 'Helvetica'),
            ('FONTSIZE', (0, 0), (-1, -1), 10),
            ('TEXTCOLOR', (0, 0), (0, -1), colors.HexColor('#555555')),
            ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
        ]))
        
        story.append(donation_table)
        story.append(Spacer(1, 0.3*inch))
        
        # Blockchain Verification
        if donation.blockchain_verified and donation.blockchain_tx_hash:
            story.append(Paragraph("Blockchain Verification (Polygon Amoy)", heading_style))
            
            blockchain_data = [
                ['Transaction Hash:', donation.blockchain_tx_hash[:20] + '...'],
                ['Verified on Blockchain:', 'Yes ✓'],
                ['PolygonScan Link:', 'Scan QR code below'],
            ]
            
            blockchain_table = Table(blockchain_data, colWidths=[2*inch, 4*inch])
            blockchain_table.setStyle(TableStyle([
                ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
                ('FONTNAME', (1, 0), (1, -1), 'Helvetica'),
                ('FONTSIZE', (0, 0), (-1, -1), 10),
                ('TEXTCOLOR', (0, 0), (0, -1), colors.HexColor('#555555')),
                ('TEXTCOLOR', (1, 1), (1, 1), colors.green),
                ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
                ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
            ]))
            
            story.append(blockchain_table)
            
            # Generate QR code for Etherscan link
            if donation.etherscan_link:
                qr_img = self._generate_qr_code(donation.etherscan_link)
                story.append(Spacer(1, 0.2*inch))
                story.append(qr_img)
            
            story.append(Spacer(1, 0.3*inch))
        
        # Amount in Words
        amount_words = self._amount_to_words(donation.amount)
        story.append(Paragraph(f"<b>Amount in Words:</b> {amount_words} Rupees Only", styles['Normal']))
        story.append(Spacer(1, 0.3*inch))
        
        # Tax Exemption Notice
        if donation.tax_exemption_claimed:
            tax_notice = """
            <b>Tax Exemption:</b> This donation is eligible for tax exemption under Section 80G 
            of the Income Tax Act, 1961. Please retain this receipt for your tax records.
            """
            story.append(Paragraph(tax_notice, styles['Normal']))
            story.append(Spacer(1, 0.3*inch))
        
        # Footer
        story.append(Spacer(1, 0.5*inch))
        footer_text = """
        <i>This is a computer-generated receipt and does not require a signature. 
        For any queries, please contact us at {email}</i>
        """.format(email=self.config.get('NGO_EMAIL', ''))
        story.append(Paragraph(footer_text, styles['Normal']))
        
        # Thank you message
        story.append(Spacer(1, 0.2*inch))
        thank_you_style = ParagraphStyle(
            'ThankYou',
            parent=styles['Normal'],
            fontSize=14,
            textColor=colors.HexColor('#1a73e8'),
            alignment=TA_CENTER
        )
        story.append(Paragraph("<b>Thank you for your generous donation!</b>", thank_you_style))
        
        # Build PDF
        doc.build(story)
        
        return receipt_path
    
    def _generate_qr_code(self, data):
        """Generate QR code image"""
        qr = qrcode.QRCode(version=1, box_size=10, border=5)
        qr.add_data(data)
        qr.make(fit=True)
        
        img = qr.make_image(fill_color="black", back_color="white")
        
        # Save to BytesIO
        buffer = BytesIO()
        img.save(buffer, format='PNG')
        buffer.seek(0)
        
        # Create ReportLab Image
        qr_image = Image(buffer, width=1.5*inch, height=1.5*inch)
        
        return qr_image
    
    def _generate_verification_qr_code(self, donation):
        """Generate QR code with Amoy PolygonScan URL or donation hash"""
        qr_data = None
        
        if donation.blockchain_verified and donation.blockchain_tx_hash:
            # Encode the full Amoy PolygonScan URL for easy mobile scanning
            qr_data = f"https://amoy.polygonscan.com/tx/{donation.blockchain_tx_hash}"
        elif donation.donation_hash:
            qr_data = donation.donation_hash
        else:
            qr_data = donation.receipt_number
        
        qr = qrcode.QRCode(version=1, box_size=10, border=5)
        qr.add_data(qr_data)
        qr.make(fit=True)
        
        img = qr.make_image(fill_color="black", back_color="white")
        
        buffer = BytesIO()
        img.save(buffer, format='PNG')
        buffer.seek(0)
        
        qr_image = Image(buffer, width=2*inch, height=2*inch)
        
        qr_container_data = [[qr_image]]
        qr_container = Table(qr_container_data, colWidths=[6*inch])
        qr_container.setStyle(TableStyle([
            ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ]))
        
        return qr_container
    
    def _generate_donation_qr_code(self, donation_id):
        """Generate QR code for donation details (legacy)"""
        base_url = self.config.get('BASE_URL', 'http://localhost:5000')
        verification_url = f"{base_url}/api/donations/public/{donation_id}"
        
        qr = qrcode.QRCode(version=1, box_size=10, border=5)
        qr.add_data(verification_url)
        qr.make(fit=True)
        
        img = qr.make_image(fill_color="black", back_color="white")
        
        buffer = BytesIO()
        img.save(buffer, format='PNG')
        buffer.seek(0)
        
        qr_image = Image(buffer, width=2*inch, height=2*inch)
        
        qr_container_data = [[qr_image]]
        qr_container = Table(qr_container_data, colWidths=[6*inch])
        qr_container.setStyle(TableStyle([
            ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ]))
        
        return qr_container
    
    def _amount_to_words(self, amount):
        """Convert amount to words (Indian numbering system)"""
        ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine']
        tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety']
        teens = ['Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen']
        
        def convert_two_digits(n):
            if n < 10:
                return ones[n]
            elif n < 20:
                return teens[n - 10]
            else:
                return tens[n // 10] + (' ' + ones[n % 10] if n % 10 != 0 else '')
        
        def convert_three_digits(n):
            if n >= 100:
                return ones[n // 100] + ' Hundred' + (' ' + convert_two_digits(n % 100) if n % 100 != 0 else '')
            else:
                return convert_two_digits(n)
        
        # Split into rupees and paise
        rupees = int(amount)
        paise = int((amount - rupees) * 100)
        
        if rupees == 0:
            return 'Zero'
        
        # Convert rupees
        crores = rupees // 10000000
        rupees %= 10000000
        lakhs = rupees // 100000
        rupees %= 100000
        thousands = rupees // 1000
        rupees %= 1000
        
        result = []
        
        if crores > 0:
            result.append(convert_two_digits(crores) + ' Crore')
        if lakhs > 0:
            result.append(convert_two_digits(lakhs) + ' Lakh')
        if thousands > 0:
            result.append(convert_three_digits(thousands) + ' Thousand')
        if rupees > 0:
            result.append(convert_three_digits(rupees))
        
        return ' '.join(result)