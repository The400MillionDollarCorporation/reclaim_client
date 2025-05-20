import React from 'react';
import { useState, useEffect } from 'react';
import { Connection, PublicKey, clusterApiUrl } from '@solana/web3.js';
import { getAssociatedTokenAddress } from '@solana/spl-token';
import { useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { QRCode } from 'react-qr-code';
import { CheckCircle, Clock, AlertTriangle, ArrowRight } from 'lucide-react';
import { ReclaimProofRequest } from '@reclaimprotocol/js-sdk';

// Constants
const REWARD_TOKEN_MINT = new PublicKey(import.meta.env.VITE_REWARD_TOKEN_MINT || 'SPKYatZ3UEk5YCaW8NfYtTFGdMhEgB479bPBzAxCahM');
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';
const SOLANA_CONNECTION = new Connection(import.meta.env.VITE_SOLANA_RPC_URL || clusterApiUrl('devnet'), 'confirmed');

export default function SolanaRewardsApp() {
  const { publicKey, connected } = useWallet();
  const [tokenBalance, setTokenBalance] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [qrCodeUrl, setQrCodeUrl] = useState(null);
  const [platform, setPlatform] = useState(null);
  const [verificationStatus, setVerificationStatus] = useState(null); // 'pending', 'verified', 'failed'
  const [statusMessage, setStatusMessage] = useState('');
  const [transactionUrl, setTransactionUrl] = useState(null);
  const [lastRefreshTime, setLastRefreshTime] = useState(null);
  const [error, setError] = useState(null);

  // Fetch token balance whenever the wallet changes or verification status changes
  useEffect(() => {
    if (connected && publicKey) {
      fetchTokenBalance();
      // Set up a timer to refresh the balance every 15 seconds
      const intervalId = setInterval(fetchTokenBalance, 15000);
      return () => clearInterval(intervalId);
    }
  }, [connected, publicKey, verificationStatus]);

  // Function to fetch token balance
  const fetchTokenBalance = async () => {
    try {
      if (!publicKey) return;
      
      const associatedTokenAddress = await getAssociatedTokenAddress(
        REWARD_TOKEN_MINT,
        publicKey
      );
      
      // Try to get the token account info
      try {
        const tokenAccountInfo = await SOLANA_CONNECTION.getTokenAccountBalance(associatedTokenAddress);
        setTokenBalance(tokenAccountInfo.value.uiAmount || 0);
      } catch (err) {
        // If the token account doesn't exist yet, set balance to 0
        setTokenBalance(0);
      }
      
      setLastRefreshTime(new Date());
    } catch (error) {
      console.error('Error fetching token balance:', error);
    }
  };

  // Function to initialize verification for a platform
  const startVerification = async (selectedPlatform) => {
    try {
      setIsLoading(true);
      setError(null);
      setPlatform(selectedPlatform);
      setVerificationStatus(null);
      setTransactionUrl(null);
      
      if (!publicKey) {
        throw new Error('Please connect your wallet first');
      }
      
      // Set up WebSocket for receiving status updates
      setupWebSocket();
      
      // Request a signed verification URL from backend
      const endpoint = `${API_URL}/reclaim/generate-config-${selectedPlatform.toLowerCase()}`;
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          userAddress: publicKey.toString()
        })
      });
      
      if (!response.ok) {
        throw new Error(`Server responded with status: ${response.status}`);
      }
      
      const data = await response.json();
      
      if (!data.requestUrl) {
        throw new Error("No verification URL received");
      }
      
      // Set the QR code URL directly from the backend
      setQrCodeUrl(data.requestUrl);
      setVerificationStatus('pending');
      setStatusMessage(`Waiting for ${selectedPlatform} verification...`);
      
      console.log(`Verification initialized for ${selectedPlatform}. Session ID: ${data.sessionId || 'unknown'}`);
      
    } catch (error) {
      console.error('Error starting verification:', error);
      setError(`Failed to start verification: ${error.message}`);
      setVerificationStatus('failed');
    } finally {
      setIsLoading(false);
    }
  };

  // Set up WebSocket connection to listen for verification updates
  const setupWebSocket = () => {
    const wsUrl = API_URL.replace('http://', 'ws://').replace('https://', 'wss://').replace(/:\d+$/, '') + ':3001';
    const ws = new WebSocket(wsUrl);
    
    ws.onopen = () => {
      console.log('WebSocket connection established');
    };
    
    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        console.log('WebSocket message received:', data);
        
        if (data.type === 'agent' && data.content.includes('successfully transferred')) {
          setVerificationStatus('verified');
          setStatusMessage('Reward successfully transferred to your wallet!');
          
          // Extract transaction URL if present
          const txUrlMatch = data.content.match(/https:\/\/explorer\.solana\.com\/tx\/[a-zA-Z0-9]+\?cluster=devnet/);
          if (txUrlMatch) {
            setTransactionUrl(txUrlMatch[0]);
          }
          
          // Refresh token balance
          fetchTokenBalance();
        } else if (data.type === 'error') {
          setVerificationStatus('failed');
          setStatusMessage(`Error: ${data.content}`);
          setError(data.content);
        }
      } catch (error) {
        console.error('Error parsing WebSocket message:', error);
      }
    };
    
    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
      setError('Connection error. Please try again.');
    };
    
    ws.onclose = () => {
      console.log('WebSocket connection closed');
    };
    
    return ws;
  };

  // Reset the verification process
  const resetVerification = () => {
    setQrCodeUrl(null);
    setPlatform(null);
    setVerificationStatus(null);
    setStatusMessage('');
    setTransactionUrl(null);
    setError(null);
  };

  // Format balance with 2 decimal places
  const formatBalance = (balance) => {
    return Number(balance).toFixed(2);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-900 to-blue-900 text-white p-6">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <header className="flex flex-col md:flex-row justify-between items-center mb-12 gap-4">
          <div>
            <h1 className="text-3xl md:text-4xl font-bold">Solana Rewards</h1>
            <p className="text-purple-200 mt-1">Convert your loyalty points to Solana tokens</p>
          </div>
          
          <div className="flex items-center gap-4">
            {connected && publicKey && (
              <div className="bg-white/10 backdrop-blur-sm px-4 py-2 rounded-lg">
                <p className="text-sm text-purple-200">Balance</p>
                <p className="text-xl font-bold">{formatBalance(tokenBalance)} $REWARD</p>
                {lastRefreshTime && (
                  <p className="text-xs text-purple-300">
                    Updated {lastRefreshTime.toLocaleTimeString()}
                  </p>
                )}
              </div>
            )}
            <WalletMultiButton className="!bg-gradient-to-r from-pink-500 to-purple-600 hover:from-pink-600 hover:to-purple-700 !rounded-lg !py-2" />
          </div>
        </header>
        
        {/* Main content */}
        <main className="bg-white/10 backdrop-blur-md rounded-xl p-6 md:p-8 shadow-xl">
          {!connected ? (
            <div className="text-center py-12">
              <h2 className="text-2xl font-bold mb-4">Connect Your Wallet</h2>
              <p className="mb-6 text-purple-200">Connect your Solana wallet to start converting reward points</p>
              <WalletMultiButton className="!bg-gradient-to-r from-pink-500 to-purple-600 hover:from-pink-600 hover:to-purple-700 !rounded-lg !py-2" />
            </div>
          ) : qrCodeUrl ? (
            <div className="flex flex-col md:flex-row gap-8 items-center">
              {/* QR Code section */}
              <div className="bg-white p-6 rounded-lg shadow-md flex-1 text-center">
                <h2 className="text-xl font-bold text-gray-800 mb-4">
                  Scan to Verify {platform} Points
                </h2>
                <div className="bg-white p-4 inline-block mb-4">
                  <QRCode value={qrCodeUrl} size={200} />
                </div>
                <p className="text-sm text-gray-600 mb-2">
                  Scan this QR code with your mobile device
                </p>
              </div>
              
              {/* Status section */}
              <div className="flex-1">
                <h2 className="text-xl font-bold mb-4">Verification Status</h2>
                
                <div className="space-y-6">
                  <div className="flex items-center gap-3">
                    {verificationStatus === 'pending' ? (
                      <Clock className="text-yellow-400 w-6 h-6 animate-pulse" />
                    ) : verificationStatus === 'verified' ? (
                      <CheckCircle className="text-green-400 w-6 h-6" />
                    ) : verificationStatus === 'failed' ? (
                      <AlertTriangle className="text-red-400 w-6 h-6" />
                    ) : (
                      <Clock className="text-yellow-400 w-6 h-6" />
                    )}
                    <span>{statusMessage || 'Initializing verification...'}</span>
                  </div>
                  
                  {verificationStatus === 'verified' && (
                    <div className="bg-green-900/30 p-4 rounded-lg">
                      <p className="font-medium text-green-300 mb-2">
                        Points successfully converted to $REWARD tokens!
                      </p>
                      {transactionUrl && (
                        <a 
                          href={transactionUrl} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="inline-flex items-center text-purple-300 hover:text-white"
                        >
                          View transaction <ArrowRight className="ml-1 w-4 h-4" />
                        </a>
                      )}
                    </div>
                  )}
                  
                  {error && (
                    <div className="bg-red-900/30 p-4 rounded-lg">
                      <p className="text-red-300">{error}</p>
                    </div>
                  )}
                  
                  <button
                    onClick={resetVerification}
                    className="px-4 py-2 bg-white/20 hover:bg-white/30 rounded-lg transition-colors"
                  >
                    Start Over
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div>
              <h2 className="text-2xl font-bold mb-6">Select a Platform</h2>
              <p className="mb-8 text-purple-200">
                Choose the platform where you have reward points to convert to Solana tokens
              </p>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <button
                  onClick={() => startVerification('Flipkart')}
                  disabled={isLoading}
                  className="bg-gradient-to-r from-blue-500 to-blue-700 hover:from-blue-600 hover:to-blue-800 p-6 rounded-xl flex flex-col items-center transition-all transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
                >
                  <div className="w-16 h-16 bg-white rounded-full mb-4 flex items-center justify-center">
                    <span className="text-blue-600 font-bold text-2xl">F</span>
                  </div>
                  <h3 className="text-xl font-bold">Flipkart SuperCoins</h3>
                  <p className="text-sm text-blue-200 mt-2">
                    Convert your Flipkart SuperCoins to $REWARD tokens
                  </p>
                </button>
                
                <button
                  onClick={() => startVerification('Amazon')}
                  disabled={isLoading}
                  className="bg-gradient-to-r from-orange-500 to-orange-700 hover:from-orange-600 hover:to-orange-800 p-6 rounded-xl flex flex-col items-center transition-all transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
                >
                  <div className="w-16 h-16 bg-white rounded-full mb-4 flex items-center justify-center">
                    <span className="text-orange-600 font-bold text-2xl">A</span>
                  </div>
                  <h3 className="text-xl font-bold">Amazon Pay Balance</h3>
                  <p className="text-sm text-orange-200 mt-2">
                    Convert your Amazon Pay rewards to $REWARD tokens
                  </p>
                </button>
              </div>
              
              {isLoading && (
                <div className="text-center mt-8">
                  <div className="inline-block w-8 h-8 border-4 border-purple-300 border-t-transparent rounded-full animate-spin"></div>
                  <p className="mt-2 text-purple-200">Initializing verification...</p>
                </div>
              )}
            </div>
          )}
        </main>
        
        {/* Info section */}
        <section className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white/10 backdrop-blur-sm p-6 rounded-lg">
            <h3 className="text-xl font-bold mb-3">Secure Verification</h3>
            <p className="text-purple-200">
              Zero-knowledge proofs ensure your account details remain private while verifying your points
            </p>
          </div>
          
          <div className="bg-white/10 backdrop-blur-sm p-6 rounded-lg">
            <h3 className="text-xl font-bold mb-3">Instant Conversion</h3>
            <p className="text-purple-200">
              Points are converted to $REWARD tokens and sent directly to your Solana wallet
            </p>
          </div>
          
          <div className="bg-white/10 backdrop-blur-sm p-6 rounded-lg">
            <h3 className="text-xl font-bold mb-3">Solana-Powered</h3>
            <p className="text-purple-200">
              Built on Solana for fast transactions, low fees, and seamless user experience
            </p>
          </div>
        </section>
        
        {/* Footer */}
        <footer className="mt-16 text-center text-sm text-purple-300">
          <p>Built with Reclaim Protocol & Solana</p>
        </footer>
      </div>
    </div>
  );
}