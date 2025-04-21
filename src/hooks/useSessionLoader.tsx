import { useCallback } from 'react'
import {
  getPlaygroundSessionAPI,
  getAllPlaygroundSessionsAPI
} from '@/api/playground'
import { usePlaygroundStore } from '../store'
import { toast } from 'sonner'
import {
  PlaygroundChatMessage,
} from '@/types/playground'

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
  // Original format
  // session_id?: string;
  // user_id?: string | null;
  // memory?: {
  //   runs?: ChatEntry[];
  //   chats?: ChatEntry[];
  // };
  // agent_data?: Record<string, unknown>;

  // New database format
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

  // Function to convert the database messages to PlaygroundChatMessage format
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function processMessagesFromDatabase(messages: any[]): any[] {
    // Group function calls with their outputs
    const functionCallMap = new Map();

    // First pass: collect all function calls and their outputs
    messages.forEach(message => {
      if (message.message_type === 'function_call') {
        // Store the function call
        functionCallMap.set(message.call_id, {
          call: message,
          results: []
        });
      } else if (message.message_type === 'function_call_output' && functionCallMap.has(message.call_id)) {
        // Add the output to the corresponding function call
        const functionCallData = functionCallMap.get(message.call_id);
        functionCallData.results.push(message);
      }
    });

    // Process messages and combine function calls with their outputs
    const processedMessages = messages
      .filter(message =>
        // Filter out function call outputs as they'll be combined with their calls
        message.message_type !== 'function_call_output' &&
        // Only include actual agent/user messages and function_call_result type messages
        (message.role === 'user' ||
          message.role === 'agent' ||
          message.role === 'assistant' ||
          message.message_type === 'function_call_result')
      )
      .map(message => {
        // Convert timestamp to Unix timestamp (seconds)
        const created_at = new Date(message.timestamp).getTime() / 1000;

        // Base message structure
        const baseMessage: PlaygroundChatMessage = {
          role: (message.role || 'system') as 'user' | 'agent' | 'system' | 'tool',
          content: message.content || '',
          created_at: created_at,
          streamingError: false
        };

        // Handle agent messages
        if (message.role === 'agent' || message.role === 'assistant') {
          try {
            // Try to parse potential JSON content for extra data
            let extraData = {};
            const toolResults = null;

            // Process reasoning/extra data
            if (message.message_type === 'extra_data' || message.message_type === 'reasoning') {
              try {
                const parsedContent = JSON.parse(message.content);
                if (parsedContent.reasoning_steps) {
                  extraData = {
                    ...extraData,
                    reasoning_steps: parsedContent.reasoning_steps
                  };
                }
                if (parsedContent.references) {
                  extraData = {
                    ...extraData,
                    references: parsedContent.references
                  };
                }
                if (parsedContent.reasoning_messages) {
                  extraData = {
                    ...extraData,
                    reasoning_messages: parsedContent.reasoning_messages
                  };
                }
              } catch {
                // Not JSON or not containing expected fields, continue
              }
            }

            // Return agent message with extras
            return {
              ...baseMessage,
              tool_calls: [],
              tool_results: toolResults,
              extra_data: Object.keys(extraData).length > 0 ? extraData : undefined,
              role: 'agent'
            };
          } catch {
            return {
              ...baseMessage,
              role: 'agent'
            };
          }
        }

        // Handle function call messages
        else if (message.message_type === 'function_call') {
          const functionCallData = functionCallMap.get(message.call_id);

          if (functionCallData) {
            const toolResults = functionCallData.results.map((result: { content: string }) => {
              try {
                // Try to parse the content as JSON
                let parsedContent;
                try {
                  parsedContent = JSON.parse(result.content.replace(/'/g, '"'));
                } catch {
                  // If direct parsing fails, try evaluating it as a Python-like dict
                  try {
                    // Handle Python-style dictionaries with single quotes
                    const jsObject = result.content
                      .replace(/'/g, '"')
                      .replace(/None/g, 'null')
                      .replace(/True/g, 'true')
                      .replace(/False/g, 'false');
                    parsedContent = JSON.parse(jsObject);
                  } catch {
                    parsedContent = result.content;
                  }
                }

                return {
                  tool: message.function_name,
                  arguments: message.content ? JSON.parse(message.content) : {},
                  result: parsedContent
                };
              } catch {
                return {
                  tool: message.function_name,
                  arguments: {},
                  result: result.content
                };
              }
            });

            // Create a tool call message
            // const toolCall: ToolCall = {
            //   id: message.call_id || '',
            //   name: message.function_name || '',
            //   arguments: message.content || '{}'
            // };

            return {
              role: 'tool',
              content: `Function ${message.function_name} was called`,
              created_at: created_at,
              streamingError: false,
              tool_calls: [],
              tool_results: toolResults.length > 0 ? toolResults : null
            };
          }
        }

        // For function call results that aren't part of a function call
        else if (message.message_type === 'function_call_result') {
          try {
            let parsedContent;
            try {
              parsedContent = JSON.parse(message.content.replace(/'/g, '"'));
            } catch {
              parsedContent = message.content;
            }

            return {
              role: 'tool',
              content: `Tool result`,
              created_at: created_at,
              streamingError: false,
              tool_calls: [],
              tool_results: [{
                tool: 'unknown',
                arguments: {},
                result: parsedContent
              }]
            };
          } catch {
            return baseMessage;
          }
        }

        // For user messages, return the base structure
        return baseMessage;
      });

    // Remove any null/undefined messages
    return processedMessages.filter(msg => msg !== null && msg !== undefined);
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

        // Handle new DB-based response format
        if (response && response.messages && Array.isArray(response.messages)) {
        // const processedMessages = response.messages.filter(msg => msg.message_type !== "function_call").map((message): PlaygroundChatMessage => {
        //   // Convert timestamp to Unix timestamp (seconds)
        //   const created_at = new Date(message.timestamp).getTime() / 1000;

        //   // Base message structure
        //   const baseMessage: PlaygroundChatMessage = {
        //     role: message.role as 'user' | 'agent' | 'system' | 'tool',
        //     content: message.content || '',
        //     created_at: created_at,
        //     streamingError: false
        //   };

          //   // For agent messages, parse additional data from message_type or content
          //   if (message.role === 'agent' || message.role === 'assistant') {
          //     try {
          //       // Try to parse potential JSON content for extra data
          //       let extraData = {};
          //       const toolCalls: ToolCall[] = [];
          //       let toolResults = null;

          //       // If message has function_name, it might be a tool call
          //       // if (message.function_name) {
          //       //   toolCalls.push({
          //       //     id: message.call_id || '',
          //       //     name: message.function_name,
          //       //     arguments: message.content || '{}'
          //       //   });
          //       // }

          //       // Try to extract extra_data from message content if it's JSON
          //       if (message.message_type === 'extra_data' || message.message_type === 'reasoning') {
          //         try {
          //           const parsedContent = JSON.parse(message.content);
          //           if (parsedContent.reasoning_steps) {
          //             extraData = {
          //               ...extraData,
          //               reasoning_steps: parsedContent.reasoning_steps
          //             };
          //           }
          //           if (parsedContent.references) {
          //             extraData = {
          //               ...extraData,
          //               references: parsedContent.references
          //             };
          //           }
          //           if (parsedContent.reasoning_messages) {
          //             extraData = {
          //               ...extraData,
          //               reasoning_messages: parsedContent.reasoning_messages
          //             };
          //           }
          //         } catch {
          //           // Not JSON or not containing expected fields, continue
          //         }
          //       }

          //       // If there's tool results, parse them
          //       if (message.message_type === 'function_call_result') {
          //         try {
          //           toolResults = message.content;
          //         } catch {
          //           toolResults = message.content;
          //         }
          //       }

          //       // Add tool-related and extra data to agent messages
          //       return {
          //         ...baseMessage,
          //         tool_calls: toolCalls.length > 0 ? toolCalls : [],
          //         tool_results: toolResults,
          //         extra_data: Object.keys(extraData).length > 0 ? extraData : undefined,
          //         role: 'agent'
          //       };
          //     } catch {
          //       return baseMessage;
          //     }
          //   }

          //   // For user messages, return the base structure
          //   return baseMessage;
          // });

          const processedMessages = processMessagesFromDatabase(response.messages)
          console.log({ processedMessages });

          setMessages(processedMessages);
          return processedMessages;
        }

        // Handle legacy format (original code)
        // else if (response && response.memory) {
        //   const sessionHistory = response.memory.runs ?? response.memory.chats

        //   if (sessionHistory && Array.isArray(sessionHistory)) {
        //     const messagesForPlayground = sessionHistory.flatMap((run) => {
        //       const filteredMessages: PlaygroundChatMessage[] = []

        //       if (run.message) {
        //         filteredMessages.push({
        //           role: 'user',
        //           content: run.message.content ?? '',
        //           created_at: run.message.created_at
        //         })
        //       }

        //       if (run.response) {
        //         const toolCalls = [
        //           ...(run.response.tools ?? []),
        //           ...(run.response.extra_data?.reasoning_messages ?? []).reduce(
        //             (acc: ToolCall[], msg: ReasoningMessage) => {
        //               if (msg.role === 'tool') {
        //                 acc.push({
        //                   role: msg.role,
        //                   content: msg.content,
        //                   tool_call_id: msg.tool_call_id ?? '',
        //                   tool_name: msg.tool_name ?? '',
        //                   tool_args: msg.tool_args ?? {},
        //                   tool_call_error: msg.tool_call_error ?? false,
        //                   metrics: msg.metrics ?? { time: 0 },
        //                   created_at:
        //                     msg.created_at ?? Math.floor(Date.now() / 1000)
        //                 })
        //               }
        //               return acc
        //             },
        //             []
        //           )
        //         ]

        //         filteredMessages.push({
        //           role: 'agent',
        //           content: (run.response.content as string) ?? '',
        //           tool_calls: toolCalls.length > 0 ? toolCalls : [],
        //           extra_data: run.response.extra_data,
        //           images: run.response.images,
        //           videos: run.response.videos,
        //           audio: run.response.audio,
        //           response_audio: run.response.response_audio,
        //           created_at: run.response.created_at,
        //           tool_results: null
        //         })
        //       }
        //       return filteredMessages
        //     })

        //     const processedMessages = messagesForPlayground.map(
        //       (message: PlaygroundChatMessage) => {
        //         if (Array.isArray(message.content)) {
        //           const textContent = message.content
        //             .filter((item: { type: string }) => item.type === 'text')
        //             .map((item) => item.text)
        //             .join(' ')

        //           return {
        //             ...message,
        //             content: textContent
        //           }
        //         }
        //         return message
        //       }
        //     )

        //     setMessages(processedMessages)
        //     return processedMessages
        //   }
        // }
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
