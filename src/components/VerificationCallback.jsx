import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Loader2, CheckCircle, XCircle } from 'lucide-react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

export default function VerificationCallback() {
  const [status, setStatus] = useState('processing'); // 'processing', 'success', 'error'
  const [message, setMessage] = useState('Processing your verification...');
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const processVerification = async () => {
      try {
        // Get the proof data from the URL
        const searchParams = new URLSearchParams(location.search);
        const proofData = searchParams.get('proof');

        if (!proofData) {
          throw new Error('No proof data received');
        }

        // Send the proof to the backend
        const response = await fetch(`${API_URL}/receive-proofs`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(proofData),
        });

        const result = await response.json();

        if (response.ok) {
          setStatus('success');
          setMessage('Verification successful! Your rewards have been transferred.');
          // Redirect to home page after 3 seconds
          setTimeout(() => navigate('/'), 3000);
        } else {
          throw new Error(result.error || 'Verification failed');
        }
      } catch (error) {
        console.error('Verification error:', error);
        setStatus('error');
        setMessage(error.message || 'Verification failed. Please try again.');
        // Redirect to home page after 5 seconds on error
        setTimeout(() => navigate('/'), 5000);
      }
    };

    processVerification();
  }, [location, navigate]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-900 to-indigo-900 flex items-center justify-center p-4">
      <div className="bg-white/10 backdrop-blur-md rounded-xl p-8 max-w-md w-full text-center">
        <div className="mb-6">
          {status === 'processing' && (
            <Loader2 className="w-12 h-12 text-purple-400 animate-spin mx-auto" />
          )}
          {status === 'success' && (
            <CheckCircle className="w-12 h-12 text-green-400 mx-auto" />
          )}
          {status === 'error' && (
            <XCircle className="w-12 h-12 text-red-400 mx-auto" />
          )}
        </div>
        
        <h2 className="text-2xl font-bold mb-4 text-white">
          {status === 'processing' && 'Processing Verification'}
          {status === 'success' && 'Verification Successful!'}
          {status === 'error' && 'Verification Failed'}
        </h2>
        
        <p className="text-purple-200 mb-6">{message}</p>
        
        {status !== 'processing' && (
          <button
            onClick={() => navigate('/')}
            className="px-6 py-2 bg-white/20 hover:bg-white/30 rounded-lg text-white transition-colors"
          >
            Return to Home
          </button>
        )}
      </div>
    </div>
  );
} 