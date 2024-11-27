import { buildModule } from '@nomicfoundation/hardhat-ignition/modules'

export default buildModule('KYCManager', m => {
    // Deploy the implementation
    const implementation = m.contract('KycManager', [true])

    return {
        implementation
    }
})
