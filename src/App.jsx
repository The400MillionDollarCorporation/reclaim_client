import React, { useState } from 'react';
import { ReclaimProofRequest, verifyProof } from "@reclaimprotocol/js-sdk";
import { QRCode } from "react-qr-code";

export default function App() {
  const [requestUrl, setRequestUrl] = useState('');
  const [proofs, setProofs] = useState(null);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const BASE_URL = import.meta.env.VITE_API_URL;

  // Environment variables from .env file
  const APP_ID = import.meta.env.VITE_APP_ID;
  const APP_SECRET = import.meta.env.VITE_APP_SECRET;
  const FLIPKART_PROVIDER_ID = import.meta.env.VITE_FLIPKART_PROVIDER_ID;
  const AMAZON_PROVIDER_ID = import.meta.env.VITE_AMAZON_PROVIDER_ID;
  const CALLBACK_URL = import.meta.env.VITE_CALLBACK_URL;

  const getVerificationRequest = async (platform) => {
    try {
      setStatus(`Initializing ${platform} verification...`);
      setError('');
      setProofs(null);

      const providerId = platform === 'flipkart' ? FLIPKART_PROVIDER_ID : AMAZON_PROVIDER_ID;
      const testData = platform === 'flipkart' 
        ? { text: "500", contextMessage: "0xf7d4041e751E0b4f6eA72Eb82F2b200D278704A4" }
        : { balance: "₹1000", contextMessage: "0xf7d4041e751E0b4f6eA72Eb82F2b200D278704A4" };

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

      // Set callback URL
      reclaimProofRequest.setAppCallbackUrl(CALLBACK_URL);
      
      // Add user address to context
      reclaimProofRequest.addContext("address", "0xf7d4041e751E0b4f6eA72Eb82F2b200D278704A4");

      // Generate request URL
      const requestUrl = await reclaimProofRequest.getRequestUrl();
      setRequestUrl(requestUrl);
      setStatus(`QR Code generated! Scan to verify your ${platform} account.`);

      // Start verification session
      await reclaimProofRequest.startSession({
        onSuccess: async (proofs) => {
          try {
            if (typeof proofs === "string") {
              console.log("SDK Message:", proofs);
              setStatus('Verification in progress...');
            } else {
              console.log("Proof received:", proofs);
              setStatus('Verifying proof...');
              
              // Verify the proof
              const isValid = await verifyProof(proofs);
              if (!isValid) {
                throw new Error("Invalid proof");
              }

              // Extract data from proof
              const contextData = JSON.parse(proofs.claimData.context);
              const amount = platform === 'flipkart' 
                ? contextData.extractedParameters.text
                : contextData.extractedParameters.balance.replace("&#x20b9;", "");
              const address = contextData.contextMessage;

              // Send to backend for token transfer
              const response = await fetch(`${BASE_URL}/transfer-tokens`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  amount,
                  address,
                  platform,
                  proof: proofs
                }),
              });

              const result = await response.json();
              if (result.success) {
                setProofs(proofs);
                setStatus(`Success! ${amount} tokens transferred to ${address}`);
              } else {
                throw new Error(result.error || 'Transfer failed');
              }
            }
          } catch (error) {
            console.error("Error processing proof:", error);
            setError(error.message);
            setStatus('Verification failed');
          }
        },
        onError: (error) => {
          console.error("Verification failed:", error);
          setError(error.message);
          setStatus('Verification failed');
        },
      });

    } catch (error) {
      console.error("Error initializing Reclaim:", error);
      setError(error.message);
      setStatus('Initialization failed');
    }
  };

  return (
    <div className="flex flex-col items-center gap-4 p-8">
      <h1 className="text-3xl font-bold">Reclaim Protocol Demo</h1>
      
      <div className="flex gap-4">
        <button
          onClick={() => getVerificationRequest('flipkart')}
          className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
        >
          Verify Flipkart Account
        </button>
        <button
          onClick={() => getVerificationRequest('amazon')}
          className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
        >
          Verify Amazon Account
        </button>
      </div>

      {status && (
        <div className={`p-4 rounded ${error ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'}`}>
          {status}
        </div>
      )}

      {error && (
        <div className="p-4 bg-red-100 text-red-700 rounded">
          Error: {error}
        </div>
      )}

      {requestUrl && (
        <div className="mt-4 p-4 bg-white rounded shadow-lg flex flex-col items-center gap-4">
          <QRCode value={requestUrl} size={256} />
          <a 
            href={requestUrl} 
            target="_blank" 
            rel="noopener noreferrer"
            className="text-blue-500 hover:text-blue-700 underline"
          >
            Open Link
          </a>
        </div>
      )}

      {proofs && (
        <div className="mt-4 p-4 bg-green-100 rounded">
          <h2 className="text-xl font-bold mb-2">Verification Successful!</h2>
          <pre className="bg-white p-4 rounded overflow-auto max-w-2xl">
            {JSON.stringify(proofs, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}
