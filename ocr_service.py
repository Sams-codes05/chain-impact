import easyocr
import cv2
import numpy as np
import re
import os

class OCRService:
    """Service for extracting donation information from screenshots using OCR"""
    
    def __init__(self, config):
        self.config = config
        self.reader = None
        self.confidence_threshold = config.get('OCR_CONFIDENCE_THRESHOLD', 0.3)
    
    def initialize_reader(self):
        """Initialize EasyOCR reader (lazy loading)"""
        if self.reader is None:
            self.reader = easyocr.Reader(['en'], gpu=False)
    
    def preprocess_image(self, image_path):
        """Preprocess image for better OCR accuracy on payment screenshots"""
        img = cv2.imread(image_path)
        
        if img is None:
            raise ValueError(f"Could not read image from {image_path}")
        
        h, w = img.shape[:2]
        if h < 800:
            scale = 1000 / h
            img = cv2.resize(img, (int(w * scale), 1000), interpolation=cv2.INTER_LINEAR)
            
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        clahe = cv2.createCLAHE(clipLimit=1.5, tileGridSize=(16, 16))
        enhanced = clahe.apply(gray)
        
        return enhanced
    
    def extract_text(self, image_path):
        """Extract text from image using OCR with preprocessing"""
        self.initialize_reader()
        
        try:
            if not os.path.exists(image_path):
                raise FileNotFoundError(f"Image not found: {image_path}")
            
            try:
                processed_img = self.preprocess_image(image_path)
                results = self.reader.readtext(
                    processed_img, 
                    detail=1, 
                    contrast_ths=0.1, 
                    adjust_contrast=0.7,
                    add_margin=0.1,
                    width_ths=0.5
                )
            except Exception as pre_err:
                results = self.reader.readtext(image_path, detail=1)
            
            extracted_data = []
            for detection in results:
                if len(detection) >= 3:
                    bbox, text, confidence = detection[0], detection[1], detection[2]
                    if confidence >= self.confidence_threshold:
                        clean_bbox = []
                        for point in bbox:
                            clean_bbox.append([int(point[0]), int(point[1])])
                        
                        extracted_data.append({
                            'text': text.strip(),
                            'confidence': confidence,
                            'bbox': clean_bbox
                        })
            
            return extracted_data
        
        except Exception as e:
            return []
    
    def parse_upi_screenshot(self, image_path):
        """Parse UPI screenshot to extract donation information"""
        try:
            img = cv2.imread(image_path)
            if img is not None:
                img_height, img_width = img.shape[:2]
            else:
                img_height, img_width = 1000, 1000
                
            extracted_data = self.extract_text(image_path)
            
            if not extracted_data:
                return {
                    'success': False,
                    'error': 'No text could be extracted from the image'
                }
            
            full_text = ' '.join([item['text'] for item in extracted_data])
            
            if not full_text.strip():
                return {
                    'success': False,
                    'error': 'Extracted text is empty'
                }
            
            amount_val, amount_bbox = self._spatial_extract_amount(extracted_data, img_width, img_height)
            txn_val, txn_bbox = self._spatial_extract_transaction_id(extracted_data)

            donation_info = {
                'payee_name': self._extract_payee_name(full_text),
                'amount': amount_val,
                'amount_bbox': amount_bbox,
                'transaction_id': txn_val,
                'transaction_id_bbox': txn_bbox,
                'payment_method': self._extract_payment_method(full_text),
                'date': self._extract_date(full_text),
                'confidence': self._calculate_average_confidence(extracted_data)
            }
            
            # Spatial extraction failed — fall back to regex
            if not donation_info['amount']:
                donation_info['amount'] = self._extract_amount(full_text)
                if donation_info['amount']:
                    for item in extracted_data:
                        if str(int(donation_info['amount'])) in item['text'].replace(',', ''):
                            donation_info['amount_bbox'] = item['bbox']
                            break

            if not donation_info['transaction_id']:
                donation_info['transaction_id'] = self._extract_transaction_id(full_text)
                if donation_info['transaction_id']:
                    for item in extracted_data:
                        if donation_info['transaction_id'] in item['text'].replace(' ', ''):
                            donation_info['transaction_id_bbox'] = item['bbox']
                            break
            
            donation_info['donor_name'] = None 
            
            if donation_info['amount'] and donation_info['transaction_id']:
                return {
                    'success': True,
                    'data': donation_info,
                    'raw_text': full_text
                }
            else:
                missing = []
                if not donation_info['amount']:
                    missing.append('amount')
                if not donation_info['transaction_id']:
                    missing.append('transaction ID')
                
                return {
                    'success': False,
                    'error': f'Could not extract required information: {", ".join(missing)}',
                    'partial_data': donation_info,
                    'raw_text': full_text
                }
        
        except Exception as e:
            return {
                'success': False,
                'error': f'Error processing image: {str(e)}'
            }

    def _spatial_extract_amount(self, extracted_data, img_width=1000, img_height=1000):
        """Extract donation amount using spatial analysis — prioritises large, bold, centred currency values"""
        
        candidates = []
        
        date_keywords = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec', 
                         'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday',
                         'am', 'pm', '2024', '2025', '2026']
        meta_keywords = ['upi id', 'bank', 'state bank', 'hdfc', 'icici', 'axis', 'ref no', 'utr', 'to:', 'from:', 'completed']
        
        for i, item in enumerate(extracted_data):
            text = item['text'].lower().strip()
            bbox = item['bbox']
            
            height = abs(bbox[2][1] - bbox[0][1])
            y_center = sum([p[1] for p in bbox]) / 4
            x_center = sum([p[0] for p in bbox]) / 4
            
            # Ignore header and footer regions
            if y_center < (0.1 * img_height) or y_center > (0.9 * img_height): 
                continue

            if any(kw in text for kw in date_keywords + meta_keywords):
                continue
            
            if len(re.findall(r'\d+', text)) >= 3 and any(kw in text for kw in ['dec', 'pm', 'am']):
                continue

            clean_digits = re.sub(r'\D', '', text)
            if (len(clean_digits) == 10 and clean_digits[0] in '6789') or len(clean_digits) >= 12:
                continue

            has_currency_symbol = any(s in text for s in ['₹', 'rs', 'inr'])
            is_followed_by_rs = False
            
            if re.search(r'[0-9]\s*(rs|₹)', text):
                has_currency_symbol = True
                is_followed_by_rs = True
            
            if not has_currency_symbol:
                for j in range(i + 1, min(len(extracted_data), i + 3)):
                    nearby_text = extracted_data[j]['text'].lower()
                    if any(s in nearby_text for s in ['₹', 'rs', 'inr']):
                        nearby_bbox = extracted_data[j]['bbox']
                        nearby_y_center = sum([p[1] for p in nearby_bbox]) / 4
                        nearby_x_center = sum([p[0] for p in nearby_bbox]) / 4
                        if abs(y_center - nearby_y_center) < height * 1.0 and nearby_x_center > x_center:
                            has_currency_symbol = True
                            if 'rs' in nearby_text:
                                is_followed_by_rs = True
                            break

            text_for_num = text.replace(',', '')
            text_for_num = re.sub(r'^(?:2|z|s|a|rs|₹)\s+', '', text_for_num, flags=re.IGNORECASE)
            text_for_num = re.sub(r'\s+(?:2|z|s|a|rs|₹)$', '', text_for_num, flags=re.IGNORECASE)
            
            num_matches = re.findall(r'([0-9]+(?:\.[0-9]{1,2})?)', text_for_num)
            
            if num_matches:
                try:
                    val_str = max(num_matches, key=len)
                    
                    # Strip leading '2' when it is a misread ₹ symbol (e.g. OCR reads ₹500 as 2500)
                    if val_str.startswith('2') and len(val_str) > 1:
                        val_str = val_str[1:]
                        
                    val = float(val_str)
                    if val <= 0: continue
                    
                    score = (height ** 4) 
                    
                    if has_currency_symbol: 
                        score *= 20
                    
                    if is_followed_by_rs:
                        score *= 5
                    
                    dist_from_horiz_center = abs(x_center - (img_width / 2))
                    centeredness_multiplier = max(0.1, 1 - (dist_from_horiz_center / (img_width / 2)))
                    score *= centeredness_multiplier
                    
                    if (0.15 * img_height) < y_center < (0.5 * img_height):
                        score *= 5
                    elif y_center > (0.7 * img_height):
                        score *= 0.01

                    candidates.append({
                        'value': val,
                        'bbox': bbox,
                        'score': score,
                        'height': height,
                        'center': (x_center, y_center)
                    })
                except: pass

        if not candidates:
            return None, None

        candidates.sort(key=lambda x: x['score'], reverse=True)
        best = candidates[0]
        
        final_bbox = best['bbox']
        for item in extracted_data:
            item_text_lower = item['text'].lower()
            if any(s in item_text_lower for s in ['₹', 'rs']) and item_text_lower not in str(best['value']):
                bbox = item['bbox']
                y_dist = abs(sum([p[1] for p in bbox])/4 - best['center'][1])
                x_dist = abs(sum([p[0] for p in bbox])/4 - best['center'][0])
                if y_dist < best['height'] and x_dist < best['height'] * 4:
                    x1 = min(final_bbox[0][0], bbox[0][0])
                    y1 = min(final_bbox[0][1], bbox[0][1])
                    x2 = max(final_bbox[2][0], bbox[2][0])
                    y2 = max(final_bbox[2][1], bbox[2][1])
                    final_bbox = [[x1, y1], [x2, y1], [x2, y2], [x1, y2]]
                    break

        return best['value'], final_bbox

    def _spatial_extract_transaction_id(self, extracted_data):
        """Extract transaction ID based on proximity to UPI/UTR labels"""
        labels = ['upi transaction id', 'transaction id', 'utr', 'ref id']
        
        # First pass: look for label then 12-digit UTR immediately after
        for i, item in enumerate(extracted_data):
            text_lower = item['text'].lower()
            if 'upi transaction id' in text_lower or 'utr' in text_lower:
                for j in range(i + 1, min(i + 3, len(extracted_data))):
                    next_text = extracted_data[j]['text'].replace(' ', '')
                    if re.match(r'^[0-9]{12}$', next_text):
                        return next_text, extracted_data[j]['bbox']
        
        # Second pass: general label matching
        for i, item in enumerate(extracted_data):
            text_lower = item['text'].lower()
            found_label = any(label in text_lower for label in labels)
            
            if found_label:
                id_match = re.search(r'\b([0-9]{12})\b', item['text'].replace(' ', ''))
                if id_match:
                    return id_match.group(1), item['bbox']
                
                for j in range(i + 1, min(i + 3, len(extracted_data))):
                    next_text = extracted_data[j]['text'].replace(' ', '')
                    if re.match(r'^[0-9]{12}$', next_text):
                        return next_text, extracted_data[j]['bbox']
        
        return None, None

    def _extract_payee_name(self, text):
        """Extract payee name from text"""
        patterns = [
            r'(?:To|Paid to|Sent to|Payment to|UPI to|Paying)\s+([A-Za-z0-9&.\s]{2,50})(?:\s+Rs|\s+Amount|\s+[0-9]|\s*\n|$)',
            r'(?:Beneficiary|Recipient|Name)[\s:]+([A-Za-z0-9&.\s]{2,50})',
            r'(?:towards|for)\s+([A-Za-z0-9&.\s]{2,30})',
        ]
        
        for pattern in patterns:
            match = re.search(pattern, text, re.IGNORECASE)
            if match:
                name = match.group(1).strip()
                name = re.sub(r'\s+', ' ', name)
                if len(name) >= 2:
                    return name
        
        return None
    
    def _extract_amount(self, text):
        """Extract amount from text, handling common OCR misreads of currency symbols"""
        text_clean = text.replace(',', '')
        
        text_clean = re.sub(r'\b(?:2|z|s|a)\s+([0-9])', r'\1', text_clean, flags=re.IGNORECASE)
        text_clean = re.sub(r'([0-9])\s+(?:2|z|s|a)\b', r'\1', text_clean, flags=re.IGNORECASE)
        
        patterns = [
            r'₹\s*([0-9]+(?:\.[0-9]{1,2})?)',
            r'Rs\.?\s*([0-9]+(?:\.[0-9]{1,2})?)',
            r'INR\s*([0-9]+(?:\.[0-9]{1,2})?)',
            r'([0-9]+(?:\.[0-9]{1,2})?)\s*(?:Rupees|INR|Rs\.?|₹)',
            r'(?:Amount|Paid|Sending|Total)[:\s]*[₹Rs\.]*\s*([0-9]+(?:\.[0-9]{2})?)',
            r'(?:Amount|Paid|Sending|Total)[:\s]*[₹Rs\.]*\s*([0-9]+(?:\.[0-9]{1,2})?)',
            r'(?:^|\s)([0-9]+\.[0-9]{2})(?:\s|$)', 
        ]
        
        candidates = []
        for pattern in patterns:
            matches = re.findall(pattern, text_clean, re.IGNORECASE)
            for amount_str in matches:
                try:
                    # Strip leading '2' when it is a misread ₹ symbol
                    if amount_str.startswith('2') and len(amount_str) > 1:
                        amount_str = amount_str[1:]
                        
                    amount = float(amount_str)
                    if 1 <= amount < 500000:
                        candidates.append(amount)
                except ValueError:
                    continue
        
        if candidates:
            return max(candidates)
        
        generic_match = re.search(r'(?<![0-9])([0-9,]{1,8}\.[0-9]{2})(?![0-9])', text)
        if generic_match:
            try:
                return float(generic_match.group(1).replace(',', ''))
            except ValueError:
                pass

        return None
    
    def _extract_transaction_id(self, text):
        """Extract UPI transaction ID / UTR, prioritising 12-digit numeric UTR"""
        text_no_space = text.replace(' ', '')
        
        # 12-digit numeric UTR is the standard UPI transaction identifier
        utr_match = re.search(r'\b([0-9]{12})\b', text_no_space)
        if utr_match:
            return utr_match.group(1)
            
        patterns = [
            r'(?:UPI\s*Transaction\s*ID|UTR|Ref\s*ID)[:\s]*([0-9]{12})',
            r'(?:TransactionID|TransID|TXNID|ID)[:\s]*([A-Z0-9_]{8,25})',
            r'\b(T[0-9]{18,25})\b',
            r'\b([0-9]{12})\b',
            r'\b(CIC[A-Z0-9_]{15,30})\b',
            r'\b([A-Z0-9_]{16,35})\b',
        ]
        
        for txt in [text, text_no_space]:
            for pattern in patterns:
                matches = re.findall(pattern, txt, re.IGNORECASE)
                for match in matches:
                    txn_id = str(match).strip()
                    if len(txn_id) >= 8:
                        return txn_id
        
        return None
    
    def _extract_payment_method(self, text):
        """Extract payment method from text"""
        text_lower = text.lower()
        
        if 'gpay' in text_lower or 'google pay' in text_lower:
            return 'Google Pay'
        elif 'phonepe' in text_lower or 'phone pe' in text_lower:
            return 'PhonePe'
        elif 'paytm' in text_lower:
            return 'Paytm'
        elif 'upi' in text_lower:
            return 'UPI'
        elif 'bhim' in text_lower:
            return 'BHIM'
        
        return 'UPI'
    
    def _extract_date(self, text):
        """Extract date from text"""
        patterns = [
            r'(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})',
            r'(\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{2,4})',
        ]
        
        for pattern in patterns:
            match = re.search(pattern, text, re.IGNORECASE)
            if match:
                return match.group(1)
        
        return None
    
    def _calculate_average_confidence(self, extracted_data):
        """Calculate average OCR confidence score"""
        if not extracted_data:
            return 0.0
        
        total_confidence = sum([item['confidence'] for item in extracted_data])
        return total_confidence / len(extracted_data)
    
    def validate_extraction(self, donation_info):
        """Validate extracted donation information"""
        errors = []
        
        if not donation_info.get('amount'):
            errors.append('Amount not found')
        elif donation_info['amount'] <= 0:
            errors.append('Invalid amount')
        
        if not donation_info.get('transaction_id'):
            errors.append('Transaction ID not found')
        elif len(donation_info['transaction_id']) < 8:
            errors.append('Transaction ID too short')
        
        if donation_info.get('confidence', 0) < self.confidence_threshold:
            errors.append(f'Low confidence score: {donation_info["confidence"]:.2f}')
        
        return {
            'valid': len(errors) == 0,
            'errors': errors
        }
