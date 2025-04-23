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
  const [sessionId, setSessionId] = useQueryState('session')
  const selectedEndpoint = usePlaygroundStore((state) => state.selectedEndpoint)
  const setErrorMessage = usePlaygroundStore(
    (state) => state.setStreamingErrorMessage
  )
  const setIsLoading = usePlaygroundStore((state) => state.setIsStreaming)
  const setSessionsData = usePlaygroundStore((state) => state.setSessionsData)
  const hasStorage = usePlaygroundStore(() => true)

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
        let playgroundRunUrl = APIRoutes.AgentRun(endpointUrl).replace(
          '{agent_id}',
          agentId
        )

        // Don't stream - set stream to false
        formData.append('stream', 'false')
        // formData.append('session_id', sessionId ?? '')

        if (sessionId) {
          playgroundRunUrl += `?conversation_id=${sessionId}`
        }

        const response = await fetch(playgroundRunUrl, {
          method: 'POST',
          body: JSON.stringify({ query: input }),
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
        if (responseData.conversation_id && responseData.conversation_id.toString() !== sessionId) {
          const newSessionId = responseData.conversation_id
          setSessionId((newSessionId.toString()))

          if (hasStorage) {
            const placeHolderSessionData = {
              session_id: newSessionId.toString(),
              title: formData.get('message') as string,
              created_at: Math.floor(Date.now() / 1000)
            }

            setSessionsData((prevSessionsData) => [
              placeHolderSessionData,
              ...(prevSessionsData ?? [])
            ])
          }
        }

        setMessages((prevMessages) => {
          const BACKEND_URL = selectedEndpoint + '/static';
          function replaceImagePaths(content: string): string {
            if (!content) return content;

            return content.replace(/!\[(.*?)\]\((generated_assets\/.*?\.(?:png|jpg|jpeg|gif|svg))\)/gi,
              (match, altText, imagePath) => {
                const parts = imagePath.match(/generated_assets\/(\d+)\/(.+)/);
                if (!parts) return match;

                // eslint-disable-next-line @typescript-eslint/no-unused-vars
                const [_, dirNum, filename] = parts;
                return `![${altText}](${BACKEND_URL}/${dirNum}/${filename})`;
              }
            );
          }

          const newMessages = [...prevMessages];
          const lastMessage = newMessages[newMessages.length - 1];

          // Process the content to replace image paths
          if (responseData.response) {
            lastMessage.content = replaceImagePaths(responseData.response);
          }

          if (responseData.extra_data) {
            lastMessage.extra_data = JSON.parse(JSON.stringify(responseData.extra_data));
          }

          lastMessage.tool_results = responseData.tool_results;
          return newMessages;
        });

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
    [setIsLoading, setMessages, addMessage, agentId, selectedEndpoint, sessionId, setSessionId, hasStorage, setSessionsData, updateMessagesWithErrorState, setErrorMessage, focusChatInput]
  )

  return { handleResponse }
}

export default useAIChatHandler