import hre, { ethers } from 'hardhat';
import FundVaultImplementationModule from '../ignition/modules/FundVaultImplementation';
import KycManagerModule from '../ignition/modules/KycManager';
import Deploy from '../ignition/modules/SubVault_Proxy';
import USDC from '../ignition/modules/deploy';
import { Create3Factory } from '../typechain-types';

async function main() {
    const network = hre.network.name || 'localhost';
    const shouldDeployUSDC = process.env.DEPLOY_USDC === 'true';
    const shouldDeployKycManager = process.env.DEPLOY_KYC_MANAGER !== 'false';
    const create3FactoryAddress = process.env.CREATE3 || false;

    if (!create3FactoryAddress) {
        throw new Error('Create3 Factory address not found');
    }

    const [deployer] = await ethers.getSigners();
    console.log('Deploying contracts with account:', await deployer.getAddress());

    let usdcAddress: string;
    if (shouldDeployUSDC) {
        const { usdc } = await hre.ignition.deploy(USDC);
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

    //Prepare parameters
    const salt = hre.ethers.id('TransparentUpgradeableProxy');

    const create3 = await ethers.getContractFactory('Create3Factory')
    const create3Contract = create3.attach(create3FactoryAddress) as Create3Factory;

    const TransparentUpgradeableProxyFactory = await ethers.getContractFactory('TransparentUpgradeableProxy');

    const initializeData = implementation.interface.encodeFunctionData(
        'initialize',
        [
            process.env.OPERATOR_ADDRESS,
            process.env.CUSTODIAN_ADDRESS,
            kycManagerAddress
        ]
    );

    // Encode proxy constructor arguments
    const proxyConstructorArgs = TransparentUpgradeableProxyFactory.interface.encodeDeploy([
        implementationAddress,
        await deployer.getAddress(),
        initializeData
    ]);

    // Combine proxy bytecode and constructor arguments
    const fullBytecode = hre.ethers.concat([
        TransparentUpgradeableProxyFactory.bytecode,
        proxyConstructorArgs
    ]);

    //Generate deterministic address
    const deterministic_address = await create3Contract.addressOf(salt);

    //Print the deterministic address
    console.log('Deterministic Address:'.padEnd(50), ':', deterministic_address);
    await hre.ignition.deploy(Deploy, {
        parameters: {
            Deploy: {
                create3Factory: create3FactoryAddress,
                bytecode: fullBytecode,
                salt: salt
            }
        }
    });

    //Print the address where the contract was deployed
    console.log('Proxy Deployed at'.padEnd(50), ':', deterministic_address);

    if (network !== 'localhost') {
        console.log('Verifying contracts...');
        try {

            await hre.run('verify:verify', {
                address: usdcAddress,
                contract: 'contracts/mocks/USDC.sol:USDC'
            });

            await hre.run('verify:verify', {
                address: implementationAddress,
                contract: 'contracts/v3/FundVaultV3Upgradeable.sol:FundVaultV3Upgradeable'
            });

            await hre.run('verify:verify', {
                address: deterministic_address,
                contract: '@openzeppelin/contracts/proxy/transparent/TransparentUpgradeableProxy.sol:TransparentUpgradeableProxy',
                constructorArguments: [implementationAddress, await deployer.getAddress(), initializeData]
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