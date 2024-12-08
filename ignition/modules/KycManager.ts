import { buildModule } from '@nomicfoundation/hardhat-ignition/modules'

export default buildModule('KYCManager', m => {
    const DEPLOYER_ADDRESS = m.getAccount(0)

    const kyc_manager = m.contract('KycManager', [true, DEPLOYER_ADDRESS])

    return { kyc_manager }
})
