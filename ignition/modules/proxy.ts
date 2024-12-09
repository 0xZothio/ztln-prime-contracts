import { buildModule } from '@nomicfoundation/hardhat-ignition/modules'

export default buildModule('Proxy', m => {
    const create3FactoryAddress = m.getParameter('create3Factory')
    const create3Factory = m.contractAt('Create3Factory', create3FactoryAddress)

    const bytecode = m.getParameter('bytecode')
    const salt = m.getParameter('salt')

    m.call(create3Factory, 'create', [salt, bytecode])

    return {}
})
