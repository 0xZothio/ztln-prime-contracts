import '@nomicfoundation/hardhat-ignition-ethers';
import '@nomicfoundation/hardhat-ledger';
import '@nomicfoundation/hardhat-toolbox';
import "@openzeppelin/hardhat-upgrades";
import dotenv from 'dotenv';
import { HardhatUserConfig } from 'hardhat/config';

dotenv.config()

const DEPLOYER_ACCOUNT_PRIV_KEY = process.env.DEPLOYER_ACCOUNT_PRIV_KEY
const ACCOUNTS = [DEPLOYER_ACCOUNT_PRIV_KEY].filter(Boolean) as string[]

const config: HardhatUserConfig = {
    networks: {
        hardhat: {
            allowUnlimitedContractSize: true
        },
        amoy: {
            chainId: 80002,
            url: 'https://rpc-amoy.polygon.technology',
            accounts: ACCOUNTS
            // ledgerAccounts: ["0xBe7d07991a4A822394Edc8407fd3Ccb778571d5a"],
        },
        holesky: {
            chainId: 17000,
            url: 'https://eth-holesky.g.alchemy.com/v2/z1jEN8yjucjwTJ-vvd9TdFHJZ8xsMI-r',
            accounts: ACCOUNTS
            // ledgerAccounts: ["0xBe7d07991a4A822394Edc8407fd3Ccb778571d5a"],
        }
    },
    etherscan: {
        apiKey: {
            polygon: '1YR53MFG3TS5G4A3ZYP9J6HG1HA3MIWIVJ',
            amoy: '1YR53MFG3TS5G4A3ZYP9J6HG1HA3MIWIVJ',
            ethereum: 'D3UBHD22H5Q2131K6VQTPK2M2KNE159WVS',
            holesky: 'DZJG6IGSMPEM32PXWJ99AITXD6W98NRFZ1'
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
        version: "0.8.27",
        settings: {
            optimizer: {
                enabled: true,
                runs: 200,
            },
            viaIR: true,
            // This is important for large contracts
            metadata: {
                bytecodeHash: "none",
            },
        },
    },
}

export default config
