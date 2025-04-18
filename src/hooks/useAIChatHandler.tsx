import { useCallback } from 'react'

import { APIRoutes } from '@/api/routes'

import useChatActions from '@/hooks/useChatActions'
import { usePlaygroundStore } from '../store'
import { type RunResponse } from '@/types/playground'
import { constructEndpointUrl } from '@/lib/constructEndpointUrl'
import { useQueryState } from 'nuqs'

/**
 * useAIChatHandler is responsible for making non-streaming API calls and handling the complete response.
 * This provides an alternative to the streaming approach for scenarios where you want the complete response at once.
 */
const useAIChatHandler = () => {
  const setMessages = usePlaygroundStore((state) => state.setMessages)
  const { addMessage, focusChatInput } = useChatActions()
  const [agentId] = useQueryState('agent')
  // const [sessionId, setSessionId] = useQueryState('session')
  const selectedEndpoint = usePlaygroundStore((state) => state.selectedEndpoint)
  const setErrorMessage = usePlaygroundStore(
    (state) => state.setStreamingErrorMessage
  )
  const setIsLoading = usePlaygroundStore((state) => state.setIsStreaming)
  // const setSessionsData = usePlaygroundStore((state) => state.setSessionsData)
  // const hasStorage = usePlaygroundStore((state) => state.hasStorage)

  const updateMessagesWithErrorState = useCallback(() => {
    setMessages((prevMessages) => {
      const newMessages = [...prevMessages]
      const lastMessage = newMessages[newMessages.length - 1]
      if (lastMessage && lastMessage.role === 'agent') {
        lastMessage.streamingError = true
      }
      return newMessages
    })
  }, [setMessages])

  const handleResponse = useCallback(
    async (input: string | FormData) => {
      setIsLoading(true)

      const formData = input instanceof FormData ? input : new FormData()
      if (typeof input === 'string') {
        formData.append('message', input)
      }

      // Clean up previous error messages if they exist
      setMessages((prevMessages) => {
        if (prevMessages.length >= 2) {
          const lastMessage = prevMessages[prevMessages.length - 1]
          const secondLastMessage = prevMessages[prevMessages.length - 2]
          if (
            lastMessage.role === 'agent' &&
            lastMessage.streamingError &&
            secondLastMessage.role === 'user'
          ) {
            return prevMessages.slice(0, -2)
          }
        }
        return prevMessages
      })

      // Add user message
      addMessage({
        role: 'user',
        content: formData.get('message') as string,
        created_at: Math.floor(Date.now() / 1000)
      })

      // Add placeholder for agent message (will be replaced with actual response)
      addMessage({
        role: 'agent',
        content: '',
        tool_calls: [],
        streamingError: false,
        created_at: Math.floor(Date.now() / 1000) + 1
      })

      try {
        if (!agentId) return
        
        const endpointUrl = constructEndpointUrl(selectedEndpoint)
        const playgroundRunUrl = APIRoutes.AgentRun(endpointUrl).replace(
          '{agent_id}',
          agentId
        )

        // Don't stream - set stream to false
        formData.append('stream', 'false')
        // formData.append('session_id', sessionId ?? '')

        const response = await fetch(playgroundRunUrl, {
          method: 'POST',
          body: JSON.stringify({query: input}),
          headers: {
            "content-type": "application/json"
          }
        })

        if (!response.ok) {
          const errorText = await response.text()
          throw new Error(errorText || 'Failed to get response from server')
        }

        const responseData: RunResponse = await response.json()
        
        // Handle session ID if it's new
        // if (responseData.session_id && responseData.session_id !== sessionId) {
        //   const newSessionId = responseData.session_id
        //   setSessionId(newSessionId)
          
        //   if (hasStorage) {
        //     const placeHolderSessionData = {
        //       session_id: newSessionId,
        //       title: formData.get('message') as string,
        //       created_at: Math.floor(Date.now() / 1000)
        //     }
            
        //     setSessionsData((prevSessionsData) => [
        //       placeHolderSessionData,
        //       ...(prevSessionsData ?? [])
        //     ])
        //   }
        // }

        // Update the agent message with the complete response
        setMessages((prevMessages) => {
          const newMessages = [...prevMessages]
          const lastMessage = newMessages[newMessages.length - 1]
          console.log(lastMessage);
          
          
          // if (lastMessage && lastMessage.role === 'agent') {
          //   // Update content
          //   lastMessage.content = typeof responseData.content === 'string' 
          //     ? responseData.content 
          //     : JSON.stringify(responseData.content)
            
          //   // Update tool calls if present
          //   if (responseData.tools && responseData.tools.length > 0) {
          //     lastMessage.tool_calls = responseData.tools as ToolCall[]
          //   }
            
          //   // Update other properties
          //   lastMessage.created_at = responseData.created_at ?? lastMessage.created_at
          //   lastMessage.images = responseData.images
          //   lastMessage.videos = responseData.videos
          //   lastMessage.audio = responseData.audio
          //   lastMessage.response_audio = responseData.response_audio
            
          //   // Update extra data
          //   if (responseData.extra_data) {
          //     lastMessage.extra_data = {
          //       reasoning_steps: responseData.extra_data.reasoning_steps,
          //       references: responseData.extra_data.references
          //     }
          //   }
          // }

          lastMessage.content = responseData.response
          lastMessage.tool_results = responseData.tool_results;
          
          return newMessages
        })
        
      } catch (error) {
        updateMessagesWithErrorState()
        setErrorMessage(
          error instanceof Error ? error.message : String(error)
        )
      } finally {
        focusChatInput()
        setIsLoading(false)
      }
    },
    [setMessages, addMessage, updateMessagesWithErrorState, selectedEndpoint, agentId, setErrorMessage, setIsLoading, focusChatInput]
  )

  return { handleResponse }
}

export default useAIChatHandler