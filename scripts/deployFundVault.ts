import hre, { ethers } from 'hardhat'

import FundVaultImplementationModule from '../ignition/modules/FundVaultImplementation'
import KycManagerModule from '../ignition/modules/KycManager'
import USDC from '../ignition/modules/usdc'

interface DeployedContracts {
    usdc?: string
    kycManager?: string
    implementation?: string
    ZTLN_Prime?: string
}

// Create3Factory ABI
const CREATE3_FACTORY_ABI = [
    'function create(bytes32 _salt, bytes calldata _creationCode) external returns (address)',
    'function addressOf(bytes32 _salt) external view returns (address)',
    'event ContractDeployed(address indexed deployer, bytes32 indexed salt, address indexed deployedAddress, bytes creationCode)'
]

/**
 * Validates that the required environment variables are set.
 *
 * The required environment variables are:
 * - `OPERATOR_ADDRESS` - Provided by Cogito to manage the fund.
 * - `CUSTODIAN_ADDRESS` - Provided by Cogito to hold the fund's assets.
 * - `CREATE3` - The address of the Create3Factory contract.
 *
 * @throws {Error} If any of the required environment variables are missing.
 */
async function validateEnvironment() {
    const missingVars = ['OPERATOR_ADDRESS', 'CUSTODIAN_ADDRESS', 'CREATE3'].filter(
        varName => !process.env[varName]
    )
    if (missingVars.length)
        throw new Error(`Missing required environment variables: ${missingVars.join(', ')}`)
}

/**
 * Verifies a deployed smart contract on the blockchain.
 *
 * This function uses Hardhat's `verify:verify` task to verify the contract
 * on the blockchain. It logs a success message if the verification is successful,
 * and logs an error message if the verification fails.
 *
 * @param address - The address of the deployed contract.
 * @param contract - The name of the contract to verify.
 * @param constructorArguments - An optional array of arguments passed to the contract's constructor.
 *
 * @throws Will throw an error if the verification process fails.
 */
async function verifyContract(address: string, contract: string, constructorArguments: any[] = []) {
    try {
        await hre.run('verify:verify', {
            address,
            contract,
            constructorArguments
        })
        console.log(`Verified ${contract} at ${address}`)
    } catch (error) {
        console.error(`Error verifying ${contract} at ${address}:`, error)
    }
}

async function main() {
    // Validate environment variables
    await validateEnvironment()

    // Get network name
    const NETWORK = hre.network.name || 'localhost'

    // Get Create3Factory address
    const CREATE3_FACTORY = process.env.CREATE3 as string

    // Get Deployer Address
    const [deployer] = await ethers.getSigners()
    const deployerAddress = await deployer.getAddress()

    console.log('--------Deploying Contracts--------')
    console.log('Network:', NETWORK)
    console.log('Create3Factory Address:', CREATE3_FACTORY)
    console.log('Deployer Address:', deployerAddress)
    console.log(
        'Deployer Account balance:',
        (await deployer.provider.getBalance(deployerAddress)).toString()
    )

    // Check if USDC and KYC Manager should be deployed
    const shouldDeployUSDC = process.env.DEPLOY_USDC === 'true'
    const shouldDeployKycManager = process.env.DEPLOY_KYC_MANAGER !== 'false'

    // Verify Create3Factory is deployed
    console.log('\n\n Verifying Create3Factory...')
    const create3Code = await ethers.provider.getCode(CREATE3_FACTORY)

    // If Create3Factory is not deployed, throw an error
    if (create3Code === '0x') throw new Error('Create3Factory not deployed at specified address')

    const deployedContracts: DeployedContracts = {}

    try {
        // Deploy USDC if needed
        if (shouldDeployUSDC) {
            console.log('\nDeploying USDC...')
            const { usdc } = await hre.ignition.deploy(USDC)
            deployedContracts.usdc = await usdc.getAddress()
            console.log('USDC deployed to:', deployedContracts.usdc)
        } else {
            if (!process.env.USDC_ADDRESS) {
                throw new Error('USDC_ADDRESS not set in environment')
            }
            deployedContracts.usdc = process.env.USDC_ADDRESS
            console.log('Using existing USDC at:', deployedContracts.usdc)
        }

        // Deploy KycManager
        if (shouldDeployKycManager) {
            console.log('\nDeploying KYC Manager...')

            const kycDeployment = await hre.ignition.deploy(KycManagerModule)

            deployedContracts.kycManager = await kycDeployment.kyc_manager.getAddress()

            console.log('KycManager deployed to:', deployedContracts.kycManager)
        } else {
            if (!process.env.KYC_MANAGER_ADDRESS) {
                throw new Error('KYC_MANAGER_ADDRESS not set in environment')
            }
            deployedContracts.kycManager = process.env.KYC_MANAGER_ADDRESS
            console.log('Using existing KycManager at:', deployedContracts.kycManager)
        }

        // Deploy FundVault Implementation
        console.log('\nDeploying FundVault...')
        const fundVaultDeployment = await hre.ignition.deploy(FundVaultImplementationModule)
        deployedContracts.implementation = await fundVaultDeployment.implementation.getAddress()
        console.log('FundVault Implementation deployed to:', deployedContracts.implementation)

        // Create FundVault initialization data
        const FundVaultFactory = await ethers.getContractFactory('FundVaultV3Upgradeable')
        const fundVaultInitData = FundVaultFactory.interface.encodeFunctionData('initialize', [
            process.env.OPERATOR_ADDRESS!,
            process.env.CUSTODIAN_ADDRESS!,
            deployedContracts.kycManager
        ])

        // Get Create3 factory instance
        const create3Contract = new ethers.Contract(CREATE3_FACTORY, CREATE3_FACTORY_ABI, deployer)

        // Generate salt for ZTLN Prime token
        const salt = ethers.id('ZTLN-Prime 1')

        // Get TransparentUpgradeableProxy contract factory
        const TUPFactory = await ethers.getContractFactory(
            'lib/openzeppelin-contracts/contracts/proxy/transparent/TransparentUpgradeableProxy.sol:TransparentUpgradeableProxy'
        )

        // Encode proxy constructor arguments
        const proxyConstructorArgs = TUPFactory.interface.encodeDeploy([
            deployedContracts.implementation,
            deployerAddress,
            fundVaultInitData
        ])

        // Combine proxy bytecode and constructor arguments
        const fullBytecode = ethers.concat([TUPFactory.bytecode, proxyConstructorArgs])

        console.log('Getting deterministic address...')
        const deterministicAddress = await create3Contract.addressOf(salt)
        console.log('Calculated ZTLN Prime address:', deterministicAddress)

        // Check if already deployed
        const existingCode = await ethers.provider.getCode(deterministicAddress)
        if (existingCode !== '0x') {
            console.log('Contract already deployed at deterministic address')
            deployedContracts.ZTLN_Prime = deterministicAddress
        } else {
            console.log('Deploying proxy via Create3...')
            const tx = await create3Contract.create(salt, fullBytecode)
            console.log('Create3 deployment transaction sent:', tx.hash)

            const receipt = await tx.wait()
            console.log('Create3 deployment transaction confirmed')

            deployedContracts.ZTLN_Prime = deterministicAddress
            console.log('FundVault Proxy deployed to:', deterministicAddress)

            // Verify deployment
            const deployedCode = await ethers.provider.getCode(deterministicAddress)
            if (deployedCode === '0x') {
                throw new Error('Proxy deployment verification failed')
            }
        }

        // Verify contracts if not on localhost
        if (NETWORK !== 'localhost' && NETWORK !== 'hardhat') {
            console.log('\nVerifying contracts...')

            if (shouldDeployUSDC && deployedContracts.usdc) {
                await verifyContract(deployedContracts.usdc, 'contracts/mocks/USDC.sol:USDC')
            }

            if (shouldDeployKycManager && deployedContracts.kycManager) {
                await verifyContract(
                    deployedContracts.kycManager,
                    'contracts/KycManager.sol:KycManager',
                    [true]
                )
            }

            if (deployedContracts.implementation) {
                await verifyContract(
                    deployedContracts.implementation,
                    'contracts/v3/FundVaultV3Upgradeable.sol:FundVaultV3Upgradeable'
                )

                if (deployedContracts.ZTLN_Prime) {
                    await verifyContract(
                        deployedContracts.ZTLN_Prime,
                        'lib/openzeppelin-contracts/contracts/proxy/transparent/TransparentUpgradeableProxy.sol:TransparentUpgradeableProxy',
                        [deployedContracts.implementation, deployerAddress, fundVaultInitData]
                    )
                }
            }
        }

        // Log deployment summary
        console.log('\nDeployed Contracts Summary:')
        console.log('==========================')
        Object.entries(deployedContracts).forEach(([name, address]) => {
            if (address) {
                console.log(`${name}: ${address}`)
            }
        })
    } catch (error) {
        if (error instanceof Error) {
            console.error('\nDeployment failed:', error.message)
        }
        throw error
    }
}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error)
        process.exit(1)
    })
