from financial_analyzer import FinancialAnalyzer
import openai
from prompts import SYSTEM_PROMPT_TEMPLATE
from ai_financial_agent.tools import Tools
import sys
import traceback

class AIFinancialAgent:
    def __init__(self, api_key, model="gpt-4.1-mini"):
        self.analyzer = FinancialAnalyzer()
        self.data = None
        self.data_file = None
        self.client = openai.OpenAI(api_key=api_key, max_retries=0)
        self.model = model
        self.messages = []
        self.instructions = None
        self.tools_manager = Tools(self)
        
        # Get function descriptions for the system prompt
        self.function_descriptions = self._get_function_descriptions()
        
        # Define the system prompt
        self.instructions = self._create_system_prompt()
        
        # Define available tools
        self.tools = self.tools_manager.get_tools()
    
    def _get_function_descriptions(self):
        """Get descriptions of available financial analyzer functions."""
        available_functions = [
            "calculate_mean", "calculate_variance", "calculate_covariance",
            "calculate_correlation", "calculate_stddev", "calculate_percentile",
            "calculate_returns", "calculate_log_returns"
        ]
        
        return "\n".join([
            f"- analyzer.{func}(): {getattr(self.analyzer, func).__doc__}" 
            for func in available_functions
        ])
    
    def _create_system_prompt(self):
        """Create the system prompt using the format provided."""
        return SYSTEM_PROMPT_TEMPLATE.format(
            function_descriptions=self.function_descriptions
        )

    def process_user_input(self, user_input, stream=False, print_to_console=False):
        """Process user input and get agent's response."""
        try:
            if print_to_console:
                print(f"[INFO] User input: {user_input}")

            # Add user message to conversation history
            self.messages.append({"role": "user", "content": user_input})
            
            # Show request payload for debugging
            if print_to_console:
                print(f"[DEBUG] Sending to model: model={self.model}, instructions={self.instructions}")
                print(f"[DEBUG] Messages: {self.messages}")
                print(f"[DEBUG] Tools: {self.tools}")
                print(f"[DEBUG] Tool choice: auto")

            # Get response from LLM with tool calls
            response = self.client.responses.create(
                model=self.model,
                input=self.messages,
                instructions=self.instructions,
                tools=self.tools,
                tool_choice="auto",
                stream=stream
            )
            
            final_tool_calls = {}
            output_text = ""
            token_usage = None  # Initialize token usage

            if stream:
                for event in response:
                    if print_to_console:
                        print(f"[STREAM EVENT] Type: {event.type}")
                    if event.type == 'response.created' and print_to_console:
                        print("\nAI: ", end='')
                    if event.type == 'response.output_text.delta' and print_to_console:
                        print(event.delta, end='')
                        sys.stdout.flush()
                    elif event.type == 'response.output_text.done':
                        output_text = event.text
                        if print_to_console:
                            print("\n[DEBUG] Final output_text received.")
                    elif event.type == 'response.output_item.added':
                        final_tool_calls[event.output_index] = event.item
                    elif event.type == 'response.function_call_arguments.delta':
                        index = event.output_index
                        if index in final_tool_calls and final_tool_calls[index]:
                            final_tool_calls[index].arguments += event.delta
                
                # For streaming, we get the token usage from the full response object
                token_usage = response.usage.model_dump() if hasattr(response, 'usage') else None
            else:
                output_text = response.output_text
                for item in response.output:
                    if print_to_console:
                        print(f"[DEBUG] Non-streaming output item: {item}")
                    if item.type == "function_call":
                        final_tool_calls[len(final_tool_calls)] = item
                
                # For non-streaming, token usage should be directly available
                token_usage = response.usage.model_dump() if hasattr(response, 'usage') else None
            
            if output_text:
                self.messages.append({"role": "assistant", "content": output_text})
            
            needs_tool_call = any(
                final_tool_calls[tc].type == "function_call"
                for tc in final_tool_calls
            )
            
            return {
                "response": response,
                "final_tool_calls": final_tool_calls,
                "needs_tool_call": needs_tool_call,
                "output_text": output_text,
                "token_usage": token_usage  # Include token usage in the response
            }

        except Exception as e:
            error_msg = f"[ERROR] Error in API call: {e}"
            if print_to_console:
                print(error_msg)
                traceback.print_exc()
            return {
                "response": "I'm having trouble processing your request. Please try again.",
                "needs_tool_call": False,
                "output_text": "I'm having trouble processing your request. Please try again.",
                "error": str(e),
                "token_usage": None
            }

    def handle_tool_response(self, stream=False, print_to_console=False):
        """Process the output from a tool call and get the agent's next response."""
        try:
            if print_to_console:
                print("[INFO] Handling tool response...")
                print(f"[DEBUG] Messages: {self.messages}")

            response = self.client.responses.create(
                model=self.model,
                input=self.messages,
                instructions=self.instructions,
                tools=self.tools,
                tool_choice="auto",
                stream=stream
            )
            
            final_tool_calls = {}
            output_text = ""
            token_usage = None  # Initialize token usage

            if stream:
                for event in response:
                    if print_to_console:
                        print(f"[STREAM EVENT] Type: {event.type}")
                    if event.type == 'response.created' and print_to_console:
                        print("\nAI: ", end='')
                    if event.type == 'response.output_text.delta' and print_to_console:
                        print(event.delta, end='')
                        sys.stdout.flush()
                    elif event.type == 'response.output_text.done':
                        output_text = event.text
                        if print_to_console:
                            print("\n[DEBUG] Final output_text received.")
                    elif event.type == 'response.output_item.added':
                        final_tool_calls[event.output_index] = event.item
                    elif event.type == 'response.function_call_arguments.delta':
                        index = event.output_index
                        if index in final_tool_calls and final_tool_calls[index]:
                            final_tool_calls[index].arguments += event.delta
                
                # For streaming, we get the token usage from the full response object
                token_usage = response.usage.model_dump() if hasattr(response, 'usage') else None
            else:
                output_text = response.output_text
                for item in response.output:
                    if print_to_console:
                        print(f"[DEBUG] Non-streaming output item: {item}")
                    if item.type == "function_call":
                        final_tool_calls[len(final_tool_calls)] = item
                
                # For non-streaming, token usage should be directly available
                token_usage = response.usage.model_dump() if hasattr(response, 'usage') else None
            
            if output_text:
                self.messages.append({"role": "assistant", "content": output_text})
            
            needs_tool_call = any(
                final_tool_calls[tc].type == "function_call"
                for tc in final_tool_calls
            )

            return {
                "response": response,
                "final_tool_calls": final_tool_calls,
                "needs_tool_call": needs_tool_call,
                "output_text": output_text,
                "token_usage": token_usage  # Include token usage in the response
            }

        except Exception as e:
            error_msg = f"[ERROR] Error in API call (handle_tool_response): {e}"
            if print_to_console:
                print(error_msg)
                traceback.print_exc()
            return {
                "response": "I'm having trouble processing the tool response. Please try again.",
                "needs_tool_call": False,
                "output_text": "I'm having trouble processing the tool response. Please try again.",
                "error": str(e),
                "token_usage": None
            }

    def call_function(self, tool_name, tool_args, conversation_id):
        """Dispatch function calls to the appropriate tool handler."""
        return self.tools_manager.call_function(tool_name, tool_args, conversation_id=conversation_id)