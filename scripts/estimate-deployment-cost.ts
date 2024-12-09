import hre, { ethers } from 'hardhat';

// Typical gas usage for ERC1967 proxy deployment via Create3
const TYPICAL_PROXY_GAS = 300000; // Conservative estimate
const ETH_USD_PRICE = 3500; // Can be updated to current price

async function main() {
    const [deployer] = await ethers.getSigners()
    console.log('Estimating deployment costs for:')
    console.log('Network:', hre.network.name)
    console.log('Deployer:', await deployer.getAddress())

    // Get current gas price
    const feeData = await ethers.provider.getFeeData()
    const gasPrice = feeData.gasPrice || ethers.parseUnits('1', 'gwei')

    console.log('\nCurrent gas price:', ethers.formatUnits(gasPrice, 'gwei'), 'gwei')

    let totalGasUsed = ethers.getBigInt(0)
    let implementationGas = ethers.getBigInt(0)
    let proxyGas = ethers.getBigInt(TYPICAL_PROXY_GAS) // Using typical gas value

    try {
        // 1. Estimate Implementation Deployment
        console.log('\n1. Estimating Implementation Deployment Cost:')
        const implementationFactory = await ethers.getContractFactory('ZTLNPrime')
        const deployTx = await implementationFactory.getDeployTransaction()
        implementationGas = await ethers.provider.estimateGas(deployTx)

        const implementationCost = implementationGas * gasPrice
        console.log('Implementation deployment gas:', implementationGas.toString())
        console.log('Implementation deployment cost:', ethers.formatEther(implementationCost), 'ETH')
        console.log('Implementation cost in USD:', `$${(Number(ethers.formatEther(implementationCost)) * ETH_USD_PRICE).toFixed(2)}`)

        totalGasUsed += implementationGas

        // 2. Estimate Proxy Deployment (using typical values)
        console.log('\n2. Estimating Proxy Deployment Cost:')
        const proxyCost = proxyGas * gasPrice
        console.log('Estimated proxy deployment gas:', proxyGas.toString())
        console.log('Estimated proxy deployment cost:', ethers.formatEther(proxyCost), 'ETH')
        console.log('Proxy cost in USD:', `$${(Number(ethers.formatEther(proxyCost)) * ETH_USD_PRICE).toFixed(2)}`)

        totalGasUsed += proxyGas

        // Additional costs breakdown
        console.log('\nDeployment Cost Breakdown:')
        console.log('================================')
        console.log('1. Implementation Contract:')
        console.log('   - Gas:', implementationGas.toString())
        console.log('   - ETH:', ethers.formatEther(implementationCost))
        console.log('   - USD:', `$${(Number(ethers.formatEther(implementationCost)) * ETH_USD_PRICE).toFixed(2)}`)

        console.log('\n2. Proxy Contract via Create3:')
        console.log('   - Gas:', proxyGas.toString())
        console.log('   - ETH:', ethers.formatEther(proxyCost))
        console.log('   - USD:', `$${(Number(ethers.formatEther(proxyCost)) * ETH_USD_PRICE).toFixed(2)}`)

        // Total Cost Summary
        const totalCost = totalGasUsed * gasPrice
        console.log('\nTotal Deployment Cost Summary:')
        console.log('================================')
        console.log('Total gas needed:', totalGasUsed.toString())
        console.log('Total cost in ETH:', ethers.formatEther(totalCost))
        console.log('Total cost in USD:', `$${(Number(ethers.formatEther(totalCost)) * ETH_USD_PRICE).toFixed(2)}`)

        // Recommended buffer
        const bufferedCost = totalCost * ethers.getBigInt(12) / ethers.getBigInt(10) // 20% buffer
        console.log('\nRecommended Amounts (including 20% buffer):')
        console.log('================================')
        console.log('ETH needed with buffer:', ethers.formatEther(bufferedCost))
        console.log('USD needed with buffer:', `$${(Number(ethers.formatEther(bufferedCost)) * ETH_USD_PRICE).toFixed(2)}`)

        // Max gas price scenario
        const maxGasPrice = gasPrice * ethers.getBigInt(2) // 2x current gas price
        const maxCost = totalGasUsed * maxGasPrice
        console.log('\nWorst Case Scenario (2x gas price):')
        console.log('================================')
        console.log('Max ETH needed:', ethers.formatEther(maxCost))
        console.log('Max USD needed:', `$${(Number(ethers.formatEther(maxCost)) * ETH_USD_PRICE).toFixed(2)}`)

    } catch (error) {
        console.error('Error during estimation:', error)
        throw error
    }
}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error)
        process.exit(1)
    })