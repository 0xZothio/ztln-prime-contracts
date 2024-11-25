import hre, { ethers } from 'hardhat';
import FundVaultImplementationModule from '../ignition/modules/FundVaultImplementation';
import KycManagerModule from '../ignition/modules/KycManager';
import ProxyDeploymentModule from '../ignition/modules/ProxyAdminDeployment';

async function main() {
    const network = hre.network.name || 'localhost';
    const shouldDeployUSDC = process.env.DEPLOY_USDC === 'true';
    const shouldDeployKycManager = process.env.DEPLOY_KYC_MANAGER !== 'false';

    const [deployer] = await ethers.getSigners();
    console.log('Deploying contracts with account:', await deployer.getAddress());

    let usdcAddress: string;
    if (shouldDeployUSDC) {
        const USDCFactory = await ethers.getContractFactory('USDC');
        const usdc = await USDCFactory.deploy();
        usdcAddress = await usdc.getAddress();
        console.log('USDC deployed to:', usdcAddress);
    } else {
        usdcAddress = process.env.USDC_ADDRESS!;
        console.log('Using existing USDC at:', usdcAddress);
    }

    let kycManagerAddress: string;
    if (shouldDeployKycManager) {
        const { kycManager } = await hre.ignition.deploy(KycManagerModule);
        kycManagerAddress = await kycManager.getAddress();
        console.log('KycManager deployed to:', kycManagerAddress);
    } else {
        kycManagerAddress = process.env.KYC_MANAGER_ADDRESS!;
        console.log('Using existing KycManager at:', kycManagerAddress);
    }

    const { implementation } = await hre.ignition.deploy(FundVaultImplementationModule);
    const implementationAddress = await implementation.getAddress();
    console.log('FundVault Implementation deployed to:', implementationAddress);

    const { proxyAdmin } = await hre.ignition.deploy(ProxyDeploymentModule);
    const proxyAdminAddress = await proxyAdmin.getAddress();
    console.log('ProxyAdmin deployed to:', proxyAdminAddress);

    const initData = implementation.interface.encodeFunctionData(
        'initialize',
        [
            process.env.OPERATOR_ADDRESS,
            process.env.CUSTODIAN_ADDRESS,
            kycManagerAddress
        ]
    );

    const TransparentUpgradeableProxyFactory = await ethers.getContractFactory('TransparentUpgradeableProxy');
    const proxy = await TransparentUpgradeableProxyFactory.deploy(
        implementationAddress,
        proxyAdminAddress,
        initData
    );
    const proxyAddress = await proxy.getAddress();
    console.log('Proxy deployed to:', proxyAddress);

    if (network !== 'localhost') {
        console.log('Verifying contracts...');
        try {
            await hre.run('verify:verify', {
                address: implementationAddress,
                contract: 'contracts/v3/FundVaultV3Upgradeable.sol:FundVaultV3Upgradeable'
            });

            await hre.run('verify:verify', {
                address: proxyAddress,
                contract: 'contracts/proxy/TransparentUpgradeableProxy.sol:TransparentUpgradeableProxy',
                constructorArguments: [implementationAddress, proxyAdminAddress, initData]
            });

            if (shouldDeployKycManager) {
                await hre.run('verify:verify', {
                    address: kycManagerAddress,
                    contract: 'contracts/KycManager.sol:KycManager',
                    constructorArguments: [true]
                });
            }
        } catch (error) {
            console.error('Error during contract verification:', error);
        }
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });