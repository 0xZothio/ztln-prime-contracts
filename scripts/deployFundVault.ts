import hre, { ethers } from 'hardhat';
import FundVaultImplementationModule from '../ignition/modules/FundVaultImplementation';
import KycManagerModule from '../ignition/modules/KycManager';
import USDC from '../ignition/modules/deploy';

interface DeployedContracts {
    usdc?: string;
    kycManagerImplementation?: string;
    kycManagerProxy?: string;
    fundVaultImplementation?: string;
    fundVaultProxy?: string;
}

// Create3Factory ABI
const CREATE3_FACTORY_ABI = [
    "function create(bytes32 _salt, bytes calldata _creationCode) external returns (address)",
    "function addressOf(bytes32 _salt) external view returns (address)",
    "event ContractDeployed(address indexed deployer, bytes32 indexed salt, address indexed deployedAddress, bytes creationCode)"
];

async function validateEnvironment() {
    const requiredVars = [
        'OPERATOR_ADDRESS',
        'CUSTODIAN_ADDRESS',
        'CREATE3'
    ];
    const missingVars = requiredVars.filter(varName => !process.env[varName]);

    if (missingVars.length > 0) {
        throw new Error(`Missing required environment variables: ${missingVars.join(', ')}`);
    }
}

async function verifyContract(
    address: string,
    contract: string,
    constructorArguments: any[] = []
) {
    try {
        await hre.run('verify:verify', {
            address,
            contract,
            constructorArguments,
        });
        console.log(`Verified ${contract} at ${address}`);
    } catch (error) {
        console.error(`Error verifying ${contract} at ${address}:`, error);
    }
}


async function main() {
    await validateEnvironment();
    console.log("name:", hre.network.name)
    const network = hre.network.name || 'localhost';
    const shouldDeployUSDC = process.env.DEPLOY_USDC === 'true';
    const shouldDeployKycManager = process.env.DEPLOY_KYC_MANAGER !== 'false';
    let create3FactoryAddress = process.env.CREATE3!;

    const [deployer] = await ethers.getSigners();
    const deployerAddress = await deployer.getAddress();
    console.log('Deploying contracts with account:', deployerAddress);
    console.log('Account balance:', (await deployer.provider.getBalance(deployerAddress)).toString());

    // Verify Create3Factory is deployed
    console.log('Verifying Create3Factory...');
    const create3Code = await ethers.provider.getCode(create3FactoryAddress);
    if (create3Code === '0x') {
        throw new Error('Create3Factory not deployed at specified address');
    }

    const deployedContracts: DeployedContracts = {};
    let kycManagerInitData: string | undefined;
    let fundVaultInitData: string | undefined;
    let kycManagerAddress: string;

    try {
        // Deploy USDC if needed
        if (shouldDeployUSDC) {
            console.log('\nDeploying USDC...');
            const { usdc } = await hre.ignition.deploy(USDC);
            deployedContracts.usdc = await usdc.getAddress();
            console.log('USDC deployed to:', deployedContracts.usdc);
        } else {
            if (!process.env.USDC_ADDRESS) {
                throw new Error('USDC_ADDRESS not set in environment');
            }
            deployedContracts.usdc = process.env.USDC_ADDRESS;
            console.log('Using existing USDC at:', deployedContracts.usdc);
        }

        // Deploy KycManager
        if (shouldDeployKycManager) {
            console.log('\nDeploying KYC Manager...');

            const kycDeployment = await hre.ignition.deploy(KycManagerModule);

            kycManagerAddress = await kycDeployment.implementation.getAddress();

            console.log('KycManager deployed to:', kycManagerAddress);
        } else {
            if (!process.env.KYC_MANAGER_ADDRESS) {
                throw new Error('KYC_MANAGER_ADDRESS not set in environment');
            }
            kycManagerAddress = process.env.KYC_MANAGER_ADDRESS;
            console.log('Using existing KycManager at:', kycManagerAddress);
        }

        // Deploy FundVault Implementation
        console.log('\nDeploying FundVault...');
        const fundVaultDeployment = await hre.ignition.deploy(FundVaultImplementationModule);
        deployedContracts.fundVaultImplementation = await fundVaultDeployment.implementation.getAddress();
        console.log('FundVault Implementation deployed to:', deployedContracts.fundVaultImplementation);

        // Create FundVault initialization data
        const FundVaultFactory = await ethers.getContractFactory("FundVaultV3Upgradeable");
        fundVaultInitData = FundVaultFactory.interface.encodeFunctionData(
            "initialize",
            [
                process.env.OPERATOR_ADDRESS!,
                process.env.CUSTODIAN_ADDRESS!,
                kycManagerAddress
            ]
        );

        // Get Create3 factory instance
        const create3Contract = new ethers.Contract(
            create3FactoryAddress,
            CREATE3_FACTORY_ABI,
            deployer
        );

        // Generate salt
        const salt = ethers.id('TransparentUpgradeableProxy');

        // Get TransparentUpgradeableProxy contract factory
        const TransparentUpgradeableProxyFactory = await ethers.getContractFactory('TransparentUpgradeableProxy');

        // Encode proxy constructor arguments
        const proxyConstructorArgs = TransparentUpgradeableProxyFactory.interface.encodeDeploy([
            deployedContracts.fundVaultImplementation,
            deployerAddress,
            fundVaultInitData
        ]);

        // Combine proxy bytecode and constructor arguments
        const fullBytecode = ethers.concat([
            TransparentUpgradeableProxyFactory.bytecode,
            proxyConstructorArgs
        ]);

        console.log('Getting deterministic address...');
        const deterministicAddress = await create3Contract.addressOf(salt);
        console.log('Calculated proxy address:', deterministicAddress);

        // Check if already deployed
        const existingCode = await ethers.provider.getCode(deterministicAddress);
        if (existingCode !== '0x') {
            console.log('Contract already deployed at deterministic address');
            deployedContracts.fundVaultProxy = deterministicAddress;
        } else {
            console.log('Deploying proxy via Create3...');
            const tx = await create3Contract.create(salt, fullBytecode);
            console.log('Create3 deployment transaction sent:', tx.hash);

            const receipt = await tx.wait();
            console.log('Create3 deployment transaction confirmed');

            deployedContracts.fundVaultProxy = deterministicAddress;
            console.log('FundVault Proxy deployed to:', deterministicAddress);

            // Verify deployment
            const deployedCode = await ethers.provider.getCode(deterministicAddress);
            if (deployedCode === '0x') {
                throw new Error('Proxy deployment verification failed');
            }
        }

        // Verify contracts if not on localhost
        if (network !== 'localhost' && network !== 'hardhat') {
            console.log('\nVerifying contracts...');

            if (shouldDeployUSDC && deployedContracts.usdc) {
                await verifyContract(
                    deployedContracts.usdc,
                    'contracts/mocks/USDC.sol:USDC'
                );
            }

            if (shouldDeployKycManager && deployedContracts.kycManagerImplementation) {
                await verifyContract(
                    deployedContracts.kycManagerImplementation,
                    'contracts/KycManagerUpgradeable.sol:KycManagerUpgradeable'
                );

                if (deployedContracts.kycManagerProxy) {
                    await verifyContract(
                        deployedContracts.kycManagerProxy,
                        '@openzeppelin/contracts/proxy/transparent/TransparentUpgradeableProxy.sol:TransparentUpgradeableProxy',
                        [
                            deployedContracts.kycManagerImplementation,
                            deployerAddress,
                            kycManagerInitData
                        ]
                    );
                }
            }

            if (deployedContracts.fundVaultImplementation) {
                await verifyContract(
                    deployedContracts.fundVaultImplementation,
                    'contracts/v3/FundVaultV3Upgradeable.sol:FundVaultV3Upgradeable'
                );

                if (deployedContracts.fundVaultProxy) {
                    await verifyContract(
                        deployedContracts.fundVaultProxy,
                        '@openzeppelin/contracts/proxy/transparent/TransparentUpgradeableProxy.sol:TransparentUpgradeableProxy',
                        [
                            deployedContracts.fundVaultImplementation,
                            deployerAddress,
                            fundVaultInitData
                        ]
                    );
                }
            }
        }

        // Log deployment summary
        console.log('\nDeployed Contracts Summary:');
        console.log('==========================');
        Object.entries(deployedContracts).forEach(([name, address]) => {
            if (address) {
                console.log(`${name}: ${address}`);
            }
        });

    } catch (error) {
        if (error instanceof Error) {
            console.error('\nDeployment failed:', error.message);
        }
        throw error;
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });