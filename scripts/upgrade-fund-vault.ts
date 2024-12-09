import * as hre from 'hardhat';
import { FundVaultV3Upgradeable } from '../typechain-types';

interface VaultState {
    custodian: string;
    kycManager: string;
    latestNav: bigint;
}

const IMPLEMENTATION_SLOT = "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc";
const ADMIN_SLOT = "0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103";

async function main() {
    // Setup deployer
    const [deployer] = await hre.ethers.getSigners();
    console.log('Deployer Account:'.padEnd(50), ':', await deployer.getAddress());

    // Get proxy address
    const proxyAddress = process.env.ZTLN_PRIME_ADDRESS;
    if (!proxyAddress) throw new Error('ZTLN_PRIME_ADDRESS not set in environment');
    console.log('Current Proxy Address:'.padEnd(50), ':', proxyAddress);

    // Get current implementation address
    const currentImplAddress = await hre.ethers.provider.getStorage(
        proxyAddress,
        IMPLEMENTATION_SLOT
    );
    console.log('Current Implementation Address:'.padEnd(50), ':', currentImplAddress);

    // Get ProxyAdmin address and contract
    const proxyAdminAddress = await hre.ethers.provider.getStorage(
        proxyAddress,
        ADMIN_SLOT
    );
    const formattedProxyAdminAddress = `0x${proxyAdminAddress.slice(-40)}`;
    console.log('ProxyAdmin Address:'.padEnd(50), ':', formattedProxyAdminAddress);

    // Deploy new implementation
    console.log('\nDeploying new implementation...');
    const FundVaultFactory = await hre.ethers.getContractFactory('FundVaultV3Upgradeable');
    const newImplementation = await FundVaultFactory.deploy();
    await newImplementation.waitForDeployment();
    const newImplementationAddress = await newImplementation.getAddress();
    console.log('New Implementation Address:'.padEnd(50), ':', newImplementationAddress);

    // Create a temporary signer that's not the admin
    const tempPrivateKey = "0x1234567890123456789012345678901234567890123456789012345678901234"; // Random private key
    const tempSigner = new hre.ethers.Wallet(tempPrivateKey, hre.ethers.provider);

    // Get current state before upgrade using temp signer
    const currentVault = await hre.ethers.getContractAt(
        'FundVaultV3Upgradeable',
        proxyAddress,
        tempSigner
    ) as FundVaultV3Upgradeable;

    const preUpgradeState: VaultState = {
        custodian: await currentVault._custodian(),
        kycManager: await currentVault._kycManager(),
        latestNav: await currentVault._latestNav()
    };
    console.log('\nPre-upgrade state:', preUpgradeState);

    // Check deployer has admin role
    const DEFAULT_ADMIN_ROLE = await currentVault.DEFAULT_ADMIN_ROLE();
    const hasAdminRole = await currentVault.hasRole(DEFAULT_ADMIN_ROLE, await deployer.getAddress());
    if (!hasAdminRole) {
        throw new Error('Deployer does not have DEFAULT_ADMIN_ROLE');
    }

    // Get ProxyAdmin contract and perform upgrade
    console.log('\nUpgrading implementation...');
    const proxyAdmin = await hre.ethers.getContractAt('ProxyAdmin', formattedProxyAdminAddress, deployer);
    const upgradeTx = await proxyAdmin.upgrade(proxyAddress, newImplementationAddress);
    await upgradeTx.wait();
    console.log('Upgrade transaction completed');

    // Verify state after upgrade using temp signer
    const upgradedVault = await hre.ethers.getContractAt(
        'FundVaultV3Upgradeable',
        proxyAddress,
        tempSigner
    ) as FundVaultV3Upgradeable;

    const postUpgradeState: VaultState = {
        custodian: await upgradedVault._custodian(),
        kycManager: await upgradedVault._kycManager(),
        latestNav: await upgradedVault._latestNav()
    };
    console.log('\nPost-upgrade state:', postUpgradeState);

    // Verify state preservation
    const statePreserved = Object.entries(preUpgradeState).every(([key, value]) =>
        value.toString() === postUpgradeState[key as keyof VaultState].toString()
    );

    if (!statePreserved) {
        console.error('WARNING: State variables changed during upgrade!');
        Object.entries(preUpgradeState).forEach(([key, value]) => {
            if (value.toString() !== postUpgradeState[key as keyof VaultState].toString()) {
                console.log(`${key}: ${value} -> ${postUpgradeState[key as keyof VaultState]}`);
            }
        });
        throw new Error('State variables changed during upgrade');
    }
    console.log('\nAll state variables preserved successfully!');

    // Verify new implementation
    if (hre.network.name !== 'hardhat' && hre.network.name !== 'localhost') {
        try {
            await hre.run('verify:verify', {
                address: newImplementationAddress,
                contract: 'contracts/v3/FundVaultV3Upgradeable.sol:FundVaultV3Upgradeable'
            });
            console.log('New implementation verified successfully');
        } catch (error) {
            console.error('Error verifying new implementation:', error);
        }
    }

    // Print upgrade summary
    console.log('\nUpgrade Summary:');
    console.log('================');
    console.log('Network:', hre.network.name);
    console.log('Proxy:', proxyAddress);
    console.log('Old Implementation:', currentImplAddress);
    console.log('New Implementation:', newImplementationAddress);
    console.log('ProxyAdmin:', formattedProxyAdminAddress);
    console.log('Deployer:', await deployer.getAddress());
}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error);
        process.exit(1);
    });