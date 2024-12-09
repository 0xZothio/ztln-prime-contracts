

import * as hre from 'hardhat';
import { deploymentConfig } from '../deployment_config';
import { ERC1967Proxy, ZTLNPrime } from '../typechain-types';

// Updated interface for ztln state
interface ztlnState {
    custodian: string;
    kycManager: string;
}

async function main() {
    const chainId = hre.network["config"].chainId;
    if (!chainId || !deploymentConfig[chainId]) {
        throw new Error(`Config not found for chain ID ${chainId}`);
    }

    const [deployer] = await hre.ethers.getSigners();
    console.log('Deployer Account:'.padEnd(50), ':', await deployer.getAddress());

    // Get the current proxy address from deployment config
    const currentProxyAddress = deploymentConfig[chainId].ZTLNProxy;
    console.log('Current Proxy Address:'.padEnd(50), ':', currentProxyAddress);

    // Get current implementation address
    const proxy = await hre.ethers.getContractAt('ERC1967Proxy', currentProxyAddress) as ERC1967Proxy;
    const currentImplAddress = await hre.ethers.provider.getStorage(
        currentProxyAddress,
        "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc"
    );
    console.log('Current Implementation Address:'.padEnd(50), ':', currentImplAddress);

    // Deploy new implementation
    console.log('Deploying new implementation...');
    const FZTLNPrimeFactory = await hre.ethers.getContractFactory('ZTLNPrime');
    const newImplementation = await FZTLNPrimeFactory.deploy();
    await newImplementation.waitForDeployment();
    const newImplementationAddress = await newImplementation.getAddress();
    console.log('New Implementation Address:'.padEnd(50), ':', newImplementationAddress);

    // Get current state before upgrade
    const currentRouter = await hre.ethers.getContractAt('ZTLNPrime', currentProxyAddress) as ZTLNPrime;


    const preUpgradeState: ztlnState = {
        custodian: await currentRouter._custodian(),
        kycManager: await currentRouter._kycManager()
    };
    console.log('\nPre-upgrade state:');
    console.log(preUpgradeState);

    // Check if deployer has DEFAULT_ADMIN_ROLE
    const DEFAULT_ADMIN_ROLE = await currentRouter.DEFAULT_ADMIN_ROLE();
    const hasAdminRole = await currentRouter.hasRole(DEFAULT_ADMIN_ROLE, await deployer.getAddress());
    if (!hasAdminRole) {
        throw new Error('Deployer does not have DEFAULT_ADMIN_ROLE');
    }

    console.log('\nUpgrading implementation...');
    const upgradeTx = await currentRouter.upgradeToAndCall(
        newImplementationAddress,
        '0x'  // No initialization data needed for upgrade
    );
    await upgradeTx.wait();
    console.log('Upgrade transaction completed');

    // Verify state after upgrade
    const ztlnPrime = await hre.ethers.getContractAt('ZTLNPrime', currentProxyAddress) as ZTLNPrime;
    const postUpgradeState: ztlnState = {
        custodian: await ztlnPrime._custodian(),
        kycManager: await ztlnPrime._kycManager()
    };
    console.log('\nPost-upgrade state:');
    console.log(postUpgradeState);

    // Verify state preservation
    const statePreserved = (Object.keys(preUpgradeState) as Array<keyof ztlnState>).every(
        key => preUpgradeState[key].toLowerCase() === postUpgradeState[key].toLowerCase()
    );

    if (!statePreserved) {
        console.error('WARNING: State variables changed during upgrade!');
        console.log('Differences:');
        (Object.keys(preUpgradeState) as Array<keyof ztlnState>).forEach(key => {
            if (preUpgradeState[key].toLowerCase() !== postUpgradeState[key].toLowerCase()) {
                console.log(`${key}: ${preUpgradeState[key]} -> ${postUpgradeState[key]}`);
            }
        });
        throw new Error('State variables changed during upgrade');
    } else {
        console.log('\nAll state variables preserved successfully!');
    }

    // Verify new implementation
    try {
        await hre.run('verify:verify', {
            address: newImplementationAddress,
            contract: 'contracts/v3/ZTLNPrime.sol:ZTLNPrime'
        });
        console.log('New implementation verified successfully');
    } catch (error) {
        console.error('Error verifying new implementation:', error);
    }
}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error);
        process.exit(1);
    });


