'use client'

import { useState, useEffect } from 'react'

interface PasswordProtectionProps {
  children: React.ReactNode
}

export default function PasswordProtection({ children }: PasswordProtectionProps) {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [password, setPassword] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  
  useEffect(() => {
    // Check if already authenticated in this session
    const storedAuth = sessionStorage.getItem('isAuthenticated')
    if (storedAuth === 'true') {
      setIsAuthenticated(true)
    }
    setIsLoading(false)
  }, [])
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    
    try {
      const response = await fetch('/api/verify-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ password }),
      })
      
      const data = await response.json()
      
      if (data.success) {
        setIsAuthenticated(true)
        sessionStorage.setItem('isAuthenticated', 'true')
      } else {
        setError(data.message || 'Incorrect password')
      }
    } catch {
      setError('Failed to verify password. Please try again.')
    }
  }
  
  // Show loading state during hydration
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        Loading...
      </div>
    )
  }
  
  if (!isAuthenticated) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-50">
        <div className="w-full max-w-md p-8 space-y-8 bg-white rounded-lg shadow-md">
          <div>
            <h1 className="text-2xl font-bold text-center text-gray-900">Password Protected</h1>
            <p className="mt-2 text-center text-gray-600">Enter the password to access this site</p>
          </div>
          <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
            <div>
              <label htmlFor="password" className="sr-only">
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="relative block w-full px-3 py-2 text-gray-900 placeholder-gray-500 border border-gray-300 rounded-md appearance-none focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 focus:z-10 sm:text-sm"
                placeholder="Enter password"
              />
            </div>
            {error && (
              <div className="text-sm text-center text-red-600">
                {error}
              </div>
            )}
            <div>
              <button
                type="submit"
                className="relative flex justify-center w-full px-4 py-2 text-sm font-medium text-white bg-indigo-600 border border-transparent rounded-md group focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 hover:bg-indigo-700"
              >
                Submit
              </button>
            </div>
          </form>
        </div>
      </div>
    )
  }
  
  return <>{children}</>
}