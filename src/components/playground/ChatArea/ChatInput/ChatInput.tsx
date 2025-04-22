'use client'
import { useState, useRef } from 'react'
import { toast } from 'sonner'
import { TextArea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { usePlaygroundStore } from '@/store'
import { useQueryState } from 'nuqs'
import Icon from '@/components/ui/icon'
import useAIChatHandler from '@/hooks/useAIChatHandler'
import { Upload, X } from 'lucide-react'
import { uploadDatasetFileAPI } from '@/api/playground'

const ChatInput = () => {
  const selectedEndpoint = usePlaygroundStore((state) => state.selectedEndpoint)
  const { chatInputRef } = usePlaygroundStore()
  const { handleResponse } = useAIChatHandler()
  const [selectedAgent] = useQueryState('agent')
  const [inputMessage, setInputMessage] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const isStreaming = usePlaygroundStore((state) => state.isStreaming)

  const handleSubmit = async () => {
    if (!inputMessage.trim() && !file) return

    const currentMessage = inputMessage
    setInputMessage('')

    try {
      // Handle file upload if there's a file
      if (file) {
        const formData = new FormData()
        formData.append('file', file)

        // Add description from the message if any
        if (currentMessage.trim()) {
          formData.append('description', currentMessage)
        }

        try {
          const response = await uploadDatasetFileAPI(selectedEndpoint, formData)

          const data = await response.json()

          if (!response.ok) {
            throw new Error(data.detail || 'File upload failed')
          }

          // Clear file after successful upload
          setFile(null)

          // Inform the user about successful upload
          toast.success(`${data.message}`)

          // Update the conversation with info about the upload
          if (currentMessage.trim()) {
            await handleResponse(`I've uploaded a CSV file named "${file.name}" with the following message: ${currentMessage}`)
          } else {
            await handleResponse(`I've uploaded a CSV file named "${file.name}"`)
          }
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } catch (error: any) {
          toast.error(`File upload error: ${error.message}`)
        }
      } else if (currentMessage.trim()) {
      // Handle regular text message
        await handleResponse(currentMessage)
      }
    } catch (error) {
      toast.error(
        `Error in handleSubmit: ${
          error instanceof Error ? error.message : String(error)
        }`
      )
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleFileChange = (e: any) => {
    const selectedFile = e.target.files?.[0]

    if (!selectedFile) return

    // Verify file type (only allow CSV)
    if (!selectedFile.name.endsWith('.csv') && selectedFile.type !== 'text/csv') {
      toast.error('Only CSV files are allowed')
      e.target.value = null
      return
    }

    // File size check (optional, adjust as needed)
    if (selectedFile.size > 5 * 1024 * 1024) { // 5MB limit
      toast.error('File size should be less than 5MB')
      e.target.value = null
      return
    }

    setFile(selectedFile)
    toast.success(`File "${selectedFile.name}" selected`)
  }

  const clearFile = () => {
    setFile(null)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  return (
    <div className="relative mx-auto mb-1 flex w-full max-w-2xl flex-col items-end justify-center gap-y-2 font-geist">
      {/* File upload visualization */}
      {file && (
        <div className="w-full rounded-md border border-accent bg-primaryAccent p-2 text-sm text-primary">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 truncate">
              <Icon type="agent" color="primary" />
              <span className="truncate">{file.name}</span>
              <span className="text-xs text-gray-500">({(file.size / 1024).toFixed(1)} KB)</span>
            </div>
            <button
              onClick={clearFile}
              className="rounded-full p-1 hover:bg-gray-100"
              title="Remove file"
            >
              <X size={16} />
            </button>
          </div>
        </div>
      )}

      <div className="flex w-full items-end gap-x-2">
        <TextArea
          placeholder={'Ask anything'}
          value={inputMessage}
          onChange={(e) => setInputMessage(e.target.value)}
          onKeyDown={(e) => {
            if (
              e.key === 'Enter' &&
              !e.nativeEvent.isComposing &&
              !e.shiftKey &&
              !isStreaming
            ) {
              e.preventDefault()
              handleSubmit()
            }
          }}
          className="w-full border border-accent bg-primaryAccent px-4 text-sm text-primary focus:border-accent"
          disabled={!selectedAgent || isStreaming}
          ref={chatInputRef}
        />

        {/* File upload button */}
        <Button
          onClick={() => fileInputRef.current?.click()}
          disabled={!selectedAgent || isStreaming}
          size="icon"
          className="rounded-xl bg-primary p-5 text-primaryAccent"
          title="Upload CSV file"
        >
          <Upload size={18} />
        </Button>

        {/* Hidden file input */}
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileChange}
          accept=".csv,text/csv"
          className="hidden"
        />

        {/* Send button */}
        <Button
          onClick={handleSubmit}
          disabled={!selectedAgent || (!inputMessage.trim() && !file) || isStreaming}
          size="icon"
          className="rounded-xl bg-primary p-5 text-primaryAccent"
        >
          <Icon type="send" color="primaryAccent" />
        </Button>
      </div>
    </div>
  )
}

export default ChatInput