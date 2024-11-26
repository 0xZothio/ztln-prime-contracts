import hre, { ethers } from 'hardhat'

import USDC from '../ignition/modules/deploy'
import FundVaultImplementationModule from '../ignition/modules/FundVaultImplementation'
import KycManagerProxyModule from '../ignition/modules/KycManagerProxy'

interface DeployedContracts {
    usdc?: string
    kycManagerImplementation?: string
    kycManagerProxy?: string
    fundVaultImplementation?: string
    fundVaultProxy?: string
}

async function validateEnvironment() {
    const missingVars = ['OPERATOR_ADDRESS', 'CUSTODIAN_ADDRESS'].filter(v => !process.env[v])
    if (missingVars.length) {
        throw new Error(`Missing required environment variables: ${missingVars.join(', ')}`)
    }
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

async function main() {
    // Initial setup and validation
    await validateEnvironment()

    const network = hre.network.name || 'localhost'
    const shouldDeployUSDC = process.env.DEPLOY_USDC === 'true'
    const shouldDeployKycManager = process.env.DEPLOY_KYC_MANAGER !== 'false'

    const [deployer] = await ethers.getSigners()
    console.log('Deploying contracts with account:', await deployer.getAddress())
    console.log(
        'Account balance:',
        (await deployer.provider.getBalance(deployer.address)).toString()
    )

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

        // Deploy KYC Manager
        let kycManagerAddress: string
        if (shouldDeployKycManager) {
            console.log('\nDeploying KYC Manager...')
            const kycDeployment = await hre.ignition.deploy(KycManagerProxyModule)

            deployedContracts.kycManagerImplementation =
                await kycDeployment.implementation.getAddress()
            deployedContracts.kycManagerProxy = await kycDeployment.proxy.getAddress()
            kycManagerAddress = deployedContracts.kycManagerProxy

            console.log(
                'KycManager Implementation deployed to:',
                deployedContracts.kycManagerImplementation
            )
            console.log('KycManager Proxy deployed to:', deployedContracts.kycManagerProxy)
        } else {
            if (!process.env.KYC_MANAGER_ADDRESS) {
                throw new Error('KYC_MANAGER_ADDRESS not set in environment')
            }
            kycManagerAddress = process.env.KYC_MANAGER_ADDRESS
            console.log('Using existing KycManager at:', kycManagerAddress)
        }

        // Deploy FundVault
        console.log('\nDeploying FundVault...')
        const fundVaultDeployment = await hre.ignition.deploy(FundVaultImplementationModule, {
            parameters: {
                FundVaultImplementation: {
                    operatorAddress: process.env.OPERATOR_ADDRESS!,
                    custodianAddress: process.env.CUSTODIAN_ADDRESS!,
                    kycManagerAddress: kycManagerAddress
                }
            }
        })

        deployedContracts.fundVaultImplementation =
            await fundVaultDeployment.implementation.getAddress()
        deployedContracts.fundVaultProxy = await fundVaultDeployment.proxy.getAddress()

        console.log(
            'FundVault Implementation deployed to:',
            deployedContracts.fundVaultImplementation
        )
        console.log('FundVault Proxy deployed to:', deployedContracts.fundVaultProxy)

        // Verify contracts if not on localhost
        if (network !== 'localhost') {
            console.log('\nVerifying contracts...')

            if (shouldDeployUSDC && deployedContracts.usdc) {
                await verifyContract(deployedContracts.usdc, 'contracts/mocks/USDC.sol:USDC')
            }

            if (shouldDeployKycManager && deployedContracts.kycManagerImplementation) {
                await verifyContract(
                    deployedContracts.kycManagerImplementation,
                    'contracts/KycManagerUpgradeable.sol:KycManagerUpgradeable'
                )
            }

            if (deployedContracts.kycManagerProxy) {
                await verifyContract(
                    deployedContracts.kycManagerProxy,
                    '@openzeppelin/contracts/proxy/transparent/TransparentUpgradeableProxy.sol:TransparentUpgradeableProxy',
                    [
                        deployedContracts.kycManagerImplementation,
                        await deployer.getAddress()
                        // initData is handled by the proxy deployment
                    ]
                )
            }

            if (deployedContracts.fundVaultImplementation) {
                await verifyContract(
                    deployedContracts.fundVaultImplementation,
                    'contracts/v3/FundVaultV3Upgradeable.sol:FundVaultV3Upgradeable'
                )
            }

            if (deployedContracts.fundVaultProxy) {
                await verifyContract(
                    deployedContracts.fundVaultProxy,
                    '@openzeppelin/contracts/proxy/transparent/TransparentUpgradeableProxy.sol:TransparentUpgradeableProxy',
                    [
                        deployedContracts.fundVaultImplementation,
                        await deployer.getAddress()
                        // initData is handled by the proxy deployment
                    ]
                )
            }
        }

        // Log all deployed addresses
        console.log('\nDeployed Contracts Summary:')
        console.log('==========================')
        Object.entries(deployedContracts).forEach(([name, address]) => {
            if (address) {
                console.log(`${name}: ${address}`)
            }
        })
    } catch (error) {
        console.error('\nDeployment failed:', error)
        throw error
    }
}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error)
        process.exit(1)
    })
