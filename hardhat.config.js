require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

const INFURA_ID = process.env.INFURA_PROJECT_ID;
const MUMBAI_RPC = process.env.MUMBAI_RPC_URL || (INFURA_ID ? `https://polygon-mumbai.infura.io/v3/${INFURA_ID}` : "https://rpc-mumbai.maticvigil.com");
const AMOY_RPC = process.env.AMOY_RPC_URL || "https://rpc.ankr.com/polygon_amoy";

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.19",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200
      }
    }
  },
  
  networks: {
    // Local Hardhat Network (default)
    hardhat: {
      chainId: 31337,
      mining: {
        auto: true,
        interval: 0
      }
    },
    
    // Local Hardhat Node (for testing with persistent blockchain)
    localhost: {
      url: "http://127.0.0.1:8545",
      chainId: 31337,
      accounts: {
        mnemonic: "test test test test test test test test test test test junk"
      }
    },
    
    // Sepolia Testnet
    sepolia: {
      url: process.env.INFURA_PROJECT_ID 
        ? `https://sepolia.infura.io/v3/${process.env.INFURA_PROJECT_ID}`
        : "https://rpc.sepolia.org",
      chainId: 11155111,
      accounts: (process.env.PRIVATE_KEY && process.env.PRIVATE_KEY.length === 66) 
        ? [process.env.PRIVATE_KEY] 
        : [],
      gasPrice: "auto"
    },
    
    // Ethereum Mainnet
    mainnet: {
      url: process.env.INFURA_PROJECT_ID 
        ? `https://mainnet.infura.io/v3/${process.env.INFURA_PROJECT_ID}`
        : "https://eth.llamarpc.com",
      chainId: 1,
      accounts: (process.env.PRIVATE_KEY && process.env.PRIVATE_KEY.length === 66) 
        ? [process.env.PRIVATE_KEY] 
        : [],
      gasPrice: "auto"
    },
    
    // Polygon Mumbai Testnet (with multiple fallback RPC endpoints)
    mumbai: {
      url: MUMBAI_RPC,
      chainId: 80001,
      accounts: (process.env.PRIVATE_KEY && process.env.PRIVATE_KEY.length === 66) 
        ? [process.env.PRIVATE_KEY] 
        : [],
      gasPrice: "auto",
      timeout: 60000,
      httpHeaders: {
        "User-Agent": "Mozilla/5.0"
      }
    },
    
    // Polygon Amoy Testnet (new Mumbai replacement)
    amoy: {
      url: AMOY_RPC,
      chainId: 80002,
      accounts: (process.env.PRIVATE_KEY && process.env.PRIVATE_KEY.length === 66) 
        ? [process.env.PRIVATE_KEY] 
        : [],
      gasPrice: "auto"
    },
    
    // Polygon Mainnet
    polygon: {
      url: process.env.INFURA_PROJECT_ID 
        ? `https://polygon-mainnet.infura.io/v3/${process.env.INFURA_PROJECT_ID}`
        : "https://polygon-rpc.com",
      chainId: 137,
      accounts: (process.env.PRIVATE_KEY && process.env.PRIVATE_KEY.length === 66) 
        ? [process.env.PRIVATE_KEY] 
        : [],
      gasPrice: "auto"
    }
  },
  
  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts"
  },
  
  // Gas Reporter Configuration (optional)
  gasReporter: {
    enabled: process.env.REPORT_GAS === "true",
    currency: "USD",
    coinmarketcap: process.env.COINMARKETCAP_API_KEY || undefined
  },
  
  // Etherscan & Blockscout Verification
  etherscan: {
    apiKey: {
      mainnet: process.env.ETHERSCAN_API_KEY || "",
      sepolia: process.env.ETHERSCAN_API_KEY || "",
      polygon: process.env.POLYGONSCAN_API_KEY || "",
      polygonMumbai: process.env.POLYGONSCAN_API_KEY || "",
      polygonAmoy: process.env.POLYGONSCAN_API_KEY || ""
    },
    customChains: [
      {
        network: "mumbai",
        chainId: 80001,
        urls: {
          apiURL: "https://api-testnet.polygonscan.com/api",
          browserURL: "https://mumbai.polygonscan.com"
        }
      },
      {
        network: "amoy",
        chainId: 80002,
        urls: {
          apiURL: "https://amoy.polygonscan.com/api",
          browserURL: "https://amoy.polygonscan.com"
        }
      }
    ]
  },
  
  // Blockscout verification (alternative) - using Amoy testnet
  blockscout: {
    apiURL: "https://amoy.polygonscan.com/api"
  }
};