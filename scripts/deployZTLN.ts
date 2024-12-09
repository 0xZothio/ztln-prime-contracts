import fs from 'fs'
import hre, { ethers } from 'hardhat'
import path from 'path'

import ImplementationModule from '../ignition/modules/Implementation'
import KycManagerModule from '../ignition/modules/KycManager'

interface DeployedContracts {
    usdc?: string
    kycManager?: string
    implementation?: string
    ZTLN_Prime?: string
}

// Config interface
interface NetworkConfig {
    network: string
    chainId: number
    kycManager: string
    ZTLNImplementation: string
    ZTLNProxy: string
}

interface DeploymentConfig {
    [key: number]: NetworkConfig
}

const CREATE3_FACTORY_ABI = [
    'function create(bytes32 _salt, bytes calldata _creationCode) external returns (address)',
    'function addressOf(bytes32 _salt) external view returns (address)',
    'event ContractDeployed(address indexed deployer, bytes32 indexed salt, address indexed deployedAddress, bytes creationCode)'
]

async function validateEnvironment() {
    const missingVars = ['OPERATOR_ADDRESS', 'CUSTODIAN_ADDRESS', 'CREATE3'].filter(
        varName => !process.env[varName]
    )
    if (missingVars.length)
        throw new Error(`Missing required environment variables: ${missingVars.join(', ')}`)
}

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

async function updateDeploymentConfig(
    chainId: number,
    networkName: string,
    kycManager: string,
    implementation: string,
    proxy: string
) {
    const configPath = path.join(__dirname, '../deployment_config.ts')

    // Read the current config file
    let configContent = fs.readFileSync(configPath, 'utf8')

    // Create new config object
    const newConfig = {
        network: networkName,
        chainId: chainId,
        kycManager: kycManager,
        ZTLNImplementation: implementation,
        ZTLNProxy: proxy
    }

    // Find the existing config for this chainId
    const chainIdString = chainId.toString()
    const regex = new RegExp(`'${chainIdString}':\\s*{[^}]*}`)

    // Create the new config string
    const newConfigString = `'${chainIdString}': {
        network: '${networkName}',
        chainId: ${chainId},
        kycManager: '${kycManager}',
        ZTLNImplementation: '${implementation}',
        ZTLNProxy: '${proxy}'
    }`

    // Replace the existing config or add new one
    if (configContent.includes(`'${chainIdString}':`)) {
        configContent = configContent.replace(regex, newConfigString)
    } else {
        // Add new chain config before the last closing brace
        configContent = configContent.replace(/}(\s*)$/, `    ${newConfigString},\n}$1`)
    }

    // Write the updated config back to file
    fs.writeFileSync(configPath, configContent)
    console.log(`Updated deployment config for chain ${chainId}`)
}

async function main() {
    await validateEnvironment()

    const NETWORK = hre.network.name || 'localhost'
    const chainId = hre.network.config.chainId
    if (!chainId) {
        throw new Error('Chain ID not found in network config')
    }

    const CREATE3_FACTORY = process.env.CREATE3 as string
    const [deployer] = await ethers.getSigners()
    const deployerAddress = await deployer.getAddress()

    console.log('--------Deploying Contracts--------')
    console.log('Network:', NETWORK)
    console.log('Chain ID:', chainId)
    console.log('Create3Factory Address:', CREATE3_FACTORY)
    console.log('Deployer Address:', deployerAddress)
    console.log(
        'Deployer Account balance:',
        (await deployer.provider.getBalance(deployerAddress)).toString()
    )

    const shouldDeployKycManager = process.env.DEPLOY_KYC_MANAGER !== 'false'

    console.log('\n\n Verifying Create3Factory...')
    const create3Code = await ethers.provider.getCode(CREATE3_FACTORY)
    if (create3Code === '0x') throw new Error('Create3Factory not deployed at specified address')

    const deployedContracts: DeployedContracts = {}

    try {
        // Deploy KycManager if needed
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

        // Deploy ZTLN Implementation
        console.log('\nDeploying ZTLN Implementation...')
        const ztlnDeployment = await hre.ignition.deploy(ImplementationModule)
        deployedContracts.implementation = await ztlnDeployment.implementation.getAddress()
        console.log('ZTLNPrime Implementation deployed to:', deployedContracts.implementation)

        // Create ZTLNPrime initialization data
        const ZTLNPrimeFactory = await ethers.getContractFactory('ZTLNPrime')
        const initData = ZTLNPrimeFactory.interface.encodeFunctionData('initialize', [
            process.env.DEPLOYER_ADDRESS!,
            process.env.OPERATOR_ADDRESS!,
            process.env.CUSTODIAN_ADDRESS!,
            deployedContracts.kycManager
        ])

        // For UUPS, deploy the implementation and create ERC1967Proxy
        const ERC1967ProxyFactory = await ethers.getContractFactory('ERC1967Proxy')
        const proxyConstructorArgs = [deployedContracts.implementation, initData]
        const fullBytecode = ethers.concat([
            ERC1967ProxyFactory.bytecode,
            ERC1967ProxyFactory.interface.encodeDeploy(proxyConstructorArgs)
        ])

        // Get Create3 factory instance
        const create3Contract = new ethers.Contract(CREATE3_FACTORY, CREATE3_FACTORY_ABI, deployer)
        const salt = ethers.id('ZTLN-Prime new 121-1') //chanage to ts

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
            console.log('ZTLNPrime Proxy deployed to:', deterministicAddress)

            const deployedCode = await ethers.provider.getCode(deterministicAddress)
            if (deployedCode === '0x') {
                throw new Error('Proxy deployment verification failed')
            }
        }

        // Update deployment config
        await updateDeploymentConfig(
            chainId,
            NETWORK,
            deployedContracts.kycManager!,
            deployedContracts.implementation!,
            deployedContracts.ZTLN_Prime!
        )

        // Verify contracts if not on localhost
        if (NETWORK !== 'localhost' && NETWORK !== 'hardhat') {
            console.log('\nVerifying contracts...')

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
                    'contracts/v3/ZTLNPrime.sol:ZTLNPrime'
                )
            }

            if (deployedContracts.ZTLN_Prime) {
                await verifyContract(
                    deterministicAddress,
                    '@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol:ERC1967Proxy',
                    [deployedContracts.implementation, initData]
                )
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

        console.log('\nDeployment config has been updated successfully!')
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