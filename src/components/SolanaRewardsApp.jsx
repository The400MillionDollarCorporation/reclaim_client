import React,{ useState, useEffect } from 'react';
import { Connection, PublicKey, clusterApiUrl } from '@solana/web3.js';
import { getAssociatedTokenAddress } from '@solana/spl-token';
import { useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { QRCode } from 'react-qr-code';
import { CheckCircle, Clock, AlertTriangle } from 'lucide-react';
import { ReclaimProofRequest, verifyProof } from '@reclaimprotocol/js-sdk';

// Constants
const REWARD_TOKEN_MINT = new PublicKey(import.meta.env.VITE_REWARD_TOKEN_MINT || 'SPKYatZ3UEk5YCaW8NfYtTFGdMhEgB479bPBzAxCahM');
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';
const SOLANA_CONNECTION = new Connection(import.meta.env.VITE_SOLANA_RPC_URL || clusterApiUrl('devnet'), 'confirmed');

// Environment variables from .env file
const APP_ID = import.meta.env.VITE_APP_ID;
const APP_SECRET = import.meta.env.VITE_APP_SECRET;
const FLIPKART_PROVIDER_ID = import.meta.env.VITE_FLIPKART_PROVIDER_ID;
const AMAZON_PROVIDER_ID = import.meta.env.VITE_AMAZON_PROVIDER_ID;

export default function SolanaRewardsApp() {
  const { publicKey, connected } = useWallet();
  const [tokenBalance, setTokenBalance] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [requestUrl, setRequestUrl] = useState(null);
  const [platform, setPlatform] = useState(null);
  const [verificationStatus, setVerificationStatus] = useState(null); // 'pending', 'verified', 'failed'
  const [statusMessage, setStatusMessage] = useState('');
  const [transactionUrl, setTransactionUrl] = useState(null);
  const [lastRefreshTime, setLastRefreshTime] = useState(null);
  const [error, setError] = useState(null);
  const [proofs, setProofs] = useState(null);

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
      } catch {
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
      setVerificationStatus('pending');
      setStatusMessage(`Initializing ${selectedPlatform} verification...`);
      setTransactionUrl(null);
      setProofs(null);
      
      if (!publicKey) {
        throw new Error('Please connect your wallet first');
      }

      const providerId = selectedPlatform === 'flipkart' ? FLIPKART_PROVIDER_ID : AMAZON_PROVIDER_ID;
      const testData = selectedPlatform === 'flipkart' 
        ? { text: "500", contextMessage: publicKey.toString() }
        : { balance: "₹1000", contextMessage: publicKey.toString() };

      // Initialize Reclaim SDK
      const reclaimProofRequest = await ReclaimProofRequest.init(
        APP_ID,
        APP_SECRET,
        providerId,
        {
          isTestMode: true,
          testData
        }
      );

      // Always add the user's wallet address as contextMessage
      reclaimProofRequest.addContext("contextMessage", publicKey.toString());

      // Generate request URL
      const requestUrl = await reclaimProofRequest.getRequestUrl();
      setRequestUrl(requestUrl);
      setStatusMessage(`QR Code generated! Scan to verify your ${selectedPlatform} account.`);

      // Start verification session
      await reclaimProofRequest.startSession({
        onSuccess: async (proofs) => {
          try {
            if (typeof proofs === "string") {
              console.log("SDK Message:", proofs);
              setStatusMessage('Verification in progress...');
            } else {
              console.log("Proof received:", proofs);
              setStatusMessage('Verifying proof...');
              
              // Verify the proof
              const isValid = await verifyProof(proofs);
              if (!isValid) {
                throw new Error("Invalid proof");
              }

              // Extract data from proof
              const contextData = JSON.parse(proofs.claimData.context);
              const amount = selectedPlatform === 'flipkart' 
                ? contextData.extractedParameters.text
                : contextData.extractedParameters.balance.replace("&#x20b9;", "");
              const address = contextData.contextMessage; // This will now be the user's wallet address

              // Send to backend for token transfer
              const response = await fetch(`${API_URL}/transfer-tokens`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  amount,
                  address,
                  platform: selectedPlatform,
                  proof: proofs
                }),
              });

              const result = await response.json();
              if (result.success) {
                setProofs(proofs);
                setVerificationStatus('verified');
                setStatusMessage(`Success! ${amount} tokens transferred to ${address}`);
                setTransactionUrl(result.transactionUrl);
                fetchTokenBalance(); // Refresh balance
              } else {
                throw new Error(result.error || 'Transfer failed');
              }
            }
          } catch (error) {
            console.error("Error processing proof:", error);
            setError(error.message);
            setVerificationStatus('failed');
            setStatusMessage('Verification failed');
          }
        },
        onError: (error) => {
          console.error("Verification failed:", error);
          setError(error.message);
          setVerificationStatus('failed');
          setStatusMessage('Verification failed');
        },
      });

    } catch (error) {
      console.error('Error starting verification:', error);
      setError(`Failed to start verification: ${error.message}`);
      setVerificationStatus('failed');
      setStatusMessage('Verification failed');
    } finally {
      setIsLoading(false);
    }
  };

  // Reset the verification process
  const resetVerification = () => {
    setRequestUrl(null);
    setPlatform(null);
    setVerificationStatus(null);
    setStatusMessage('');
    setTransactionUrl(null);
    setError(null);
    setProofs(null);
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
          ) : requestUrl ? (
            <div className="flex flex-col md:flex-row gap-8 items-center">
              {/* QR Code section */}
              <div className="bg-white p-6 rounded-lg shadow-md flex-1 text-center">
                <h2 className="text-xl font-bold text-gray-800 mb-4">
                  Scan to Verify {platform} Points
                </h2>
                <div className="bg-white p-4 inline-block mb-4">
                  <QRCode value={requestUrl} size={200} />
                </div>
                <p className="text-sm text-gray-600 mb-2">
                  Scan this QR code with your mobile device
                </p>
                <a 
                  href={requestUrl} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-blue-500 hover:text-blue-700 underline text-sm"
                >
                  Open Link
                </a>
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
                  
                  {error && (
                    <div className="bg-red-900/30 p-4 rounded-lg">
                      <p className="text-red-300">{error}</p>
                    </div>
                  )}

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
                          className="text-blue-300 hover:text-blue-200 underline text-sm"
                        >
                          View Transaction
                        </a>
                      )}
                    </div>
                  )}

                  {proofs && (
                    <div className="bg-white/5 p-4 rounded-lg">
                      <h3 className="text-lg font-semibold mb-2">Verification Proof</h3>
                      <pre className="text-xs overflow-auto max-h-40 bg-black/20 p-2 rounded">
                        {JSON.stringify(proofs, null, 2)}
                      </pre>
                    </div>
                  )}

                  <button
                    onClick={resetVerification}
                    className="w-full bg-white/10 hover:bg-white/20 text-white font-medium py-2 px-4 rounded-lg transition-colors"
                  >
                    Start New Verification
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center py-12">
              <h2 className="text-2xl font-bold mb-6">Select Platform</h2>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <button
                  onClick={() => startVerification('flipkart')}
                  disabled={isLoading}
                  className="bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white font-medium py-3 px-6 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isLoading ? 'Loading...' : 'Verify Flipkart Points'}
                </button>
                <button
                  onClick={() => startVerification('amazon')}
                  disabled={isLoading}
                  className="bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white font-medium py-3 px-6 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isLoading ? 'Loading...' : 'Verify Amazon Points'}
                </button>
              </div>
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