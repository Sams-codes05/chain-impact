const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  console.log("🚀 Starting deployment...\n");

  // Get the contract factory
  const DonationRegistry = await hre.ethers.getContractFactory("DonationRegistry");
  
  console.log("📝 Deploying DonationRegistry contract...");
  
  // Deploy the contract
  const registry = await DonationRegistry.deploy();
  
  // Wait for deployment to finish
  await registry.waitForDeployment();
  
  const contractAddress = await registry.getAddress();
  
  console.log("✅ DonationRegistry deployed to:", contractAddress);
  console.log("🔗 Network:", hre.network.name);
  console.log("⛓️  Chain ID:", hre.network.config.chainId);
  
  // Get deployer info
  const [deployer] = await hre.ethers.getSigners();
  console.log("👤 Deployed by:", deployer.address);
  
  // Save contract address and ABI to files
  const contractsDir = path.join(__dirname, "..", "contracts");
  
  // Save contract address
  const addressData = {
    network: hre.network.name,
    chainId: hre.network.config.chainId,
    contractAddress: contractAddress,
    deployedAt: new Date().toISOString(),
    deployer: deployer.address
  };
  
  fs.writeFileSync(
    path.join(contractsDir, "contract-address.json"),
    JSON.stringify(addressData, null, 2)
  );
  
  console.log("\n📄 Contract address saved to: contracts/contract-address.json");
  
  // Save ABI
  const artifact = await hre.artifacts.readArtifact("DonationRegistry");
  fs.writeFileSync(
    path.join(contractsDir, "DonationRegistry.json"),
    JSON.stringify(artifact, null, 2)
  );
  
  console.log("📄 Contract ABI saved to: contracts/DonationRegistry.json");
  
  // Update .env file with contract address
  const envPath = path.join(__dirname, "..", ".env");
  let envContent = "";
  
  if (fs.existsSync(envPath)) {
    envContent = fs.readFileSync(envPath, "utf8");
    
    // Update or add CONTRACT_ADDRESS
    if (envContent.includes("CONTRACT_ADDRESS=")) {
      envContent = envContent.replace(
        /CONTRACT_ADDRESS=.*/,
        `CONTRACT_ADDRESS=${contractAddress}`
      );
    } else {
      envContent += `\nCONTRACT_ADDRESS=${contractAddress}\n`;
    }
    
    // Update or add ETHEREUM_NETWORK
    if (envContent.includes("ETHEREUM_NETWORK=")) {
      envContent = envContent.replace(
        /ETHEREUM_NETWORK=.*/,
        `ETHEREUM_NETWORK=${hre.network.name}`
      );
    } else {
      envContent += `ETHEREUM_NETWORK=${hre.network.name}\n`;
    }
    
    fs.writeFileSync(envPath, envContent);
    console.log("📄 .env file updated with contract address");
  }
  
  console.log("\n✨ Deployment complete!\n");
  console.log("📋 Next steps:");
  console.log("1. Update your backend config with the contract address");
  console.log("2. Start your Flask backend: python app.py");
  console.log("3. Start your React frontend: cd frontend && npm start");
  console.log("\n🎉 Happy coding!\n");
}

// Execute deployment
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ Deployment failed:", error);
    process.exit(1);
  });