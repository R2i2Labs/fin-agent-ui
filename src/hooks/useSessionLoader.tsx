/* eslint-disable @typescript-eslint/no-explicit-any */
import { useCallback } from 'react'
import {
  getPlaygroundSessionAPI,
  getAllPlaygroundSessionsAPI
} from '@/api/playground'
import { usePlaygroundStore } from '../store'
import { toast } from 'sonner'

interface MessageResponse {
  id: number;
  conversation_id: number;
  message_type: string;
  content: string;
  role: string;
  call_id?: string;
  function_name?: string;
  timestamp: string;
}

interface SessionResponse {
  id?: number;
  name?: string;
  agent_id?: string;
  messages?: MessageResponse[];
  created_at?: string;
  last_updated?: string;
}

const useSessionLoader = () => {
  const setMessages = usePlaygroundStore((state) => state.setMessages)
  const selectedEndpoint = usePlaygroundStore((state) => state.selectedEndpoint)
  const setIsSessionsLoading = usePlaygroundStore(
    (state) => state.setIsSessionsLoading
  )
  const setSessionsData = usePlaygroundStore((state) => state.setSessionsData)

  const getSessions = useCallback(
    async (agentId: string) => {
      if (!agentId || !selectedEndpoint) return
      try {

        setIsSessionsLoading(true)
        const sessions = await getAllPlaygroundSessionsAPI(
          selectedEndpoint,
          agentId
        )
        setSessionsData(sessions)
      } catch {
        toast.error('Error loading sessions')
      } finally {
        setIsSessionsLoading(false)
      }
    },
    [selectedEndpoint, setSessionsData, setIsSessionsLoading]
  )

  function processMessagesFromDatabase(messages: any[]): any[] {
    // Group function calls with their outputs
    const functionCallMap = new Map();
    // Track which function calls should be attached to which NEXT agent message
    const pendingFunctionCalls = [];
    const processedMessages = [];

    for (let i = 0; i < messages.length; i++) {
      const message = messages[i];

    // Process function calls and their outputs
      if (message.message_type === 'function_call') {
        // Store the function call
        functionCallMap.set(message.call_id, {
          call: message,
          results: []
        });
        // Add to pending list to be attached to the next agent message
        pendingFunctionCalls.push(message.call_id);
        continue;
      }

      if (message.message_type === 'function_call_output') {
        if (functionCallMap.has(message.call_id)) {
          // Add the output to the corresponding function call
          const functionCallData = functionCallMap.get(message.call_id);
          functionCallData.results.push(message);
        }
        continue;
      }

      // Process agent and user messages
      const created_at = new Date(message.timestamp).getTime() / 1000;

      // Base message structure
      const baseMessage = {
        role: (message.role || 'system') as 'user' | 'agent' | 'system' | 'tool',
        content: message.content || '',
        created_at: created_at,
        streamingError: false
      };

      // For agent messages, attach any pending function call results
      if (message.role === 'agent' || message.role === 'assistant') {
        const toolResults = [];

        // Process all pending function calls
        for (const callId of pendingFunctionCalls) {
          const functionCallData = functionCallMap.get(callId);
          if (functionCallData) {
            for (const result of functionCallData.results) {
              try {
                // Process the result content
                let parsedContent;
                try {
                  parsedContent = JSON.parse(result.content.replace(/'/g, '"'));
                } catch {
                  try {
                    const jsObject = result.content
                    parsedContent = JSON.parse((jsObject));
                    if (parsedContent?.['result']) {
                      parsedContent.result = JSON.parse(parsedContent.result)
                    }
                  } catch {
                    parsedContent = result.content;
                  }
                }
                // Add to tool results
                toolResults.push({
                  tool: functionCallData.call.function_name,
                  arguments: functionCallData.call.content ? JSON.parse(functionCallData.call.content) : {},
                  result: parsedContent
                });
              } catch {

                toolResults.push({
                  tool: functionCallData.call.function_name,
                  arguments: functionCallData.call.content ? JSON.parse(functionCallData.call.content) : {},
                  result: result.content
                });
              }
            }
          }
        }

        // Clear pending function calls after attaching them
        pendingFunctionCalls.length = 0;

        // Create the agent message with tool results
        const agentMessage = {
          ...baseMessage,
          role: 'agent',
          tool_calls: [],
          tool_results: toolResults.length > 0 ? toolResults : null
        };
        processedMessages.push(agentMessage);
      } else {
        // For user messages, add them as is
        processedMessages.push(baseMessage);
      }
    }

    return processedMessages;
  }

  const getSession = useCallback(
    async (sessionId: string, agentId: string) => {
      if (!sessionId || !agentId || !selectedEndpoint) {
        return null
      }

      try {
        const response = (await getPlaygroundSessionAPI(
          selectedEndpoint,
          agentId,
          sessionId
        )) as SessionResponse

        if (response && response.messages && Array.isArray(response.messages)) {
          const processedMessages = processMessagesFromDatabase(response.messages)
          setMessages(processedMessages);
          return processedMessages;
        }
      } catch (error) {
        console.error("Error fetching session:", error);
        return null
      }

      return null;
    },
    [selectedEndpoint, setMessages]
  )

  return { getSession, getSessions }
}

export default useSessionLoader
