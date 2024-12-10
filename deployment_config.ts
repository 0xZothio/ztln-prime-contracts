export const deploymentConfig: {
    [key: number]: {
        network: string
        chainId: number
        kycManager: string
        ZTLNImplementation: string
        ZTLNProxy: string
    }
} = {
    '1': {
        network: 'mainnet',
        chainId: 1,
        kycManager: '0xaDB41aEe4c5CD373199F3509298824c473F671F7',
        ZTLNImplementation: '0x982dAA73B74a9cE2b02bB0f0E7A15592f26dA318',
        ZTLNProxy: '0xfEd3D6557Dc46A1B25d0A6F666513Cb33835864B'
    },
    '169': {
        network: 'manta',
        chainId: 169,
        kycManager: '',
        ZTLNImplementation: '',
        ZTLNProxy: ''
    },
    '17000': {
        network: 'holesky',
        chainId: 17000,
        kycManager: '',
        ZTLNImplementation: '',
        ZTLNProxy: ''
    },
    '80002': {
        network: 'amoy',
        chainId: 80002,
        kycManager: '0x6f0e03A7da17Ab95B2C7E6BF1C2e732D33A22341',
        ZTLNImplementation: '0xbCC57147042F1d116c359eb8Acbb4A9542E7209c',
        ZTLNProxy: '0x1E4260c81c99b113025bde0B2aEef8DfF329541F'
    },
    '80084': {
        network: 'berachain',
        chainId: 80084,
        kycManager: '',
        ZTLNImplementation: '',
        ZTLNProxy: ''
    }
}
