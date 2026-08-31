/**
 * Unified Wallet Provider
 * Supports Freighter, WalletConnect, and Ledger hardware wallets
 */

export type WalletType = 'freighter' | 'walletconnect' | 'ledger';

export interface WalletConnection {
  address: string;
  network: string;
  walletType: WalletType;
}

export interface WalletProvider {
  connect(): Promise<WalletConnection>;
  disconnect(): Promise<void>;
  signTransaction(transaction: string): Promise<string>;
  getAddress(): Promise<string>;
  getNetwork(): Promise<string>;
  isConnected(): boolean;
}

/**
 * Freighter Wallet Implementation
 */
class FreighterWallet implements WalletProvider {
  private connection: WalletConnection | null = null;

  async connect(): Promise<WalletConnection> {
    const { connectWallet, getPublicKey } = await import('@/lib/stellar');
    await connectWallet();
    const address = await getPublicKey();
    
    if (!address) {
      throw new Error('Failed to get address from Freighter');
    }
    
    this.connection = {
      address,
      network: 'testnet', // Will be determined from Freighter
      walletType: 'freighter',
    };
    
    return this.connection;
  }

  async disconnect(): Promise<void> {
    this.connection = null;
  }

  async signTransaction(transaction: string): Promise<string> {
    // Use Freighter's sign method via stellar SDK
    const { signTransaction: freighterSign } = await import('@/lib/stellar');
    return freighterSign(transaction);
  }

  async getAddress(): Promise<string> {
    if (!this.connection) throw new Error('Not connected');
    return this.connection.address;
  }

  async getNetwork(): Promise<string> {
    if (!this.connection) throw new Error('Not connected');
    return this.connection.network;
  }

  isConnected(): boolean {
    return this.connection !== null;
  }
}

/**
 * WalletConnect Implementation
 */
class WalletConnectWallet implements WalletProvider {
  private connection: WalletConnection | null = null;
  private client: any = null;

  async connect(): Promise<WalletConnection> {
    const { Web3Wallet } = await import('@walletconnect/web3wallet');
    const { Core } = await import('@walletconnect/core');

    // Initialize WalletConnect client
    this.client = await Web3Wallet.init({
      core: new Core({
        projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || '',
      }),
      metadata: {
        name: 'StellarWork',
        description: 'Decentralized freelance marketplace',
        url: typeof window !== 'undefined' ? window.location.origin : 'https://stellarwork.org',
        icons: ['https://stellarwork.org/icon.png'],
      },
    });

    // Pair with QR code (in production, show QR to user)
    const { uri, approval } = await this.client.core.pairing.create();
    
    if (uri) {
      // In production: display QR code to user
      console.log('WalletConnect URI:', uri);
    }

    // Wait for session approval
    const session = await approval();
    
    const address = session.namespaces.stellar?.accounts[0]?.split(':')[2] || '';
    
    this.connection = {
      address,
      network: 'testnet',
      walletType: 'walletconnect',
    };
    
    return this.connection;
  }

  async disconnect(): Promise<void> {
    if (this.client && this.connection) {
      await this.client.disconnect({
        topic: this.connection.address,
        reason: { code: 6000, message: 'User disconnected' },
      });
    }
    this.connection = null;
    this.client = null;
  }

  async signTransaction(transaction: string): Promise<string> {
    if (!this.client || !this.connection) {
      throw new Error('Not connected');
    }
    
    // Sign transaction using WalletConnect
    const result = await this.client.request({
      chainId: 'stellar:testnet',
      request: {
        method: 'stellar_signTransaction',
        params: { transaction },
      },
    });
    
    return result.signature;
  }

  async getAddress(): Promise<string> {
    if (!this.connection) throw new Error('Not connected');
    return this.connection.address;
  }

  async getNetwork(): Promise<string> {
    if (!this.connection) throw new Error('Not connected');
    return this.connection.network;
  }

  isConnected(): boolean {
    return this.connection !== null;
  }
}

/**
 * Ledger Hardware Wallet Implementation
 */
class LedgerWallet implements WalletProvider {
  private connection: WalletConnection | null = null;
  private transport: any = null;
  private app: any = null;

  async connect(): Promise<WalletConnection> {
    const { default: WebHID } = await import('@ledgerhq/hw-transport-webhid');
    const { default: StrApp } = await import('@ledgerhq/hw-app-str');

    // Create WebHID transport
    this.transport = await WebHID.create();
    this.app = new StrApp(this.transport);
    
    // Get address from Ledger (path 44'/148'/0'/0/0 for Stellar)
    const result = await this.app.getAddress("44'/148'/0'/0/0");
    const address = result.address;
    
    this.connection = {
      address,
      network: 'testnet',
      walletType: 'ledger',
    };
    
    return this.connection;
  }

  async disconnect(): Promise<void> {
    if (this.transport) {
      await this.transport.close();
    }
    this.connection = null;
    this.transport = null;
    this.app = null;
  }

  async signTransaction(transaction: string): Promise<string> {
    if (!this.app || !this.connection) {
      throw new Error('Not connected');
    }
    
    // Sign transaction on Ledger device
    const result = await this.app.signTransaction("44'/148'/0'/0/0", transaction);
    
    return result.signature;
  }

  async getAddress(): Promise<string> {
    if (!this.connection) throw new Error('Not connected');
    return this.connection.address;
  }

  async getNetwork(): Promise<string> {
    if (!this.connection) throw new Error('Not connected');
    return this.connection.network;
  }

  isConnected(): boolean {
    return this.connection !== null;
  }
}

/**
 * Unified Wallet Manager
 */
export class UnifiedWalletManager {
  private providers: Record<WalletType, WalletProvider>;
  private currentProvider: WalletProvider | null = null;

  constructor() {
    this.providers = {
      freighter: new FreighterWallet(),
      walletconnect: new WalletConnectWallet(),
      ledger: new LedgerWallet(),
    };
  }

  async connect(walletType: WalletType): Promise<WalletConnection> {
    const provider = this.providers[walletType];
    if (!provider) {
      throw new Error(`Unsupported wallet type: ${walletType}`);
    }

    // Disconnect current provider if connected
    if (this.currentProvider && this.currentProvider.isConnected()) {
      await this.currentProvider.disconnect();
    }

    this.currentProvider = provider;
    return provider.connect();
  }

  async disconnect(): Promise<void> {
    if (this.currentProvider) {
      await this.currentProvider.disconnect();
      this.currentProvider = null;
    }
  }

  async signTransaction(transaction: string): Promise<string> {
    if (!this.currentProvider) {
      throw new Error('No wallet connected');
    }
    return this.currentProvider.signTransaction(transaction);
  }

  async getAddress(): Promise<string> {
    if (!this.currentProvider) {
      throw new Error('No wallet connected');
    }
    return this.currentProvider.getAddress();
  }

  async getNetwork(): Promise<string> {
    if (!this.currentProvider) {
      throw new Error('No wallet connected');
    }
    return this.currentProvider.getNetwork();
  }

  isConnected(): boolean {
    return this.currentProvider?.isConnected() || false;
  }

  getCurrentWalletType(): WalletType | null {
    if (!this.currentProvider) return null;
    
    for (const [type, provider] of Object.entries(this.providers)) {
      if (provider === this.currentProvider) return type as WalletType;
    }
    
    return null;
  }

  getAvailableWalletTypes(): WalletType[] {
    return Object.keys(this.providers) as WalletType[];
  }
}

// Singleton instance
export const walletManager = new UnifiedWalletManager();
