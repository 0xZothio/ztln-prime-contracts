import { buildModule } from '@nomicfoundation/hardhat-ignition/modules'

export default buildModule('KYCManager', m => {
    const kyc_manager = m.contract('KycManager', [true])

    return { kyc_manager }
})
