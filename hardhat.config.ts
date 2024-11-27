import '@nomicfoundation/hardhat-ignition-ethers'
import '@nomicfoundation/hardhat-ledger'
import '@nomicfoundation/hardhat-toolbox'
import dotenv from 'dotenv'
import { HardhatUserConfig } from 'hardhat/config'

dotenv.config()

const DEPLOYER_ACCOUNT_PRIV_KEY = process.env.DEPLOYER_ACCOUNT_PRIV_KEY
const ACCOUNTS = [DEPLOYER_ACCOUNT_PRIV_KEY].filter(Boolean) as string[]
const LEDGER_ACCOUNT = process.env.LEDGER_ACCOUNT as string

const config: HardhatUserConfig = {
    networks: {
        hardhat: {
            allowUnlimitedContractSize: true
        },
        amoy: {
            chainId: 80002,
            url: 'https://rpc-amoy.polygon.technology',
            accounts: ACCOUNTS,
            // ledgerAccounts: [LEDGER_ACCOUNT]
        },
        holesky: {
            chainId: 17000,
            url: 'https://ethereum-holesky-rpc.publicnode.com',
            accounts: ACCOUNTS,
            // ledgerAccounts: [LEDGER_ACCOUNT]
        }
    },
    etherscan: {
        apiKey: {
            polygon: process.env.POLYGONSCAN_API_KEY as string,
            amoy: process.env.POLYGONSCAN_API_KEY as string,
            ethereum: process.env.ETHERSCAN_API_KEY as string
        },
        customChains: [
            {
                network: 'amoy',
                chainId: 80002,
                urls: {
                    apiURL: 'https://api-amoy.polygonscan.com/api',
                    browserURL: 'https://amoy.polygonscan.com'
                }
            },
            {
                network: 'holesky',
                chainId: 17000,
                urls: {
                    apiURL: 'https://api-holesky.etherscan.io/api',
                    browserURL: 'https://holesky.etherscan.io'
                }
            }
        ]
    },
    solidity: {
        version: '0.8.27',
        settings: {
            optimizer: {
                enabled: true,
                runs: 200
            },
            viaIR: true,
            // This is important for large contracts
            metadata: {
                bytecodeHash: 'none'
            }
        }
    }
}

export default config
