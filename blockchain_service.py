from web3 import Web3
from eth_account import Account
import json
import os
from datetime import datetime

class BlockchainService:
    """Service for interacting with Polygon Amoy/Mumbai Testnet blockchain
    Stores ONLY donation hashes for privacy - no personal data on-chain
    """
    
    def __init__(self, config):
        self.config = config
        self.network = config.get('ETHEREUM_NETWORK', 'amoy')
        
        # Determine provider URL based on network
        if self.network in ['localhost', 'hardhat']:
            self.provider_url = "http://127.0.0.1:8545"
        elif self.network == 'sepolia':
            self.provider_url = f"https://sepolia.infura.io/v3/{config.get('INFURA_PROJECT_ID')}"
        elif self.network == 'amoy':
            # Use Polygon Amoy Testnet RPC (Mumbai replacement)
            self.provider_url = self._get_amoy_rpc_url(config)
        elif self.network == 'mumbai':
            # Use Polygon Mumbai RPC (deprecated, for backward compatibility only)
            self.provider_url = self._get_mumbai_rpc_url(config)
        else:
            # Default to Amoy for unknown networks
            self.network = 'amoy'
            self.provider_url = self._get_amoy_rpc_url(config)
        
        # Initialize Web3
        self.w3 = Web3(Web3.HTTPProvider(self.provider_url))
        
        # Load account from private key
        self.private_key = config.get('PRIVATE_KEY')
        self.account = None

        if self.private_key:
            try:
                self.account = Account.from_key(self.private_key)
            except Exception as exc:
                print(f"Warning: Unable to load provided private key: {exc}")
                self.account = None
                self.private_key = None

        # For local testing, use Hardhat default account
        if self.account is None and self.network in ['localhost', 'hardhat']:
            try:
                default_private_key = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
                self.account = Account.from_key(default_private_key)
                self.private_key = default_private_key
                print(f"Using Hardhat default account: {self.account.address}")
            except Exception as exc:
                print(f"Warning: Could not load Hardhat default account: {exc}")
        
        # Contract ABI (will be loaded from file)
        self.contract_abi = self._load_contract_abi()
        
        # Contract instance
        contract_address = config.get('CONTRACT_ADDRESS')
        if contract_address and self.contract_abi:
            try:
                checksum_address = Web3.to_checksum_address(contract_address)
                self.contract = self.w3.eth.contract(
                    address=checksum_address,
                    abi=self.contract_abi
                )
                self.contract_address = checksum_address
            except ValueError as exc:
                print(f"Warning: Invalid contract address '{contract_address}': {exc}")
                self.contract = None
                self.contract_address = None
        else:
            self.contract = None
            self.contract_address = None
    
    def _load_contract_abi(self):
        """Load contract ABI from file"""
        abi_path = os.path.join(os.path.dirname(__file__), 'contracts', 'DonationRegistry.json')
        try:
            with open(abi_path, 'r') as f:
                contract_data = json.load(f)
                return contract_data.get('abi', [])
        except FileNotFoundError:
            print(f"Warning: Contract ABI not found at {abi_path}")
            return []
    
    def _get_mumbai_rpc_url(self, config):
        """Get Mumbai RPC URL with fallback options"""
        # Try custom MUMBAI_RPC_URL first
        if config.get('MUMBAI_RPC_URL'):
            return config.get('MUMBAI_RPC_URL')
        
        # Try Infura with project ID
        infura_id = config.get('INFURA_PROJECT_ID')
        if infura_id:
            return f"https://polygon-mumbai.infura.io/v3/{infura_id}"
        
        # Multiple public RPC endpoints (prioritized)
        mumbai_rpc_endpoints = [
            "https://rpc-mumbai.maticvigil.com",
            "https://polygon-mumbai-bor.publicnode.com",
            "https://mumbai-rpc.allthatnode.com:8545",
            "https://polygon-mumbai.blockpi.network/v1/rpc/public",
            "https://1rpc.io/polygon-mumbai"
        ]
        
        # Try to connect to each endpoint
        for rpc_url in mumbai_rpc_endpoints:
            try:
                test_w3 = Web3(Web3.HTTPProvider(rpc_url, request_kwargs={"timeout": 10}))
                if test_w3.is_connected():
                    print(f"✓ Connected to Mumbai via: {rpc_url}")
                    return rpc_url
            except Exception as e:
                print(f"✗ Failed to connect to {rpc_url}: {e}")
        
        # Default fallback
        print(f"⚠ Using default Mumbai RPC: {mumbai_rpc_endpoints[0]}")
        return mumbai_rpc_endpoints[0]
    
    def _get_amoy_rpc_url(self, config):
        """Get Amoy RPC URL"""
        # Try custom AMOY_RPC_URL first
        if config.get('AMOY_RPC_URL'):
            return config.get('AMOY_RPC_URL')
        
        # Default Amoy RPC endpoint
        return "https://rpc.ankr.com/polygon_amoy"
    
    def is_connected(self):
        """Check if connected to configured blockchain network"""
        try:
            return self.w3.is_connected()
        except Exception as e:
            print(f"Connection error: {e}")
            return False
    
    def get_balance(self, address=None):
        """Get MATIC balance of an address"""
        if address is None and self.account:
            address = self.account.address
        
        if address:
            try:
                balance_wei = self.w3.eth.get_balance(address)
                return self.w3.from_wei(balance_wei, 'ether')
            except Exception as e:
                print(f"Error getting balance: {e}")
                return 0
        return 0
    
    def record_donation(self, donation_hash, amount, transaction_id, status="PENDING"):
        """Record donation hash on blockchain (hash-only, no personal data)
        
        Args:
            donation_hash: SHA-256 hash of donor data (off-chain)
            amount: Donation amount (for reference only, not stored on-chain)
            transaction_id: Payment transaction ID (for reference only)
            status: Initial status (PENDING/VERIFIED/REJECTED)
        
        Returns:
            dict with success status and tx_hash
        """
        if not self.contract or not self.account:
            return {
                'success': False,
                'error': 'Blockchain not properly configured'
            }
        
        try:
            # Convert donation_hash string to bytes32
            if isinstance(donation_hash, str):
                # Ensure it's a valid hex hash
                if donation_hash.startswith('0x'):
                    hash_bytes = bytes.fromhex(donation_hash[2:])
                else:
                    hash_bytes = bytes.fromhex(donation_hash)
            else:
                hash_bytes = donation_hash
            
            # Ensure it's 32 bytes
            if len(hash_bytes) != 32:
                return {
                    'success': False,
                    'error': f'Invalid hash length: expected 32 bytes, got {len(hash_bytes)}'
                }
            
            # Prepare transaction
            nonce = self.w3.eth.get_transaction_count(self.account.address)
            
            # Build transaction to add donation (hash-only)
            transaction = self.contract.functions.addDonation(
                hash_bytes
            ).build_transaction({
                'from': self.account.address,
                'nonce': nonce,
                'gas': 200000,
                'gasPrice': self.w3.eth.gas_price
            })
            
            # Sign transaction
            if not self.private_key:
                raise Exception("Missing private key for signing blockchain transaction")
            
            signed_txn = self.w3.eth.account.sign_transaction(
                transaction,
                private_key=self.private_key
            )
            
            # Send transaction
            tx_hash = self.w3.eth.send_raw_transaction(signed_txn.rawTransaction)
            
            # Wait for transaction receipt
            tx_receipt = self.w3.eth.wait_for_transaction_receipt(tx_hash, timeout=120)
            
            # Generate Blockscout link
            blockscout_link = self._get_blockscout_link(tx_hash.hex())
            
            return {
                'success': True,
                'tx_hash': tx_hash.hex(),
                'block_number': tx_receipt['blockNumber'],
                'gas_used': tx_receipt['gasUsed'],
                'blockscout_link': blockscout_link,
                'explorer_url': blockscout_link
            }
        
        except Exception as exc:
            return {
                'success': False,
                'error': str(exc)
            }
    
    def update_donation_status(self, donation_hash, status):
        """Update donation status on blockchain (admin only)
        
        Args:
            donation_hash: The donation hash to update
            status: New status (PENDING=0, VERIFIED=1, REJECTED=2)
        
        Returns:
            dict with success status
        """
        if not self.contract or not self.account:
            return {
                'success': False,
                'error': 'Blockchain not properly configured'
            }
        
        try:
            # Convert status to numeric
            status_map = {'PENDING': 0, 'VERIFIED': 1, 'REJECTED': 2}
            status_num = status_map.get(status.upper(), 0)
            
            # Convert hash
            if isinstance(donation_hash, str):
                if donation_hash.startswith('0x'):
                    hash_bytes = bytes.fromhex(donation_hash[2:])
                else:
                    hash_bytes = bytes.fromhex(donation_hash)
            else:
                hash_bytes = donation_hash
            
            nonce = self.w3.eth.get_transaction_count(self.account.address)
            
            transaction = self.contract.functions.updateStatus(
                hash_bytes,
                status_num
            ).build_transaction({
                'from': self.account.address,
                'nonce': nonce,
                'gas': 200000,
                'gasPrice': self.w3.eth.gas_price
            })
            
            signed_txn = self.w3.eth.account.sign_transaction(
                transaction,
                private_key=self.private_key
            )
            
            tx_hash = self.w3.eth.send_raw_transaction(signed_txn.rawTransaction)
            tx_receipt = self.w3.eth.wait_for_transaction_receipt(tx_hash, timeout=120)
            
            return {
                'success': True,
                'tx_hash': tx_hash.hex(),
                'block_number': tx_receipt['blockNumber'],
                'blockscout_link': self._get_blockscout_link(tx_hash.hex())
            }
        
        except Exception as exc:
            return {
                'success': False,
                'error': str(exc)
            }
    
    def verify_donation(self, donation_hash):
        """Verify donation on blockchain by hash
        
        Args:
            donation_hash: The donation hash to verify
        
        Returns:
            dict with verification status
        """
        if not self.w3.is_connected():
            return {
                'verified': False,
                'reason': 'not_connected',
                'details': f'Unable to connect to {self.network} network'
            }

        if not donation_hash:
            return {
                'verified': False,
                'reason': 'invalid_input',
                'details': 'Missing donation hash'
            }

        try:
            # Convert hash
            if isinstance(donation_hash, str):
                if donation_hash.startswith('0x'):
                    hash_bytes = bytes.fromhex(donation_hash[2:])
                else:
                    hash_bytes = bytes.fromhex(donation_hash)
            else:
                hash_bytes = donation_hash
            
            # Query contract
            exists, status = self.contract.functions.verifyDonation(hash_bytes).call()
            
            return {
                'verified': exists,
                'status': status,
                'hash': donation_hash,
                'reason': 'record_found' if exists else 'record_not_found'
            }
        
        except Exception as exc:
            print(f"Error verifying donation: {exc}")
            return {
                'verified': False,
                'reason': 'contract_error',
                'details': str(exc)
            }
    
    def get_donation_details(self, donation_hash):
        """Get donation details from blockchain (hash-only data)
        
        Args:
            donation_hash: The hash to query
        
        Returns:
            dict with hash, timestamp, and status
        """
        if not self.contract:
            return None
        
        try:
            if isinstance(donation_hash, str):
                if donation_hash.startswith('0x'):
                    hash_bytes = bytes.fromhex(donation_hash[2:])
                else:
                    hash_bytes = bytes.fromhex(donation_hash)
            else:
                hash_bytes = donation_hash
            
            hash_result, timestamp, status = self.contract.functions.getDonation(hash_bytes).call()
            
            return {
                'donation_hash': hash_result.hex(),
                'timestamp': timestamp,
                'status': status,
                'block_timestamp': datetime.fromtimestamp(timestamp).isoformat()
            }
        except Exception as e:
            print(f"Error getting donation details: {e}")
            return None
    
    def get_total_donations(self):
        """Get total donations recorded on blockchain"""
        if not self.contract:
            return 0
        
        try:
            return self.contract.functions.getTotalDonations().call()
        except Exception as e:
            print(f"Error getting total donations: {e}")
            return 0
    
    def _get_blockscout_link(self, tx_hash):
        """Generate Blockscout/PolygonScan link based on network"""
        if self.network == 'amoy':
            return f"https://amoy.polygonscan.com/tx/{tx_hash}"
        elif self.network == 'mumbai':
            return f"https://mumbai.polygonscan.com/tx/{tx_hash}"
        elif self.network == 'polygon':
            return f"https://polygonscan.com/tx/{tx_hash}"
        elif self.network == 'sepolia':
            return f"https://sepolia.etherscan.io/tx/{tx_hash}"
        else:
            return f"https://etherscan.io/tx/{tx_hash}"
    
    def estimate_gas_cost(self):
        """Estimate gas cost for recording a donation on Polygon Amoy testnet"""
        if not self.w3.is_connected():
            return None
        
        try:
            gas_price = self.w3.eth.gas_price
            estimated_gas = 200000  # Estimated gas for addDonation
            cost_wei = gas_price * estimated_gas
            cost_matic = self.w3.from_wei(cost_wei, 'ether')
            
            network_name = 'Polygon Amoy Testnet' if self.network == 'amoy' else 'Polygon Mumbai Testnet'
            
            return {
                'gas_price_gwei': self.w3.from_wei(gas_price, 'gwei'),
                'estimated_gas': estimated_gas,
                'cost_matic': float(cost_matic),
                'cost_wei': cost_wei,
                'network': network_name,
                'note': 'Uses test MATIC tokens'
            }
        except Exception as e:
            print(f"Error estimating gas: {e}")
            return None
    
    def get_network_info(self):
        """Get information about connected network"""
        try:
            if not self.is_connected():
                return {'connected': False, 'network': self.network}
            
            chain_id = self.w3.eth.chain_id
            latest_block = self.w3.eth.get_block('latest')
            
            return {
                'connected': True,
                'network': self.network,
                'chain_id': chain_id,
                'latest_block': latest_block['number'],
                'timestamp': latest_block['timestamp'],
                'contract_address': self.contract_address,
                'provider_url': self.provider_url,
                'account_address': self.account.address if self.account else None
            }
        except Exception as e:
            return {
                'connected': False,
                'network': self.network,
                'error': str(e)
            }
